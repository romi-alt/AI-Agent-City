import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { AuthStore } from '../server/auth';
import { authorize, scopeFor, scopePatch, scopeSnapshot, type Client } from '../server/scope';
import { Sim } from '../src/core/sim';
import type { Patch, Snapshot } from '../src/core/types';

// One busy city shared by the tests: two simulated days, with every patch kept for the live-update checks.
const sim = Sim.create('2026-10-05');
const patches: Patch[] = [];
for (let i = 0; i < 1440; i++) { sim.tick(); const p = sim.takePatch(); if (p) patches.push(p); }
const snap = sim.snapshot();

const clients: Client[] = [
  { id: 'c-audi', name: 'Audi Dallas', buildingIds: ['audi'], createdAt: 0 },
  { id: 'c-rc', name: 'Rick Case Honda', buildingIds: ['rc-new', 'rc-used'], createdAt: 0 },
];
const owner = scopeFor({ role: 'owner' }, clients);
const audiAdmin = scopeFor({ role: 'client-admin', clientId: 'c-audi' }, clients);
const audiViewer = scopeFor({ role: 'client-viewer', clientId: 'c-audi' }, clients);
const rcAdmin = scopeFor({ role: 'client-admin', clientId: 'c-rc' }, clients);
const orphan = scopeFor({ role: 'client-admin', clientId: 'deleted' }, clients);

/** Every building id that appears anywhere in a snapshot or patch. */
function buildingIdsIn(x: Partial<Snapshot> | Patch) {
  const ids = new Set<string>();
  const json = JSON.stringify(x);
  for (const m of json.matchAll(/"(?:buildingId|b)":"([^"]+)"/g)) ids.add(m[1]!);
  for (const b of (x as Snapshot).buildings ?? []) ids.add(b.id);
  for (const [bid] of [...((x as Snapshot).stats ?? []), ...((x as Snapshot).statsToday ?? [])]) ids.add(bid);
  return ids;
}

describe('the city has data to filter', () => {
  it('has activity in several buildings', () => {
    assert.ok(snap.leads.length > 50 && snap.feed.length > 50 && snap.messages.length > 50);
    assert.ok(new Set(snap.feed.map(f => f.buildingId)).size > 5);
  });
});

describe('opening snapshot', () => {
  it('gives the agency everything', () => {
    const s = scopeSnapshot(snap, owner);
    assert.equal(s.buildings.length, snap.buildings.length);
    assert.equal(s.leads.length, snap.leads.length);
    assert.deepEqual(s.neighbours, []);
  });

  it('gives a client only its own buildings and their records', () => {
    const s = scopeSnapshot(snap, audiAdmin);
    assert.deepEqual(s.buildings.map(b => b.id), ['audi']);
    assert.deepEqual([...buildingIdsIn(s)], ['audi']);
    assert.ok(s.leads.length > 0, 'the client still sees its own leads');
    assert.equal(s.reports.length, 0, 'city-wide reports stay with the agency');
    assert.deepEqual(s.settings.reportRecipients, []);
    assert.equal(s.settings.companyName, 'Audi Dallas');
  });

  it('shows other buildings only as unnamed shapes', () => {
    const s = scopeSnapshot(snap, audiAdmin);
    assert.equal(s.neighbours!.length, snap.buildings.length - 1);
    for (const n of s.neighbours!) assert.deepEqual(Object.keys(n).sort(), ['d', 'floors', 'w', 'x', 'z']);
  });

  it('leaks no other building, agent or lead names', () => {
    const json = JSON.stringify(scopeSnapshot(snap, audiAdmin));
    for (const b of snap.buildings.filter(b => b.id !== 'audi')) {
      assert.ok(!json.includes(`"${b.name}"`), `found ${b.name}`);
      for (const f of b.floors) for (const a of f.agents) assert.ok(!json.includes(`"${a.id}"`), `found agent ${a.id}`);
    }
    for (const l of snap.leads.filter(l => l.buildingId !== 'audi')) assert.ok(!json.includes(`"${l.id}"`), `found lead ${l.id}`);
  });

  it('covers a client with several buildings', () => {
    const s = scopeSnapshot(snap, rcAdmin);
    assert.deepEqual(s.buildings.map(b => b.id).sort(), ['rc-new', 'rc-used']);
    assert.deepEqual([...buildingIdsIn(s)].sort(), ['rc-new', 'rc-used']);
  });

  it('gives a client with no buildings nothing', () => {
    const s = scopeSnapshot(snap, orphan);
    assert.equal(s.buildings.length, 0);
    assert.equal(s.leads.length + s.feed.length + s.messages.length + s.approvals.length, 0);
  });

  it('keeps the browser mirror working on a filtered snapshot', () => {
    const mirror = new Sim(scopeSnapshot(snap, audiAdmin));
    assert.equal(mirror.buildings.length, 1);
    assert.equal(mirror.neighbours.length, snap.buildings.length - 1);
    assert.ok(mirror.kpis().agentsTotal > 0);
  });
});

