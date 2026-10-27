import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { StructuredErrorFilter } from '../common/error-filter.js';
import { requestIdOf } from '../common/request-id.js';

/**
 * Codes the demo routes add to the M04 list (common/errors.ts), same body shape `{ error, message, requestId }`:
 *   demo_unavailable (503): demo provisioning is not configured on this deployment; nothing was stored.
 *   email_not_verified (403): the signed-in address is not verified yet, so the demo cannot be opened.
 */
export const DEMO_ERRORS = {
  demoUnavailable: 'demo_unavailable',
  emailNotVerified: 'email_not_verified',
} as const;
export type DemoErrorCode = (typeof DEMO_ERRORS)[keyof typeof DEMO_ERRORS];

export class DemoError extends Error {
  readonly code: DemoErrorCode;
  readonly status: number;
  constructor(code: DemoErrorCode, status: number, message: string) {
    super(message);
    this.name = 'DemoError';
    this.code = code;
    this.status = status;
  }
}

export const demoUnavailable = () =>
  new DemoError(DEMO_ERRORS.demoUnavailable, 503, 'Demo requests are not available right now. Please try again later.');
export const emailNotVerified = () =>
  new DemoError(
    DEMO_ERRORS.emailNotVerified,
    403,
    'Confirm your email address first: open the link we sent you, then sign in again.',
  );

/** The M04 structured error filter, plus the demo codes above. */
export class DemoErrorFilter implements ExceptionFilter {
  private readonly structured = new StructuredErrorFilter();

  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof DemoError && host.getType() === 'http') {
      const req = host.switchToHttp().getRequest();
      const res = host.switchToHttp().getResponse<Response>();
      const requestId = requestIdOf(req);
      res.setHeader('X-Request-Id', requestId);
      res.setHeader('Cache-Control', 'no-store');
      res.status(exception.status).json({ error: exception.code, message: exception.message, requestId });
      return undefined;
    }
    return this.structured.catch(exception, host);
  }
}
Catch()(DemoErrorFilter);
