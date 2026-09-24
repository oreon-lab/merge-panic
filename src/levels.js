// O escritório (um só, que cresce) e a dificuldade de cada sprint.
//
// Legenda do mapa:
// # parede   . chão   C bancada   B backlog   D mesa de dev   T testes (CI)
// R code review   M merge   X lixeira (won't fix)   K café   P planta   1-4 spawn
// A agente de IA   W roteador Wi-Fi   S rack de produção
// Letras MINÚSCULAS são expansões compráveis (d mesa, a agente de IA, t testes,
// r review, m merge, k café): até serem compradas, viram placas no chão.
//
// Módulo puro: o servidor usa sprintParams() pra validar estrelas e teto de pontos.
import { stageOf } from './economy.js';

export const OFFICE = {
  id: 'hq',
  map: [
    '###############',
    '#B.DDddCaaTtCW#',
    '#.............#',
    '#C..1.....2..C#',
    '#S...........C#',
    '#X...CCCCM...R#',
    '#C...........r#',
    '#C..3.....4..C#',
    '#.............#',
    '#CPCkCmCCCCCPC#',
    '###############',
  ],
  // placas das melhorias (no chão, perto de onde fazem efeito). [x, z] no mapa
  pads: {
    servers: [2, 4], monitor: [4, 2], aiv2: [8, 2], mesh: [12, 2], ci: [10, 4], coverage: [11, 4],
    plants: [2, 6], floor: [4, 6], coffee: [4, 8], gitflow: [7, 8], linter: [11, 6],
  },
  // fileira 2 é corredor livre: as 3 placas dali rodam de lugar por sprint
  shufflePads: ['monitor', 'aiv2', 'mesh'],
  shuffleRow: { z: 2, xs: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
};

// PRNG determinístico (o layout tem que ser igual em todo reload da mesma sprint)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// sabor de cada estágio da empresa
const FLAVOR = [
  'Garagem: café solúvel e fé no deploy.',
  'Startup: o investidor pediu "mais IA".',
  'Scale-up: mais clientes, mais caos.',
  'Unicórnio: todo mundo quer tudo pra ontem.',
  'Big Tech: sexta-feira, 17h50, deploy global.',
];

// Escala por headcount: solo/duo não enfrentam a mesma concorrência nem as
// mesmas estrelas de um time de 4. Fonte única — cliente e servidor usam igual.
export const PLAYER_SCALE = [0.5, 0.75, 0.9, 1.0]; // 1–4 jogadores
const clampN = (n) => Math.max(1, Math.min(4, Math.round(Number(n) || 4)));
export function scaleForPlayers(params, n) {
  const count = clampN(n);
  const f = PLAYER_SCALE[count - 1];
  const load = 1 + 0.12 * (4 - count);
  return {
    ...params,
    nPlayers: count,
    bonusScale: f,
    maxActive: Math.min(5, 2 + count),
    spawnEvery: params.spawnEvery.map((v) => v * load),
    firstEventAt: Math.round(params.firstEventAt * load),
    events: Object.fromEntries(Object.entries(params.events || {}).map(([id, range]) => [id, range.map((v) => Math.round(v * load))])),
    stars: params.stars.map((v) => Math.round((v * f) / 50) * 50),
  };
}

// Parâmetros da próxima sprint, derivados do estágio da empresa e de quantas sprints já jogou.
// Tudo sobe devagar: mais pedidos, mais caos, estrelas mais caras (e pagamento maior).
// A estreia da empresa usa estrelas de boas-vindas (pegar 1 estrela tem que ser factível).
export function sprintParams(company = null, nPlayers = 4) {
  const s = company ? stageOf(company.valuation || 0).id : 0;
  const n = company?.sprints || 0;
  const heat = Math.min(1, n / 12);          // aquecimento nas primeiras sprints
  const k = s + heat;                          // "dificuldade" contínua (0 → ~5)
  const lerp = (a, b, t) => a + (b - a) * Math.min(1, t / 5);
  const ev = (a, b) => [Math.round(a * (1 - 0.1 * k)), Math.round(b * (1 - 0.1 * k))];
  const debut = n === 0;
  // variedade barata: 3 placas passeiam pela fileira 2 (client-only, sem persistência)
  const rnd = mulberry32(n + 1);
  const xs = [...OFFICE.shuffleRow.xs];
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[xs[i], xs[j]] = [xs[j], xs[i]]; }
  const pads = { ...OFFICE.pads };
  OFFICE.shufflePads.forEach((id, i) => { pads[id] = [xs[i], OFFICE.shuffleRow.z]; });
  const base = {
    ...OFFICE,
    pads,
    stage: s,
    sprintNo: n + 1,
    debut,
    name: `Sprint #${n + 1}`,
    subtitle: FLAVOR[s],
    duration: 240,
    maxOrders: Math.round(16 + k * 3),
    maxActive: 5,
    spawnEvery: [lerp(14, 9, k), lerp(20, 13, k)],
    types: { bug: lerp(0.5, 0.38, k), feature: 0.4, project: lerp(0.1, 0.22, k) },
    stars: (debut ? [400, 900, 1500] : [700, 1600, 2400]).map((v) => Math.round((v * (1 + 0.25 * s)) / 50) * 50),
    aiSpeed: 0.45,
    aiBugChance: lerp(0.3, 0.5, k),
    humanBugChance: 0.12,
    flakyChance: lerp(0.25, 0.42, k),
    reviewRejectChance: lerp(0.18, 0.28, k),
    reviewCatchChance: 0.6,
    conflictChance: lerp(0.1, 0.2, k),
    firstEventAt: Math.round(lerp(50, 25, k)),
    events: { hallucinate: ev(55, 85), meeting: ev(60, 95), wifi: ev(80, 120), prodBug: ev(120, 180) },
    firstLuckyAt: 30,
    lucky: { golden: [70, 110], cache: [60, 95] }, // intern agora é por mérito (streak), não por timer
  };
  return scaleForPlayers(base, nPlayers);
}
