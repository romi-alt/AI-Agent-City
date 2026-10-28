// Browser calls to the API. Everything goes to this site's own `/api/*` (proxied to the API by next.config.ts), so
// the session cookie stays first-party, and every call carries a fresh device proof (DESIGN.md "Device binding").
// Browser-only; server code uses lib/api.ts.
import { deviceProof, getDeviceKey } from './device-key';
import type { AuthMeResponse, LoginStartResponse, StepUpReason } from './auth-types';

/** Error codes from apps/api/src/auth/contracts.ts (AUTH_ERRORS), mirrored here: the web app never imports API code. */
export const API_ERRORS = {
  notSignedIn: 'not_signed_in',
  deviceProofRequired: 'device_proof_required',
  sessionRevoked: 'session_revoked',
  badOrigin: 'bad_origin',
  stepUpRequired: 'step_up_required',
  forbidden: 'forbidden',
  noTenant: 'no_tenant_selected',
} as const;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    const code = typeof body.error === 'string' ? body.error : null;
    super(code ?? `HTTP ${status}`);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** Thrown (instead of redirecting) when the caller asked to handle step-up itself, e.g. to explain it first. */
export class StepUpRequiredError extends ApiError {
  readonly reason: StepUpReason;
  constructor(status: number, body: Record<string, unknown>) {
    super(status, body);
    this.reason = (body.reason as StepUpReason) ?? 'credential';
  }
}

/** Thrown after we have started navigating away (to sign-in or step-up); callers can ignore it. */
export class NavigatingAwayError extends Error {}

export interface ApiOptions {
  body?: unknown;
  /** 'redirect' (default): signed-out responses go to /signin. 'throw': the caller shows its own message. */
  signedOut?: 'redirect' | 'throw';
  /** 'redirect' (default): start a step-up and come back to this page. 'throw': throw StepUpRequiredError. */
  stepUp?: 'redirect' | 'throw';
}

/** The page we are on, as a same-origin path to come back to. */
export function currentPath(): string {
  return window.location.pathname + window.location.search;
}

/** Only same-origin paths are allowed as return targets ("/x", never "//host" or "https://…"). */
export function safeReturnTo(value: string | null | undefined, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}

export function goToSignIn(returnTo = currentPath(), reason?: string): never {
  const params = new URLSearchParams({ returnTo: safeReturnTo(returnTo) });
  if (reason) params.set('reason', reason);
  window.location.assign(`/signin?${params}`);
  throw new NavigatingAwayError('going to sign in');
}

async function send(method: string, path: string, body: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Device-Proof': await deviceProof(method, path),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { value: parsed };
  } catch {
    return {};
  }
}

/** Call `/api/<path>` with a device proof. Resolves with the JSON body; rejects with ApiError. */
export async function api<T = Record<string, unknown>>(
  method: string,
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  if (!path.startsWith('/api/')) throw new Error(`api() only calls /api/* paths, not ${path}`);
  let res = await send(method, path, opts.body);
  let body = await readJson(res);

  // A proof can fail for a passing reason (clock skew, a replayed jti after a retry): sign a fresh one once.
  if (res.status === 401 && body.error === API_ERRORS.deviceProofRequired) {
    res = await send(method, path, opts.body);
    body = await readJson(res);
  }
  if (res.ok) return body as T;

  const code = body.error;
  if (res.status === 401 && (opts.signedOut ?? 'redirect') === 'redirect') {
    if (code === API_ERRORS.notSignedIn || code === API_ERRORS.sessionRevoked) goToSignIn(currentPath(), code);
    // Still no valid proof: this browser's key is not the one the session was bound to. Sign in again here.
    if (code === API_ERRORS.deviceProofRequired) goToSignIn(currentPath(), code);
  }
  if (res.status === 403 && code === API_ERRORS.stepUpRequired) {
    if ((opts.stepUp ?? 'redirect') === 'throw') throw new StepUpRequiredError(res.status, body);
    await startStepUp((body.reason as StepUpReason) ?? 'credential', currentPath());
  }
  throw new ApiError(res.status, body);
}