describe('live updates', () => {
  it('only ever carry the client\'s own building', () => {
    let seen = 0;
    for (const p of patches) {
      const scoped = scopePatch(p, audiAdmin);
      for (const id of buildingIdsIn(scoped)) assert.equal(id, 'audi');
      seen += (scoped.feed?.length ?? 0) + (scoped.agents?.length ?? 0);
    }
    assert.ok(seen > 0, 'the client did get its own updates');
  });

  it('pass through unchanged for the agency', () => {
    for (const p of patches.slice(0, 50)) assert.equal(scopePatch(p, owner), p);
  });
});

describe('actions', () => {
  const audiLead = snap.leads.find(l => l.buildingId === 'audi')!;
  const hondaLead = snap.leads.find(l => l.buildingId === 'honda')!;
  const audiContent = snap.content.find(c => c.buildingId === 'audi');
  const otherContent = snap.content.find(c => c.buildingId !== 'audi')!;
  const otherApproval = snap.approvals.find(a => a.buildingId !== 'audi');
  const audiHuman = sim.agents('audi').find(a => a.kind === 'human');
  const otherHuman = sim.agents().find(a => a.kind === 'human' && a.buildingId !== 'audi')!;

  it('lets the agency do anything', () => {
    for (const a of [{ type: 'leadNote', id: hondaLead.id }, { type: 'rent', buildingId: 'rental-1' }, { type: 'approveAll' }] as const)
      assert.deepEqual(authorize(a, owner, sim), { ok: true });
  });

  it('lets a client admin work its own building', () => {
    assert.deepEqual(authorize({ type: 'leadNote', id: audiLead.id }, audiAdmin, sim), { ok: true });
    assert.deepEqual(authorize({ type: 'leadCreate', lead: { buildingId: 'audi' } }, audiAdmin, sim), { ok: true });
    assert.deepEqual(authorize({ type: 'approveAll', buildingId: 'audi' }, audiAdmin, sim), { ok: true });
    if (audiContent) assert.deepEqual(authorize({ type: 'contentUpdate', id: audiContent.id }, audiAdmin, sim), { ok: true });
    if (audiHuman) assert.deepEqual(authorize({ type: 'desk', agentId: audiHuman.id }, audiAdmin, sim), { ok: true });
  });

  it('answers "not found" for anything in another client\'s building', () => {
    const notFound = { ok: false, status: 404, error: 'Not found.' };
    assert.deepEqual(authorize({ type: 'leadNote', id: hondaLead.id }, audiAdmin, sim), notFound);
    assert.deepEqual(authorize({ type: 'leadSend', id: hondaLead.id }, audiAdmin, sim), notFound);
    assert.deepEqual(authorize({ type: 'leadCreate', lead: { buildingId: 'honda' } }, audiAdmin, sim), notFound);
    assert.deepEqual(authorize({ type: 'contentUpdate', id: otherContent.id }, audiAdmin, sim), notFound);
    assert.deepEqual(authorize({ type: 'approveAll', buildingId: 'honda' }, audiAdmin, sim), notFound);
    assert.deepEqual(authorize({ type: 'desk', agentId: otherHuman.id }, audiAdmin, sim), notFound);
    assert.deepEqual(authorize({ type: 'leadNote', id: 'no-such-lead' }, audiAdmin, sim), notFound);
    if (otherApproval) assert.deepEqual(authorize({ type: 'approve', id: otherApproval.id }, audiAdmin, sim), notFound);
  });

  it('keeps renting floors with the agency', () => {
    assert.equal(authorize({ type: 'rent', buildingId: 'rental-1' }, audiAdmin, sim).ok, false);
    assert.equal(authorize({ type: 'vacate', buildingId: 'rental-1' }, audiAdmin, sim).ok, false);
  });

  it('lets a client viewer look but not change anything', () => {
    const v = authorize({ type: 'leadNote', id: audiLead.id }, audiViewer, sim);
    assert.equal(v.ok, false);
    assert.equal(!v.ok && v.status, 403);
    assert.equal(authorize({ type: 'approveAll', buildingId: 'audi' }, audiViewer, sim).ok, false);
    assert.deepEqual(authorize({ type: 'duty' }, audiViewer, sim), { ok: true });
  });
});

