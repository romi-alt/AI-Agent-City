// One error format for REST and GraphQL. Everything thrown (ApiError, Nest HttpException, zod validation, body
// parser errors, database errors, anything else) becomes `{ error, message, requestId, details? }`. Stack traces,
// SQL, constraint values and driver messages are logged server-side only (with the request id), never sent.
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { GraphQLError } from 'graphql';
import { ApiError, type ApiErrorCode, type ErrorBody, isApiErrorCode } from './errors.js';
import { requestIdOf } from './request-id.js';

export interface RenderedError {
  status: number;
  body: ErrorBody;
  /** Extra response headers (Retry-After). */
  headers: Record<string, string>;
  /** True for 5xx: worth an error-level log line with the original error. */
  serverFault: boolean;
}

const MAX_ISSUES = 20;

const STATUS_CODE: Record<number, ApiErrorCode> = {
  400: 'bad_request',
  401: 'not_signed_in',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  410: 'gone',
  412: 'stale_revision',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  428: 'precondition_required',
  429: 'rate_limited',
  503: 'service_unavailable',
};

const DEFAULT_MESSAGE: Partial<Record<ApiErrorCode, string>> = {
  bad_request: 'The request could not be understood.',
  validation_failed: 'Some of the information sent is not valid.',
  not_signed_in: 'Please sign in.',
  device_proof_required: 'This browser could not prove it is the device you signed in on. Sign in again.',
  session_revoked: 'You have been signed out. Sign in again.',
  bad_origin: 'This request did not come from the AgentCity app.',
  step_up_required: 'Confirm it is you to continue.',
  no_tenant_selected: 'Choose which client or workspace you are working in first.',
  invalid_cursor: 'This page link is no longer valid. Start again from the first page.',
  precondition_required: 'This change needs the version you edited.',
  forbidden: 'You do not have permission to do that.',
  not_found: 'That item was not found.',
  conflict: 'That clashes with a change that already happened. Reload and try again.',
  stale_revision: 'Someone changed this since you opened it. Reload to see the latest version.',
  payload_too_large: 'The request is too large.',
  unsupported_media_type: 'Send the request as JSON.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  internal_error: 'Something went wrong on our side. If you report it, quote the request id.',
  service_unavailable: 'A service we depend on is not responding. Try again shortly.',
};

interface ZodLikeIssue {
  path: readonly PropertyKey[];
  code?: string;
  message: string;
}
const isZodError = (e: unknown): e is { issues: ZodLikeIssue[] } =>
  e instanceof Error && e.name === 'ZodError' && Array.isArray((e as { issues?: unknown }).issues);

/** node-postgres DatabaseError: a five-character SQLSTATE plus severity. */
const isPgError = (e: unknown): e is { code: string; severity?: string; constraint?: string } =>
  typeof e === 'object' &&
  e !== null &&
  typeof (e as { code?: unknown }).code === 'string' &&
  /^[0-9A-Z]{5}$/.test((e as { code: string }).code) &&
  'severity' in e;

/** body-parser / http-errors style errors raised before a route runs. */
const isHttpLikeError = (e: unknown): e is { status: number; type?: string; expose?: boolean } =>
  e instanceof Error && typeof (e as { status?: unknown }).status === 'number';

function body(code: ApiErrorCode, message: string | undefined, requestId: string, details?: Record<string, unknown>) {
  const b: ErrorBody = { error: code, message: message || DEFAULT_MESSAGE[code] || 'Request failed.', requestId };
  if (details && Object.keys(details).length) b.details = details;
  return b;
}

/**
 * Database errors that reach the filter were not translated by a service. Map them conservatively: a reference
 * into a row you cannot see is "not found", a duplicate is a conflict, an RLS/permission refusal is forbidden.
 * Constraint names, values and SQL stay in the server log.
 */
function fromPg(code: string): { code: ApiErrorCode; status: number; details?: Record<string, unknown> } {
  if (code === '23505') return { code: 'conflict', status: 409 };
  if (code === '23503') return { code: 'not_found', status: 404 };
  if (code === '42501') return { code: 'forbidden', status: 403 };
  if (code === '23514' || code === '23502' || code.startsWith('22')) return { code: 'validation_failed', status: 400 };
  if (code === '40001' || code === '40P01') return { code: 'conflict', status: 409, details: { retryable: true } };
  if (code === '57014' || code.startsWith('08') || code === '53300' || code === '57P03')
    return { code: 'service_unavailable', status: 503, details: { retryable: true } };
  return { code: 'internal_error', status: 500 };
}

