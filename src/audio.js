// Efeitos sonoros sintetizados com WebAudio (sem arquivos).
class Sfx {
  constructor() { this.ctx = null; this.master = null; this.muted = false; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }
  tone(freq, dur = 0.1, type = 'square', vol = 0.3, slide = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur = 0.05, vol = 0.15, hp = 2000) {
    if (!this.ctx || this.muted) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }
  play(name, a = 0) {
    switch (name) {
      case 'pick': this.tone(520, 0.07, 'triangle', 0.3, 200); break;
      case 'place': this.tone(380, 0.08, 'triangle', 0.3, -120); break;
      case 'type': this.noise(0.025, 0.08, 3000); break;
      case 'step': this.tone(660, 0.08, 'square', 0.12); this.tone(990, 0.12, 'square', 0.12, 0, 0.07); break;
      case 'deliver': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, 'square', 0.14, 0, i * 0.07)); break;
      case 'fail': this.tone(220, 0.35, 'sawtooth', 0.2, -140); break;
      case 'error': this.tone(140, 0.12, 'square', 0.18); break;
      case 'order': this.tone(880, 0.06, 'sine', 0.25); this.tone(1320, 0.1, 'sine', 0.2, 0, 0.06); break;
      case 'tick': this.tone(700, 0.08, 'square', 0.18); break;
      case 'go': this.tone(1046, 0.35, 'square', 0.2); break;
      case 'dash': this.noise(0.12, 0.12, 800); break;
      case 'join': this.tone(440, 0.08, 'triangle', 0.3); this.tone(880, 0.12, 'triangle', 0.3, 0, 0.08); break;
      case 'coffee': [300, 360, 420].forEach((f, i) => this.tone(f, 0.1, 'sine', 0.25, 60, i * 0.05)); break;
      case 'end': [784, 659, 523, 392].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.25, 0, i * 0.12)); break;
      case 'alarm': for (let i = 0; i < 4; i++) { this.tone(660, 0.22, 'sawtooth', 0.16, 300, i * 0.44); this.tone(960, 0.22, 'sawtooth', 0.16, -300, i * 0.44 + 0.22); } break;
      case 'testfail': this.tone(300, 0.12, 'square', 0.18); this.tone(200, 0.3, 'square', 0.18, -60, 0.12); break;
      case 'conflict': [0, 0.09, 0.18].forEach((d) => this.tone(180, 0.07, 'square', 0.2, 0, d)); this.noise(0.25, 0.1, 400); break;
      case 'robot': [880, 660, 990, 550].forEach((f, i) => this.tone(f, 0.06, 'square', 0.1, 0, i * 0.06)); break;
      case 'glitch': for (let i = 0; i < 6; i++) this.tone(200 + Math.random() * 1200, 0.05, 'sawtooth', 0.12, 0, i * 0.05); break;
      case 'wifi': this.tone(1200, 0.5, 'sine', 0.2, -1000); break;
      case 'meeting': [523, 659, 523].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.22, 0, i * 0.2)); break;
      case 'nav': this.tone(880, 0.04, 'triangle', 0.12); break;
      case 'select': this.tone(660, 0.06, 'triangle', 0.2); this.tone(990, 0.1, 'triangle', 0.2, 0, 0.05); break;
      case 'back': this.tone(520, 0.08, 'triangle', 0.18, -200); break;
      case 'star': this.tone(1046, 0.12, 'square', 0.14); this.tone(1568, 0.2, 'square', 0.12, 0, 0.08); break;
      case 'count': this.tone(1200, 0.05, 'square', 0.12); break;
      case 'fixed': this.tone(440, 0.08, 'triangle', 0.25); this.tone(660, 0.08, 'triangle', 0.25, 0, 0.08); this.tone(880, 0.14, 'triangle', 0.25, 0, 0.16); break;
      // fanfarra de combo: sobe o tom conforme o multiplicador (a)
      case 'combo': {
        const f = 587 + Math.min(4, Math.max(0, (a || 1) - 1)) * 110;
        [1, 1.26, 1.5, 1.89].forEach((r, i) => this.tone(f * r, 0.1, 'square', 0.15, 0, i * 0.055));
        break;
      }
      case 'combocool': this.tone(420, 0.16, 'sine', 0.14, -160); break;
    }
  }
}
export const sfx = new Sfx();
