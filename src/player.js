import * as THREE from 'three';
import { buildDev, buildHighlight, buildRing } from './models.js';

export const PLAYER_LOOKS = [
  { name: 'P1', color: '#ff5a5f', hoodie: '#ff5a5f', skin: '#f2c9a0', hair: '#4a2f1d', style: 'short', accent: '#ffd166' },
  { name: 'P2', color: '#3fa7ff', hoodie: '#3fa7ff', skin: '#c68b59', hair: '#1b1b24', style: 'beanie', accent: '#ffd166' },
  { name: 'P3', color: '#ffc93c', hoodie: '#ffc93c', skin: '#ffe0bd', hair: '#b5462f', style: 'long', accent: '#ff5a5f', pants: '#2d3a55' },
  { name: 'P4', color: '#44d17a', hoodie: '#44d17a', skin: '#8d5524', hair: '#2b1a10', style: 'cap', accent: '#7b61ff' },
];

const RADIUS = 0.3;
const SPEED = 4.2;

export class Player {
  constructor(index, device, scene, owner = 0) {
    this.index = index;
    this.device = device;
    this.owner = owner; // id de rede de quem controla (0 = host/local)
    this.net = { pos: new THREE.Vector3(), angle: 0, fx: 0, fz: 1, pick: 0, use: false, usePressed: 0, has: false };
    this.gone = false;
    this.look = PLAYER_LOOKS[index];
    this.color = this.look.color;
    this.model = buildDev(this.look);
    scene.add(this.model.root);
    this.highlight = buildHighlight(this.color);
    scene.add(this.highlight);
    this.ring = buildRing(this.color);
    this.model.root.add(this.ring);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = new THREE.Vector3(0, 0, 1);
    this.angle = 0;
    this.holding = null;
    this.target = null;
    this.dashT = 0;
    this.dashCd = 0;
    this.boost = 0;
    this.meeting = 0; // preso numa reunião surpresa
    this.slow = 1;
    this.working = false;
    this.frozen = false;
    this.t = 0;
    this.blinkT = 2 + Math.random() * 3;
    this.jumpT = 0;
    this.squash = 0;
    this.stats = { coded: 0, reviewed: 0, fixed: 0, repairs: 0, delivered: 0, coffee: 0, carried: 0 };
  }

