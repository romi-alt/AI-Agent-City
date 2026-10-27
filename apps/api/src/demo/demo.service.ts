import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { withScope } from '@agentcity/db';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { AccessService } from '../access/access.service.js';
import type { SessionContext } from '../auth/contracts.js';
import { ApiError, notFound } from '../common/errors.js';
import { buildPage, createCursorCodec, deriveKey, type CursorCodec, type Page } from '../common/pagination.js';
import { APP_POOL, REDIS } from '../platform/platform.module.js';
import { DEMO_CONFIG, type DemoConfig } from './demo.config.js';
import { demoUnavailable, emailNotVerified } from './demo.errors.js';
import { attributionOf, isUuid, parseDemoRequest, splitName } from './demo.schemas.js';
import { createFormTokens, type FormTokens } from './form-token.js';
import { KeycloakAdmin } from './keycloak-admin.js';
import { RateLimiter, type LimitResult } from './rate-limit.js';

export type DemoStatus = 'verification-sent' | 'ready' | 'expired';

export interface DemoContext {
  tenantId: string;
  workspaceId: string;
  firstName: string;
  company: string;
  building: { key: string; name: string };
  office: { level: number; name: string };
  expiresAt: string;
}

export interface LeadRow {
  id: string;
  createdAt: string;
  fullName: string;
  email: string;
  company: string;
  industry: string | null;
  phone: string | null;
  website: string | null;
  marketingConsent: boolean;
  consentRecordedAt: string;
  consentNoticeVersion: string;
  attribution: Record<string, string>;
  status: DemoStatus;
  expiresAt: string;
  claimedAt: string | null;
}

const sqlState = (e: unknown) => (typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined);
const refused = () =>
  new ApiError('bad_request', 'We could not accept this form. Reload the page and try again.', { status: 400 });
const LEADS_BINDING = { resource: 'admin.leads', tenantId: 'platform' };

/**
 * The demo funnel (PLAN.md "Visitor journey"). Personal data (names, email addresses, phone numbers) is never
 * logged: log lines carry request ids, lead/tenant ids and error names only.
 */
