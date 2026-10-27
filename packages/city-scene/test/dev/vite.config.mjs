// Dev-only harness for the A2 life systems: `vite --config packages/city-scene/test/dev/vite.config.mjs`.
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
export default {
  root,
  server: {
    port: 3202,
    strictPort: true,
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
  oxc: { jsx: { runtime: 'automatic' } },
  logLevel: 'info',
};
