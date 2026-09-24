// Economia do "tycoon": catálogo de upgrades, estágios da empresa e pagamentos.
// Módulo puro (sem Three.js): o servidor usa para validar e cobrar,
// o navegador usa para mostrar preços e aplicar os efeitos na partida.

// Estágios da empresa, por valuation (receita acumulada — gastar não diminui)
export const STAGES = [
  { id: 0, name: 'Garagem',   icon: '🏚️', at: 0,     wall: '#e9e3d7', trim: '#8f7f68' },
  { id: 1, name: 'Startup',   icon: '🚀', at: 3200,  wall: '#e3ecf2', trim: '#5b7a99' },
  { id: 2, name: 'Scale-up',  icon: '📈', at: 9000,  wall: '#e8e4f3', trim: '#6b5b99' },
  { id: 3, name: 'Unicórnio', icon: '🦄', at: 22000, wall: '#f3e4ee', trim: '#a0507f' },
  { id: 4, name: 'Big Tech',  icon: '🏢', at: 55000, wall: '#23283d', trim: '#ffd166' },
];

export function stageOf(valuation = 0) {
  let s = STAGES[0];
  for (const st of STAGES) if (valuation >= st.at) s = st;
  return s;
}
export function nextStage(valuation = 0) {
  return STAGES.find((s) => s.at > valuation) || null;
}

