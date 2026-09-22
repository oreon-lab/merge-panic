import { defineConfig } from 'vite';
import { attachRelay } from './server/relay.js';

// Relay multiplayer na mesma porta do Vite (caminho /mp)
const relay = () => ({
  name: 'merge-panic-relay',
  configureServer(server) { if (server.httpServer) attachRelay(server.httpServer); },
  configurePreviewServer(server) { if (server.httpServer) attachRelay(server.httpServer); },
});

export default defineConfig({
  plugins: [relay()],
  server: {
    port: 5199,
    strictPort: true,
    host: true,
    // libera túneis ngrok (qualquer subdomínio)
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io'],
  },
});
