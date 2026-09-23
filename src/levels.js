// Legenda do mapa:
// # parede   . chão   C bancada   B backlog   D mesa de dev   T testes (CI)
// R code review   M merge   X lixeira (won't fix)   K café   P planta   1-4 spawn
// A agente de IA   W roteador Wi-Fi   S rack de produção
//
// Os mapas são 15x11 (paredes nas bordas), com as 4 posições de spawn e cada
// estação interativa encostada em pelo menos um tile de chão alcançável.
//
// Limites de estrela derivados do modelo analítico que espelha deliverTicket
// (gorjeta + combo), por perfil: 1★ = p10 do casual, 2★ = p10 do bom,
// 3★ = p10 do excelente, arredondado pra cima na centena.
export const LEVELS = [
  {
    id: 'sprint1',
    name: 'Sprint 1 — Primeiro Dia',
    subtitle: 'Onboarding: aprenda o fluxo antes que tudo pegue fogo.',
    duration: 300,
    maxOrders: 20,
    maxActive: 4,
    spawnEvery: [13, 19],
    types: { bug: 0.45, feature: 0.42, project: 0.13 },
    stars: [700, 1600, 2400],
    // caos
    aiSpeed: 0.45,          // IA leva 45% do tempo de um humano
    aiBugChance: 0.35,
    humanBugChance: 0.12,   // dev sozinho; pair programming não gera bug
    flakyChance: 0.3,       // bug passa nos testes e vai pra produção
    reviewRejectChance: 0.2,
    reviewCatchChance: 0.6, // review acha bug que escapou dos testes
    conflictChance: 0.12,   // +0.3 se outro merge aconteceu há pouco
    firstEventAt: 45,
    events: { hallucinate: [50, 80], meeting: [60, 95], wifi: [80, 120], prodBug: [120, 180] },
    // bênçãos: sorteios que ajudam o time, pra curva não ser só de atrito
    firstLuckyAt: 30,
    lucky: { golden: [70, 110], cache: [60, 95], intern: [85, 125] },
    map: [
      '###############',
      '#BCDDCDDAACTTW#',
      '#.............#',
      '#C..1.....2..C#',
      '#S...........C#',
      '#X...CCCCC...R#',
      '#C...........R#',
      '#C..3.....4..C#',
      '#.............#',
      '#CPCCMMCCKCCPC#',
      '###############',
    ],
  },
  {
    id: 'sprint2',
    name: 'Sprint 2 — Era da IA',
    subtitle: 'Contrataram três agentes e demitiram uma mesa. Confia.',
    duration: 300,
    maxOrders: 24,
    maxActive: 5,
    spawnEvery: [11, 16],
    types: { bug: 0.5, feature: 0.38, project: 0.12 },
    stars: [800, 1800, 2800],
    aiSpeed: 0.4,           // IA mais rápida...
    aiBugChance: 0.45,      // ...e bem mais propensa a deixar bug
    humanBugChance: 0.12,
    flakyChance: 0.34,
    reviewRejectChance: 0.24,
    reviewCatchChance: 0.6,
    conflictChance: 0.16,
    firstEventAt: 35,
    events: { hallucinate: [45, 70], meeting: [55, 85], wifi: [70, 105], prodBug: [100, 150] },
    firstLuckyAt: 30,
    lucky: { golden: [70, 110], cache: [60, 95], intern: [85, 125] },
    map: [
      '###############',
      '#BCDDDCAAATTWC#',
      '#.............#',
      '#C..1.....2..C#',
      '#S...........C#',
      '#X...CCCCC...R#',
      '#C...........R#',
      '#C..3.....4..C#',
      '#.............#',
      '#CPCCMCCKCCCPC#',
      '###############',
    ],
  },
  {
    id: 'sprint3',
    name: 'Sprint 3 — Deploy na Sexta',
    subtitle: 'Mesmo escritório, sexta 17h50. Boa sorte.',
    duration: 300,
    maxOrders: 26,
    maxActive: 5,
    spawnEvery: [9, 14],
    types: { bug: 0.42, feature: 0.43, project: 0.15 },
    stars: [900, 2100, 3300],
    aiSpeed: 0.38,
    aiBugChance: 0.5,
    humanBugChance: 0.14,
    flakyChance: 0.42,
    reviewRejectChance: 0.28,
    reviewCatchChance: 0.55,
    conflictChance: 0.2,
    firstEventAt: 25,
    events: { hallucinate: [40, 60], meeting: [45, 75], wifi: [60, 90], prodBug: [80, 120] },
    firstLuckyAt: 25,
    lucky: { golden: [60, 95], cache: [55, 85], intern: [75, 110] },
    map: [
      '###############',
      '#BCDDCDDAAACTW#',
      '#.............#',
      '#C..1.....2..C#',
      '#S...........C#',
      '#X...CCCCC...R#',
      '#C...........R#',
      '#C..3.....4..C#',
      '#.............#',
      '#CPCCMMCCKCCPC#',
      '###############',
    ],
  },
];
