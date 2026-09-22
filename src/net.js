// Cliente do relay WebSocket (mesma origem da página, caminho /mp).
export class Net {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.id = null;
    this.code = null;
  }

  on(type, fn) { this.handlers[type] = fn; return this; }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      this.ws = new WebSocket(`${proto}://${location.host}/mp`);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('Não foi possível conectar ao servidor.'));
      this.ws.onclose = () => this.handlers.close?.();
      this.ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        this.handlers[m.t]?.(m);
      };
    });
  }

  // Resolve com a primeira resposta 'ok' ou rejeita com 'error'
  request(msg, ok) {
    return new Promise((resolve, reject) => {
      const prevOk = this.handlers[ok], prevErr = this.handlers.error;
      this.handlers[ok] = (m) => { this.handlers[ok] = prevOk; this.handlers.error = prevErr; resolve(m); };
      this.handlers.error = (m) => { this.handlers[ok] = prevOk; this.handlers.error = prevErr; reject(new Error(m.msg)); };
      this.send(msg);
    });
  }

  async host() {
    await this.connect();
    const m = await this.request({ t: 'host' }, 'hosted');
    this.id = m.id; this.code = m.code;
    return m;
  }

  async join(code) {
    await this.connect();
    const m = await this.request({ t: 'join', code }, 'joined');
    this.id = m.id; this.code = m.code;
    return m;
  }

  send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  toHost(d) { this.send({ t: 'to-host', d }); }
  broadcast(d) { this.send({ t: 'broadcast', d }); }
  sendTo(to, d) { this.send({ t: 'send', to, d }); }
  close() { this.handlers.close = null; this.ws?.close(); }
}
