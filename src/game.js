import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Ticket, TYPES, STEP_CODE, CODE_STEP } from './tickets.js';
import { FX } from './fx.js';
import { aiFace, buildTicketMesh } from './models.js';
import { PLAYER_LOOKS } from './player.js';
import { sfx } from './audio.js';
import { effectsOf, applyToLevel, buyBlock, priceOf, listBuilds, stageOf, UPGRADE, UPGRADE_NEEDS, hasStation, nextLevelOf, revenueMult, fmtMoney } from './economy.js';

const TIP_MAX = 0.5;      // gorjeta máxima: +50% dos pontos se entregar rápido
const EXPIRE_PENALTY = 10;
const TRASH_PENALTY = 5;
const TEAM_BONUS = 10;
const REPAIR_TIME = 2;    // segurar "usar" para reiniciar IA/roteador
const CONFLICT_TIME = 2.5;
const DRAIN_EVERY = 3;    // incidente em produção: perde pontos a cada N s
const DRAIN_POINTS = 3;
// combo: entregar em sequência (sem prazo estourar) multiplica os pontos
const COMBO_WINDOW = 16;  // segundos para manter a chama acesa
const COMBO_TIERS = [1, 1, 1.5, 2, 2.5, 3];  // índice = nº de entregas seguidas
const comboMult = (n) => COMBO_TIERS[Math.min(n, COMBO_TIERS.length - 1)];
// bênçãos (o contrapeso do caos)
const GOLDEN_TIME = 15;   // deploy dourado: entregas valem o dobro
const CACHE_TIME = 12;    // cache quente: mesas rendem o dobro
const LUCKY_TAIL = 10;    // não sorteia bênção nos últimos segundos
const BUY_HOLD = 0.9;     // segundos segurando "usar" em cima da placa pra comprar
const r2 = (v) => Math.round(v * 100) / 100;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const NITPICKS = [
  'renomeia essa variável', 'faltou teste unitário', 'tira esse console.log',
  'isso aqui não escala', 'usa const em vez de let', 'cadê a documentação?', 'nit: espaço sobrando',
];

// Uma partida (ou o lobby) numa fase.
// role: 'local' | 'host' simulam tudo; 'client' só aplica snapshots do host
// e move os próprios personagens.
export class Game {
  constructor(app, level, roster, role = 'local') {
    this.app = app;
    this.ui = app.ui;
    this.company = app.activeCompany || null;
    this.eff = effectsOf(this.company?.upgrades);
    this.baseLevel = level;
    this.level = applyToLevel(level, this.eff);
    this.cashView = this.company?.cash || 0; // caixa + o que a sprint já rendeu
    this.role = role;
    this.root = new THREE.Group();
    app.scene.add(this.root);
    this.world = new World(level, this.root, this.company);
    this.fx = new FX(this.root);
    this.players = [];
    this.tickets = [];
    this.ticketMap = new Map();
    this.mode = 'lobby'; // lobby | countdown | playing | paused | results
    this.timeLeft = level.duration;
    this.elapsed = 0;
    this.spawned = 0;
    this.nextSpawn = 1;
    this.score = 0;
    this.delivered = 0;
    this.failed = 0;
    this.trashed = 0;
    this.combo = 0;         // entregas seguidas sem perder um prazo
    this.comboBest = 0;
    this.comboT = 0;        // segundos restantes da janela de combo
    this.starsHit = 0;      // estrelas já celebradas nesta sprint
    this.ended = false;
    this.countdown = 0;
    this.msgCd = new Map();
    this._tmp = new THREE.Vector3();   // rascunho pra conversão de coordenadas
    this.outbox = [];
    // caos
    this.wifiDown = false;
    this.incident = 0;       // hotfixes ativos
    this.drainT = 0;
    this.lastMergeAt = -99;
    this.pendingProd = [];   // bugs que escaparam e vão estourar em produção
    this.evNext = {};
    this.lkNext = {};        // próximas bênçãos
    this.golden = 0;         // segundos restantes de deploy dourado
    this.cache = 0;          // segundos restantes de cache quente
    this.smokeT = 0;
    this.ui.clearWorld();
    this.ui.setAlarm(false);
    this.world.stations.forEach((s) => this.ui.addStationLabel(s));
    roster.forEach((r) => this.addPlayer(r, true));
  }

  get isClient() { return this.role === 'client'; }
  get multi() { return this.players.length > 1; }
  station(type) { return this.world.stations.find((s) => s.type === type); }

  dispose() {
    this.app.scene.remove(this.root);
    this.players.forEach((p) => { this.app.scene.remove(p.model.root); this.app.scene.remove(p.highlight); });
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.ui.clearWorld();
    this.ui.setAlarm(false);
  }

  addPlayer({ owner = 0, device }, silent = false) {
    if (this.players.length >= 4) return null;
    const p = new Player(this.players.length, device, this.app.scene, owner);
    p.spawn(this.world.spawns[p.index]);
    p.baseMul = this.eff.moveSpeed;
    p.boostMul = this.eff.coffeeSpeed;
    this.players.push(p);
    if (!silent) this.emit('join', { i: p.index });
    return p;
  }

  isMine(p) { return p.owner === this.app.myId; }

  // ---------- eventos (executa local e replica para os clientes) ----------
  emit(type, d = {}) {
    this.runEvent(type, d);
    if (this.role === 'host') this.outbox.push([type, d]);
  }

  runEvent(type, d) {
    const v = (d) => new THREE.Vector3(d.x || 0, d.y || 0, d.z || 0);
    switch (type) {
      case 'sfx': sfx.play(d.n, d.a); break;
      case 'float': this.ui.floatText(d.text, v(d), d.c, d.big); break;
      case 'toast': this.ui.toast(d.html, d.ms); break;
      case 'banner': this.ui.banner(d.text, d.sub, d.ms); break;
      case 'confetti': this.fx.confetti(v(d), d.n); break;
      case 'sparkle': this.fx.sparkle(v(d), d.c); break;
      case 'puff': this.fx.puff(v(d), d.n, d.c); break;
      case 'celebrate': this.players[d.i]?.celebrate(); break;
      case 'shake': this.app.rig?.shake(d.a); break;
      case 'bigcount': this.ui.bigCount(d.n); break;
      case 'squash': if (this.players[d.i]) this.players[d.i].squash = 1; break;
      case 'payout':
        if (this.results) { this.results.economy = d; this.app.refreshResults?.(); }
        break;
      case 'built': {
        if (this.isClient && this.app.hostCompany) this.app.hostCompany.builds = { ...(this.app.hostCompany.builds || {}), [d.id.slice(6)]: true };
        const st = this.world.buildAt(d.id);
        if (st) {
          // quem estava em cima da placa sai pra frente da estação nova
          const a = st.group.rotation.y;
          for (const p of this.players) {
            const t = this.world.toTile(p.pos);
            if (t.x === st.tx && t.z === st.tz) p.pos.set(st.pos.x + Math.sin(a) * 0.9, 0, st.pos.z + Math.cos(a) * 0.9);
          }
          this.ui.addStationLabel(st);
          this.fx.confetti(st.pos, 50);
          this.fx.sparkle(st.pos.clone().setY(0.9), '#ffd166');
          sfx.play('deliver');
          this.app.rig?.shake(0.15);
          this.ui.floatText(`🏗️ ${d.name}!`, st.pos, '#ffd166', true);
        }
        break;
      }
      case 'upgraded': {
        if (this.isClient && this.app.hostCompany) this.app.hostCompany.upgrades = { ...d.upgrades };
        this.world.applyUpgrades(d.upgrades);
        this.refreshEffects(d.upgrades);
        const pos = this.world.tileCenter(d.x ?? 7, d.z ?? 5);
        this.fx.confetti(pos, 40);
        sfx.play('deliver');
        this.ui.floatText(`✨ ${d.name}!`, pos, '#ffd166', true);
        break;
      }
      case 'join': {
        const p = this.players[d.i];
        if (!p) break;
        sfx.play('join'); this.fx.puff(p.pos, 10, p.color); p.celebrate();
        break;
      }
      case 'results': {
        if (this.ended) break;
        this.ended = true;
        this.mode = 'results';
        sfx.play('end');
        this.ui.showHud(false);
        this.ui.setAlarm(false);
        this.results = { ...d, levelName: this.level.name, economy: null };
        if (!this.isClient) this.app.onSprintEnd?.(this);
        this.fx.confetti(new THREE.Vector3(), d.stars * 40);
        break;
      }
    }
  }

