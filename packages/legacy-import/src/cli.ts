import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MappingError } from './plan.js';
import { apply, dryRun, ImportRefused } from './run.js';

/**
 * pnpm --filter @agentcity/legacy-import legacy-import <dry-run|apply> --state FILE --auth FILE --mapping FILE [--out report.json]
 * Inputs must be read-only copies of the originals (MIGRATION-MAP "Identity and legacy-state import").
 */
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    state: { type: 'string' },
    auth: { type: 'string' },
    mapping: { type: 'string' },
    out: { type: 'string' },
  },
});
const mode = positionals[0];
if ((mode !== 'dry-run' && mode !== 'apply') || !values.state || !values.auth || !values.mapping) {
  console.error('usage: import <dry-run|apply> --state FILE --auth FILE --mapping FILE [--out report.json]');
  process.exit(64);
}
const inputs = {
  statePath: resolve(values.state),
  authPath: resolve(values.auth),
  mappingPath: resolve(values.mapping),
};
if (values.out && Object.values(inputs).includes(resolve(values.out))) {
  console.error('--out must not be one of the inputs');
  process.exit(64);
}
try {
  const result =
    mode === 'dry-run'
      ? await dryRun(inputs, required('DATABASE_URL'))
      : await apply(inputs, required('DATABASE_ADMIN_URL'));
  const text = JSON.stringify(result, null, 2) + '\n';
  if (values.out) writeFileSync(values.out, text);
  else process.stdout.write(text);
  console.error(`${mode}: ok`);
} catch (err) {
  if (err instanceof ImportRefused || err instanceof MappingError) {
    console.error(`${mode} refused, nothing written: ${err.message}`);
    process.exit(2);
  }
  throw err;
}

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}
