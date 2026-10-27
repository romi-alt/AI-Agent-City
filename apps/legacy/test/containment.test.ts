/**
 * M00 containment regressions. These assert the SAFE behaviour (unlike the legacy characterization
 * harness in planning/agentcity-migration/scripts, which reproduces old defects).
 *  - Every outbound path consults the gate: fake providers get zero calls while it is off, and in demo mode.
 *  - The public pulse carries no names, work or activity counts.
 *  - A corrupt or unsupported saved city stops the server and stays byte-identical.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { attachBrain, type DraftCall } from '../server/brain';
import { createDelivery, type Transport } from '../server/delivery';
import { createOutboundGate, DEMO_REASON, KILL_SWITCH_REASON } from '../server/outbound';
import { loadState } from '../server/state';
import { Sim } from '../src/core/sim';
import type { Agent, Building, Message, Task } from '../src/core/types';

/** Counts every provider call. Any call at all fails the "disabled" tests. */
function fakeTransport() {
  const calls: { kind: 'email' | 'sms'; to: string | string[] }[] = [];
  const t: Transport = {
    configured: { email: true, sms: true, from: 'office@example.com' },
    async email(to) { calls.push({ kind: 'email', to }); },
    async sms(to) { calls.push({ kind: 'sms', to }); },
  };
  return { t, calls };
}

/** A city wired exactly like the server: gate → delivery + AI drafting, with fakes in place of providers. */
function city(env: Record<string, string>, mode: 'simulate' | 'live') {
  const sim = Sim.create('2026-10-27');
  sim.settings.deliveryMode = mode;
  sim.settings.aiDrafts = true;
  sim.settings.reportRecipients = ['owner@example.com'];
  const gate = createOutboundGate({ env, mode: () => sim.settings.deliveryMode });
  const { t, calls } = fakeTransport();
  const delivery = createDelivery(t, gate);
  delivery.attach(sim, () => {});
  let llmCalls = 0;
  const call: DraftCall = async () => { llmCalls++; return undefined; };
  attachBrain(sim, () => {}, gate, call);
  return { sim, gate, delivery, calls, llm: () => llmCalls };
}

type Internals = { finishContact(b: Building, a: Agent, t: Task): void; addMessage(m: Omit<Message, 'id' | 't'>): Message };

/** Exercises every path that can reach a provider. */
async function everyOutboundPath(c: ReturnType<typeof city>) {
  const { sim, delivery } = c;
  const lead = sim.createLead({ buildingId: 'fast-sales', floor: 11, name: 'Containment Check', email: 'lead@example.com', phone: '+15550100100' }, 'Test');
  // 1. An agent drafts a message to a real lead (also asks Claude to improve it), then a reviewer approves it.
  const agent = sim.agent('fast-sales-L11-0')!;
  const task: Task = { id: 't-1', title: 'Check', category: 'New leads', channel: 'email', leadId: lead.id, action: 'contact', remaining: 0, needsApproval: true };
  agent.current = task; agent.status = 'working';
  (sim as unknown as Internals).finishContact(sim.building('fast-sales'), agent, task);
  const approval = sim.approvals.at(-1)!;
  sim.resolve(approval.id, true, 'Reviewer');
  // Read the message now: the legacy simulator trims old messages, pending ones included (audit C08).
  const approved = { ...sim.messages.get(approval.refId!)! };
  // 2. A person sends by hand: email and text.
  sim.sendManual(lead.id, 'email', 'Hello', 'Manual email', 'Operator');
  sim.sendManual(lead.id, 'text', undefined, 'Manual text', 'Operator');
  // 3. The clock (which starts at 08:00) runs past the 18:00 daily report and the next 08:00 morning report;
  //    meanwhile agents write posts, which asks Claude for drafts.
  for (let i = 0; i < 730; i++) sim.tick();
  // 4. The owner presses "Send test email".
  const test = await delivery.sendTest('owner@example.com').then(() => 'sent', (e: Error) => e.message);
  await new Promise(r => setTimeout(r, 20));
  return { lead, approval, approved, test };
}

describe('outbound kill switch', () => {
  it('stops every provider call while the switch is off, even in Live mode', async () => {
    const c = city({}, 'live');
    const { approved, test } = await everyOutboundPath(c);
    assert.equal(c.calls.length, 0, `provider calls: ${JSON.stringify(c.calls)}`);
    assert.equal(c.llm(), 0, 'Claude was called');
    assert.equal(test, KILL_SWITCH_REASON);
    assert.equal(approved.status, 'skipped');
    assert.equal(approved.error, KILL_SWITCH_REASON);
    const reports = [...c.sim.reports.values()];
    assert.ok(reports.length >= 2, 'the clock produced reports');
    for (const r of reports) assert.equal(r.status, 'skipped');
    assert.ok(c.gate.blocked.email > 0 && c.gate.blocked.sms > 0 && c.gate.blocked.llm > 0);
  });

  it('treats any value other than "true" as off', async () => {
    for (const value of ['1', 'yes', 'TRUE', ' true', '']) {
      const c = city({ OUTBOUND_ENABLED: value }, 'live');
      await everyOutboundPath(c);
      assert.equal(c.calls.length + c.llm(), 0, `OUTBOUND_ENABLED=${JSON.stringify(value)} let a call through`);
    }
  });

  it('never calls a provider in demo (simulate) mode, even with the switch on', async () => {
    const c = city({ OUTBOUND_ENABLED: 'true' }, 'simulate');
    const { approved, test } = await everyOutboundPath(c);
    assert.equal(c.calls.length, 0);
    assert.equal(c.llm(), 0);
    assert.equal(test, DEMO_REASON);
    assert.equal(approved.status, 'simulated');
  });

  it('never "sends" a phone call: there is no phone provider', () => {
    const c = city({ OUTBOUND_ENABLED: 'true' }, 'live');
    const lead = c.sim.createLead({ buildingId: 'fast-sales', floor: 11, name: 'Phone Check', phone: '+15550100101' }, 'Test');
    const m = (c.sim as unknown as Internals).addMessage({ buildingId: 'fast-sales', agentName: 'Vera', leadId: lead.id, channel: 'phone', to: lead.phone!, body: 'Call script', status: 'pending', real: true, by: 'template' });
    c.sim.hooks.outbound!(m, lead);
    assert.equal(c.calls.length, 0);
    assert.equal(m.status, 'skipped');
  });

  it('does reach the provider when the switch is on and Delivery is Live (so the tests above are not vacuous)', async () => {
    const c = city({ OUTBOUND_ENABLED: 'true' }, 'live');
    const { test } = await everyOutboundPath(c);
    assert.equal(test, 'sent');
    assert.ok(c.calls.some(x => x.kind === 'email' && x.to === 'lead@example.com'), 'approved email');
    assert.ok(c.calls.some(x => x.kind === 'sms'), 'manual text');
    assert.ok(c.calls.some(x => Array.isArray(x.to)), 'report');
    assert.ok(c.llm() > 0, 'AI drafting');
  });
});

