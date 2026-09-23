// Servidor de produção: serve o build (dist/), a API de progressão e o relay multiplayer na mesma porta.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachRelay } from './relay.js';
import { apiMiddleware } from './api.js';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const PORT = process.env.PORT || 5199;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) return apiMiddleware(req, res);
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const path = normalize(join(DIST, url === '/' ? 'index.html' : url));
  if (!path.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('404');
  }
});
attachRelay(server);
server.listen(PORT, () => console.log(`Merge Panic em http://localhost:${PORT}`));