/** POST /api/auth/login/start and go to the identity provider. Used for sign-in, SSO and step-up. */
export async function startLogin(input: {
  purpose: 'login' | 'step-up';
  returnTo: string;
  stepUpReason?: StepUpReason;
  idpHint?: 'agency-sso';
  /** An email address to prefill at the identity provider (X01 demo sign-in after email verification). */
  loginHint?: string;
}): Promise<never> {
  const key = await getDeviceKey();
  const res = await api<LoginStartResponse>('POST', '/api/auth/login/start', {
    body: { deviceJwk: key.publicJwk, ...input, returnTo: safeReturnTo(input.returnTo) },
    signedOut: 'throw',
    stepUp: 'throw',
  });
  if (typeof res.authorizeUrl !== 'string') throw new Error('the sign-in service did not return where to go next');
  window.location.assign(res.authorizeUrl);
  throw new NavigatingAwayError('going to the identity provider');
}

/** Ask for a fresh strong sign-in (passkey) for `reason`, then come back to `returnTo`. */
export function startStepUp(reason: StepUpReason, returnTo: string): Promise<never> {
  return startLogin({ purpose: 'step-up', stepUpReason: reason, returnTo });
}

export function getMe(opts?: ApiOptions): Promise<AuthMeResponse> {
  return api<AuthMeResponse>('GET', '/api/auth/me', opts);
}

/** Human-readable text for an error thrown by api(). */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case API_ERRORS.forbidden:
        return 'Your role does not allow this.';
      case API_ERRORS.badOrigin:
        return 'The request did not come from this site, so it was refused. Reload the page and try again.';
      case API_ERRORS.noTenant:
        return 'Choose an organisation to work in first.';
      case API_ERRORS.notSignedIn:
      case API_ERRORS.sessionRevoked:
        return 'You are signed out. Sign in again to continue.';
      default:
        return typeof err.body.message === 'string' ? err.body.message : `Something went wrong (HTTP ${err.status}).`;
    }
  }
  if (err instanceof TypeError) return 'Could not reach AgentCity. Check your connection and try again.';
  return 'Something went wrong. Try again.';
}

// ---------------------------------------------------------------------------------------------------------------
// Lite demo client (/api/lite/demo/*). The public demo is cookie-based (ac_demo), so these calls carry no device
// proof and never redirect to a sign-in page. Every response is checked before the pages see it.

export type LiteErrorCode =
  | 'validation_failed'
  | 'rate_limited'
  | 'bad_request'
  | 'demo_unavailable'
  | 'unauthorized'
  | 'expired'
  | 'network'
  | 'bad_response';

export class LiteError extends Error {
  readonly status: number;
  readonly code: LiteErrorCode;
  constructor(status: number, code: LiteErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface LiteDemoRequest {
  name: string;
  email: string;
  company: string;
  industry?: string;
  phone?: string;
  website?: string;
  marketingConsent: boolean;
  formToken: string;
  /** Honeypot: people never see this field, so a filled value marks a bot. */
  website2: string;
  referrerHost?: string;
  attribution?: Record<string, string>;
}

export type LiteStatus = 'verification-sent' | 'ready' | 'expired';
export type LiteAgentStatus = 'working' | 'idle' | 'needs-you';

export interface LiteMe {
  firstName: string;
  company: string;
  building: { key: string; name: string };
  office: { level: number; name: string };
  expiresAt: string;
}

export interface LiteAgent {
  id: string;
  name: string;
  role: string;
  status: LiteAgentStatus;
  currentTask: string | null;
  summary: string | null;
  updatedAt: string | null;
}

export interface LiteTask {
  id: string;
  title: string;
  agentId: string | null;
  status: string | null;
}

export interface LiteOffice {
  agents: LiteAgent[];
  tasks: LiteTask[];
  daySummary: string | null;
  simulated: true;
}

type Rec = Record<string, unknown>;
const bad = (what: string) => new LiteError(502, 'bad_response', `Unexpected answer from the demo service (${what}).`);
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, what: string): string => {
  if (typeof v !== 'string') throw bad(what);
  return v;
};
const textOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const rec = (v: unknown, what: string): Rec => {
  if (!isRec(v)) throw bad(what);
  return v;
};

const KNOWN_CODES: LiteErrorCode[] = ['validation_failed', 'rate_limited', 'bad_request', 'demo_unavailable'];

function errorFrom(status: number, body: unknown): LiteError {
  const inner = isRec(body) && isRec(body.error) ? body.error : {};
  const raw = typeof inner.code === 'string' ? inner.code : '';
  const message = typeof inner.message === 'string' ? inner.message : `Request failed (HTTP ${status}).`;
  const known = KNOWN_CODES.find(c => c === raw);
  if (known) return new LiteError(status, known, message);
  if (status === 401) return new LiteError(status, 'unauthorized', message);
  if (status === 410) return new LiteError(status, 'expired', message);
  return new LiteError(
    status,
    status === 429 ? 'rate_limited' : status === 503 ? 'demo_unavailable' : 'bad_request',
    message,
  );
}

async function liteFetch(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      credentials: 'same-origin',
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new LiteError(0, 'network', 'Could not reach AgentCity. Check your connection and try again.');
  }
  const parsed: unknown = await res.json().catch(() => null);
  if (!res.ok) throw errorFrom(res.status, parsed);
  return parsed;
}