describe('saved city fails closed', () => {
  const ROOT = resolve(import.meta.dirname, '..');
  const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

  /** Start the real server against a data folder; resolve with its exit code and output. */
  function start(dataDir: string, timeoutMs = 20000) {
    return new Promise<{ code: number | null; out: string }>(done => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
        cwd: ROOT, env: { ...process.env, DATA_DIR: dataDir, PORT: String(41000 + Math.floor(Math.random() * 2000)), OUTBOUND_ENABLED: '' },
      });
      let out = '';
      child.stdout.on('data', d => { out += d; });
      child.stderr.on('data', d => { out += d; });
      const timer = setTimeout(() => { child.kill('SIGKILL'); done({ code: null, out: out + '\n[test] server kept running' }); }, timeoutMs);
      child.on('exit', code => { clearTimeout(timer); done({ code, out }); });
    });
  }

  const cases: [string, string, string][] = [
    ['state.json', 'malformed JSON', '{"version": 2, "buildings": [ broken'],
    ['state.json', 'unsupported version', JSON.stringify({ version: 1, buildings: [] })],
    ['state.json', 'missing lists', JSON.stringify({ version: 2, settings: {} })],
    ['auth.json', 'malformed account file', '{"users": [ broken'],
  ];
  for (const [file, what, body] of cases) {
    it(`refuses to start on ${what} and leaves ${file} byte-identical`, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'agentcity-m00-'));
      const path = join(dir, file);
      writeFileSync(path, body);
      const before = sha(path);
      const listing = readdirSync(dir).sort();
      const { code, out } = await start(dir);
      assert.equal(code, 2, out);
      assert.match(out, /Refusing to start/);
      assert.equal(sha(path), before, `${file} changed`);
      assert.deepEqual(readdirSync(dir).sort(), listing, 'the server created or removed files');
    });
  }

  it('saves the city readable by its owner only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentcity-m00-'));
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: ROOT, env: { ...process.env, DATA_DIR: dir, PORT: String(45000 + Math.floor(Math.random() * 2000)), OUTBOUND_ENABLED: '' } });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    for (let i = 0; i < 80 && !out.includes('Sales City server on'); i++) await new Promise(r => setTimeout(r, 250));
    const exited = new Promise(r => child.on('exit', r));
    child.kill('SIGTERM');
    await exited;
    const mode = statSync(join(dir, 'state.json')).mode & 0o777;
    assert.equal(mode.toString(8), '600');
  });

  it('loadState never writes, and loads a good file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentcity-m00-'));
    const good = join(dir, 'good.json');
    writeFileSync(good, JSON.stringify(Sim.create('2026-10-27').snapshot()));
    const before = sha(good);
    const r = loadState(good);
    assert.equal(r.kind, 'loaded');
    assert.equal(sha(good), before);
    assert.equal(loadState(join(dir, 'absent.json')).kind, 'fresh');
    assert.ok(!existsSync(join(dir, 'absent.json')));
  });
});

describe('public pulse', () => {
  it('returns only the fixed catalog: no names, work, status or activity counts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentcity-m00-'));
    const port = 43000 + Math.floor(Math.random() * 2000);
    const ROOT = resolve(import.meta.dirname, '..');
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: ROOT, env: { ...process.env, DATA_DIR: dir, PORT: String(port), OUTBOUND_ENABLED: '' } });
    try {
      let body = '';
      for (let i = 0; i < 60 && !body; i++) {
        await new Promise(r => setTimeout(r, 250));
        body = await fetch(`http://localhost:${port}/api/public/pulse`).then(r => r.text(), () => '');
      }
      const data = JSON.parse(body);
      assert.deepEqual(Object.keys(data).sort(), ['catalog', 'live']);
      assert.equal(data.live, false);
      assert.deepEqual(data.catalog, { buildings: 15, floors: 183, aiDesks: 281, humanDesks: 22 });
      for (const word of ['Max', 'Vera', 'team', 'doing', 'status', 'leads', 'Today', 'stages']) assert.ok(!body.includes(word), `pulse mentions ${word}`);
    } finally { child.kill('SIGKILL'); }
  });
});