  spawn(p) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.model.root.position.copy(p);
  }

  get speedMul() { return (this.boost > 0 ? 1.35 : 1) * this.slow; }

  // move: vetor desejado no mundo (xz), já mapeado pela câmera
  update(dt, move, dashPressed, world, fx, onDash) {
    this.dashCd -= dt;
    this.boost = Math.max(0, this.boost - dt);
    if (this.frozen) move.set(0, 0, 0);
    const len = move.length();
    if (len > 1) move.divideScalar(len);

    if (dashPressed && this.dashCd <= 0 && !this.frozen) {
      const dir = len > 0.1 ? move.clone().normalize() : this.facing.clone();
      this.vel.copy(dir.multiplyScalar(12));
      this.dashT = 0.14;
      this.dashCd = 0.55;
      this.squash = 1;
      fx?.puff(this.pos, 5);
      onDash?.();
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
    } else {
      const target = move.clone().multiplyScalar(SPEED * this.speedMul);
      this.vel.lerp(target, 1 - Math.exp(-16 * dt));
    }
    this.pos.addScaledVector(this.vel, dt);
    this.collide(world);

    if (len > 0.1) this.facing.copy(move).normalize();
    const targetAngle = Math.atan2(this.facing.x, this.facing.z);
    let d = targetAngle - this.angle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.angle += d * (1 - Math.exp(-18 * dt));

    this.animate(dt);
  }

  collide(world) {
    const tp = world.toTile(this.pos);
    for (let iter = 0; iter < 2; iter++) {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const x = tp.x + dx, z = tp.z + dz;
        if (!world.isSolid(x, z)) continue;
        const c = world.tileCenter(x, z);
        const cx = THREE.MathUtils.clamp(this.pos.x, c.x - 0.5, c.x + 0.5);
        const cz = THREE.MathUtils.clamp(this.pos.z, c.z - 0.5, c.z + 0.5);
        const ox = this.pos.x - cx, oz = this.pos.z - cz;
        const dist = Math.hypot(ox, oz);
        if (dist < RADIUS && dist > 1e-5) {
          const push = (RADIUS - dist) / dist;
          this.pos.x += ox * push; this.pos.z += oz * push;
          // remove componente da velocidade contra a parede
          const nx = ox / dist, nz = oz / dist;
          const vn = this.vel.x * nx + this.vel.z * nz;
          if (vn < 0) { this.vel.x -= vn * nx; this.vel.z -= vn * nz; }
        } else if (dist <= 1e-5) {
          this.pos.x += (this.pos.x - c.x) * 0.1; this.pos.z += (this.pos.z - c.z) * 0.1;
        }
      }
    }
  }

  // Segue a posição recebida pela rede (suavizado) e anima
  netFollow(dt) {
    if (this.net.has) {
      const k = 1 - Math.exp(-14 * dt);
      if (this.pos.distanceToSquared(this.net.pos) > 4) this.pos.copy(this.net.pos);
      else this.pos.lerp(this.net.pos, k);
      this.facing.set(this.net.fx, 0, this.net.fz);
      let d = this.net.angle - this.angle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.angle += d * k;
    }
    this.animate(dt);
  }

  // Consome as ações recebidas pela rede (host)
  consumeNet() {
    const n = this.net;
    const s = { mx: 0, my: 0, pick: n.pick > 0, use: n.use, usePressed: n.usePressed > 0, dash: false };
    if (n.pick > 0) { n.pick--; this.pos.copy(n.pos); }
    if (n.usePressed > 0) n.usePressed--;
    if (this.gone) { s.pick = false; s.use = false; s.usePressed = false; }
    return s;
  }

  celebrate() { this.jumpT = 0.55; }

  animate(dt) {
    const m = this.model;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const sf = Math.min(1, speed / SPEED);
    this.t += dt * (5 + 9 * sf);
    const s = Math.sin(this.t);

    m.root.position.set(this.pos.x, 0, this.pos.z);
    m.root.rotation.y = this.angle;

    // pulo de comemoração
    let jump = 0;
    if (this.jumpT > 0) {
      this.jumpT -= dt;
      const k = 1 - this.jumpT / 0.55;
      jump = Math.sin(Math.min(1, k) * Math.PI) * 0.45;
    }
    const breathe = Math.sin(performance.now() / 500 + this.index) * 0.008;
    m.body.position.y = Math.abs(s) * 0.06 * sf + jump + breathe;

    // squash & stretch
    this.squash = Math.max(0, this.squash - dt * 4);
    const sq = this.squash;
    m.body.scale.set(1 - sq * 0.12, 1 + sq * 0.15, 1 - sq * 0.12);

    // pernas
    const swing = s * 0.75 * sf;
    m.legs[0].rotation.x = swing;
    m.legs[1].rotation.x = -swing;

    // inclinação
    m.torso.rotation.x = THREE.MathUtils.lerp(m.torso.rotation.x, sf * 0.12 + (this.dashT > 0 ? 0.35 : 0), 1 - Math.exp(-12 * dt));

    // braços
    const now = performance.now() / 1000;
    let aL, aR, zL = -0.12, zR = 0.12;
    if (this.jumpT > 0) {
      aL = aR = -2.9; zL = -0.4; zR = 0.4;
    } else if (this.working) {
      aL = -1.25 + Math.sin(now * 28) * 0.22;
      aR = -1.25 + Math.sin(now * 28 + Math.PI) * 0.22;
    } else if (this.holding) {
      aL = aR = -1.3 + Math.sin(this.t) * 0.05 * sf;
      zL = -0.05; zR = 0.05;
    } else {
      aL = -swing * 0.9; aR = swing * 0.9;
    }
    const lerpK = 1 - Math.exp(-20 * dt);
    m.arms[0].rotation.x = THREE.MathUtils.lerp(m.arms[0].rotation.x, aL, lerpK);
    m.arms[1].rotation.x = THREE.MathUtils.lerp(m.arms[1].rotation.x, aR, lerpK);
    m.arms[0].rotation.z = THREE.MathUtils.lerp(m.arms[0].rotation.z, zL, lerpK);
    m.arms[1].rotation.z = THREE.MathUtils.lerp(m.arms[1].rotation.z, zR, lerpK);

    // cabeça
    const headNod = this.working ? Math.sin(now * 14) * 0.08 : Math.sin(now * 1.3 + this.index) * 0.04;
    m.head.rotation.x = headNod;
    m.head.rotation.y = this.working ? 0 : Math.sin(now * 0.7 + this.index * 2) * 0.12 * (1 - sf);

    // piscar
    this.blinkT -= dt;
    let eyeY = 1;
    if (this.blinkT < 0) { eyeY = 0.1; if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3.5; }
    // expressão focada ao trabalhar
    const browTilt = this.working ? 0.35 : 0;
    m.eyes.forEach((e) => { e.scale.y = eyeY * (this.working ? 0.7 : 1); });
    m.brows[0].rotation.z = -browTilt; m.brows[1].rotation.z = browTilt;
    m.mouth.scale.set(this.jumpT > 0 ? 1.6 : 1, this.jumpT > 0 ? 1.8 : 1, 1);
    m.mouth.rotation.z = this.working ? 0 : Math.PI;

    // anel no chão pulsa
    this.ring.material.opacity = 0.55 + Math.sin(now * 4) * 0.2;
  }
}