@Injectable()
export class DemoService implements OnModuleInit {
  private readonly log = new Logger('Demo');
  private readonly forms: FormTokens;
  private readonly limiter: RateLimiter;
  private readonly cursors: CursorCodec;
  private readonly keycloak: KeycloakAdmin | null;
  /** Provisioning runs after the response (same answer and timing for new and known addresses). */
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @Inject(APP_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) redis: Redis,
    @Inject(DEMO_CONFIG) private readonly config: DemoConfig,
    @Inject(AccessService) private readonly access: AccessService,
  ) {
    this.forms = createFormTokens(deriveKey(config.secret, 'demo-form-token'));
    this.limiter = new RateLimiter(redis, { prefix: config.rateKeyPrefix, key: deriveKey(config.secret, 'demo-rate') });
    this.cursors = createCursorCodec({ keys: [deriveKey(config.secret, 'demo-leads-cursor')] });
    this.keycloak = config.provisioner
      ? new KeycloakAdmin({ issuer: config.keycloakIssuer, ...config.provisioner })
      : null;
  }

  onModuleInit() {
    if (!this.keycloak && !this.config.production) this.setupHint();
  }

  private setupHint() {
    this.log.warn(
      'Demo requests are disabled (503 demo_unavailable): set PROVISIONER_CLIENT_ID and PROVISIONER_CLIENT_SECRET ' +
        '(infra/local-dev.env has the local values) and recreate Keycloak so the agentcity-provisioner client exists.',
    );
  }

  /** Resolves when background provisioning started so far has finished (tests, graceful shutdown). */
  async whenIdle() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  private async limit(klass: string, subject: string, max: number, windowSeconds: number, failOpen: boolean) {
    let r: LimitResult;
    try {
      r = await this.limiter.hit(klass, subject, max, windowSeconds);
    } catch (e) {
      this.log.error(`rate limiter unavailable (${(e as Error).name})`);
      if (failOpen) return;
      throw new ApiError('service_unavailable', '', { details: { retryable: true } });
    }
    if (!r.allowed)
      throw new ApiError('rate_limited', 'Too many requests. Wait a moment and try again.', {
        details: { retryAfterSeconds: r.resetSeconds },
      });
  }

  async formToken(ip: string) {
    await this.limit('demo-public', ip, this.config.limits.publicPerMinute, 60, true);
    return { token: this.forms.issue() };
  }

  /**
   * Stores the request and answers the same `{ requestId, status: 'verification-sent' }` whether the address is new,
   * pending, already verified or already claimed. Keycloak work (find-or-create the person, send the verify-email
   * link) happens afterwards, in the background.
   */
  async submit(body: unknown, ip: string): Promise<{ requestId: string; status: 'verification-sent' }> {
    if (!this.keycloak) {
      if (!this.config.production) this.setupHint();
      throw demoUnavailable();
    }
    const { limits } = this.config;
    await this.limit('demo-ip', ip, limits.ipPerTenMinutes, 600, false);
    await this.limit('demo-ip-day', ip, limits.ipPerDay, 86_400, false);
    const input = parseDemoRequest(body);
    if (input.website2) throw refused(); // honeypot
    if (this.forms.check(input.formToken, this.config.formMinSeconds, this.config.formMaxSeconds) !== 'ok')
      throw refused();
    await this.limit('demo-email', input.email, limits.emailPerHour, 3600, false);

    const idempotency = createHash('sha256').update(`${input.formToken}\n${input.email}`).digest('hex');
    let row: { request_id: string; lead_id: string; send_verification: boolean };
    try {
      const r = await this.pool.query(
        `SELECT request_id, lead_id, send_verification FROM app.submit_demo_request(
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::interval, $12::interval)`,
        [
          input.email,
          input.fullName,
          input.company,
          input.industry ?? null,
          input.phone ?? null,
          input.website ?? null,
          input.marketingConsent,
          this.config.consentNoticeVersion,
          JSON.stringify(attributionOf(input.attribution)),
          idempotency,
          `${this.config.demoTtlDays} days`,
          `${this.config.invitationTtlHours} hours`,
        ],
      );
      row = r.rows[0];
    } catch (e) {
      if (sqlState(e) === '22023')
        throw new ApiError('validation_failed', 'Some of the information is missing or not valid.');
      throw e;
    }

    if (row.send_verification) {
      const { firstName, lastName } = splitName(input.fullName);
      this.track(this.provision(row.request_id, row.lead_id, { email: input.email, firstName, lastName }));
    }
    return { requestId: row.request_id, status: 'verification-sent' };
  }

  private track(p: Promise<void>) {
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }

  private async provision(
    requestId: string,
    leadId: string,
    person: { email: string; firstName: string; lastName: string },
  ) {
    const redirect = new URL('/demo/verified', this.config.publicOrigin);
    redirect.searchParams.set('request', requestId);
    try {
      const outcome = await this.keycloak!.ensureVerification({
        ...person,
        clientId: this.config.verifyClientId,
        redirectUri: redirect.toString(),
        lifespanSeconds: this.config.verifyLinkSeconds,
      });
      this.log.log(`demo request ${requestId} (lead ${leadId}): ${outcome}`);
    } catch (e) {
      // The visitor already has their answer; they can submit again (rate-limited) if no email arrives.
      const status = (e as { status?: number | null }).status;
      this.log.error(
        `demo request ${requestId} (lead ${leadId}): verification not sent (${(e as Error).name}${status ? ` ${status}` : ''})`,
      );
    }
  }

  async status(requestId: string, ip: string): Promise<{ status: DemoStatus }> {
    await this.limit('demo-public', ip, this.config.limits.publicPerMinute, 60, true);
    if (!isUuid(requestId)) throw notFound('That demo request');
    const r = await this.pool.query<{ s: DemoStatus | null }>('SELECT app.demo_request_status($1) AS s', [requestId]);
    const s = r.rows[0]?.s;
    if (!s) throw notFound('That demo request');
    return { status: s };
  }

  /** Accepts the demo invitation of the signed-in (verified) address and switches the session to the demo. */
  async claim(session: SessionContext): Promise<DemoContext> {
    if (!session.email || !session.emailVerified) throw emailNotVerified();
    let row: {
      tenant_id: string;
      workspace_id: string;
      first_name: string;
      company: string;
      building_key: string;
      building_name: string;
      office_level: number;
      expires_at: Date;
    };
    try {
      const r = await this.pool.query('SELECT * FROM app.claim_demo($1, $2, $3)', [
        session.subject,
        session.email,
        session.emailVerified,
      ]);
      row = r.rows[0];
    } catch (e) {
      switch (sqlState(e)) {
        case 'ACI05':
          throw emailNotVerified();
        case 'DEM01':
          throw new ApiError('not_found', 'We could not find a demo for the address you signed in with.');
        case 'DEM02':
          throw new ApiError('gone', 'This demo has expired. You can request a new one on the home page.');
        case 'ACI03':
          throw new ApiError('gone', 'This demo was already opened from another account.');
        case '42501':
          throw new ApiError('forbidden', 'You do not have permission to do that.');
      }
      throw e;
    }
    await this.access.switchTenant(session, row.tenant_id, row.workspace_id);
    return {
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
      firstName: row.first_name,
      company: row.company,
      building: { key: row.building_key, name: row.building_name },
      office: { level: row.office_level, name: officeName(row.company) },
      expiresAt: row.expires_at.toISOString(),
    };
  }

  /** Welcome and office data of the demo the session is in, read under row-level security. */
  async workspace(session: SessionContext) {
    if (!session.tenantId) throw new ApiError('no_tenant_selected', '');
    const scope = { subject: session.subject, tenantId: session.tenantId, workspaceId: session.workspaceId };
    return withScope(this.pool, scope, async c => {
      const p = await c.query(
        `SELECT p.workspace_id, p.first_name, p.company, p.industry, p.building_key, b.name AS building_name,
                p.office_level, p.agents, p.activity, p.expires_at
         FROM app.demo_profile p
         JOIN app.tenant t ON t.id = p.tenant_id AND t.kind = 'demo'
         JOIN catalog.building_alias a ON a.alias = p.building_key
         JOIN catalog.building b ON b.id = a.building_id
         ORDER BY p.created_at LIMIT 1`,
      );
      const profile = p.rows[0];
      if (!profile) throw new ApiError('not_found', 'There is no demo in the workspace you are in.');
      // One connection, one query at a time (pg does not pipeline queries on a client).
      const contacts = await c.query(
        `SELECT id, display_name AS name, interest FROM app.contact ORDER BY display_name LIMIT 50`,
      );
      const opportunities = await c.query(
        `SELECT o.id, o.stage, ct.display_name AS contact FROM app.opportunity o
         JOIN app.contact ct ON ct.tenant_id = o.tenant_id AND ct.id = o.contact_id ORDER BY o.created_at LIMIT 50`,
      );
      const content = await c.query(
        `SELECT id, platform, format, topic, caption, status FROM app.content_item ORDER BY created_at LIMIT 50`,
      );
      const messages = await c.query(
        `SELECT id, channel, subject, body, occurred_at FROM app.message_evidence WHERE verification = 'simulated'
         ORDER BY occurred_at DESC LIMIT 50`,
      );
      return {
        firstName: profile.first_name as string,
        company: profile.company as string,
        industry: (profile.industry as string | null) ?? null,
        building: { key: profile.building_key as string, name: profile.building_name as string },
        office: { level: profile.office_level as number, name: officeName(profile.company) },
        agents: profile.agents as unknown[],
        activity: profile.activity as unknown[],
        samples: {
          contacts: contacts.rows,
          opportunities: opportunities.rows,
          contentItems: content.rows,
          messages: messages.rows.map(m => ({
            id: m.id,
            channel: m.channel,
            subject: m.subject,
            body: m.body,
            occurredAt: (m.occurred_at as Date).toISOString(),
          })),
        },
        expiresAt: (profile.expires_at as Date).toISOString(),
        simulated: true as const,
      };
    });
  }

  private async leadsPage(actor: string, after: readonly unknown[] | null, limit: number) {
    try {
      const r = await this.pool.query('SELECT * FROM app.list_leads($1, $2, $3, $4)', [
        actor,
        after?.[0] ?? null,
        after?.[1] ?? null,
        limit,
      ]);
      return r.rows.map(toLead);
    } catch (e) {
      if (sqlState(e) === '42501') throw new ApiError('forbidden', 'Only platform owners can see demo leads.');
      throw e;
    }
  }

  async leads(session: SessionContext, first: number, after: string | undefined): Promise<Page<LeadRow>> {
    const position = this.cursors.decode(after, LEADS_BINDING);
    const rows = await this.leadsPage(session.subject, position, first + 1);
    return buildPage(
      rows,
      first,
      l => [l.createdAt, l.id],
      pos => this.cursors.encode(pos, LEADS_BINDING),
    );
  }

  /** Every lead (newest first), up to `max` rows, for the CSV export. */
  async allLeads(session: SessionContext, max = 50_000): Promise<LeadRow[]> {
    const out: LeadRow[] = [];
    let after: [string, string] | null = null;
    while (out.length < max) {
      const page = await this.leadsPage(session.subject, after, Math.min(1000, max - out.length));
      out.push(...page);
      if (page.length < 1000) break;
      const last = page[page.length - 1]!;
      after = [last.createdAt, last.id];
    }
    return out;
  }
}