describe('accounts and clients', () => {
  const fresh = () => new AuthStore(join(mkdtempSync(join(tmpdir(), 'fs-auth-')), 'auth.json'));

  it('upgrades old admin and member accounts to agency owner and staff', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'fs-auth-')), 'auth.json');
    writeFileSync(file, JSON.stringify({ users: [{ id: 'a', username: 'a', name: 'A', role: 'admin', recovery: [], onDuty: true, createdAt: 0, failed: 0, totpSecret: 'X' }, { id: 'b', username: 'b', name: 'B', role: 'member', recovery: [], onDuty: true, createdAt: 0, failed: 0, totpSecret: 'X' }] }));
    const store = new AuthStore(file);
    assert.deepEqual(store.users.map(u => u.role), ['owner', 'staff']);
  });

  it('never lets two clients own the same building', () => {
    const store = fresh();
    store.saveClient({ name: 'Audi Dallas', buildingIds: ['audi'] });
    assert.throws(() => store.saveClient({ name: 'Someone else', buildingIds: ['audi', 'fiat'] }), /already belongs to Audi Dallas/);
  });

  it('requires a client for client roles and drops it for agency roles', () => {
    const store = fresh();
    const c = store.saveClient({ name: 'Fiat', buildingIds: ['fiat'] });
    assert.throws(() => store.createUser('nobody', 'Nobody', 'client-admin'), /Pick the client/);
    const { user } = store.createUser('fia', 'Fia', 'client-viewer', c.id);
    assert.equal(user.clientId, c.id);
    const staff = store.createUser('sam', 'Sam', 'staff', c.id).user;
    assert.equal(staff.clientId, undefined);
  });

  it('signs someone out when their access changes', () => {
    const store = fresh();
    const c = store.saveClient({ name: 'Fiat', buildingIds: ['fiat'] });
    store.createUser('boss', 'Boss', 'owner');
    const { user } = store.createUser('fia', 'Fia', 'client-admin', c.id);
    store.newSession(user.id, 'full');
    store.updateAccess(user.id, 'client-viewer', c.id);
    assert.equal([...store.sessions.values()].filter(s => s.userId === user.id).length, 0);
  });

  it('signs a client\'s people out when its buildings change, but not when only the name changes', () => {
    const store = fresh();
    const c = store.saveClient({ name: 'Fiat', buildingIds: ['fiat'] });
    const { user } = store.createUser('fia', 'Fia', 'client-admin', c.id);
    store.newSession(user.id, 'full');
    store.saveClient({ id: c.id, name: 'Fiat Dallas', buildingIds: ['fiat'] });
    assert.equal([...store.sessions.values()].filter(s => s.userId === user.id).length, 1);
    store.saveClient({ id: c.id, name: 'Fiat Dallas', buildingIds: ['fiat', 'alfa-romeo'] });
    assert.equal([...store.sessions.values()].filter(s => s.userId === user.id).length, 0);
  });

  it('keeps at least one agency owner, and won\'t delete a client that still has people', () => {
    const store = fresh();
    const c = store.saveClient({ name: 'Fiat', buildingIds: ['fiat'] });
    const boss = store.createUser('boss', 'Boss', 'owner').user;
    assert.throws(() => store.updateAccess(boss.id, 'staff'), /at least one agency owner/);
    store.createUser('fia', 'Fia', 'client-admin', c.id);
    assert.throws(() => store.deleteClient(c.id), /Move or remove/);
  });
});
