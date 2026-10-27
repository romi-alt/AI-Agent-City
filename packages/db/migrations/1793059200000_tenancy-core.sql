-- Up Migration
-- M02: tenancy core. Physical catalog (who is where on the map) is separate from security ownership (whose data
-- it is). Every tenant-owned table carries tenant_id, is protected by forced row-level security, and is referenced
-- only through composite (tenant_id, …) foreign keys, so a row can never point into another tenant.
-- Classification of every table is recorded in platform.table_classification and checked by tests.

-- Unused extensions pre-created by the ParadeDB image (ADR-006 follow-up). Nothing depends on them; removing
-- them shrinks what the app role can call. pg_stat_statements stays for observability.
DROP EXTENSION IF EXISTS postgis_tiger_geocoder;
DROP EXTENSION IF EXISTS postgis_topology;
DROP EXTENSION IF EXISTS postgis;
DROP EXTENSION IF EXISTS fuzzystrmatch;
DROP EXTENSION IF EXISTS pg_ivm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The scope role owns the functions that check membership and set scope. It cannot log in; it bypasses RLS only
-- so that those functions can read membership rows before any scope exists. Roles are cluster-wide, so this is
-- idempotent and the down migration leaves the role in place for other databases.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agentcity_scope') THEN
    CREATE ROLE agentcity_scope NOLOGIN BYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA catalog;
CREATE SCHEMA app;
CREATE SCHEMA app_private;
CREATE SCHEMA migration;
GRANT USAGE ON SCHEMA catalog, app TO agentcity_app;
GRANT USAGE ON SCHEMA app, app_private TO agentcity_scope;
REVOKE ALL ON SCHEMA app_private, migration FROM PUBLIC;

-- ───────────────────────── Classification ─────────────────────────
CREATE TABLE platform.table_classification (
  table_schema text NOT NULL,
  table_name text NOT NULL,
  class text NOT NULL CHECK (class IN ('catalog', 'tenant', 'agency', 'platform', 'private', 'migration')),
  immutable boolean NOT NULL DEFAULT false,
  note text NOT NULL,
  PRIMARY KEY (table_schema, table_name)
);
GRANT SELECT ON platform.table_classification TO agentcity_app;

-- ───────────────────────── Physical catalog (shared, read-only to the app) ─────────────────────────
-- The city map: the same for every tenant and public on the skyline. Holds no customer data.
CREATE TABLE catalog.district (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE catalog.building (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE,
  district_id uuid NOT NULL REFERENCES catalog.district,
  name text NOT NULL,
  short_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('training', 'dealership', 'associates', 'rental')),
  brand text,
  color text NOT NULL,
  accent text NOT NULL,
  x real NOT NULL, z real NOT NULL, w real NOT NULL, d real NOT NULL
);

-- Stable public identifiers. Legacy ids (fast-sales, rental-1, …) resolve here forever, even if a building is
-- later renamed or re-keyed.
CREATE TABLE catalog.building_alias (
  alias text PRIMARY KEY,
  building_id uuid NOT NULL REFERENCES catalog.building,
  source text NOT NULL
);

CREATE TABLE catalog.floor (
  id uuid PRIMARY KEY,
  building_id uuid NOT NULL REFERENCES catalog.building,
  level int NOT NULL CHECK (level BETWEEN 1 AND 99),
  name text NOT NULL,
  info text,
  rentable boolean NOT NULL,
  -- Asking price only. Invoices and payments are money facts, never this column (audit C14).
  asking_rent_cents int CHECK (asking_rent_cents IS NULL OR rentable),
  UNIQUE (building_id, level)
);

CREATE TABLE catalog.agent_template (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE,
  task_set text NOT NULL,
  role text NOT NULL
);

CREATE TABLE catalog.agent_template_version (
  id uuid PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES catalog.agent_template,
  version int NOT NULL CHECK (version > 0),
  categories text[] NOT NULL,
  UNIQUE (template_id, version)
);

-- Seeded desks. Human desks are named people and can never run an agent (no template, no installation).
CREATE TABLE catalog.desk (
  id uuid PRIMARY KEY,
  legacy_id text NOT NULL UNIQUE,
  floor_id uuid NOT NULL REFERENCES catalog.floor,
  slot int NOT NULL CHECK (slot >= 0),
  kind text NOT NULL CHECK (kind IN ('ai', 'human')),
  persona_name text NOT NULL,
  role text NOT NULL,
  template_version_id uuid REFERENCES catalog.agent_template_version,
  CHECK ((kind = 'ai') = (template_version_id IS NOT NULL)),
  UNIQUE (floor_id, slot),
  UNIQUE (id, kind)
);

GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO agentcity_app;

-- ───────────────────────── Private: scope key and support grants ─────────────────────────
CREATE TABLE app_private.scope_key (
  id int PRIMARY KEY CHECK (id = 1),
  key bytea NOT NULL DEFAULT gen_random_bytes(32)
);
INSERT INTO app_private.scope_key (id) VALUES (1);

