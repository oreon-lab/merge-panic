// Telas do jogo. Duas camadas:
//  - chrome: a moldura fixa do HQ (empresa no topo, time + dock embaixo)
//  - el: telas cheias e painéis que abrem por cima do HQ
// Regras de UX iguais em tudo: um botão principal (verde) por tela,
// Esc/B sempre volta um nível, setas/analógico navegam, Enter/A confirma.
import { KB_SCHEMES, PAD_HINT, MOUSE_HINT, DEVICE_LABEL } from './input.js';
import { PLAYER_LOOKS } from './player.js';
import { sfx } from './audio.js';
import { icon } from './icons.js';
import { STAGES, stageOf, nextStage, fmtMoney } from './economy.js';

const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const hintOf = (device) => (device === 'mouse' ? MOUSE_HINT : device?.startsWith('gp') ? PAD_HINT : KB_SCHEMES[device]?.hint || PAD_HINT);
const letters = (txt, cls) => [...txt].map((c, i) => `<span class="${cls}" style="--i:${i}">${c}</span>`).join('');
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
// texto vindo de outros jogadores nunca vira HTML
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// barra do estágio da empresa (from = valuation antes, pra animar a subida)
// Só ícone + nome + barra. O "faltam R$ X" era filler ansioso em toda tela.
function stageBar(company, from = null) {
  const pctOf = (v) => {
    const st = stageOf(v), nx = nextStage(v);
    return nx ? Math.min(100, ((v - st.at) / (nx.at - st.at)) * 100) : 100;
  };
  const st = stageOf(company.valuation);
  const start = from != null && stageOf(from).id === st.id ? pctOf(from) : pctOf(company.valuation);
  return `<div class="stage-bar"><div class="sb-top"><span>${st.icon} <b>${st.name}</b></span></div>
    <div class="sb-track"><div style="width:${start}%" data-to="${pctOf(company.valuation)}"></div></div></div>`;
}

// moldura padrão dos painéis: cabeçalho, conteúdo, rodapé
// barra de comandos no rodapé, como nos menus de console
const PROMPTS = '<div class="prompts-bar"><span><kbd>Esc</kbd> Voltar</span><span><kbd>↑</kbd><kbd>↓</kbd> Navegar</span><span><kbd>Enter</kbd> Confirmar</span></div>';

const frame = ({ icon: ic, title, sub = '', body, foot = '', cls = '' }) => `
  <div class="pnl ${cls}">
    <div class="pnl-head"><button class="back" data-nav="back" title="Voltar (Esc)">${icon('back', 22)}</button>
      <div class="ribbon"><span class="rb-ic">${icon(ic, 24)}</span><h2>${title}</h2></div>
      ${sub ? `<small class="pnl-sub">${sub}</small>` : ''}</div>
    <div class="pnl-body">${body}</div>
    ${foot ? `<div class="pnl-foot">${foot}</div>` : ''}
    ${PROMPTS}
  </div>`;

export class Screens {
  constructor(root) {
    this.chrome = h('div', 'hq hidden');
    this.el = h('div', 'screen hidden');
    root.append(this.chrome, this.el);
    this.items = [];
    this.index = -1;
    this.name = '';
    this.keyNav = true;
    this.dockFocus = false;
    this.onAction = null;
  }

  get visible() { return !this.el.classList.contains('hidden'); }

  // ---------- navegação ----------
  hide() {
    this.el.className = 'screen hidden';
    this.el.innerHTML = '';
    this.name = '';
    clearInterval(this.countTimer);
    this.bindItems();
  }

  show(name, html, { keyNav = true, focus = 0, cls = '' } = {}) {
    clearInterval(this.countTimer);
    this.name = name;
    this.keyNav = keyNav;
    this.dockFocus = false;
    this.chrome.classList.remove('dock-focus');
    this.el.className = `screen s-${name} ${cls}`;
    this.el.innerHTML = html;
    this.bindItems(focus);
    // barras de progresso animam do valor antigo pro novo
    setTimeout(() => this.el.querySelectorAll('.sb-track div[data-to]').forEach((d) => { d.style.width = d.dataset.to + '%'; }), 350);
  }

