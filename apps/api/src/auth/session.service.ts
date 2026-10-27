import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import type pg from 'pg';
import { API_ENV, type ApiEnv } from '../env.js';
import { APP_POOL, REDIS } from '../platform/platform.module.js';
import { RevocationBus, type Revocation } from '../platform/revocation-bus.js';
import { acrLevel, mapAuthMethods } from './amr.js';
import { AUTH_ERRORS, type AuthMethod, type SessionContext, type StepUpReason } from './contracts.js';
import { randomToken, sha256Hex, TokenCipher } from './crypto.js';
import { DeviceProofError, DeviceProofVerifier, type DevicePublicJwk } from './device-proof.js';
import { authError } from './http-util.js';
import { IdpRejectedError, IdTokenError, OidcClient, type TokenSet } from './oidc.js';

/** How often a session's refresh token is used to confirm the person is still active at the IdP. */
export const REVALIDATE_INTERVAL_SECONDS = 5 * 60;
/** last_seen_at / idle expiry are written at most this often per session. */
const TOUCH_INTERVAL_SECONDS = 60;
export const LOGIN_ATTEMPT_TTL_SECONDS = 10 * 60;
/** Clock allowance when checking that a step-up's auth_time is after the step-up started. */
const STEP_UP_CLOCK_SKEW_SECONDS = 5;

export interface SessionRow {
  id: string;
  subject: string;
  device_id: string;
  amr: string[];
  acr: string | null;
  auth_time: Date;
  step_up_at: Date | null;
  tenant_id: string | null;
  workspace_id: string | null;
  idp_session_id: string | null;
  created_at: Date;
  last_seen_at: Date;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  revalidated_at: Date;
  revoked_at: Date | null;
  refresh_token_enc: Buffer | null;
  email: string | null;
  email_verified: boolean;
  person_disabled_at: Date | null;
  device_jkt: string;
  device_label: string | null;
  device_revoked_at: Date | null;
  /** Computed by the database clock, so every API instance agrees. */
  idle_expired: boolean;
  absolute_expired: boolean;
  touch_due: boolean;
  revalidate_due: boolean;
}

const SESSION_SELECT = `
  SELECT s.id, s.subject, s.device_id, s.amr, s.acr, s.auth_time, s.step_up_at, s.tenant_id, s.workspace_id,
         s.idp_session_id, s.created_at, s.last_seen_at, s.idle_expires_at, s.absolute_expires_at, s.revalidated_at,
         s.revoked_at, s.refresh_token_enc,
         p.email, p.email_verified, p.disabled_at AS person_disabled_at,
         d.jkt AS device_jkt, d.label AS device_label, d.revoked_at AS device_revoked_at,
         s.idle_expires_at <= now() AS idle_expired,
         s.absolute_expires_at <= now() AS absolute_expired,
         s.last_seen_at <= now() - make_interval(secs => ${TOUCH_INTERVAL_SECONDS}) AS touch_due,
         s.revalidated_at <= now() - make_interval(secs => ${REVALIDATE_INTERVAL_SECONDS}) AS revalidate_due
  FROM identity.session s
  JOIN identity.person p ON p.subject = s.subject
  JOIN identity.device d ON d.id = s.device_id`;

export interface LoginAttemptRow {
  state_sha256: string;
  nonce: string;
  code_verifier: string;
  device_jkt: string;
  device_jwk: DevicePublicJwk;
  purpose: 'login' | 'step-up';
  step_up_reason: StepUpReason | null;
  session_id: string | null;
  return_to: string;
  created_at: Date;
  device_label: string | null;
}

/** A sign-in callback that must not create or change a session. `code` goes to the client; `detail` to the log. */
export class LoginRefused extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
  ) {
    super(detail);
  }
}

export type SessionInvalidReason = 'revoked' | 'idle' | 'absolute' | 'person_disabled' | 'device_revoked';

export function invalidReason(row: SessionRow): SessionInvalidReason | null {
  if (row.revoked_at) return 'revoked';
  if (row.person_disabled_at) return 'person_disabled';
  if (row.device_revoked_at) return 'device_revoked';
  if (row.absolute_expired) return 'absolute';
  if (row.idle_expired) return 'idle';
  return null;
}

/**
 * Server sessions, devices, sign-in attempts and the security log (schema `identity`). Shared by the HTTP guard,
 * the auth controller and the Socket.IO session resolver, so every path applies the same checks.
 */
