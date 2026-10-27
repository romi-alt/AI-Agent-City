import assert from 'node:assert/strict';
import { it } from 'node:test';
import { loadEnv } from '../src/env.ts';

const base = {
  DATABASE_URL: 'postgres://u:p@h/db',
  REDIS_URL: 'redis://h',
  S3_ENDPOINT: 'http://h:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'a',
  S3_SECRET_KEY: 'b',
  S3_BUCKET: 'bucket',
  TEMPORAL_ADDRESS: 'h:7233',
  TEMPORAL_NAMESPACE: 'default',
  PUBLIC_ORIGIN: 'https://app.example.test',
  OIDC_ISSUER: 'https://id.example.test/realms/agentcity',
  OIDC_CLIENT_ID: 'agentcity-bff',
  OIDC_CLIENT_SECRET: 'a-client-secret-of-some-length',
  OIDC_REDIRECT_URI: 'https://app.example.test/api/auth/callback',
  OIDC_POST_LOGOUT_REDIRECT_URI: 'https://app.example.test/signed-out',
  SESSION_ENCRYPTION_KEY: 'k'.repeat(32),
};

it('accepts a complete configuration with safe defaults', () => {
  const env = loadEnv(base);
  assert.equal(env.API_PORT, 4000);
  assert.equal(env.ENABLE_DEV_ROUTES, false);
});

it('lists every missing setting without printing values', () => {
  assert.throws(
    () => loadEnv({ DATABASE_URL: 'postgres://u:hunter2@h/db' }),
    (e: Error) => /REDIS_URL/.test(e.message) && /S3_BUCKET/.test(e.message) && !e.message.includes('hunter2'),
  );
});

it('refuses local-development credentials and dev routes in production', () => {
  assert.throws(
    () => loadEnv({ ...base, NODE_ENV: 'production', S3_SECRET_KEY: 'local-dev-only-s3-secret' }),
    /local-development credentials/,
  );
  assert.throws(() => loadEnv({ ...base, NODE_ENV: 'production', ENABLE_DEV_ROUTES: 'true' }), /ENABLE_DEV_ROUTES/);
  assert.equal(loadEnv({ ...base, NODE_ENV: 'production' }).NODE_ENV, 'production');
});

it('refuses insecure cookies and plain-http identity URLs in production', () => {
  assert.throws(() => loadEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' }), /COOKIE_SECURE/);
  assert.throws(
    () => loadEnv({ ...base, NODE_ENV: 'production', OIDC_ISSUER: 'http://id.example.test/realms/x' }),
    /OIDC_ISSUER must use https/,
  );
  assert.equal(loadEnv(base).COOKIE_SECURE, true, 'secure cookies by default');
});
