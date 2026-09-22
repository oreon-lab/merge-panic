import { buildTicketMesh } from './models.js';

export const STEPS = {
  code:   { label: 'Implementar', icon: '💻', station: 'desk',   manual: true },
  test:   { label: 'Testar',      icon: '🧪', station: 'test',   manual: false },
  review: { label: 'Code Review', icon: '👀', station: 'review', manual: true },
  merge:  { label: 'Merge',       icon: '🔀', station: 'merge',  manual: false },
  fix:    { label: 'Corrigir',    icon: '🔧', station: 'desk',   manual: true },
};

// códigos curtos para a rede
export const STEP_CODE = { code: 'c', test: 't', review: 'r', merge: 'm', fix: 'f' };
export const CODE_STEP = Object.fromEntries(Object.entries(STEP_CODE).map(([k, v]) => [v, k]));

export const TYPES = {
  bug: {
    label: 'Bug', icon: '🐞', steps: ['code', 'test', 'merge'],
    time: 80, points: 20, work: { code: 3.5, test: 3, merge: 2 },
  },
  feature: {
    label: 'Feature', icon: '✨', steps: ['code', 'test', 'review', 'merge'],
    time: 110, points: 40, work: { code: 5.5, test: 3.5, review: 2.5, merge: 2 },
  },
  project: {
    label: 'Projeto', icon: '🚀', steps: ['code', 'test', 'review', 'merge'],
    time: 160, points: 80, work: { code: 11, test: 5, review: 4, merge: 2.5, fix: 4 },
  },
  hotfix: {
    label: 'Hotfix', icon: '🚨', steps: ['code', 'test', 'merge'],
    time: 60, points: 35, penalty: 30, work: { code: 3, test: 2.5, merge: 1.5 },
  },
};

const NAMES = {
  bug: [
    'Login só funciona às terças', 'Data aparece como 1970', 'Botão salvar apaga tudo',
    'Quebrou no Safari (de novo)', 'undefined is not a function', 'Modal que não fecha',
    'Emoji derruba o banco', 'Loop infinito no checkout', 'Carrinho com -3 itens',
    'Senha aparece no log', 'Scroll infinito... de verdade', 'Timezone do servidor em Marte',
  ],
  feature: [
    'Dark mode', 'Exportar pra Excel', 'Login com QR code', 'Notificação push',
    'Filtro por data', 'Botão de "desfazer"', 'Avatar animado', 'Tela de onboarding',
    'Busca com autocomplete', 'Modo offline', 'Confete ao pagar', 'Chat com o suporte',
  ],
  project: [
    'Migrar pra microsserviços', 'App mobile do zero', 'Reescrever tudo em Rust',
    'Blockchain no cardápio', 'IA que faz café', 'Design system completo',
    'Checkout em 1 clique', 'Painel de métricas',
  ],
  hotfix: ['Produção fora do ar', 'Checkout retornando 500', 'Preço R$ 0,00 em tudo', 'Login desloga todo mundo'],
};

let nextId = 1;
const used = new Set();

export class Ticket {
  constructor(type, net = null) {
    this.id = net ? net.id : nextId++;
    this.type = type;
    this.def = TYPES[type];
    if (net) this.name = net.name;
    else this.pickName(type);
    this.steps = [...this.def.steps];
    this.stepIndex = 0;
    this.progress = 0;
    this.timeLimit = this.def.time;
    this.timeLeft = this.def.time;
    this.state = 'waiting'; // waiting | active | done | failed
    this.coders = new Set();
    this.touchers = new Set();
    this.mesh = null;
    this.holder = null; // { kind: 'player' | 'station', ref }
    this.bugged = false;   // bug escondido (IA ou dev sozinho)
    this.escaped = false;  // bug passou nos testes → vai pra produção
    this.rejected = false; // review já pediu mudanças uma vez
    this.conflict = false;
  }
  pickName(type) {
    const pool = NAMES[type].filter((n) => !used.has(n));
    this.name = (pool.length ? pool : NAMES[type])[Math.floor(Math.random() * (pool.length || NAMES[type].length))];
    used.add(this.name);
    if (used.size > 24) used.clear();
  }
  get step() { return this.steps[this.stepIndex]; }
  get stepDef() { return STEPS[this.step]; }
  get work() { return this.def.work[this.step] ?? (this.step === 'fix' ? 2.5 : 3); }
  // volta o ticket: insere etapas antes da atual
  insertSteps(...steps) {
    this.steps.splice(this.stepIndex, 0, ...steps);
    this.progress = 0;
  }
  createMesh() {
    this.mesh = buildTicketMesh(this.type);
    return this.mesh;
  }
}
