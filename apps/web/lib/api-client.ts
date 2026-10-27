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
