import * as THREE from 'three';

// Partículas simples: confete, poeira e brilhos.
const CONFETTI = ['#ff5a5f', '#3fa7ff', '#ffc93c', '#44d17a', '#c3a6ff', '#ffffff'];

export class FX {
  constructor(parent) {
    this.parent = parent;
    this.parts = [];
    this.confGeo = new THREE.PlaneGeometry(0.08, 0.05);
    this.puffGeo = new THREE.SphereGeometry(0.1, 8, 6);
    this.sparkGeo = new THREE.OctahedronGeometry(0.06, 0);
  }

  add(mesh, vel, life, opts = {}) {
    this.parent.add(mesh);
    this.parts.push({ mesh, vel, life, max: life, spin: opts.spin || 0, grav: opts.grav ?? -9, grow: opts.grow || 0, fade: opts.fade ?? true });
  }

  confetti(pos, n = 40) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.confGeo, new THREE.MeshBasicMaterial({ color: CONFETTI[i % CONFETTI.length], side: THREE.DoubleSide, transparent: true }));
      m.position.copy(pos).add(new THREE.Vector3(0, 0.8, 0));
      m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2.5;
      this.add(m, new THREE.Vector3(Math.cos(a) * r, 4 + Math.random() * 3, Math.sin(a) * r), 1.6 + Math.random() * 0.6, { spin: 10, grav: -7 });
    }
  }

  puff(pos, n = 6, color = '#ffffff') {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
      m.position.set(pos.x + (Math.random() - 0.5) * 0.3, 0.1, pos.z + (Math.random() - 0.5) * 0.3);
      const a = Math.random() * Math.PI * 2;
      this.add(m, new THREE.Vector3(Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.8), 0.45, { grav: 0, grow: 2.2 });
    }
  }

  sparkle(pos, color = '#6ee7a0', n = 12) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false }));
      m.position.copy(pos);
      const a = (i / n) * Math.PI * 2;
      this.add(m, new THREE.Vector3(Math.cos(a) * 1.6, 2 + Math.random() * 1.5, Math.sin(a) * 1.6), 0.7, { spin: 8, grav: -6 });
    }
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parent.remove(p.mesh);
        p.mesh.material.dispose();
        this.parts.splice(i, 1);
        continue;
      }
      p.vel.y += p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.02) { p.mesh.position.y = 0.02; p.vel.set(p.vel.x * 0.5, 0, p.vel.z * 0.5); }
      if (p.spin) { p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.y += p.spin * 0.7 * dt; }
      if (p.grow) p.mesh.scale.multiplyScalar(1 + p.grow * dt);
      if (p.fade) p.mesh.material.opacity = Math.min(1, p.life / p.max * 1.5) * (p.grow ? 0.7 : 1);
    }
  }
}
