import { defineConfig } from 'vite';
import { attachRelay } from './server/relay.js';
import { apiMiddleware } from './server/api.js';

// Relay multiplayer (/mp) e API de progressão (/api) na mesma porta do Vite
const relay = () => ({
  name: 'merge-panic-relay',
  configureServer(server) {
    server.middlewares.use(apiMiddleware);
    if (server.httpServer) attachRelay(server.httpServer);
  },
  configurePreviewServer(server) {
    server.middlewares.use(apiMiddleware);
    if (server.httpServer) attachRelay(server.httpServer);
  },
});

export default defineConfig({
  plugins: [relay()],
  server: {
    port: 5199,
    strictPort: true,
    host: true,
    // libera túneis ngrok (qualquer subdomínio)
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io', '.vercel.app', '.hyzecloud.app'],
  },
});
