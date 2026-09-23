// Persistência local do jogador (recorde, estrelas, preferências).
// Tudo defensivo: localStorage lança em modo privado e estoura em cota cheia.
const KEY = 'merge-panic:v1';

const DEF = {
  best: 0,        // melhor pontuação numa sprint
  bestCombo: 0,   // maior sequência de entregas
  games: 0,       // sprints jogadas
  delivered: 0,   // tickets entregues (vida toda)
  failed: 0,      // tickets perdidos (vida toda)
  stars: 0,       // estrelas acumuladas
  muted: false,
};

let data = null;

function load() {
  if (data) return data;
  data = { ...DEF };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(data, JSON.parse(raw));
  } catch {
    // sem save disponível: segue com os padrões
  }
  return data;
}

function flush() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // não conseguiu gravar: a sessão continua funcionando em memória
  }
}

export const save = {
  get best() { return load().best; },
  get bestCombo() { return load().bestCombo; },
  get games() { return load().games; },
  get stars() { return load().stars; },
  get muted() { return load().muted; },
  set muted(v) { load().muted = !!v; flush(); },

  // Registra o resultado de uma sprint. Retorna { prev, isRecord }.
  run({ score = 0, stars = 0, delivered = 0, failed = 0, combo = 0 } = {}) {
    const d = load();
    const prev = d.best;
    d.best = Math.max(prev, score);
    d.bestCombo = Math.max(d.bestCombo, combo);
    d.games += 1;
    d.delivered += delivered;
    d.failed += failed;
    d.stars += stars;
    flush();
    return { prev, isRecord: score > prev && score > 0 };
  },

  wipe() {
    data = { ...DEF };
    flush();
  },
};
