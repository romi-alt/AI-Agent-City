import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { AUTH_ERRORS } from '../auth/contracts.js';

/** Error codes the access endpoints add to AUTH_ERRORS (JSON body `{ error: <code> }`). */
export const ACCESS_ERRORS = {
  invalidRequest: 'invalid_request', // 400
  invitationInvalid: 'invitation_invalid', // 410: link not recognised
  invitationExpired: 'invitation_expired', // 410
  invitationUsed: 'invitation_used', // 410: already used, or replaced by a newer link
  invitationNotPending: 'invitation_not_pending', // 409: issuing a link for an accepted/revoked invitation
  emailMismatch: 'invitation_email_mismatch', // 403: signed in with a different address than the one invited
  emailNotVerified: 'email_not_verified', // 403
  lastAdmin: 'last_admin', // 409: would leave the tenant without a tenant-wide client admin (or the agency without an owner)
  notFound: 'not_found', // 404: no such member, staff person or invitation
} as const;

const sqlState = (e: unknown) => (typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined);

/**
 * Turns a refusal from the access functions (see the SQLSTATE list in 1793145600001_access.sql) into an HTTP error.
 * The database messages name no tenant, person or email, but only the invalid-input ones are passed on. Anything
 * unexpected is rethrown as is (a 500, logged by Nest without request bodies).
 */
export function rethrowAccessError(e: unknown, context: 'default' | 'issue' = 'default'): never {
  switch (sqlState(e)) {
    case '42501':
      throw new ForbiddenException({ error: AUTH_ERRORS.forbidden });
    case '22023':
      throw new BadRequestException({ error: ACCESS_ERRORS.invalidRequest, message: (e as Error).message });
    case '22P02':
    case '23503':
      throw new BadRequestException({ error: ACCESS_ERRORS.invalidRequest });
    case 'ACM01':
      throw new ConflictException({ error: ACCESS_ERRORS.lastAdmin });
    case 'ACM02':
      throw new NotFoundException({ error: ACCESS_ERRORS.notFound });
    case 'ACI01':
      throw new GoneException({ error: ACCESS_ERRORS.invitationInvalid });
    case 'ACI02':
      throw new GoneException({ error: ACCESS_ERRORS.invitationExpired });
    case 'ACI03':
      if (context === 'issue') throw new ConflictException({ error: ACCESS_ERRORS.invitationNotPending });
      throw new GoneException({ error: ACCESS_ERRORS.invitationUsed });
    case 'ACI04':
      throw new ForbiddenException({ error: ACCESS_ERRORS.emailMismatch });
    case 'ACI05':
      throw new ForbiddenException({ error: ACCESS_ERRORS.emailNotVerified });
  }
  throw e;
}
