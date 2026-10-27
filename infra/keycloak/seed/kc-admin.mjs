// Minimal Keycloak admin REST client for local development scripts (seed, email-code step, verification).
// Plain Node ESM, no dependencies. Refuses to run in production or against anything but a local Keycloak.

/** The Keycloak base URL from the environment, after the local-only guards. Exits the process on refusal. */
export function localKeycloakUrl() {
  if (process.env.NODE_ENV === 'production') {
    refuse('NODE_ENV=production. Development users and realm tweaks are never applied to production.');
  }
  const raw = process.env.KEYCLOAK_URL ?? `http://localhost:${process.env.KEYCLOAK_PORT ?? '58080'}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    refuse(`KEYCLOAK_URL is not a URL: ${raw}`);
  }
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    refuse(`Keycloak host must be localhost or 127.0.0.1, got "${url.hostname}".`);
  }
  // The issuer the API trusts must be local too (OIDC_ISSUER in infra/local-dev.env).
  if (process.env.OIDC_ISSUER) {
    const issuerHost = new URL(process.env.OIDC_ISSUER).hostname;
    if (issuerHost !== 'localhost' && issuerHost !== '127.0.0.1') {
      refuse(`OIDC_ISSUER host must be localhost or 127.0.0.1, got "${issuerHost}".`);
    }
  }
  return url.origin;
}

function refuse(reason) {
  console.error(`Refusing to run: ${reason}`);
  process.exit(2);
}

/** Signs in to the master realm with the bootstrap admin and returns a small fetch wrapper for the admin API. */
export async function adminClient(base = localKeycloakUrl()) {
  const username = process.env.KEYCLOAK_ADMIN_USER;
  const password = process.env.KEYCLOAK_ADMIN_PASSWORD;
  if (!username || !password) {
    refuse('KEYCLOAK_ADMIN_USER and KEYCLOAK_ADMIN_PASSWORD must be set (see infra/local-dev.env).');
  }
  // Master-realm admin tokens live 60 s: sign in again shortly before expiry so long runs keep working.
  let token = null;
  let expiresAt = 0;
  async function signIn() {
    const tokenResponse = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username, password }),
    });
    if (!tokenResponse.ok) {
      throw new Error(`Admin sign-in failed: ${tokenResponse.status} ${await tokenResponse.text()}`);
    }
    const body = await tokenResponse.json();
    token = body.access_token;
    expiresAt = Date.now() + (body.expires_in - 15) * 1000;
  }
  await signIn();

  /** Calls `/admin/realms/<path>`. Returns parsed JSON (or null), and the Location header for creates. */
  async function api(method, path, body, { allow = [] } = {}) {
    if (Date.now() >= expiresAt) await signIn();
    const response = await fetch(`${base}/admin/realms/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok && !allow.includes(response.status)) {
      throw new Error(`${method} ${path} → ${response.status} ${await response.text()}`);
    }
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    return { status: response.status, data, location: response.headers.get('location') };
  }
  return { base, api };
}

/** Finds a user by exact email in a realm, or null. */
export async function findUserByEmail(api, realm, email) {
  const { data } = await api(
    'GET',
    `${realm}/users?email=${encodeURIComponent(email)}&exact=true&briefRepresentation=false`,
  );
  return data.find(u => (u.email ?? '').toLowerCase() === email.toLowerCase()) ?? null;
}
