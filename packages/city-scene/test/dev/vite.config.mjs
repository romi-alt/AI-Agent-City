// Dev-only harness for the A2 life systems: `vite --config packages/city-scene/test/dev/vite.config.mjs`.
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
export default {
  root,
  // Serve apps/web's public files (the character model) as the web app does.
  publicDir: fileURLToPath(new URL('../../../../apps/web/public', import.meta.url)),
  server: {
    port: 3202,
    strictPort: true,
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
  oxc: { jsx: { runtime: 'automatic' } },
  logLevel: 'info',
};
