import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** In dev, serve the proposal page at /proposal (the production server does the same). */
const proposalRoute: Plugin = {
  name: 'proposal-route',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/proposal\/?(\?|$)/.test(req.url)) req.url = req.url.replace(/^\/proposal\/?/, '/proposal.html');
      next();
    });
  },
};

export default defineConfig({
  plugins: [proposalRoute],
  server: {
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: false } },
  },
  build: {
    rollupOptions: { input: { main: resolve('index.html'), proposal: resolve('proposal.html') } },
  },
});