// Cada upgrade: níveis com preço e estágio mínimo. `fx(n)` devolve os efeitos
// no nível n. A soma de todos os bônus fica perto de ~25%: habilidade continua mandando.
export const UPGRADES = [
  {
    id: 'monitor', icon: '🖥️', name: 'Monitores ultrawide', station: 'desk',
    desc: 'Mesas de dev codam e corrigem mais rápido.',
    levels: [{ price: 600, stage: 0 }, { price: 1800, stage: 1 }, { price: 4500, stage: 3 }],
    fx: (n) => ({ codeSpeed: 1 + 0.08 * n }),
    label: (n) => `+${8 * n}% velocidade nas mesas`,
  },
  {
    id: 'coffee', icon: '🥐', name: 'Café gourmet', station: 'coffee',
    desc: 'O boost do café dura mais e corre mais.',
    levels: [{ price: 400, stage: 0 }, { price: 1500, stage: 2 }],
    fx: (n) => ({ coffeeTime: 8 + 3 * n, coffeeSpeed: 1.35 + 0.05 * n }),
    label: (n) => `boost de ${8 + 3 * n}s`,
  },
  {
    id: 'floor', icon: '🏃', name: 'Piso novo', station: 'floor',
    desc: 'Menos atrito, mais correria. Todo mundo anda mais rápido.',
    levels: [{ price: 900, stage: 0 }, { price: 3200, stage: 2 }],
    fx: (n) => ({ moveSpeed: 1 + 0.05 * n }),
    label: (n) => `+${5 * n}% velocidade de andar`,
  },
  {
    id: 'plants', icon: '🌿', name: 'Plantas e bem-estar', station: 'counter',
    desc: 'Time feliz, reunião curta. Reuniões surpresa duram menos.',
    levels: [{ price: 500, stage: 0 }, { price: 1400, stage: 1 }, { price: 3000, stage: 2 }],
    fx: (n) => ({ meetingMult: 1 - 0.2 * n }),
    label: (n) => `reuniões ${20 * n}% mais curtas`,
  },
  {
    id: 'ci', icon: '⚙️', name: 'CI turbinado', station: 'test',
    desc: 'A esteira de testes roda mais rápido.',
    levels: [{ price: 1200, stage: 1 }, { price: 3000, stage: 2 }, { price: 6500, stage: 3 }],
    fx: (n) => ({ testTime: 1 - 0.15 * n }),
    label: (n) => `testes ${15 * n}% mais rápidos`,
  },
  {
    id: 'aiv2', icon: '🤖', name: 'Agente de IA v2', station: 'ai',
    desc: 'Modelo novo: a IA deixa menos bugs escondidos.',
    levels: [{ price: 1600, stage: 1 }, { price: 5000, stage: 3 }],
    fx: (n) => ({ aiBugMult: [1, 0.7, 0.45][n] }),
    label: (n) => `${[0, 30, 55][n]}% menos bugs da IA`,
  },
  {
    id: 'mesh', icon: '📶', name: 'Wi-Fi mesh', station: 'router',
    desc: 'O Wi-Fi cai bem menos e volta mais rápido.',
    levels: [{ price: 1400, stage: 1 }],
    fx: (n) => ({ wifiMult: 1 + n, repairSpeed: 1 + 0.5 * n }),
    label: () => 'Wi-Fi cai metade das vezes',
  },
  {
    id: 'coverage', icon: '🛡️', name: 'Cobertura de testes', station: 'test',
    desc: 'Menos testes flaky: bug escondido quase não chega em produção.',
    levels: [{ price: 2500, stage: 2 }, { price: 6000, stage: 4 }],
    fx: (n) => ({ flakyMult: [1, 0.6, 0.3][n] }),
    label: (n) => `${[0, 40, 70][n]}% menos bugs escapando`,
  },
  {
    id: 'linter', icon: '✅', name: 'Linters automáticos', station: 'review',
    desc: 'Menos "nit": o review pede mudanças com menos frequência.',
    levels: [{ price: 2200, stage: 2 }, { price: 5000, stage: 4 }],
    fx: (n) => ({ rejectMult: [1, 0.5, 0.15][n] }),
    label: (n) => `${[0, 50, 85][n]}% menos changes requested`,
  },
  {
    id: 'gitflow', icon: '🔀', name: 'Git flow caprichado', station: 'merge',
    desc: 'Branches curtas: conflitos de merge ficam raros.',
    levels: [{ price: 2800, stage: 2 }, { price: 6000, stage: 3 }],
    fx: (n) => ({ conflictMult: [1, 0.6, 0.3][n] }),
    label: (n) => `${[0, 40, 70][n]}% menos conflitos`,
  },
  {
    id: 'servers', icon: '🗄️', name: 'Servidores redundantes', station: 'server',
    desc: 'Produção aguenta mais: incidentes drenam menos pontos e o hotfix tem mais prazo.',
    levels: [{ price: 4000, stage: 3 }, { price: 9000, stage: 4 }],
    fx: (n) => ({ drainMult: [1, 0.5, 0.2][n], hotfixTime: 1 + 0.25 * n }),
    label: (n) => `incidente drena ${[0, 50, 80][n]}% menos`,
  },
];
export const UPGRADE = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// Efeitos combinados de todos os upgrades comprados
export function effectsOf(upgrades = {}) {
  const e = {
    codeSpeed: 1, coffeeTime: 8, coffeeSpeed: 1.35, moveSpeed: 1, meetingMult: 1, testTime: 1,
    aiBugMult: 1, wifiMult: 1, repairSpeed: 1, flakyMult: 1, rejectMult: 1, conflictMult: 1,
    drainMult: 1, hotfixTime: 1,
  };
  for (const u of UPGRADES) {
    const n = Math.min(upgrades[u.id] || 0, u.levels.length);
    if (n > 0) Object.assign(e, u.fx(n));
  }
  return e;
}

// Aplica os efeitos numa cópia dos parâmetros da fase (caos mais brando)
export function applyToLevel(level, e) {
  const events = { ...(level.events || {}) };
  if (events.wifi && e.wifiMult > 1) events.wifi = events.wifi.map((v) => v * e.wifiMult);
  return {
    ...level,
    events,
    aiBugChance: (level.aiBugChance ?? 0.3) * e.aiBugMult,
    flakyChance: (level.flakyChance ?? 0) * e.flakyMult,
    reviewRejectChance: (level.reviewRejectChance ?? 0) * e.rejectMult,
    conflictChance: (level.conflictChance ?? 0) * e.conflictMult,
  };
}

// Preço do próximo nível (null = no máximo)
export function nextLevelOf(upgrades, id) {
  const u = UPGRADE[id];
  if (!u) return null;
  const n = upgrades[id] || 0;
  return n < u.levels.length ? { n: n + 1, ...u.levels[n] } : null;
}

