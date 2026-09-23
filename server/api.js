// API de progressão: perfis, empresas, compras e resultado das sprints.
// A economia é decidida aqui; o navegador só faz pedidos.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db, persist } from './db.js';
import { OFFICE, sprintParams } from '../src/levels.js';
import { UPGRADE, buyBlock, nextLevelOf, stageOf, starsFor, payoutOf, listBuilds } from '../src/economy.js';

const MAX_BODY = 32 * 1024;
const MIN_SPRINT_SECONDS = 45;   // sprint mais curta aceitável (backlog zerado cedo)
const SPRINT_TTL = 60 * 60 * 1000;
const sprints = new Map();       // sprintId -> { companyId, hostId, params, startedAt, players }
const capOf = (p) => p.maxOrders * 400 + 5000; // teto de pontos plausível numa sprint

const hash = (s) => createHash('sha256').update(String(s)).digest('hex');
const newId = (p) => p + randomBytes(8).toString('hex');
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
// nomes aparecem na interface de outros jogadores: nada de tags (o cliente ainda escapa tudo)
const cleanName = (s, fallback) => {
  const v = String(s ?? '').replace(/[<>`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return v || fallback;
};

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

// ---------- formatos públicos ----------
const pubProfile = (p) => ({ id: p.id, name: p.name, named: !!p.named, xp: p.xp || 0, stats: p.stats, companyId: p.companyId });
const pubCompany = (c) => ({
  id: c.id, name: c.name, cash: c.cash, valuation: c.valuation, upgrades: c.upgrades, builds: c.builds || {},
  best: c.best || 0, bestStars: c.bestStars || 0, sprints: c.sprints, stage: stageOf(c.valuation).id,
});

function newCompany(ownerId, name) {
  const c = {
    id: newId('c_'), ownerId, name, cash: 0, valuation: 0, upgrades: {}, builds: {},
    best: 0, bestStars: 0, sprints: 0, createdAt: Date.now(),
  };
  db().companies[c.id] = c;
  return c;
}

function auth(req) {
  const [id, token] = String(req.headers['x-auth'] || '').split('.');
  const p = id && db().profiles[id];
  if (!p || !token) throw new HttpError(401, 'Sessão inválida');
  const a = Buffer.from(hash(token)), b = Buffer.from(p.tokenHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Sessão inválida');
  return p;
}
const companyOf = (p) => db().companies[p.companyId] || (() => { throw new HttpError(404, 'Empresa não encontrada'); })();

// ---------- rotas ----------
const routes = {
  // entra com id+token salvos no navegador, ou cria um perfil novo
  'POST /api/login'(req, body) {
    const d = db();
    const [id, token] = [body.id, body.token];
    const p = id && d.profiles[id];
    if (p && token && hash(token) === p.tokenHash) {
      p.lastSeen = Date.now();
      persist();
      return { profile: pubProfile(p), company: pubCompany(companyOf(p)) };
    }
    // perfil novo (com migração opcional do save antigo do navegador)
    const newToken = randomBytes(24).toString('hex');
    const np = {
      id: newId('p_'), tokenHash: hash(newToken), name: cleanName(body.name, 'Dev' + Math.floor(Math.random() * 900 + 100)),
      xp: 0, stats: { games: 0, delivered: 0, failed: 0, best: 0, bestCombo: 0, stars: 0 },
      createdAt: Date.now(), lastSeen: Date.now(), named: !!body.name,
    };
    const c = newCompany(np.id, `Startup do ${np.name}`);
    np.companyId = c.id;
    const lg = body.legacy;
    if (lg && typeof lg === 'object') {
      np.stats.games = clampInt(lg.games, 0, 5000);
      np.stats.best = clampInt(lg.best, 0, 20000);
      np.stats.stars = clampInt(lg.stars, 0, 5000);
      np.stats.delivered = clampInt(lg.delivered, 0, 100000);
      c.best = clampInt(lg.best, 0, 20000);
      // "investimento anjo": quem já jogava começa com um caixa
      const seed = Math.min(np.stats.stars * 150, 3000);
      c.cash = seed; c.valuation = seed;
    }
    d.profiles[np.id] = np;
    persist();
    return { profile: pubProfile(np), company: pubCompany(c), token: newToken, created: true };
  },

  'GET /api/me'(req) {
    const p = auth(req);
    return { profile: pubProfile(p), company: pubCompany(companyOf(p)) };
  },

  'POST /api/profile'(req, body) {
    const p = auth(req);
    p.name = cleanName(body.name, p.name);
    p.named = true;
    persist();
    return { profile: pubProfile(p) };
  },

  'POST /api/company'(req, body) {
    const p = auth(req);
    const c = companyOf(p);
    c.name = cleanName(body.name, c.name);
    persist();
    return { company: pubCompany(c) };
  },

  // id: 'build:desk0' (expansão) ou 'up:monitor' (melhoria). Durante a sprint o host
  // manda o quanto ela já rendeu: dá pra gastar antes de a sprint fechar (o acerto vem no fim).
  'POST /api/buy'(req, body) {
    const p = auth(req);
    const c = companyOf(p);
    c.builds ||= {};
    const id = String(body.id || '');
    let extra = 0;
    const s = body.sprintId && sprints.get(body.sprintId);
    if (s && s.hostId === p.id) extra = payoutOf(s.params.stage, clampInt(body.score, 0, capOf(s.params)), 0);
    // o caixa já desconta as compras anteriores; a folga é tudo que a sprint rendeu até agora
    const why = buyBlock(c, id, OFFICE.map, extra);
    if (why) throw new HttpError(409, why);
    let bought;
    if (id.startsWith('build:')) {
      const b = listBuilds(OFFICE.map).find((x) => x.id === id.slice(6));
      c.cash -= b.price;
      c.builds[b.id] = true;
      bought = { id, type: b.type, x: b.x, z: b.z, price: b.price, name: b.name };
    } else {
      const uid = id.replace(/^up:/, '');
      if (!UPGRADE[uid]) throw new HttpError(400, 'Melhoria desconhecida');
      const next = nextLevelOf(c.upgrades, uid);
      c.cash -= next.price;
      c.upgrades[uid] = next.n;
      bought = { id: 'up:' + uid, level: next.n, price: next.price, name: UPGRADE[uid].name };
    }
    persist();
    return { company: pubCompany(c), bought };
  },

  // o host avisa que a sprint começou; recebe um recibo pra fechar depois
  'POST /api/sprint/start'(req, body) {
    const p = auth(req);
    const c = companyOf(p);
    const params = sprintParams(c); // dificuldade vem do estágio da empresa
    const now = Date.now();
    for (const [k, s] of sprints) if (now - s.startedAt > SPRINT_TTL) sprints.delete(k);
    const players = [...new Set((body.players || []).filter((x) => typeof x === 'string' && db().profiles[x]))].slice(0, 4);
    const sprintId = newId('s_');
    sprints.set(sprintId, { companyId: c.id, hostId: p.id, params: { stage: params.stage, stars: params.stars, maxOrders: params.maxOrders }, startedAt: now, players });
    return { sprintId, sprintNo: params.sprintNo };
  },

  'POST /api/sprint/end'(req, body) {
    const p = auth(req);
    const s = sprints.get(body.sprintId);
    if (!s || s.hostId !== p.id) throw new HttpError(404, 'Sprint desconhecida (já registrada?)');
    const secs = (Date.now() - s.startedAt) / 1000;
    if (secs < MIN_SPRINT_SECONDS) throw new HttpError(422, 'Sprint curta demais para valer');
    sprints.delete(body.sprintId);

    const lv = s.params;
    const score = clampInt(body.score, 0, capOf(lv));
    const stars = starsFor(lv, score);            // estrelas recalculadas aqui, não confiamos no cliente
    const delivered = clampInt(body.delivered, 0, lv.maxOrders * 3);
    const failed = clampInt(body.failed, 0, lv.maxOrders * 3);
    const combo = clampInt(body.combo, 0, 200);
    const payout = payoutOf(lv.stage, score, stars);

    const d = db();
    const c = d.companies[s.companyId];
    const stageBefore = stageOf(c.valuation).id;
    const prevBest = c.best || 0;
    c.cash += payout;
    c.valuation += payout;
    c.sprints += 1;
    c.best = Math.max(prevBest, score);
    c.bestStars = Math.max(c.bestStars || 0, stars);
    const stageAfter = stageOf(c.valuation).id;

    // todo mundo que jogou (host + convidados) leva o histórico pessoal
    const xp = Math.round(payout / 10);
    for (const id of new Set([p.id, ...s.players])) {
      const q = d.profiles[id];
      if (!q) continue;
      q.stats.games += 1;
      q.stats.delivered += delivered;
      q.stats.failed += failed;
      q.stats.stars += stars;
      q.stats.best = Math.max(q.stats.best, score);
      q.stats.bestCombo = Math.max(q.stats.bestCombo, combo);
      q.xp = (q.xp || 0) + xp;
    }
    persist();
    return {
      payout, stars, score, xp, record: score > prevBest && score > 0, prevBest,
      stageUp: stageAfter > stageBefore ? stageAfter : null,
      company: pubCompany(c), profile: pubProfile(p),
    };
  },
};

// ---------- middleware (Vite em dev, http puro em produção) ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (ch) => {
      size += ch.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Corpo grande demais')); req.destroy(); return; }
      chunks.push(ch);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'JSON inválido')); }
    });
    req.on('error', reject);
  });
}

export async function apiMiddleware(req, res, next) {
  const path = (req.url || '').split('?')[0];
  if (!path.startsWith('/api/')) return next?.();
  const route = routes[`${req.method} ${path}`];
  const reply = (status, obj) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(obj));
  };
  if (!route) return reply(404, { error: 'Rota não encontrada' });
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    reply(200, await route(req, body));
  } catch (e) {
    if (!(e instanceof HttpError)) console.error('[api]', e);
    reply(e.status || 500, { error: e instanceof HttpError ? e.message : 'Erro no servidor' });
  }
}
