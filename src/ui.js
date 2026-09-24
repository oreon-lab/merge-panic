const fmtMoneyUI = (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
import * as THREE from 'three';
import { STEPS } from './tickets.js';
import { STATION_INFO } from './world.js';

const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class UI {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.root = document.getElementById('ui');
    this.world = h('div', 'world-layer'); this.root.append(this.world);
    this.hud = h('div', 'hud hidden'); this.root.append(this.hud);
    this.orders = h('div', 'orders'); this.hud.append(this.orders);
    // Topo enxuto: tempo + pontos/meta + UM multiplicador.
    // Sem pill de Entregues (a fila já está nos cards), sem caixa (é do HQ),
    // sem sala/ajuda (lobby/pausa), sem ícone no relógio (o número basta).
    this.stats = h('div', 'stats', `
      <div class="clock"><span class="v">4:00</span></div>
      <div class="score">
        <div class="s-row"><span class="lbl">Pontos</span><span class="v">0</span></div>
        <div class="goal"><div class="gbar"><i class="gfill"></i></div><div class="gmk"></div></div>
      </div>
      <div class="mult hidden"><span class="mx">x2</span><div class="mt"><i></i></div></div>`);
    this.hud.append(this.stats);
    this.clockEl = this.stats.querySelector('.clock');
    this.scoreEl = this.stats.querySelector('.score .v');
    this.goal = { fill: this.stats.querySelector('.gfill'), mk: this.stats.querySelector('.gmk') };
    this.multEl = this.stats.querySelector('.mult');
    this.multX = this.stats.querySelector('.mult .mx');
    this.multBar = this.stats.querySelector('.mult .mt i');
    this.toastEl = h('div', 'toast'); this.root.append(this.toastEl);
    this.bannerEl = h('div', 'banner'); this.root.append(this.bannerEl);
    this.bigEl = h('div', 'bigcount'); this.root.append(this.bigEl);
    this.coachEl = h('div', 'coach hidden'); this.hud.append(this.coachEl);
    this.focusTypes = null; // estações que importam agora (destinos + âncoras)
    this.playing = false;
    this.cards = new Map();
    this.labels = []; // { el, pos: Vector3 | () => Vector3 }
    this.badges = new Map();
    this.queue = [];  // elementos de mundo a posicionar no passe de layout
    this.v = new THREE.Vector3();
  }

  project(p) {
    this.v.copy(p).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: (this.v.x + 1) / 2 * r.width, y: (1 - this.v.y) / 2 * r.height };
  }
  place(el, p, dy = 0) {
    const s = this.project(p);
    el.style.transform = `translate(${s.x}px, ${s.y + dy}px) translate(-50%, -100%)`;
  }

  // ---------- passe de layout dos elementos de mundo ----------
  // Rótulo, alerta, dica, seta e placa de compra vivem todos acima da mesma
  // estação. Com deslocamento fixo eles se cobriam (e os de estações vizinhas
  // também). Aqui eles entram numa fila e sobem até parar de colidir.
  put(el, pos, prio = 3, dx = 0, fade = false) {
    this.queue.push({ el, pos: pos.clone(), prio, dx, fade });
  }

  cruza(a, b, m = 2) {
    return !(a.x + a.w - m <= b.x || b.x + b.w - m <= a.x || a.y + a.h - m <= b.y || b.y + b.h - m <= a.y);
  }

  // guia do estreante: barra de objetivo no topo (some quando completa)
  setCoach(html) {
    if (!html) { this.coachEl.classList.add('hidden'); return; }
    this.coachEl.classList.remove('hidden');
    if (this.coachEl.innerHTML !== html) this.coachEl.innerHTML = html;
  }

  // painéis fixos do HUD, que os elementos de mundo não devem invadir
  hudRects() {
    const out = [];
    for (const el of [this.orders, this.stats, this.coachEl]) {
      if (!el || el.classList.contains('hidden')) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ x: r.x, y: r.y, w: r.width, h: r.height });
    }
    return out;
  }

  caixa(x, y, it) { return { x: x - it.w / 2, y: y - it.h, w: it.w, h: it.h }; }

  layoutWorld() {
    const fila = this.queue;
    this.queue = [];
    if (!fila.length) return;
    // leitura em lote (uma ida ao layout) antes de escrever qualquer transform
    for (const it of fila) { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; }
    const fixos = this.hudRects();
    const postos = [];
    fila.sort((a, b) => a.prio - b.prio);   // quem tem prioridade fica mais perto
    for (const it of fila) {
      const s = this.project(it.pos);
      const x = s.x + it.dx;
      let y = s.y;
      let r = this.caixa(x, y, it);
      // sobe enquanto bater em outro elemento de mundo já posicionado
      for (let g = 0; g < 12; g++) {
        const bate = postos.find((o) => this.cruza(r, o));
        if (!bate) break;
        y = bate.y - 4;
        r = this.caixa(x, y, it);
      }
      if (r.y < 4) { r.y = 4; y = 4 + it.h; r = this.caixa(x, y, it); }
      // e sai por baixo de qualquer painel do HUD: um alerta escondido atrás do
      // placar não serve pra nada. Esta é a última palavra, então o invariante
      // "nada de mundo sob um painel" vale sempre.
      const painel = fixos.find((o) => this.cruza(r, o, 0));
      if (painel) { y = painel.y + painel.h + 6 + it.h; r = this.caixa(x, y, it); }
      // etiqueta fixa que ainda assim ficaria sob um painel: some, em vez de
      // aparecer cortada
      if (it.fade && fixos.some((o) => this.cruza(r, o, 0))) it.el.classList.add('hd');
      else if (it.fade) it.el.classList.remove('hd');
      it.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      postos.push(r);
    }
  }

  // barra de progresso do trabalho sobre a estação — só aparece enquanto há
  // um ticket com progresso > 0 nela (some ao terminar/retirar, sem poluir)
  updateWork(list) {
    const seen = new Set();
    for (const w of list) {
      const key = w.st.index;
      seen.add(key);
      let el = this.workbars.get(key);
      if (!el) {
        el = h('div', 'workbar', '<div></div>');
        this.world.append(el);
        this.workbars.set(key, el);
      }
      el.firstChild.style.width = `${Math.min(100, w.prog * 100)}%`;
      this.put(el, w.st.pos.clone().add(new THREE.Vector3(0, 1.15, 0)), 4);
    }
    for (const [k, el] of this.workbars) if (!seen.has(k)) { el.remove(); this.workbars.delete(k); }
  }

  clearWorld() {
    this.world.innerHTML = '';
    this.labels = [];
    this.badges.clear();
    this.alerts = new Map();
    this.workbars = new Map();
    this.bubbles = new Map();
    this.tags = new Map();
    this.prompts = new Map();
    this.guides = new Map();
    this.padEls = new Map();
  }

  setAlarm(on) { this.root.classList.toggle('alarm', !!on); }

  // alertas sobre estações (IA alucinando, Wi-Fi, conflito...)
  updateAlerts(list) {
    const seen = new Set();
    for (const a of list) {
      const key = a.st.index;
      seen.add(key);
      let el = this.alerts.get(key);
      if (!el) {
        el = h('div', 'alert', '<div class="a-t"></div><div class="bp"><div></div></div>');
        this.world.append(el);
        this.alerts.set(key, el);
      }
      const html = `<span>${a.icon}</span> ${a.text}`;
      const t = el.firstChild;
      if (t.innerHTML !== html) t.innerHTML = html;
      el.classList.toggle('bad', !!a.bad);
      const bp = el.lastChild;
      bp.style.display = a.prog != null ? 'block' : 'none';
      if (a.prog != null) bp.firstChild.style.width = `${Math.min(100, a.prog * 100)}%`;
      this.put(el, a.st.pos.clone().add(new THREE.Vector3(0, a.st.type === 'server' ? 2.3 : 1.9, 0)), 5);
    }
    for (const [k, el] of this.alerts) if (!seen.has(k)) { el.remove(); this.alerts.delete(k); }
  }

  // Na sprint, nome sobre a cabeça o tempo todo é ruído (a cor já identifica).
  // Só aparece quem está em reunião — com o nome dentro do balão.
  // No lobby, mantém as etiquetas (é ali que se monta o time).
  updatePlayers(players, myId = 0, online = false) {
    for (const p of players) {
      let tag = this.tags.get(p.index);
      if (!tag) {
        tag = h('div', 'ptag', p.look.name + (online && p.owner === myId ? ' · você' : ''));
        tag.style.background = p.color;
        this.world.append(tag);
        this.tags.set(p.index, tag);
      }
      // sprint: tag some (a cor identifica; reunião usa o balão com nome)
      if (this.playing) { tag.style.display = 'none'; }
      else {
        tag.style.display = '';
        tag.style.opacity = p.meeting > 0 ? 0 : 1;
        this.place(tag, p.pos.clone().add(new THREE.Vector3(0, 1.85, 0)));
      }

      let el = this.bubbles.get(p.index);
      const show = p.meeting > 0;
      if (!show) { if (el) { el.remove(); this.bubbles.delete(p.index); } continue; }
      if (!el) {
        el = h('div', 'bubble');
        this.world.append(el);
        this.bubbles.set(p.index, el);
      }
      const txt = `📅 ${p.look.name} em reunião ${Math.ceil(p.meeting)}s`;
      if (el.textContent !== txt) el.textContent = txt;
      this.place(el, p.pos.clone().add(new THREE.Vector3(0, 1.6, 0)));
    }
  }

  // ---------- rótulos de estação ----------
  addStationLabel(st) {
    const info = STATION_INFO[st.type];
    if (!info) return;
    const el = h('div', `slabel s-${st.type}`, `<span>${info.icon}</span>${info.label}`);
    el.dataset.st = st.type;
    this.world.append(el);
    this.labels.push({ el, pos: st.pos.clone().add(new THREE.Vector3(0, 1.45, 0)) });
  }

  // ---------- badges de ticket ----------
  // Só o ícone do passo atual. Sem barra de progresso: o flash da estação,
  // o som de digitação e o timer do card já contam a mesma história.
  badgeFor(t) {
    let b = this.badges.get(t.id);
    if (!b) {
      b = h('div', `badge t-${t.type}`, `<span class="bi"></span>`);
      this.world.append(b);
      this.badges.set(t.id, b);
    }
    return b;
  }
  removeBadge(t) {
    const b = this.badges.get(t.id);
    if (b) { b.remove(); this.badges.delete(t.id); }
  }

  // fluxo certo: só Backlog, Merge e os próximos passos ficam com etiqueta.
  // O resto some durante a sprint pra não brigar com alertas e prompts.
  setFocus(types) { this.focusTypes = types; }

  updateWorld(tickets) {
    for (const l of this.labels) {
      const t = l.el.dataset.st;
      const show = !this.playing || !this.focusTypes || this.focusTypes.has(t);
      l.el.style.display = show ? '' : 'none';
      if (!show) continue;
      l.el.classList.toggle('anchor', t === 'backlog' || t === 'merge');
      this.put(l.el, l.pos, 3, 0, true);
    }
    const tmp = new THREE.Vector3();
    for (const t of tickets) {
      if (t.state !== 'active' || !t.mesh) continue;
      const b = this.badgeFor(t);
      t.mesh.getWorldPosition(tmp);
      tmp.y += 0.35;
      this.put(b, tmp, 0);
      const sd = t.stepDef;
      const ic = t.conflict ? '⚔️' : sd ? sd.icon : '✅';
      const bi = b.firstChild;
      if (bi.textContent !== ic) bi.textContent = ic;
      b.classList.toggle('urgent', t.timeLeft < 20);
    }
  }

  // ---------- cards de pedido ----------
  // Card mínimo: cor do tipo + etapas + prazo. Sem nome (flavor), sem pontos
  // (só importam na entrega), sem "onde levar" (a ▼ + o badge já dizem).
  // O ticket na mão ganha destaque (.focused); a fila apaga (.dim).
  syncOrders(tickets, players) {
    const live = tickets.filter((t) => t.state === 'waiting' || t.state === 'active').slice(0, 5);
    const ids = new Set(live.map((t) => t.id));
    const anyHeld = live.some((t) => t.state === 'active' && t.holder?.kind === 'player');
    for (const [id, c] of this.cards) {
      if (!ids.has(id)) {
        const t = tickets.find((x) => x.id === id);
        c.classList.add(t?.state === 'done' ? 'leave-done' : 'leave-fail');
        this.cards.delete(id);
        setTimeout(() => c.remove(), 600);
      }
    }
    for (const t of live) {
      let c = this.cards.get(t.id);
      if (!c) {
        c = h('div', `card t-${t.type}`);
        c.title = `${t.def.icon} ${t.def.label} · ${t.name}`;
        c.innerHTML = `
          <div class="c-head"><span class="c-ic">${t.def.icon}</span></div>
          <div class="c-steps"></div>
          <div class="c-timer"><div></div></div>`;
        this.orders.append(c);
        this.cards.set(t.id, c);
      }
      // etapas podem mudar (teste falhou, review pediu mudanças)
      const key = t.steps.join(',');
      if (c.dataset.steps !== key) {
        c.dataset.steps = key;
        c.querySelector('.c-steps').innerHTML = t.steps.map((s) => `<span class="st st-${s}">${STEPS[s].icon}</span>`).join('<i>›</i>');
      }
      const stEls = c.querySelectorAll('.st');
      stEls.forEach((e, i) => {
        e.classList.toggle('done', i < t.stepIndex);
        e.classList.toggle('cur', i === t.stepIndex && t.state === 'active');
      });
      const held = t.state === 'active' && t.holder?.kind === 'player';
      c.classList.toggle('focused', !!held);
      c.classList.toggle('dim', !held && anyHeld && t.state === 'waiting');
      const frac = t.timeLeft / t.timeLimit;
      const bar = c.querySelector('.c-timer div');
      bar.style.width = `${frac * 100}%`;
      bar.style.background = frac > 0.5 ? '#44d17a' : frac > 0.25 ? '#ffc93c' : '#ff4d5e';
      c.classList.toggle('urgent', frac < 0.25);
    }
  }

  // opts: { stars: limiares do nível, combo: {mult,t,window}, bonus: {text,t,window} }
  // Uma pill de multiplicador: bônus temporário tem prioridade, senão combo.
  setStats(time, score, { stars = [], combo = null, bonus = null } = {}) {
    this.clockEl.querySelector('.v').textContent = fmtTime(time);
    this.clockEl.classList.toggle('low', time <= 30);
    if (this.scoreEl.textContent !== String(score)) {
      this.scoreEl.textContent = score;
      this.scoreEl.classList.remove('bump');
      void this.scoreEl.offsetWidth;
      this.scoreEl.classList.add('bump');
    }

    const top = stars[stars.length - 1] || 1;
    const key = stars.join(',');
    if (this.goal.mk.dataset.stars !== key) {
      this.goal.mk.dataset.stars = key;
      this.goal.mk.innerHTML = stars.map((s) => `<i style="--p:${(s / top) * 100}%">★</i>`).join('');
    }
    this.goal.fill.style.width = `${Math.min(100, (score / top) * 100)}%`;
    [...this.goal.mk.children].forEach((el, i) => {
      const on = score >= stars[i];
      if (on && !el.classList.contains('on')) {
        el.classList.add('on', 'pop');
        setTimeout(() => el.classList.remove('pop'), 500);
      } else if (!on) el.classList.remove('on');
    });

    const hot = combo && combo.mult > 1;
    const m = bonus ? { text: bonus.text, t: bonus.t, window: bonus.window }
      : hot ? { text: `🔥 x${combo.mult}`, t: combo.t, window: combo.window } : null;
    this.multEl.classList.toggle('hidden', !m);
    if (m) {
      if (this.multX.textContent !== m.text) this.multX.textContent = m.text;
      this.multBar.style.width = `${Math.max(0, Math.min(100, (m.t / m.window) * 100))}%`;
    }
  }

  showHud(v) { this.hud.classList.toggle('hidden', !v); }
  // modo sprint: ativa o filtro de etiquetas do mundo.
  setPlaying(v) {
    this.playing = !!v;
    this.root.classList.toggle('playing', !!v);
    if (!v) this.setFocus(null);
  }

  // ---------- feedback ----------
  floatText(text, pos, color = '#fff', big = false) {
    const el = h('div', `float${big ? ' big' : ''}`, text);
    el.style.color = color;
    this.world.append(el);
    const s = this.project(pos.clone().add(new THREE.Vector3(0, 1.2, 0)));
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
    setTimeout(() => el.remove(), 1400);
  }
  toast(text, ms = 2200) {
    this.toastEl.innerHTML = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
  banner(text, sub = '', ms = 1200) {
    this.bannerEl.innerHTML = `<div class="b-main${text.length > 8 ? ' long' : ''}">${text}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    clearTimeout(this.bannerTimer);
    if (ms > 0) this.bannerTimer = setTimeout(() => this.bannerEl.classList.remove('show'), ms);
  }

  // ---------- ajudas contextuais ----------
  // prompt de tecla sobre a estação que o jogador está mirando
  updatePrompts(list) {
    const seen = new Set();
    for (const pr of list) {
      const key = pr.p.index;
      seen.add(key);
      let el = this.prompts.get(key);
      if (!el) {
        el = h('div', 'prompt');
        this.world.append(el);
        this.prompts.set(key, el);
      }
      const html = pr.items.map(([k, txt]) => `<span><kbd>${k}</kbd>${txt}</span>`).join('');
      if (el.innerHTML !== html) el.innerHTML = html;
      el.style.setProperty('--c', pr.p.color);
      this.put(el, pr.st.pos.clone().add(new THREE.Vector3(0, 0.95, 0.35)), 1);
    }
    for (const [k, el] of this.prompts) if (!seen.has(k)) { el.remove(); this.prompts.delete(k); }
  }

  // setas indicando para onde levar o ticket na mão
  updateGuides(list) {
    const seen = new Set();
    for (const g of list) {
      const key = `${g.st.index}:${g.color}`;
      seen.add(key);
      let el = this.guides.get(key);
      if (!el) {
        el = h('div', 'guide', '▼');
        el.style.color = g.color;
        this.world.append(el);
        this.guides.set(key, el);
      }
      this.put(el, g.st.pos.clone().add(new THREE.Vector3(0, 1.75, 0)), 4, g.slot * 18, true);
    }
    for (const [k, el] of this.guides) if (!seen.has(k)) { el.remove(); this.guides.delete(k); }
  }

  // contagem regressiva gigante nos últimos segundos
  bigCount(n) {
    this.bigEl.textContent = n;
    this.bigEl.classList.remove('show');
    void this.bigEl.offsetWidth;
    this.bigEl.classList.add('show');
  }

  // etiquetas das placas de compra: no lobby mostra tudo (é hora de comprar);
  // na sprint mostra SÓ a placa sob o pé, pra não poluir o fluxo do ticket.
  updatePads(pads, show, near = [], playing = false) {
    const seen = new Set();
    // etiqueta completa só na placa mais próxima de cada jogador (evita etiquetas empilhadas)
    const closest = new Set();
    for (const p of near) {
      let best = null, bd = 2.4;
      for (const pad of pads) {
        if (!pad.visible) continue;
        const d = Math.hypot(p.x - pad.pos.x, p.z - pad.pos.z);
        if (d < bd) { bd = d; best = pad; }
      }
      if (best) closest.add(best);
    }
    if (show) for (const pad of pads) {
      if (!pad.visible) continue;
      // perto de alguém: etiqueta completa; longe: só as compráveis, em versão compacta
      const close = closest.has(pad);
      if (playing) { if (!close) continue; }
      else if (!close && !pad.affordable) continue;
      seen.add(pad.id);
      let el = this.padEls.get(pad.id);
      if (!el) {
        el = h('div', 'padlbl');
        this.world.append(el);
        this.padEls.set(pad.id, el);
      }
      const locked = !!pad.block && !pad.block.startsWith('Dinheiro');
      const html = close
        ? `<b>${pad.icon} ${pad.name}</b><span>${locked ? '🔒 ' + pad.block : fmtMoneyUI(pad.price)}</span>`
        : `<i>${pad.icon}</i><span>${fmtMoneyUI(pad.price)}</span>`;
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.toggle('ok', !!pad.affordable);
      el.classList.toggle('lock', locked);
      el.classList.toggle('mini', !close);
      this.put(el, pad.pos.clone().add(new THREE.Vector3(0, pad.kind === 'build' ? 1.35 : 1.0, 0)), 2);
    }
    for (const [k, el] of this.padEls) if (!seen.has(k)) { el.remove(); this.padEls.delete(k); }
  }

}
