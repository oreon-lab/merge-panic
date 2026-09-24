// Construtores procedurais de modelos 3D (sem assets externos).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const COUNTER_H = 0.72;

const matCache = new Map();
const outlineMat = new THREE.MeshBasicMaterial({ color: '#16142b', side: THREE.BackSide, toneMapped: false });
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.04, ...opts }));
  }
  return matCache.get(key);
}

export function rbox(w, h, d, r = 0.04, seg = 3) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));
}

export function mesh(geo, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function addOutline(part) {
  if (part.userData.outline) return;
  part.geometry.computeBoundingSphere();
  if ((part.geometry.boundingSphere?.radius || 0) < 0.055) return;
  const shell = new THREE.Mesh(part.geometry, outlineMat);
  shell.userData.outline = true;
  shell.scale.setScalar(1.035);
  shell.castShadow = false;
  shell.receiveShadow = false;
  part.add(shell);
}

// ---------- Texturas em canvas ----------
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const SYNTAX = ['#ff7eb6', '#7ee0ff', '#ffd166', '#a0e57a', '#c3a6ff', '#e8e8f0'];
let codeTexBase = null;
export function codeTexture() {
  if (!codeTexBase) {
    codeTexBase = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#1b1f2e'; g.fillRect(0, 0, w, h);
      let y = 8;
      while (y < h - 8) {
        let x = 10 + Math.floor(Math.random() * 4) * 14;
        const n = 1 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
          const len = 14 + Math.random() * 60;
          g.fillStyle = SYNTAX[Math.floor(Math.random() * SYNTAX.length)];
          g.fillRect(x, y, len, 7);
          x += len + 7;
          if (x > w - 20) break;
        }
        y += 13 + (Math.random() < 0.15 ? 10 : 0);
      }
    });
    codeTexBase.wrapT = THREE.RepeatWrapping;
  }
  const t = codeTexBase.clone();
  t.repeat.set(1, 0.4);
  t.needsUpdate = true;
  return t;
}

let diffTex = null;
function diffTexture() {
  if (!diffTex) {
    diffTex = canvasTex(256, 160, (g, w, h) => {
      g.fillStyle = '#1b1f2e'; g.fillRect(0, 0, w, h);
      for (let y = 8; y < h - 6; y += 12) {
        const r = Math.random();
        g.fillStyle = r < 0.25 ? '#5a2330' : r < 0.5 ? '#1f4a33' : '#1b1f2e';
        g.fillRect(0, y - 2, w, 11);
        g.fillStyle = r < 0.25 ? '#ff6b81' : r < 0.5 ? '#6ee7a0' : '#9aa3c0';
        g.fillRect(8, y, 20 + Math.random() * 160, 6);
      }
    });
  }
  return diffTex;
}

