import assert from 'node:assert/strict';
import { it } from 'node:test';
import { loadEnv } from '../src/env.ts';

const base = { DATABASE_URL: 'postgres://u:p@h/db', TEMPORAL_ADDRESS: 'localhost:7233', TEMPORAL_NAMESPACE: 'default' };

it('accepts a complete development configuration', () => {
  assert.equal(loadEnv(base).TEMPORAL_NAMESPACE, 'default');
});

it('lists missing settings without printing values', () => {
  assert.throws(
    () => loadEnv({ DATABASE_URL: 'postgres://u:secret@h/db' }),
    (e: Error) => /TEMPORAL_ADDRESS/.test(e.message) && !e.message.includes('secret'),
  );
});

it('refuses local-development credentials in production', () => {
  assert.throws(
    () => loadEnv({ ...base, NODE_ENV: 'production', DATABASE_URL: 'postgres://u:local-dev-only-pg-app@h/db' }),
    /local-development credentials/,
  );
  assert.equal(loadEnv({ ...base, NODE_ENV: 'production' }).NODE_ENV, 'production');
});
