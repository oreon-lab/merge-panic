// Telas de menu (título, online, como jogar, lobby, pausa, resultados).
import { KB_SCHEMES, PAD_HINT } from './input.js';
import { PLAYER_LOOKS } from './player.js';
import { sfx } from './audio.js';

const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const letters = (txt, cls) => [...txt].map((c, i) => `<span class="${cls}" style="--i:${i}">${c}</span>`).join('');
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export class Screens {
  constructor(root) {
    this.el = h('div', 'screen hidden');
    root.append(this.el);
    this.items = [];
    this.index = 0;
    this.name = '';
    this.onAction = null;
    this.keyNav = true;
  }

  get visible() { return !this.el.classList.contains('hidden'); }

  hide() {
    this.el.className = 'screen hidden';
    this.el.innerHTML = '';
    this.items = [];
    this.name = '';
    clearInterval(this.countTimer);
  }

  show(name, html, { keyNav = true, focus = 0 } = {}) {
    clearInterval(this.countTimer);
    this.name = name;
    this.keyNav = keyNav;
    this.el.className = `screen s-${name}`;
    this.el.innerHTML = html;
    this.items = [...this.el.querySelectorAll('[data-nav]')];
    this.items.forEach((b, i) => {
      b.addEventListener('mouseenter', () => this.focus(i, true));
      b.addEventListener('click', (e) => { e.preventDefault(); b.blur(); this.activate(i); });
    });
    this.index = -1;
    if (keyNav) this.focus(Math.min(focus, this.items.length - 1), false);
  }

  focus(i, sound = true) {
    if (!this.items.length) return;
    i = (i + this.items.length) % this.items.length;
    if (i === this.index) return;
    this.items.forEach((b, j) => b.classList.toggle('focus', j === i));
    this.index = i;
    if (sound) sfx.play('nav');
  }

  activate(i = this.index) {
    const b = this.items[i];
    if (!b) return;
    const a = b.dataset.nav;
    sfx.play(a === 'back' ? 'back' : 'select');
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 150);
    this.onAction?.(a, b);
  }

  // navegação com teclado/controle
  handle(m) {
    if (!this.visible) return;
    if (document.activeElement?.tagName === 'INPUT') return;
    if (m.back) { sfx.play('back'); this.onAction?.('back'); return; }
    if (!this.keyNav || !this.items.length) return;
    const grid = this.el.querySelector('.menu.row');
    if (m.up || (grid && m.left)) this.focus(this.index - 1);
    if (m.down || (grid && m.right)) this.focus(this.index + 1);
    if (m.confirm) this.activate();
  }

  // ---------------------------------------------------------------
  title({ muted }) {
    this.show('title', `
      <div class="title-wrap">
        <div class="logo-big">
          <div class="lg1">${letters('MERGE', 'lt')}</div>
          <div class="lg2">${letters('PANIC', 'lt')}</div>
        </div>
        <div class="tagline">Overcooked de devs · co-op caótico para até 4 jogadores</div>
        <div class="menu">
          <button class="mbtn" data-nav="local"><i>🎮</i><span><b>Jogar local</b><small>Mesmo PC · teclado e controles</small></span></button>
          <button class="mbtn" data-nav="online"><i>🌐</i><span><b>Jogar online</b><small>Crie uma sala e chame a galera</small></span></button>
          <button class="mbtn" data-nav="howto"><i>📖</i><span><b>Como jogar</b><small>Fluxo, controles e o caos</small></span></button>
          <button class="mbtn slim" data-nav="sound"><i>${muted ? '🔇' : '🔊'}</i><span><b>Som: ${muted ? 'desligado' : 'ligado'}</b></span></button>
        </div>
        <div class="foot"><kbd>↑</kbd><kbd>↓</kbd> navegar · <kbd>Enter</kbd> confirmar · 🎮 compatível com controle</div>
      </div>`);
  }

  online({ busy = '', error = '', code = '' } = {}) {
    this.show('online', `
      <div class="panel-wrap">
        <div class="scr-head"><button class="back" data-nav="back">←</button><h2>🌐 Jogar online</h2></div>
        <div class="two-cards">
          <div class="ocard">
            <div class="oc-ic">🏠</div>
            <h3>Criar sala</h3>
            <p>Você vira o host: sua máquina roda a partida. Mande o link pros amigos.</p>
            <button class="big-btn" data-nav="create">${busy === 'create' ? 'Criando...' : '➕ Criar sala'}</button>
          </div>
          <div class="ocard">
            <div class="oc-ic">🔑</div>
            <h3>Entrar numa sala</h3>
            <p>Digite o código de 4 letras que o host te passou.</p>
            <input id="room-code" maxlength="4" placeholder="ABCD" value="${code}" autocomplete="off" spellcheck="false">
            <button class="big-btn blue" data-nav="join">${busy === 'join' ? 'Entrando...' : '🚪 Entrar'}</button>
          </div>
        </div>
        ${error ? `<div class="err">⚠️ ${error}</div>` : ''}
        <div class="foot">Dica: com <b>ngrok</b> (<code>ngrok http 5199</code>) dá pra jogar pela internet.</div>
      </div>`, { focus: busy === 'join' ? 1 : 0 });
    const input = this.el.querySelector('#room-code');
    input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { this.onAction?.('join'); }
      if (e.key === 'Escape') input.blur();
      e.stopPropagation();
    });
  }
  get roomCode() { return this.el.querySelector('#room-code')?.value.trim() || ''; }

  howto() {
    const kb = Object.values(KB_SCHEMES).map((s) => `<tr><td>⌨️ ${s.name}</td><td><kbd>${s.hint[0]}</kbd></td><td><kbd>${s.hint[1]}</kbd></td><td><kbd>${s.hint[2]}</kbd></td><td><kbd>${s.hint[3]}</kbd></td></tr>`).join('');
    const chaos = [
      ['🤖', 'Agente de IA', 'Codifica sozinho e rápido, mas às vezes deixa bug escondido.'],
      ['❌', 'Testes falham', 'O ticket ganha uma etapa 🔧 Corrigir. Conserte e teste de novo.'],
      ['📝', 'Changes requested', 'O review pode devolver o ticket com um "nit".'],
      ['⚔️', 'Conflito de merge', 'Segure Trabalhar no Merge. Evite merges colados!'],
      ['🚨', 'Bug em produção', 'Bug que escapou vira Hotfix. Pontos escorrem até resolver.'],
      ['📶', 'Wi-Fi caiu', 'IA e testes param. Reinicie o roteador.'],
      ['🤖💥', 'IA alucinando', 'Segure Trabalhar no agente para reiniciar.'],
      ['📅', 'Reunião surpresa', 'Um dev fica preso. O time cobre!'],
    ].map(([i, t, d]) => `<div class="chaos"><div class="ch-i">${i}</div><div><b>${t}</b><p>${d}</p></div></div>`).join('');
    this.show('howto', `
      <div class="panel-wrap wide">
        <div class="scr-head"><button class="back" data-nav="back">←</button><h2>📖 Como jogar</h2></div>
        <div class="howto-grid">
          <section>
            <h3>O fluxo de um ticket</h3>
            <div class="flow">
              <div class="fs"><i>📋</i><b>Backlog</b><small>pegue</small></div><span>›</span>
              <div class="fs"><i>💻</i><b>Implementar</b><small>segure trabalhar</small></div><span>›</span>
              <div class="fs"><i>🧪</i><b>Testes</b><small>automático</small></div><span>›</span>
              <div class="fs"><i>👀</i><b>Review</b><small>outro dev</small></div><span>›</span>
              <div class="fs"><i>🔀</i><b>Merge</b><small>entregue!</small></div>
            </div>
            <div class="types">
              <span class="tp t-bug">🐞 Bug <small>sem review · 20 pts</small></span>
              <span class="tp t-feature">✨ Feature <small>40 pts</small></span>
              <span class="tp t-project">🚀 Projeto <small>longo · 80 pts</small></span>
              <span class="tp t-hotfix">🚨 Hotfix <small>urgente!</small></span>
            </div>
            <h3>Dicas de time</h3>
            <ul class="tips">
              <li>👯 <b>Pair programming</b>: 2 devs na mesma mesa = mais rápido e <b>sem bugs</b>.</li>
              <li>🙅 Ninguém revisa o próprio código. Combinem quem revisa!</li>
              <li>⏱️ Entregar rápido dá gorjeta. Tocar em equipe dá bônus 🤝.</li>
              <li>☕ Café deixa você mais rápido por alguns segundos.</li>
              <li>🗑️ Won't fix descarta um ticket impossível (com penalidade).</li>
            </ul>
          </section>
          <section>
            <h3>Controles</h3>
            <table class="ctrl"><tr><th></th><th>Mover</th><th>Pegar</th><th>Trabalhar</th><th>Dash</th></tr>${kb}
              <tr><td>🎮 Controle</td><td><kbd>${PAD_HINT[0]}</kbd></td><td><kbd>${PAD_HINT[1]}</kbd></td><td><kbd>${PAD_HINT[2]}</kbd></td><td><kbd>${PAD_HINT[3]}</kbd></td></tr></table>
            <h3>O caos</h3>
            <div class="chaos-grid">${chaos}</div>
          </section>
        </div>
      </div>`);
  }

  // lobby: jogadores andam pelo escritório; teclas de menu desligadas
  lobby({ level, players, myId = 0, role = 'local', code = '', link = '', peers = 0, freeDevices = [] }) {
    const slots = [0, 1, 2, 3].map((i) => {
      const p = players[i];
      const look = PLAYER_LOOKS[i];
      if (!p) {
        return `<div class="slot2 empty"><div class="sl-num">P${i + 1}</div><div class="sl-wait">Aperte <b>PEGAR</b><br>para entrar</div></div>`;
      }
      const mine = p.owner === myId;
      const hint = p.device.startsWith('gp') ? PAD_HINT : KB_SCHEMES[p.device]?.hint || PAD_HINT;
      const dev = !mine ? '🌐 outro PC' : p.device.startsWith('gp') ? `🎮 Controle ${+p.device.slice(2) + 1}` : `⌨️ ${KB_SCHEMES[p.device].name}`;
      return `<div class="slot2" style="--c:${look.color}">
        <div class="sl-top"><div class="sl-num">${look.name}</div><div class="sl-dev">${dev}${mine && role !== 'local' ? ' · <b>você</b>' : ''}</div></div>
        ${mine ? `<div class="sl-keys"><span><kbd>${hint[0]}</kbd> mover</span><span><kbd>${hint[1]}</kbd> pegar</span><span><kbd>${hint[2]}</kbd> trabalhar</span><span><kbd>${hint[3]}</kbd> dash</span></div>`
          : '<div class="sl-keys"><span>Pronto pra codar 👋</span></div>'}
      </div>`;
    }).join('');
    const join = Object.entries(KB_SCHEMES).filter(([id]) => freeDevices.includes(id))
      .map(([, s]) => `<span><kbd>${s.hint[1]}</kbd> ${s.hint[0]}</span>`).join('') + '<span><kbd>A</kbd> controle</span>';
    const room = role === 'host'
      ? `<div class="room"><span>Sala</span><b class="code">${code}</b><button class="chip" data-nav="copy">📋 Copiar link</button><small>${peers} PC${peers > 1 ? 's' : ''}</small></div>`
      : role === 'client' ? `<div class="room"><span>Sala</span><b class="code">${code}</b><small>conectado</small></div>` : '';
    const canStart = players.length && role !== 'client';
    this.show('lobby', `
      <div class="lobby-top">
        <button class="back" data-nav="back">←</button>
        <div class="lt-title"><h2>Monte o time</h2><small>Andem pelo escritório enquanto esperam 😄</small></div>
        ${room}
      </div>
      <div class="level-card">
        <div class="lv-name">${level.name}</div>
        <div class="lv-sub">${level.subtitle}</div>
        <div class="lv-meta"><span>⏱️ ${fmtTime(level.duration)}</span><span>🎯 ${level.maxOrders} demandas</span><span>⭐ ${level.stars.join(' / ')}</span></div>
      </div>
      <div class="lobby-bottom">
        <div class="slots2">${slots}</div>
        <div class="lobby-actions">
          <div class="join-keys">Entrar: ${join}</div>
          ${role === 'client'
            ? '<div class="wait-host">⏳ Aguardando o host começar...</div>'
            : `<button class="start-btn ${canStart ? '' : 'off'}" data-nav="start">▶ Começar sprint <kbd>Espaço</kbd></button>`}
        </div>
      </div>`, { keyNav: false });
    this.link = link;
  }

  pause({ remote }) {
    if (remote) {
      this.show('pause', `<div class="modal"><div class="m-title">⏸️ O host pausou</div><p>Hora do cafezinho ☕</p></div>`, { keyNav: false });
      return;
    }
    this.show('pause', `
      <div class="modal">
        <div class="m-title">⏸️ Pausado</div>
        <p>Parece aquela call que ninguém liga a câmera.</p>
        <div class="menu">
          <button class="mbtn slim" data-nav="resume"><i>▶</i><span><b>Continuar</b></span></button>
          <button class="mbtn slim" data-nav="restart"><i>🔁</i><span><b>Reiniciar sprint</b></span></button>
          <button class="mbtn slim" data-nav="lobby"><i>👥</i><span><b>Voltar ao lobby</b></span></button>
          <button class="mbtn slim" data-nav="menu"><i>🏠</i><span><b>Menu principal</b></span></button>
        </div>
      </div>`);
  }

  results(r, { role }) {
    const stars = [1, 2, 3].map((i) => `<span class="star ${r.stars >= i ? 'on' : ''}" style="--d:${0.5 + i * 0.35}s">★</span>`).join('');
    const cards = r.players.map((p, i) => `
      <div class="pcard" style="--c:${p.color};--d:${1.6 + i * 0.12}s">
        <div class="pc-name">${p.name}</div>
        <div class="pc-title">${p.title}</div>
        <div class="pc-stats"><span>💻 ${p.stats.coded}</span><span>👀 ${p.stats.reviewed}</span><span>🔧 ${p.stats.fixed}</span><span>🔌 ${p.stats.repairs}</span><span>🔀 ${p.stats.delivered}</span><span>☕ ${p.stats.coffee}</span></div>
      </div>`).join('');
    const buttons = role === 'client'
      ? '<div class="wait-host">⏳ Aguardando o host...</div><div class="menu row"><button class="mbtn slim" data-nav="menu"><i>🚪</i><span><b>Sair da sala</b></span></button></div>'
      : `<div class="menu row">
          <button class="mbtn slim" data-nav="again"><i>🔁</i><span><b>Jogar de novo</b></span></button>
          <button class="mbtn slim" data-nav="lobby"><i>👥</i><span><b>Lobby</b></span></button>
          <button class="mbtn slim" data-nav="menu"><i>🏠</i><span><b>Menu</b></span></button>
        </div>`;
    this.show('results', `
      <div class="results2">
        <div class="r-kicker">SPRINT ENCERRADA</div>
        <div class="r-head">${r.headline}</div>
        <div class="stars2">${stars}</div>
        <div class="r-score"><span class="count">0</span><small>pontos</small></div>
        <div class="r-line"><span>✅ ${r.delivered} entregues</span><span>❌ ${r.failed} perdidos</span><span>🗑️ ${r.trashed} won't fix</span></div>
        <div class="r-cards">${cards}</div>
        ${buttons}
      </div>`);
    // placar contando
    const el = this.el.querySelector('.count');
    const start = performance.now(), dur = 1300;
    this.countTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / dur);
      el.textContent = Math.round(r.score * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && Math.random() < 0.5) sfx.play('count');
      if (k >= 1) clearInterval(this.countTimer);
    }, 40);
    [1, 2, 3].forEach((i) => { if (r.stars >= i) setTimeout(() => sfx.play('star'), (0.5 + i * 0.35) * 1000); });
  }
}
