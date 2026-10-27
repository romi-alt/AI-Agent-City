// SYNTHETIC TEST FIXTURE — not real people, clients or data. Every name starts with "Fixture".
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { SUBJECTS, seedTenancy } from './tenancy-fixture.ts';

/** People added on top of the tenancy fixture. */
export const ACCESS_SUBJECTS = {
  ...SUBJECTS,
  staffB: 'fixture:staff-b', // agency staff, assigned nowhere
  dave: 'fixture:dave', // nobody yet; gets invited
  erin: 'fixture:erin', // nobody yet; gets invited
} as const;

/** Every fixture person's (verified) email: `<name>@example.test`. */
export const emailOf = (subject: string) => `${subject.replace(/^fixture:/, '')}@example.test`;

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** A fresh invitation token (256-bit, base64url) and its hash, as the API makes them. */
export const newToken = () => {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
};

/**
 * The tenancy fixture plus the agency's own tenant (kind 'agency') with one workspace, and an unassigned staff
 * person. Agency roles can only be granted in that tenant.
 */
export async function seedAccess(adminUrl: string) {
  const f = await seedTenancy(adminUrl);
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  const hq = randomUUID();
  const hqWs = randomUUID();
  try {
    await c.query(`INSERT INTO app.tenant (id, agency_id, name, kind) VALUES ($1, $2, 'Fixture Agency HQ', 'agency')`, [
      hq,
      f.t.agency,
    ]);
    await c.query(`INSERT INTO app.workspace (tenant_id, id, name, kind) VALUES ($1, $2, 'Fixture HQ team', 'team')`, [
      hq,
      hqWs,
    ]);
    await c.query(`INSERT INTO app.agency_member (agency_id, subject, role) VALUES ($1, $2, 'staff')`, [
      f.t.agency,
      ACCESS_SUBJECTS.staffB,
    ]);
  } finally {
    await c.end();
  }
  return { ...f, t: { ...f.t, hq }, ws: { ...f.ws, hq: hqWs } };
}

/** An identity.person + device + live session for a fixture subject (what the auth module would create). */
export async function seedSession(
  admin: pg.Client,
  subject: string,
  opts: { email?: string | null; emailVerified?: boolean; acr?: string; stepUp?: boolean } = {},
) {
  const email = opts.email === undefined ? emailOf(subject) : opts.email;
  await admin.query(
    `INSERT INTO identity.person (subject, issuer, idp_subject, email, email_verified) VALUES ($1, 'fixture-issuer', $1, $2, $3)
     ON CONFLICT (subject) DO UPDATE SET email = EXCLUDED.email, email_verified = EXCLUDED.email_verified`,
    [subject, email, opts.emailVerified ?? true],
  );
  const jkt = randomBytes(32).toString('base64url');
  const device = await admin.query<{ id: string }>(
    `INSERT INTO identity.device (subject, jkt, public_jwk) VALUES ($1, $2, '{}') RETURNING id`,
    [subject, jkt],
  );
  const session = await admin.query<{ id: string }>(
    `INSERT INTO identity.session (token_sha256, subject, device_id, amr, acr, auth_time, idle_expires_at, absolute_expires_at, step_up_at)
     VALUES ($1, $2, $3, '{passkey}', $4, now(), now() + interval '1 hour', now() + interval '1 day', $5) RETURNING id`,
    [sha256(randomUUID()), subject, device.rows[0]!.id, opts.acr ?? '2', opts.stepUp === false ? null : new Date()],
  );
  return session.rows[0]!.id;
}
