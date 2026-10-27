// Request IDs: accept a well-formed X-Request-Id from the caller (the web app's proxy, a load balancer), otherwise
// make one. It is echoed on every response, put in every error body and log line, and available to code that has
// no request object (services, loggers) through currentRequestId().
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
/** Printable, short and free of spaces/newlines, so a caller cannot inject log lines or huge headers. */
const VALID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface RequestWithId extends Request {
  requestId: string;
}

const store = new AsyncLocalStorage<{ requestId: string }>();

export const isValidRequestId = (v: unknown): v is string => typeof v === 'string' && VALID.test(v);

/** The id of the request being handled, if any (undefined outside a request, e.g. in a timer). */
export const currentRequestId = (): string | undefined => store.getStore()?.requestId;

/** The id already assigned to this request, or a new one (for errors raised before the middleware ran). */
export function requestIdOf(req: Request | undefined): string {
  const existing = (req as Partial<RequestWithId> | undefined)?.requestId;
  return isValidRequestId(existing) ? existing : (currentRequestId() ?? randomUUID());
}

/**
 * Express middleware: register it first (`app.use(requestIdMiddleware())` in main.ts) so every later
 * middleware, guard, filter and resolver sees the id. Only one header value is accepted; anything malformed is
 * replaced, never echoed.
 */
export function requestIdMiddleware(opts: { generate?: () => string } = {}) {
  const generate = opts.generate ?? randomUUID;
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id = isValidRequestId(incoming) ? incoming : generate();
    (req as RequestWithId).requestId = id;
    res.setHeader('X-Request-Id', id);
    store.run({ requestId: id }, next);
  };
}
