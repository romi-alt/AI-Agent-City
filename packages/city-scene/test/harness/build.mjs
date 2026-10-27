// Dev-only: bundles the A3 test harness (stand-in buildings + the real camera, interior and HUD) into dist/ so a
// browser can open it from file:// — no server or port needed. Uses the esbuild that tsx already brings.
import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const requireFromTsx = createRequire(createRequire(join(here, '../../package.json')).resolve('tsx/package.json'));
const esbuild = requireFromTsx('esbuild');

await esbuild.build({
  entryPoints: [join(here, 'main.tsx')],
  bundle: true,
  outfile: join(here, 'dist/harness.js'),
  format: 'iife',
  jsx: 'automatic',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"development"' },
  loader: { '.json': 'json' },
  logLevel: 'warning',
});
copyFileSync(join(here, 'index.html'), join(here, 'dist/index.html'));
console.log('harness built:', join(here, 'dist/index.html'));
