#!/usr/bin/env node
// M01 end-to-end smoke check against the local stack (pnpm infra:up && pnpm infra:init && pnpm build first).
//
// Starts the built API, worker and web app as child processes, then proves:
//   1. API liveness and readiness (REST and GraphQL) with every dependency up;
//   2. the web app renders the API's readiness (a real web -> API request);
//   3. a heartbeat workflow round trip through Temporal and the worker into PostgreSQL;
//   4. a workflow survives a worker crash: worker A is killed mid-workflow, worker B finishes it,
//      and each step is recorded exactly once;
//   5. Keycloak serves the realm's OIDC discovery document;
//   6. readiness turns 503 when PostgreSQL or object storage is stopped, and recovers when they return.
// Writes planning/agentcity-migration/m01/evidence/smoke.json and per-process logs, and exits 1 on any failure.
// Nothing here sends anything outside this machine.
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const EVIDENCE = join(ROOT, 'planning/agentcity-migration/m01/evidence');
const LOGS = join(EVIDENCE, 'smoke-logs');
mkdirSync(LOGS, { recursive: true });
process.loadEnvFile(join(ROOT, 'infra/local-dev.env'));

const API = process.env.API_URL;
const WEB = `http://127.0.0.1:${process.env.WEB_PORT}`;
const COMPOSE = ['compose', '-f', join(ROOT, 'infra/compose.yaml'), '--env-file', join(ROOT, 'infra/local-dev.env')];
const children = new Set();
const results = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function start(name, cwd, args, env = {}) {
  const log = createWriteStream(join(LOGS, `${name}.log`), { flags: 'a' });
  const child = spawn(process.execPath, args, {
    cwd: join(ROOT, cwd),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}

function stop(child, signal = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    child.once('exit', resolve);
    child.kill(signal);
  });
}

