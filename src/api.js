// Cliente da API de progressão (mesma origem da página).
import { identity } from './save.js';

async function call(method, path, body) {
  const id = identity.get();
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(id ? { 'x-auth': `${id.id}.${id.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* resposta vazia */ }
  if (!res.ok) {
    const e = new Error(data.error || `Erro ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

export const api = {
  // entra com a identidade salva (ou cria uma, migrando o save antigo)
  async login(name) {
    const id = identity.get();
    const r = await call('POST', '/api/login', { id: id?.id, token: id?.token, name, legacy: id ? undefined : identity.legacy() });
    if (r.token) identity.set({ id: r.profile.id, token: r.token });
    return r;
  },
  me: () => call('GET', '/api/me'),
  rename: (name) => call('POST', '/api/profile', { name }),
  renameCompany: (name) => call('POST', '/api/company', { name }),
  buy: (id, extra = {}) => call('POST', '/api/buy', { id, ...extra }),
  sprintStart: (players, n) => call('POST', '/api/sprint/start', { players, n }),
  sprintEnd: (payload) => call('POST', '/api/sprint/end', payload),
};
