// Decoração dos upgrades: cada compra aparece no escritório.
// As peças são somadas ao grupo da estação (frente = +z, fundo = -z).
import * as THREE from 'three';
import { COUNTER_H, mat, mesh, rbox, labelTexture } from './models.js';

const H = COUNTER_H;
const glow = (color, k = 1.6) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k });
const spin = (st, obj, axis, speed) => { (st.spinners ||= []).push({ obj, axis, speed }); };
const sign = (text, bg, fg, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h),
  new THREE.MeshBasicMaterial({ map: labelTexture(text, bg, fg, 256, Math.round(256 * h / w), 40), toneMapped: false }));

function pottedPlant(scale = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.1, 12), mat('#e07a5f'), 0, 0.05, 0));
  const leaf = mat('#3fa34d', { flatShading: true });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const l = mesh(new THREE.ConeGeometry(0.035, 0.2, 4), leaf, Math.cos(a) * 0.03, 0.18, Math.sin(a) * 0.03);
    l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(l);
  }
  g.scale.setScalar(scale);
  return g;
}

export function decorate(st, up) {
  if (!st.group) return;
  // idempotente: tira as peças da decoração anterior antes de montar a nova
  if (st.decorGroup) st.group.remove(st.decorGroup);
  (st.decorExtras || []).forEach((o) => o.parent?.remove(o));
  st.decorExtras = [];
  st.spinners = [];
  const g = new THREE.Group();
  st.group.add(g);
  st.decorGroup = g;
  switch (st.type) {
    case 'desk': {
      const n = up.monitor || 0;
      if (n >= 1) {
        // segundo monitor na lateral
        const m = new THREE.Group();
        m.position.set(0.36, H, -0.22); m.rotation.y = -0.5;
        m.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), mat('#2a2f3d'), 0, 0.09, 0));
        m.add(mesh(rbox(0.3, 0.22, 0.03, 0.01), mat('#2a2f3d'), 0, 0.28, 0));
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.18), new THREE.MeshBasicMaterial({ color: '#2d6a8f', toneMapped: false }));
        scr.position.set(0, 0.28, 0.017);
        m.add(scr);
        g.add(m);
      }
      if (n >= 2) g.add(mesh(new THREE.BoxGeometry(0.96, 0.025, 0.02), glow('#b36bff', 2.2), 0, H - 0.07, 0.49, false)); // fita de LED
      if (n >= 3) g.add(mesh(new THREE.BoxGeometry(0.96, 0.025, 0.02), glow('#ffd166', 2.2), 0, 0.08, 0.49, false));
      break;
    }
    case 'coffee': {
      const n = up.coffee || 0;
      if (n >= 1) {
        for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.08, 10), mat(['#ffffff', '#ffd166', '#ff8fab'][i]), -0.34 + i * 0.09, H + 0.04, 0.3));
        g.add(mesh(rbox(0.46, 0.04, 0.38, 0.015), mat('#d4a017', { metalness: 0.7, roughness: 0.3 }), 0, H + 0.56, -0.18, false));
      }
      if (n >= 2) {
        g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), mat('#fafafa'), 0.32, H + 0.01, 0.28));
        g.add(mesh(new THREE.TorusGeometry(0.04, 0.02, 6, 10, Math.PI), mat('#d99a4e'), 0.32, H + 0.04, 0.28).rotateX(-Math.PI / 2)); // croissant
      }
      break;
    }
    case 'test': {
      const ci = up.ci || 0, cov = up.coverage || 0;
      if (ci >= 1) {
        const fan = new THREE.Group();
        fan.position.set(-0.42, H + 0.3, -0.26); fan.rotation.y = Math.PI / 2;
        fan.add(mesh(new THREE.TorusGeometry(0.1, 0.015, 6, 20), mat('#3a4050'), 0, 0, 0));
        const blades = new THREE.Group();
        for (let i = 0; i < 4; i++) blades.add(mesh(new THREE.BoxGeometry(0.16, 0.03, 0.01), glow(ci >= 3 ? '#7ee0ff' : '#5fa8ff', 1.2), 0, 0, 0).rotateZ((i * Math.PI) / 4));
        fan.add(blades);
        g.add(fan);
        spin(st, blades, 'z', 14);
      }
      if (ci >= 2) {
        const tower = new THREE.Group();
        tower.position.set(0.4, H, -0.3);
        tower.add(mesh(rbox(0.16, 0.5, 0.26, 0.03), mat('#1b1f2e'), 0, 0.25, 0));
        for (let i = 0; i < 4; i++) tower.add(mesh(new THREE.BoxGeometry(0.1, 0.02, 0.01), glow('#22ff77'), 0, 0.1 + i * 0.1, 0.135, false));
        g.add(tower);
      }
      if (cov >= 1) {
        const s = sign(cov >= 2 ? '🛡 98%' : '🛡 85%', '#1f7a4a', '#ffffff', 0.3, 0.12);
        s.position.set(0, H + 0.58, -0.07);
        g.add(s);
      }
      break;
    }
    case 'ai': {
      const n = up.aiv2 || 0;
      if (n >= 1 && st.head) {
        const halo = mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 28), glow(n >= 2 ? '#ffd166' : '#3fa7ff', 2), 0, 0.42, 0, false);
        halo.rotation.x = Math.PI / 2;
        st.head.add(halo);
        st.decorExtras.push(halo);
        spin(st, halo, 'z', 1.5);
        const tag = sign(n >= 2 ? 'v3' : 'v2', n >= 2 ? '#d4a017' : '#3fa7ff', '#fff', 0.14, 0.08);
        tag.position.set(0.16, -0.12, 0.185);
        st.head.add(tag);
        st.decorExtras.push(tag);
      }
      break;
    }
    case 'router': {
      if ((up.mesh || 0) >= 1) {
        for (const x of [-0.36, 0.36]) {
          const node = new THREE.Group();
          node.position.set(x, H, 0.2);
          node.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 16), mat('#f4f6f8'), 0, 0.025, 0));
          node.add(mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 20), glow('#7ee0ff', 2), 0, 0.052, 0, false).rotateX(Math.PI / 2));
          g.add(node);
        }
      }
      break;
    }
    case 'review': {
      const n = up.linter || 0;
      if (n >= 1) {
        const s = sign(n >= 2 ? '✔ LINT + AUTOFIX' : '✔ LINT', '#1f7a4a', '#fff', 0.5, 0.1);
        s.position.set(0, H + 0.68, -0.25);
        g.add(s);
      }
      break;
    }
    case 'merge': {
      const n = up.gitflow || 0;
      if (n >= 1) {
        const r = mesh(new THREE.TorusGeometry(0.44, 0.02, 8, 40), glow(n >= 2 ? '#ffd166' : '#7ee0ff', 1.8), 0, H + 0.06, 0, false);
        r.rotation.x = Math.PI / 2;
        g.add(r);
        spin(st, r, 'z', -1.2);
      }
      break;
    }
    case 'server': {
      const n = up.servers || 0;
      if (n >= 1) {
        g.add(mesh(new THREE.BoxGeometry(0.04, 1.3, 0.02), glow('#3fa7ff', 2), -0.4, 0.78, 0.41, false));
        g.add(mesh(new THREE.BoxGeometry(0.04, 1.3, 0.02), glow('#3fa7ff', 2), 0.4, 0.78, 0.41, false));
        const s = sign('HA ✓', '#1f4f99', '#fff', 0.3, 0.1);
        s.position.set(0, 0.12, 0.43);
        g.add(s);
      }
      if (n >= 2) g.add(mesh(rbox(0.9, 0.05, 0.84, 0.02), mat('#d4a017', { metalness: 0.7, roughness: 0.3 }), 0, 1.56, 0, false));
      break;
    }
    case 'counter': {
      if (up.counterPlant) {
        const p = pottedPlant(1);
        p.position.set(0.32, H, -0.3);
        g.add(p);
      }
      break;
    }
  }
}

// Placa com o nome e o estágio da empresa, na parede do fundo
export function companySign(name, stage) {
  const g = new THREE.Group();
  const big = stage.id >= 4;
  g.add(mesh(rbox(3.1, 0.42, 0.04, 0.03), mat(big ? '#ffd166' : '#1f2433', big ? { metalness: 0.6, roughness: 0.3 } : {}), 0, 0, 0, false));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.36),
    new THREE.MeshBasicMaterial({ map: labelTexture(`${stage.icon} ${name}`, big ? '#1f2433' : '#2a3042', stage.id >= 2 ? '#ffd166' : '#ffffff', 1024, 124, 70), toneMapped: false }));
  plate.position.z = 0.025;
  g.add(plate);
  return g;
}
