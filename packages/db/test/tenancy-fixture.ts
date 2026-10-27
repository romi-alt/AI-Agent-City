// SYNTHETIC TEST FIXTURE — not real people, clients or data. Every name starts with "Fixture".
import { randomUUID } from 'node:crypto';
import pg from 'pg';

export const SUBJECTS = {
  owner: 'fixture:owner',
  staffA: 'fixture:staff-a',
  alice: 'fixture:alice', // client-admin of A (rental-1 L1)
  viewerA: 'fixture:viewer-a', // client-viewer of A
  bob: 'fixture:bob', // client-admin of B (rental-1 L2)
  carol: 'fixture:carol', // client-admin of C, all workspaces
  carolFloor1: 'fixture:carol-floor-1', // client-admin of C, limited to C's rental-2 L1 workspace
  support: 'fixture:support', // support grant on B only
  stranger: 'fixture:stranger',
} as const;

const floorOf = async (c: pg.Client, building: string, level: number) =>
  (
    await c.query<{ id: string }>(
      `SELECT f.id FROM catalog.floor f JOIN catalog.building_alias a ON a.building_id = f.building_id
       WHERE a.alias = $1 AND f.level = $2`,
      [building, level],
    )
  ).rows[0]!.id;

export async function seedTenancy(adminUrl: string) {
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  const id = () => randomUUID();
  const t = { agency: id(), A: id(), B: id(), C: id(), demo: id() };
  const ws = { A: id(), B: id(), C1: id(), C2: id(), demo: id() };
  const floors = {
    r1L1: await floorOf(c, 'rental-1', 1),
    r1L2: await floorOf(c, 'rental-1', 2),
    r2L1: await floorOf(c, 'rental-2', 1),
    r2L2: await floorOf(c, 'rental-2', 2),
    r1L3: await floorOf(c, 'rental-1', 3),
  };
  const contacts = { A: id(), B: id(), C1: id(), C2: id() };
  const opps = { A: id(), B: id() };
  const notes = { A: id(), B: id(), C1: id(), C2: id() };
  try {
    await c.query('BEGIN');
    await c.query(`INSERT INTO app.agency (id, name) VALUES ($1, 'Fixture Agency')`, [t.agency]);
    await c.query(
      `INSERT INTO app.tenant (id, agency_id, name, kind) VALUES
        ($1, $5, 'Fixture Client A', 'client'), ($2, $5, 'Fixture Client B', 'client'),
        ($3, $5, 'Fixture Client C', 'client'), ($4, $5, 'Fixture Demo', 'demo')`,
      [t.A, t.B, t.C, t.demo, t.agency],
    );
    await c.query(
      `INSERT INTO app.workspace (tenant_id, id, name, kind) VALUES
        ($1, $5, 'Fixture A floor', 'rental-floor'), ($2, $6, 'Fixture B floor', 'rental-floor'),
        ($3, $7, 'Fixture C floor 1', 'rental-floor'), ($3, $8, 'Fixture C floor 2', 'rental-floor'),
        ($4, $9, 'Fixture demo city', 'demo')`,
      [t.A, t.B, t.C, t.demo, ws.A, ws.B, ws.C1, ws.C2, ws.demo],
    );
    // A and B share Rental Building 1 (L1 and L2); C holds two floors of Rental Building 2.
    await c.query(
      `INSERT INTO app.workspace_placement (tenant_id, workspace_id, id, floor_id) VALUES
        ($1, $2, gen_random_uuid(), $3), ($4, $5, gen_random_uuid(), $6),
        ($7, $8, gen_random_uuid(), $9), ($7, $10, gen_random_uuid(), $11)`,
      [t.A, ws.A, floors.r1L1, t.B, ws.B, floors.r1L2, t.C, ws.C1, floors.r2L1, ws.C2, floors.r2L2],
    );
    await c.query(
      `INSERT INTO app.agency_member (agency_id, subject, role) VALUES ($1, $2, 'owner'), ($1, $3, 'staff')`,
      [t.agency, SUBJECTS.owner, SUBJECTS.staffA],
    );
    await c.query(`INSERT INTO app.agency_assignment (agency_id, tenant_id, subject) VALUES ($1, $2, $3)`, [
      t.agency,
      t.A,
      SUBJECTS.staffA,
    ]);
    await c.query(
      `INSERT INTO app.tenant_member (tenant_id, subject, workspace_id, role) VALUES
        ($1, $5, NULL, 'client-admin'), ($1, $6, NULL, 'client-viewer'), ($2, $7, NULL, 'client-admin'),
        ($3, $8, NULL, 'client-admin'), ($3, $9, $4, 'client-admin')`,
      [t.A, t.B, t.C, ws.C1, SUBJECTS.alice, SUBJECTS.viewerA, SUBJECTS.bob, SUBJECTS.carol, SUBJECTS.carolFloor1],
    );
    await c.query(
      `INSERT INTO app_private.support_grant (tenant_id, subject, reason, granted_by, expires_at)
       VALUES ($1, $2, 'Fixture: investigate a reported sync problem', 'fixture:platform-admin', now() + interval '1 hour')`,
      [t.B, SUBJECTS.support],
    );
    const contact = (tenant: string, w: string, cid: string, name: string) =>
      c.query(
        `INSERT INTO app.contact (tenant_id, workspace_id, id, display_name, email, kind) VALUES ($1, $2, $3, $4, $5, 'customer')`,
        [tenant, w, cid, name, `${name.toLowerCase().replace(/\W+/g, '.')}@example.test`],
      );
    await contact(t.A, ws.A, contacts.A, 'Fixture Contact A');
    await contact(t.B, ws.B, contacts.B, 'Fixture Contact B');
    await contact(t.C, ws.C1, contacts.C1, 'Fixture Contact C1');
    await contact(t.C, ws.C2, contacts.C2, 'Fixture Contact C2');
    await c.query(
      `INSERT INTO app.opportunity (tenant_id, workspace_id, id, contact_id, stage) VALUES
        ($1, $2, $3, $4, 'new'), ($5, $6, $7, $8, 'new')`,
      [t.A, ws.A, opps.A, contacts.A, t.B, ws.B, opps.B, contacts.B],
    );
    const note = (tenant: string, w: string, nid: string, contactId: string, body: string) =>
      c.query(
        `INSERT INTO app.note (tenant_id, workspace_id, id, contact_id, body, created_by) VALUES ($1, $2, $3, $4, $5, 'fixture')`,
        [tenant, w, nid, contactId, body],
      );
    // Every note mentions "hybrid", so a search that ignored scope would return all four.
    await note(t.A, ws.A, notes.A, contacts.A, 'Asked about hybrid sedan financing');
    await note(t.B, ws.B, notes.B, contacts.B, 'Wants a hybrid lease quote');
    await note(t.C, ws.C1, notes.C1, contacts.C1, 'Hybrid trade-in on floor one');
    await note(t.C, ws.C2, notes.C2, contacts.C2, 'Hybrid test drive on floor two');
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
  return { t, ws, floors, contacts, opps, notes };
}