function officeName(company: string) {
  return `${company} office`;
}

function toLead(r: Record<string, any>): LeadRow {
  return {
    id: r.id,
    createdAt: r.created_at.toISOString(),
    fullName: r.full_name,
    email: r.email,
    company: r.company,
    industry: r.industry,
    phone: r.phone,
    website: r.website,
    marketingConsent: r.marketing_consent,
    consentRecordedAt: r.consent_recorded_at.toISOString(),
    consentNoticeVersion: r.consent_notice_version,
    attribution: r.attribution,
    status: r.status,
    expiresAt: r.expires_at.toISOString(),
    claimedAt: r.claimed_at ? r.claimed_at.toISOString() : null,
  };
}

const CSV_COLUMNS: (keyof LeadRow)[] = [
  'createdAt',
  'fullName',
  'email',
  'company',
  'industry',
  'phone',
  'website',
  'marketingConsent',
  'consentRecordedAt',
  'consentNoticeVersion',
  'status',
  'expiresAt',
  'claimedAt',
  'id',
];

/** RFC 4180 CSV; cells that a spreadsheet would run as a formula are prefixed with an apostrophe. */
export function leadsCsv(rows: LeadRow[]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [...CSV_COLUMNS, 'attribution'];
  const lines = [header.join(',')];
  for (const r of rows) lines.push([...CSV_COLUMNS.map(k => cell(r[k])), cell(r.attribution)].join(','));
  return `${lines.join('\r\n')}\r\n`;
}