-- ───────────────────────── Tenancy ─────────────────────────
CREATE TABLE app.agency (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.tenant (
  id uuid PRIMARY KEY,
  agency_id uuid NOT NULL REFERENCES app.agency,
  name text NOT NULL,
  -- client: a paying client organisation. agency: the agency's own business. demo: fixture data only; it has no
  -- provider authority (see app_private.forbid_demo below).
  kind text NOT NULL CHECK (kind IN ('client', 'agency', 'demo')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, id)
);

CREATE TABLE app.workspace (
  tenant_id uuid NOT NULL REFERENCES app.tenant,
  id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('team', 'rental-floor', 'building', 'demo')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (id)
);

-- Where a workspace sits on the map. Placement is physical: it never grants access. A floor holds at most one
-- active occupant (index below), so two clients can share a building but never a floor.
CREATE TABLE app.workspace_placement (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  floor_id uuid NOT NULL REFERENCES catalog.floor,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz CHECK (ended_at IS NULL OR ended_at >= started_at),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES app.workspace (tenant_id, id)
);
CREATE UNIQUE INDEX workspace_placement_one_occupant ON app.workspace_placement (floor_id) WHERE ended_at IS NULL;

CREATE TABLE app.agency_member (
  agency_id uuid NOT NULL REFERENCES app.agency,
  subject text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (agency_id, subject)
);

-- Agency staff see only the tenants they are assigned to.
CREATE TABLE app.agency_assignment (
  agency_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id, subject),
  FOREIGN KEY (agency_id, tenant_id) REFERENCES app.tenant (agency_id, id),
  FOREIGN KEY (agency_id, subject) REFERENCES app.agency_member (agency_id, subject)
);

-- Client people. A workspace_id limits the member to that one workspace (e.g. one rented floor).
CREATE TABLE app.tenant_member (
  tenant_id uuid NOT NULL REFERENCES app.tenant,
  subject text NOT NULL,
  workspace_id uuid,
  role text NOT NULL CHECK (role IN ('client-admin', 'client-viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id, subject),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES app.workspace (tenant_id, id)
);

-- Platform support access is explicit, time-limited and audited; there is no implicit platform bypass.
CREATE TABLE app_private.support_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenant,
  subject text NOT NULL,
  reason text NOT NULL CHECK (length(reason) >= 10),
  granted_by text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at <= created_at + interval '24 hours')
);

-- A support person must open a session before entering a tenant's scope. Opening it is audited and must be
-- committed first: a session opened inside the same transaction does not count, so access can never happen in a
-- transaction whose rollback would also erase its audit trail.
CREATE TABLE app_private.support_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES app_private.support_grant,
  tenant_id uuid NOT NULL,
  subject text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- People to invite once identity moves to OIDC (M03). Legacy credentials are never imported.
CREATE TABLE app.invitation (
  tenant_id uuid NOT NULL REFERENCES app.tenant,
  id uuid NOT NULL,
  email text NOT NULL CHECK (email = lower(email) AND email LIKE '%_@_%'),
  role text NOT NULL CHECK (role IN ('agency-owner', 'agency-staff', 'client-admin', 'client-viewer')),
  workspace_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  provenance jsonb,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, email),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES app.workspace (tenant_id, id)
);

-- ───────────────────────── Agents ─────────────────────────
CREATE TABLE app.agent_installation (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  template_version_id uuid NOT NULL REFERENCES catalog.agent_template_version,
  floor_id uuid NOT NULL REFERENCES catalog.floor,
  slot int NOT NULL CHECK (slot >= 0),
  -- A seeded desk, if any. desk_kind is fixed to 'ai' so a human desk can never be installed as an agent.
  desk_id uuid,
  desk_kind text NOT NULL DEFAULT 'ai' CHECK (desk_kind = 'ai'),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  installed_at timestamptz NOT NULL DEFAULT now(),
  provenance jsonb,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, workspace_id, id),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES app.workspace (tenant_id, id),
  FOREIGN KEY (desk_id, desk_kind) REFERENCES catalog.desk (id, kind)
);
CREATE UNIQUE INDEX agent_installation_one_per_seat ON app.agent_installation (floor_id, slot) WHERE status = 'active';

-- ───────────────────────── CRM ─────────────────────────
CREATE TABLE app.contact (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  display_name text NOT NULL,
  email text,
  phone text,
  kind text NOT NULL CHECK (kind IN ('customer', 'affiliate')),
  source text,
  interest text,
  created_at timestamptz NOT NULL DEFAULT now(),
  provenance jsonb,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, workspace_id, id),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES app.workspace (tenant_id, id)
);

-- External ids are unique per tenant, not globally: two clients may hold the same CRM id.
CREATE TABLE app.contact_external_id (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  provider text NOT NULL,
  external_id text NOT NULL,
  PRIMARY KEY (tenant_id, provider, external_id),
  FOREIGN KEY (tenant_id, workspace_id, contact_id) REFERENCES app.contact (tenant_id, workspace_id, id)
);