export async function liteFormToken(): Promise<string> {
  return text(rec(await liteFetch('GET', '/api/lite/demo/form-token'), 'form token').token, 'form token');
}

export async function liteRequestDemo(input: LiteDemoRequest): Promise<{ requestId: string }> {
  const out = rec(await liteFetch('POST', '/api/lite/demo', input), 'request');
  return { requestId: text(out.requestId, 'request id') };
}

export async function liteStatus(requestId: string): Promise<LiteStatus> {
  const path = `/api/lite/demo/status?request=${encodeURIComponent(requestId)}`;
  const status = rec(await liteFetch('GET', path), 'status').status;
  if (status === 'verification-sent' || status === 'ready' || status === 'expired') return status;
  throw bad('status');
}

export async function liteMe(): Promise<LiteMe> {
  const b = rec(await liteFetch('GET', '/api/lite/demo/me'), 'me');
  const building = rec(b.building, 'building');
  const office = rec(b.office, 'office');
  const level = office.level;
  if (typeof level !== 'number') throw bad('office level');
  return {
    firstName: textOrNull(b.firstName) ?? '',
    company: textOrNull(b.company) ?? '',
    building: { key: text(building.key, 'building key'), name: text(building.name, 'building name') },
    office: { level, name: text(office.name, 'office name') },
    expiresAt: text(b.expiresAt, 'expiry'),
  };
}

const AGENT_STATUS: LiteAgentStatus[] = ['working', 'idle', 'needs-you'];

function parseAgent(v: unknown): LiteAgent {
  const a = rec(v, 'agent');
  const status = AGENT_STATUS.find(s => s === a.status) ?? 'idle';
  return {
    id: text(a.id, 'agent id'),
    name: text(a.name, 'agent name'),
    role: text(a.role, 'agent role'),
    status,
    currentTask: textOrNull(a.currentTask),
    summary: textOrNull(a.summary),
    updatedAt: textOrNull(a.updatedAt),
  };
}

function parseTask(v: unknown, i: number): LiteTask {
  const t = rec(v, 'task');
  return {
    id: textOrNull(t.id) ?? `task-${i}`,
    title: textOrNull(t.title) ?? textOrNull(t.name) ?? textOrNull(t.description) ?? 'Task',
    agentId: textOrNull(t.agentId),
    status: textOrNull(t.status),
  };
}

export async function liteOffice(): Promise<LiteOffice> {
  const b = rec(await liteFetch('GET', '/api/lite/demo/office'), 'office');
  if (!Array.isArray(b.agents)) throw bad('agents');
  return {
    agents: b.agents.map(parseAgent),
    tasks: Array.isArray(b.tasks) ? b.tasks.map(parseTask) : [],
    daySummary: textOrNull(b.daySummary),
    simulated: true,
  };
}

export async function liteSignOut(): Promise<void> {
  await liteFetch('POST', '/api/lite/demo/signout', {});
}