async function waitFor(label, fn, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  let last;
  while (Date.now() < until) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (err) {
      last = err;
    }
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${label}${last ? `: ${last.message}` : ''}`);
}

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  return { status: res.status, body: await res.json() };
}

function psql(sql) {
  return execFileSync(
    'docker',
    [
      ...COMPOSE,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      process.env.POSTGRES_ADMIN_USER,
      '-d',
      process.env.POSTGRES_DB,
      '-tAc',
      sql,
    ],
    { encoding: 'utf8' },
  ).trim();
}

const compose = (...args) => execFileSync('docker', [...COMPOSE, ...args], { stdio: 'ignore' });

async function check(name, fn) {
  const startedAt = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - startedAt, detail });
    console.log(`ok   ${name}`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - startedAt, error: err.message });
    console.log(`FAIL ${name}: ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const readiness = () => getJson(`${API}/health/ready`);

async function main() {
  const api = start('api', 'apps/api', ['--env-file-if-exists=../../infra/local-dev.env', 'dist/main.js'], {
    ENABLE_DEV_ROUTES: 'true',
  });
  let workerA = start('worker-a', 'apps/worker', ['--env-file-if-exists=../../infra/local-dev.env', 'dist/main.js'], {
    WORKER_ID: 'smoke-worker-a',
  });
  const web = start('web', 'apps/web', [
    '--env-file-if-exists=../../infra/local-dev.env',
    './node_modules/next/dist/bin/next',
    'start',
    '-p',
    process.env.WEB_PORT,
    '-H',
    '127.0.0.1',
  ]);
  void api;
  void web;

  await waitFor('API liveness', async () => (await getJson(`${API}/health/live`)).status === 200);
  await waitFor('web app', async () => (await fetch(WEB)).ok);

  await check('API liveness', async () => {
    const r = await getJson(`${API}/health/live`);
    assert(r.status === 200 && r.body.status === 'alive', `got ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  });

  await check('API readiness with every dependency up', async () => {
    const r = await waitFor('ready', async () => {
      const x = await readiness();
      return x.status === 200 ? x : null;
    });
    assert(r.body.status === 'ready', JSON.stringify(r.body));
    assert(r.body.checks.length === 4 && r.body.checks.every(c => c.ok), JSON.stringify(r.body.checks));
    return r.body;
  });

  await check('GraphQL readiness query', async () => {
    const r = await getJson(`${API}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ liveness { status } readiness { status checks { name ok } } }' }),
    });
    assert(r.status === 200 && !r.body.errors, JSON.stringify(r.body));
    assert(r.body.data.readiness.status === 'ready', JSON.stringify(r.body.data));
    return r.body.data;
  });

  await check('OpenAPI document served', async () => {
    const r = await getJson(`${API}/docs-json`);
    assert(r.status === 200 && r.body.paths['/health/ready'], `got ${r.status}`);
    assert(!Object.keys(r.body.paths).some(p => p.startsWith('/dev')), 'dev routes must not appear in OpenAPI');
    return { paths: Object.keys(r.body.paths) };
  });

  await check('Keycloak serves the agentcity realm (OIDC discovery)', async () => {
    const r = await getJson(`${process.env.OIDC_ISSUER}/.well-known/openid-configuration`);
    assert(r.status === 200 && r.body.issuer === process.env.OIDC_ISSUER, `got ${r.status} ${r.body.issuer}`);
    assert(r.body.code_challenge_methods_supported?.includes('S256'), 'PKCE S256 not offered');
    return { issuer: r.body.issuer, authorization_endpoint: r.body.authorization_endpoint };
  });

  await check('web app renders the API readiness (web -> API request)', async () => {
    const html = await (await fetch(WEB)).text();
    assert(
      /data-testid="overall"[^]*?ready/.test(html) && !/not ready|API unreachable/.test(html),
      'page does not show ready',
    );
    for (const n of ['postgres', 'redis', 'objectStorage', 'temporal'])
      assert(html.includes(`check-${n}`), `missing ${n}`);
    return { bytes: html.length };
  });

  await check('heartbeat workflow round trip (API -> Temporal -> worker -> PostgreSQL)', async () => {
    const runId = `smoke-quick-${Date.now().toString(36)}`;
    const s = await getJson(`${API}/dev/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId, pauseSeconds: 0 }),
    });
    assert(s.status === 201 || s.status === 200, `start: ${s.status} ${JSON.stringify(s.body)}`);
    const r = await getJson(`${API}/dev/heartbeat/${runId}`);
    assert(r.status === 200, `result: ${r.status} ${JSON.stringify(r.body)}`);
    assert(r.body.steps.map(x => x.step).join(',') === 'started,finished', JSON.stringify(r.body));
    return r.body;
  });

  await check('workflow survives a worker crash', async () => {
    const runId = `smoke-restart-${Date.now().toString(36)}`;
    const s = await getJson(`${API}/dev/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId, pauseSeconds: 15 }),
    });
    assert(s.status === 201 || s.status === 200, `start: ${s.status}`);
    await waitFor(
      'step "started"',
      () => psql(`SELECT count(*) FROM platform.heartbeat WHERE run_id='${runId}'`) === '1',
      30_000,
    );
    // Hard crash while the workflow is waiting on its timer: no graceful hand-back.
    await stop(workerA, 'SIGKILL');
    const killedAt = new Date().toISOString();
    await sleep(2_000);
    const workerB = start(
      'worker-b',
      'apps/worker',
      ['--env-file-if-exists=../../infra/local-dev.env', 'dist/main.js'],
      {
        WORKER_ID: 'smoke-worker-b',
      },
    );
    workerA = workerB;
    const r = await getJson(`${API}/dev/heartbeat/${runId}`);
    assert(r.status === 200, `result: ${r.status} ${JSON.stringify(r.body)}`);
    const rows = psql(
      `SELECT step || ':' || worker_id FROM platform.heartbeat WHERE run_id='${runId}' ORDER BY recorded_at`,
    ).split('\n');
    assert(rows.join(',') === 'started:smoke-worker-a,finished:smoke-worker-b', `rows: ${rows.join(',')}`);
    return { runId, killedAt, rows, result: r.body };
  });

  for (const [service, depName] of [
    ['postgres', 'postgres'],
    ['object-storage', 'objectStorage'],
  ]) {
    await check(`readiness fails while ${service} is stopped, and recovers`, async () => {
      compose('stop', service);
      let down;
      try {
        down = await waitFor(`503 without ${service}`, async () => {
          const x = await readiness();
          return x.status === 503 ? x : null;
        });
        const failed = down.body.checks.filter(c => !c.ok).map(c => c.name);
        assert(down.body.status === 'not-ready' && failed.includes(depName), JSON.stringify(down.body));
        const html = await (await fetch(WEB)).text();
        assert(html.includes('not ready'), 'web page should show "not ready"');
      } finally {
        compose('start', service);
      }
      const up = await waitFor(
        `ready after ${service} restart`,
        async () => {
          const x = await readiness();
          return x.status === 200 ? x : null;
        },
        90_000,
      );
      return { whileStopped: down.body, afterRestart: up.body.status };
    });
  }
}

let fatal;
try {
  await main();
} catch (err) {
  fatal = err.message;
  console.log(`FAIL setup: ${err.message}`);
} finally {
  await Promise.all([...children].map(c => stop(c)));
}

const passed = !fatal && results.length > 0 && results.every(r => r.ok);
writeFileSync(
  join(EVIDENCE, 'smoke.json'),
  JSON.stringify({ ranAt: new Date().toISOString(), node: process.version, passed, fatal, results }, null, 2) + '\n',
);
console.log(passed ? `smoke: PASSED (${results.length} checks)` : 'smoke: FAILED');
process.exit(passed ? 0 : 1);
