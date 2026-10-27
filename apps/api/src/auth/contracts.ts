// The contract between the M03 modules (auth, access, realtime, web). See planning/agentcity-migration/m03/DESIGN.md.
// Changing anything here affects other modules: coordinate first.
import type { Request } from 'express';

/** Authentication methods recorded on a session (OIDC "amr"-style). */
export type AuthMethod = 'passkey' | 'email-code' | 'sso' | 'password' | 'otp' | 'recovery-code';

/** A signed-in browser session, resolved from the session cookie and a valid device proof. */
export interface SessionContext {
  sessionId: string;
  /** Stable person id used everywhere in the database: `kc:<keycloak sub>`. */
  subject: string;
  email: string | null;
  emailVerified: boolean;
  deviceId: string;
  amr: AuthMethod[];
  /** Keycloak level of authentication from the token ("1" basic, "2" strong; see DESIGN.md). */
  acr: string | null;
  authTime: Date;
  /** Last successful step-up (fresh strong sign-in), if any. */
  stepUpAt: Date | null;
  /** The tenant/workspace the person is currently working in (set by access via POST /api/session/tenant). */
  tenantId: string | null;
  workspaceId: string | null;
}

export interface AuthenticatedRequest extends Request {
  session: SessionContext;
}

/** Why a privileged action needs a fresh strong sign-in. */
export type StepUpReason = 'credential' | 'billing' | 'permission';

/** Error codes the API returns (JSON body `{ error: <code>, … }`); the web app reacts to these. */
export const AUTH_ERRORS = {
  notSignedIn: 'not_signed_in', // 401
  deviceProofRequired: 'device_proof_required', // 401: missing/invalid X-Device-Proof
  sessionRevoked: 'session_revoked', // 401
  badOrigin: 'bad_origin', // 403: CSRF defence
  stepUpRequired: 'step_up_required', // 403: body includes { reason }
  forbidden: 'forbidden', // 403: role/assignment does not allow it
  noTenant: 'no_tenant_selected', // 409
} as const;

/** Name of the request header carrying the device proof (compact JWS, see DESIGN.md "Device binding"). */
export const DEVICE_PROOF_HEADER = 'x-device-proof';
export const SESSION_COOKIE = 'ac_session';
export const LOGIN_COOKIE = 'ac_login';
