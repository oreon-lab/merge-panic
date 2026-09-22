// Relay de salas: o navegador do host roda o jogo; o servidor só repassa mensagens.
import { WebSocketServer } from 'ws';

const rooms = new Map(); // code -> { host, clients: Map<id, ws>, nextId }
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_CLIENTS = 3;

function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };

function onConnection(ws) {
  ws.room = null;
  ws.id = null;
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const room = ws.room && rooms.get(ws.room);
    switch (m.t) {
      case 'host': {
        const code = newCode();
        rooms.set(code, { host: ws, clients: new Map(), nextId: 1 });
        ws.room = code; ws.id = 0;
        send(ws, { t: 'hosted', code, id: 0 });
        break;
      }
      case 'join': {
        const code = String(m.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) return send(ws, { t: 'error', msg: `Sala "${code}" não existe.` });
        if (r.clients.size >= MAX_CLIENTS) return send(ws, { t: 'error', msg: 'Sala cheia.' });
        const id = r.nextId++;
        r.clients.set(id, ws);
        ws.room = code; ws.id = id;
        send(ws, { t: 'joined', code, id });
        send(r.host, { t: 'peer-join', id });
        break;
      }
      case 'to-host':
        if (room && ws.id !== 0) send(room.host, { t: 'from', id: ws.id, d: m.d });
        break;
      case 'broadcast':
        if (room && ws.id === 0) {
          const data = JSON.stringify({ t: 'msg', d: m.d });
          for (const c of room.clients.values()) if (c.readyState === 1) c.send(data);
        }
        break;
      case 'send':
        if (room && ws.id === 0) { const c = room.clients.get(m.to); if (c) send(c, { t: 'msg', d: m.d }); }
        break;
    }
  });
  ws.on('close', () => {
    const room = ws.room && rooms.get(ws.room);
    if (!room) return;
    if (ws.id === 0) {
      for (const c of room.clients.values()) { send(c, { t: 'host-left' }); c.close(); }
      rooms.delete(ws.room);
    } else {
      room.clients.delete(ws.id);
      send(room.host, { t: 'peer-leave', id: ws.id });
    }
  });
}

export function attachRelay(httpServer) {
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', onConnection);
  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/mp')) return; // deixa o HMR do Vite em paz
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  // ping para manter conexões vivas atrás de proxies (ngrok)
  setInterval(() => wss.clients.forEach((c) => c.readyState === 1 && c.ping()), 20000).unref?.();
  return wss;
}