  sound(n, a = 0) { this.emit('sfx', a ? { n, a } : { n }); }
  floatAt(text, pos, c = '#fff', big = false) { this.emit('float', { text, x: r2(pos.x), y: r2(pos.y), z: r2(pos.z), c, big }); }
  toast(html, ms) { this.emit('toast', { html, ms }); }

  // Mensagem com cooldown para não floodar
  say(key, text, pos, color = '#fff', cd = 1.5) {
    const now = performance.now() / 1000;
    if ((this.msgCd.get(key) || 0) > now) return;
    this.msgCd.set(key, now + cd);
    this.floatAt(text, pos, color);
  }

  start() {
    this.mode = 'countdown';
    this.countdown = 3.5;
    this.lastCount = 4;
    this.enterMatchUI();
    this.players.forEach((p, i) => p.spawn(this.world.spawns[i]));
    // agenda o caos e as bênçãos, escalonando as primeiras ocorrências
    const lv = this.level;
    this.schedule(this.evNext, lv.events, lv.firstEventAt ?? 40, 15);
    this.schedule(this.lkNext, lv.lucky, lv.firstLuckyAt ?? 30, 12);
  }

  schedule(next, table, firstAt, gap) {
    for (const [k, [a, b]] of Object.entries(table || {})) {
      next[k] = firstAt + rand(0, b - a) + Object.keys(next).length * gap;
    }
  }

  enterMatchUI() {
    this.ui.showHud(true);
    this.app.resize();
    this.hudStats();
  }

  // ---------- ciclo principal ----------
  update(dt, input) {
    if (this.isClient) return this.updateClient(dt, input);
    if (this.mode === 'paused') return;

    if (this.mode === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown - 0.5);
      if (n !== this.lastCount) {
        this.lastCount = n;
        if (n > 0) { this.emit('banner', { text: String(n), ms: 700 }); this.sound('tick'); }
        else { this.emit('banner', { text: 'DEPLOY!', sub: 'Bora codar!', ms: 900 }); this.sound('go'); }
      }
      if (this.countdown <= 0) this.mode = 'playing';
    }

    const playing = this.mode === 'playing';
    const frozen = this.mode === 'countdown' || this.mode === 'results';

    const workers = new Map();
    for (const p of this.players) {
      let s;
      this.applyMeeting(p, dt, playing);
      p.frozen = frozen || p.gone || (p.meeting > 0 && this.multi);
      if (this.isMine(p)) {
        s = input.get(p.device);
        this.moveLocal(p, s, dt);
      } else {
        s = p.consumeNet();
        p.netFollow(dt);
      }
      p.target = this.findTarget(p);
      p.highlight.visible = !!p.target && !p.frozen;
      if (p.target) p.highlight.position.copy(p.target.pos);
      p.working = false;
      if (p.frozen || !(playing || this.mode === 'lobby')) continue;
      this.padInput(p, s, dt);
      if (!playing) continue;
      if (s.pick) this.onPick(p);
      if (s.use && p.target) {
        const st = p.target;
        if (st.type === 'coffee' && s.usePressed) this.drinkCoffee(p);
        else if (this.canWork(p, st)) {
          if (!workers.has(st)) workers.set(st, []);
          workers.get(st).push(p);
        }
      }
    }
    this.separatePlayers();
    this.decayPads(dt);

