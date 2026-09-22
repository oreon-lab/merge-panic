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
    this.stats = h('div', 'stats', `
      <div class="clock"><span class="ic">⏱️</span><span class="v">5:00</span></div>
      <div class="score"><span class="lbl">PONTOS</span><span class="v">0</span></div>
      <div class="deliv"><span class="lbl">ENTREGUES</span><span class="v">0/20</span></div>`);
    this.hud.append(this.stats);
    this.toastEl = h('div', 'toast'); this.root.append(this.toastEl);
    this.bannerEl = h('div', 'banner'); this.root.append(this.bannerEl);
    this.bigEl = h('div', 'bigcount'); this.root.append(this.bigEl);
    this.roomEl = h('div', 'room-chip hidden'); this.hud.append(this.roomEl);
    this.hud.append(h('div', 'hud-help', '<kbd>Esc</kbd> pausar · <kbd>M</kbd> som'));
    this.cards = new Map();
    this.labels = []; // { el, pos: Vector3 | () => Vector3 }
    this.badges = new Map();
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

  clearWorld() {
    this.world.innerHTML = '';
    this.labels = [];
    this.badges.clear();
    this.alerts = new Map();
    this.bubbles = new Map();
    this.tags = new Map();
    this.prompts = new Map();
    this.guides = new Map();
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
      bp.style.display = a.prog ? 'block' : 'none';
      if (a.prog) bp.firstChild.style.width = `${Math.min(100, a.prog * 100)}%`;
      this.place(el, a.st.pos.clone().add(new THREE.Vector3(0, a.st.type === 'server' ? 2.3 : 1.9, 0)));
    }
    for (const [k, el] of this.alerts) if (!seen.has(k)) { el.remove(); this.alerts.delete(k); }
  }

  // balões sobre os jogadores (reunião)
  updatePlayers(players, myId = 0, online = false) {
    for (const p of players) {
      let tag = this.tags.get(p.index);
      if (!tag) {
        tag = h('div', 'ptag', p.look.name + (online && p.owner === myId ? ' · você' : ''));
        tag.style.background = p.color;
        this.world.append(tag);
        this.tags.set(p.index, tag);
      }
      tag.style.opacity = p.meeting > 0 ? 0 : 1;
      this.place(tag, p.pos.clone().add(new THREE.Vector3(0, 1.85, 0)));

      let el = this.bubbles.get(p.index);
      const show = p.meeting > 0;
      if (!show) { if (el) { el.remove(); this.bubbles.delete(p.index); } continue; }
      if (!el) {
        el = h('div', 'bubble');
        this.world.append(el);
        this.bubbles.set(p.index, el);
      }
      const txt = `📅 Em reunião... ${Math.ceil(p.meeting)}s`;
      if (el.textContent !== txt) el.textContent = txt;
      this.place(el, p.pos.clone().add(new THREE.Vector3(0, 1.6, 0)));
    }
  }

  // ---------- rótulos de estação ----------
  addStationLabel(st) {
    const info = STATION_INFO[st.type];
    if (!info) return;
    const el = h('div', `slabel s-${st.type}`, `<span>${info.icon}</span>${info.label}`);
    this.world.append(el);
    this.labels.push({ el, pos: st.pos.clone().add(new THREE.Vector3(0, 1.45, 0)) });
  }

  // ---------- badges de ticket ----------
  badgeFor(t) {
    let b = this.badges.get(t.id);
    if (!b) {
      b = h('div', `badge t-${t.type}`, `<span class="bi"></span><div class="bp"><div></div></div>`);
      this.world.append(b);
      this.badges.set(t.id, b);
    }
    return b;
  }
  removeBadge(t) {
    const b = this.badges.get(t.id);
    if (b) { b.remove(); this.badges.delete(t.id); }
  }

  updateWorld(tickets) {
    for (const l of this.labels) this.place(l.el, l.pos);
    const tmp = new THREE.Vector3();
    for (const t of tickets) {
      if (t.state !== 'active' || !t.mesh) continue;
      const b = this.badgeFor(t);
      t.mesh.getWorldPosition(tmp);
      tmp.y += 0.35;
      this.place(b, tmp);
      const sd = t.stepDef;
      const icon = t.conflict ? '⚔️' : sd ? sd.icon : '✅';
      const bi = b.firstChild;
      if (bi.textContent !== icon) bi.textContent = icon;
      const bp = b.lastChild;
      bp.style.display = t.progress > 0 ? 'block' : 'none';
      bp.firstChild.style.width = `${Math.min(100, t.progress * 100)}%`;
      b.classList.toggle('urgent', t.timeLeft < 20);
    }
  }

  // ---------- cards de pedido ----------
  syncOrders(tickets, players) {
    const live = tickets.filter((t) => t.state === 'waiting' || t.state === 'active');
    const ids = new Set(live.map((t) => t.id));
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
        c.innerHTML = `
          <div class="c-head"><span class="c-ic">${t.def.icon}</span><span class="c-type">${t.def.label}</span><span class="c-pts">${t.def.points}</span></div>
          <div class="c-name">${t.name}</div>
          <div class="c-steps"></div>
          <div class="c-who"></div>
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
      let who = '📋 no backlog';
      if (t.state === 'active') {
        if (t.holder?.kind === 'player') {
          const p = t.holder.ref;
          who = `<b style="color:${p.color}">● ${p.look.name}</b> carregando`;
        } else if (t.holder?.kind === 'station') {
          const info = STATION_INFO[t.holder.ref.type];
          who = info ? `${info.icon} em ${info.label}` : '📥 na bancada';
        }
        who += ` · próx: <b>${t.stepDef.label}</b>`;
      }
      const whoEl = c.querySelector('.c-who');
      if (whoEl.innerHTML !== who) whoEl.innerHTML = who;
      const frac = t.timeLeft / t.timeLimit;
      const bar = c.querySelector('.c-timer div');
      bar.style.width = `${frac * 100}%`;
      bar.style.background = frac > 0.5 ? '#44d17a' : frac > 0.25 ? '#ffc93c' : '#ff4d5e';
      c.classList.toggle('urgent', frac < 0.25);
    }
  }

  setStats(time, score, delivered, max) {
    const clock = this.stats.querySelector('.clock');
    clock.querySelector('.v').textContent = fmtTime(time);
    clock.classList.toggle('low', time <= 30);
    this.stats.querySelector('.score .v').textContent = score;
    this.stats.querySelector('.deliv .v').textContent = `${delivered}/${max}`;
  }

  showHud(v) { this.hud.classList.toggle('hidden', !v); }

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
      this.place(el, pr.st.pos.clone().add(new THREE.Vector3(0, 0.95, 0.35)));
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
      el.style.marginLeft = `${g.slot * 18}px`;
      this.place(el, g.st.pos.clone().add(new THREE.Vector3(0, 1.75, 0)));
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

  setRoom(code) {
    this.roomEl.classList.toggle('hidden', !code);
    this.roomEl.innerHTML = code ? `🌐 Sala <b>${code}</b>` : '';
  }
}
