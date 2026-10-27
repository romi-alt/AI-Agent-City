-- Up Migration
-- M03 identity (owner: auth module). People are identified by their OIDC subject (`kc:<sub>`); credentials live
-- only in the identity provider. Nothing here is imported from the legacy app (no hashes, TOTP, sessions, devices).
-- These tables are per person, not per tenant, so they are classified "identity" (no tenant RLS); the app role
-- reaches them only through the API's auth module.
ALTER TABLE platform.table_classification DROP CONSTRAINT table_classification_class_check;
ALTER TABLE platform.table_classification ADD CONSTRAINT table_classification_class_check
  CHECK (class IN ('catalog', 'tenant', 'agency', 'platform', 'private', 'migration', 'identity'));

CREATE SCHEMA identity;
GRANT USAGE ON SCHEMA identity TO agentcity_app;

CREATE TABLE identity.person (
  subject text PRIMARY KEY CHECK (subject ~ '^[A-Za-z0-9._@:+-]{1,200}$'),
  issuer text NOT NULL,
  idp_subject text NOT NULL,
  email text CHECK (email IS NULL OR email = lower(email)),
  email_verified boolean NOT NULL DEFAULT false,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at timestamptz,
  disabled_at timestamptz,
  UNIQUE (issuer, idp_subject)
);

-- A browser's device key (see DESIGN.md "Device binding"): the private key never leaves the browser.
CREATE TABLE identity.device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL REFERENCES identity.person,
  jkt text NOT NULL CHECK (jkt ~ '^[A-Za-z0-9_-]{43}$'), -- RFC 7638 SHA-256 thumbprint, base64url
  public_jwk jsonb NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_reason text,
  UNIQUE (subject, jkt)
);

CREATE TABLE identity.session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The cookie holds a random token; only its hash is stored.
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  subject text NOT NULL REFERENCES identity.person,
  device_id uuid NOT NULL REFERENCES identity.device,
  amr text[] NOT NULL,
  acr text,
  auth_time timestamptz NOT NULL,
  idp_session_id text,
  refresh_token_enc bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  step_up_at timestamptz,
  tenant_id uuid REFERENCES app.tenant,
  workspace_id uuid,
  revoked_at timestamptz,
  revoked_reason text,
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES app.workspace (tenant_id, id)
);
CREATE INDEX session_subject ON identity.session (subject) WHERE revoked_at IS NULL;
CREATE INDEX session_device ON identity.session (device_id) WHERE revoked_at IS NULL;

-- One sign-in (or step-up) in progress: PKCE verifier, nonce and the device it must finish on.
CREATE TABLE identity.login_attempt (
  state_sha256 text PRIMARY KEY CHECK (state_sha256 ~ '^[0-9a-f]{64}$'),
  nonce text NOT NULL,
  code_verifier text NOT NULL,
  device_jkt text NOT NULL,
  device_jwk jsonb NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('login', 'step-up')),
  step_up_reason text,
  session_id uuid REFERENCES identity.session,
  return_to text NOT NULL CHECK (return_to ~ '^/[^/\\]'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- Sign-ins, step-ups, revocations, role changes: append-only.
CREATE TABLE identity.security_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject text,
  session_id uuid,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON identity.security_event FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON identity.security_event FOR EACH STATEMENT EXECUTE FUNCTION app_private.forbid_change();

GRANT SELECT, INSERT, UPDATE ON identity.person, identity.device, identity.session, identity.login_attempt TO agentcity_app;
GRANT SELECT, INSERT ON identity.security_event TO agentcity_app;
GRANT USAGE ON SEQUENCE identity.security_event_id_seq TO agentcity_app;

INSERT INTO platform.table_classification (table_schema, table_name, class, immutable, note) VALUES
  ('identity', 'person', 'identity', false, 'OIDC subjects; no credentials.'),
  ('identity', 'device', 'identity', false, 'Device public keys (private keys stay in the browser).'),
  ('identity', 'session', 'identity', false, 'Server sessions; cookie token stored as a hash; refresh token encrypted.'),
  ('identity', 'login_attempt', 'identity', false, 'In-flight sign-ins (PKCE, nonce, device).'),
  ('identity', 'security_event', 'identity', true, 'Append-only security log.');

-- Down Migration
DELETE FROM platform.table_classification WHERE table_schema = 'identity';
DROP SCHEMA identity CASCADE;
ALTER TABLE platform.table_classification DROP CONSTRAINT table_classification_class_check;
ALTER TABLE platform.table_classification ADD CONSTRAINT table_classification_class_check
  CHECK (class IN ('catalog', 'tenant', 'agency', 'platform', 'private', 'migration'));