/** Pure translation of anything thrown into the structured response. Used by the Nest filter and Express handler. */
export function renderError(err: unknown, requestId: string): RenderedError {
  const headers: Record<string, string> = {};
  const done = (status: number, b: ErrorBody): RenderedError => {
    if (b.error === 'rate_limited' && typeof b.details?.retryAfterSeconds === 'number')
      headers['Retry-After'] = String(Math.max(1, Math.ceil(b.details.retryAfterSeconds)));
    return { status, body: b, headers, serverFault: status >= 500 };
  };

  if (err instanceof ApiError) return done(err.status, body(err.code, err.message, requestId, err.details));

  if (isZodError(err)) {
    const issues = err.issues.slice(0, MAX_ISSUES).map(i => ({
      path: i.path.map(p => (typeof p === 'symbol' ? String(p.description ?? '') : p)),
      code: i.code ?? 'invalid',
      message: i.message,
    }));
    return done(400, body('validation_failed', undefined, requestId, { issues }));
  }

  if (err instanceof HttpException) {
    const status = err.getStatus();
    const res = err.getResponse();
    const r = typeof res === 'object' && res !== null ? (res as Record<string, unknown>) : {};
    // Guards (M03) throw e.g. ForbiddenException({ error: 'step_up_required', reason, message? }): keep their code.
    const code: ApiErrorCode = isApiErrorCode(r.error)
      ? r.error
      : (STATUS_CODE[status] ?? (status >= 500 ? 'internal_error' : 'bad_request'));
    // Nest's own messages for 4xx are safe ("Cannot GET /x"); a 5xx message could be anything, so use ours.
    const message = status < 500 && typeof r.message === 'string' ? r.message : undefined;
    // Anything else a thrower put in the body (e.g. M03's `{ error, reason }`) is kept, under details.
    const details: Record<string, unknown> =
      typeof r.details === 'object' && r.details !== null ? { ...(r.details as Record<string, unknown>) } : {};
    if (isApiErrorCode(r.error))
      for (const [k, v] of Object.entries(r))
        if (!['error', 'message', 'statusCode', 'details'].includes(k)) details[k] = v;
    const b = body(code, message, requestId, details);
    if (code === 'step_up_required' && typeof r.reason === 'string') b.reason = r.reason;
    return done(status, b);
  }

  if (isPgError(err)) {
    const m = fromPg(err.code);
    return done(m.status, body(m.code, undefined, requestId, m.details));
  }

  if (isHttpLikeError(err) && err.status >= 400 && err.status < 500) {
    if (err.type === 'entity.parse.failed')
      return done(400, body('bad_request', 'The request body is not valid JSON.', requestId));
    const code = STATUS_CODE[err.status] ?? 'bad_request';
    return done(err.status, body(code, undefined, requestId));
  }

  return done(500, body('internal_error', undefined, requestId));
}

export interface ErrorLog {
  error(message: string, meta: Record<string, unknown>): void;
}

const nestLog: ErrorLog = {
  error: (message, meta) => new Logger('api-error').error(`${message} ${JSON.stringify(meta)}`),
};

/** What the server log may record about an error: no driver detail/where/parameters (they can hold PII). */
function logMeta(err: unknown, requestId: string, status: number): Record<string, unknown> {
  const meta: Record<string, unknown> = { requestId, status };
  if (err instanceof Error) {
    meta.name = err.name;
    meta.stack = err.stack;
  }
  if (isPgError(err)) {
    meta.sqlstate = err.code;
    if (err.constraint) meta.constraint = err.constraint;
    // A pg error's message can quote values ("Key (email)=(…)"); keep the stack's frames, drop its first line.
    meta.stack = typeof meta.stack === 'string' ? meta.stack.split('\n').slice(1).join('\n') : undefined;
  }
  return meta;
}

/**
 * Global exception filter for REST and GraphQL. Register with `app.useGlobalFilters(new StructuredErrorFilter())`.
 * In GraphQL it returns a GraphQLError whose `extensions` carry the same code, requestId and details.
 */
export class StructuredErrorFilter implements ExceptionFilter {
  private readonly log: ErrorLog;
  constructor(opts: { log?: ErrorLog } = {}) {
    this.log = opts.log ?? nestLog;
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const type = host.getType<string>();
    const req: Request | undefined =
      type === 'http'
        ? host.switchToHttp().getRequest<Request>()
        : (host.getArgByIndex<{ req?: Request } | undefined>(2)?.req ?? undefined);
    const requestId = requestIdOf(req);
    const rendered = renderError(exception, requestId);
    if (rendered.serverFault) this.log.error('request failed', logMeta(exception, requestId, rendered.status));

    if (type === 'graphql') {
      const { error, message, details, reason } = rendered.body;
      return new GraphQLError(message, {
        extensions: {
          code: error,
          requestId,
          status: rendered.status,
          ...(details ? { details } : {}),
          ...(reason ? { reason } : {}),
        },
      });
    }
    if (type !== 'http') return undefined; // Socket.IO gateways handle their own errors (realtime module).

    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) {
      res.end(); // e.g. a stream already started: nothing honest can be added now
      return undefined;
    }
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Cache-Control', 'no-store');
    for (const [k, v] of Object.entries(rendered.headers)) res.setHeader(k, v);
    res.status(rendered.status).json(rendered.body);
    return undefined;
  }
}
// Function-call form: no decorator syntax needed (also works where decorators are not compiled, e.g. tests).
Catch()(StructuredErrorFilter);

/**
 * Express error handler for failures outside Nest's pipeline (body parser, raw Express middleware). Register
 * after the Nest app is set up: `app.use(expressErrorHandler())`.
 */
export function expressErrorHandler(opts: { log?: ErrorLog } = {}) {
  const log = opts.log ?? nestLog;
  return (err: unknown, req: Request, res: Response, next: (e?: unknown) => void) => {
    if (res.headersSent) return next(err);
    const requestId = requestIdOf(req);
    const rendered = renderError(err, requestId);
    if (rendered.serverFault) log.error('request failed', logMeta(err, requestId, rendered.status));
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Cache-Control', 'no-store');
    for (const [k, v] of Object.entries(rendered.headers)) res.setHeader(k, v);
    res.status(rendered.status).json(rendered.body);
  };
}