-- Consent is a history of recorded facts with evidence. It is never derived from legacy "real" flags.
CREATE TABLE app.consent_event (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  contact_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'phone', 'text')),
  state text NOT NULL CHECK (state IN ('granted', 'revoked')),
  source text NOT NULL,
  evidence text NOT NULL,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, workspace_id, contact_id) REFERENCES app.contact (tenant_id, workspace_id, id)
);

CREATE TABLE app.suppression (
  tenant_id uuid NOT NULL REFERENCES app.tenant,
  id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'phone', 'text')),
  address text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, channel, address)
);

CREATE TABLE app.opportunity (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  contact_id uuid NOT NULL,
  stage text NOT NULL,
  -- A value only with its verified source (audit C02/C03): never synthesised.
  value_cents bigint CHECK (value_cents IS NULL OR value_cents >= 0),
  value_source text CHECK ((value_cents IS NULL) = (value_source IS NULL)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  provenance jsonb,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, workspace_id, id),
  FOREIGN KEY (tenant_id, workspace_id, contact_id) REFERENCES app.contact (tenant_id, workspace_id, id)
);

CREATE TABLE app.opportunity_stage_event (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  stage text NOT NULL,
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  provenance jsonb,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, workspace_id, opportunity_id) REFERENCES app.opportunity (tenant_id, workspace_id, id)
);

-- Free-text notes, searchable with BM25. The search index is global; row-level security still applies to every
-- query that reads through it (tested in tenancy.test.ts).
CREATE TABLE app.note (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL UNIQUE,
  contact_id uuid,
  body text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  provenance jsonb,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES app.workspace (tenant_id, id),
  FOREIGN KEY (tenant_id, workspace_id, contact_id) REFERENCES app.contact (tenant_id, workspace_id, id)
);
CREATE INDEX note_bm25 ON app.note USING bm25 (id, body);

-- ───────────────────────── Drafts, approvals, dispatch ─────────────────────────
-- A draft revision never changes. Editing creates a new revision, which needs its own approval (audit C04/C05).
CREATE TABLE app.draft_revision (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  contact_id uuid,
  channel text NOT NULL CHECK (channel IN ('email', 'phone', 'text', 'social')),
  recipient text,
  subject text,
  body text NOT NULL,
  -- Set by trigger from recipient, subject and body; any value supplied by the caller is replaced.
  body_sha256 text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  provenance jsonb,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, workspace_id, id),
  FOREIGN KEY (tenant_id, workspace_id, contact_id) REFERENCES app.contact (tenant_id, workspace_id, id)
);

CREATE TABLE app.approval (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  draft_revision_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_by text,
  decided_at timestamptz,
  reason text,
  provenance jsonb,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, workspace_id, id),
  FOREIGN KEY (tenant_id, workspace_id, draft_revision_id) REFERENCES app.draft_revision (tenant_id, workspace_id, id),
  CHECK ((status = 'pending') = (decided_at IS NULL))
);

CREATE TABLE app.dispatch_attempt (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  approval_id uuid NOT NULL,
  draft_revision_id uuid NOT NULL,
  connector text NOT NULL,
  recipient text NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, workspace_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, workspace_id, approval_id) REFERENCES app.approval (tenant_id, workspace_id, id),
  FOREIGN KEY (tenant_id, workspace_id, draft_revision_id) REFERENCES app.draft_revision (tenant_id, workspace_id, id)
);

CREATE TABLE app.dispatch_receipt (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  dispatch_attempt_id uuid NOT NULL,
  provider text NOT NULL,
  provider_message_id text NOT NULL,
  -- Accepted, delivered, failed and unknown are different facts (ACCEPTANCE: production workflow scenarios).
  outcome text NOT NULL CHECK (outcome IN ('accepted', 'delivered', 'failed', 'unknown')),
  signature_verified boolean NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, provider, provider_message_id, outcome),
  FOREIGN KEY (tenant_id, workspace_id, dispatch_attempt_id) REFERENCES app.dispatch_attempt (tenant_id, workspace_id, id)
);

-- Historical messages from the legacy app: evidence of what it recorded, never proof of delivery.
CREATE TABLE app.message_evidence (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  contact_id uuid,
  channel text NOT NULL,
  recipient text,
  subject text,
  body text NOT NULL,
  legacy_status text NOT NULL,
  verification text NOT NULL CHECK (verification IN ('legacy-unverified', 'simulated')),
  occurred_at timestamptz NOT NULL,
  provenance jsonb NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, workspace_id, contact_id) REFERENCES app.contact (tenant_id, workspace_id, id)
);

