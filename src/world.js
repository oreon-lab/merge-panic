import * as THREE from 'three';
import * as M from './models.js';

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

export class World {
  constructor(level, parent) {
    this.map = level.map;
    this.H = this.map.length;
    this.W = this.map[0].length;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.tiles = [];
    this.stations = [];
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

  build() {
    const { W, H } = this;
    // chão interno + chão externo escuro
    const ftex = M.floorTexture();
    ftex.repeat.set(W / 2, H / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(W + 60, H + 60), new THREE.MeshStandardMaterial({ color: '#2a2f45', roughness: 1 }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.y = -0.02;
    outside.receiveShadow = true;
    this.group.add(outside);

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
          // paredes do fundo (z pequeno / x pequeno) altas; da frente, baixas
          const back = z === 0 || x === 0;
          const corner = (z === 0 || z === H - 1) && (x === 0 || x === W - 1);
          const withPoster = back && !corner && (x + z) % 4 === 1 && posterIdx < 6;
          const w = M.buildWall(back, withPoster ? posterIdx++ : -1);
          w.group.position.copy(pos);
          if (z === 0) w.group.rotation.y = 0;
          else if (x === 0) w.group.rotation.y = Math.PI / 2;
          this.group.add(w.group);
          continue;
        }
        if (type === 'floor') continue;

        const parts = BUILDERS[type]();
        parts.group.position.copy(pos);
        parts.group.rotation.y = this.facingAngle(x, z);
        this.group.add(parts.group);
        const st = new Station(type, x, z, pos, parts);
        st.index = this.stations.length;
        tile.station = st;
        this.stations.push(st);
      }
    }
    // spawns padrão se o mapa não tiver
    for (let i = 0; i < 4; i++) if (!this.spawns[i]) this.spawns[i] = this.tileCenter(Math.floor(W / 2), Math.floor(H / 2));
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
