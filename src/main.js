import * as THREE from 'three';
import { Input, KB_SCHEMES } from './input.js';
import { UI } from './ui.js';
import { Screens } from './screens.js';
import { CameraRig } from './camera.js';
import { Game } from './game.js';
import { sprintParams } from './levels.js';
import { sfx } from './audio.js';
import { Net } from './net.js';
import { save, identity } from './save.js';
import { api } from './api.js';
import { fmtMoney } from './economy.js';
import { installDebug } from './debug.js';

const SNAP_RATE = 1 / 20;  // host → clientes
const INPUT_RATE = 1 / 30; // cliente → host

// Fluxo:  Abertura → (1ª vez) Fundar empresa → HQ ⇄ painéis → Partida → Resultado (3 passos) → HQ
//  screen: 'splash' | 'found' | 'play'
//  em 'play', o game.mode decide: lobby = HQ (+ painel opcional), countdown/playing = HUD,
//  paused = pausa, results = resultado. Isso vale igual pro convidado online.
class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1c2033');
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.rig = new CameraRig(this.camera);
    this.camBasis = { right: this.rig.groundRight, up: this.rig.groundUp };
    this.setupLights();

    this.input = new Input(this.camera, this.canvas);
    this.input.onAnyInput(() => sfx.unlock());
    this.ui = new UI(this.camera, this.canvas);
    this.screens = new Screens(document.getElementById('ui'));
    this.screens.onAction = (a) => this.onAction(a);

    // rede
    this.role = 'local'; // local | host | client
    this.net = null;
    this.myId = 0;
    this.gen = 0;
    this.netTimer = 0;
    this.peers = new Set();

    // progressão (vive no servidor)
    this.profile = null;
    this.company = null;      // empresa deste jogador
    this.hostCompany = null;  // empresa do host quando somos convidados
    this.offline = false;
    this.loading = true;

    // navegação
    this.screen = 'splash';
    this.panel = null;        // painel aberto sobre o HQ
    this.panelState = {};
    this.resStep = 1;

    this.roster = []; // [{ owner, device, pid, name }]
    sfx.muted = save.muted;
    this.newGame();
    this.showSplash();
    this.login();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
    // Aba em segundo plano pausa o rAF: um Worker mantém a partida online viva
    const worker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 33);'], { type: 'text/javascript' })));
    worker.onmessage = () => { if (document.hidden && this.net) this.frame(false); };

    const code = new URLSearchParams(location.search).get('sala');
    if (code) this.joinRoom(code);
  }

  setupLights() {
    this.scene.add(new THREE.HemisphereLight('#dfe9ff', '#5c4b3d', 1.1));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
    sun.position.set(-6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const s = sun.shadow.camera;
    s.left = -20; s.right = 20; s.top = 16; s.bottom = -16; s.near = 1; s.far = 50;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#9ec5ff', 0.6);
    fill.position.set(8, 6, -6);
    this.scene.add(fill);
  }

  // a partida usa a empresa do host (quando convidado) ou a nossa
  get activeCompany() { return this.role === 'client' ? this.hostCompany : this.company; }

  newGame() {
    this.game?.stopDemo();
    this.game?.dispose();
    // um escritório só; a dificuldade vem do estágio da empresa
    this.game = new Game(this, sprintParams(this.activeCompany), this.roster, this.role === 'client' ? 'client' : this.role);
    this.rig.setMap(this.game.world.W, this.game.world.H);
    this.ui.showHud(false);
    this.ui.setRoom(this.net?.code || '');
    if (this.role === 'host') { this.gen++; this.broadcastLobby(); }
    this.refreshHQ();
  }

  // =================================================================
  // Conta
  // =================================================================
  async login() {
    this.loading = true;
    try {
      const r = await api.login();
      this.profile = r.profile;
      this.company = r.company;
      this.offline = false;
      if (this.role !== 'client' && this.game.mode === 'lobby') this.newGame();   // escritório com as melhorias da empresa
    } catch {
      this.offline = true;
    }
    this.loading = false;
    if (this.screen === 'splash') this.showSplash();
    if (this.pendingGo) this.continueFromSplash();
    this.refreshHQ();
  }

  showSplash() {
    this.screen = 'splash';
    this.setMenuBg(true);
    this.screens.hideChrome();
    if (!this.game.bots) this.game.startDemo();
    this.screens.splash({ status: this.loading ? 'loading' : this.offline ? 'offline' : 'ok' });
  }

  continueFromSplash() {
    if (this.loading) { this.pendingGo = true; return; }
    this.pendingGo = false;
    if (!this.offline && this.profile && !this.profile.named) {
      this.screen = 'found';
      this.screens.found({});
      return;
    }
    this.enterHQ();
  }

  async foundCompany() {
    const name = this.screens.field('w-name');
    const company = this.screens.field('w-company');
    if (!name) { this.screens.found({ company, error: 'Escolha um nome de dev.' }); return; }
    try {
      this.profile = (await api.rename(name)).profile;
      this.company = (await api.renameCompany(company || `Startup do ${name}`)).company;
      this.newGame();
      this.enterHQ();
      this.ui.toast(`🎉 <b>${this.company.name}</b> foi fundada! Entre no time e bora pra primeira sprint.`, 4000);
    } catch (e) {
      this.screens.found({ name, company, error: e.message });
    }
  }

  async restoreAccount() {
    const prev = identity.get();
    if (!identity.restore(this.screens.field('w-code'))) {
      this.screens.found({ error: 'Código inválido.' });
      return;
    }
    try {
      const r = await api.me();
      this.profile = r.profile;
      this.company = r.company;
      this.newGame();
      this.enterHQ();
    } catch {
      if (prev) identity.set(prev);
      this.screens.found({ error: 'Não achei essa conta no servidor.' });
    }
  }

  // =================================================================
  // HQ e painéis
  // =================================================================
  setMenuBg(on) { document.getElementById('ui').classList.toggle('menu-bg', on); }

  enterHQ() {
    this.screen = 'play';
    this.panel = null;
    this.setMenuBg(false);
    this.screens.hide();
    this.refreshHQ();
  }

  refreshHQ() {
    if (this.screen !== 'play' || this.game.mode !== 'lobby') return;
    const g = this.game;
    const mine = this.roster.filter((r) => r.owner === this.myId).map((r) => r.device);
    const co = this.activeCompany;
    this.screens.hq({
      company: co, role: this.role, players: g.players, myId: this.myId,
      names: g.players.map((p, i) => this.roster[i]?.name || ''),
      freeDevices: [...Object.keys(KB_SCHEMES), 'mouse'].filter((d) => !mine.includes(d)),
      code: this.net?.code || '', peers: this.peers.size + 1,
      canStart: g.players.length > 0 && this.role !== 'client',
      levelName: g.level.name, offline: this.offline,
    });
    if (this.panel) this.renderPanel();
  }

  openPanel(name) {
    this.panel = name;
    this.panelState = {};
    this.renderPanel();
  }

  closePanel() {
    this.panel = null;
    this.screens.hide();
    this.refreshHQ();
  }

  renderPanel() {
    const sc = this.screens, st = this.panelState;
    const code = this.net?.code || '';
    switch (this.panel) {
      case 'room':
        sc.room({ role: this.role, code, link: code ? `${location.origin}${location.pathname}?sala=${code}` : '', peers: this.peers.size + 1, busy: st.busy, error: st.error, typed: st.typed });
        break;
      case 'help':
        sc.help();
        break;
      case 'settings':
        sc.settings({ muted: sfx.muted, profile: this.profile, code: identity.code(), showCode: st.showCode, msg: st.msg });
        break;
    }
  }

  // =================================================================
  // Ações dos botões (mouse, teclado e controle chegam aqui)
  // =================================================================
  onAction(a) {
    const g = this.game;
    const s = this.screens.visible ? this.screens.name : 'hq';

    if (s === 'splash') { this.continueFromSplash(); return; }
    if (s === 'found') {
      if (a === 'found') this.foundCompany();
      if (a === 'restore') this.restoreAccount();
      return;
    }
    if (s === 'hq') {
      this.screens.setDockFocus(false);
      if (a === 'sprints') this.startSprint();
      if (['room', 'help', 'settings'].includes(a)) this.openPanel(a);
      return;
    }
    if (a === 'back' && this.panel) { this.closePanel(); return; }

    switch (s) {
      case 'room':
        if (a === 'create' && !this.panelState.busy) this.createRoom();
        if (a === 'join' && !this.panelState.busy) {
          const code = this.screens.roomCode;
          if (code.length === 4) this.joinRoom(code);
          else { this.panelState = { error: 'O código tem 4 letras.', typed: code }; this.renderPanel(); }
        }
        if (a === 'copy') navigator.clipboard?.writeText(this.screens.link).then(() => this.ui.toast('📋 Link copiado! Manda pros amigos.'));
        if (a === 'leave') this.leaveRoom();
        break;
      case 'settings':
        if (a === 'sound') { this.toggleMute(); this.renderPanel(); this.screens.focusNav('sound'); }
        if (a === 'rename') this.renameProfile(this.screens.field('s-name'));
        if (a === 'showcode') { this.panelState.showCode = true; this.renderPanel(); }
        if (a === 'copycode') navigator.clipboard?.writeText(identity.code()).then(() => { this.panelState.msg = '📋 Código copiado. Guarde em lugar seguro!'; this.renderPanel(); });
        if (a === 'splash') { this.panel = null; this.showSplash(); }
        break;
      case 'pause':
        if (this.role === 'client') return; // só o host controla a pausa
        if (a === 'resume' || a === 'back') { g.mode = 'playing'; this.screens.hide(); }
        if (a === 'restart') { this.newGame(); this.startSprint(); }
        if (a === 'quit') this.newGame();
        break;
      case 'results':
        if (a === 'next' && this.resStep < 3) { this.resStep++; this.screens.results(g.results, { role: this.role, step: this.resStep }); }
        if (a === 'again' && this.role !== 'client') { this.newGame(); this.startSprint(); }
        if (a === 'hq' && this.role !== 'client') this.newGame();
        if (a === 'leave') this.leaveRoom();
        break;
    }
  }

  startSprint() {
    const g = this.game;
    if (g.mode !== 'lobby' || this.role === 'client') return;
    if (!g.players.length) { sfx.play('error'); this.ui.toast('👋 Primeiro entre no time: aperte <b>PEGAR</b> (E, O, Shift dir. ou A no controle).'); return; }
    this.panel = null;
    this.screens.hide();
    g.stopDemo();
    g.start();
    if (this.offline || !this.company) return;
    const pids = [...new Set(this.roster.map((r) => r.pid).filter(Boolean))];
    g.sprintReq = api.sprintStart(pids)
      .then((r) => r.sprintId)
      .catch((e) => { g.sprintError = e.message; return null; });
  }

  // fim de sprint: o servidor calcula o pagamento e devolve a empresa atualizada
  async onSprintEnd(g) {
    const r = g.results;
    const fail = (msg) => { if (this.game === g) g.emit('payout', { error: msg }); };
    if (this.offline || !this.company || !g.sprintReq) return fail('Servidor offline: esta sprint não foi salva.');
    const sprintId = await g.sprintReq;
    if (!sprintId) return fail(g.sprintError || 'Sprint não registrada no servidor.');
    try {
      const res = await api.sprintEnd({ sprintId, score: r.score, delivered: r.delivered, failed: r.failed, combo: r.combo });
      this.company = res.company;
      this.profile = res.profile;
      const eco = {
        payout: res.payout, xp: res.xp, score: res.score, record: res.record, prevBest: res.prevBest, stageUp: res.stageUp,
        tease: this.teaseFor(), company: res.company,
      };
      if (this.game === g) g.emit('payout', eco);
    } catch (e) {
      fail(e.message);
    }
  }

  // "quase dá pra comprar": o gancho pra próxima sprint
  teaseFor() {
    const g = this.game;
    g.refreshPads();
    const pads = g.world.pads.filter((p) => p.visible && (!p.block || p.block.startsWith('Dinheiro'))).sort((a, b) => a.price - b.price);
    if (!pads.length) return '';
    const can = pads.filter((p) => p.affordable);
    if (can.length) {
      const p = can[can.length - 1];
      return `🛒 Dá pra comprar <b>${p.icon} ${p.name}</b>! Pise na placa amarela no HQ e segure <b>Trabalhar</b>.`;
    }
    const p = pads[0];
    return `🎯 Faltam <b>${fmtMoney(p.price - (this.company?.cash || 0))}</b> para ${p.icon} ${p.name}`;
  }

  // chamado pelo evento 'payout' (host e convidados)
  refreshResults() {
    const g = this.game;
    const eco = g.results?.economy;
    if (this.role === 'client') {
      if (eco?.company) this.hostCompany = { ...this.hostCompany, ...eco.company };
      if (!this.offline) api.me().then((r) => { this.profile = r.profile; this.company = r.company; }).catch(() => {});
    }
    this.screens.resultsEconomyArrived();
  }

  // =================================================================
  // Empresa
  // =================================================================
  async purchase(pad, g) {
    if (this.role === 'client') return;
    if (this.offline || !this.company) { g.purchaseFailed(pad, 'Servidor offline: compras desativadas'); return; }
    const extra = {};
    if (g.mode === 'playing' && g.sprintReq) {
      extra.sprintId = await g.sprintReq;
      extra.score = g.score;           // o servidor deixa gastar o que a sprint já rendeu
    }
    try {
      const r = await api.buy(pad.id, extra);
      this.company = r.company;
      if (this.game === g) g.onPurchased(r.bought, pad);
      this.broadcastCompany();
      this.refreshHQ();
    } catch (e) {
      if (this.game === g) g.purchaseFailed(pad, e.message);
    }
  }

  // avisa os convidados da empresa nova (caixa, compras) sem reconstruir a fase
  broadcastCompany() {
    if (this.role !== 'host') return;
    this.hostCompanyKey = null;
    this.net?.broadcast({ t: 'company', company: this.lobbyMsg().company });
  }

  async renameProfile(name) {
    if (!name || name === this.profile?.name) return;
    try {
      this.profile = (await api.rename(name)).profile;
      this.panelState.msg = '✏️ Nome atualizado!';
      this.roster.forEach((r) => { if (r.owner === this.myId) r.name = this.profile.name; });
      this.broadcastLobby();
    } catch (e) { this.panelState.msg = `⚠️ ${e.message}`; }
    this.renderPanel();
  }

  toggleMute() {
    sfx.muted = !sfx.muted;
    save.muted = sfx.muted;
    this.ui.toast(sfx.muted ? '🔇 Som desligado' : '🔊 Som ligado', 1200);
  }

  // =================================================================
  // Tela derivada do estado da partida (igual pro convidado online)
  // =================================================================
  syncScreen() {
    if (this.screen !== 'play') return;
    const g = this.game, sc = this.screens;
    if (g.mode === 'lobby') {
      if (['pause', 'results'].includes(sc.name)) { sc.hide(); this.panel = null; }
      if (sc.chrome.classList.contains('hidden')) this.refreshHQ();
      // sem ninguém no time, os bots dão vida ao escritório
      if (!g.players.length && !g.bots && this.role !== 'client') g.startDemo();
      if (g.players.length && g.bots) g.stopDemo();
    } else if (g.mode === 'countdown' || g.mode === 'playing') {
      sc.hideChrome();
      if (sc.visible) sc.hide();
      this.panel = null;
    } else if (g.mode === 'paused') {
      if (sc.name !== 'pause') sc.pause({ remote: this.role === 'client' });
    } else if (g.mode === 'results') {
      sc.hideChrome();
      if (sc.name !== 'results' && g.results) {
        this.resStep = 1;
        sc.results(g.results, { role: this.role, step: 1 });
      }
    }
  }

  // =================================================================
  // Online
  // =================================================================
  async createRoom() {
    this.panelState = { busy: 'create' };
    this.renderPanel();
    try {
      const net = new Net();
      await net.host();
      this.net = net;
      this.role = 'host';
      this.myId = 0;
      this.peers.clear();
      net.on('peer-join', (m) => {
        this.peers.add(m.id);
        this.net.sendTo(m.id, this.lobbyMsg());
        this.ui.toast('🌐 Um dev entrou na sala!');
        this.refreshHQ();
      });
      net.on('peer-leave', (m) => this.removeOwner(m.id));
      net.on('from', (m) => this.onClientMsg(m.id, m.d));
      net.on('close', () => this.lostConnection('Conexão com o servidor perdida.'));
      this.panelState = {};
      this.newGame();   // time local continua; a sala só abre as portas
    } catch (e) {
      this.panelState = { error: e.message };
      this.renderPanel();
    }
  }

  async joinRoom(code) {
    if (this.panel === 'room') { this.panelState = { busy: 'join', typed: code }; this.renderPanel(); }
    this.net?.close();
    try {
      const net = new Net();
      await net.join(code);
      this.net = net;
      this.role = 'client';
      this.myId = net.id;
      this.roster = [];
      history.replaceState(null, '', `?sala=${net.code}`);
      net.on('msg', (m) => this.onHostMsg(m.d));
      net.on('host-left', () => this.lostConnection('O host fechou a sala.'));
      net.on('close', () => this.lostConnection('Conexão com a sala perdida.'));
      this.gen = -1;
      this.newGame();
      this.enterHQ();
      this.ui.toast(`🌐 Você entrou na sala <b>${net.code}</b>. Aperte PEGAR pra entrar no time!`, 3500);
    } catch (e) {
      this.net = null;
      history.replaceState(null, '', location.pathname);
      if (this.screen !== 'play') this.enterHQ();
      this.panel = 'room';
      this.panelState = { error: e.message, typed: code };
      this.renderPanel();
    }
  }

  leaveRoom() {
    this.leaveOnline();
    this.newGame();
    this.enterHQ();
  }

  lostConnection(msg) {
    if (!this.net) return;
    this.leaveRoom();
    this.ui.toast(`🔌 ${msg}`, 3500);
  }

  leaveOnline() {
    if (!this.net) return;
    this.net.close();
    this.net = null;
    // mantém só os jogadores deste PC
    this.roster = this.roster.filter((r) => r.owner === this.myId).map((r) => ({ ...r, owner: 0 }));
    this.role = 'local';
    this.myId = 0;
    this.peers.clear();
    this.hostCompany = null;
    this.hostCompanyKey = null;
    this.ui.setRoom('');
    history.replaceState(null, '', location.pathname);
  }

  lobbyMsg() {
    const c = this.company;
    const company = c ? { name: c.name, valuation: c.valuation, cash: c.cash, upgrades: c.upgrades, builds: c.builds, best: c.best, sprints: c.sprints } : null;
    return { t: 'lobby', gen: this.gen, roster: this.roster, company };
  }
  broadcastLobby() { this.net?.broadcast(this.lobbyMsg()); }

  // host: mensagens vindas de um cliente
  onClientMsg(id, d) {
    const g = this.game;
    if (d.t === 'addp') {
      if (g.mode !== 'lobby' || this.roster.length >= 4) return;
      if (this.roster.some((r) => r.owner === id && r.device === d.device)) return;
      this.roster.push({ owner: id, device: d.device, pid: typeof d.pid === 'string' ? d.pid : null, name: String(d.name || '').slice(0, 20) });
      g.addPlayer({ owner: id, device: d.device });
      this.refreshHQ();
      this.broadcastLobby();
    } else if (d.t === 'in') {
      g.applyInput(id, d);
    }
  }

  // cliente: mensagens vindas do host
  onHostMsg(d) {
    if (d.t === 'lobby') {
      const same = JSON.stringify(d.roster) === JSON.stringify(this.roster);
      const coKey = JSON.stringify(d.company || null);
      const coChanged = coKey !== this.hostCompanyKey;
      this.hostCompany = d.company || null;
      this.hostCompanyKey = coKey;
      if (coChanged && this.game.mode === 'lobby') { this.gen = d.gen; this.roster = d.roster; this.newGame(); return; }
      if (d.gen !== this.gen || !same) {
        const onlyAdded = d.gen === this.gen && this.game.mode === 'lobby' &&
          JSON.stringify(d.roster.slice(0, this.roster.length)) === JSON.stringify(this.roster);
        if (onlyAdded) {
          // só entrou gente nova: adiciona sem reconstruir a fase
          d.roster.slice(this.roster.length).forEach((r) => this.game.addPlayer(r));
          this.roster = d.roster;
          this.refreshHQ();
        } else {
          this.gen = d.gen;
          this.roster = d.roster;
          this.newGame();
        }
      }
    } else if (d.t === 'snap') {
      this.game.applySnapshot(d);
    } else if (d.t === 'company') {
      // compra no meio do jogo: só atualiza os dados (o mundo já mudou pelo evento)
      this.hostCompany = d.company;
      this.hostCompanyKey = JSON.stringify(d.company);
      this.refreshHQ();
    }
  }

  removeOwner(id) {
    this.peers.delete(id);
    const g = this.game;
    if (g.mode === 'lobby') {
      this.roster = this.roster.filter((r) => r.owner !== id);
      this.newGame();
    } else {
      g.players.forEach((p) => { if (p.owner === id) p.gone = true; });
    }
    this.ui.toast('🔌 Um dev saiu da sala.');
    this.refreshHQ();
  }

  // =================================================================
  // Câmera
  // =================================================================
  updateCamera(dt) {
    const g = this.game, w = window.innerWidth, h = window.innerHeight;
    const rig = this.rig;
    if (this.screen !== 'play') {
      rig.setLayout({});
      rig.cinematic((g.bots || []).map((p) => p.pos));
    } else if (g.mode === 'lobby') {
      // o escritório fica entre o topo (empresa) e a base (time + dock); a loja abre à direita
      rig.setLayout({ top: 96, bottom: w < 800 ? 250 : 200 });
      rig.overview(0.5);
    } else {
      rig.setLayout({ top: w < 900 ? 190 : 150 });
      const active = g.players.filter((p) => !p.gone);
      const mine = active.filter((p) => g.isMine(p));
      const focus = this.role === 'local' || !mine.length ? active : mine;
      rig.follow(focus.map((p) => p.pos), { minHW: 5.4, minHH: 3.7 });
    }
    rig.update(dt, w, h);
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.rig.snapNext = true;
  }

  // =================================================================
  // Loop
  // =================================================================
  frame(draw = true) {
    this.tick(Math.min(this.clock.getDelta(), 0.05), draw);
  }

  // Debug: avança o jogo N segundos sem depender do requestAnimationFrame
  simulate(seconds, step = 1 / 60) {
    for (let t = 0; t < seconds; t += step) this.tick(step, false);
    this.render();
  }

  tick(dt, draw = true) {
    this.input.update();
    const g = this.game;
    const inp = this.input;
    const m = inp.menu;
    let locked = false;

    if (inp.globalPressed('KeyM')) { this.toggleMute(); if (this.panel === 'settings') this.renderPanel(); }

    if (this.screen === 'splash') {
      locked = true;
      if (m.any) this.continueFromSplash();
    } else if (this.screen === 'found') {
      locked = true;
      this.screens.handle(m);
    } else if (g.mode === 'lobby') {
      if (this.panel || this.screens.dockFocus) {
        // menu aberto: teclas navegam, jogadores param
        locked = true;
        if (m.tab && this.screens.dockFocus) this.screens.setDockFocus(false);
        else this.screens.handle(m);
      } else {
        if (m.tab || m.back) this.screens.setDockFocus(true);
        else if (inp.anyStart()) this.startSprint();
        this.joinPlayers();
      }
    } else if (g.mode === 'playing' && this.role !== 'client' && inp.globalPressed('Escape')) {
      g.mode = 'paused';
      sfx.play('back');
    } else if (g.mode === 'paused' || g.mode === 'results') {
      this.screens.handle(m);
    }

    this.game.update(dt, locked ? inp.locked : inp);
    this.syncScreen();
    this.netTick(dt);
    this.updateCamera(dt);
    if (draw) this.render();
  }

  // PEGAR em qualquer dispositivo livre entra no time
  joinPlayers() {
    const inp = this.input, g = this.game;
    for (const d of inp.devices()) {
      if (!inp.get(d).pick) continue;
      const mine = this.roster.some((r) => r.owner === this.myId && r.device === d);
      if (mine || this.roster.length >= 4) continue;
      if (this.role === 'client') {
        this.net.toHost({ t: 'addp', device: d, pid: this.profile?.id, name: this.profile?.name });
      } else {
        this.roster.push({ owner: this.myId, device: d, pid: this.profile?.id || null, name: this.profile?.name || '' });
        g.addPlayer({ owner: this.myId, device: d });
        this.refreshHQ();
        this.broadcastLobby();
      }
    }
  }

  netTick(dt) {
    if (!this.net) return;
    this.netTimer -= dt;
    if (this.netTimer > 0) return;
    if (this.role === 'host') {
      this.netTimer = SNAP_RATE;
      this.net.broadcast(this.game.snapshot());
    } else if (this.role === 'client') {
      this.netTimer = INPUT_RATE;
      const pkt = this.game.inputPacket();
      if (pkt) this.net.toHost(pkt);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

const app = new App();
if (import.meta.env.DEV) installDebug(app);
