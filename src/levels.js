// Legenda do mapa:
// # parede   . chão   C bancada   B backlog   D mesa de dev   T testes (CI)
// R code review   M merge   X lixeira (won't fix)   K café   P planta   1-4 spawn
// A agente de IA   W roteador Wi-Fi   S rack de produção
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
    // Limites derivados da distribuição real de pontos (combo incluído):
    // 800 = p10 de uma sprint ruim (1★ quase garantido), 1700 = p10 de quem
    // encadeia bem, 2500 = p10 de quem sustenta o combo de ponta a ponta.
    stars: [800, 1700, 2500],
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
];
