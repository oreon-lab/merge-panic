// Entrada unificada: até 3 esquemas de teclado + gamepads + mouse de uma mão.
import * as THREE from 'three';

export const KB_SCHEMES = {
  kbA: { name: 'Teclado 1', up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], pick: ['KeyE'], use: ['KeyQ'], dash: ['ShiftLeft'], buy: ['KeyF'],
         hint: ['WASD', 'E', 'Q', 'Shift', 'F'] },
  kbB: { name: 'Teclado 2', up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], pick: ['KeyO'], use: ['KeyU'], dash: ['KeyH'], buy: ['KeyP'],
         hint: ['IJKL', 'O', 'U', 'H', 'P'] },
  kbC: { name: 'Teclado 3', up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
         pick: ['ShiftRight', 'Numpad1', 'Period'], use: ['ControlRight', 'Numpad2', 'Comma'], dash: ['Numpad0', 'Slash'], buy: ['Numpad3', 'Semicolon'],
         hint: ['Setas', 'Shift dir.', 'Ctrl dir.', 'Num0', 'Num3'] },
};
export const PAD_HINT = ['Analógico', 'A', 'X', 'B', 'Y'];
export const MOUSE_HINT = ['Clique', 'Dir.', 'Esq.', 'Meio', 'Esq.'];

const EMPTY = { mx: 0, my: 0, pick: false, use: false, usePressed: false, dash: false, buy: false, start: false };
const BLOCK = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);
const CHAO = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // plano do piso, pro clique virar destino

export class Input {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.states = {};
    this.prevPad = {};
    this.global = new Set();
    this.menu = {};
    this.listeners = [];
    // mouse: destino no chão sob o cursor + botões
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.hit = new THREE.Vector3();
    this.aim = null;
    this.pt = { x: 0, y: 0, inside: false, left: false, right: false, middle: false, leftHit: false, rightHit: false, middleHit: false };

    window.addEventListener('keydown', (e) => {
      if (e.target?.tagName === 'INPUT') return;
      if (BLOCK.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      this.listeners.forEach((f) => f());
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this.releaseAll(); });
    document.addEventListener('visibilitychange', () => { this.down.clear(); this.releaseAll(); });
    window.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', () => this.releaseAll());
    canvas?.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas?.addEventListener('pointerleave', () => { this.pt.inside = false; });
  }
  onAnyInput(f) { this.listeners.push(f); }

  releaseAll() {
    const p = this.pt;
    p.left = p.right = p.middle = false;
    this.aim = null;
  }
  onMove(e) {
    this.pt.x = e.clientX; this.pt.y = e.clientY;
    this.pt.inside = true;
    if (!this.pt.left) this.refreshAim();
  }
  onDown(e) {
    this.pt.x = e.clientX; this.pt.y = e.clientY;
    this.pt.inside = true;
    // cliques na interface (menus, lobby) não são comando de jogo
    if (e.target === this.canvas) {
      if (e.button === 0) { this.pt.left = true; this.pt.leftHit = true; }
      if (e.button === 1) { this.pt.middle = true; this.pt.middleHit = true; e.preventDefault(); }
      if (e.button === 2) { this.pt.right = true; this.pt.rightHit = true; }
    }
    this.refreshAim();
    this.listeners.forEach((f) => f());
  }
  onUp(e) {
    if (e.button === 0) this.pt.left = false;
    if (e.button === 1) this.pt.middle = false;
    if (e.button === 2) this.pt.right = false;
    this.refreshAim();
  }

  // O destino é travado no evento do ponteiro, não a cada frame: a câmera segue
  // o jogador, então o mesmo pixel de tela apontaria pra outro lugar do mundo e
  // o personagem perseguiria um alvo que foge.
  refreshAim() {
    this.aim = this.pt.left && this.pt.inside ? this.computeAim() : null;
  }