    if (playing) {
      this.elapsed += dt;
      for (const [st, ps] of workers) this.work(st, ps, dt);
      this.updateStations(dt);
      this.updateOrders(dt);
      this.updateCombo(dt);
      this.updateEvents(dt);
      this.timeLeft -= dt;
      this.checkStars();
      this.updateLucky(dt);
      const sec = Math.ceil(this.timeLeft);
      if (sec <= 10 && sec > 0 && sec !== this.lastSec) {
        this.lastSec = sec;
        this.emit('bigcount', { n: sec });
        this.sound('tick');
      }
      if (this.timeLeft <= 0 || (this.spawned >= this.level.maxOrders && !this.tickets.some((t) => t.state === 'waiting' || t.state === 'active'))) {
        this.finish();
      }
    }
    this.updateDemo(dt);
    this.animateStations(dt);
    this.fx.update(dt);
    this.updateUI(dt);
  }

  applyMeeting(p, dt, playing) {
    if (p.meeting > 0 && playing) {
      p.meeting = Math.max(0, p.meeting - dt);
      if (p.meeting === 0) this.floatAt('😮‍💨 Saiu da reunião!', p.pos, '#b8f2a0');
    }
    p.slow = p.meeting > 0 && !this.multi ? 0.5 : 1;
  }

  moveLocal(p, s, dt) {
    const move = new THREE.Vector3();
    if (s.aim) {
      // mouse de uma mão: apontar pra uma estação = encarar ela e ir pro ponto
      // de pé na frente (é assim que se trabalha). Chão solto: anda até lá.
      const st = this.stationAt(s.aim);
      if (st && st.pos.distanceTo(p.pos) < 1.6) {
        p.facing.set(st.pos.x - p.pos.x, 0, st.pos.z - p.pos.z).normalize();
      }
      const alvo = st ? this.standSpot(st, p.pos) : this.groundNear(s.aim, p.pos);
      const dx = alvo.x - p.pos.x, dz = alvo.z - p.pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.3) move.set(dx / len, 0, dz / len);
    } else {
      const cam = this.app.camBasis;
      move.addScaledVector(cam.right, s.mx).addScaledVector(cam.up, s.my);
    }
    p.update(dt, move, s.dash, this.world, this.fx, () => sfx.play('dash'));
  }

  stationAt(pt) {
    const t = this.world.toTile(this._tmp.set(pt.x, 0, pt.z));
    return this.world.tile(t.x, t.z)?.station || null;
  }

  // ponto de pé em frente à estação, pelo lado mais perto do jogador: 0.85 do
  // centro, dentro do alcance de interação (1.35) com folga
  standSpot(st, from) {
    const c = this.groundNear(st.pos, from);
    const dx = c.x - st.pos.x, dz = c.z - st.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const fora = new THREE.Vector3(st.pos.x + (dx / len) * 0.85, 0, st.pos.z + (dz / len) * 0.85);
    const t = this.world.toTile(fora);
    return this.world.isSolid(t.x, t.z) ? c : fora;
  }

  // clique em cima de estação/parede não é lugar de ficar em pé: mira o chão
  // mais próximo do jogador, senão ele escorrega pela lateral e perde o alvo
  groundNear(pt, from) {
    const w = this.world;
    const t = w.toTile(this._tmp.set(pt.x, 0, pt.z));
    if (!w.isSolid(t.x, t.z)) return pt;
    let best = null, bestD = Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (w.isSolid(t.x + dx, t.z + dz)) continue;
      const c = w.tileCenter(t.x + dx, t.z + dz);
      const d = (c.x - from.x) ** 2 + (c.z - from.z) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best || pt;
  }

  hudStats() {
    this.ui.setStats(this.timeLeft, this.score, this.delivered, this.level.maxOrders, {
      stars: this.level.stars,
      combo: { mult: comboMult(this.combo), t: this.comboT, window: COMBO_WINDOW },
      bonus: this.bonusInfo(),
    });
  }

  // bônus ativo (deploy dourado / cache quente) pro HUD
  bonusInfo() {
    const bs = [];
    if (this.golden > 0) bs.push({ ic: '💛', t: this.golden, w: GOLDEN_TIME });
    if (this.cache > 0) bs.push({ ic: '⚡', t: this.cache, w: CACHE_TIME });
    if (!bs.length) return null;
    const soonest = bs.reduce((a, b) => (b.t < a.t ? b : a));
    return { text: `${bs.map((b) => b.ic).join('')} x2`, t: soonest.t, window: soonest.w };
  }

  updateUI(dt = 0) {
    if (this.mode !== 'lobby') {
      this.hudStats();
      this.ui.syncOrders(this.tickets, this.players);
    }
    this.ui.updateWorld(this.tickets);
    this.ui.updateAlerts(this.computeAlerts());
    this.ui.updatePlayers(this.players, this.app.myId, this.role !== 'local');
    this.ui.updatePrompts(this.computePrompts());
    this.ui.updateGuides(this.computeGuides());
    this.refreshPads();
    const near = this.players.filter((p) => this.isMine(p) && !p.gone).map((p) => p.pos);
    this.ui.updatePads(this.world.pads, this.mode === 'lobby' || this.mode === 'playing', near);
    this.ui.setCash(this.cashView, this.mode === 'playing');
    this.dust(dt);
    this.ui.setAlarm(this.incident > 0 && this.mode !== 'results');
  }

  computeAlerts() {
    const out = [];
    for (const st of this.world.stations) {
      let a = null;
      if (st.type === 'ai' && st.broken) a = { icon: '🤖', text: 'Alucinando! Segure USAR', prog: st.repair, bad: true };
      else if (st.type === 'router' && this.wifiDown) a = { icon: '📶', text: 'Reinicie o Wi-Fi!', prog: st.repair, bad: true };
      else if (st.type === 'merge' && st.conflict !== null) a = { icon: '⚔️', text: 'Conflito! Segure USAR', prog: st.conflict, bad: true };
      else if ((st.type === 'ai' || st.type === 'test') && this.wifiDown) a = { icon: '📵', text: 'Sem internet', prog: null };
      else if (st.type === 'server' && this.incident > 0) a = { icon: '🔥', text: 'Produção pegando fogo!', prog: null, bad: true };
      if (a) { a.st = st; out.push(a); }
    }
    return out;
  }

  // poeirinha ao correr
  dust(dt) {
    for (const p of [...this.players, ...(this.bots || [])]) {
      p.dustT = (p.dustT || 0) - dt;
      if (p.dustT <= 0 && Math.hypot(p.vel.x, p.vel.z) > 3.4) {
        p.dustT = 0.14;
        this.fx.puff(p.pos, 1, '#efe6d6');
      }
    }
  }

  // "E Pegar · Q Trabalhar" sobre a estação mirada (só jogadores deste PC)
  computePrompts() {
    if (this.mode !== 'playing' && this.mode !== 'lobby') return [];
    const out = [];
    const waiting = this.tickets.some((t) => t.state === 'waiting');
    for (const p of this.players) {
      const pad = this.padUnder(p);
      if (pad && this.isMine(p) && !p.frozen && !(p.target && this.canWork(p, p.target, true))) {
        const [, , kUse] = this.app.input.hint(p.device);
        const kBuy = this.app.input.hint(p.device)[4];
        const how = p.device === 'mouse' ? 'Segure p/ comprar' : 'Comprar';
        out.push({ p, st: pad, items: pad.block ? [['🔒', pad.block]] : [[p.device === 'mouse' ? kUse : kBuy, `${how} · ${fmtMoney(pad.price)}`]] });
        continue;
      }
      if (this.mode !== 'playing') continue;
      const st = p.target;
      if (!this.isMine(p) || p.frozen || !st) continue;
      const [, kPick, kUse] = this.app.input.hint(p.device);
      const items = [];
      const t = p.holding;
      if (t) {
        if (st.type === 'trash') items.push([kPick, 'Descartar']);
        else if (!this.acceptReason(st, t)) items.push([kPick, 'Soltar']);
      } else if (st.type === 'backlog') {
        if (waiting) items.push([kPick, 'Pegar ticket']);
      } else if (st.item && !(st.type === 'merge' && (st.item.progress > 0 || st.conflict !== null))) {
        items.push([kPick, 'Pegar']);
      }
      if (st.type === 'coffee') items.push([kUse, 'Tomar café']);
      else if (this.canWork(p, st, true)) {
        const it = st.item;
        const label = st.broken || st.type === 'router' ? 'Reiniciar (segure)'
          : st.type === 'merge' ? 'Resolver (segure)'
          : it?.step === 'review' ? 'Revisar (segure)'
          : it?.step === 'fix' ? 'Corrigir (segure)' : 'Codar (segure)';
        items.push([kUse, label]);
      }
      if (items.length) out.push({ p, st, items });
    }
    return out;
  }

  // ---------- tycoon: placas de compra ----------
  get company() { return this.app.activeCompany; }
  set company(v) { /* a empresa ativa vem do App */ }

  padUnder(p) {
    const t = this.world.toTile(p.pos);
    return this.world.padAt(t.x, t.z);
  }

  // o que a sprint já rendeu (sem o bônus de estrelas, que só vem no fim)
  get liveEarn() { return this.mode === 'playing' || this.mode === 'results' ? Math.round(this.score * revenueMult(this.level.stage || 0)) : 0; }

  // atualiza preço, bloqueio e visibilidade de cada placa
  refreshPads() {
    const c = this.company;
    const stage = c ? stageOf(c.valuation).id : 0;
    if (!this.isClient) this.cashView = (c?.cash || 0) + this.liveEarn;
    const builds = new Map(listBuilds(this.world.map).map((b) => ['build:' + b.id, b]));
    for (const pad of this.world.pads) {
      if (!c) { pad.visible = false; continue; }
      let need;
      if (pad.kind === 'build') need = builds.get(pad.id)?.stage ?? 0;
      else {
        const nx = nextLevelOf(c.upgrades || {}, pad.type);
        need = nx?.stage ?? 9;
        const req = UPGRADE_NEEDS[pad.type];
        if (req && !hasStation(c, this.world.map, req)) { pad.visible = false; continue; }
      }
      // mostra o que dá pra comprar agora e um "gostinho" do próximo estágio
      pad.visible = need <= stage + 1;
      pad.price = priceOf(c, pad.id, this.world.map) ?? 0;
      pad.block = buyBlock({ ...c, cash: this.cashView }, pad.id, this.world.map, 0);
      pad.affordable = !pad.block;
    }
  }

  // segurar "usar" em cima de uma placa compra (host decide; cliente só manda o input)
  padInput(p, s, dt) {
    const pad = this.padUnder(p);
    if (!pad || pad.busy) return;
    const tryBuy = () => {
      if (pad.block) { this.sound('error'); this.say('pad' + p.index, `🔒 ${pad.block}`, pad.pos, '#ffb4b4'); return; }
      pad.busy = true;
      pad.hold = 1;
      pad.touched = true;
      this.app.purchase?.(pad, this);
    };
    // teclado e controle: a tecla Comprar (F / P / Num3 / Y) compra na hora
    if (s.buy) return tryBuy();
    // mouse de uma mão: segurar o clique em cima da placa
    if (p.device !== 'mouse') return;
    const working = p.target && this.canWork(p, p.target, true);
    if (!s.use || working) return;
    if (pad.block) {
      if (s.usePressed) tryBuy();
      return;
    }
    pad.hold += dt / BUY_HOLD;
    pad.touched = true;
    if (pad.hold >= 1) {
      pad.busy = true;
      pad.hold = 0;
      this.app.purchase?.(pad, this);
    }
  }

  // placas que ninguém está segurando esvaziam
  decayPads(dt) {
    for (const pad of this.world.pads) {
      if (!pad.touched && pad.hold > 0) pad.hold = Math.max(0, pad.hold - dt * 2);
      pad.touched = false;
    }
  }

  // o servidor confirmou a compra
  onPurchased(bought, pad) {
    if (bought.id.startsWith('build:')) this.emit('built', { id: bought.id, name: bought.name });
    else this.emit('upgraded', { upgrades: this.company.upgrades, name: `${bought.name} nv ${bought.level}`, x: pad?.tx, z: pad?.tz });
    this.toast(`🛒 <b>${bought.name}</b> comprado por ${fmtMoney(bought.price)}`);
  }

  purchaseFailed(pad, msg) {
    pad.busy = false;
    this.sound('error');
    this.floatAt(`⚠️ ${msg}`, pad.pos, '#ffb4b4');
  }

  // melhorias novas valem na hora (velocidade, café, chances do caos)
  refreshEffects(upgrades) {
    this.eff = effectsOf(upgrades);
    this.level = applyToLevel(this.baseLevel, this.eff);
    for (const p of this.players) { p.baseMul = this.eff.moveSpeed; p.boostMul = this.eff.coffeeSpeed; }
  }

  // setas mostrando onde o ticket na mão deve ir
  computeGuides() {
    if (this.mode !== 'playing') return [];
    const want = { code: ['desk', 'ai'], fix: ['desk', 'ai'], test: ['test'], review: ['review'], merge: ['merge'] };
    const out = [];
    const slots = new Map();
    for (const p of this.players) {
      const t = p.holding;
      if (!this.isMine(p) || !t || !want[t.step]) continue;
      const cands = this.world.stations
        .filter((st) => want[t.step].includes(st.type) && !st.item && !st.broken)
        .sort((a, b) => a.pos.distanceToSquared(p.pos) - b.pos.distanceToSquared(p.pos))
        .slice(0, 2);
      for (const st of cands) {
        const n = slots.get(st) || 0;
        slots.set(st, n + 1);
        out.push({ st, color: p.color, slot: n });
      }
    }
    return out;
  }

  // ---------- bots da tela de título ----------
  startDemo() {
    this.stopDemo();
    this.spots = [];
    const { world } = this;
    for (let z = 0; z < world.H; z++) for (let x = 0; x < world.W; x++) {
      if (world.tile(x, z)?.type !== 'floor') continue;
      for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const st = world.tile(x + dx, z + dz)?.station;
        if (st && st.interactive) this.spots.push({ pos: world.tileCenter(x, z), face: new THREE.Vector3(dx, 0, dz), work: ['desk', 'review', 'ai', 'router'].includes(st.type) });
      }
    }
    this.bots = PLAYER_LOOKS.map((_, i) => {
      const p = new Player(i, 'bot', this.app.scene, -1);
      p.spawn(world.spawns[i]);
      p.highlight.visible = false;
      p.wait = Math.random() * 2;
      if (Math.random() < 0.6) {
        p.model.hold.add(buildTicketMesh(pick(['bug', 'feature', 'project'])));
        p.holding = { fake: true };
      }
      return p;
    });
  }

  stopDemo() {
    (this.bots || []).forEach((p) => { this.app.scene.remove(p.model.root); this.app.scene.remove(p.highlight); });
    this.bots = null;
  }

  updateDemo(dt) {
    if (!this.bots) return;
    for (const p of this.bots) {
      const move = new THREE.Vector3();
      if (p.wait > 0) {
        p.wait -= dt;
      } else {
        p.working = false;
        if (!p.spot) p.spot = pick(this.spots);
        move.subVectors(p.spot.pos, p.pos).setY(0);
        if (move.length() < 0.25) {
          move.set(0, 0, 0);
          p.facing.copy(p.spot.face);
          p.working = p.spot.work && !p.holding;
          p.wait = rand(1.2, 3.5);
          p.spot = null;
        } else move.normalize().multiplyScalar(0.75);
      }
      p.update(dt, move, false, this.world, null);
    }
  }

  separatePlayers() {
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i].pos, b = ps[j].pos;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d <= 1e-4) { b.x += 0.05; b.z += 0.03; continue; }
      if (d < 0.56) {
        const push = (0.56 - d) / 2 / d;
        // só empurra quem é simulado aqui (remotos são autoritativos no próprio PC)
        if (this.isMine(ps[i])) { a.x -= dx * push; a.z -= dz * push; }
        if (this.isMine(ps[j])) { b.x += dx * push; b.z += dz * push; }
      }
    }
  }

  // Escolhe a estação à frente do jogador
  findTarget(p) {
    const { world } = this;
    const tp = world.toTile(p.pos);
    let best = null, bestScore = -Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const st = world.tile(tp.x + dx, tp.z + dz)?.station;
      if (!st || !st.interactive) continue;
      const ox = st.pos.x - p.pos.x, oz = st.pos.z - p.pos.z;
      const dist = Math.hypot(ox, oz);
      if (dist > 1.35) continue;
      const dot = (ox * p.facing.x + oz * p.facing.z) / dist;
      if (dot < 0.35) continue;
      const score = dot * 1.2 - dist;
      if (score > bestScore) { bestScore = score; best = st; }
    }
    return best;
  }

  // ---------- interação ----------
  onPick(p) {
    const st = p.target;
    if (!st) return;
    if (p.holding) {
      const t = p.holding;
      if (st.type === 'trash') return this.trashTicket(p, t, st);
      const why = this.acceptReason(st, t);
      if (why) { this.sound('error'); this.say('why' + p.index, why, st.pos, '#ffb4b4'); return; }
      this.putOnStation(t, st);
      p.holding = null;
      t.touchers.add(p.index);
      this.sound('place');
    } else if (st.type === 'backlog') {
      const t = this.tickets.find((x) => x.state === 'waiting');
      if (!t) { this.sound('error'); this.say('bl', 'Backlog vazio! 🎉', st.pos, '#b8f2a0'); return; }
      t.state = 'active';
      this.root.add(t.createMesh());
      this.giveToPlayer(t, p);
      this.sound('pick');
    } else if (st.item) {
      if (st.type === 'merge' && (st.item.progress > 0 || st.conflict !== null)) {
        this.sound('error'); this.say('mg', st.conflict !== null ? 'Resolva o conflito primeiro!' : 'Merge em andamento!', st.pos, '#ffb4b4');
        return;
      }
      const t = st.item;
      st.item = null;
      this.giveToPlayer(t, p);
      this.sound('pick');
    }
  }

  acceptReason(st, t) {
    if (!st.holdsItems) return st.type === 'backlog' ? 'Não dá pra devolver pro backlog 😅' : 'Aqui não!';
    if (st.item) return 'Ocupado!';
    const need = `Ainda falta: ${t.stepDef.icon} ${t.stepDef.label}`;
    if (st.type === 'test' && t.step !== 'test') return need;
    if (st.type === 'merge' && t.step !== 'merge') return need;
    if (st.type === 'ai' && t.step !== 'code' && t.step !== 'fix') return '🤖 A IA só implementa ou corrige';
    return null;
  }

  giveToPlayer(t, p) {
    p.holding = t;
    t.holder = { kind: 'player', ref: p };
    t.touchers.add(p.index);
    this.attachMesh(t);
    p.stats.carried++;
  }

  putOnStation(t, st) {
    st.item = t;
    t.holder = { kind: 'station', ref: st };
    this.attachMesh(t);
  }

  // Coloca a malha do ticket na mão do jogador ou sobre a estação
  attachMesh(t) {
    if (!t.mesh || !t.holder) return;
    const parent = t.holder.kind === 'player' ? t.holder.ref.model.hold : t.holder.ref.anchor;
    if (t.mesh.parent === parent) return;
    parent.add(t.mesh);
    t.mesh.position.set(0, t.holder.kind === 'player' ? 0 : 0.005, 0);
    t.mesh.scale.setScalar(1);
    t.mesh.rotation.set(0, t.holder.kind === 'player' ? 0 : (Math.random() - 0.5) * 0.4, 0);
  }

  canWork(p, st, quiet = false) {
    if (st.type === 'ai' && st.broken) return true;
    if (st.type === 'router' && this.wifiDown) return true;
    const t = st.item;
    if (!t) return false;
    if (st.type === 'merge') return st.conflict !== null;
    if (st.type === 'desk') return t.step === 'code' || t.step === 'fix';
    if (st.type === 'review') {
      if (t.step !== 'review') return false;
      // autor não revisa o próprio código (a menos que todo mundo tenha codado)
      const someoneElse = this.players.some((o) => !o.gone && !t.coders.has(o.index));
      if (this.multi && t.coders.has(p.index) && someoneElse) {
        if (!quiet) this.say('own' + p.index, '🙅 Não pode revisar o próprio código!', st.pos, '#ffd166', 2);
        return false;
      }
      return true;
    }
    return false;
  }

  work(st, ps, dt) {
    // pair programming: 2 devs rendem mais que o dobro (cache quente soma em cima)
    const rate = (ps.length === 1 ? 1 : ps.length * 1.1) * (this.cache > 0 ? 2 : 1) * (st.type === 'desk' ? this.eff.codeSpeed : 1);
    st.flash = 0.2;
    ps.forEach((p) => {
      p.working = true;
      if (this.isMine(p)) p.facing.set(st.pos.x - p.pos.x, 0, st.pos.z - p.pos.z).normalize();
    });

    // reboot de IA / roteador
    if ((st.type === 'ai' && st.broken) || (st.type === 'router' && this.wifiDown)) {
      st.repair += (dt * rate * this.eff.repairSpeed) / REPAIR_TIME;
      if (Math.random() < dt * 6) this.sound('type');
      if (st.repair >= 1) { ps.forEach((p) => p.stats.repairs++); this.fixStation(st); }
      return;
    }
    // conflito de merge
    if (st.type === 'merge') {
      st.conflict += (dt * rate) / CONFLICT_TIME;
      if (Math.random() < dt * 10) this.sound('type');
      if (st.conflict >= 1) {
        st.conflict = null;
        st.item.conflict = false;
        ps.forEach((p) => p.stats.repairs++);
        this.sound('fixed');
        this.floatAt('✅ Conflito resolvido!', st.pos, '#b8f2a0');
      }
      return;
    }

    const t = st.item;
    if (ps.length > 1) this.say('pair' + st.tx + st.tz, `👯 Pair programming x${ps.length}!`, st.pos, '#c3a6ff', 4);
    t.progress += (dt * rate) / t.work;
    ps.forEach((p) => {
      if (t.step === 'code' || t.step === 'fix') t.coders.add(p.index);
      t.touchers.add(p.index);
    });
    if (Math.random() < dt * 8) this.sound('type');
    if (t.progress < 1) return;

    if (t.step === 'review') {
      ps.forEach((p) => p.stats.reviewed++);
      return this.reviewComplete(t, st);
    }
    if (t.step === 'fix') {
      ps.forEach((p) => p.stats.fixed++);
      t.bugged = false;
      return this.completeStep(t, st, '🔧 Corrigido!');
    }
    ps.forEach((p) => p.stats.coded++);
    // dev sozinho às vezes deixa um bug escondido; pair programming não
    if (ps.length === 1 && Math.random() < (this.level.humanBugChance ?? 0)) t.bugged = true;
    this.completeStep(t, st, '💻 Código pronto!');
  }

  reviewComplete(t, st) {
    const lv = this.level;
    if (t.escaped && Math.random() < (lv.reviewCatchChance ?? 0.5)) {
      t.escaped = false;
      t.insertSteps('fix', 'test');
      this.sound('testfail');
      this.emit('shake', { a: 0.2 });
      this.floatAt('🔎 O review achou um bug!', st.pos, '#ffd166');
      return;
    }
    if (!t.rejected && Math.random() < (lv.reviewRejectChance ?? 0)) {
      t.rejected = true;
      t.insertSteps('fix');
      this.sound('error');
      this.floatAt(`📝 Changes requested: "${pick(NITPICKS)}"`, st.pos, '#ffd166');
      return;
    }
    this.completeStep(t, st, '✅ LGTM! Aprovado');
  }

  completeStep(t, st, msg) {
    t.stepIndex++;
    t.progress = 0;
    this.sound('step');
    this.floatAt(msg, st.pos, '#b8f2a0');
    this.emit('sparkle', { x: st.pos.x, y: 0.9, z: st.pos.z });
  }

  updateStations(dt) {
    const lv = this.level;
    for (const st of this.world.stations) {
      const t = st.item;
      st.running = false;
      st.failFlash = Math.max(0, st.failFlash - dt);
      if (!t) continue;

      if (st.type === 'ai' && (t.step === 'code' || t.step === 'fix') && !st.broken && !this.wifiDown) {
        st.running = true;
        t.progress += dt / (t.work * (lv.aiSpeed ?? 0.5));
        if (t.progress >= 1) {
          const chance = (lv.aiBugChance ?? 0.3) * (t.step === 'fix' ? 0.5 : 1);
          t.bugged = Math.random() < chance;
          this.sound('robot');
          this.completeStep(t, st, pick(['🤖 Pronto! (confia)', '🤖 Feito em 0.3s!', '🤖 100% testado*', '🤖 Código gerado!']));
        }
      } else if (st.type === 'test' && t.step === 'test' && !this.wifiDown) {
        st.running = true;
        t.progress += dt / (t.work * this.eff.testTime);
        if (t.progress >= 1) this.testComplete(t, st);
      } else if (st.type === 'merge' && t.step === 'merge' && st.conflict === null) {
        st.running = true;
        t.progress += dt / t.work;
        if (t.progress >= 0.35 && !t.conflictChecked) {
          t.conflictChecked = true;
          const recent = this.elapsed - this.lastMergeAt < 12 ? 0.3 : 0;
          if (Math.random() < (lv.conflictChance ?? 0) + recent) {
            st.conflict = 0;
            st.running = false;
            t.conflict = true;
            this.sound('conflict');
            this.emit('shake', { a: 0.35 });
            this.floatAt('⚔️ CONFLITO DE MERGE!', st.pos, '#ff8c1a', true);
            continue;
          }
        }
        if (t.progress >= 1) this.deliverTicket(t, st);
      }
    }
  }

  testComplete(t, st) {
    if (t.bugged) {
      t.bugged = false;
      if (Math.random() < (this.level.flakyChance ?? 0)) {
        // teste flaky: o bug passa... e vai pra produção
        t.escaped = true;
      } else {
        t.insertSteps('fix');
        st.failFlash = 1.5;
        this.sound('testfail');
        this.emit('shake', { a: 0.25 });
        this.floatAt('❌ Testes falharam! 🐛', st.pos, '#ff8fa3', true);
        this.emit('sparkle', { x: st.pos.x, y: 0.9, z: st.pos.z, c: '#ff4d5e' });
        return;
      }
    }
    st.flash = 1.2;
    this.completeStep(t, st, '🧪 Testes verdes!');
  }

  endTicket(t, state) {
    t.state = state;
    t.endedAt = this.elapsed;
    if (t.mesh) t.mesh.parent?.remove(t.mesh);
    t.holder = null;
    this.ui.removeBadge(t);
    if (t.type === 'hotfix' && !this.isClient) this.resolveIncident(state === 'done');
  }

  deliverTicket(t, st) {
    st.item = null;
    const base = t.def.points;
    const tip = Math.round(base * TIP_MAX * (t.timeLeft / t.timeLimit));
    const team = this.multi && t.touchers.size >= 2 ? TEAM_BONUS : 0;
    const prevMult = comboMult(this.combo);
    this.combo++;
    this.comboBest = Math.max(this.comboBest, this.combo);
    this.comboT = COMBO_WINDOW;
    const mult = comboMult(this.combo);
    const gold = this.golden > 0 ? 2 : 1;   // deploy dourado
    const gain = Math.round((base + tip + team) * mult * gold);
    this.score += gain;
    this.delivered++;
    this.lastMergeAt = this.elapsed;
    t.touchers.forEach((i) => {
      const p = this.players[i];
      if (!p) return;
      p.stats.delivered++;
      this.emit('celebrate', { i });
    });
    this.sound('deliver');
    this.floatAt(`+${gain}${team ? ' 🤝' : ''}${gold > 1 ? ' 💛x2' : ''}`, st.pos, '#6ee7a0', true);
    if (team) this.toast(`🤝 Trabalho em equipe! <b>+${TEAM_BONUS}</b> — ${t.touchers.size} devs no ticket "${t.name}"`);
    this.emit('confetti', { x: st.pos.x, z: st.pos.z, n: Math.min(90, 40 + (mult - 1) * 24) });
    if (mult > prevMult) {
      // subiu de faixa: fanfarra mais aguda, tremida leve e o número acima do +N
      this.sound('combo', mult);
      this.emit('shake', { a: 0.12 });
      this.floatAt(`🔥 COMBO x${mult}!`, st.pos.clone().add(new THREE.Vector3(0, 1, 0)), '#ffb703', true);
    }
    // bug escondido chega em produção daqui a pouco...
    if (t.escaped) this.pendingProd.push({ at: this.elapsed + rand(8, 20), name: t.name });
    this.endTicket(t, 'done');
  }

  trashTicket(p, t, st) {
    p.holding = null;
    this.trashed++;
    const penalty = t.type === 'hotfix' ? t.def.penalty : TRASH_PENALTY; // hotfix no lixo não é saída fácil
    this.score = Math.max(0, this.score - penalty);
    this.sound('fail');
    this.floatAt(`🗑️ Won't fix! -${penalty}`, st.pos, '#ff8fa3');
    this.breakCombo(st.pos, '🗑️ Combo quebrado');
    this.endTicket(t, 'failed');
  }

  drinkCoffee(p) {
    if (p.boost > 2) return;
    p.boost = this.eff.coffeeTime;
    p.stats.coffee++;
    this.emit('squash', { i: p.index });
    this.sound('coffee');
    this.emit('puff', { x: p.pos.x, z: p.pos.z, n: 8, c: '#c8a27a' });
    this.say('cf' + p.index, '☕ +velocidade!', p.pos, '#ffd166', 1);
  }

  // ---------- pedidos ----------
  updateOrders(dt) {
    const lv = this.level;
    const live = this.tickets.filter((t) => t.state === 'waiting' || t.state === 'active');
    this.nextSpawn -= dt;
    if (this.spawned < lv.maxOrders && live.length < lv.maxActive && (this.nextSpawn <= 0 || live.length === 0)) {
      this.spawnOrder();
      this.nextSpawn = lv.spawnEvery[0] + Math.random() * (lv.spawnEvery[1] - lv.spawnEvery[0]);
    }
    for (const t of live) {
      t.timeLeft -= dt;
      if (t.timeLeft <= 0) this.expire(t);
    }
    // incidente ativo: cliente irritado = pontos escorrendo
    if (this.incident > 0) {
      this.drainT += dt;
      if (this.drainT >= DRAIN_EVERY) {
        this.drainT = 0;
        const drain = Math.max(1, Math.round(DRAIN_POINTS * this.eff.drainMult));
        this.score = Math.max(0, this.score - drain);
        const sv = this.station('server');
        if (sv) this.floatAt(`-${drain} 💸`, sv.pos, '#ff8fa3');
      }
    }
  }

  // ---------- combo e metas ----------
  updateCombo(dt) {
    if (this.combo <= 0) return;
    this.comboT -= dt;
    if (this.comboT > 0) return;
    this.breakCombo(null, '💤 Combo esfriou');
  }

  // Perder um prazo mata a sequência: correr atrás do ticket seguinte tem custo.
  breakCombo(pos, why = '💔 Combo quebrado') {
    const had = comboMult(this.combo);
    this.combo = 0;
    this.comboT = 0;
    if (had <= 1) return; // nem tinha começado a esquentar
    this.sound('combocool');
    const at = pos || this.station('merge')?.pos;
    if (at) this.floatAt(`${why} — era x${had}`, at.clone().add(new THREE.Vector3(0, 0.8, 0)), '#9aa3b5');
  }

  checkStars() {
    const n = this.level.stars.filter((s) => this.score >= s).length;
    if (n <= this.starsHit) { this.starsHit = n; return; }
    this.starsHit = n;
    this.sound('star');
    this.emit('banner', { text: `⭐ ${n}ª estrela`, sub: `${this.score} pontos — dá pra mais!`, ms: 1400 });
    const st = this.station('merge');
    if (st) this.emit('confetti', { x: st.pos.x, z: st.pos.z, n: 26 });
  }

  spawnOrder() {
    const w = this.level.types;
    let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
    let type = 'bug';
    for (const [k, v] of Object.entries(w)) { if ((r -= v) <= 0) { type = k; break; } }
    if (this.spawned < 2) type = this.spawned === 0 ? 'bug' : 'feature'; // começo suave
    const t = new Ticket(type);
    this.tickets.push(t);
    this.spawned++;
    this.sound('order');
  }

  expire(t) {
    const penalty = t.def.penalty ?? EXPIRE_PENALTY;
    this.failed++;
    this.emit('shake', { a: 0.2 });
    this.score = Math.max(0, this.score - penalty);
    this.sound('fail');
    const h = t.holder;
    const pos = h ? h.ref.pos : this.station('backlog')?.pos;
    if (h?.kind === 'player') h.ref.holding = null;
    if (h?.kind === 'station') { h.ref.item = null; h.ref.conflict = null; }
    if (pos) this.floatAt(`⏰ Prazo estourado! -${penalty}`, pos, '#ff8fa3');
    this.toast(`😱 O cliente desistiu de <b>"${t.name}"</b>`);
    this.breakCombo(pos, '⏰ Combo quebrado');
    this.endTicket(t, 'failed');
  }

  // ---------- caos ----------
  updateEvents() {
    // bugs que escaparam estouram em produção
    for (let i = this.pendingProd.length - 1; i >= 0; i--) {
      if (this.elapsed >= this.pendingProd[i].at) {
        this.triggerProdBug(this.pendingProd[i].name);
        this.pendingProd.splice(i, 1);
      }
    }
    if (this.timeLeft < 25) return; // sem sacanagem no finalzinho
    for (const k of Object.keys(this.evNext)) {
      if (this.elapsed < this.evNext[k]) continue;
      const [a, b] = this.level.events[k];
      this.evNext[k] = this.elapsed + rand(a, b);
      this.fireEvent(k);
    }
  }

  fireEvent(k) {
    if (k === 'hallucinate') {
      const ais = this.world.stations.filter((s) => s.type === 'ai' && !s.broken);
      if (!ais.length) return;
      const st = ais.find((s) => s.item) || pick(ais);
      st.broken = true;
      st.repair = 0;
      if (st.item && (st.item.step === 'code' || st.item.step === 'fix')) st.item.bugged = true;
      this.sound('glitch');
      this.emit('shake', { a: 0.25 });
      this.floatAt('🤖💥 ALUCINANDO!', st.pos, '#ff8fa3', true);
      this.toast('🤖 O agente de IA começou a alucinar! Segure <b>USAR</b> nele para reiniciar.', 3500);
    } else if (k === 'meeting') {
      const free = this.players.filter((p) => !p.gone && p.meeting <= 0);
      if (!free.length) return;
      const p = pick(free);
      p.meeting = (this.multi ? 7 : 5) * this.eff.meetingMult;
      this.sound('meeting');
      this.floatAt('📅 Reunião surpresa!', p.pos, '#8ecae6', true);
      this.toast(`📅 <b style="color:${p.color}">${p.look.name}</b> foi puxado pra uma reunião que podia ser um e-mail!`, 3500);
    } else if (k === 'wifi') {
      if (this.wifiDown || !this.station('router')) return;
      this.wifiDown = true;
      this.station('router').repair = 0;
      this.sound('wifi');
      this.emit('shake', { a: 0.15 });
      this.emit('banner', { text: '📶 Wi-Fi caiu!', sub: 'IA e testes offline — reinicie o roteador', ms: 1800 });
    } else if (k === 'prodBug') {
      this.triggerProdBug(null);
    }
  }

  triggerProdBug(name) {
    const t = new Ticket('hotfix');
    t.timeLimit = t.timeLeft = t.def.time * this.eff.hotfixTime;
    if (name) t.name = `Hotfix: ${name}`;
    this.tickets.unshift(t); // fura a fila do backlog
    this.incident++;
    this.sound('alarm');
    this.emit('shake', { a: 0.5 });
    this.emit('banner', { text: '🚨 BUG EM PRODUÇÃO!', sub: name ? `"${name}" quebrou tudo` : 'Alguém fez deploy na sexta...', ms: 2200 });
    this.toast('🚨 Hotfix no topo do backlog! Enquanto produção estiver fora, vocês perdem pontos.', 4000);
  }

  resolveIncident(ok) {
    this.incident = Math.max(0, this.incident - 1);
    if (this.incident === 0) {
      this.drainT = 0;
      if (ok) this.emit('banner', { text: '✅ Produção de pé!', sub: 'Ninguém viu nada 👀', ms: 1500 });
    }
  }

  fixStation(st) {
    st.repair = 0;
    this.sound('fixed');
    if (st.type === 'ai') {
      st.broken = false;
      this.floatAt('🤖 Reiniciado! Bip bop.', st.pos, '#b8f2a0');
    } else if (st.type === 'router') {
      this.wifiDown = false;
      this.floatAt('📶 Wi-Fi de volta!', st.pos, '#b8f2a0');
    }
  }

  // ---------- bênçãos ----------
  updateLucky(dt) {
    if (this.golden > 0) this.golden = Math.max(0, this.golden - dt);
    if (this.cache > 0) this.cache = Math.max(0, this.cache - dt);
    if (this.timeLeft < LUCKY_TAIL) return;
    for (const k of Object.keys(this.lkNext)) {
      if (this.elapsed < this.lkNext[k]) continue;
      const [a, b] = this.level.lucky[k];
      this.lkNext[k] = this.elapsed + rand(a, b);
      this.fireLucky(k);
    }
  }

  // onde o ticket está agora: mão de alguém, uma estação, ou o backlog
  holderPos(t) {
    const h = t.holder;
    if (h?.kind === 'player' || h?.kind === 'station') return h.ref.pos;
    return this.station('backlog')?.pos || new THREE.Vector3();
  }

  fireLucky(k) {
    if (k === 'golden') {
      this.golden = GOLDEN_TIME;
      this.sound('star');
      const st = this.station('merge');
      this.emit('banner', { text: '💛 DEPLOY DOURADO', sub: `entregas em dobro por ${GOLDEN_TIME}s`, ms: 2000 });
      if (st) this.emit('confetti', { x: st.pos.x, z: st.pos.z, n: 40 });
    } else if (k === 'cache') {
      this.cache = CACHE_TIME;
      this.sound('fixed');
      this.emit('banner', { text: '⚡ CACHE QUENTE', sub: `mesas em dobro por ${CACHE_TIME}s`, ms: 1800 });
    } else if (k === 'intern') {
      // o estagiário fecha de graça a etapa de um ticket que está em andamento
      const cands = this.tickets.filter((t) => t.state === 'active' && t.stepIndex < t.steps.length - 1 &&
        (t.step === 'code' || t.step === 'fix' || t.step === 'review'));
      if (!cands.length) return;
      const t = pick(cands);
      const done = t.stepDef;
      t.progress = 0;
      this.completeStep(t, { pos: this.holderPos(t) }, `🧑‍🎓 Estagiário: ${done.label}!`);
      this.sound('robot');
      this.toast(`🧑‍🎓 O estagiário fechou <b>${done.icon} ${done.label}</b> de "${t.name}" — de graça!`);
    }
  }

  // ---------- visual das estações ----------
  animateStations(dt) {
    this.world.animatePads(dt, performance.now() / 1000);
    this.world.updateAmbient(dt);
    const now = performance.now() / 1000;
    this.smokeT -= dt;
    const smoke = this.smokeT <= 0;
    if (smoke) this.smokeT = 0.25;
    for (const st of this.world.stations) {
      st.flash = Math.max(0, st.flash - dt);
      if (st.spinners) for (const s of st.spinners) s.obj.rotation[s.axis] += s.speed * dt; // peças dos upgrades
      if (st.type === 'desk' && st.screenTex) {
        if (st.flash > 0) st.screenTex.offset.y += dt * 0.6;
      } else if (st.type === 'test' && st.lamp) {
        if (st.failFlash > 0) st.lamp.emissive.set(Math.sin(now * 20) > 0 ? '#ff2222' : '#440000');
        else if (this.wifiDown) st.lamp.emissive.set('#111');
        else if (st.running) st.lamp.emissive.set(Math.sin(now * 12) > 0 ? '#ffb400' : '#553300');
        else if (st.flash > 0) st.lamp.emissive.set('#22ff77');
        else st.lamp.emissive.set('#111');
      } else if (st.type === 'merge' && st.ring) {
        const conflict = st.conflict !== null;
        st.glow.emissive.set(conflict ? '#ff5a00' : '#22c46a');
        st.glow.color.set(conflict ? '#ff8c1a' : '#3ef08a');
        st.ring.rotation.z += dt * (conflict ? -3 : st.running ? 8 : 0.8);
        st.ring.position.x = conflict ? Math.sin(now * 40) * 0.02 : 0;
        st.glow.emissiveIntensity = st.running || conflict ? 2.5 + Math.sin(now * 20) : 1.4 + Math.sin(now * 3) * 0.3;
        if (st.item?.mesh && st.running) {
          // ticket sendo "sugado"
          const k = st.item.progress;
          st.item.mesh.position.y = 0.05 + Math.sin(k * Math.PI) * 0.3;
          st.item.mesh.rotation.y += dt * (4 + k * 20);
          st.item.mesh.scale.setScalar(1 - k * 0.7);
        }
      } else if (st.type === 'ai' && st.faceMat) {
        const state = st.broken ? 'broken' : this.wifiDown ? 'offline' : st.running ? (Math.floor(now * 4) % 2 ? 'work1' : 'work2') : 'idle';
        const tex = aiFace(state);
        if (st.faceMat.map !== tex) st.faceMat.map = tex;
        st.head.position.y = 0.44 + (st.running ? Math.abs(Math.sin(now * 10)) * 0.03 : 0);
        st.head.rotation.z = st.broken ? Math.sin(now * 25) * 0.15 : Math.sin(now * 1.5) * 0.04;
        st.antMat.emissiveIntensity = st.broken ? (Math.sin(now * 30) > 0 ? 3 : 0) : 1 + Math.sin(now * 4);
        st.arms.forEach((a, i) => { a.rotation.x = st.running ? Math.sin(now * 30 + i * Math.PI) * 0.4 : 0; });
        if (st.broken && smoke) this.fx.puff(st.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 1, '#9aa3b5');
      } else if (st.type === 'router' && st.ledMat) {
        const c = this.wifiDown ? (Math.sin(now * 8) > 0 ? '#ff2222' : '#330000') : (Math.random() < 0.3 ? '#22ff77' : '#0a5a2a');
        st.ledMat.emissive.set(c); st.ledMat.color.set(c);
      } else if (st.type === 'server' && st.beaconMat) {
        const on = this.incident > 0;
        st.beaconMat.emissive.set(on ? (Math.sin(now * 10) > 0 ? '#ff2222' : '#550000') : '#000000');
        st.beacon.rotation.y += dt * (on ? 10 : 0);
        const led = on ? (Math.random() < 0.5 ? '#ff2222' : '#330000') : (Math.random() < 0.8 ? '#22ff77' : '#0a5a2a');
        st.ledMat.emissive.set(led); st.ledMat.color.set(led);
        if (on && smoke) this.fx.puff(st.pos.clone().add(new THREE.Vector3(0, 1.7, 0)), 2, '#555b66');
      }
    }
  }

  // ---------- fim ----------
  finish() {
    this.mode = 'results';
    this.players.forEach((p) => { p.holding = null; p.highlight.visible = false; p.meeting = 0; });
    const stars = this.level.stars.filter((s) => this.score >= s).length;
    const headlines = ['Sprint reprovada 💀', 'Deu pra entregar... 😅', 'Sprint entregue! 🚀', 'Time 10x! 🏆'];
    const titles = (p) => {
      const s = p.stats;
      const best = (k) => this.players.every((o) => o.stats[k] <= s[k]) && s[k] > 0;
      if (best('coded')) return '🧑‍💻 Máquina de Commits';
      if (best('reviewed')) return '🔍 Revisor Implacável';
      if (best('fixed')) return '🔧 Caçador de Bugs';
      if (best('repairs')) return '🔌 Suporte de TI';
      if (best('delivered')) return '🚢 Deployador Oficial';
      if (best('coffee')) return '☕ Movido a Café';
      return '🦆 Rubber Duck Oficial';
    };
    this.emit('results', {
      headline: headlines[stars], stars, score: this.score, delivered: this.delivered, failed: this.failed, trashed: this.trashed,
      combo: this.comboBest,
      players: this.players.map((p) => ({ name: p.look.name, color: p.color, stats: p.stats, title: titles(p) })),
    });
  }

  // =====================================================================
  // Rede
  // =====================================================================

  // Host: estado compacto para os clientes
  snapshot() {
    const live = this.tickets.filter((t) => t.state === 'waiting' || t.state === 'active' || this.elapsed - (t.endedAt ?? -9) < 1.5);
    const stations = this.world.stations;
    const snap = {
      t: 'snap',
      m: this.mode, tl: r2(this.timeLeft), sc: this.score, dv: this.delivered,
      cb: this.combo, ct: r2(this.comboT), gl: r2(this.golden), ca: r2(this.cache),
      wf: this.wifiDown ? 1 : 0, ic: this.incident, cv: Math.round(this.cashView),
      ph: this.world.pads.map((p) => r2(p.hold)),
      p: this.players.map((p) => [r2(p.pos.x), r2(p.pos.z), r2(p.angle), r2(p.vel.x), r2(p.vel.z), p.working ? 1 : 0, p.holding?.id || 0, p.boost > 0 ? 1 : 0, r2(p.meeting)]),
      k: live.map((t) => [t.id, t.type, t.name, t.stepIndex, r2(t.progress), r2(t.timeLeft), t.state,
        t.holder ? (t.holder.kind === 'player' ? 'p' + t.holder.ref.index : 's' + t.holder.ref.index) : '',
        t.steps.map((s) => STEP_CODE[s]).join(''), t.conflict ? 1 : 0]),
      s: stations.map((s) => (s.running ? 1 : 0) | (s.flash > 0 ? 2 : 0) | (s.broken ? 4 : 0) | (s.conflict !== null ? 8 : 0) | (s.failFlash > 0 ? 16 : 0)),
      a: stations.filter((s) => s.repair > 0 || s.conflict !== null).map((s) => [s.index, r2(s.conflict ?? s.repair)]),
      e: this.outbox,
    };
    this.outbox = [];
    return snap;
  }

  // Cliente: aplica o estado recebido
  applySnapshot(s) {
    if (s.m !== this.mode) {
      const from = this.mode;
      this.mode = s.m;
      this.onModeChange(from, s.m);
    }
    this.timeLeft = s.tl; this.score = s.sc; this.delivered = s.dv;
    if (s.cv != null) this.cashView = s.cv;
    (s.ph || []).forEach((h, i) => { if (this.world.pads[i]) this.world.pads[i].hold = h; });
    this.combo = s.cb || 0; this.comboT = s.ct || 0;
    this.golden = s.gl || 0; this.cache = s.ca || 0;
    this.wifiDown = !!s.wf; this.incident = s.ic || 0;

    // tickets
    const seen = new Set();
    this.world.stations.forEach((st) => { st.item = null; });
    for (const [id, type, name, si, pr, tl, state, h, steps, flags] of s.k) {
      seen.add(id);
      let t = this.ticketMap.get(id);
      if (!t) {
        t = new Ticket(type, { id, name });
        if (type === 'hotfix') t.timeLimit = t.def.time * this.eff.hotfixTime; // mesmo prazo que o host
        this.ticketMap.set(id, t);
        this.tickets.push(t);
      }
      if (steps && steps !== t.steps.map((x) => STEP_CODE[x]).join('')) t.steps = steps.split('').map((c) => CODE_STEP[c]);
      t.stepIndex = si; t.progress = pr; t.timeLeft = tl; t.conflict = !!flags;
      if (t.state !== state) {
        if (state === 'done' || state === 'failed') this.endTicket(t, state);
        t.state = state;
      }
      if (state !== 'active') continue;
      if (!t.mesh) this.root.add(t.createMesh());
      t.holder = null;
      if (h[0] === 'p') t.holder = { kind: 'player', ref: this.players[+h.slice(1)] };
      else if (h[0] === 's') t.holder = { kind: 'station', ref: this.world.stations[+h.slice(1)] };
      if (t.holder && !t.holder.ref) t.holder = null;
      if (t.holder) {
        if (t.holder.kind === 'station') t.holder.ref.item = t;
        this.attachMesh(t);
      }
    }
    // tickets que sumiram do snapshot
    for (const t of this.tickets) {
      if (!seen.has(t.id) && (t.state === 'waiting' || t.state === 'active')) this.endTicket(t, 'failed');
    }
    this.tickets = this.tickets.filter((t) => seen.has(t.id));

    // jogadores
    s.p.forEach(([x, z, a, vx, vz, w, hid, boost, meeting], i) => {
      const p = this.players[i];
      if (!p) return;
      p.working = !!w;
      p.meeting = meeting || 0;
      p.holding = hid ? this.ticketMap.get(hid) || null : null;
      if (this.isMine(p)) { p.boost = boost ? Math.max(p.boost, 0.5) : 0; return; }
      p.net.pos.set(x, 0, z); p.net.angle = a; p.net.fx = Math.sin(a); p.net.fz = Math.cos(a); p.net.has = true;
      p.vel.set(vx, 0, vz);
    });

    // estações
    const prog = new Map((s.a || []).map(([i, v]) => [i, v]));
    s.s.forEach((f, i) => {
      const st = this.world.stations[i];
      if (!st) return; // estação nova chega pelo evento 'built' deste mesmo pacote
      st.running = !!(f & 1);
      if (f & 2) st.flash = Math.max(st.flash, 0.2);
      st.broken = !!(f & 4);
      st.conflict = f & 8 ? prog.get(i) ?? 0 : null;
      st.repair = f & 8 ? 0 : prog.get(i) ?? 0;
      st.failFlash = f & 16 ? Math.max(st.failFlash, 0.3) : st.failFlash;
    });

    for (const [type, d] of s.e) this.runEvent(type, d);
  }

  onModeChange(from, to) {
    if (from === 'lobby' && to !== 'lobby') {
      this.enterMatchUI();
      this.players.forEach((p, i) => p.spawn(this.world.spawns[i]));
    }
  }

  // Cliente: move os próprios personagens; o resto vem do host
  updateClient(dt, input) {
    const frozen = this.mode === 'countdown' || this.mode === 'results' || this.mode === 'paused';
    for (const p of this.players) {
      if (this.isMine(p)) {
        const s = input.get(p.device);
        p.frozen = frozen || (p.meeting > 0 && this.multi);
        p.slow = p.meeting > 0 && !this.multi ? 0.5 : 1;
        this.moveLocal(p, s, dt);
        p.target = this.findTarget(p);
        p.highlight.visible = !!p.target && !p.frozen && this.mode !== 'lobby';
        if (p.target) p.highlight.position.copy(p.target.pos);
        // acumula ações até o próximo envio
        if (!p.frozen) {
          if (s.pick) p.net.pick++;
          if (s.usePressed) p.net.usePressed++;
          if (s.buy) p.net.buy++;
        }
        p.net.use = s.use && !p.frozen;
      } else {
        p.netFollow(dt);
      }
    }
    this.separatePlayers();
    this.animateStations(dt);
    this.fx.update(dt);
    this.updateUI(dt);
  }

  // Cliente: pacote de input dos próprios personagens
  inputPacket() {
    const ps = this.players.filter((p) => this.isMine(p)).map((p) => {
      const pk = [p.index, r2(p.pos.x), r2(p.pos.z), r2(p.angle), r2(p.facing.x), r2(p.facing.z), p.net.pick, p.net.use ? 1 : 0, p.net.usePressed, p.net.buy];
      p.net.pick = 0; p.net.usePressed = 0; p.net.buy = 0;
      return pk;
    });
    return ps.length ? { t: 'in', p: ps } : null;
  }

  // Host: recebe input de um cliente
  applyInput(owner, pkt) {
    for (const [i, x, z, a, fx, fz, pick, use, up, buy = 0] of pkt.p) {
      const p = this.players[i];
      if (!p || p.owner !== owner) continue;
      const n = p.net;
      if (n.has) {
        // velocidade estimada para animar a caminhada
        p.vel.set((x - n.pos.x) * 30, 0, (z - n.pos.z) * 30).clampLength(0, 6);
      }
      n.pos.set(x, 0, z); n.angle = a; n.fx = fx; n.fz = fz; n.has = true;
      n.pick += pick; n.usePressed += up; n.use = !!use; n.buy += buy;
    }
  }
}

export { TYPES };
