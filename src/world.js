import * as THREE from 'three';
import * as M from './models.js';
import { decorate, companySign } from './decor.js';
import { buildBrickWall, buildExterior } from './environment.js';
import { labelTexture } from './models.js';
import { STAGES, stageOf, listBuilds, UPGRADE, nextLevelOf } from './economy.js';

const CHARS = {
  '#': 'wall', '.': 'floor', C: 'counter', B: 'backlog', D: 'desk', T: 'test',
  R: 'review', M: 'merge', X: 'trash', K: 'coffee', P: 'plant',
  A: 'ai', W: 'router', S: 'server',
};

export const STATION_INFO = {
  backlog: { icon: '📋', label: 'Backlog' },
  desk:    { icon: '💻', label: 'Dev' },
  test:    { icon: '🧪', label: 'Testes' },
  review:  { icon: '👀', label: 'Review' },
  merge:   { icon: '🔀', label: 'Merge' },
  trash:   { icon: '🗑️', label: "Won't fix" },
  coffee:  { icon: '☕', label: 'Café' },
  ai:      { icon: '🤖', label: 'Agente IA' },
  router:  { icon: '📶', label: 'Roteador' },
  server:  { icon: '🔥', label: 'Produção' },
};

const BUILDERS = {
  counter: M.buildCounter, backlog: M.buildBacklog, desk: M.buildDesk, test: M.buildTest,
  review: M.buildReview, merge: M.buildMerge, trash: M.buildTrash, coffee: M.buildCoffee,
  plant: M.buildPlant, ai: M.buildAI, router: M.buildRouter, server: M.buildServer,
};

export class Station {
  constructor(type, tx, tz, pos, parts) {
    this.type = type;
    this.tx = tx; this.tz = tz;
    this.pos = pos;
    Object.assign(this, parts); // group, anchor, lamp, ring...
    this.item = null;
    this.running = false;
    this.flash = 0;
    this.workers = 0;
    this.broken = false;   // agente de IA alucinando
    this.repair = 0;       // progresso do reboot
    this.conflict = null;  // merge: progresso de resolução do conflito
    this.failFlash = 0;
  }
  get interactive() { return this.type !== 'plant' && this.type !== 'server'; }
  get holdsItems() { return !['backlog', 'trash', 'coffee', 'plant', 'router', 'server'].includes(this.type); }
}

// Placa de compra no chão (tycoon): expansão (vira estação) ou melhoria
export class Pad {
  constructor(kind, id, x, z, pos, info) {
    this.kind = kind;           // 'build' | 'up'
    this.id = id;               // 'build:desk0' | 'up:monitor'
    this.tx = x; this.tz = z;
    this.pos = pos;
    Object.assign(this, info);  // type, name, icon
    this.hold = 0;              // progresso de "segurar pra comprar"
    this.busy = false;
    this.visible = true;
    this.group = new THREE.Group();
    this.group.position.copy(pos);
  }
}

const POSTERS = [
  ['FUNCIONA NA\nMINHA MÁQUINA', '#ffd166', '#1b1f2e'],
  ['NÃO FAÇA DEPLOY\nNA SEXTA', '#ff6b6b', '#ffffff'],
  ['git push\n--force 🙈', '#1b1f2e', '#6ee7a0'],
];
function posterMesh(i) {
  const [txt, bg, fg] = POSTERS[i % POSTERS.length];
  return new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshStandardMaterial({ map: labelTexture(txt, bg, fg, 256, 190, 30), roughness: 0.8 }));
}