-- ───────────────────────── Content and schedules ─────────────────────────
CREATE TABLE app.content_item (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  platform text NOT NULL,
  format text NOT NULL,
  topic text NOT NULL,
  caption text,
  -- "published" needs a provider identity (audit C12); legacy simulated posts are kept as legacy-simulated.
  status text NOT NULL CHECK (status IN ('idea', 'draft', 'needs-approval', 'approved', 'rejected', 'legacy-simulated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  provenance jsonb,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, workspace_id, id),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES app.workspace (tenant_id, id)
);

CREATE TABLE app.schedule (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('content', 'report', 'agent')),
  target_id uuid NOT NULL,
  run_at timestamptz,
  recurrence text,
  enabled boolean NOT NULL DEFAULT false,
  disabled_reason text CHECK (enabled OR disabled_reason IS NOT NULL),
  created_at timestamptz NOT NULL DEFAULT now(),
  provenance jsonb,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES app.workspace (tenant_id, id)
);

-- ───────────────────────── Immutable facts: usage, money, audit, outbox ─────────────────────────
CREATE TABLE app.usage_fact (
  tenant_id uuid NOT NULL REFERENCES app.tenant,
  id uuid NOT NULL,
  kind text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity >= 0),
  unit text NOT NULL,
  source text NOT NULL,
  idempotency_key text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE app.money_fact (
  tenant_id uuid NOT NULL REFERENCES app.tenant,
  id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('invoice', 'payment', 'refund', 'credit-note')),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL,
  provider text NOT NULL,
  provider_ref text NOT NULL,
  verified boolean NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, provider, kind, provider_ref),
  -- A payment is only a payment when the provider confirmed it (audit C14).
  CHECK (kind <> 'payment' OR verified)
);

CREATE TABLE app.audit_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenant,
  actor text NOT NULL,
  action text NOT NULL,
  target_kind text,
  target_id text,
  detail jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_event_tenant ON app.audit_event (tenant_id, id);

-- Committed changes for workflows and realtime. Consumers keep their own cursor (the id); events never change.
CREATE TABLE app.outbox_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenant,
  workspace_id uuid,
  topic text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES app.workspace (tenant_id, id)
);
CREATE INDEX outbox_event_tenant ON app.outbox_event (tenant_id, id);

-- ───────────────────────── Legacy import bookkeeping (admin only) ─────────────────────────
CREATE TABLE migration.import_run (
  id uuid PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('apply')),
  source_sha256 jsonb NOT NULL,
  mapping_sha256 text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  report jsonb
);

-- Old id → new id, per kind. Deterministic new ids make re-runs idempotent; this table makes them reversible.
CREATE TABLE migration.record_map (
  legacy_kind text NOT NULL,
  legacy_id text NOT NULL,
  target_table text NOT NULL,
  tenant_id uuid NOT NULL,
  target_id uuid NOT NULL,
  record_sha256 text NOT NULL,
  first_run_id uuid NOT NULL REFERENCES migration.import_run,
  PRIMARY KEY (legacy_kind, legacy_id, target_table)
);

-- Records that could not be imported safely, with the reason and the original record for review.
CREATE TABLE migration.quarantine (
  legacy_kind text NOT NULL,
  legacy_id text NOT NULL,
  reason text NOT NULL,
  record jsonb NOT NULL,
  record_sha256 text NOT NULL,
  first_run_id uuid NOT NULL REFERENCES migration.import_run,
  PRIMARY KEY (legacy_kind, legacy_id)
);

-- ───────────────────────── Scope ─────────────────────────
-- Scope is a signed, transaction-local setting. Only app.enter_scope can produce a valid one, after checking
-- membership; it is bound to the current transaction and backend, so it ends at COMMIT/ROLLBACK and cannot be
-- copied into a later transaction or another pooled connection. A value set by hand fails verification.
CREATE FUNCTION app_private.scope_fields() RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  raw text := current_setting('app.scope', true);
  payload text;
  sig text;
  f text[];
BEGIN
  IF raw IS NULL OR raw = '' OR position('.' IN raw) = 0 THEN RETURN NULL; END IF;
  payload := split_part(raw, '.', 1);
  sig := split_part(raw, '.', 2);
  IF sig <> encode(public.hmac(convert_to(payload, 'UTF8'), (SELECT key FROM app_private.scope_key WHERE id = 1), 'sha256'), 'hex') THEN
    RETURN NULL;
  END IF;
  f := string_to_array(payload, '|');
  IF f[1] <> 'v1' OR f[8] <> pg_current_xact_id()::text OR f[9] <> pg_backend_pid()::text THEN RETURN NULL; END IF;
  RETURN f;
END $$;

CREATE FUNCTION app.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ SELECT (app_private.scope_fields())[2]::uuid $$;
CREATE FUNCTION app.current_workspace_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ SELECT nullif((app_private.scope_fields())[3], '-')::uuid $$;
CREATE FUNCTION app.current_agency_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ SELECT (app_private.scope_fields())[4]::uuid $$;
CREATE FUNCTION app.current_scope_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ SELECT (app_private.scope_fields())[5] $$;
CREATE FUNCTION app.current_can_write() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ SELECT coalesce((app_private.scope_fields())[6] = '1', false) $$;
CREATE FUNCTION app.current_subject() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ SELECT (app_private.scope_fields())[7] $$;

