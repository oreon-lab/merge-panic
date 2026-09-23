// Ambiente do escritório: paredes de tijolo, piso, e o mundo lá fora
// (rua com carros, calçada com árvores e pedestres, café e lounge com NPCs).
import * as THREE from 'three';
import { canvasTex, mat, mesh, rbox, labelTexture, buildDev } from './models.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- texturas ----------
let brickTex = null;
export function brickTexture() {
  if (brickTex) return brickTex;
  brickTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#c9b39a'; g.fillRect(0, 0, 256, 256); // rejunte
    const bh = 32, bw = 64;
    for (let row = 0; row < 8; row++) {
      const off = (row % 2) * (bw / 2);
      for (let i = -1; i < 5; i++) {
        const tone = 0.85 + Math.random() * 0.3;
        const r = Math.round(196 * tone), gg = Math.round(112 * tone), b = Math.round(76 * tone);
        g.fillStyle = `rgb(${r},${gg},${b})`;
        g.fillRect(i * bw + off + 3, row * bh + 3, bw - 6, bh - 6);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(i * bw + off + 3, row * bh + 3, bw - 6, 5);
      }
    }
  });
  brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping;
  return brickTex;
}

function paverTexture(base, line, size = 4) {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    const s = 256 / size;
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      g.fillRect(i * s, j * s, s, s);
    }
    g.strokeStyle = line; g.lineWidth = 3;
    for (let i = 0; i <= size; i++) {
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i * s); g.lineTo(256, i * s); g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function asphaltTexture() {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#4a4e57'; g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 2500; k++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.08})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function ground(w, d, x, z, tex, repX, repZ, y = 0) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(repX, repZ);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

// ---------- paredes ----------
// kind: 'back' (alta, com janelas/luminárias), 'side' (média), 'front' (baixa, não esconde o jogo)
export function buildBrickWall(kind, { tint = '#ffffff', cap = '#8a3f24', window = false, lamp = false, poster = null } = {}) {
  const g = new THREE.Group();
  const h = kind === 'back' ? 1.7 : kind === 'side' ? 1.05 : 0.55;
  const tex = brickTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(1, h / 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: tex, color: tint, roughness: 0.9 });
  g.add(mesh(new THREE.BoxGeometry(1.0, h, 1.0), wallMat, 0, h / 2, 0, true));
  // viga de madeira no topo (como no Overcooked)
  g.add(mesh(rbox(1.04, 0.12, 1.06, 0.03), mat(cap), 0, h + 0.05, 0, false));
  if (kind === 'back') {
    // rodapé de madeira na face interna
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.12, 0.04), mat('#6b3a22'), 0, 0.06, 0.51, false));
    if (window) {
      const w = new THREE.Group();
      w.position.set(0, 1.0, 0.51);
      w.add(mesh(new THREE.BoxGeometry(0.78, 0.6, 0.04), mat('#f4efe6'), 0, 0, 0, false));
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.48), new THREE.MeshStandardMaterial({ color: '#9fd6ff', emissive: '#4c86b8', emissiveIntensity: 0.55, roughness: 0.1, metalness: 0.2 }));
      glass.position.z = 0.025;
      w.add(glass);
      w.add(mesh(new THREE.BoxGeometry(0.03, 0.5, 0.02), mat('#f4efe6'), 0, 0, 0.035, false));
      w.add(mesh(new THREE.BoxGeometry(0.7, 0.03, 0.02), mat('#f4efe6'), 0, 0, 0.035, false));
      w.add(mesh(new THREE.BoxGeometry(0.86, 0.05, 0.1), mat('#f4efe6'), 0, -0.32, 0.03, false)); // peitoril
      g.add(w);
    }
    if (lamp) {
      const l = new THREE.Group();
      l.position.set(0, 1.25, 0.52);
      l.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), mat('#2a2f3d'), 0, 0, 0, false).rotateX(Math.PI / 2));
      l.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.12, 12, 1, true), mat('#2a2f3d', { side: THREE.DoubleSide }), 0, 0.02, 0.08, false));
      l.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff2c4', emissive: '#ffd27a', emissiveIntensity: 2.5 }), 0, -0.02, 0.08, false));
      g.add(l);
    }
    if (poster) {
      poster.position.set(0, 1.0, 0.515);
      g.add(poster);
    }
  }
  return { group: g, height: h };
}