export function labelTexture(text, bg, fg, w = 256, h = 96, font = 44) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = `700 ${font}px Fredoka, Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * font * 1.05));
  });
}

// tier 0: carpete bege · 1: taco de madeira · 2: porcelanato polido
export function floorTexture(tier = 0) {
  const t = canvasTex(256, 256, (g) => {
    if (tier === 1) {
      for (let row = 0; row < 8; row++) {
        const off = (row % 2) * 64;
        for (let i = -1; i < 3; i++) {
          g.fillStyle = ['#b98352', '#a8733f', '#c48f5c'][(row + i + 3) % 3];
          g.fillRect(i * 128 + off, row * 32, 128, 32);
          g.strokeStyle = 'rgba(60,30,10,0.35)'; g.lineWidth = 2;
          g.strokeRect(i * 128 + off, row * 32, 128, 32);
        }
      }
      return;
    }
    const cols = tier === 2 ? ['#eef3f6', '#dfe8ee'] : ['#f0c49a', '#e8b384'];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = cols[(i + j) % 2];
      g.fillRect(i * 128, j * 128, 128, 128);
      // ruído sutil de carpete
      for (let k = 0; k < (tier === 2 ? 60 : 500); k++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
        g.fillRect(i * 128 + Math.random() * 128, j * 128 + Math.random() * 128, 2, 2);
      }
      g.strokeStyle = tier === 2 ? 'rgba(90,120,140,0.25)' : 'rgba(150,90,50,0.35)'; g.lineWidth = 3;
      g.strokeRect(i * 128 + 1, j * 128 + 1, 126, 126);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- Peças do cenário ----------
function counterBase(bodyColor = '#a86b43', topColor = '#f1ede4') {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.98, COUNTER_H - 0.06, 0.94, 0.05), mat(bodyColor), 0, (COUNTER_H - 0.06) / 2, 0));
  g.add(mesh(rbox(1.0, 0.07, 0.98, 0.025), mat(topColor), 0, COUNTER_H - 0.035, 0));
  // rodapé escuro
  g.add(mesh(rbox(0.9, 0.06, 0.86, 0.02), mat('#2c3246'), 0, 0.03, 0.0, false));
  return g;
}

function anchorAt(g, x, z) {
  const a = new THREE.Object3D();
  a.position.set(x, COUNTER_H, z);
  g.add(a);
  return a;
}

function monitor(g, x, z, w = 0.56, h = 0.36, screenMat) {
  const m = new THREE.Group();
  m.position.set(x, COUNTER_H, z);
  m.add(mesh(rbox(0.18, 0.02, 0.12, 0.01), mat('#2a2f3d'), 0, 0.01, 0));
  m.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8), mat('#2a2f3d'), 0, 0.11, 0));
  m.add(mesh(rbox(w, h, 0.05, 0.02), mat('#2a2f3d'), 0, 0.2 + h / 2, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.05, h - 0.05), screenMat);
  screen.position.set(0, 0.2 + h / 2, 0.027);
  m.add(screen);
  g.add(m);
  return m;
}

export function buildCounter() {
  const g = counterBase();
  return { group: g, anchor: anchorAt(g, 0, 0) };
}

export function buildDesk() {
  const g = counterBase('#4b5a78', '#f4efe6');
  const tex = codeTexture();
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  monitor(g, 0, -0.3, 0.62, 0.4, screenMat);
  // teclado e caneca
  g.add(mesh(rbox(0.36, 0.03, 0.12, 0.012), mat('#30364a'), -0.05, COUNTER_H + 0.015, -0.06));
  const mug = mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), mat(['#ff6b6b', '#ffd166', '#4ecdc4'][Math.floor(Math.random() * 3)]), 0.34, COUNTER_H + 0.05, -0.2);
  g.add(mug);
  // cadeira atrás não bloqueia: plantinha de mesa
  return { group: g, anchor: anchorAt(g, 0, 0.18), screenTex: tex };
}

export function buildBacklog() {
  const g = counterBase('#6b4f8a', '#f4efe6');
  // quadro kanban
  const board = new THREE.Group();
  board.position.set(0, COUNTER_H, -0.38);
  board.add(mesh(rbox(0.94, 0.72, 0.05, 0.02), mat('#fafafa'), 0, 0.5, 0));
  board.add(mesh(rbox(0.98, 0.04, 0.08, 0.01), mat('#9aa3b5'), 0, 0.14, 0.01));
  const colors = ['#ffd166', '#ff8fab', '#8ecae6', '#b8f2a0'];
  for (let c = 0; c < 3; c++) {
    board.add(mesh(new THREE.BoxGeometry(0.01, 0.6, 0.01), mat('#c7ccd8'), -0.155 + c * 0.31 - 0.155 + 0.155, 0.5, 0.03, false));
    for (let r = 0; r < 3 - c; r++) {
      const n = mesh(new THREE.BoxGeometry(0.12, 0.11, 0.01), mat(colors[(c + r) % 4]), -0.31 + c * 0.31 + (Math.random() - 0.5) * 0.06, 0.72 - r * 0.15, 0.035, false);
      n.rotation.z = (Math.random() - 0.5) * 0.25;
      board.add(n);
    }
  }
  g.add(board);
  // pilha de pastas
  for (let i = 0; i < 4; i++) {
    const f = mesh(rbox(0.42, 0.05, 0.3, 0.015), mat(['#ff4d5e', '#3d8bff', '#a35cff', '#3d8bff'][i]), 0, COUNTER_H + 0.03 + i * 0.05, 0.12);
    f.rotation.y = (Math.random() - 0.5) * 0.4;
    g.add(f);
  }
  return { group: g, anchor: anchorAt(g, 0, 0.12) };
}

export function buildTest() {
  const g = counterBase('#2f7d6d', '#eef0f3');
  const machine = new THREE.Group();
  machine.position.set(0, COUNTER_H, -0.26);
  machine.add(mesh(rbox(0.74, 0.5, 0.36, 0.06), mat('#dfe6ee'), 0, 0.25, 0));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.26), new THREE.MeshBasicMaterial({ map: labelTexture('CI ▶ TESTS', '#10261f', '#6ee7a0', 256, 128, 40), toneMapped: false }));
  scr.position.set(0, 0.27, 0.185);
  machine.add(scr);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#444', emissive: '#000', emissiveIntensity: 1.5 });
  const lamp = mesh(new THREE.SphereGeometry(0.08, 16, 12), lampMat, 0, 0.56, 0);
  machine.add(lamp);
  machine.add(mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.05, 16), mat('#3a4050'), 0, 0.51, 0));
  // tubos de ensaio
  for (let i = 0; i < 3; i++) {
    const tube = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), new THREE.MeshStandardMaterial({ color: ['#6ee7a0', '#7ee0ff', '#ff8fab'][i], transparent: true, opacity: 0.8, emissive: ['#1a5a3a', '#1a4a5a', '#5a1a2a'][i] }), 0.3, 0.1 + 0 * i, 0);
    tube.position.set(0.44, COUNTER_H + 0.1, -0.12 + i * 0.08);
    g.add(tube);
  }
  g.add(machine);
  return { group: g, anchor: anchorAt(g, -0.05, 0.2), lamp: lampMat };
}

export function buildReview() {
  const g = counterBase('#b5651d', '#f4efe6');
  const sm = new THREE.MeshBasicMaterial({ map: diffTexture(), toneMapped: false });
  const m1 = monitor(g, -0.24, -0.3, 0.44, 0.32, sm); m1.rotation.y = 0.25;
  const m2 = monitor(g, 0.24, -0.3, 0.44, 0.32, sm); m2.rotation.y = -0.25;
  // carimbo "LGTM"
  const stamp = new THREE.Group();
  stamp.position.set(0.36, COUNTER_H, 0.12);
  stamp.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 14), mat('#d62839'), 0, 0.02, 0));
  stamp.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 10), mat('#2a2f3d'), 0, 0.08, 0));
  stamp.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), mat('#2a2f3d'), 0, 0.13, 0));
  g.add(stamp);
  return { group: g, anchor: anchorAt(g, -0.08, 0.16) };
}

export function buildMerge() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.48, 0.52, COUNTER_H - 0.05, 28), mat('#1f2433'), 0, (COUNTER_H - 0.05) / 2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 28), mat('#3a4260'), 0, COUNTER_H - 0.025, 0));
  const glowMat = new THREE.MeshStandardMaterial({ color: '#3ef08a', emissive: '#22c46a', emissiveIntensity: 1.6 });
  const ring = mesh(new THREE.TorusGeometry(0.36, 0.035, 12, 40), glowMat, 0, COUNTER_H + 0.01, 0, false);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.33, 32), new THREE.MeshBasicMaterial({ color: '#8affc1', transparent: true, opacity: 0.35, toneMapped: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = COUNTER_H + 0.005;
  g.add(disc);
  // placa com ícone de merge
  const sign = new THREE.Group();
  sign.position.set(0, COUNTER_H, -0.42);
  sign.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), mat('#8a93a8'), 0, 0.35, 0));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.26), new THREE.MeshBasicMaterial({ map: labelTexture('⇄ MERGE', '#22c46a', '#ffffff', 256, 100, 52), toneMapped: false }));
  plate.position.set(0, 0.72, 0.03);
  sign.add(plate);
  sign.add(mesh(rbox(0.66, 0.3, 0.04, 0.02), mat('#1f2433'), 0, 0.72, 0));
  g.add(sign);
  return { group: g, anchor: anchorAt(g, 0, 0), ring, glow: glowMat, disc };
}

export function buildTrash() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.62, 20, 1, true), mat('#8b95a8', { side: THREE.DoubleSide }), 0, 0.31, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 20), mat('#5c6578'), 0, 0.01, 0));
  g.add(mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 24), mat('#5c6578'), 0, 0.62, 0).rotateX(Math.PI / 2));
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.14), new THREE.MeshBasicMaterial({ map: labelTexture("WON'T\nFIX", '#d62839', '#fff', 128, 64, 24), toneMapped: false }));
  lbl.position.set(0, 0.34, 0.285);
  g.add(lbl);
  // bolas de papel
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.IcosahedronGeometry(0.06, 0), mat('#f4efe6', { flatShading: true }), (Math.random() - 0.5) * 0.25, 0.56, (Math.random() - 0.5) * 0.25));
  return { group: g, anchor: anchorAt(g, 0, 0) };
}

export function buildCoffee() {
  const g = counterBase('#6d4c41', '#f4efe6');
  const m = new THREE.Group();
  m.position.set(0, COUNTER_H, -0.18);
  m.add(mesh(rbox(0.44, 0.52, 0.36, 0.05), mat('#2d2d33'), 0, 0.26, 0));
  m.add(mesh(rbox(0.36, 0.12, 0.3, 0.03), mat('#c0c4cc', { metalness: 0.6, roughness: 0.3 }), 0, 0.5, 0.0));
  m.add(mesh(rbox(0.3, 0.04, 0.12, 0.01), mat('#111'), 0, 0.2, 0.17));
  const lightMat = new THREE.MeshStandardMaterial({ color: '#ff6b35', emissive: '#ff6b35', emissiveIntensity: 1.2 });
  m.add(mesh(new THREE.SphereGeometry(0.025, 8, 8), lightMat, 0.14, 0.4, 0.18));
  m.add(mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.09, 12), mat('#ffffff'), 0, 0.1, 0.12));
  g.add(m);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.1), new THREE.MeshBasicMaterial({ map: labelTexture('☕ COFFEE', '#2d2d33', '#ffd166', 256, 80, 40), toneMapped: false }));
  lbl.position.set(0, COUNTER_H + 0.36, 0.005);
  g.add(lbl);
  return { group: g, anchor: anchorAt(g, 0, 0.22) };
}

export function buildPlant() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.36, 16), mat('#e07a5f'), 0, 0.18, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16), mat('#5b3a29'), 0, 0.35, 0));
  const leaf = mat('#3fa34d', { flatShading: true });
  const leaf2 = mat('#2d7d3a', { flatShading: true });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const l = mesh(new THREE.ConeGeometry(0.09, 0.6 + Math.random() * 0.3, 5), i % 2 ? leaf : leaf2, Math.cos(a) * 0.08, 0.62, Math.sin(a) * 0.08);
    l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(l);
  }
  return { group: g };
}

const POSTERS = [
  ['FUNCIONA NA\nMINHA MÁQUINA', '#ffd166', '#1b1f2e'],
  ['NÃO FAÇA DEPLOY\nNA SEXTA', '#ff6b6b', '#fff'],
  ['git push\n--force 🙈', '#1b1f2e', '#6ee7a0'],
  ['É SÓ UM\nCSS RAPIDINHO', '#8ecae6', '#1b1f2e'],
  ['TODO:\nfix later', '#c3a6ff', '#1b1f2e'],
];
export function buildWall(tall, poster = -1, wall = '#e9e3d7', trim = '#8f7f68') {
  const g = new THREE.Group();
  const h = tall ? 1.5 : 0.28;
  g.add(mesh(rbox(1.0, h, 1.0, 0.02), mat(tall ? wall : '#cfc7b8'), 0, h / 2, 0, tall));
  g.add(mesh(rbox(1.02, 0.07, 1.02, 0.02), mat(trim), 0, h, 0, false));
  if (tall && poster >= 0) {
    const [txt, bg, fg] = POSTERS[poster % POSTERS.length];
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.44), new THREE.MeshStandardMaterial({ map: labelTexture(txt, bg, fg, 256, 180, 30), roughness: 0.8 }));
    p.position.set(0, 0.85, 0.505);
    g.add(p);
  }
  return { group: g, height: h };
}

// ---------- Ticket (pasta) ----------
export const TYPE_COLORS = { bug: '#ff4d5e', feature: '#3d8bff', project: '#a35cff', hotfix: '#ff8c1a' };
export function buildTicketMesh(type) {
  const g = new THREE.Group();
  const c = TYPE_COLORS[type] || '#888';
  g.add(mesh(rbox(0.44, 0.05, 0.32, 0.018), mat(c), 0, 0.025, 0));
  g.add(mesh(rbox(0.14, 0.05, 0.06, 0.015), mat(c), -0.12, 0.025, -0.17));
  const paper = mesh(new THREE.BoxGeometry(0.36, 0.012, 0.26), mat('#fbfaf5'), 0.01, 0.056, 0.01);
  paper.rotation.y = 0.06;
  g.add(paper);
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.24 - i * 0.05, 0.004, 0.025), mat('#9aa3b5'), -0.02, 0.064, -0.07 + i * 0.06, false));
  return g;
}

// ---------- Personagem (dev chibi) ----------
function darken(hex, f = 0.75) {
  const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString();
}

export function buildDev({ hoodie, skin, hair, style, pants = '#34405c', accent }) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const skinM = mat(skin), hoodM = mat(hoodie), hoodD = mat(darken(hoodie)), hairM = mat(hair);

  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.085 * s, 0.3, 0); body.add(hip);
    hip.add(mesh(new THREE.CapsuleGeometry(0.068, 0.14, 4, 10), mat(pants), 0, -0.12, 0));
    hip.add(mesh(rbox(0.13, 0.08, 0.2, 0.035), mat('#f5f5f5'), 0, -0.255, 0.03));
    hip.add(mesh(rbox(0.135, 0.025, 0.205, 0.01), mat(accent || hoodie), 0, -0.285, 0.03, false));
    legs.push(hip);
  }
  const torso = new THREE.Group(); torso.position.y = 0.3; body.add(torso);
  torso.add(mesh(rbox(0.38, 0.34, 0.27, 0.11), hoodM, 0, 0.18, 0));
  torso.add(mesh(rbox(0.24, 0.11, 0.025, 0.04), hoodD, 0, 0.12, 0.137, false));
  torso.add(mesh(rbox(0.24, 0.045, 0.02, 0.012), mat(accent || hoodie), 0, 0.25, -0.137, false));
  for (const s of [-1, 1]) torso.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 5), mat('#f5f5f5'), 0.05 * s, 0.26, 0.14, false));
  const hood = mesh(new THREE.TorusGeometry(0.12, 0.05, 8, 16), hoodD, 0, 0.35, -0.06);
  hood.rotation.x = Math.PI / 2 - 0.3;
  torso.add(hood);

  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.215 * s, 0.31, 0); torso.add(sh);
    sh.add(mesh(new THREE.CapsuleGeometry(0.058, 0.13, 4, 8), hoodM, 0, -0.1, 0));
    sh.add(mesh(new THREE.CylinderGeometry(0.061, 0.061, 0.035, 10), hoodD, 0, -0.175, 0));
    sh.add(mesh(new THREE.SphereGeometry(0.058, 10, 8), skinM, 0, -0.21, 0));
    sh.rotation.z = 0.12 * s;
    arms.push(sh);
  }

  const head = new THREE.Group(); head.position.y = 0.6; torso.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.25, 24, 18), skinM, 0, 0, 0);
  skull.scale.set(1, 0.94, 0.95);
  head.add(skull);
  // orelhas
  for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.05, 8, 8), skinM, 0.245 * s, -0.01, 0));
  head.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), skinM, 0, -0.025, 0.238));
  // olhos
  const eyes = [];
  const eyeM = mat('#1b1b24', { roughness: 0.3 });
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(0.085 * s, 0.01, 0.215);
    e.add(mesh(new THREE.CapsuleGeometry(0.03, 0.03, 4, 10), eyeM, 0, 0, 0, false));
    e.add(mesh(new THREE.SphereGeometry(0.011, 6, 6), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }), 0.01 * s, 0.022, 0.025, false));
    head.add(e); eyes.push(e);
  }
  const brows = [];
  for (const s of [-1, 1]) {
    const b = mesh(rbox(0.08, 0.02, 0.02, 0.008), mat(darken(hair, 0.8)), 0.09 * s, 0.1, 0.225, false);
    head.add(b); brows.push(b);
  }
  const mouth = mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 12, Math.PI), mat('#6b2b2b'), 0, -0.075, 0.228, false);
  mouth.rotation.z = Math.PI;
  head.add(mouth);
  for (const s of [-1, 1]) {
    const bl = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: 0.45 }));
    bl.position.set(0.15 * s, -0.05, 0.2); bl.rotation.y = 0.55 * s;
    head.add(bl);
  }

  // cabelo / acessórios
  const cap = (r, col, thetaLen = Math.PI * 0.52) => {
    const m = mesh(new THREE.SphereGeometry(r, 22, 14, 0, Math.PI * 2, 0, thetaLen), col, 0, 0.02, -0.01);
    m.rotation.x = -0.28;
    return m;
  };
  if (style === 'short') {
    head.add(cap(0.262, hairM));
    const fringe = mesh(rbox(0.3, 0.08, 0.1, 0.04), hairM, 0.03, 0.17, 0.17); fringe.rotation.set(0.5, 0, -0.2);
    head.add(fringe);
    // headphones
    const band = mesh(new THREE.TorusGeometry(0.275, 0.022, 8, 24, Math.PI), mat('#2a2f3d'), 0, 0.02, 0, false);
    head.add(band);
    for (const s of [-1, 1]) {
      const cup = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14), mat(accent || hoodie), 0.27 * s, 0, 0);
      cup.rotation.z = Math.PI / 2; head.add(cup);
    }
  } else if (style === 'beanie') {
    head.add(cap(0.262, hairM, Math.PI * 0.6));
    const bm = mat(accent || '#ffd166');
    head.add(cap(0.272, bm, Math.PI * 0.4));
    const fold = mesh(new THREE.TorusGeometry(0.235, 0.035, 8, 24), bm, 0, 0.1, -0.04); fold.rotation.x = Math.PI / 2 - 0.28; head.add(fold);
    head.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), mat('#ffffff'), 0, 0.3, -0.08));
    // óculos
    const gm = mat('#1b1b24');
    for (const s of [-1, 1]) head.add(mesh(new THREE.TorusGeometry(0.052, 0.01, 6, 16), gm, 0.088 * s, 0.01, 0.235, false));
    head.add(mesh(new THREE.BoxGeometry(0.06, 0.01, 0.01), gm, 0, 0.015, 0.24, false));
  } else if (style === 'long') {
    head.add(cap(0.265, hairM, Math.PI * 0.58));
    const back = mesh(rbox(0.46, 0.4, 0.2, 0.09), hairM, 0, -0.12, -0.12); head.add(back);
    const tail = mesh(new THREE.SphereGeometry(0.1, 12, 10), hairM, 0, 0.12, -0.28); head.add(tail);
    const tie = mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12), mat(accent || '#ff6b6b'), 0, 0.14, -0.22); head.add(tie);
    const fringe = mesh(rbox(0.36, 0.07, 0.1, 0.035), hairM, -0.03, 0.17, 0.17); fringe.rotation.set(0.5, 0, 0.15); head.add(fringe);
  } else {
    // boné pra trás + barba
    head.add(cap(0.258, hairM, Math.PI * 0.55));
    const cm = mat(accent || '#ff6b6b');
    const c = cap(0.268, cm, Math.PI * 0.42); head.add(c);
    const visor = mesh(rbox(0.22, 0.025, 0.16, 0.01), cm, 0, 0.13, -0.28); visor.rotation.x = -0.25; head.add(visor);
    const beard = mesh(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.3), hairM, 0, -0.02, 0.03, false);
    beard.scale.set(1.12, 1, 1.1);
    head.add(beard);
  }

  const hold = new THREE.Object3D();
  hold.position.set(0, 0.2, 0.34);
  torso.add(hold);

  root.traverse((o) => { if (o.isMesh && !o.userData.outline) { o.castShadow = true; addOutline(o); } });
  return { root, body, torso, head, legs, arms, eyes, brows, mouth, hold };
}

export function buildHighlight(color) {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, COUNTER_H + 0.04, 1.02));
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, toneMapped: false }));
  const g = new THREE.Group();
  line.position.y = (COUNTER_H + 0.04) / 2;
  g.add(line);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = COUNTER_H + 0.012;
  g.add(glow);
  g.visible = false;
  return g;
}

export function buildRing(color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  return m;
}

// ---------- Agente de IA ----------
const faceCache = {};
export function aiFace(state) {
  if (faceCache[state]) return faceCache[state];
  const t = canvasTex(128, 96, (g, w, h) => {
    const bg = { idle: '#0f2b33', work1: '#0f2b33', work2: '#0f2b33', broken: '#3a0d12', offline: '#26282f' }[state];
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.lineCap = 'round';
    if (state === 'idle') {
      g.fillStyle = '#5ff2ff';
      g.beginPath(); g.ellipse(42, 40, 9, 12, 0, 0, Math.PI * 2); g.ellipse(86, 40, 9, 12, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#5ff2ff'; g.lineWidth = 5;
      g.beginPath(); g.arc(64, 58, 14, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    } else if (state === 'work1' || state === 'work2') {
      g.strokeStyle = '#5ff2ff'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(32, 40); g.lineTo(52, 40); g.moveTo(76, 40); g.lineTo(96, 40); g.stroke();
      g.fillStyle = '#ffd166';
      const n = state === 'work1' ? 2 : 3;
      for (let i = 0; i < n; i++) { g.beginPath(); g.arc(46 + i * 18, 70, 5, 0, Math.PI * 2); g.fill(); }
    } else if (state === 'broken') {
      g.strokeStyle = '#ff4d5e'; g.lineWidth = 6;
      for (const cx of [42, 86]) { g.beginPath(); g.moveTo(cx - 9, 31); g.lineTo(cx + 9, 49); g.moveTo(cx + 9, 31); g.lineTo(cx - 9, 49); g.stroke(); }
      g.beginPath(); g.moveTo(38, 70);
      for (let i = 0; i < 6; i++) g.lineTo(46 + i * 9, i % 2 ? 64 : 74);
      g.stroke();
    } else {
      g.fillStyle = '#8a93a8'; g.font = '700 22px Fredoka, Arial'; g.textAlign = 'center';
      g.fillText('SEM', 64, 42); g.fillText('WI-FI', 64, 66);
    }
  });
  faceCache[state] = t;
  return t;
}

export function buildAI() {
  const g = counterBase('#155e75', '#eef0f3');
  const bot = new THREE.Group();
  bot.position.set(0, COUNTER_H, -0.22);
  bot.add(mesh(rbox(0.46, 0.22, 0.32, 0.06), mat('#dfe6ee'), 0, 0.11, 0));
  const head = new THREE.Group(); head.position.y = 0.44; bot.add(head);
  head.add(mesh(rbox(0.5, 0.38, 0.36, 0.09), mat('#f4f6f8'), 0, 0, 0));
  const faceMat = new THREE.MeshBasicMaterial({ map: aiFace('idle'), toneMapped: false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), faceMat);
  face.position.set(0, 0, 0.183);
  head.add(face);
  for (const s of [-1, 1]) head.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14), mat('#3fa7ff'), 0.27 * s, 0, 0).rotateZ(Math.PI / 2));
  head.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), mat('#8a93a8'), 0, 0.26, 0));
  const antMat = new THREE.MeshStandardMaterial({ color: '#ff5a5f', emissive: '#ff5a5f', emissiveIntensity: 1.5 });
  head.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), antMat, 0, 0.35, 0));
  // bracinhos
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(0.26 * s, 0.16, 0.05); bot.add(a);
    a.add(mesh(new THREE.CapsuleGeometry(0.035, 0.14, 4, 8), mat('#8a93a8'), 0, 0, 0.08).rotateX(Math.PI / 2));
    arms.push(a);
  }
  g.add(bot);
  return { group: g, anchor: anchorAt(g, 0, 0.24), head, faceMat, antMat, arms };
}

// ---------- Roteador Wi-Fi ----------
export function buildRouter() {
  const g = counterBase('#4a5568', '#eef0f3');
  const r = new THREE.Group();
  r.position.set(0, COUNTER_H, -0.1);
  r.add(mesh(rbox(0.5, 0.1, 0.32, 0.04), mat('#1f2433'), 0, 0.05, 0));
  for (const x of [-0.18, 0, 0.18]) {
    const ant = mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.36, 8), mat('#1f2433'), x, 0.26, -0.12);
    ant.rotation.z = x * 1.2;
    r.add(ant);
  }
  const ledMat = new THREE.MeshStandardMaterial({ color: '#22ff77', emissive: '#22ff77', emissiveIntensity: 1.6 });
  for (let i = 0; i < 4; i++) r.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), ledMat, -0.12 + i * 0.08, 0.07, 0.165, false));
  g.add(r);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.1), new THREE.MeshBasicMaterial({ map: labelTexture('WI-FI', '#1f2433', '#7ee0ff', 256, 80, 40), toneMapped: false }));
  lbl.position.set(0, COUNTER_H - 0.18, 0.475);
  g.add(lbl);
  return { group: g, anchor: anchorAt(g, 0, 0.2), ledMat, router: r };
}

// ---------- Rack de servidor (produção) ----------
export function buildServer() {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.86, 1.55, 0.8, 0.04), mat('#1b1f2e'), 0, 0.775, 0));
  g.add(mesh(rbox(0.74, 1.4, 0.02, 0.01), mat('#2a3042'), 0, 0.78, 0.4, false));
  const ledMat = new THREE.MeshStandardMaterial({ color: '#22ff77', emissive: '#22ff77', emissiveIntensity: 1.6 });
  const ledMat2 = new THREE.MeshStandardMaterial({ color: '#3fa7ff', emissive: '#3fa7ff', emissiveIntensity: 1.6 });
  for (let row = 0; row < 7; row++) {
    g.add(mesh(rbox(0.66, 0.14, 0.03, 0.01), mat('#11141d'), 0, 0.22 + row * 0.19, 0.415, false));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.035, 0.02, 0.01), (row + i) % 3 ? ledMat : ledMat2, -0.26 + i * 0.05, 0.22 + row * 0.19, 0.435, false));
  }
  const beaconMat = new THREE.MeshStandardMaterial({ color: '#552222', emissive: '#000000', emissiveIntensity: 2, transparent: true, opacity: 0.9 });
  const beacon = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 16), beaconMat, 0, 1.63, 0);
  g.add(beacon);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), new THREE.MeshBasicMaterial({ map: labelTexture('PROD', '#ff4d5e', '#fff', 256, 72, 48), toneMapped: false }));
  lbl.position.set(0, 1.42, 0.44);
  g.add(lbl);
  return { group: g, ledMat, beaconMat, beacon };
}