  // itens navegáveis da camada ativa (painel aberto, ou a dock do HQ)
  bindItems(focus = 0) {
    const layer = this.visible ? this.el : this.chrome;
    this.items = [...layer.querySelectorAll('[data-nav]:not([disabled])')];
    this.items.forEach((b) => {
      if (b._bound) return;
      b._bound = true;
      b.addEventListener('mouseenter', () => this.focus(this.items.indexOf(b), true));
      b.addEventListener('click', (e) => { e.preventDefault(); b.blur(); this.activate(this.items.indexOf(b)); });
    });
    this.index = -1;
    this.items.forEach((b) => b.classList.remove('focus'));
    if (this.visible && this.keyNav && this.items.length) this.focus(Math.min(focus, this.items.length - 1), false);
  }

  focus(i, sound = true) {
    if (!this.items.length || i < 0) return;
    i = (i + this.items.length) % this.items.length;
    if (i === this.index) return;
    this.items.forEach((b, j) => b.classList.toggle('focus', j === i));
    this.index = i;
    this.items[i].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (sound) sfx.play('nav');
  }

  focusNav(nav) {
    const i = this.items.findIndex((b) => b.dataset.nav === nav);
    if (i >= 0) this.focus(i, false);
  }

  activate(i = this.index) {
    const b = this.items[i];
    if (!b || b.disabled) return;
    const a = b.dataset.nav;
    sfx.play(a === 'back' ? 'back' : 'select');
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 150);
    this.onAction?.(a, b);
  }

  // dock do HQ recebe foco com Tab / Select
  setDockFocus(on) {
    if (this.visible) return;
    this.dockFocus = on;
    this.chrome.classList.toggle('dock-focus', on);
    this.bindItems();
    if (on) this.focusNav('sprints');
  }

  handle(m) {
    if (document.activeElement?.tagName === 'INPUT') return;
    if (!this.visible && !this.dockFocus) return;
    if (m.back) {
      sfx.play('back');
      if (this.dockFocus && !this.visible) this.setDockFocus(false);
      else this.onAction?.('back');
      return;
    }
    if ((this.visible && !this.keyNav) || !this.items.length) return;
    const horizontal = this.dockFocus || this.el.querySelector('.nav-h');
    if (m.up || (horizontal && m.left)) this.focus(this.index - 1);
    if (m.down || (horizontal && m.right)) this.focus(this.index + 1);
    if (m.confirm) this.activate();
  }

  // =================================================================
  // Abertura
  // =================================================================
  splash({ status = 'loading' }) {
    const st = status === 'loading' ? '<span class="sp-status">⏳ Conectando ao servidor...</span>'
      : status === 'offline' ? '<span class="sp-status warn">⚠️ Servidor offline — dá pra jogar, mas nada será salvo</span>' : '';
    this.show('splash', `
      <div class="splash">
        <div class="logo-big">
          <div class="lg1">${letters('MERGE', 'lt')}</div>
          <div class="lg2">${letters('PANIC', 'lt')}</div>
        </div>
        <div class="tagline">Monte sua empresa de software. Sobreviva às sprints. Não faça deploy na sexta.</div>
        <button class="press" data-nav="go">Aperte qualquer tecla</button>
        ${st}
        <div class="sp-foot">🎮 controle · ⌨️ até 3 no mesmo teclado · 🌐 online com amigos</div>
      </div>`);
  }

  // =================================================================
  // Fundar empresa (primeira vez)
  // =================================================================
  found({ name = '', company = '', error = '' } = {}) {
    this.show('found', `
      <div class="found">
        <div class="fd-card">
          <div class="fd-ic">🏚️</div>
          <h2>Toda Big Tech começou numa garagem.</h2>
          <p>Cada sprint gera receita. Invista no escritório e cresça de <b>Garagem</b> até <b>Big Tech</b>. O progresso fica salvo no servidor.</p>
          <label class="fld"><span>Como te chamam?</span><input id="w-name" maxlength="20" value="${esc(name)}" placeholder="Ex.: Ana" autocomplete="off"></label>
          <label class="fld"><span>Nome da empresa</span><input id="w-company" maxlength="20" value="${esc(company)}" placeholder="Ex.: Café & Commits" autocomplete="off"></label>
          ${error ? `<div class="err">⚠️ ${esc(error)}</div>` : ''}
          <button class="btn primary big" data-nav="found">🚀 Fundar empresa</button>
          <details class="restore"><summary>Já jogo em outro navegador</summary>
            <p>Cole o código da sua conta (fica em ⚙️ Ajustes).</p>
            <div class="row"><input id="w-code" placeholder="p_...." autocomplete="off"><button class="btn" data-nav="restore">Restaurar</button></div>
          </details>
        </div>
      </div>`, { keyNav: false });
    this.el.querySelectorAll('input').forEach((input) => input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onAction?.(input.id === 'w-code' ? 'restore' : 'found');
      e.stopPropagation();
    }));
    setTimeout(() => this.el.querySelector(name ? '#w-company' : '#w-name')?.focus(), 60);
  }
  field(id) { return this.el.querySelector('#' + id)?.value.trim() || ''; }

  // =================================================================
  // HQ: moldura fixa por cima do escritório 3D
  // =================================================================
  hq({ company, role, players, names, myId, freeDevices, code, peers, canStart, levelName, offline, investment }) {
    const co = company
      ? `<div class="hq-co"><div class="hq-ic">${stageOf(company.valuation).icon}</div>
          <div class="hq-coinfo"><b>${esc(company.name)}</b>${role === 'client' ? '<small class="guest">HQ do host</small>' : ''}${stageBar(company)}</div>
          <div class="hq-cash"><small>Caixa</small><b class="${company.cash < 0 ? 'neg' : ''}">${fmtMoney(company.cash)}</b></div></div>`
      : `<div class="hq-co"><div class="hq-ic">🏚️</div><div class="hq-coinfo"><b>${offline ? 'Modo offline' : 'Conectando...'}</b><small>${offline ? 'o progresso não será salvo' : ''}</small></div></div>`;
    const room = code
      ? `<button class="hq-room" data-nav="room">${icon('globe', 18)} Sala <b>${code}</b><small>${role === 'host' ? `${peers} PC${peers > 1 ? 's' : ''}` : 'convidado'}</small></button>` : '';
    // Seleção de time estilo arcade: slots vazios são vagas, o primeiro
    // vazio vira "PRESS TO JOIN" com o botão de cada controle à mostra.
    // Aqui o botão de ação ENTRA no time — chamar de "PEGAR" confundia
    // com o pegar ticket lá dentro da sprint.
    const JOIN_META = { kbA: { key: 'E', label: '⌨️ 1 · WASD' }, kbB: { key: 'O', label: '⌨️ 2 · IJKL' }, kbC: { key: 'Shift', label: '⌨️ 3 · Setas' }, mouse: { key: 'Dir.', label: '🖱️ mouse' } };
    const freeSet = new Set(freeDevices || []);
    const chips = [...Object.entries(JOIN_META)].filter(([id]) => freeSet.has(id)).map(([, m]) => `<span><kbd>${m.key}</kbd>${m.label}</span>`).join('');
    const padChip = `<span><kbd>A</kbd>🎮 controle</span>`;
    const joinKeys = `<div class="join-keys">${chips}${padChip}</div>`;
    const firstEmpty = [0, 1, 2, 3].findIndex((i) => !players[i]);
    const slots = [0, 1, 2, 3].map((i) => {
      const p = players[i];
      const look = PLAYER_LOOKS[i];
      if (!p) {
        if (i === firstEmpty && firstEmpty !== -1) return `<div class="tm empty next"><b>＋ Entrar no time</b>${joinKeys}<small>escolha seu controle</small></div>`;
        return `<div class="tm empty"><b>P${i + 1}</b><small>vaga livre</small></div>`;
      }
      const mine = p.owner === myId;
      const leaveKey = p.device === 'mouse' ? 'Dir.' : p.device?.startsWith('gp') ? 'A' : KB_SCHEMES[p.device]?.hint[1] || 'ação';
      return `<div class="tm" style="--c:${look.color}"><div class="tm-top"><b>${look.name}</b><span>${esc(names[i] || '')}</span></div>
        <small>${mine ? `${DEVICE_LABEL(p.device)} · ${esc(leaveKey)} para sair` : '🌐 outro PC'}</small></div>`;
    }).join('');
    const tip = !players.length ? `<span class="step on">1</span> 🎮 <b>Monte seu time!</b> escolha o controle e entre &nbsp;→&nbsp; <span class="step">2</span> <kbd>Enter</kbd> / <b>Jogar</b>`
      : role === 'client' ? '⏳ O host escolhe a sprint.'
      : `<span class="step done">✓</span> <b>Time pronto!</b> <span class="step on">2</span> <kbd>Enter</kbd> começa · + controles ainda podem entrar`;
    const goal = company && investment ? `<div class="hq-goal ${investment.ready ? 'ready' : ''}">
      <span class="hq-goal-label">Próximo investimento</span>
      <b>${investment.icon} ${esc(investment.name)}</b>
      <small>${investment.ready ? `Disponível agora · ${fmtMoney(investment.price)}` : `Faltam ${fmtMoney(investment.remaining)} · meta ${fmtMoney(investment.price)}`}</small>
      <span class="hq-goal-track"><i style="width:${Math.round(investment.progress)}%"></i></span>
    </div>` : '';
    this.chrome.className = 'hq' + (this.dockFocus ? ' dock-focus' : '');
    this.chrome.innerHTML = `
      <div class="hq-top">${co}<div class="hq-right">${room}</div></div>
      <div class="hq-tip"><span class="hq-step">${tip}</span>${goal}</div>
      <div class="hq-bottom">
        <div class="team">${slots}</div>
        <div class="dock">
          <button class="dk" data-nav="room">${icon('users', 22)}<span>${code ? 'Sala' : 'Convidar'}</span></button>
          <button class="dk play ${canStart ? '' : 'dim'}" data-nav="sprints">${icon('play', 22)}<span>Jogar</span><small>${esc(levelName)}</small></button>
          <button class="dk" data-nav="help">${icon('book', 22)}<span>Ajuda</span></button>
          <button class="dk" data-nav="settings">${icon('gear', 22)}<span>Ajustes</span></button>
        </div>
      </div>`;
    if (!this.visible) {
      const keep = this.dockFocus ? this.items[this.index]?.dataset.nav : null;
      this.bindItems();
      if (keep) this.focusNav(keep);
    }
  }
  hideChrome() { this.chrome.className = 'hq hidden'; this.dockFocus = false; }

  // =================================================================
  // Briefing da primeira sprint: o quebra-gelo (30s de leitura, 1 botão)
  // =================================================================
  brief({ controls = [], levelName = '', stars = [] }) {
    const ctrls = controls.length
      ? controls.map((c) => `<div class="bctl"><b>${esc(c.who)}</b><span><kbd>${esc(c.move)}</kbd> mover · <kbd>${esc(c.pick)}</kbd> pegar · <kbd>${esc(c.use)}</kbd> segurar p/ trabalhar</span></div>`).join('')
      : '<div class="bctl"><b>Teclado/mouse/controle</b><span>as teclas aparecem sobre a estação que você mirar</span></div>';
    const goal = stars.length ? `<div class="bgoal">⭐ Meta: <b>${stars[0]}</b> pts pra 1ª estrela · quanto mais rápido entregar, mais gorjeta</div>` : '';
    this.show('brief', frame({
      icon: 'play', title: 'Sua primeira sprint', sub: levelName,
      body: `
        <div class="bflow">
          <div class="bfs"><i>📋</i><b>1 · Pegue</b><small>vá ao Backlog roxo</small></div><span>›</span>
          <div class="bfs"><i>💻</i><b>2 · Leve e segure</b><small>siga a ▼ até a mesa</small></div><span>›</span>
          <div class="bfs"><i>🔀</i><b>3 · Entregue</b><small>Merge verde = pontos</small></div>
        </div>
        ${goal}
        <div class="bctls">${ctrls}</div>
        <p class="hint">🧊 Quebra-gelo: vou te guiar passo a passo lá dentro. Sem caos nos primeiros segundos — prometo.</p>`,
      foot: `<button class="btn primary big" data-nav="begin">${icon('play', 18)} Começar!</button>`,
    }), { focus: 1 });
  }

  // =================================================================
  // Sala online
  // =================================================================
  room({ role, code = '', link = '', peers = 0, busy = '', error = '', typed = '' }) {
    let body;
    if (role === 'host') {
      body = `<div class="room-big"><small>Código da sala</small><b class="code xl">${code}</b>
          <div class="row"><input class="o-link" readonly value="${esc(link)}"><button class="btn primary" data-nav="copy">${icon('copy', 18)} Copiar link</button></div>
          <p>🟢 <b>${peers} PC${peers > 1 ? 's' : ''}</b> na sala. Quem entrar aparece andando no seu HQ — é só escolher o controle e entrar no time.</p></div>`;
    } else if (role === 'client') {
      body = `<div class="room-big"><small>Você está na sala</small><b class="code xl">${code}</b>
          <p>Você joga no HQ do host: a empresa, as compras e a escolha da sprint são dele. Seu histórico de dev fica salvo no <b>seu</b> perfil.</p></div>`;
    } else {
      body = `<div class="two-cards">
          <div class="ocard"><div class="oc-ic">🏠</div><h3>Criar sala</h3><p>Seu PC vira o host. Os amigos entram no seu HQ e jogam as sprints da sua empresa.</p>
            <button class="btn primary big" data-nav="create">${busy === 'create' ? 'Criando...' : `${icon('plus', 18)} Criar sala`}</button></div>
          <div class="ocard"><div class="oc-ic">🔑</div><h3>Entrar numa sala</h3><p>Digite o código de 4 letras que o host te passou.</p>
            <input id="room-code" maxlength="4" placeholder="ABCD" value="${esc(typed)}" autocomplete="off" spellcheck="false">
            <button class="btn blue big" data-nav="join">${busy === 'join' ? 'Entrando...' : `${icon('door', 18)} Entrar`}</button></div>
        </div>
        <p class="hint">Pela internet: rode <code>ngrok http 5199</code> e mande o link.</p>`;
    }
    const foot = role === 'host' ? `<button class="btn danger" data-nav="leave">${icon('close', 18)} Fechar sala</button>`
      : role === 'client' ? `<button class="btn danger" data-nav="leave">${icon('exit', 18)} Sair da sala</button>` : '';
    this.show('room', frame({
      icon: 'globe', title: role === 'local' ? 'Jogar online' : 'Sala online',
      body: body + (error ? `<div class="err">⚠️ ${esc(error)}</div>` : ''), foot,
    }), { focus: busy === 'join' ? 2 : 1 });
    const input = this.el.querySelector('#room-code');
    if (input) {
      input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.onAction?.('join');
        if (e.key === 'Escape') input.blur();
        e.stopPropagation();
      });
    }
    this.link = link;
  }
  get roomCode() { return this.el.querySelector('#room-code')?.value.trim() || ''; }

  // =================================================================
  // Ajustes
  // =================================================================
  settings({ muted, profile, code, showCode, msg = '' }) {
    this.show('settings', frame({
      icon: 'gear', title: 'Ajustes',
      body: `
        <div class="set-row"><div><b>Som</b><small>Atalho: M</small></div><button class="btn" data-nav="sound">${muted ? `${icon('mute', 18)} Desligado` : `${icon('volume', 18)} Ligado`}</button></div>
        ${profile ? `<div class="set-row"><div><b>Nome de dev</b><small>Aparece pros outros jogadores</small></div>
          <div class="row"><input id="s-name" maxlength="20" value="${esc(profile.name)}"><button class="btn" data-nav="rename">Salvar</button></div></div>
        <div class="set-row"><div><b>Seu histórico</b><small>${profile.stats.games} sprints · 🏆 ${profile.stats.best} pts · ⭐ ${profile.stats.stars} · ✨ ${profile.xp} XP</small></div></div>
        <div class="set-row"><div><b>Código da conta</b><small>Continue em outro navegador. Não compartilhe!</small></div>
          ${showCode ? `<button class="btn" data-nav="copycode">${icon('copy', 18)} Copiar</button>` : `<button class="btn" data-nav="showcode">${icon('key', 18)} Mostrar</button>`}</div>
        ${showCode ? `<code class="acct">${esc(code)}</code>` : ''}` : ''}
        ${msg ? `<div class="toast-in">${msg}</div>` : ''}
        <div class="set-row"><div><b>Tela de abertura</b><small>Volta pro logo do jogo</small></div><button class="btn" data-nav="splash">${icon('exit', 18)} Ir</button></div>`,
    }));
    this.el.querySelector('#s-name')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.onAction?.('rename'); e.stopPropagation(); });
  }

  // =================================================================
  // Ajuda
  // =================================================================
  help() {
    const kb = Object.values(KB_SCHEMES).map((s) => `<tr><td>⌨️ ${s.name}</td><td><kbd>${s.hint[0]}</kbd></td><td><kbd>${s.hint[1]}</kbd></td><td><kbd>${s.hint[2]}</kbd></td><td><kbd>${s.hint[3]}</kbd></td><td><kbd>${s.hint[4]}</kbd></td></tr>`).join('');
    const chaos = [
      ['🤖', 'Agente de IA', 'Codifica sozinho e rápido, mas às vezes deixa bug escondido.'],
      ['❌', 'Testes falham', 'O ticket ganha 🔧 Corrigir + 15s de prazo. Conserte e teste de novo.'],
      ['📝', 'Changes requested', 'O review pode devolver o ticket com um "nit" (+15s de prazo).'],
      ['⚔️', 'Conflito de merge', 'Segure Trabalhar no Merge (+15s). Evite merges colados!'],
      ['🚨', 'Bug em produção', 'Bug que escapou vira Hotfix. Pontos escorrem até resolver.'],
      ['📶', 'Wi-Fi caiu', 'IA e testes param. Reinicie o roteador.'],
      ['💥', 'IA alucinando', 'Segure Trabalhar no agente para reiniciar.'],
      ['📅', 'Reunião surpresa', 'Um dev fica preso. O time cobre — ou ele toma um café e sai!'],
    ].map(([i, t, d]) => `<div class="chaos"><div class="ch-i">${i}</div><div><b>${t}</b><p>${d}</p></div></div>`).join('');
    this.show('help', frame({
      icon: 'book', title: 'Como jogar', cls: 'wide',
      body: `<div class="howto-grid">
        <section>
          <h3>1 · O fluxo de um ticket</h3>
          <div class="flow">
            <div class="fs"><i>📋</i><b>Backlog</b><small>pegue</small></div><span>›</span>
            <div class="fs"><i>💻</i><b>Implementar</b><small>segure trabalhar</small></div><span>›</span>
            <div class="fs"><i>🧪</i><b>Testes</b><small>automático</small></div><span>›</span>
            <div class="fs"><i>👀</i><b>Review</b><small>outro dev</small></div><span>›</span>
            <div class="fs"><i>🔀</i><b>Merge</b><small>entregue!</small></div>
          </div>
          <div class="types">
            <span class="tp t-bug">🐞 Bug <small>sem review</small></span>
            <span class="tp t-feature">✨ Feature</span>
            <span class="tp t-project">🚀 Projeto <small>longo</small></span>
            <span class="tp t-hotfix">🚨 Hotfix <small>urgente!</small></span>
          </div>
          <h3>2 · A empresa</h3>
          <ul class="tips">
            <li>💰 Toda sprint vira receita: pontos + bônus por estrela. Sprints mais difíceis pagam mais.</li>
            <li>🟨 <b>Placas de compra</b>: pise numa placa amarela e aperte <b>Comprar</b> (<kbd>F</kbd> / <kbd>P</kbd> / <kbd>Num3</kbd> / <kbd>Y</kbd> no controle). Upgrade de estação dá pra comprar de frente pra ela ([F] Upgrade no prompt), sem Andar até a placa. Dá pra comprar até no meio da sprint com o dinheiro que está entrando.</li>
            <li>📈 A receita acumulada sobe a empresa de estágio: 🏚️ → 🚀 → 📈 → 🦄 → 🏢. Cada estágio libera placas novas — e sprints mais caóticas que pagam mais.</li>
          </ul>
          <h3>3 · Dicas de time</h3>
          <ul class="tips">
            <li>👯 <b>Pair programming</b>: 2 devs na mesma mesa = mais rápido e <b>sem bugs</b>.</li>
            <li>🙅 Ninguém revisa o próprio código. Combinem quem revisa!</li>
            <li>🔥 <b>Combo</b>: entregas seguidas multiplicam os pontos até <b>x3</b>. 3 seguidas chamam o estagiário de graça!</li>
            <li>🗑️ <b>Won't fix</b>: descartar custa pontos, mas <b>não</b> quebra o combo. Triagem é jogada válida.</li>
            <li>☕ Café deixa você mais rápido — e <b>tira da reunião</b>.</li>
          </ul>
        </section>
        <section>
          <h3>Controles</h3>
          <table class="ctrl"><tr><th></th><th>Mover</th><th>Pegar</th><th>Trabalhar</th><th>Dash</th><th>Comprar</th></tr>${kb}
            <tr><td>🎮 Controle</td><td><kbd>${PAD_HINT[0]}</kbd></td><td><kbd>${PAD_HINT[1]}</kbd></td><td><kbd>${PAD_HINT[2]}</kbd></td><td><kbd>${PAD_HINT[3]}</kbd></td><td><kbd>${PAD_HINT[4]}</kbd></td></tr>
            <tr><td>🖱️ Mouse</td><td><kbd>${MOUSE_HINT[0]}</kbd></td><td><kbd>${MOUSE_HINT[1]}</kbd></td><td><kbd>${MOUSE_HINT[2]}</kbd></td><td><kbd>${MOUSE_HINT[3]}</kbd></td><td><kbd>segurar</kbd></td></tr></table>
          <h3>O caos</h3>
          <div class="chaos-grid">${chaos}</div>
        </section>
      </div>`,
    }));
  }

  // =================================================================
  // Pausa
  // =================================================================
  pause({ remote }) {
    if (remote) {
      this.show('pause', `<div class="modal"><div class="m-title">${icon('pause', 30)} O host pausou</div><p>Hora do cafezinho ☕</p></div>`, { keyNav: false });
      return;
    }
    this.show('pause', `
      <div class="modal">
        <div class="m-title">${icon('pause', 30)} Pausado</div>
        <p>Parece aquela call que ninguém liga a câmera.</p>
        <div class="menu">
          <button class="btn primary big" data-nav="resume">${icon('play', 18)} Continuar</button>
          <button class="btn big" data-nav="restart">${icon('restart', 18)} Reiniciar sprint</button>
          <button class="btn big ghost" data-nav="quit">${icon('flag', 18)} Desistir <small>volta ao HQ, sem receita</small></button>
        </div>
      </div>`);
  }

  // =================================================================
  // Resultado em 3 passos: desempenho → empresa → time
  // =================================================================
  results(r, { role, step = 1 }) {
    this.res = { r, role, step };
    const dots = ['Desempenho', 'Empresa', 'Time'].map((t, i) => `<span class="${i + 1 <= step ? 'on' : ''}"><i></i>${t}</span>`).join('');
    const next = `<button class="btn primary big" data-nav="next">Continuar ${icon('play', 16)}</button>`;
    let body = '', foot = '';

    if (step === 1) {
      const stars = [1, 2, 3].map((i) => `<span class="star ${r.stars >= i ? 'on' : ''}" style="--d:${0.3 + i * 0.35}s">★</span>`).join('');
      body = `<div class="r-kicker">SPRINT ENCERRADA${r.levelName ? ` · ${r.levelName.split(' — ')[0]}` : ''}</div>
        <div class="r-head">${r.headline}</div>
        <div class="stars2">${stars}</div>
        <div class="r-score"><span class="count">0</span><small>pontos</small></div>
        <div class="r-line"><span>✅ ${r.delivered} entregues</span><span>❌ ${r.failed} perdidos</span><span>🗑️ ${r.trashed} won't fix</span>${r.combo >= 2 ? `<span>🔥 ${r.combo} seguidas</span>` : ''}</div>`;
      foot = next;
    } else if (step === 2) {
      const e = r.economy;
      if (!e) {
        body = '<div class="r-kicker">RECEITA DA SPRINT</div><div class="r-wait">💾 Registrando no servidor...</div>';
        foot = '<button class="btn big" disabled>Aguarde...</button>';
      } else if (e.error) {
        body = `<div class="r-kicker">RECEITA DA SPRINT</div><div class="err">⚠️ ${esc(e.error)}</div>`;
        foot = next;
      } else {
        const c = e.company;
        body = `<div class="r-kicker">RECEITA DA SPRINT</div>
          <div class="r-money"><span>💰 +<b class="count">${fmtMoney(0)}</b></span><small>para ${esc(c.name)} · caixa agora ${fmtMoney(c.cash)}</small></div>
          ${stageBar(c, c.valuation - e.payout)}
          ${e.stageUp != null ? `<div class="r-stageup">🎉 A empresa virou <b>${STAGES[e.stageUp].icon} ${STAGES[e.stageUp].name}</b>! Melhorias novas liberadas.</div>` : ''}
          ${e.record ? `<div class="r-rec new">🏆 NOVO RECORDE DA SPRINT!<small>${e.prevBest > 0 ? `superou ${e.prevBest} pts` : 'primeira vez nesta sprint'}</small></div>` : ''}
          ${e.xp ? `<div class="r-xp">✨ +${e.xp} XP pra cada dev do time</div>` : ''}
          ${e.tease ? `<div class="r-tease">${e.tease}</div>` : ''}`;
        foot = next;
      }
    } else {
      const cards = r.players.map((p, i) => `
        <div class="pcard" style="--c:${p.color};--d:${0.1 + i * 0.12}s">
          <div class="pc-name">${p.name}</div>
          <div class="pc-title">${p.title}</div>
          <div class="pc-stats"><span>💻 ${p.stats.coded}</span><span>👀 ${p.stats.reviewed}</span><span>🔧 ${p.stats.fixed}</span><span>🔌 ${p.stats.repairs}</span><span>🔀 ${p.stats.delivered}</span><span>☕ ${p.stats.coffee}</span></div>
        </div>`).join('');
      body = `<div class="r-kicker">PRÊMIOS DO TIME</div><div class="r-cards">${cards}</div>`;
      foot = role === 'client'
        ? `<div class="foot-msg">⏳ Aguardando o host</div><button class="btn danger" data-nav="leave">${icon('exit', 18)} Sair da sala</button>`
        : `<button class="btn big" data-nav="again">${icon('restart', 18)} Jogar de novo</button><button class="btn primary big" data-nav="hq">${icon('building', 18)} Voltar ao HQ</button>`;
    }

    this.show('results', `<div class="results3"><div class="r-dots">${dots}</div><div class="r-body">${body}</div><div class="pnl-foot">${foot}</div>${PROMPTS}</div>`,
      { focus: step === 3 && role !== 'client' ? 1 : 0 });

    // animações de contagem
    const el = this.el.querySelector('.count');
    const target = step === 1 ? r.score : step === 2 ? r.economy?.payout : null;
    if (el && target != null) {
      const t0 = performance.now(), dur = step === 1 ? 1300 : 1100;
      this.countTimer = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        const v = Math.round(target * (1 - Math.pow(1 - k, 3)));
        el.textContent = step === 2 ? fmtMoney(v) : v;
        if (k < 1 && Math.random() < 0.5) sfx.play('count');
        if (k >= 1) { clearInterval(this.countTimer); if (step === 2) sfx.play('deliver'); }
      }, 40);
    }
    if (step === 1) [1, 2, 3].forEach((i) => { if (r.stars >= i) setTimeout(() => sfx.play('star'), (0.3 + i * 0.35) * 1000); });
    if (step === 2 && r.economy?.stageUp != null) setTimeout(() => sfx.play('combo', 5), 900);
  }

  // o dinheiro chegou do servidor enquanto o passo 2 esperava
  resultsEconomyArrived() {
    if (this.name === 'results' && this.res?.step === 2) this.results(this.res.r, this.res);
  }
}
