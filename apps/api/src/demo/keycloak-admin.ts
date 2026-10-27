/**
 * The few Keycloak admin REST calls the demo funnel needs, made with the `agentcity-provisioner` service account
 * (client credentials). Its only realm-management role is `manage-users` (see the realm file): enough to find and
 * create a user and to send them an execute-actions email, nothing else.
 *
 * Demo people get no password and no credential of any kind. Keycloak sends the verify-email message through the
 * realm's SMTP server (Mailpit locally). Error messages name the call and the status, never the email address.
 */
export interface KeycloakUser {
  id: string;
  email?: string;
  emailVerified?: boolean;
  enabled?: boolean;
}

export class KeycloakAdminError extends Error {
  override name = 'KeycloakAdminError';
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.status = status;
  }
}

export interface KeycloakAdminOptions {
  /** The realm issuer, e.g. http://localhost:58080/realms/agentcity. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export type VerificationOutcome = 'created-and-sent' | 'sent' | 'already-verified';

export class KeycloakAdmin {
  private readonly tokenUrl: string;
  private readonly adminBase: string;
  private readonly opts: KeycloakAdminOptions;
  private readonly fetch: typeof fetch;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(opts: KeycloakAdminOptions) {
    const issuer = new URL(opts.issuer.replace(/\/$/, ''));
    const m = /^(.*)\/realms\/([^/]+)$/.exec(issuer.pathname);
    if (!m) throw new Error('The Keycloak issuer must end in /realms/<realm>.');
    this.tokenUrl = `${issuer.origin}${issuer.pathname}/protocol/openid-connect/token`;
    this.adminBase = `${issuer.origin}${m[1]}/admin/realms/${m[2]}`;
    this.opts = opts;
    this.fetch = opts.fetch ?? fetch;
  }

  private signal() {
    return AbortSignal.timeout(this.opts.timeoutMs ?? 10_000);
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const basic = Buffer.from(
      `${encodeURIComponent(this.opts.clientId)}:${encodeURIComponent(this.opts.clientSecret)}`,
    ).toString('base64');
    const res = await this.fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
      signal: this.signal(),
    });
    if (!res.ok) throw new KeycloakAdminError(`service-account sign-in failed (${res.status})`, res.status);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new KeycloakAdminError('service-account sign-in returned no token', res.status);
    this.token = { value: body.access_token, expiresAt: Date.now() + Math.max(5, (body.expires_in ?? 60) - 15) * 1000 };
    return body.access_token;
  }

  private async call(method: string, path: string, what: string, body?: unknown): Promise<Response> {
    const send = async () =>
      this.fetch(`${this.adminBase}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${await this.accessToken()}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: this.signal(),
      });
    let res = await send();
    if (res.status === 401) {
      // The cached token was revoked or the realm restarted: sign in once more.
      this.token = null;
      res = await send();
    }
    if (!res.ok && res.status !== 409) throw new KeycloakAdminError(`${what} failed (${res.status})`, res.status);
    return res;
  }

  /** The user whose email is exactly this address (case-insensitive), or null. */
  async findUserByEmail(email: string): Promise<KeycloakUser | null> {
    const q = new URLSearchParams({ email, exact: 'true', briefRepresentation: 'true', max: '5' });
    const res = await this.call('GET', `/users?${q}`, 'user search');
    const users = (await res.json()) as KeycloakUser[];
    const want = email.toLowerCase();
    return users.find(u => (u.email ?? '').toLowerCase() === want) ?? null;
  }

  /** Creates the person: username = email, not yet verified, no password, no credentials, no required actions. */
  async createUser(input: { email: string; firstName: string; lastName: string }): Promise<KeycloakUser> {
    const res = await this.call('POST', '/users', 'user creation', {
      username: input.email,
      email: input.email,
      emailVerified: false,
      enabled: true,
      firstName: input.firstName,
      lastName: input.lastName,
      requiredActions: [],
    });
    // 409: created concurrently (or the username exists); either way, read it back.
    const location = res.headers.get('location');
    const id = res.status === 201 && location ? location.slice(location.lastIndexOf('/') + 1) : null;
    if (id) return { id, email: input.email, emailVerified: false, enabled: true };
    const found = await this.findUserByEmail(input.email);
    if (!found) throw new KeycloakAdminError('user creation returned no user', res.status);
    return found;
  }

  /** Keycloak emails the person a one-time verify-email link that returns to `redirectUri` through `clientId`. */
  async sendVerifyEmail(userId: string, o: { clientId: string; redirectUri: string; lifespanSeconds: number }) {
    const q = new URLSearchParams({
      client_id: o.clientId,
      redirect_uri: o.redirectUri,
      lifespan: String(o.lifespanSeconds),
    });
    const res = await this.call(
      'PUT',
      `/users/${encodeURIComponent(userId)}/execute-actions-email?${q}`,
      'verify email',
      ['VERIFY_EMAIL'],
    );
    if (res.status === 409) throw new KeycloakAdminError('verify email failed (409)', 409);
  }

  /**
   * Find-or-create the person, then send the verify-email link unless the address is already verified (a returning
   * visitor signs in instead; they get the same answer from the API either way).
   */
  async ensureVerification(input: {
    email: string;
    firstName: string;
    lastName: string;
    clientId: string;
    redirectUri: string;
    lifespanSeconds: number;
  }): Promise<VerificationOutcome> {
    let user = await this.findUserByEmail(input.email);
    let created = false;
    if (!user) {
      user = await this.createUser(input);
      created = true;
    }
    if (user.emailVerified) return 'already-verified';
    await this.sendVerifyEmail(user.id, input);
    return created ? 'created-and-sent' : 'sent';
  }
}