@Injectable()
export class SessionService {
  private readonly log = new Logger('Auth');
  private readonly cipher: TokenCipher;

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(APP_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(RevocationBus) private readonly bus: RevocationBus,
    @Inject(OidcClient) private readonly oidc: OidcClient,
    @Inject(DeviceProofVerifier) private readonly proofs: DeviceProofVerifier,
  ) {
    this.cipher = new TokenCipher(env.SESSION_ENCRYPTION_KEY);
  }

  // ---------------------------------------------------------------- resolving a request to a session

  async findByToken(token: string | undefined): Promise<SessionRow | null> {
    if (!token || token.length > 128) return null;
    const r = await this.pool.query<SessionRow>(`${SESSION_SELECT} WHERE s.token_sha256 = $1`, [sha256Hex(token)]);
    return r.rows[0] ?? null;
  }

  async findById(id: string): Promise<SessionRow | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const r = await this.pool.query<SessionRow>(`${SESSION_SELECT} WHERE s.id = $1`, [id]);
    return r.rows[0] ?? null;
  }

  /**
   * Cookie → live session → device proof (signed by the session's device key) → Origin (when required) →
   * periodic IdP revalidation → touch. Throws an `authError` describing the first failure.
   */
  async authenticate(input: {
    token: string | undefined;
    proof: string | undefined;
    htm: string;
    htu: string;
    origin: string | undefined;
    requireOrigin: boolean;
  }): Promise<{ row: SessionRow; context: SessionContext }> {
    if (!input.token) throw authError(AUTH_ERRORS.notSignedIn);
    const row = await this.findByToken(input.token);
    if (!row) throw authError(AUTH_ERRORS.notSignedIn);
    if (invalidReason(row)) throw authError(AUTH_ERRORS.sessionRevoked);

    let jkt: string;
    try {
      jkt = (await this.proofs.verify(input.proof, { htm: input.htm, htu: input.htu })).jkt;
    } catch (err) {
      if (err instanceof DeviceProofError) throw authError(AUTH_ERRORS.deviceProofRequired);
      throw err;
    }
    if (jkt !== row.device_jkt) throw authError(AUTH_ERRORS.deviceProofRequired);
    if (input.requireOrigin && input.origin !== this.env.PUBLIC_ORIGIN) throw authError(AUTH_ERRORS.badOrigin);

    if (!(await this.revalidateIfDue(row))) throw authError(AUTH_ERRORS.sessionRevoked);
    await this.touch(row);
    return { row, context: toContext(row) };
  }

  /** Session state without a proof (periodic socket re-checks). Null when it is no longer usable. */
  async current(sessionId: string): Promise<SessionContext | null> {
    const row = await this.findById(sessionId);
    if (!row || invalidReason(row)) return null;
    if (!(await this.revalidateIfDue(row))) return null;
    return toContext(row);
  }

  private async touch(row: SessionRow) {
    if (!row.touch_due) return;
    await this.pool.query(
      `UPDATE identity.session
         SET last_seen_at = now(),
             idle_expires_at = least(now() + make_interval(mins => $2), absolute_expires_at)
       WHERE id = $1 AND revoked_at IS NULL`,
      [row.id, this.env.SESSION_IDLE_MINUTES],
    );
    await this.pool.query(`UPDATE identity.device SET last_seen_at = now() WHERE id = $1`, [row.device_id]);
  }

  /**
   * At most every REVALIDATE_INTERVAL_SECONDS (and by one API instance at a time), use the refresh token to
   * confirm the person still has an active IdP session. A refusal (invalid_grant: disabled user, ended IdP
   * session, revoked token) revokes the session; an unreachable IdP does not, and is retried later.
   * Returns false if the session was revoked.
   */
  async revalidateIfDue(row: SessionRow): Promise<boolean> {
    if (!row.revalidate_due) return true;
    const lock = await this.redis.set(`agentcity:auth:revalidate:${row.id}`, '1', 'EX', 30, 'NX');
    if (lock !== 'OK') return true; // another request is already checking this session
    if (!row.refresh_token_enc) {
      await this.revokeSession(row.id, 'no_refresh_token', { subject: row.subject });
      return false;
    }
    let refreshToken: string;
    try {
      refreshToken = this.cipher.decrypt(row.refresh_token_enc, `${row.id}:refresh`);
    } catch {
      await this.event(this.pool, {
        subject: row.subject,
        sessionId: row.id,
        kind: 'refresh_failed',
        detail: { reason: 'undecryptable' },
      });
      await this.revokeSession(row.id, 'refresh_failed', { subject: row.subject });
      return false;
    }
    const idpSub = row.subject.slice('kc:'.length);
    try {
      const tokens = await this.oidc.refresh(refreshToken, idpSub);
      await this.pool.query(
        `UPDATE identity.session
           SET revalidated_at = now(),
               refresh_token_enc = coalesce($2, refresh_token_enc),
               id_token_enc = coalesce($3, id_token_enc)
         WHERE id = $1 AND revoked_at IS NULL`,
        [
          row.id,
          tokens.refreshToken ? this.cipher.encrypt(tokens.refreshToken, `${row.id}:refresh`) : null,
          tokens.idToken ? this.cipher.encrypt(tokens.idToken, `${row.id}:id_token`) : null,
        ],
      );
      return true;
    } catch (err) {
      if (err instanceof IdpRejectedError || err instanceof IdTokenError) {
        await this.event(this.pool, {
          subject: row.subject,
          sessionId: row.id,
          kind: 'refresh_failed',
          detail: { reason: err instanceof IdpRejectedError ? err.message : 'id_token' },
        });
        await this.revokeSession(row.id, 'refresh_failed', { subject: row.subject });
        return false;
      }
      // The IdP is unreachable or answered with a server error: keep the session, try again after the lock expires.
      this.log.warn(`Session revalidation deferred: IdP unavailable (${errorName(err)})`);
      return true;
    }
  }

  // ---------------------------------------------------------------- sign-in attempts

  async createLoginAttempt(input: {
    state: string;
    nonce: string;
    codeVerifier: string;
    deviceJkt: string;
    deviceJwk: DevicePublicJwk;
    deviceLabel: string | null;
    purpose: 'login' | 'step-up';
    stepUpReason: StepUpReason | null;
    sessionId: string | null;
    returnTo: string;
  }) {
    // Housekeeping: attempts are useless after expiry; keep a day for investigation, then drop them.
    await this.pool.query(`DELETE FROM identity.login_attempt WHERE expires_at < now() - interval '1 day'`);
    await this.pool.query(
      `INSERT INTO identity.login_attempt
         (state_sha256, nonce, code_verifier, device_jkt, device_jwk, device_label, purpose, step_up_reason, session_id,
          return_to, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + make_interval(secs => $11))`,
      [
        sha256Hex(input.state),
        input.nonce,
        input.codeVerifier,
        input.deviceJkt,
        JSON.stringify(input.deviceJwk),
        input.deviceLabel,
        input.purpose,
        input.stepUpReason,
        input.sessionId,
        input.returnTo,
        LOGIN_ATTEMPT_TTL_SECONDS,
      ],
    );
  }

  /** Marks the attempt used and returns it; null if unknown, expired or already used (single use, atomic). */
  async consumeLoginAttempt(state: string): Promise<LoginAttemptRow | null> {
    const r = await this.pool.query<LoginAttemptRow>(
      `UPDATE identity.login_attempt SET used_at = now()
       WHERE state_sha256 = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING state_sha256, nonce, code_verifier, device_jkt, device_jwk, device_label, purpose, step_up_reason,
                 session_id, return_to, created_at`,
      [sha256Hex(state)],
    );
    return r.rows[0] ?? null;
  }

  /** Finishes a sign-in: person and device upserted, a new session created. Returns the cookie token. */
  async completeLogin(attempt: LoginAttemptRow, tokens: TokenSet): Promise<{ token: string; sessionId: string }> {
    const c = tokens.claims;
    const subject = `kc:${c.sub}`;
    const amr: AuthMethod[] = mapAuthMethods(c);
    const acr = typeof c.acr === 'string' ? c.acr : null;
    const token = randomToken();
    const sessionId = randomUUID();
    return this.tx(async db => {
      const person = await db.query<{ disabled_at: Date | null }>(
        `INSERT INTO identity.person (subject, issuer, idp_subject, email, email_verified, display_name, last_sign_in_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (subject) DO UPDATE
           SET email = EXCLUDED.email, email_verified = EXCLUDED.email_verified,
               display_name = EXCLUDED.display_name, last_sign_in_at = now()
           WHERE identity.person.issuer = EXCLUDED.issuer
         RETURNING disabled_at`,
        [
          subject,
          c.iss,
          c.sub,
          typeof c.email === 'string' ? c.email.toLowerCase() : null,
          c.email_verified === true,
          typeof c.name === 'string' ? c.name.slice(0, 200) : null,
        ],
      );
      if (!person.rows[0]) throw new LoginRefused(403, AUTH_ERRORS.forbidden, 'issuer mismatch for subject');
      if (person.rows[0].disabled_at) throw new LoginRefused(403, AUTH_ERRORS.forbidden, 'person disabled');

      const device = await db.query<{ id: string; revoked_at: Date | null }>(
        `INSERT INTO identity.device (subject, jkt, public_jwk, label) VALUES ($1, $2, $3, $4)
         ON CONFLICT (subject, jkt) DO UPDATE SET last_seen_at = now()
         RETURNING id, revoked_at`,
        [subject, attempt.device_jkt, JSON.stringify(attempt.device_jwk), attempt.device_label],
      );
      const dev = device.rows[0]!;
      // A revoked key stays revoked: the browser must create a new one.
      if (dev.revoked_at) throw new LoginRefused(403, AUTH_ERRORS.sessionRevoked, 'device revoked');

      await db.query(
        `INSERT INTO identity.session
           (id, token_sha256, subject, device_id, amr, acr, auth_time, idp_session_id, refresh_token_enc, id_token_enc,
            idle_expires_at, absolute_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7), $8, $9, $10,
                 least(now() + make_interval(mins => $11), now() + make_interval(hours => $12)),
                 now() + make_interval(hours => $12))`,
        [
          sessionId,
          sha256Hex(token),
          subject,
          dev.id,
          amr,
          acr,
          c.auth_time,
          typeof c.sid === 'string' ? c.sid : null,
          tokens.refreshToken ? this.cipher.encrypt(tokens.refreshToken, `${sessionId}:refresh`) : null,
          this.cipher.encrypt(tokens.idToken, `${sessionId}:id_token`),
          this.env.SESSION_IDLE_MINUTES,
          this.env.SESSION_ABSOLUTE_HOURS,
        ],
      );
      await this.event(db, { subject, sessionId, kind: 'sign_in', detail: { amr, acr, deviceId: dev.id } });
      return { token, sessionId };
    });
  }

  /**
   * Finishes a step-up on the session that started it: same person (`sub`), a fresh authentication (auth_time after
   * the step-up began) and a strong level (acr >= 2). Anything else is refused and logged; the session is unchanged.
   */
  async completeStepUp(attempt: LoginAttemptRow, tokens: TokenSet, cookieSessionId: string | null) {
    const c = tokens.claims;
    const sessionId = attempt.session_id!;
    const refuse = async (reason: string, subject: string | null) => {
      await this.event(this.pool, { subject, sessionId, kind: 'step_up_refused', detail: { reason } });
      return new LoginRefused(403, AUTH_ERRORS.forbidden, `step-up refused: ${reason}`);
    };
    const row = await this.findById(sessionId);
    if (!row || invalidReason(row)) throw await refuse('session_not_active', row?.subject ?? null);
    if (cookieSessionId !== sessionId) throw await refuse('different_browser_session', row.subject);
    if (row.device_jkt !== attempt.device_jkt) throw await refuse('different_device', row.subject);
    if (`kc:${c.sub}` !== row.subject) throw await refuse('different_subject', row.subject);
    if (acrLevel(c.acr) < 2) throw await refuse('acr_too_low', row.subject);
    if (c.auth_time < attempt.created_at.getTime() / 1000 - STEP_UP_CLOCK_SKEW_SECONDS)
      throw await refuse('not_fresh', row.subject);

    const amr = mapAuthMethods(c);
    await this.tx(async db => {
      await db.query(
        `UPDATE identity.session
           SET step_up_at = now(), acr = $2, amr = $3, auth_time = to_timestamp($4),
               refresh_token_enc = coalesce($5, refresh_token_enc), id_token_enc = $6,
               idp_session_id = coalesce($7, idp_session_id), revalidated_at = now()
         WHERE id = $1 AND revoked_at IS NULL`,
        [
          sessionId,
          c.acr,
          amr,
          c.auth_time,
          tokens.refreshToken ? this.cipher.encrypt(tokens.refreshToken, `${sessionId}:refresh`) : null,
          this.cipher.encrypt(tokens.idToken, `${sessionId}:id_token`),
          typeof c.sid === 'string' ? c.sid : null,
        ],
      );
      await this.event(db, {
        subject: row.subject,
        sessionId,
        kind: 'step_up',
        detail: { reason: attempt.step_up_reason, acr: c.acr, amr },
      });
    });
  }

  // ---------------------------------------------------------------- listing and revocation

  async listForPerson(subject: string) {
    const sessions = await this.pool.query<{
      id: string;
      device_id: string;
      amr: string[];
      acr: string | null;
      created_at: Date;
      last_seen_at: Date;
      auth_time: Date;
    }>(
      `SELECT id, device_id, amr, acr, created_at, last_seen_at, auth_time FROM identity.session
       WHERE subject = $1 AND revoked_at IS NULL AND idle_expires_at > now() AND absolute_expires_at > now()
       ORDER BY last_seen_at DESC`,
      [subject],
    );
    const devices = await this.pool.query<{ id: string; label: string | null; created_at: Date; last_seen_at: Date }>(
      `SELECT id, label, created_at, last_seen_at FROM identity.device
       WHERE subject = $1 AND revoked_at IS NULL ORDER BY last_seen_at DESC`,
      [subject],
    );
    return { sessions: sessions.rows, devices: devices.rows };
  }

  /** Ends one session. `subject`, when given, must own it (a person can only end their own sessions). */
  async revokeSession(sessionId: string, reason: string, opts: { subject?: string } = {}): Promise<boolean> {
    const r = await this.tx(async db => {
      const u = await db.query<{ subject: string }>(
        `UPDATE identity.session SET revoked_at = now(), revoked_reason = $2,
                refresh_token_enc = NULL
         WHERE id = $1 AND revoked_at IS NULL AND ($3::text IS NULL OR subject = $3)
         RETURNING subject`,
        [sessionId, reason, opts.subject ?? null],
      );
      if (!u.rows[0]) return false;
      const kind = reason === 'logout' ? 'logout' : 'session_revoked';
      await this.event(db, { subject: u.rows[0].subject, sessionId, kind, detail: { reason } });
      return true;
    });
    if (r) await this.publish({ kind: 'session', sessionId, reason });
    return r;
  }

  /** Revokes a device key and every session bound to it. */
  async revokeDevice(deviceId: string, subject: string, reason: string): Promise<boolean> {
    const sessions = await this.tx(async db => {
      const d = await db.query(
        `UPDATE identity.device SET revoked_at = now(), revoked_reason = $3
         WHERE id = $1 AND subject = $2 AND revoked_at IS NULL RETURNING id`,
        [deviceId, subject, reason],
      );
      if (!d.rows[0]) return null;
      const s = await db.query<{ id: string }>(
        `UPDATE identity.session SET revoked_at = now(), revoked_reason = $2, refresh_token_enc = NULL
         WHERE device_id = $1 AND revoked_at IS NULL RETURNING id`,
        [deviceId, `device_${reason}`],
      );
      await this.event(db, {
        subject,
        sessionId: null,
        kind: 'device_revoked',
        detail: { deviceId, reason, sessions: s.rows.map(x => x.id) },
      });
      return s.rows.map(x => x.id);
    });
    if (!sessions) return false;
    await this.publish({ kind: 'device', deviceId, reason });
    for (const id of sessions) await this.publish({ kind: 'session', sessionId: id, reason: `device_${reason}` });
    return true;
  }

  /** Back-channel logout: the IdP ended its session `sid` (or every session of `sub`). Returns the count revoked. */
  async revokeByIdp(input: { sid?: string; sub?: string }): Promise<number> {
    const subject = input.sub ? `kc:${input.sub}` : null;
    const ids = await this.tx(async db => {
      const r = await db.query<{ id: string; subject: string }>(
        `UPDATE identity.session SET revoked_at = now(), revoked_reason = 'backchannel_logout', refresh_token_enc = NULL
         WHERE revoked_at IS NULL
           AND ($1::text IS NULL OR idp_session_id = $1)
           AND ($2::text IS NULL OR subject = $2)
         RETURNING id, subject`,
        [input.sid ?? null, subject],
      );
      for (const s of r.rows)
        await this.event(db, { subject: s.subject, sessionId: s.id, kind: 'backchannel_logout', detail: {} });
      return r.rows.map(x => x.id);
    });
    for (const id of ids) await this.publish({ kind: 'session', sessionId: id, reason: 'backchannel_logout' });
    return ids.length;
  }

  /** Disables a person: every session ends now and new sign-ins are refused until re-enabled. */
  async disablePerson(subject: string, reason: string): Promise<boolean> {
    const ids = await this.tx(async db => {
      const p = await db.query(
        `UPDATE identity.person SET disabled_at = now() WHERE subject = $1 AND disabled_at IS NULL RETURNING subject`,
        [subject],
      );
      if (!p.rows[0]) return null;
      const s = await db.query<{ id: string }>(
        `UPDATE identity.session SET revoked_at = now(), revoked_reason = 'person_disabled', refresh_token_enc = NULL
         WHERE subject = $1 AND revoked_at IS NULL RETURNING id`,
        [subject],
      );
      await this.event(db, { subject, sessionId: null, kind: 'person_disabled', detail: { reason } });
      return s.rows.map(x => x.id);
    });
    if (!ids) return false;
    await this.publish({ kind: 'person', subject, reason });
    for (const id of ids) await this.publish({ kind: 'session', sessionId: id, reason: 'person_disabled' });
    return true;
  }

  /** Logout: ends the session and returns what RP-initiated logout needs (decrypted here, never stored elsewhere). */
  async logout(sessionId: string): Promise<{ idToken: string | null; refreshToken: string | null }> {
    const r = await this.pool.query<{ id_token_enc: Buffer | null; refresh_token_enc: Buffer | null }>(
      `SELECT id_token_enc, refresh_token_enc FROM identity.session WHERE id = $1`,
      [sessionId],
    );
    const open = (v: Buffer | null | undefined, field: string) => {
      if (!v) return null;
      try {
        return this.cipher.decrypt(v, `${sessionId}:${field}`);
      } catch {
        return null;
      }
    };
    const out = {
      idToken: open(r.rows[0]?.id_token_enc, 'id_token'),
      refreshToken: open(r.rows[0]?.refresh_token_enc, 'refresh'),
    };
    await this.revokeSession(sessionId, 'logout');
    await this.pool.query(`UPDATE identity.session SET id_token_enc = NULL WHERE id = $1`, [sessionId]);
    return out;
  }

  /**
   * Stores the tenant/workspace the person works in on their session. For the access module, which must prove the
   * membership (app.enter_scope) before calling this.
   */
  async setTenant(sessionId: string, tenantId: string | null, workspaceId: string | null): Promise<void> {
    await this.pool.query(
      `UPDATE identity.session SET tenant_id = $2, workspace_id = $3 WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId, tenantId, workspaceId],
    );
  }

  async deviceInfo(deviceId: string): Promise<{ label: string | null } | null> {
    const r = await this.pool.query<{ label: string | null }>(`SELECT label FROM identity.device WHERE id = $1`, [
      deviceId,
    ]);
    return r.rows[0] ?? null;
  }

  /** Appends to identity.security_event. Details hold ids and reasons only, never tokens. */
  recordEvent(e: { subject: string | null; sessionId: string | null; kind: string; detail: Record<string, unknown> }) {
    return this.event(this.pool, e);
  }

  private async event(
    db: pg.Pool | pg.PoolClient,
    e: { subject: string | null; sessionId: string | null; kind: string; detail: Record<string, unknown> },
  ) {
    await db.query(`INSERT INTO identity.security_event (subject, session_id, kind, detail) VALUES ($1, $2, $3, $4)`, [
      e.subject,
      e.sessionId,
      e.kind,
      JSON.stringify(e.detail),
    ]);
  }

  private async publish(r: Revocation) {
    try {
      await this.bus.publish(r);
    } catch (err) {
      // The database already says revoked (every check reads it); realtime's 60 s re-check is the backstop.
      this.log.error(`Could not publish ${r.kind} revocation (${errorName(err)})`);
    }
  }

  private async tx<T>(fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let broken: Error | undefined;
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch((e: Error) => {
        broken = e;
      });
      throw err;
    } finally {
      client.release(broken);
    }
  }
}

export function toContext(row: SessionRow): SessionContext {
  return {
    sessionId: row.id,
    subject: row.subject,
    email: row.email,
    emailVerified: row.email_verified,
    deviceId: row.device_id,
    amr: row.amr as AuthMethod[],
    acr: row.acr,
    authTime: row.auth_time,
    stepUpAt: row.step_up_at,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
  };
}

/** Error class name only: library errors can carry token responses in their details, which must never be logged. */
export function errorName(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { name?: unknown; code?: unknown };
    const parts = [e.name, e.code].filter(x => typeof x === 'string');
    // Our own claim-check errors carry only the name of the failed check.
    if (err instanceof IdTokenError) parts.push(err.message);
    return parts.join('/') || 'Error';
  }
  return 'Error';
}
