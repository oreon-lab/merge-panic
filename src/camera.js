import * as THREE from 'three';

// Câmera isométrica ortográfica com enquadramento dinâmico.
// Trabalha em "espaço de câmera": x = p·right, y = p·up (unidades do mundo).
export class CameraRig {
  constructor(camera, azimuthDeg = 32, elevationDeg = 50) {
    this.camera = camera;
    const az = THREE.MathUtils.degToRad(azimuthDeg), el = THREE.MathUtils.degToRad(elevationDeg);
    this.dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    camera.position.copy(this.dir).multiplyScalar(40);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    this.R = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    this.U = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    // base no chão para mapear o controle (cima da tela = "frente")
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    this.groundUp = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
    this.groundRight = new THREE.Vector3(-this.groundUp.z, 0, this.groundUp.x);

    this.bounds = { minX: -8, maxX: 8, minY: -6, maxY: 6 };
    // conteúdo a enquadrar (suavizado) e alvo
    this.cur = { x: 0, y: 0, hw: 8, hh: 6 };
    this.goal = { ...this.cur };
    this.layout = { left: 0, top: 0, right: 0, bottom: 0 }; // px ocupados por UI
    this.mode = 'overview';
    this.shakeAmt = 0;
    this.t = 0;
    this.snapNext = true;
  }

  toCam(p) { return { x: p.x * this.R.x + p.y * this.R.y + p.z * this.R.z, y: p.x * this.U.x + p.y * this.U.y + p.z * this.U.z }; }

  setMap(W, H) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const x of [-W / 2, W / 2]) for (const z of [-H / 2, H / 2]) for (const y of [0, 1.6]) {
      const c = this.toCam({ x, y, z });
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
    this.bounds = { minX, maxX, minY, maxY };
    this.snapNext = true;
  }

  setLayout(l) { Object.assign(this.layout, { left: 0, top: 0, right: 0, bottom: 0 }, l); }
  shake(a) { this.shakeAmt = Math.min(0.6, this.shakeAmt + a); }

  // enquadra o mapa inteiro
  overview(pad = 0.4) {
    const b = this.bounds;
    this.mode = 'overview';
    Object.assign(this.goal, { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, hw: (b.maxX - b.minX) / 2 + pad, hh: (b.maxY - b.minY) / 2 + pad });
  }

  // segue um conjunto de pontos (jogadores) com zoom mínimo
  follow(points, { minHW = 5.2, minHH = 3.6, margin = 1.6 } = {}) {
    this.mode = 'follow';
    if (!points.length) return this.overview();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      const c = this.toCam({ x: p.x, y: 0.6, z: p.z });
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
    const b = this.bounds;
    const hw = Math.min(Math.max((maxX - minX) / 2 + margin, minHW), (b.maxX - b.minX) / 2 + 0.4);
    const hh = Math.min(Math.max((maxY - minY) / 2 + margin, minHH), (b.maxY - b.minY) / 2 + 0.4);
    Object.assign(this.goal, { x: (minX + maxX) / 2, y: (minY + maxY) / 2, hw, hh });
  }

  // passeio lento de câmera (tela de título)
  cinematic(points) {
    this.mode = 'cinematic';
    const b = this.bounds;
    let x = (b.minX + b.maxX) / 2, y = (b.minY + b.maxY) / 2;
    if (points.length) {
      x = 0; y = 0;
      for (const p of points) { const c = this.toCam({ x: p.x, y: 0.6, z: p.z }); x += c.x; y += c.y; }
      x /= points.length; y /= points.length;
    }
    Object.assign(this.goal, { x: x + Math.sin(this.t * 0.15) * 1.5, y: y + Math.cos(this.t * 0.11) * 0.8, hw: 4.6, hh: 3.2 });
  }

  update(dt, w, h) {
    this.t += dt;
    const k = this.snapNext ? 1 : 1 - Math.exp(-(this.mode === 'cinematic' ? 1.2 : 4) * dt);
    this.snapNext = false;
    for (const key of ['x', 'y', 'hw', 'hh']) this.cur[key] += (this.goal[key] - this.cur[key]) * k;

    // área útil da tela (descontando UI)
    const L = this.layout;
    const uw = Math.max(100, w - L.left - L.right), uh = Math.max(100, h - L.top - L.bottom);
    const upp = Math.max((this.cur.hw * 2) / uw, (this.cur.hh * 2) / uh); // unidades por pixel
    const halfW = (w * upp) / 2, halfH = (h * upp) / 2;
    // centro da câmera para o conteúdo cair no centro da área útil
    const offX = (L.left + uw / 2) - w / 2;
    const offY = (L.top + uh / 2) - h / 2;
    let cx = this.cur.x - offX * upp;
    let cy = this.cur.y + offY * upp;

    // não mostra muito além do escritório
    const b = this.bounds, pad = 0.8;
    const visL = cx - halfW + (L.left * upp), visR = cx + halfW - (L.right * upp);
    const visT = cy + halfH - (L.top * upp), visB = cy - halfH + (L.bottom * upp);
    if (visR - visL < b.maxX - b.minX + pad * 2) {
      if (visL < b.minX - pad) cx += (b.minX - pad) - visL;
      else if (visR > b.maxX + pad) cx -= visR - (b.maxX + pad);
    }
    if (visT - visB < b.maxY - b.minY + pad * 2) {
      if (visB < b.minY - pad) cy += (b.minY - pad) - visB;
      else if (visT > b.maxY + pad) cy -= visT - (b.maxY + pad);
    }

    // tremor
    if (this.shakeAmt > 0.001) {
      cx += (Math.random() - 0.5) * this.shakeAmt;
      cy += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-8 * dt);
    }

    const c = this.camera;
    c.position.copy(this.R).multiplyScalar(cx).addScaledVector(this.U, cy).addScaledVector(this.dir, 40);
    c.left = -halfW; c.right = halfW; c.top = halfH; c.bottom = -halfH;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
  }
}