  // onde o cursor aponta no piso (y = 0); null se estiver fora do canvas
  computeAim() {
    const { camera, canvas } = this;
    if (!camera || !canvas) return null;
    const r = canvas.getBoundingClientRect();
    this.ndc.set(((this.pt.x - r.left) / r.width) * 2 - 1, -((this.pt.y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, camera);
    return this.ray.ray.intersectPlane(CHAO, this.hit) ? { x: this.hit.x, z: this.hit.z } : null;
  }

  update() {
    const any = (codes, set) => codes.some((c) => set.has(c));
    for (const [id, s] of Object.entries(KB_SCHEMES)) {
      this.states[id] = {
        mx: (any(s.right, this.down) ? 1 : 0) - (any(s.left, this.down) ? 1 : 0),
        my: (any(s.up, this.down) ? 1 : 0) - (any(s.down, this.down) ? 1 : 0),
        pick: any(s.pick, this.pressed),
        use: any(s.use, this.down),
        usePressed: any(s.use, this.pressed),
        dash: any(s.dash, this.pressed),
        buy: any(s.buy, this.pressed),
        start: false,
      };
    }
    // navegação de menus (qualquer dispositivo)
    const P = this.pressed;
    const m = {
      up: any(['ArrowUp', 'KeyW', 'KeyI'], P), down: any(['ArrowDown', 'KeyS', 'KeyK'], P),
      left: any(['ArrowLeft', 'KeyA', 'KeyJ'], P), right: any(['ArrowRight', 'KeyD', 'KeyL'], P),
      confirm: any(['Enter', 'NumpadEnter', 'Space', 'KeyE', 'KeyO'], P), back: any(['Escape', 'Backspace'], P),
      tab: P.has('Tab'), any: P.size > 0,
    };

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const id = 'gp' + pad.index;
      const b = (i) => !!pad.buttons[i]?.pressed;
      const prev = this.prevPad[id] || { btn: [], dir: '' };
      const now = pad.buttons.map((x) => x.pressed);
      const edge = (i) => now[i] && !prev.btn[i];
      let mx = pad.axes[0] || 0, my = -(pad.axes[1] || 0);
      if (Math.hypot(mx, my) < 0.25) { mx = 0; my = 0; }
      if (b(12)) my = 1; if (b(13)) my = -1; if (b(14)) mx = -1; if (b(15)) mx = 1;
      this.states[id] = {
        mx, my,
        pick: edge(0),
        use: b(2),
        usePressed: edge(2),
        dash: edge(1) || edge(5),
        buy: edge(3),
        start: edge(9),
      };
      // direção "digital" do analógico para menus
      const dir = my > 0.6 ? 'u' : my < -0.6 ? 'd' : mx < -0.6 ? 'l' : mx > 0.6 ? 'r' : '';
      if (dir && dir !== prev.dir) {
        if (dir === 'u') m.up = true; if (dir === 'd') m.down = true;
        if (dir === 'l') m.left = true; if (dir === 'r') m.right = true;
      }
      if (edge(0) || edge(9)) m.confirm = true;
      if (edge(1)) m.back = true;
      if (edge(8)) m.tab = true;   // Select abre o menu do HQ
      if (now.some((v, i) => v && !prev.btn[i])) m.any = true;
      this.prevPad[id] = { btn: now, dir };
    }
    // mouse de uma mão: segure o esquerdo pra andar até o destino travado no
    // clique (e trabalhar se parar numa estação); direito pega/solta; meio dash.
    this.states.mouse = {
      mx: 0, my: 0,
      aim: this.aim,
      pick: this.pt.rightHit,
      use: this.pt.left,
      usePressed: this.pt.leftHit,
      dash: this.pt.middleHit,
      buy: false, // no mouse de uma mão, compra segurando o esquerdo em cima da placa
      start: false,
    };
    if (this.pt.leftHit || this.pt.rightHit) m.any = true;
    this.pt.leftHit = this.pt.rightHit = this.pt.middleHit = false;

    this.menu = m;
    this.global = new Set([...this.pressed].filter((c) => ['Space', 'Enter', 'NumpadEnter', 'Escape', 'KeyR', 'KeyM', 'BracketLeft', 'BracketRight'].includes(c)));
    this.pressed.clear();
  }
  get(id) { return this.states[id] || EMPTY; }
  // entrada 'vazia': jogadores parados enquanto um menu está aberto
  get locked() { return this._locked ||= { get: () => EMPTY, hint: (d) => this.hint(d), devices: () => [] }; }
  devices() { return Object.keys(this.states); }
  globalPressed(code) { return this.global.has(code); }
  anyStart() {
    return this.global.has('Space') || this.global.has('Enter') || this.global.has('NumpadEnter') ||
      Object.values(this.states).some((s) => s.start);
  }
  // rótulos das teclas de um dispositivo: [mover, pegar, usar, dash]
  hint(device) {
    if (device === 'mouse') return MOUSE_HINT;
    return device?.startsWith('gp') ? PAD_HINT : KB_SCHEMES[device]?.hint || PAD_HINT;
  }
}
export const DEVICE_LABEL = (device) => (device === 'mouse' ? '🖱️ Mouse (uma mão)'
  : device?.startsWith('gp') ? `🎮 Controle ${+device.slice(2) + 1}`
  : `⌨️ ${KB_SCHEMES[device]?.name || device}`);