CREATE FUNCTION app.enter_scope(p_subject text, p_tenant uuid, p_workspace uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_agency uuid;
  v_member app.tenant_member;
  v_role text;
  v_write boolean;
  v_ws uuid := p_workspace;
  v_payload text;
  v_existing text := current_setting('app.scope', true);
BEGIN
  IF p_subject IS NULL OR p_subject !~ '^[A-Za-z0-9._@:+-]{1,200}$' THEN
    RAISE EXCEPTION 'invalid subject' USING ERRCODE = '22023';
  END IF;
  IF v_existing IS NOT NULL AND v_existing <> '' THEN
    RAISE EXCEPTION 'a scope is already set in this transaction' USING ERRCODE = '25000';
  END IF;
  SELECT agency_id INTO v_agency FROM app.tenant WHERE id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'not authorized for this tenant' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_member FROM app.tenant_member WHERE tenant_id = p_tenant AND subject = p_subject AND revoked_at IS NULL;
  IF FOUND THEN
    IF v_member.workspace_id IS NOT NULL AND v_ws IS DISTINCT FROM v_member.workspace_id THEN
      RAISE EXCEPTION 'not authorized for this workspace' USING ERRCODE = '42501';
    END IF;
    v_role := v_member.role;
    v_write := v_member.role = 'client-admin';
  ELSIF EXISTS (SELECT 1 FROM app.agency_member WHERE agency_id = v_agency AND subject = p_subject AND role = 'owner' AND revoked_at IS NULL) THEN
    v_role := 'agency-owner';
    v_write := true;
  ELSIF EXISTS (
    SELECT 1 FROM app.agency_assignment a JOIN app.agency_member m USING (agency_id, subject)
    WHERE a.tenant_id = p_tenant AND a.subject = p_subject AND a.revoked_at IS NULL AND m.revoked_at IS NULL
  ) THEN
    v_role := 'agency-staff';
    v_write := true;
  ELSIF EXISTS (
    SELECT 1 FROM app_private.support_session s JOIN app_private.support_grant g ON g.id = s.grant_id
    WHERE s.tenant_id = p_tenant AND s.subject = p_subject AND s.expires_at > now()
      AND s.opened_at < transaction_timestamp() -- committed by an earlier transaction
      AND g.revoked_at IS NULL AND g.expires_at > now()
  ) THEN
    v_role := 'support';
    v_write := false;
  ELSE
    RAISE EXCEPTION 'not authorized for this tenant' USING ERRCODE = '42501';
  END IF;

  IF v_ws IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app.workspace WHERE tenant_id = p_tenant AND id = v_ws) THEN
    RAISE EXCEPTION 'not authorized for this workspace' USING ERRCODE = '42501';
  END IF;

  v_payload := concat_ws('|', 'v1', p_tenant, coalesce(v_ws::text, '-'), v_agency, v_role, v_write::int, p_subject,
                         pg_current_xact_id(), pg_backend_pid());
  PERFORM set_config('app.scope', v_payload || '.' ||
    encode(public.hmac(convert_to(v_payload, 'UTF8'), (SELECT key FROM app_private.scope_key WHERE id = 1), 'sha256'), 'hex'), true);
END $$;