// ---------- props externos ----------
function tree(scale = 1) {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.9, 0.35, 0.9, 0.06), mat('#6b4a33'), 0, 0.175, 0));
  g.add(mesh(new THREE.BoxGeometry(0.75, 0.04, 0.75), mat('#3b2a1e'), 0, 0.36, 0, false));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.1, 8), mat('#6b4a33'), 0, 0.9, 0));
  const leaf = mat('#5cae4a', { flatShading: true });
  const leaf2 = mat('#4a9a3c', { flatShading: true });
  const blobs = [[0, 1.75, 0, 0.62], [0.35, 1.55, 0.15, 0.42], [-0.32, 1.6, -0.1, 0.45], [0.05, 1.5, -0.35, 0.4], [-0.1, 2.05, 0.1, 0.4]];
  blobs.forEach(([x, y, z, r], i) => g.add(mesh(new THREE.IcosahedronGeometry(r, 1), i % 2 ? leaf2 : leaf, x, y, z)));
  g.scale.setScalar(scale);
  return g;
}

function cone() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.28, 0.03, 0.28), mat('#e8612c'), 0, 0.015, 0));
  g.add(mesh(new THREE.ConeGeometry(0.11, 0.38, 14), mat('#ff7a3d'), 0, 0.22, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.06, 14), mat('#ffffff'), 0, 0.22, 0, false));
  return g;
}

function streetLamp() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 10), mat('#2a2f3d'), 0, 1.2, 0));
  g.add(mesh(rbox(0.5, 0.06, 0.12, 0.02), mat('#2a2f3d'), 0.2, 2.38, 0));
  g.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#ffd27a', emissiveIntensity: 1.6 }), 0.4, 2.3, 0, false));
  return g;
}

function hydrant() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 12), mat('#d62839'), 0, 0.2, 0));
  g.add(mesh(new THREE.SphereGeometry(0.1, 12, 8), mat('#d62839'), 0, 0.42, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), mat('#b01e2d'), 0, 0.28, 0).rotateZ(Math.PI / 2));
  return g;
}

function bench() {
  const g = new THREE.Group();
  g.add(mesh(rbox(1.2, 0.08, 0.36, 0.02), mat('#a8703f'), 0, 0.42, 0));
  g.add(mesh(rbox(1.2, 0.3, 0.06, 0.02), mat('#a8703f'), 0, 0.62, -0.16));
  for (const x of [-0.5, 0.5]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.42, 0.3), mat('#2a2f3d'), x, 0.21, 0));
  return g;
}

function cafeTable(cloth = '#e04a4a') {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.66, 8), mat('#2a2f3d'), 0, 0.33, 0));
  // toalha xadrez
  const tex = canvasTex(64, 64, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = cloth;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2 === 0) c.fillRect(i * 8, j * 8, 8, 8);
  });
  g.add(mesh(rbox(0.9, 0.06, 0.9, 0.02), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), 0, 0.68, 0));
  // notebook + café
  const lap = new THREE.Group();
  lap.position.set(-0.12, 0.72, 0.05);
  lap.add(mesh(rbox(0.3, 0.02, 0.2, 0.01), mat('#c0c4cc', { metalness: 0.5, roughness: 0.35 }), 0, 0, 0));
  const scr = mesh(rbox(0.3, 0.2, 0.015, 0.01), mat('#c0c4cc', { metalness: 0.5, roughness: 0.35 }), 0, 0.1, -0.1);
  scr.rotation.x = -0.25;
  lap.add(scr);
  g.add(lap);
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.08, 10), mat('#ffffff'), 0.25, 0.75, -0.15));
  return g;
}

function chair(color = '#b5462f') {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.36, 0.06, 0.36, 0.02), mat(color), 0, 0.4, 0));
  g.add(mesh(rbox(0.36, 0.34, 0.05, 0.02), mat(color), 0, 0.6, -0.16));
  for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), mat('#2a2f3d'), x, 0.2, z));
  return g;
}

function beanBag(color) {
  const b = mesh(new THREE.SphereGeometry(0.4, 16, 12), mat(color), 0, 0.26, 0);
  b.scale.set(1, 0.6, 1);
  return b;
}

function pingPong() {
  const g = new THREE.Group();
  g.add(mesh(rbox(1.5, 0.05, 0.85, 0.02), mat('#1f7a4a'), 0, 0.72, 0));
  g.add(mesh(new THREE.BoxGeometry(1.5, 0.01, 0.02), mat('#ffffff'), 0, 0.75, 0, false));
  g.add(mesh(new THREE.BoxGeometry(0.02, 0.12, 0.85), mat('#e8e8e8', { transparent: true, opacity: 0.8 }), 0, 0.8, 0, false));
  for (const [x, z] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), mat('#2a2f3d'), x, 0.35, z));
  return g;
}

