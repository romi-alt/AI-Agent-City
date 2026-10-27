// Structured API errors shared by every M04 module (REST and GraphQL). The body is always
// `{ error: <code>, message, requestId, details? }`; see planning/agentcity-migration/m04/API-CONVENTIONS.md.
// The M03 auth codes (auth/contracts.ts) are part of the same list, so the web app has one set of codes to react to.
import { AUTH_ERRORS } from '../auth/contracts.js';

export const API_ERRORS = {
  ...AUTH_ERRORS,
  badRequest: 'bad_request', // 400: malformed request (not JSON, wrong header format)
  validationFailed: 'validation_failed', // 400: input failed its schema; details.issues lists where
  invalidCursor: 'invalid_cursor', // 400: forged, expired, or from another tenant/filter
  notFound: 'not_found', // 404: missing OR outside your scope (never says which)
  conflict: 'conflict', // 409: the request clashes with current state (duplicate, already decided)
  staleRevision: 'stale_revision', // 412 (If-Match) or 409 (body/GraphQL expectedVersion): someone changed it first
  gone: 'gone', // 410: expired or used single-use link
  payloadTooLarge: 'payload_too_large', // 413
  unsupportedMediaType: 'unsupported_media_type', // 415
  preconditionRequired: 'precondition_required', // 428: an update without If-Match / expectedVersion
  rateLimited: 'rate_limited', // 429: details.retryAfterSeconds, plus Retry-After header
  outboundDisabled: 'outbound_disabled', // 409: kill switch or demo mode; nothing was sent
  policyBlocked: 'policy_blocked', // 409: suppression, consent, quiet hours or a cap refused the send
  demoUnavailable: 'demo_unavailable', // 503: demo provisioning is not configured here
  emailNotVerified: 'email_not_verified', // 403: the signed-in address has not been verified yet
  internal: 'internal_error', // 500: our fault; quote the request id
  unavailable: 'service_unavailable', // 503: a dependency is down or timed out; safe to retry later
} as const;

export type ApiErrorCode = (typeof API_ERRORS)[keyof typeof API_ERRORS];

/** The HTTP status each code is sent with, unless the thrower picks another (only stale_revision does: 412/409). */
export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  not_signed_in: 401,
  device_proof_required: 401,
  session_revoked: 401,
  bad_origin: 403,
  step_up_required: 403,
  forbidden: 403,
  no_tenant_selected: 409,
  bad_request: 400,
  validation_failed: 400,
  invalid_cursor: 400,
  not_found: 404,
  conflict: 409,
  stale_revision: 409,
  gone: 410,
  payload_too_large: 413,
  unsupported_media_type: 415,
  precondition_required: 428,
  rate_limited: 429,
  outbound_disabled: 409,
  policy_blocked: 409,
  demo_unavailable: 503,
  email_not_verified: 403,
  internal_error: 500,
  service_unavailable: 503,
};

const CODES = new Set<string>(Object.values(API_ERRORS));
export const isApiErrorCode = (v: unknown): v is ApiErrorCode => typeof v === 'string' && CODES.has(v);

/** The JSON body of every error response (and the `extensions` of every GraphQL error). */
export interface ErrorBody {
  error: ApiErrorCode;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
  /** M03 compatibility: step_up_required carries `reason` at the top level (contracts.ts). */
  reason?: string;
}

/**
 * Throw this from services and controllers. `message` is shown to people, so write it from their side of the
 * screen and never put SQL, stack traces, secrets or another tenant's data in it or in `details`.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;
  constructor(code: ApiErrorCode, message: string, opts: { status?: number; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = opts.status ?? ERROR_STATUS[code];
    this.details = opts.details;
  }
}

/** Not found, whether it does not exist or is outside the caller's scope: never reveal which (legacy scope.ts rule). */
export const notFound = (what = 'That item') => new ApiError('not_found', `${what} was not found.`);
