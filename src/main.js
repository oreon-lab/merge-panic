import * as THREE from 'three';
import { Input, KB_SCHEMES } from './input.js';
import { UI } from './ui.js';
import { Screens } from './screens.js';
import { CameraRig } from './camera.js';
import { Game } from './game.js';
import { LEVELS } from './levels.js';
import { sfx } from './audio.js';
import { Net } from './net.js';
import { save } from './save.js';
import { installDebug } from './debug.js';

const SNAP_RATE = 1 / 20;  // host → clientes
const INPUT_RATE = 1 / 30; // cliente → host

// Telas: 'title' | 'online' | 'howto' | 'session' (lobby + partida, guiado pelo game.mode)
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

    this.input = new Input();
    this.input.onAnyInput(() => sfx.unlock());
    this.ui = new UI(this.camera, this.canvas);
    this.screens = new Screens(document.getElementById('ui'));
    this.screens.onAction = (a, el) => this.onAction(a, el);

    // rede
    this.role = 'local'; // local | host | client
    this.net = null;
    this.myId = 0;
    this.gen = 0;
    this.netTimer = 0;
    this.peers = new Set();
    this.onlineState = {};

    this.levelIndex = 0;
    this.roster = []; // [{ owner, device }]
    this.screen = 'title';
    sfx.muted = save.muted;
    this.newGame();
    this.goto('title');

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
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -12; s.right = 12; s.top = 12; s.bottom = -12; s.near = 1; s.far = 40;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#9ec5ff', 0.6);
    fill.position.set(8, 6, -6);
    this.scene.add(fill);
  }

  newGame() {
    this.game?.stopDemo();
    this.game?.dispose();
    this.game = new Game(this, LEVELS[this.levelIndex], this.roster, this.role === 'client' ? 'client' : this.role);
    this.rig.setMap(this.game.world.W, this.game.world.H);
    this.ui.showHud(false);
    this.ui.setRoom(this.net?.code || '');
    if (this.screen === 'session') this.refreshLobby();
    if (this.role === 'host') { this.gen++; this.broadcastLobby(); }
  }

  // ---------- navegação entre telas ----------
  goto(screen) {
    this.screen = screen;
    const g = this.game;
    document.getElementById('ui').classList.toggle('menu-bg', screen !== 'session');
    if (screen === 'title') {
      if (!g.bots) g.startDemo();
      this.showTitle();
    } else if (screen === 'online') {
      if (!g.bots) g.startDemo();
      this.screens.online(this.onlineState);
    } else if (screen === 'howto') {
      this.screens.howto();
    } else if (screen === 'session') {
      g.stopDemo();
      this.screens.hide();
      this.refreshLobby();
    }
  }

  onAction(a) {
    const g = this.game;
    const s = this.screens.name;
    if (s === 'title') {
      if (a === 'local') { this.role = 'local'; this.roster = []; this.newGame(); this.goto('session'); }
      if (a === 'online') { this.onlineState = {}; this.goto('online'); }
      if (a === 'howto') { this.returnTo = 'title'; this.goto('howto'); }
      if (a === 'sound') { this.toggleMute(); this.showTitle(); this.screens.focus(3, false); }
    } else if (s === 'online') {
      if (a === 'back') this.goto('title');
      if (a === 'create' && !this.onlineState.busy) this.createRoom();
      if (a === 'join' && !this.onlineState.busy) {
        const code = this.screens.roomCode;
        if (code.length === 4) this.joinRoom(code);
        else { this.onlineState = { error: 'O código tem 4 letras.' }; this.screens.online(this.onlineState); }
      }
    } else if (s === 'howto') {
      if (a === 'back') this.goto(this.returnTo || 'title');
    } else if (s === 'lobby') {
      if (a === 'back') { this.leaveOnline(); this.roster = []; this.newGame(); this.goto('title'); }
      if (a === 'start') this.tryStart();
      if (a === 'copy') {
        navigator.clipboard?.writeText(this.screens.link).then(() => this.ui.toast('📋 Link copiado! Manda pros amigos.'));
      }
    } else if (s === 'pause') {
      if (this.role === 'client') return; // só o host controla a pausa
      if (a === 'resume' || a === 'back') { g.mode = 'playing'; this.screens.hide(); }
      if (a === 'restart') { this.newGame(); this.game.start(); }
      if (a === 'lobby') this.newGame();
      if (a === 'menu') this.toMenu();
    } else if (s === 'results') {
      if (a === 'again' && this.role !== 'client') { this.newGame(); this.game.start(); }
      if ((a === 'lobby' || a === 'back') && this.role !== 'client') this.newGame();
      if (a === 'menu') this.toMenu();
    }
  }

  toMenu() {
    this.leaveOnline();
    this.roster = [];
    this.newGame();
    this.goto('title');
  }

  tryStart() {
    const g = this.game;
    if (g.mode !== 'lobby' || !g.players.length || this.role === 'client') return;
    g.start();
  }

  showTitle() {
    this.screens.title({ muted: sfx.muted, best: save.best, stars: save.stars, games: save.games, bestCombo: save.bestCombo });
  }

  toggleMute() {
    sfx.muted = !sfx.muted;
    save.muted = sfx.muted;
    this.ui.toast(sfx.muted ? '🔇 Som desligado' : '🔊 Som ligado', 1200);
  }

  // tela derivada do estado da partida (funciona igual pro cliente online)
  syncScreen() {
    if (this.screen !== 'session') return;
    const g = this.game, sc = this.screens;
    if (g.mode === 'lobby') {
      if (sc.name !== 'lobby') this.refreshLobby();
    } else if (g.mode === 'countdown' || g.mode === 'playing') {
      if (sc.visible) sc.hide();
    } else if (g.mode === 'paused') {
      if (sc.name !== 'pause') sc.pause({ remote: this.role === 'client' });
    } else if (g.mode === 'results') {
      if (sc.name !== 'results' && g.results) sc.results(g.results, { role: this.role });
    }
  }

  refreshLobby() {
    if (this.screen !== 'session' || this.game.mode !== 'lobby') return;
    const mine = this.roster.filter((r) => r.owner === this.myId).map((r) => r.device);
    const code = this.net?.code || '';
    this.screens.lobby({
      level: this.game.level, players: this.game.players, myId: this.myId, role: this.role, code,
      link: code ? `${location.origin}${location.pathname}?sala=${code}` : '',
      peers: this.peers.size + 1,
      freeDevices: Object.keys(KB_SCHEMES).filter((d) => !mine.includes(d)),
    });
  }

  // ---------- online ----------
  async createRoom() {
    this.onlineState = { busy: 'create' };
    this.screens.online(this.onlineState);
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
        this.refreshLobby();
      });
      net.on('peer-leave', (m) => this.removeOwner(m.id));
      net.on('from', (m) => this.onClientMsg(m.id, m.d));
      net.on('close', () => this.lostConnection('Conexão com o servidor perdida.'));
      this.roster = [];
      this.newGame();
      this.goto('session');
    } catch (e) {
      this.onlineState = { error: e.message };
      if (this.screens.name === 'online') this.screens.online(this.onlineState);
    }
  }

  async joinRoom(code) {
    this.onlineState = { busy: 'join', code };
    if (this.screens.name === 'online') this.screens.online(this.onlineState);
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
      this.goto('session');
    } catch (e) {
      this.net = null;
      this.onlineState = { error: e.message, code };
      history.replaceState(null, '', location.pathname);
      this.goto('online');
    }
  }

  lostConnection(msg) {
    if (!this.net) return;
    this.toMenu();
    this.ui.toast(`🔌 ${msg}`, 3500);
  }

  leaveOnline() {
    if (!this.net) return;
    this.net.close();
    this.net = null;
    this.role = 'local';
    this.myId = 0;
    this.peers.clear();
    this.ui.setRoom('');
    history.replaceState(null, '', location.pathname);
  }

  lobbyMsg() { return { t: 'lobby', gen: this.gen, level: this.levelIndex, roster: this.roster }; }
  broadcastLobby() { this.net?.broadcast(this.lobbyMsg()); }

  // host: mensagens vindas de um cliente
  onClientMsg(id, d) {
    const g = this.game;
    if (d.t === 'addp') {
      if (g.mode !== 'lobby' || this.roster.length >= 4) return;
      if (this.roster.some((r) => r.owner === id && r.device === d.device)) return;
      this.roster.push({ owner: id, device: d.device });
      g.addPlayer({ owner: id, device: d.device });
      this.refreshLobby();
      this.broadcastLobby();
    } else if (d.t === 'in') {
      g.applyInput(id, d);
    }
  }

  // cliente: mensagens vindas do host
  onHostMsg(d) {
    if (d.t === 'lobby') {
      const same = JSON.stringify(d.roster) === JSON.stringify(this.roster);
      if (d.gen !== this.gen || !same || d.level !== this.levelIndex) {
        const onlyAdded = d.gen === this.gen && d.level === this.levelIndex && this.game.mode === 'lobby' &&
          JSON.stringify(d.roster.slice(0, this.roster.length)) === JSON.stringify(this.roster);
        this.levelIndex = d.level;
        if (onlyAdded) {
          // só entrou gente nova: adiciona sem reconstruir a fase
          d.roster.slice(this.roster.length).forEach((r) => this.game.addPlayer(r));
          this.roster = d.roster;
          this.refreshLobby();
        } else {
          this.gen = d.gen;
          this.roster = d.roster;
          this.newGame();
        }
      }
    } else if (d.t === 'snap') {
      this.game.applySnapshot(d);
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
    this.refreshLobby();
  }

  // ---------- câmera ----------
  updateCamera(dt) {
    const g = this.game, w = window.innerWidth, h = window.innerHeight;
    const rig = this.rig;
    if (this.screen !== 'session') {
      rig.setLayout({});
      rig.cinematic((g.bots || []).map((p) => p.pos));
    } else if (g.mode === 'lobby') {
      rig.setLayout({ top: 100, bottom: Math.min(260, h * 0.36) });
      rig.overview(0.2);
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

  // ---------- loop ----------
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

    if (inp.globalPressed('KeyM')) this.toggleMute();

    if (this.screen !== 'session' || this.screens.name === 'pause' || this.screens.name === 'results') {
      this.screens.handle(inp.menu);
    } else if (g.mode === 'lobby') {
      this.screens.handle({ back: inp.menu.back }); // Esc volta; o resto é dos jogadores
      for (const d of inp.devices()) {
        if (!inp.get(d).pick) continue;
        const mine = this.roster.some((r) => r.owner === this.myId && r.device === d);
        if (mine || this.roster.length >= 4) continue;
        if (this.role === 'client') {
          this.net.toHost({ t: 'addp', device: d });
        } else {
          this.roster.push({ owner: this.myId, device: d });
          g.addPlayer({ owner: this.myId, device: d });
          this.refreshLobby();
          this.broadcastLobby();
        }
      }
      if (inp.anyStart()) this.tryStart();
    } else if (g.mode === 'playing' && this.role !== 'client' && inp.globalPressed('Escape')) {
      g.mode = 'paused';
      sfx.play('back');
    }

    this.game.update(dt, inp);
    this.syncScreen();
    this.netTick(dt);
    this.updateCamera(dt);
    if (draw) this.render();
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
