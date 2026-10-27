import { API_ENV, type ApiEnv } from '../env.js';

/** Spam and abuse limits for the public demo routes (Redis sliding windows; API-CONVENTIONS.md §6). */
export interface DemoLimits {
  /** Demo requests per client IP. */
  ipPerTenMinutes: number;
  ipPerDay: number;
  /** Demo requests per email address (each can lead to a verification email). */
  emailPerHour: number;
  /** Status checks and form tokens per client IP. */
  publicPerMinute: number;
}

export interface DemoConfig {
  /** The agentcity realm issuer; the admin API is `<origin>/admin/realms/<realm>`. */
  keycloakIssuer: string;
  /** The service-account client allowed to create demo users and send their verification email. Null: disabled. */
  provisioner: { clientId: string; clientSecret: string } | null;
  /**
   * The client the verification link returns through. The provisioner itself: its only redirect URI is
   * /demo/verified*, so the sign-in client (agentcity-bff) keeps exactly one redirect URI, its callback.
   */
  verifyClientId: string;
  publicOrigin: string;
  demoTtlDays: number;
  /** The verify-email link's lifetime. Kept at or below 48 hours (PLAN.md decision 4). */
  verifyLinkSeconds: number;
  invitationTtlHours: number;
  formMinSeconds: number;
  formMaxSeconds: number;
  /** Which privacy notice the form shows; stored with every consent choice. Bump it when the notice changes. */
  consentNoticeVersion: string;
  limits: DemoLimits;
  /** Redis key prefix for the limits (tests use their own). */
  rateKeyPrefix: string;
  /** Secret for form tokens, cursors and hashed rate-limit keys (derived per purpose). */
  secret: string;
  production: boolean;
}

export const DEMO_CONFIG = Symbol('DEMO_CONFIG');

export const DEFAULT_DEMO_LIMITS: DemoLimits = {
  ipPerTenMinutes: 5,
  ipPerDay: 30,
  emailPerHour: 3,
  publicPerMinute: 60,
};

/** The privacy notice the demo form links to. */
export const CONSENT_NOTICE_VERSION = '2026-10-x01';

export function demoConfigFromEnv(env: ApiEnv): DemoConfig {
  return {
    keycloakIssuer: env.OIDC_ISSUER,
    provisioner:
      env.PROVISIONER_CLIENT_ID && env.PROVISIONER_CLIENT_SECRET
        ? { clientId: env.PROVISIONER_CLIENT_ID, clientSecret: env.PROVISIONER_CLIENT_SECRET }
        : null,
    verifyClientId: env.PROVISIONER_CLIENT_ID ?? env.OIDC_CLIENT_ID,
    publicOrigin: env.PUBLIC_ORIGIN,
    demoTtlDays: env.DEMO_TTL_DAYS,
    verifyLinkSeconds: Math.min(48, env.INVITATION_TTL_HOURS) * 3600,
    invitationTtlHours: env.INVITATION_TTL_HOURS,
    formMinSeconds: env.DEMO_FORM_MIN_SECONDS,
    formMaxSeconds: 2 * 3600,
    consentNoticeVersion: CONSENT_NOTICE_VERSION,
    limits: DEFAULT_DEMO_LIMITS,
    rateKeyPrefix: 'rl',
    secret: env.SESSION_ENCRYPTION_KEY,
    production: env.NODE_ENV === 'production',
  };
}

export const demoConfigProvider = {
  provide: DEMO_CONFIG,
  inject: [API_ENV],
  useFactory: (env: ApiEnv) => demoConfigFromEnv(env),
};
