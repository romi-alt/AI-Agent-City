import { createHash, randomUUID } from 'node:crypto';
import type { LiteConfig } from './config.ts';
import { deriveKey, hmacB64, newToken, sha256Hex } from './crypto.ts';
import { demoUnavailable, LiteError, refused } from './errors.ts';
import { checkFormToken, issueFormToken } from './form-token.ts';
import type { MailKind, Mailer } from './mailer.ts';
import { buildOffice, type SimOffice } from './office.ts';
import { withScenarios, type SimScenarioPack } from './scenarios.ts';
import { readSession, signSession } from './session.ts';
import type { DemoRequestRow, Lead, LeadStatus, Store } from './store.ts';
import { firstNameOf, isUuid, parseDemoRequest, ValidationError } from './validate.ts';

export type DemoStatus = LeadStatus;

/** The demo building pool: the rental buildings of the city (catalog keys). A lead's building is a hash of its id. */
export const BUILDING_POOL: readonly { key: string; name: string }[] = [
  { key: 'rental-1', name: 'Rental Building 1' },
  { key: 'rental-2', name: 'Rental Building 2' },
  { key: 'rental-3', name: 'Rental Building 3' },
];

export function buildingFor(leadId: string): { key: string; name: string } {
  const n = createHash('sha256').update(`building:${leadId}`).digest().readUInt32BE(0);
  return BUILDING_POOL[n % BUILDING_POOL.length]!;
}

export interface MeResult {
  firstName: string;
  company: string;
  building: { key: string; name: string };
  office: { level: number; name: string };
  expiresAt: string;
}

export interface AdminLead {
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
  verifiedAt: string | null;
}

export interface ServiceDeps {
  store: Store;
  /** Null: the demo is unavailable (no mailer configured). */
  mailer: Mailer | null;
  config: LiteConfig;
  now?: () => number;
  /** Receives log lines; they carry ids and error names only, never personal data. */
  log?: (line: string) => void;
}

export interface VerifyOutcome {
  cookie: string;
  maxAgeSeconds: number;
}

const DAY_MS = 86_400_000;

export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

