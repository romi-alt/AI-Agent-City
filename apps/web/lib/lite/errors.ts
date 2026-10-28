export type LiteErrorCode =
  | 'validation_failed'
  | 'rate_limited'
  | 'bad_request'
  | 'demo_unavailable'
  | 'unauthorized'
  | 'gone'
  | 'not_found'
  | 'forbidden';

const STATUS: Record<LiteErrorCode, number> = {
  validation_failed: 400,
  rate_limited: 429,
  bad_request: 400,
  demo_unavailable: 503,
  unauthorized: 401,
  gone: 410,
  not_found: 404,
  forbidden: 403,
};

/** An error the visitor may see: a stable code and a message written for them (never echoing what they typed). */
export class LiteError extends Error {
  readonly code: LiteErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  constructor(code: LiteErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'LiteError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const demoUnavailable = () =>
  new LiteError('demo_unavailable', 'The demo is not available right now. Please try again later.');
export const refused = () =>
  new LiteError('bad_request', 'We could not accept this form. Reload the page and try again.');