-- Opens an audited support session. Call it in its own transaction and commit before entering the scope.
CREATE FUNCTION app.open_support_session(p_subject text, p_tenant uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_grant app_private.support_grant;
  v_session uuid;
BEGIN
  SELECT * INTO v_grant FROM app_private.support_grant
  WHERE tenant_id = p_tenant AND subject = p_subject AND revoked_at IS NULL AND expires_at > now()
  ORDER BY expires_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'no active support grant' USING ERRCODE = '42501'; END IF;
  INSERT INTO app_private.support_session (grant_id, tenant_id, subject, expires_at)
  VALUES (v_grant.id, p_tenant, p_subject, least(v_grant.expires_at, now() + interval '2 hours'))
  RETURNING id INTO v_session;
  INSERT INTO app.audit_event (tenant_id, actor, action, target_kind, target_id, detail)
  VALUES (p_tenant, p_subject, 'support-session-opened', 'support_grant', v_grant.id::text,
          jsonb_build_object('session', v_session, 'reason', v_grant.reason, 'granted_by', v_grant.granted_by));
  RETURN v_session;
END $$;

-- BM25 search over notes in the current scope. Row-level security keeps the non-leakproof @@@ operator above the
-- security filter, so through RLS a search still finds the right rows but cannot use the ranked ParadeDB scan
-- (paradedb.score fails). This function runs as the scope role and applies the same tenant/workspace scope
-- explicitly, which lets the scan rank results. Without a scope it returns nothing.
-- The query text is inlined as a quoted literal (format %L): pg_search 0.26 does not produce scores for a
-- parameterised query.
CREATE FUNCTION app.search_notes(p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (id uuid, score real)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_tenant uuid := app.current_tenant_id();
BEGIN
  IF v_tenant IS NULL OR coalesce(p_query, '') = '' THEN RETURN; END IF;
  RETURN QUERY EXECUTE format(
    $q$SELECT n.id, paradedb.score(n.id) FROM app.note n
       WHERE n.body @@@ %L AND n.tenant_id = %L::uuid AND (%L::uuid IS NULL OR n.workspace_id = %L::uuid)
       ORDER BY 2 DESC, 1 LIMIT %s$q$,
    p_query, v_tenant, app.current_workspace_id(), app.current_workspace_id(), least(greatest(p_limit, 1), 100));
END $$;

-- ───────────────────────── Fact protection ─────────────────────────
CREATE FUNCTION app_private.forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is an immutable record: % is not allowed', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_OP
    USING ERRCODE = '42501';
END $$;

-- Demo tenants are fixtures: they can never hold a provider dispatch, receipt or money fact.
CREATE FUNCTION app_private.forbid_demo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF (SELECT kind FROM app.tenant WHERE id = NEW.tenant_id) = 'demo' THEN
    RAISE EXCEPTION 'the demo tenant has no provider authority (% refused)', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- Approvals: the revision they approve never changes, and only a pending approval can be decided.
CREATE FUNCTION app_private.guard_approval() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'approvals are kept for audit; expire or reject instead' USING ERRCODE = '42501';
  END IF;
  IF NEW.draft_revision_id <> OLD.draft_revision_id OR NEW.tenant_id <> OLD.tenant_id OR NEW.workspace_id <> OLD.workspace_id
     OR NEW.requested_at <> OLD.requested_at THEN
    RAISE EXCEPTION 'an approval cannot be moved to another revision' USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'approval already %', OLD.status USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION app_private.hash_draft() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.body_sha256 := encode(sha256(convert_to(coalesce(NEW.recipient, '') || E'\n' || coalesce(NEW.subject, '') || E'\n' || NEW.body, 'UTF8')), 'hex');
  RETURN NEW;
END $$;

-- An agent can only be installed on a floor its workspace occupies.
CREATE FUNCTION app_private.guard_installation_floor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM app.workspace_placement p
    WHERE p.tenant_id = NEW.tenant_id AND p.workspace_id = NEW.workspace_id AND p.floor_id = NEW.floor_id AND p.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'workspace does not occupy this floor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- Applies the standard tenant protection to one table: forced RLS, read policy on scope, write policies that
-- also need a writable scope, and grants. Workspace-owned tables are narrowed to the scope's workspace, if any.
CREATE FUNCTION app_private.protect(p_table regclass, p_workspace boolean, p_immutable boolean, p_ops text, p_scope text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  scope text := coalesce(p_scope, '(tenant_id = (SELECT app.current_tenant_id()))');
BEGIN
  IF p_workspace AND p_scope IS NULL THEN
    scope := scope || ' AND ((SELECT app.current_workspace_id()) IS NULL OR workspace_id = (SELECT app.current_workspace_id()))';
  END IF;
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', p_table);
  EXECUTE format('CREATE POLICY tenant_scope ON %s USING (%s) WITH CHECK (%s)', p_table, scope, scope);
  EXECUTE format('CREATE POLICY writable_insert ON %s AS RESTRICTIVE FOR INSERT WITH CHECK ((SELECT app.current_can_write()))', p_table);
  EXECUTE format('CREATE POLICY writable_update ON %s AS RESTRICTIVE FOR UPDATE USING ((SELECT app.current_can_write()))', p_table);
  EXECUTE format('CREATE POLICY writable_delete ON %s AS RESTRICTIVE FOR DELETE USING ((SELECT app.current_can_write()))', p_table);
  EXECUTE format('GRANT %s ON %s TO agentcity_app', p_ops, p_table);
  IF p_immutable THEN
    EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change()', p_table);
    EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION app_private.forbid_change()', p_table);
  END IF;
END $$;

-- Tenancy rows: readable in scope; created and changed by administrators, not the app role.
SELECT app_private.protect('app.tenant', false, false, 'SELECT', 'id = (SELECT app.current_tenant_id())');
SELECT app_private.protect('app.workspace', false, false, 'SELECT',
  'tenant_id = (SELECT app.current_tenant_id()) AND ((SELECT app.current_workspace_id()) IS NULL OR id = (SELECT app.current_workspace_id()))');
SELECT app_private.protect('app.workspace_placement', true, false, 'SELECT');
SELECT app_private.protect('app.agency_assignment', false, false, 'SELECT');
SELECT app_private.protect('app.tenant_member', false, false, 'SELECT');
-- invitation.workspace_id is optional: a tenant-wide invitation is visible only to tenant-wide scopes.
SELECT app_private.protect('app.invitation', false, false, 'SELECT',
  'tenant_id = (SELECT app.current_tenant_id()) AND ((SELECT app.current_workspace_id()) IS NULL OR workspace_id = (SELECT app.current_workspace_id()))');

-- Agency rows: visible to anyone in a scope under that agency (names only; membership is per agency).
ALTER TABLE app.agency ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agency FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_scope ON app.agency USING (id = (SELECT app.current_agency_id()));
GRANT SELECT ON app.agency TO agentcity_app;
ALTER TABLE app.agency_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agency_member FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_scope ON app.agency_member USING (
  agency_id = (SELECT app.current_agency_id()) AND (SELECT app.current_scope_role()) IN ('agency-owner', 'agency-staff'));
GRANT SELECT ON app.agency_member TO agentcity_app;

-- Working data.
SELECT app_private.protect('app.agent_installation', true, false, 'SELECT, INSERT, UPDATE');
SELECT app_private.protect('app.contact', true, false, 'SELECT, INSERT, UPDATE, DELETE');
SELECT app_private.protect('app.contact_external_id', true, false, 'SELECT, INSERT, DELETE');
SELECT app_private.protect('app.consent_event', true, true, 'SELECT, INSERT');
SELECT app_private.protect('app.suppression', false, false, 'SELECT, INSERT, DELETE');
SELECT app_private.protect('app.opportunity', true, false, 'SELECT, INSERT, UPDATE');
SELECT app_private.protect('app.opportunity_stage_event', true, true, 'SELECT, INSERT');
SELECT app_private.protect('app.note', true, false, 'SELECT, INSERT, UPDATE, DELETE');
SELECT app_private.protect('app.draft_revision', true, true, 'SELECT, INSERT');
SELECT app_private.protect('app.approval', true, false, 'SELECT, INSERT, UPDATE');
SELECT app_private.protect('app.dispatch_attempt', true, true, 'SELECT, INSERT');
SELECT app_private.protect('app.dispatch_receipt', true, true, 'SELECT, INSERT');
SELECT app_private.protect('app.message_evidence', true, true, 'SELECT');
SELECT app_private.protect('app.content_item', true, false, 'SELECT, INSERT, UPDATE');
SELECT app_private.protect('app.schedule', true, false, 'SELECT, INSERT, UPDATE');
SELECT app_private.protect('app.usage_fact', false, true, 'SELECT, INSERT');
SELECT app_private.protect('app.money_fact', false, true, 'SELECT, INSERT');
SELECT app_private.protect('app.audit_event', false, true, 'SELECT, INSERT');
-- outbox_event.workspace_id is optional: tenant-wide events are visible only to tenant-wide scopes.
SELECT app_private.protect('app.outbox_event', false, true, 'SELECT, INSERT',
  'tenant_id = (SELECT app.current_tenant_id()) AND ((SELECT app.current_workspace_id()) IS NULL OR workspace_id = (SELECT app.current_workspace_id()))');
GRANT USAGE ON SEQUENCE app.audit_event_id_seq, app.outbox_event_id_seq TO agentcity_app;

CREATE TRIGGER no_demo BEFORE INSERT ON app.dispatch_attempt FOR EACH ROW EXECUTE FUNCTION app_private.forbid_demo();
CREATE TRIGGER no_demo BEFORE INSERT ON app.dispatch_receipt FOR EACH ROW EXECUTE FUNCTION app_private.forbid_demo();
CREATE TRIGGER no_demo BEFORE INSERT ON app.money_fact FOR EACH ROW EXECUTE FUNCTION app_private.forbid_demo();
CREATE TRIGGER hash BEFORE INSERT ON app.draft_revision FOR EACH ROW EXECUTE FUNCTION app_private.hash_draft();
CREATE TRIGGER guard BEFORE UPDATE OR DELETE ON app.approval FOR EACH ROW EXECUTE FUNCTION app_private.guard_approval();
CREATE TRIGGER guard_floor BEFORE INSERT OR UPDATE ON app.agent_installation FOR EACH ROW EXECUTE FUNCTION app_private.guard_installation_floor();

-- ───────────────────────── Ownership and execute rights ─────────────────────────
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app, app_private FROM PUBLIC;
DROP FUNCTION app_private.protect(regclass, boolean, boolean, text, text);
ALTER FUNCTION app_private.scope_fields() OWNER TO agentcity_scope;
ALTER FUNCTION app.current_tenant_id() OWNER TO agentcity_scope;
ALTER FUNCTION app.current_workspace_id() OWNER TO agentcity_scope;
ALTER FUNCTION app.current_agency_id() OWNER TO agentcity_scope;
ALTER FUNCTION app.current_scope_role() OWNER TO agentcity_scope;
ALTER FUNCTION app.current_can_write() OWNER TO agentcity_scope;
ALTER FUNCTION app.current_subject() OWNER TO agentcity_scope;
ALTER FUNCTION app.enter_scope(text, uuid, uuid) OWNER TO agentcity_scope;
ALTER FUNCTION app.open_support_session(text, uuid) OWNER TO agentcity_scope;
ALTER FUNCTION app.search_notes(text, int) OWNER TO agentcity_scope;
ALTER FUNCTION app_private.forbid_demo() OWNER TO agentcity_scope;
ALTER FUNCTION app_private.guard_installation_floor() OWNER TO agentcity_scope;
GRANT SELECT ON app_private.scope_key, app_private.support_grant TO agentcity_scope;
GRANT SELECT, INSERT ON app_private.support_session TO agentcity_scope;
GRANT SELECT ON app.note TO agentcity_scope;
GRANT USAGE ON SCHEMA paradedb, pdb TO agentcity_scope;
GRANT SELECT ON app.tenant, app.workspace, app.tenant_member, app.agency_member, app.agency_assignment, app.workspace_placement TO agentcity_scope;
GRANT INSERT ON app.audit_event TO agentcity_scope;
GRANT USAGE ON SEQUENCE app.audit_event_id_seq TO agentcity_scope;
GRANT EXECUTE ON FUNCTION public.hmac(bytea, bytea, text) TO agentcity_scope;
GRANT EXECUTE ON FUNCTION app.enter_scope(text, uuid, uuid), app.open_support_session(text, uuid), app.search_notes(text, int), app.current_tenant_id(), app.current_workspace_id(),
  app.current_agency_id(), app.current_scope_role(), app.current_can_write(), app.current_subject() TO agentcity_app;

INSERT INTO platform.table_classification (table_schema, table_name, class, immutable, note) VALUES
  ('platform', 'heartbeat', 'platform', false, 'Workflow wiring check (M01). No customer data.'),
  ('platform', 'table_classification', 'platform', false, 'This list.'),
  ('catalog', 'district', 'catalog', false, 'Public city map.'),
  ('catalog', 'building', 'catalog', false, 'Public city map; legacy ids kept as aliases.'),
  ('catalog', 'building_alias', 'catalog', false, 'Stable public building identifiers.'),
  ('catalog', 'floor', 'catalog', false, 'Public city map; asking rent only, never revenue.'),
  ('catalog', 'desk', 'catalog', false, 'Seeded desks and personas, including named humans.'),
  ('catalog', 'agent_template', 'catalog', false, 'Reusable agent definitions.'),
  ('catalog', 'agent_template_version', 'catalog', false, 'Versioned agent definitions.'),
  ('app', 'agency', 'agency', false, 'Visible within a scope under that agency.'),
  ('app', 'agency_member', 'agency', false, 'Visible to agency people in scope.'),
  ('app', 'tenant', 'tenant', false, 'RLS on id.'),
  ('app', 'workspace', 'tenant', false, 'RLS on tenant and workspace id.'),
  ('app', 'workspace_placement', 'tenant', false, 'Physical placement; grants nothing.'),
  ('app', 'agency_assignment', 'tenant', false, 'Staff ↔ tenant assignments.'),
  ('app', 'tenant_member', 'tenant', false, 'Client memberships.'),
  ('app', 'invitation', 'tenant', false, 'Pending OIDC invitations; no credentials.'),
  ('app', 'agent_installation', 'tenant', false, 'Agents installed on occupied floors.'),
  ('app', 'contact', 'tenant', false, ''),
  ('app', 'contact_external_id', 'tenant', false, 'Unique per tenant.'),
  ('app', 'consent_event', 'tenant', true, ''),
  ('app', 'suppression', 'tenant', false, ''),
  ('app', 'opportunity', 'tenant', false, ''),
  ('app', 'opportunity_stage_event', 'tenant', true, ''),
  ('app', 'note', 'tenant', false, 'BM25 indexed.'),
  ('app', 'draft_revision', 'tenant', true, ''),
  ('app', 'approval', 'tenant', false, 'Status changes once; never deleted.'),
  ('app', 'dispatch_attempt', 'tenant', true, 'Not allowed for demo tenants.'),
  ('app', 'dispatch_receipt', 'tenant', true, 'Not allowed for demo tenants.'),
  ('app', 'message_evidence', 'tenant', true, 'Legacy history; never proof of delivery.'),
  ('app', 'content_item', 'tenant', false, ''),
  ('app', 'schedule', 'tenant', false, 'Disabled unless explicitly enabled.'),
  ('app', 'usage_fact', 'tenant', true, ''),
  ('app', 'money_fact', 'tenant', true, 'Not allowed for demo tenants.'),
  ('app', 'audit_event', 'tenant', true, ''),
  ('app', 'outbox_event', 'tenant', true, 'Consumers keep cursors.'),
  ('app_private', 'scope_key', 'private', false, 'Scope signing key; scope role only.'),
  ('app_private', 'support_grant', 'private', false, 'Time-limited support access, created by platform admins.'),
  ('app_private', 'support_session', 'private', false, 'Audited support sessions; must be committed before use.'),
  ('migration', 'import_run', 'migration', false, 'Admin only.'),
  ('migration', 'record_map', 'migration', false, 'Admin only.'),
  ('migration', 'quarantine', 'migration', false, 'Admin only; holds original legacy records.');

-- Down Migration
DROP SCHEMA migration CASCADE;
DROP SCHEMA app CASCADE;
DROP SCHEMA app_private CASCADE;
DROP SCHEMA catalog CASCADE;
DROP TABLE platform.table_classification;