export function createService(deps: ServiceDeps) {
  const { store, mailer, config } = deps;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));
  const secret = config.secret;
  const formKey = secret ? deriveKey(secret, 'form') : null;
  const rateKey = secret ? deriveKey(secret, 'rate') : null;
  const sessionKey = secret ? deriveKey(secret, 'session') : null;
  /** Sending runs after the response, so a known and a new address take the same time. */
  const pending = new Set<Promise<void>>();
  /** Requests whose confirmation email the provider refused, so the check-email page can say so (kept for an hour). */
  const sendFailed = new Map<string, number>();

  const available = () => !!(secret && mailer);

  /**
   * Expired demos and stale rows are cleaned up by whoever uses the funnel next, at most once an hour per process,
   * so a deployment without a scheduler still ends demos on time. The admin route does the same on demand.
   */
  let lastSweep = 0;
  function sweepSoon() {
    if (now() - lastSweep < 3_600_000) return;
    lastSweep = now();
    const p = adminExpire().then(
      () => undefined,
      e => log(`lite: sweep failed (${(e as Error).name})`),
    );
    pending.add(p);
    void p.finally(() => pending.delete(p));
  }

  async function limit(klass: string, subject: string, max: number, windowSeconds: number, failOpen: boolean) {
    const windowMs = windowSeconds * 1000;
    const index = Math.floor(now() / windowMs);
    const bucket = hmacB64(rateKey!, `${klass}\n${windowSeconds}\n${index}\n${subject}`);
    try {
      const n = await store.hitRate(sha256Hex(bucket), new Date((index + 1) * windowMs + 60_000));
      if (n <= max) return;
      const retryAfterSeconds = Math.max(1, Math.ceil(((index + 1) * windowMs - now()) / 1000));
      throw new LiteError('rate_limited', 'Too many requests. Wait a moment and try again.', { retryAfterSeconds });
    } catch (e) {
      if (e instanceof LiteError) throw e;
      log(`lite: rate limiter unavailable (${(e as Error).name})`);
      if (!failOpen) throw demoUnavailable();
    }
  }

  async function formToken(ip: string) {
    if (!secret) throw demoUnavailable();
    sweepSoon();
    await limit('public', ip, config.limits.publicPerMinute, 60, true);
    return { token: issueFormToken(formKey!, now()) };
  }

  function sendLater(lead: Lead, requestId: string, firstName: string, token: string, kind: MailKind = 'verify') {
    const link = `${config.publicOrigin}/api/lite/demo/verify?t=${encodeURIComponent(token)}`;
    const p = mailer!
      .sendVerification({ email: lead.email, firstName }, link, kind)
      .then(() => log(`lite: request ${requestId} (lead ${lead.id}): ${kind} link sent via ${mailer!.name}`))
      .catch(e => {
        if (kind === 'verify') sendFailed.set(requestId, now());
        log(`lite: request ${requestId} (lead ${lead.id}): ${kind} link not sent (${(e as Error).name})`);
      })
      .finally(() => pending.delete(p));
    pending.add(p);
  }

  /** Chooses what the submission does to the address's lead; returns the lead and whether to send a link. */
  async function resolveLead(
    input: ReturnType<typeof parseDemoRequest>,
  ): Promise<{ lead: Lead; send: boolean; shadow: boolean }> {
    const t = new Date(now());
    const fresh = (generation: number): Lead => ({
      id: randomUUID(),
      email: input.email,
      fullName: input.fullName,
      company: input.company,
      industry: input.industry ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      marketingConsent: input.marketingConsent,
      consentRecordedAt: t,
      consentNoticeVersion: config.consentNoticeVersion,
      attribution: input.attribution,
      status: 'verification-sent',
      generation,
      createdAt: t,
      expiresAt: new Date(now() + config.demoTtlDays * DAY_MS),
      verifiedAt: null,
    });
    let existing = await store.findLeadByEmail(input.email);
    if (!existing) {
      const lead = fresh(1);
      if (await store.insertLead(lead)) return { lead, send: true, shadow: false };
      existing = await store.findLeadByEmail(input.email); // a concurrent submission created it first
      if (!existing) throw demoUnavailable();
    }
    if (existing.status !== 'expired' && existing.expiresAt.getTime() <= now()) {
      await store.expireLead(existing.id);
      existing = { ...existing, status: 'expired' };
    }
    if (existing.status === 'expired') {
      // A returning visitor after expiry: a new demo with the new details and consent choice.
      const next = fresh(existing.generation + 1);
      const patch = {
        fullName: next.fullName,
        company: next.company,
        industry: next.industry,
        phone: next.phone,
        website: next.website,
        marketingConsent: next.marketingConsent,
        consentRecordedAt: t,
        consentNoticeVersion: next.consentNoticeVersion,
        attribution: next.attribution,
        status: 'verification-sent' as const,
        generation: next.generation,
        expiresAt: next.expiresAt,
        verifiedAt: null,
      };
      await store.updateLead(existing.id, patch);
      return { lead: { ...existing, ...patch }, send: true, shadow: false };
    }
    // Resubmitting never changes an active lead's details: anyone can type any address into the form.
    if (existing.status === 'ready') return { lead: existing, send: false, shadow: true };
    return { lead: existing, send: true, shadow: false };
  }

  /**
   * Stores the request and answers the same `{ requestId, status: 'verification-sent' }` whether the address is
   * new, pending, already verified or already claimed. The email goes out after the answer.
   */
  async function submit(body: unknown, ip: string): Promise<{ requestId: string; status: 'verification-sent' }> {
    if (!available()) throw demoUnavailable();
    const { limits } = config;
    await limit('ip10', ip, limits.ipPerTenMinutes, 600, false);
    await limit('ipday', ip, limits.ipPerDay, 86_400, false);
    let input;
    try {
      input = parseDemoRequest(body);
    } catch (e) {
      if (e instanceof ValidationError)
        throw new LiteError('validation_failed', 'Some of the information is missing or not valid.', {
          fields: e.fields,
        });
      throw e;
    }
    if (input.website2) throw refused(); // honeypot
    if (checkFormToken(formKey!, input.formToken, config.formMinSeconds, config.formMaxSeconds, now()) !== 'ok')
      throw refused();
    await limit('email', input.email, limits.emailPerHour, 3600, false);

    try {
      const idem = sha256Hex(`${input.formToken}\n${input.email}`);
      const replay = await store.findRequestByHash(idem);
      if (replay) return { requestId: replay.id, status: 'verification-sent' };
      const { lead, send, shadow } = await resolveLead(input);
      const request: DemoRequestRow = {
        id: randomUUID(),
        leadId: lead.id,
        generation: lead.generation,
        idempotencyHash: idem,
        shadow,
        shadowExpiresAt: shadow ? lead.expiresAt : null,
        createdAt: new Date(now()),
      };
      await store.insertRequest(request);
      if (send) {
        const { token, hash } = newToken();
        await store.replaceLink({
          tokenHash: hash,
          leadId: lead.id,
          generation: lead.generation,
          expiresAt: new Date(now() + config.linkTtlSeconds * 1000),
        });
        sendLater(lead, request.id, firstNameOf(input.fullName), token);
      }
      return { requestId: request.id, status: 'verification-sent' };
    } catch (e) {
      if (e instanceof LiteError) throw e;
      log(`lite: submit failed (${(e as Error).name})`);
      throw demoUnavailable();
    }
  }

  /**
   * Returning visitors: sends a fresh one-time link to an address that already has an active, verified demo. The
   * answer is the same whether or not the address has one, so this cannot be used to find out who signed up.
   */
  async function signIn(body: unknown, ip: string): Promise<{ status: 'sent' }> {
    if (!available()) throw demoUnavailable();
    const { limits } = config;
    await limit('ip10', ip, limits.ipPerTenMinutes, 600, false);
    await limit('ipday', ip, limits.ipPerDay, 86_400, false);
    const src = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const email = typeof src.email === 'string' ? src.email.trim().toLowerCase() : '';
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new LiteError('validation_failed', 'Enter a valid email address.', {
        fields: { email: 'Enter a valid email address.' },
      });
    if (typeof src.website2 === 'string' && src.website2) throw refused(); // honeypot
    const token = typeof src.formToken === 'string' ? src.formToken : '';
    if (checkFormToken(formKey!, token, config.formMinSeconds, config.formMaxSeconds, now()) !== 'ok') throw refused();
    await limit('signin-email', email, limits.emailPerHour, 3600, false);
    try {
      const lead = await store.findLeadByEmail(email);
      const active = !!lead && !!lead.verifiedAt && lead.status !== 'expired' && lead.expiresAt.getTime() > now();
      if (lead && active) {
        const { token: link, hash } = newToken();
        await store.replaceLink({
          tokenHash: hash,
          leadId: lead.id,
          generation: lead.generation,
          expiresAt: new Date(now() + config.linkTtlSeconds * 1000),
        });
        sendLater(lead, randomUUID(), firstNameOf(lead.fullName), link, 'signin');
      }
    } catch (e) {
      if (e instanceof LiteError) throw e;
      log(`lite: sign-in failed (${(e as Error).name})`);
      throw demoUnavailable();
    }
    return { status: 'sent' };
  }

  function statusOf(req: DemoRequestRow, lead: Lead | null): DemoStatus {
    if (req.shadow)
      return req.shadowExpiresAt && req.shadowExpiresAt.getTime() <= now() ? 'expired' : 'verification-sent';
    if (!lead || lead.generation !== req.generation || lead.status === 'expired' || lead.expiresAt.getTime() <= now())
      return 'expired';
    return lead.verifiedAt ? 'ready' : 'verification-sent';
  }

  async function status(requestId: string, ip: string): Promise<{ status: DemoStatus; delivery?: 'failed' }> {
    if (!secret) throw demoUnavailable();
    await limit('public', ip, config.limits.publicPerMinute, 60, true);
    if (!isUuid(requestId)) throw new LiteError('not_found', 'That demo request was not found.');
    const req = await store.findRequest(requestId);
    if (!req) throw new LiteError('not_found', 'That demo request was not found.');
    const current = statusOf(req, await store.findLead(req.leadId));
    for (const [id, at] of sendFailed) if (now() - at > 3_600_000) sendFailed.delete(id);
    return sendFailed.has(requestId) && current === 'verification-sent'
      ? { status: current, delivery: 'failed' }
      : { status: current };
  }

  /** Spends the one-time link. Null for an unknown, used or expired link, or a demo that has ended. */
  async function verify(token: string | null, ip: string): Promise<VerifyOutcome | null> {
    if (!secret || !token || token.length > 100) return null;
    try {
      await limit('public', ip, config.limits.publicPerMinute, 60, true);
    } catch {
      return null;
    }
    const link = await store.consumeLink(sha256Hex(token), new Date(now()));
    if (!link) return null;
    const lead = await store.findLead(link.leadId);
    if (!lead || lead.generation !== link.generation || lead.status === 'expired' || lead.expiresAt.getTime() <= now())
      return null;
    if (lead.status !== 'ready') await store.updateLead(lead.id, { status: 'ready', verifiedAt: new Date(now()) });
    await store.ensureWorkspace(lead.id, buildingFor(lead.id).key, new Date(now()));
    log(`lite: lead ${lead.id} verified`);
    const expiresAt = lead.expiresAt.getTime();
    return {
      cookie: signSession(sessionKey!, { leadId: lead.id, generation: lead.generation, expiresAt }),
      // The cookie outlives the demo by two days so a returning visitor is told it expired (410), not just signed out.
      maxAgeSeconds: Math.max(1, Math.floor((expiresAt - now()) / 1000)) + 2 * 86_400,
    };
  }

  /** The signed-in visitor's lead, or 401 (no valid session) / 410 (demo over). */
  async function session(cookie: string | undefined) {
    if (!secret) throw demoUnavailable();
    const claim = readSession(sessionKey!, cookie);
    if (!claim) throw new LiteError('unauthorized', 'Open your demo from the link in your email.');
    const lead = await store.findLead(claim.leadId);
    if (!lead || lead.generation !== claim.generation || !lead.verifiedAt)
      throw new LiteError('unauthorized', 'Open your demo from the link in your email.');
    if (lead.status === 'expired' || lead.expiresAt.getTime() <= now())
      throw new LiteError('gone', 'This demo has expired. You can request a new one on the home page.');
    const workspace = await store.ensureWorkspace(lead.id, buildingFor(lead.id).key, new Date(now()));
    return { lead, workspace };
  }

  async function me(cookie: string | undefined): Promise<MeResult> {
    const { lead, workspace } = await session(cookie);
    const building = BUILDING_POOL.find(b => b.key === workspace.buildingKey) ?? buildingFor(lead.id);
    return {
      firstName: firstNameOf(lead.fullName),
      company: lead.company,
      building: { key: building.key, name: building.name },
      office: { level: ((workspace.seq - 1) % 99) + 1, name: `${lead.company} office` },
      expiresAt: lead.expiresAt.toISOString(),
    };
  }

  async function office(cookie: string | undefined): Promise<SimOffice & SimScenarioPack> {
    const { lead } = await session(cookie);
    return withScenarios(lead.id, buildOffice(lead.id, lead.company, new Date(now())));
  }

  function toAdmin(l: Lead, full: boolean): AdminLead {
    return {
      id: l.id,
      createdAt: l.createdAt.toISOString(),
      fullName: l.fullName,
      email: full ? l.email : maskEmail(l.email),
      company: l.company,
      industry: l.industry,
      phone: full || !l.phone ? l.phone : `${'*'.repeat(Math.max(0, l.phone.length - 2))}${l.phone.slice(-2)}`,
      website: l.website,
      marketingConsent: l.marketingConsent,
      consentRecordedAt: l.consentRecordedAt.toISOString(),
      consentNoticeVersion: l.consentNoticeVersion,
      attribution: l.attribution,
      status: l.expiresAt.getTime() <= now() ? 'expired' : l.status,
      expiresAt: l.expiresAt.toISOString(),
      verifiedAt: l.verifiedAt ? l.verifiedAt.toISOString() : null,
    };
  }

  async function adminLeads(page: number, pageSize: number, full: boolean) {
    const size = Math.min(200, Math.max(1, pageSize));
    const p = Math.max(1, page);
    const r = await store.listLeads((p - 1) * size, size);
    return { page: p, pageSize: size, total: r.total, leads: r.rows.map(l => toAdmin(l, full)) };
  }

  async function adminExpire() {
    const expired = await store.expireDue(new Date(now()));
    const removed = await store.cleanup(new Date(now()));
    log(`lite: expired ${expired.length} demos, removed ${removed} stale rows`);
    return { expired: expired.length, removed };
  }

  return {
    available,
    formToken,
    submit,
    signIn,
    status,
    verify,
    me,
    office,
    adminLeads,
    adminExpire,
    /** Resolves when background sending started so far has finished (tests, graceful shutdown). */
    async whenIdle() {
      while (pending.size) await Promise.allSettled([...pending]);
    },
  };
}
export type LiteService = ReturnType<typeof createService>;