function car(color) {
  const g = new THREE.Group();
  g.add(mesh(rbox(1.7, 0.42, 0.85, 0.14), mat(color, { roughness: 0.35, metalness: 0.2 }), 0, 0.36, 0));
  g.add(mesh(rbox(0.95, 0.36, 0.76, 0.12), mat(color, { roughness: 0.35, metalness: 0.2 }), -0.08, 0.72, 0));
  const glass = new THREE.MeshStandardMaterial({ color: '#223044', roughness: 0.1, metalness: 0.5 });
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.26, 0.78), glass, -0.08, 0.74, 0, false));
  for (const x of [-0.55, 0.55]) for (const z of [-0.42, 0.42]) {
    const w = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 14), mat('#1b1b24'), x, 0.17, z);
    w.rotation.x = Math.PI / 2;
    g.add(w);
  }
  const head = new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#fff0b0', emissiveIntensity: 1.4 });
  for (const z of [-0.28, 0.28]) g.add(mesh(new THREE.BoxGeometry(0.04, 0.08, 0.16), head, 0.86, 0.4, z, false));
  for (const z of [-0.28, 0.28]) g.add(mesh(new THREE.BoxGeometry(0.04, 0.08, 0.14), new THREE.MeshStandardMaterial({ color: '#ff4d5e', emissive: '#aa1122', emissiveIntensity: 1 }), -0.86, 0.4, z, false));
  return g;
}

function sign(text, bg, fg, w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: labelTexture(text, bg, fg, 512, Math.round(512 * h / w), 60), toneMapped: false }));
  return m;
}

// NPC (reaproveita o dev chibi) com animações simples
const NPC_LOOKS = [
  { hoodie: '#8e9aaf', skin: '#f2c9a0', hair: '#2b1a10', style: 'short', accent: '#ffd166' },
  { hoodie: '#c3a6ff', skin: '#c68b59', hair: '#1b1b24', style: 'long', accent: '#ff5a5f' },
  { hoodie: '#ff8fab', skin: '#ffe0bd', hair: '#b5462f', style: 'beanie', accent: '#3fa7ff' },
  { hoodie: '#6ee7a0', skin: '#8d5524', hair: '#2b1a10', style: 'cap', accent: '#7b61ff' },
  { hoodie: '#ffd166', skin: '#f2c9a0', hair: '#4a2f1d', style: 'long', accent: '#44d17a' },
  { hoodie: '#7ee0ff', skin: '#c68b59', hair: '#1b1b24', style: 'short', accent: '#ff8c1a' },
];
function npc(look) {
  const m = buildDev(look || pick(NPC_LOOKS));
  m.root.scale.setScalar(0.92);
  return m;
}

