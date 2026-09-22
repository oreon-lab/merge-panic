// Entrada unificada: até 3 esquemas de teclado + gamepads.
export const KB_SCHEMES = {
  kbA: { name: 'Teclado 1', up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], pick: ['KeyE'], use: ['KeyQ'], dash: ['ShiftLeft'],
         hint: ['WASD', 'E', 'Q', 'Shift'] },
  kbB: { name: 'Teclado 2', up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], pick: ['KeyO'], use: ['KeyU'], dash: ['KeyH'],
         hint: ['IJKL', 'O', 'U', 'H'] },
  kbC: { name: 'Teclado 3', up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
         pick: ['ShiftRight', 'Numpad1', 'Period'], use: ['ControlRight', 'Numpad2', 'Comma'], dash: ['Numpad0', 'Slash'],
         hint: ['Setas', 'Shift dir.', 'Ctrl dir.', 'Num0'] },
};
export const PAD_HINT = ['Analógico', 'A', 'X', 'B'];

const EMPTY = { mx: 0, my: 0, pick: false, use: false, usePressed: false, dash: false, start: false };
const BLOCK = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.states = {};
    this.prevPad = {};
    this.global = new Set();
    this.menu = {};
    this.listeners = [];
    window.addEventListener('keydown', (e) => {
      if (e.target?.tagName === 'INPUT') return;
      if (BLOCK.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      this.listeners.forEach((f) => f());
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('visibilitychange', () => this.down.clear());
    window.addEventListener('pointerdown', () => this.listeners.forEach((f) => f()));
  }
  onAnyInput(f) { this.listeners.push(f); }

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
        start: false,
      };
    }
    // navegação de menus (qualquer dispositivo)
    const P = this.pressed;
    const m = {
      up: any(['ArrowUp', 'KeyW', 'KeyI'], P), down: any(['ArrowDown', 'KeyS', 'KeyK'], P),
      left: any(['ArrowLeft', 'KeyA', 'KeyJ'], P), right: any(['ArrowRight', 'KeyD', 'KeyL'], P),
      confirm: any(['Enter', 'NumpadEnter', 'Space', 'KeyE', 'KeyO'], P), back: any(['Escape', 'Backspace'], P),
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
      this.prevPad[id] = { btn: now, dir };
    }
    this.menu = m;
    this.global = new Set([...this.pressed].filter((c) => ['Space', 'Enter', 'NumpadEnter', 'Escape', 'KeyR', 'KeyM'].includes(c)));
    this.pressed.clear();
  }
  get(id) { return this.states[id] || EMPTY; }
  devices() { return Object.keys(this.states); }
  globalPressed(code) { return this.global.has(code); }
  anyStart() {
    return this.global.has('Space') || this.global.has('Enter') || this.global.has('NumpadEnter') ||
      Object.values(this.states).some((s) => s.start);
  }
  // rótulos das teclas de um dispositivo: [mover, pegar, usar, dash]
  hint(device) { return device?.startsWith('gp') ? PAD_HINT : KB_SCHEMES[device]?.hint || PAD_HINT; }
}
