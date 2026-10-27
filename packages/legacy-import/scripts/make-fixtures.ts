// Generates the SYNTHETIC legacy fixtures in fixtures/. No real state.json or auth.json was provided (MIGRATION-STATUS
// "missing production-input gate"), so the importer is tested against data the legacy app itself produces: its
// simulator plus a handful of hand-entered "real" leads named "Fixture …" at example.test addresses.
// The output is committed; rerunning produces a different (random) simulation, so tests read the committed copy.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Sim } from '../../../apps/legacy/src/core/sim.ts';

const OUT = new URL('../fixtures/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const write = (name: string, v: unknown) => writeFileSync(new URL(name, OUT), JSON.stringify(v, null, 2) + '\n');

const sim = Sim.create('2026-03-02');
sim.settings.speed = 1;
for (let i = 0; i < 120; i++) sim.tick();

const occupant = (n: string) => ({
  name: `Fixture Rental ${n}`,
  contact: `Fixture Contact ${n}`,
  email: `rental.${n.toLowerCase()}@example.test`,
  phone: '+15550100000',
});
sim.rentFloor('rental-1', 1, occupant('One'));
sim.rentFloor('rental-1', 2, occupant('Two'));
sim.rentFloor('rental-3', 5, occupant('Unmapped')); // no tenant in the mapping → quarantined occupant

const real = (buildingId: string, n: number, extra: { floor?: number } = {}) =>
  sim.createLead(
    {
      buildingId,
      name: `Fixture Real ${buildingId} ${n}`,
      email: `fixture.${buildingId}.${n}@example.test`,
      phone: `+1555000${String(n).padStart(4, '0')}`,
      source: 'Fixture walk-in',
      ...extra,
    },
    'fixture-owner',
  );
const honda = [real('honda', 1), real('honda', 2), real('honda', 3)];
const fastSales = [real('fast-sales', 1, { floor: 11 }), real('fast-sales', 2, { floor: 9 })];
const rental1 = [real('rental-1', 1), real('rental-1', 2), real('rental-1', 3)];
const maserati = real('maserati', 1); // no ownership rule → quarantined
sim.addNote(honda[0]!.id, 'Fixture note: prefers a call after 5pm about a hybrid', 'fixture-owner');
sim.updateLead(honda[1]!.id, { stage: 'Appointment' }, 'fixture-owner');
const sent = sim.sendManual(honda[0]!.id, 'email', 'Fixture subject', 'Fixture body text', 'fixture-owner');
sim.setMessageStatus(sent!.id, 'sent'); // the legacy app recorded it as sent; the import must not treat that as proof
sim.sendManual(rental1[0]!.id, 'text', undefined, 'Fixture text to the L1 client contact', 'fixture-owner');
sim.sendManual(maserati.id, 'email', 'Fixture', 'Fixture body to an unmapped contact', 'fixture-owner');
for (let i = 0; i < 60; i++) sim.tick();

const state = JSON.parse(JSON.stringify(sim.snapshot()));
// One scheduled post, so the import's schedule handling is exercised (the simulator rarely gets that far).
state.content.find((c: { status: string }) => c.status === 'asset-ready').status = 'scheduled';
// Simulated revenue, as the legacy dashboard recorded it: must never become a payment or invoice.
state.revenue.push({ t: state.now, buildingId: 'honda', amount: 1234 });
// Deliberate defects for the duplicate / dangling-reference report.
state.leads.push({ ...state.leads[0] });
state.messages.push({
  ...state.messages.find((m: { real: boolean }) => !m.real),
  id: 'm-dangling',
  leadId: 'l-missing',
});
write('state.v2.fixture.json', state);

// auth.json in the legacy shape. Credential fields hold obvious placeholders: the test proves none of them, nor
// any session or device, reaches the database.
const FAKE = 'FIXTURE-NOT-A-REAL-SECRET';
const user = (id: string, username: string, role: string, clientId?: string) => ({
  id,
  username,
  name: `Fixture ${username}`,
  role,
  clientId,
  passHash: FAKE,
  salt: FAKE,
  totpSecret: FAKE,
  recovery: [FAKE],
  onDuty: false,
  createdAt: 0,
  failed: 0,
});
write('auth.fixture.json', {
  users: [
    user('u-owner', 'owner', 'owner'),
    user('u-staff', 'staff', 'staff'),
    user('u-honda-admin', 'honda.admin', 'client-admin', 'c-honda'),
    user('u-honda-viewer', 'honda.viewer', 'client-viewer', 'c-honda'),
    user('u-unmapped', 'nobody', 'staff'), // no verified email → quarantined
    user('u-wrong-client', 'wrong.client', 'client-admin', 'c-honda'), // mapped to the wrong tenant → quarantined
  ],
  clients: [
    { id: 'c-honda', name: 'Fixture Honda Client', buildingIds: ['honda'], createdAt: 0 },
    { id: 'c-orphan', name: 'Fixture Unmapped Client', buildingIds: ['acura'], createdAt: 0 },
  ],
  devices: [{ hash: FAKE, userId: 'u-owner', expires: 0 }],
  sessions: [{ hash: FAKE, userId: 'u-owner', stage: 'full', locked: false, codeFails: 0, created: 0, lastSeen: 0 }],
  signins: [{ t: 0, username: 'owner', ip: '127.0.0.1', ua: 'fixture', result: 'ok' }],
});

write('mapping.fixture.json', {
  version: 1,
  note: 'FIXTURE mapping for the synthetic fixtures. A real mapping must be written and reviewed by the owner.',
  agency: { key: 'fast-sales-agency', name: 'Fixture Agency (Fast Sales)' },
  demoTenant: { key: 'legacy-demo', name: 'Legacy simulated city (demo)' },
  tenants: [
    {
      key: 'fast-sales',
      name: 'Fixture Fast Sales (own business)',
      kind: 'agency',
      workspaces: [{ key: 'training-center', name: 'Training Center', buildings: ['fast-sales'] }],
    },
    {
      key: 'honda-client',
      name: 'Fixture Honda Client',
      kind: 'client',
      legacyClientIds: ['c-honda'],
      workspaces: [{ key: 'store', name: 'Honda store', buildings: ['honda'] }],
    },
    {
      key: 'rental-one',
      name: 'Fixture Rental One',
      kind: 'client',
      workspaces: [{ key: 'floor', name: 'Rental 1 · L1', floors: [{ building: 'rental-1', level: 1 }] }],
    },
    {
      key: 'rental-two',
      name: 'Fixture Rental Two',
      kind: 'client',
      workspaces: [{ key: 'floor', name: 'Rental 1 · L2', floors: [{ building: 'rental-1', level: 2 }] }],
    },
  ],
  contactOwnership: [
    {
      tenant: 'honda-client',
      workspace: 'store',
      legacyBuilding: 'honda',
      evidence: 'FIXTURE: owner confirmed the Honda store leads belong to the Honda client',
    },
    {
      tenant: 'fast-sales',
      workspace: 'training-center',
      legacyBuilding: 'fast-sales',
      evidence: 'FIXTURE: Training Center leads are the agency’s own',
    },
    {
      tenant: 'rental-one',
      workspace: 'floor',
      legacyLeadIds: [rental1[0]!.id],
      evidence: 'FIXTURE: reviewed individually with the L1 client',
    },
  ],
  users: [
    {
      legacyUserId: 'u-owner',
      email: 'fixture.owner@example.test',
      evidence: 'FIXTURE: confirmed in person',
      tenant: 'fast-sales',
      role: 'agency-owner',
    },
    {
      legacyUserId: 'u-staff',
      email: 'fixture.staff@example.test',
      evidence: 'FIXTURE: confirmed in person',
      tenant: 'fast-sales',
      role: 'agency-staff',
    },
    {
      legacyUserId: 'u-honda-admin',
      email: 'Fixture.Honda.Admin@example.test',
      evidence: 'FIXTURE: confirmed by the client',
      tenant: 'honda-client',
      role: 'client-admin',
    },
    {
      legacyUserId: 'u-honda-viewer',
      email: 'fixture.honda.viewer@example.test',
      evidence: 'FIXTURE: confirmed by the client',
      tenant: 'honda-client',
      workspace: 'store',
      role: 'client-viewer',
    },
    {
      legacyUserId: 'u-wrong-client',
      email: 'fixture.wrong@example.test',
      evidence: 'FIXTURE: deliberately wrong tenant',
      tenant: 'rental-one',
      role: 'client-admin',
    },
  ],
});
console.log('fixtures written', {
  leads: state.leads.length,
  messages: state.messages.length,
  approvals: state.approvals.length,
  content: state.content.length,
  honda: honda.length,
  fastSales: fastSales.length,
});
