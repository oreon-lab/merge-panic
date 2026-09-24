// Utilitários de teste (só em modo dev): simulam teclas e avançam o jogo sem rAF.
import * as THREE from 'three';
import { save } from './save.js';

// resumo por headcount pra calibrar estrelas com dados reais, não palpite
function telemSummary() {
  const log = save.sprintLog();
  const by = {};
  for (const e of log) {
    const b = (by[e.players] ||= { n: 0, score: 0, stars: 0, delivered: 0 });
    b.n++; b.score += e.score || 0; b.stars += e.stars || 0; b.delivered += e.delivered || 0;
  }
  return Object.fromEntries(Object.entries(by).map(([k, b]) => [k + 'P', {
    sprints: b.n, scoreMedio: Math.round(b.score / b.n),
    estrelasMedias: Math.round((b.stars / b.n) * 10) / 10,
    entreguesMedias: Math.round((b.delivered / b.n) * 10) / 10,
  }]));
}

export function installDebug(app) {
  const kd = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
  const ku = (c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
  const tap = (c) => { kd(c); app.simulate(1 / 60); ku(c); app.simulate(1 / 60); };
  const S = (type) => app.game.world.stations.filter((s) => s.type === type);
  const goTo = (p, st) => {
    const a = st.group.rotation.y;
    p.pos.set(st.pos.x + Math.sin(a) * 0.85, 0, st.pos.z + Math.cos(a) * 0.85);
    p.vel.set(0, 0, 0);
    p.facing.set(-Math.sin(a), 0, -Math.cos(a));
    p.angle = Math.atan2(p.facing.x, p.facing.z);
    app.simulate(0.05);
  };
  let saved = null;
  const closeup = (x, y, z, zoom = 3.2) => {
    const c = app.camera;
    saved = saved || { pos: c.position.clone(), zoom: c.zoom };
    const off = saved.pos.clone().normalize().multiplyScalar(40);
    c.position.set(x, y, z).add(off);
    c.zoom = zoom;
    c.updateProjectionMatrix();
    app.render();
  };
  const restore = () => {
    if (!saved) return;
    app.camera.position.copy(saved.pos); app.camera.zoom = saved.zoom; saved = null;
    app.resize();
    app.render();
  };
  window.dbg = { kd, ku, tap, S, goTo, closeup, restore, THREE, app, telemSummary };
}