// ---------- expansões do escritório (placas no lugar das estações) ----------
export const BUILDS = {
  desk:   { name: 'Mesa de dev', icon: '💻', levels: [{ price: 700, stage: 0 }, { price: 1200, stage: 1 }] },
  ai:     { name: 'Agente de IA', icon: '🤖', levels: [{ price: 1000, stage: 0 }, { price: 2400, stage: 1 }] },
  test:   { name: 'Esteira de testes', icon: '🧪', levels: [{ price: 1800, stage: 1 }] },
  review: { name: 'Mesa de review', icon: '👀', levels: [{ price: 1500, stage: 1 }] },
  merge:  { name: 'Portal de merge', icon: '🔀', levels: [{ price: 2600, stage: 2 }] },
  coffee: { name: 'Máquina de café', icon: '☕', levels: [{ price: 350, stage: 0 }] },
};
const BUILD_CHAR = { d: 'desk', a: 'ai', t: 'test', r: 'review', m: 'merge', k: 'coffee' };
const BASE_CHAR = { D: 'desk', A: 'ai', T: 'test', R: 'review', M: 'merge', K: 'coffee' };

// expansões do mapa, em ordem de leitura: desk0, desk1, ai0...
export function listBuilds(map) {
  const out = [], count = {};
  map.forEach((row, z) => [...row].forEach((ch, x) => {
    const type = BUILD_CHAR[ch];
    if (!type) return;
    const i = count[type] = (count[type] ?? -1) + 1;
    const lv = BUILDS[type].levels[Math.min(i, BUILDS[type].levels.length - 1)];
    out.push({ id: type + i, type, x, z, ...lv, name: BUILDS[type].name, icon: BUILDS[type].icon });
  }));
  return out;
}

// a empresa tem pelo menos uma estação desse tipo (de fábrica ou comprada)?
export function hasStation(company, map, type) {
  if (map.some((row) => [...row].some((ch) => BASE_CHAR[ch] === type))) return true;
  return listBuilds(map).some((b) => b.type === type && company.builds?.[b.id]);
}

// algumas melhorias só fazem sentido com a estação comprada
export const UPGRADE_NEEDS = { aiv2: 'ai', coffee: 'coffee' };

// Por que não dá pra comprar (null = pode). id: 'up:monitor' | 'build:desk0' | 'monitor'.
// extra = dinheiro que a sprint em andamento já rendeu (pode ser gasto na hora)
export function buyBlock(company, id, map = null, extra = 0) {
  const cash = (company.cash || 0) + Math.max(0, extra);
  const stage = stageOf(company.valuation).id;
  if (id.startsWith('build:')) {
    const b = map && listBuilds(map).find((x) => x.id === id.slice(6));
    if (!b) return 'Expansão desconhecida';
    if (company.builds?.[b.id]) return 'Já construído';
    if (stage < b.stage) return `Requer ${STAGES[b.stage].icon} ${STAGES[b.stage].name}`;
    if (cash < b.price) return 'Dinheiro insuficiente';
    return null;
  }
  const uid = id.replace(/^up:/, '');
  const next = nextLevelOf(company.upgrades || {}, uid);
  if (!next) return 'Nível máximo';
  if (map && UPGRADE_NEEDS[uid] && !hasStation(company, map, UPGRADE_NEEDS[uid])) return `Precisa de ${BUILDS[UPGRADE_NEEDS[uid]].icon} ${BUILDS[UPGRADE_NEEDS[uid]].name}`;
  if (stage < next.stage) return `Requer ${STAGES[next.stage].icon} ${STAGES[next.stage].name}`;
  if (cash < next.price) return 'Dinheiro insuficiente';
  return null;
}

// preço de qualquer item comprável
export function priceOf(company, id, map) {
  if (id.startsWith('build:')) return listBuilds(map).find((x) => x.id === id.slice(6))?.price ?? null;
  return nextLevelOf(company.upgrades || {}, id.replace(/^up:/, ''))?.price ?? null;
}

// Estrelas de uma pontuação numa fase
export function starsFor(level, score) {
  return (level.stars || []).filter((s) => score >= s).length;
}

// Quanto a sprint rende pra empresa: pontos + bônus por estrela; empresas maiores faturam mais
export const STAR_BONUS = [0, 400, 900, 1600];
export const revenueMult = (stage) => 1 + 0.25 * stage;
export function payoutOf(stage, score, stars, bonusScale = 1) {
  return Math.round((Math.max(0, score) + STAR_BONUS[stars] * bonusScale) * revenueMult(stage));
}

export const fmtMoney = (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