// =====================================================================
// Monta o exterior ao redor do prédio (W x H tiles, centrado na origem)
// Devolve update(dt) para as animações do ambiente.
// =====================================================================
export function buildExterior(parent, W, H) {
  const root = new THREE.Group();
  parent.add(root);
  const hw = W / 2, hh = H / 2;
  const SW = 2.6;                        // largura da calçada
  const streetZ0 = -hh - SW, streetW = 5; // rua atrás do prédio (topo da tela)
  const anim = [];

  // chão base (praça) + calçada + rua
  root.add(ground(W + 70, H + 70, 0, 0, paverTexture('#8b8f99', 'rgba(0,0,0,0.18)', 2), (W + 70) / 2, (H + 70) / 2, -0.03));
  root.add(ground(W + SW * 2, H + SW * 2, 0, 0, paverTexture('#c9c6bf', 'rgba(90,80,70,0.25)', 4), (W + SW * 2) / 2, (H + SW * 2) / 2, -0.015));
  const street = ground(80, streetW, 0, streetZ0 - streetW / 2, asphaltTexture(), 20, 1.25, -0.01);
  root.add(street);
  // meio-fio e faixas
  root.add(mesh(new THREE.BoxGeometry(80, 0.14, 0.18), mat('#d9d6cf'), 0, 0.05, streetZ0 - 0.09, false));
  root.add(mesh(new THREE.BoxGeometry(80, 0.14, 0.18), mat('#d9d6cf'), 0, 0.05, streetZ0 - streetW + 0.09, false));
  for (let x = -40; x < 40; x += 2.2) root.add(mesh(new THREE.BoxGeometry(1.1, 0.01, 0.1), mat('#f4f1e8'), x, 0.002, streetZ0 - streetW / 2, false));
  root.add(ground(80, 3, 0, streetZ0 - streetW - 1.5, paverTexture('#c9c6bf', 'rgba(90,80,70,0.25)', 4), 40, 1.5, -0.012));

  // árvores, cones, hidrante, postes, bueiros ao longo da calçada de trás
  const zBack = -hh - SW / 2 - 0.1;
  for (let x = -hw - 1; x <= hw + 1; x += W / 3) {
    const t = tree(0.95 + Math.random() * 0.15);
    t.position.set(x, 0, zBack - 0.2);
    t.rotation.y = Math.random() * Math.PI;
    root.add(t);
    anim.push((time) => { t.rotation.z = Math.sin(time * 0.8 + x) * 0.02; });
  }
  [[-hw + 2.2, 0.3], [-hw + 2.8, 0.5], [hw - 3.5, 0.2]].forEach(([x, dz]) => { const c = cone(); c.position.set(x, 0, zBack + dz); root.add(c); });
  const hy = hydrant(); hy.position.set(-2.8, 0, zBack + 0.35); root.add(hy);
  for (const x of [-hw - SW + 0.6, hw + SW - 0.6]) { const l = streetLamp(); l.position.set(x, 0, zBack); if (x > 0) l.rotation.y = Math.PI; root.add(l); }
  for (const x of [-hw + 4.5, hw - 1.5]) root.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 20), mat('#3a3d45'), x, 0.005, zBack + 0.1, false));


  // ---- café externo (esquerda) ----
  const cafeX = -hw - SW - 3.2;
  root.add(ground(6, H + 2, cafeX, 0.5, paverTexture('#d98b5f', 'rgba(120,50,20,0.35)', 4), 3, (H + 2) / 2, -0.008));
  const cafeSign = sign('☕ CAFÉ DOS DEVS', '#6d4c41', '#ffd166', 2.6, 0.4);
  cafeSign.position.set(cafeX, 0.02, -hh + 0.2); cafeSign.rotation.x = -Math.PI / 2;
  root.add(cafeSign);
  const cloths = ['#e04a4a', '#3d8bff', '#44d17a'];
  [[-2.5], [0.4], [3.3]].forEach(([dz], i) => {
    const t = cafeTable(cloths[i % 3]);
    t.position.set(cafeX, 0, dz);
    root.add(t);
    // duas cadeiras, uma com NPC trabalhando no notebook
    const c1 = chair(); c1.position.set(cafeX - 0.75, 0, dz); c1.rotation.y = Math.PI / 2; root.add(c1);
    const c2 = chair(); c2.position.set(cafeX + 0.75, 0, dz); c2.rotation.y = -Math.PI / 2; root.add(c2);
    const n = npc(NPC_LOOKS[i]);
    n.root.position.set(cafeX - 0.72, 0.12, dz);
    n.root.rotation.y = Math.PI / 2;
    n.legs.forEach((l) => { l.rotation.x = -1.4; });
    root.add(n.root);
    const ph = Math.random() * 6;
    anim.push((time) => {
      n.arms[0].rotation.x = -1.2 + Math.sin(time * 18 + ph) * 0.15;
      n.arms[1].rotation.x = -1.2 + Math.sin(time * 18 + ph + Math.PI) * 0.15;
      n.head.rotation.x = 0.15 + Math.sin(time * 2 + ph) * 0.05;
    });
  });
  for (const dz of [-4.2, 5]) { const p = tree(0.7); p.position.set(cafeX + 2, 0, dz); root.add(p); }

  // ---- lounge (direita): pufes e ping-pong ----
  const loungeX = hw + SW + 3.2;
  root.add(ground(6, H + 2, loungeX, 0.5, paverTexture('#4b5068', 'rgba(0,0,0,0.3)', 3), 3, (H + 2) / 2, -0.008));
  const loungeSign = sign('🏓 LOUNGE', '#1f2433', '#7ee0ff', 2.2, 0.4);
  loungeSign.position.set(loungeX, 0.02, -hh + 0.2); loungeSign.rotation.x = -Math.PI / 2;
  root.add(loungeSign);
  const pp = pingPong();
  pp.position.set(loungeX, 0, -1.4);
  pp.rotation.y = Math.PI / 2;
  root.add(pp);
  const players = [npc(NPC_LOOKS[3]), npc(NPC_LOOKS[4])];
  players.forEach((n, i) => {
    n.root.position.set(loungeX, 0, -1.4 + (i ? 1.1 : -1.1));
    n.root.rotation.y = i ? Math.PI : 0;
    root.add(n.root);
  });
  const ball = mesh(new THREE.SphereGeometry(0.04, 8, 6), mat('#ffffff'), loungeX, 1, -1.4, false);
  root.add(ball);
  anim.push((time) => {
    const k = (Math.sin(time * 2.4) + 1) / 2; // vai e volta
    ball.position.z = -1.4 + (k - 0.5) * 1.7;
    ball.position.y = 0.78 + Math.abs(Math.sin(time * 4.8)) * 0.35;
    players.forEach((n, i) => {
      const near = i ? k : 1 - k;
      n.arms[1].rotation.x = -0.4 - near * 1.2;
      n.body.position.y = Math.abs(Math.sin(time * 6 + i)) * 0.03;
    });
  });
  [['#ff5a5f', -hh + 1.5 + 5.2], ['#3fa7ff', 3.6], ['#ffc93c', 5.2]].forEach(([c, z], i) => {
    const b = beanBag(c); b.position.set(loungeX + (i - 1) * 1.3, 0, z - 0.5); root.add(b);
  });
  const sleeper = npc(NPC_LOOKS[5]);
  sleeper.root.position.set(loungeX, 0.25, 3.1);
  sleeper.root.rotation.x = -0.5;
  sleeper.legs.forEach((l) => { l.rotation.x = -1.2; });
  sleeper.eyes.forEach((e) => { e.scale.y = 0.1; });
  root.add(sleeper.root);
  anim.push((time) => { sleeper.body.scale.y = 1 + Math.sin(time * 1.5) * 0.02; });

  // ---- entrada (frente) ----
  for (const x of [-2.2, 2.2]) { const b = bench(); b.position.set(x, 0, hh + SW - 0.8); b.rotation.y = Math.PI; root.add(b); }
  for (const x of [-hw + 0.8, hw - 0.8]) { const p = tree(0.6); p.position.set(x, 0, hh + 1.3); root.add(p); }

  // ---- pedestres na calçada de trás ----
  const walkers = [0, 1, 2].map((i) => {
    const n = npc(NPC_LOOKS[(i + 2) % NPC_LOOKS.length]);
    root.add(n.root);
    return { n, x: rnd(-hw, hw), dir: i % 2 ? 1 : -1, speed: rnd(0.8, 1.3), z: zBack + (i % 2 ? 0.55 : 0.95), t: Math.random() * 6 };
  });
  anim.push((time, dt) => {
    for (const w of walkers) {
      w.x += w.dir * w.speed * dt;
      if (w.x > hw + SW + 8) w.dir = -1;
      if (w.x < -hw - SW - 8) w.dir = 1;
      w.t += dt * 9 * w.speed;
      const s = Math.sin(w.t);
      w.n.root.position.set(w.x, 0, w.z);
      w.n.root.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      w.n.legs[0].rotation.x = s * 0.6; w.n.legs[1].rotation.x = -s * 0.6;
      w.n.arms[0].rotation.x = -s * 0.5; w.n.arms[1].rotation.x = s * 0.5;
      w.n.body.position.y = Math.abs(s) * 0.04;
    }
  });

  // ---- carros na rua ----
  const colors = ['#ff5a5f', '#3fa7ff', '#ffc93c', '#f4f6f8', '#44d17a', '#7b61ff'];
  const cars = [0, 1, 2, 3].map((i) => {
    const c = car(pick(colors));
    const lane = i % 2;
    c.userData = { lane, x: rnd(-30, 30), speed: rnd(3, 5.5) };
    c.position.set(c.userData.x, 0, streetZ0 - (lane ? streetW * 0.28 : streetW * 0.72));
    c.rotation.y = lane ? 0 : Math.PI;
    root.add(c);
    return c;
  });
  anim.push((time, dt) => {
    for (const c of cars) {
      const u = c.userData;
      u.x += (u.lane ? 1 : -1) * u.speed * dt;
      if (u.x > 32) u.x = -32;
      if (u.x < -32) u.x = 32;
      c.position.x = u.x;
    }
  });

  let time = 0;
  return {
    group: root,
    update(dt) {
      time += dt;
      for (const f of anim) f(time, dt);
    },
  };
}