// material de "holograma" da prévia do que a placa constrói
const holo = new THREE.MeshStandardMaterial({ color: '#7ee0ff', emissive: '#3fa7ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.28, depthWrite: false });

export class World {
  constructor(level, parent, company = null) {
    this.level = level;
    this.company = company;
    this.upgrades = company?.upgrades || {};
    this.builds = company?.builds || {};
    this.stage = company ? stageOf(company.valuation) : STAGES[0];
    this.map = level.map;
    this.H = this.map.length;
    this.W = this.map[0].length;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.tiles = [];
    this.stations = [];
    this.pads = [];
    this.spawns = [];
    this.build();
  }

  tileCenter(x, z) {
    return new THREE.Vector3(x - this.W / 2 + 0.5, 0, z - this.H / 2 + 0.5);
  }
  toTile(p) {
    return { x: Math.floor(p.x + this.W / 2), z: Math.floor(p.z + this.H / 2) };
  }
  tile(x, z) {
    return this.tiles[z]?.[x];
  }
  isSolid(x, z) {
    const t = this.tile(x, z);
    return !t || t.solid;
  }
  padAt(x, z) { return this.pads.find((p) => p.tx === x && p.tz === z && p.visible); }

  build() {
    const { W, H } = this;
    const ftex = M.floorTexture(this.upgrades.floor || 0);
    ftex.repeat.set(W / 2, H / 2);
    this.floorMat = new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.9 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    // o mundo lá fora: rua, calçada, café, lounge, NPCs
    this.exterior = buildExterior(this.group, W, H);

    const builds = new Map(listBuilds(this.map).map((b) => [`${b.x},${b.z}`, b]));
    let posterIdx = 0;
    for (let z = 0; z < H; z++) {
      this.tiles.push([]);
      for (let x = 0; x < W; x++) {
        const ch = this.map[z][x];
        let type = CHARS[ch] || 'floor';
        if ('1234'.includes(ch)) {
          this.spawns[+ch - 1] = this.tileCenter(x, z);
          type = 'floor';
        }
        const tile = { type, solid: type !== 'floor', station: null };
        this.tiles[z].push(tile);
        const pos = this.tileCenter(x, z);

        if (type === 'wall') {
          // câmera de lado: paredes do fundo (z=0 e x=0) altas, com janelas e luminárias; frente/direita baixas
          const back = z === 0 || x === 0;
          const along = z === 0 ? x : z;           // posição ao longo da parede
          const len = z === 0 ? W : H;
          const inner = along > 0 && along < len - 1;
          const nearSign = z === 0 && Math.abs(x - Math.floor(W / 2)) <= 1;
          const opts = { tint: this.stage.wall, cap: this.stage.id >= 4 ? '#d4a017' : '#8a4b2c' };
          if (back && inner && !nearSign) {
            const slot = along % 4;
            if (slot === 1 || slot === 3) opts.window = true;
            else if (slot === 2) opts.lamp = true;
            else if (posterIdx < POSTERS.length) opts.poster = posterMesh(posterIdx++);
          }
          const w = buildBrickWall(back ? 'back' : 'front', opts);
          w.group.position.copy(pos);
          if (x === 0 && z > 0) w.group.rotation.y = Math.PI / 2; // face interna pra +x
          this.group.add(w.group);
          continue;
        }

        // expansão comprável: vira estação se a empresa já comprou; senão, placa no chão
        const b = builds.get(`${x},${z}`);
        if (b) {
          if (this.builds[b.id]) this.addStation(b.type, x, z);
          else {
            tile.type = 'pad';
            this.addPad(new Pad('build', 'build:' + b.id, x, z, pos, { type: b.type, name: b.name, icon: b.icon }));
          }
          continue;
        }
        if (type === 'floor') continue;
        this.addStation(type, x, z);
      }
    }
    // placas das melhorias
    for (const [uid, [x, z]] of Object.entries(this.level.pads || {})) {
      const u = UPGRADE[uid];
      if (!u || !nextLevelOf(this.upgrades, uid)) continue;
      this.addPad(new Pad('up', 'up:' + uid, x, z, this.tileCenter(x, z), { type: uid, name: u.name, icon: u.icon }));
    }
    // plaquinha da empresa na parede do fundo
    if (this.company) {
      const sign = companySign(this.company.name, this.stage);
      sign.position.copy(this.tileCenter(Math.floor(W / 2), 0)).add(new THREE.Vector3(0, 1.47, 0.54));
      this.group.add(sign);
    }
    this.decorateCounters();
    // spawns padrão se o mapa não tiver
    for (let i = 0; i < 4; i++) if (!this.spawns[i]) this.spawns[i] = this.tileCenter(Math.floor(W / 2), Math.floor(H / 2));
  }

  addStation(type, x, z) {
    const pos = this.tileCenter(x, z);
    const parts = BUILDERS[type]();
    parts.group.position.copy(pos);
    parts.group.rotation.y = this.facingAngle(x, z);
    this.group.add(parts.group);
    const st = new Station(type, x, z, pos, parts);
    st.index = this.stations.length;
    decorate(st, this.upgrades);
    const tile = this.tile(x, z);
    tile.type = type;
    tile.solid = true;
    tile.station = st;
    this.stations.push(st);
    return st;
  }

  addPad(pad) {
    const g = pad.group;
    // moldura brilhante no chão
    const frame = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.46, 4, 1), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.9, toneMapped: false }));
    frame.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    frame.position.y = 0.012;
    g.add(frame);
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.64), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.15, depthWrite: false, toneMapped: false }));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.01;
    g.add(fill);
    // anel de progresso (enche enquanto segura "usar")
    const prog = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 32, 1, 0, 0.001), new THREE.MeshBasicMaterial({ color: '#6ee7a0', transparent: true, opacity: 0.95, toneMapped: false, side: THREE.DoubleSide }));
    prog.rotation.x = -Math.PI / 2;
    prog.position.y = 0.02;
    g.add(prog);
    // prévia: holograma da estação (expansão) ou um cristal girando (melhoria)
    let preview;
    if (pad.kind === 'build') {
      preview = BUILDERS[pad.type]().group;
      preview.traverse((o) => { if (o.isMesh) { o.material = holo; o.castShadow = false; } });
      preview.rotation.y = this.facingAngle(pad.tx, pad.tz);
    } else {
      preview = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb400', emissiveIntensity: 1.2 }));
      preview.position.y = 0.55;
    }
    g.add(preview);
    Object.assign(pad, { frame, fill, prog, preview });
    this.group.add(g);
    this.pads.push(pad);
  }

  removePad(pad) {
    this.group.remove(pad.group);
    this.pads = this.pads.filter((p) => p !== pad);
  }

  // placa comprada: expansão vira estação na hora (host e clientes chamam na mesma ordem)
  buildAt(id) {
    const pad = this.pads.find((p) => p.id === id);
    if (!pad) return null;
    this.removePad(pad);
    this.builds = { ...this.builds, [id.slice(6)]: true };
    return this.addStation(pad.type, pad.tx, pad.tz);
  }

  // melhorias novas: piso, peças nas estações, plantas e placas que sobem de nível
  applyUpgrades(upgrades) {
    this.upgrades = { ...upgrades };
    const tex = M.floorTexture(this.upgrades.floor || 0);
    tex.repeat.set(this.W / 2, this.H / 2);
    this.floorMat.map = tex;
    this.floorMat.needsUpdate = true;
    for (const st of this.stations) decorate(st, this.upgrades);
    this.decorateCounters();
    for (const pad of [...this.pads]) {
      if (pad.kind === 'up' && !nextLevelOf(this.upgrades, pad.type)) this.removePad(pad);
    }
  }

  decorateCounters() {
    const plants = [0, 3, 6, 10][this.upgrades.plants || 0];
    this.stations.filter((s) => s.type === 'counter').forEach((s, i) => decorate(s, { counterPlant: i < plants }));
  }

  updateAmbient(dt) { this.exterior?.update(dt); }

  // anima as placas (pulso, holograma flutuando, progresso da compra)
  animatePads(dt, now) {
    for (const p of this.pads) {
      p.group.visible = p.visible;
      if (!p.visible) continue;
      const on = p.affordable;
      const c = on ? '#ffd166' : '#8a93a8';
      p.frame.material.color.set(c);
      p.fill.material.color.set(c);
      p.frame.material.opacity = 0.6 + Math.sin(now * 4 + p.tx) * 0.3 * (on ? 1 : 0.3);
      if (p.kind === 'build') p.preview.position.y = 0.04 + Math.sin(now * 2 + p.tz) * 0.03;
      else { p.preview.rotation.y += dt * 2; p.preview.position.y = 0.55 + Math.sin(now * 3 + p.tx) * 0.06; }
      const k = Math.round(Math.min(1, p.hold) * 40) / 40;
      if (k !== p._k) {
        p._k = k;
        p.prog.geometry.dispose();
        p.prog.geometry = new THREE.RingGeometry(0.2, 0.28, 32, 1, Math.PI / 2, Math.max(0.001, k * Math.PI * 2));
      }
    }
  }

  // Estações olham para o chão livre mais próximo (preferindo a câmera)
  facingAngle(x, z) {
    const dirs = [[0, 1], [1, 0], [-1, 0], [0, -1]];
    for (const [dx, dz] of dirs) {
      const ch = this.map[z + dz]?.[x + dx];
      if (ch && (ch === '.' || '1234'.includes(ch))) return Math.atan2(dx, dz);
    }
    return 0;
  }
}
