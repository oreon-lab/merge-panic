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
    '#BCDDddCaaCtTW#',
    '#.............#',
    '#C..1.....2..C#',
    '#S...........C#',
    '#X...CCCCC...R#',
    '#C...........r#',
    '#C..3.....4..C#',
    '#.............#',
    '#CPCkMmCCCCCPC#',
    '###############',
  ],
  // placas das melhorias (no chão, perto de onde fazem efeito). [x, z] no mapa
  pads: {
    servers: [2, 4], monitor: [4, 2], aiv2: [8, 2], mesh: [12, 2], ci: [10, 4], coverage: [11, 4],
    plants: [2, 6], floor: [4, 6], coffee: [4, 8], gitflow: [7, 8], linter: [11, 6],
  },
};

// sabor de cada estágio da empresa
const FLAVOR = [
  'Garagem: café solúvel e fé no deploy.',
  'Startup: o investidor pediu "mais IA".',
  'Scale-up: mais clientes, mais caos.',
  'Unicórnio: todo mundo quer tudo pra ontem.',
  'Big Tech: sexta-feira, 17h50, deploy global.',
];

// Parâmetros da próxima sprint, derivados do estágio da empresa e de quantas sprints já jogou.
// Tudo sobe devagar: mais pedidos, mais caos, estrelas mais caras (e pagamento maior).
export function sprintParams(company = null) {
  const s = company ? stageOf(company.valuation || 0).id : 0;
  const n = company?.sprints || 0;
  const heat = Math.min(1, n / 12);          // aquecimento nas primeiras sprints
  const k = s + heat;                          // "dificuldade" contínua (0 → ~5)
  const lerp = (a, b, t) => a + (b - a) * Math.min(1, t / 5);
  const ev = (a, b) => [Math.round(a * (1 - 0.1 * k)), Math.round(b * (1 - 0.1 * k))];
  return {
    ...OFFICE,
    stage: s,
    sprintNo: n + 1,
    name: `Sprint #${n + 1}`,
    subtitle: FLAVOR[s],
    duration: 300,
    maxOrders: Math.round(16 + k * 3),
    maxActive: 4 + (k >= 2 ? 1 : 0),
    spawnEvery: [lerp(14, 9, k), lerp(20, 13, k)],
    types: { bug: lerp(0.5, 0.38, k), feature: 0.4, project: lerp(0.1, 0.22, k) },
    stars: [700, 1600, 2400].map((v) => Math.round((v * (1 + 0.25 * s)) / 50) * 50),
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
    lucky: { golden: [70, 110], cache: [60, 95], intern: [85, 125] },
  };
}
