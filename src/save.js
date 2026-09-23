// O progresso vive no servidor. Aqui fica só o que é deste navegador:
// a identidade (id + token), preferências e o save antigo para migração.
// Tudo defensivo: localStorage lança em modo privado e estoura em cota cheia.
const ID_KEY = 'merge-panic:id';
const PREF_KEY = 'merge-panic:prefs';
const LEGACY_KEY = 'merge-panic:v1';

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* segue em memória */ } };

export const identity = {
  get() {
    const v = read(ID_KEY);
    return v && v.id && v.token ? v : null;
  },
  set(v) { write(ID_KEY, v); },
  clear() { try { localStorage.removeItem(ID_KEY); } catch { /* ok */ } },
  // código de recuperação: leva a conta pra outro navegador
  code() { const v = this.get(); return v ? `${v.id}.${v.token}` : ''; },
  restore(code) {
    const [id, token] = String(code || '').trim().split('.');
    if (!id?.startsWith('p_') || !token) return false;
    this.set({ id, token });
    return true;
  },
  // progresso salvo localmente antes da economia no servidor
  legacy() { return read(LEGACY_KEY); },
};

const prefs = read(PREF_KEY) || { muted: read(LEGACY_KEY)?.muted || false };
export const save = {
  get muted() { return !!prefs.muted; },
  set muted(v) { prefs.muted = !!v; write(PREF_KEY, prefs); },
};
