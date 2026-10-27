import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPlan, type CatalogView, legacyTime, MappingError, stableJson } from '../src/plan.ts';
import { type ImportMapping, type LegacyAuth, type LegacyState } from '../src/schema.ts';

// A two-building toy catalog: one dealership with one floor, one rental building with two floors. SYNTHETIC.
const catalog: CatalogView = {
  floors: new Map([
    ['honda|12', { id: '00000000-0000-5000-8000-000000000001', rentable: false }],
    ['rental-1|1', { id: '00000000-0000-5000-8000-000000000002', rentable: true }],
    ['rental-1|2', { id: '00000000-0000-5000-8000-000000000003', rentable: true }],
  ]),
  buildings: new Map([
    ['honda', { kind: 'dealership', levels: [12] }],
    ['rental-1', { kind: 'rental', levels: [1, 2] }],
  ]),
  desks: new Map(),
  templates: new Map(),
};
const lead = (id: string, buildingId: string, real: boolean) => ({
  id,
  name: `Fixture ${id}`,
  source: 's',
  interest: 'i',
  buildingId,
  kind: 'customer',
  real,
  stage: 'New lead',
  stageAt: 0,
  createdAt: 0,
  touchedAt: 0,
  history: [],
});
const state = (over: Partial<LegacyState> = {}): LegacyState => ({
  version: 2,
  startDate: '2026-03-02',
  now: 600,
  buildings: [],
  leads: [],
  feed: [],
  approvals: [],
  messages: [],
  content: [],
  inbox: [],
  insights: [],
  reports: [],
  stageLog: [],
  revenue: [],
  settings: {},
  stats: [],
  statsToday: [],
  statsDay: 0,
  seq: 1,
  ...over,
});
const auth: LegacyAuth = {
  users: [
    {
      id: 'u1',
      username: 'x',
      name: 'Fixture',
      role: 'owner',
      passHash: 'FIXTURE-SECRET',
      totpSecret: 'FIXTURE-SECRET',
    } as never,
  ],
  clients: [],
  devices: [],
  sessions: [],
  signins: [],
};
const mapping = (over: Partial<ImportMapping> = {}): ImportMapping => ({
  version: 1,
  agency: { key: 'agency', name: 'Fixture Agency' },
  demoTenant: { key: 'demo', name: 'Fixture demo' },
  tenants: [
    {
      key: 'one',
      name: 'Fixture One',
      kind: 'client',
      legacyClientIds: [],
      workspaces: [
        { key: 'f', name: 'L1', buildings: [], floors: [{ building: 'rental-1', level: 1 }], installAgents: true },
      ],
    },
    {
      key: 'two',
      name: 'Fixture Two',
      kind: 'client',
      legacyClientIds: [],
      workspaces: [
        { key: 'f', name: 'L2', buildings: [], floors: [{ building: 'rental-1', level: 2 }], installAgents: true },
      ],
    },
  ],
  contactOwnership: [],
  users: [],
  ...over,
});

describe('import plan', () => {
  it('hashes records independently of key order', () => {
    assert.equal(stableJson({ b: 1, a: [{ d: 2, c: 3 }] }), stableJson({ a: [{ c: 3, d: 2 }], b: 1 }));
  });

  it('reads legacy simulator minutes as UTC from the start date', () => {
    assert.equal(legacyTime('2026-03-02', 8 * 60), '2026-03-02T08:00:00.000Z');
    assert.equal(legacyTime('2026-03-02', -1440), '2026-03-01T00:00:00.000Z');
  });

  it('refuses a building-wide ownership rule on a building shared by two clients', () => {
    const m = mapping({
      contactOwnership: [
        { tenant: 'one', workspace: 'f', legacyBuilding: 'rental-1', evidence: 'FIXTURE: by proximity' },
      ],
    });
    assert.throws(
      () => buildPlan(state(), auth, m, catalog),
      (e: Error) => e instanceof MappingError && /only occupant/.test(e.message),
    );
  });

  it('quarantines a real contact with no explicit owner, and sends simulated ones to the demo tenant', () => {
    const p = buildPlan(
      state({ leads: [lead('l1', 'rental-1', true), lead('l2', 'rental-1', false)] }),
      auth,
      mapping(),
      catalog,
    );
    assert.deepEqual(
      p.quarantine.filter(q => q.legacyKind === 'lead').map(q => [q.legacyId, q.reason]),
      [['l1', 'real contact on a shared rental building: ownership must be mapped lead by lead']],
    );
    assert.equal(p.rows['app.contact'].length, 1);
    const demo = p.rows['app.tenant'].find(t => t.kind === 'demo')!;
    assert.equal(p.rows['app.contact'][0]!.tenant_id, demo.id);
  });

  it('assigns a real contact mapped by id to exactly that tenant', () => {
    const m = mapping({
      contactOwnership: [{ tenant: 'two', workspace: 'f', legacyLeadIds: ['l1'], evidence: 'FIXTURE: reviewed' }],
    });
    const p = buildPlan(state({ leads: [lead('l1', 'rental-1', true)] }), auth, m, catalog);
    const two = p.rows['app.tenant'].find(t => t.name === 'Fixture Two')!;
    assert.equal(p.rows['app.contact'][0]!.tenant_id, two.id);
  });

  it('never carries credentials into planned rows or quarantine', () => {
    const p = buildPlan(state(), auth, mapping(), catalog);
    assert.doesNotMatch(JSON.stringify({ rows: p.rows, quarantine: p.quarantine }), /FIXTURE-SECRET/);
    assert.equal(p.report.notImportedByDesign.passHash, 1);
  });

  it('is deterministic: the same input gives the same plan', () => {
    const s = state({ leads: [lead('l2', 'honda', false)] });
    assert.deepEqual(buildPlan(s, auth, mapping(), catalog), buildPlan(s, auth, mapping(), catalog));
  });
});
