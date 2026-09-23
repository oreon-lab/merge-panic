// Banco em arquivo JSON: simples, sem dependências, e suficiente pra um jogo co-op.
// Gravação atômica (arquivo temporário + rename) e agrupada, pra não bater no disco a cada compra.
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = process.env.MERGE_PANIC_DB || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'db.json');

let data = null;
let timer = null;

export function db() {
  if (data) return data;
  data = { profiles: {}, companies: {} };
  try {
    if (existsSync(FILE)) Object.assign(data, JSON.parse(readFileSync(FILE, 'utf8')));
  } catch (e) {
    console.error('[db] não consegui ler', FILE, e.message);
  }
  return data;
}

export function persist() {
  if (timer) return;
  timer = setTimeout(flush, 400);
}

export function flush() {
  clearTimeout(timer);
  timer = null;
  if (!data) return;
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, FILE);
  } catch (e) {
    console.error('[db] falha ao gravar', e.message);
  }
}

// garante que nada se perde ao desligar o servidor
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { flush(); process.exit(0); });
process.once('beforeExit', flush);
