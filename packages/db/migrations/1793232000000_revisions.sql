-- Up Migration
-- M04 revisions: immutable draft revisions with attachments, a canonical revision hash computed by the database,
-- approvals bound to (revision, hash) and invalidated by every edit, and a dispatch gate that only an approved,
-- current, untampered revision can pass (audit C04, C05, C07, C09, C13). Design, canonical serialization and error
-- codes: planning/agentcity-migration/m04/REVISIONS.md.
--
-- Error codes raised here (SQLSTATE class RV, application-defined):
--   RV001 stale_revision           the revision is not the latest of its draft (approve, request, edit, dispatch)
--   RV002 approval_pending_exists  the draft already has a pending approval (one at a time, C07)
--   RV003 revision_hash_mismatch   the approval's hash is not the revision's current canonical hash (tampering)
--   RV004 approval_not_valid       dispatch without an approved, unexpired approval of exactly this revision
--   RV005 attachments_frozen       attachments added outside the creating transaction, or after approval/edit
--   RV006 revision_chain_invalid   a new revision that does not continue its draft (other draft or contact)
--   RV007 recipient_mismatch       dispatch to a recipient other than the approved revision's (C13)
--   RV008 isolation_unsupported    approval and dispatch checks need READ COMMITTED or SERIALIZABLE

-- ───────────────────────── Canonical revision hash ─────────────────────────
-- Canonical JSON (see REVISIONS.md): object keys sorted by Unicode code point (= UTF-8 bytes, COLLATE "C"), no
-- whitespace, strings escaped as JSON.stringify does, numbers only as safe integers (|n| <= 2^53 - 1).
CREATE FUNCTION app.canonical_json(j jsonb) RETURNS text
LANGUAGE plpgsql STABLE STRICT SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  n numeric;
BEGIN
  CASE jsonb_typeof(j)
    WHEN 'object' THEN
      RETURN '{' || coalesce((SELECT string_agg(to_json(k)::text || ':' || app.canonical_json(v), ',' ORDER BY k COLLATE "C")
                              FROM jsonb_each(j) AS e(k, v)), '') || '}';
    WHEN 'array' THEN
      RETURN '[' || coalesce((SELECT string_agg(app.canonical_json(v), ',' ORDER BY i)
                              FROM jsonb_array_elements(j) WITH ORDINALITY AS e(v, i)), '') || ']';
    WHEN 'string' THEN
      RETURN to_json(j #>> '{}')::text;
    WHEN 'number' THEN
      n := j::numeric;
      IF n <> trunc(n) OR abs(n) > 9007199254740991 THEN
        RAISE EXCEPTION 'canonical JSON allows only safe integers, not %', n USING ERRCODE = '22023';
      END IF;
      RETURN n::bigint::text;
    WHEN 'boolean' THEN
      RETURN j::text;
    ELSE
      RETURN 'null';
  END CASE;
END $$;

-- The canonical revision document and its SHA-256 (lowercase hex). packages/db/src/revision-hash.ts computes the
-- same value; a test keeps the two identical.
CREATE FUNCTION app.revision_sha256(p_channel text, p_recipient text, p_subject text, p_body text, p_attachments jsonb, p_policy_context jsonb)
RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT encode(sha256(convert_to(app.canonical_json(jsonb_build_object(
    'format', 'agentcity.revision.v1',
    'channel', p_channel,
    'recipient', p_recipient,
    'subject', p_subject,
    'body', p_body,
    'attachments', coalesce(p_attachments, '[]'::jsonb),
    'policy_context', coalesce(p_policy_context, '{}'::jsonb))), 'UTF8')), 'hex')
$$;

-- ───────────────────────── Attachment versions ─────────────────────────
-- One stored version of an uploaded file. The object key lives under the tenant and workspace prefix, so a key can
-- never name another tenant's object.
CREATE TABLE app.asset_version (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  asset_id uuid NOT NULL,
  version int NOT NULL CHECK (version >= 1),
  object_key text NOT NULL CONSTRAINT asset_version_object_key_prefix CHECK (
    length(object_key) <= 1024 AND object_key !~ '(^|/)\.\.?(/|$)' AND object_key !~ '[[:cntrl:]\\]'
    AND starts_with(object_key, 'tenants/' || tenant_id::text || '/workspaces/' || workspace_id::text || '/')),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 0 AND 9007199254740991),
  media_type text NOT NULL CHECK (media_type ~ '^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$'),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, workspace_id, id),
  UNIQUE (tenant_id, asset_id, version),
  UNIQUE (tenant_id, object_key),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES app.workspace (tenant_id, id)
);

-- ───────────────────────── Revision chain ─────────────────────────
-- The M02 triggers are replaced below; drop them first so the backfill can write.
DROP TRIGGER hash ON app.draft_revision;
DROP TRIGGER immutable ON app.draft_revision;
DROP TRIGGER guard ON app.approval;

ALTER TABLE app.draft_revision
  ADD COLUMN draft_id uuid,
  ADD COLUMN previous_revision_id uuid,
  ADD COLUMN revision_number int,
  ADD COLUMN policy_context jsonb NOT NULL DEFAULT '{}',
  -- Canonical hash of channel, recipient, subject, body, attachments and policy context. Set by the database.
  ADD COLUMN revision_sha256 text,
  -- The transaction that created the revision: attachments may be added only inside it.
  ADD COLUMN created_xact xid8;
COMMENT ON COLUMN app.draft_revision.body_sha256 IS
  'M02 digest of recipient, subject and body. Kept for compatibility; authorization uses revision_sha256.';

-- Existing revisions (M02, legacy import) become the first revision of their own draft.
UPDATE app.draft_revision SET draft_id = id, revision_number = 1,
  revision_sha256 = app.revision_sha256(channel, recipient, subject, body, '[]', policy_context);
ALTER TABLE app.draft_revision
  ALTER COLUMN draft_id SET NOT NULL,
  ALTER COLUMN revision_number SET NOT NULL,
  ALTER COLUMN revision_sha256 SET NOT NULL,
  ADD CONSTRAINT draft_revision_sha256_hex CHECK (revision_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT draft_revision_number_chain CHECK (revision_number >= 1 AND (previous_revision_id IS NULL) = (revision_number = 1)),
  ADD CONSTRAINT draft_revision_policy_object CHECK (jsonb_typeof(policy_context) = 'object'),
  ADD CONSTRAINT draft_revision_in_draft UNIQUE (tenant_id, workspace_id, draft_id, id),
  ADD CONSTRAINT draft_revision_number_unique UNIQUE (tenant_id, draft_id, revision_number),
  -- A revision has at most one successor: the chain never forks.
  ADD CONSTRAINT draft_revision_one_successor UNIQUE (tenant_id, previous_revision_id),
  ADD CONSTRAINT draft_revision_previous_fkey FOREIGN KEY (tenant_id, workspace_id, draft_id, previous_revision_id)
    REFERENCES app.draft_revision (tenant_id, workspace_id, draft_id, id);

-- Ordered attachments of one revision. Position order is part of the revision hash.
CREATE TABLE app.draft_revision_attachment (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  draft_revision_id uuid NOT NULL,
  position int NOT NULL CHECK (position >= 0),
  asset_version_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, draft_revision_id, position),
  UNIQUE (tenant_id, draft_revision_id, asset_version_id),
  FOREIGN KEY (tenant_id, workspace_id, draft_revision_id) REFERENCES app.draft_revision (tenant_id, workspace_id, id),
  FOREIGN KEY (tenant_id, workspace_id, asset_version_id) REFERENCES app.asset_version (tenant_id, workspace_id, id)
);
CREATE INDEX draft_revision_attachment_asset ON app.draft_revision_attachment (tenant_id, asset_version_id);

-- The current canonical hash of a stored revision, from its row and its attachments. Runs with the caller's rights:
-- under RLS a hidden row changes the hash, so every check that uses it fails closed.
CREATE FUNCTION app.draft_revision_sha256(p_tenant uuid, p_revision uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT app.revision_sha256(r.channel, r.recipient, r.subject, r.body,
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'asset_version_id', v.id, 'content_sha256', v.content_sha256, 'media_type', v.media_type, 'size_bytes', v.size_bytes)
        ORDER BY a.position), '[]'::jsonb)
     FROM app.draft_revision_attachment a
     JOIN app.asset_version v ON v.tenant_id = a.tenant_id AND v.workspace_id = a.workspace_id AND v.id = a.asset_version_id
     WHERE a.tenant_id = r.tenant_id AND a.draft_revision_id = r.id),
    r.policy_context)
  FROM app.draft_revision r WHERE r.tenant_id = p_tenant AND r.id = p_revision
$$;

-- ───────────────────────── Approvals ─────────────────────────
ALTER TABLE app.approval
  ADD COLUMN draft_id uuid,
  -- The canonical hash of the revision when the approval was requested. Set by the database.
  ADD COLUMN revision_sha256 text,
  ADD COLUMN superseded_by_revision_id uuid,
  -- When an approved approval stopped counting (superseded or expired); decided_by/decided_at keep the approval.
  ADD COLUMN invalidated_at timestamptz;
UPDATE app.approval a SET draft_id = r.draft_id, revision_sha256 = r.revision_sha256
FROM app.draft_revision r WHERE r.tenant_id = a.tenant_id AND r.id = a.draft_revision_id;
ALTER TABLE app.approval DROP CONSTRAINT approval_status_check;
ALTER TABLE app.approval
  ALTER COLUMN draft_id SET NOT NULL,
  ALTER COLUMN revision_sha256 SET NOT NULL,
  ADD CONSTRAINT approval_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'superseded')),
  ADD CONSTRAINT approval_sha256_hex CHECK (revision_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT approval_superseded_by CHECK ((status = 'superseded') = (superseded_by_revision_id IS NOT NULL)),
  ADD CONSTRAINT approval_revision_in_draft FOREIGN KEY (tenant_id, workspace_id, draft_id, draft_revision_id)
    REFERENCES app.draft_revision (tenant_id, workspace_id, draft_id, id),
  ADD CONSTRAINT approval_superseded_by_fkey FOREIGN KEY (tenant_id, workspace_id, draft_id, superseded_by_revision_id)
    REFERENCES app.draft_revision (tenant_id, workspace_id, draft_id, id);
CREATE INDEX approval_draft ON app.approval (tenant_id, draft_id);
-- One pending approval per draft (C07). The trigger reports it as RV002 first; this index holds under any race.
CREATE UNIQUE INDEX approval_one_pending_per_draft ON app.approval (tenant_id, draft_id) WHERE status = 'pending';

-- The hash a dispatch was authorized with. Set by the database from the approval.
ALTER TABLE app.dispatch_attempt ADD COLUMN revision_sha256 text
  CONSTRAINT dispatch_attempt_sha256_hex CHECK (revision_sha256 IS NULL OR revision_sha256 ~ '^[0-9a-f]{64}$');

-- ───────────────────────── Triggers ─────────────────────────
-- Checks run with the caller's rights (RLS applies). When a referenced row is not found in the row's own tenant and
-- workspace, the trigger leaves the reference alone so the composite foreign key refuses it.

-- New revision: derive draft, number and hashes; an edit must continue the latest revision of its draft.
CREATE FUNCTION app_private.prepare_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  prev app.draft_revision;
BEGIN
  NEW.body_sha256 := encode(sha256(convert_to(coalesce(NEW.recipient, '') || E'\n' || coalesce(NEW.subject, '') || E'\n' || NEW.body, 'UTF8')), 'hex');
  NEW.created_xact := pg_current_xact_id();
  NEW.policy_context := coalesce(NEW.policy_context, '{}');
  IF NEW.previous_revision_id IS NULL THEN
    NEW.draft_id := coalesce(NEW.draft_id, NEW.id);
    NEW.revision_number := 1;
  ELSE
    SELECT * INTO prev FROM app.draft_revision
    WHERE tenant_id = NEW.tenant_id AND workspace_id = NEW.workspace_id AND id = NEW.previous_revision_id;
    IF NOT FOUND THEN
      NEW.draft_id := coalesce(NEW.draft_id, NEW.id);
      NEW.revision_number := 2;
    ELSE
      PERFORM pg_advisory_xact_lock(hashtextextended('agentcity.draft:' || prev.draft_id::text, 0));
      IF NEW.draft_id IS NOT NULL AND NEW.draft_id <> prev.draft_id THEN
        RAISE EXCEPTION 'revision_chain_invalid: the previous revision belongs to another draft' USING ERRCODE = 'RV006';
      END IF;
      IF NEW.contact_id IS DISTINCT FROM prev.contact_id THEN
        RAISE EXCEPTION 'revision_chain_invalid: a new revision must keep the draft''s contact' USING ERRCODE = 'RV006';
      END IF;
      IF current_setting('transaction_isolation') = 'repeatable read' THEN
        RAISE EXCEPTION 'isolation_unsupported: use READ COMMITTED or SERIALIZABLE' USING ERRCODE = 'RV008';
      END IF;
      IF EXISTS (SELECT 1 FROM app.draft_revision s WHERE s.tenant_id = prev.tenant_id AND s.previous_revision_id = prev.id) THEN
        RAISE EXCEPTION 'stale_revision: revision % of this draft has already been edited', prev.revision_number USING ERRCODE = 'RV001';
      END IF;
      NEW.draft_id := prev.draft_id;
      NEW.revision_number := prev.revision_number + 1;
    END IF;
  END IF;
  NEW.revision_sha256 := app.revision_sha256(NEW.channel, NEW.recipient, NEW.subject, NEW.body, '[]', NEW.policy_context);
  RETURN NEW;
END $$;

-- After an edit: every pending or approved approval of an earlier revision stops counting. Runs as the scope role
-- so no RLS narrowing can hide an approval from it; it touches only the new row's tenant and draft.
CREATE FUNCTION app_private.supersede_approvals() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE app.approval SET status = 'superseded', superseded_by_revision_id = NEW.id,
    reason = coalesce(reason || ' / ', '') || format('Superseded by revision %s.', NEW.revision_number)
  WHERE tenant_id = NEW.tenant_id AND draft_id = NEW.draft_id AND draft_revision_id <> NEW.id AND status IN ('pending', 'approved');
  RETURN NULL;
END $$;

-- Revisions are immutable. The only permitted UPDATE is the database refreshing revision_sha256 to its true value
-- while attachments are added, in the creating transaction, before any approval or edit.
CREATE FUNCTION app_private.guard_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  unchanged app.draft_revision;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    unchanged := NEW;
    unchanged.revision_sha256 := OLD.revision_sha256;
    IF unchanged IS NOT DISTINCT FROM OLD
       AND OLD.created_xact = pg_current_xact_id()
       AND NEW.revision_sha256 = app.draft_revision_sha256(NEW.tenant_id, NEW.id)
       AND NOT EXISTS (SELECT 1 FROM app.approval a WHERE a.tenant_id = OLD.tenant_id AND a.draft_revision_id = OLD.id)
       AND NOT EXISTS (SELECT 1 FROM app.draft_revision s WHERE s.tenant_id = OLD.tenant_id AND s.previous_revision_id = OLD.id) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% is an immutable record: % is not allowed', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_OP
    USING ERRCODE = '42501';
END $$;

-- Attachments: only in the transaction that created the revision, and only while nothing has bound its hash.
CREATE FUNCTION app_private.guard_attachment() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r app.draft_revision;
BEGIN
  SELECT * INTO r FROM app.draft_revision
  WHERE tenant_id = NEW.tenant_id AND workspace_id = NEW.workspace_id AND id = NEW.draft_revision_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('agentcity.draft:' || r.draft_id::text, 0));
  IF r.created_xact IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION 'attachments_frozen: attachments are added in the transaction that creates the revision' USING ERRCODE = 'RV005';
  END IF;
  IF EXISTS (SELECT 1 FROM app.approval a WHERE a.tenant_id = r.tenant_id AND a.draft_revision_id = r.id) THEN
    RAISE EXCEPTION 'attachments_frozen: this revision has an approval' USING ERRCODE = 'RV005';
  END IF;
  IF EXISTS (SELECT 1 FROM app.draft_revision s WHERE s.tenant_id = r.tenant_id AND s.previous_revision_id = r.id) THEN
    RAISE EXCEPTION 'attachments_frozen: this revision has a newer revision' USING ERRCODE = 'RV005';
  END IF;
  RETURN NEW;
END $$;

-- After an attachment is added, store the revision's new canonical hash (the app role cannot UPDATE revisions).
CREATE FUNCTION app_private.refresh_revision_hash() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE app.draft_revision SET revision_sha256 = app.draft_revision_sha256(NEW.tenant_id, NEW.draft_revision_id)
  WHERE tenant_id = NEW.tenant_id AND id = NEW.draft_revision_id;
  RETURN NULL;
END $$;

-- New approval: bound to the revision's current hash (whatever the caller sent). A pending request or a direct
-- approval (a person approving as they send, C09) needs the latest revision; one pending approval per draft.
CREATE FUNCTION app_private.prepare_approval() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r app.draft_revision;
BEGIN
  SELECT * INTO r FROM app.draft_revision
  WHERE tenant_id = NEW.tenant_id AND workspace_id = NEW.workspace_id AND id = NEW.draft_revision_id;
  IF NOT FOUND THEN
    NEW.draft_id := NEW.draft_revision_id;
    NEW.revision_sha256 := repeat('0', 64);
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('agentcity.draft:' || r.draft_id::text, 0));
  NEW.draft_id := r.draft_id;
  NEW.revision_sha256 := app.draft_revision_sha256(r.tenant_id, r.id);
  NEW.invalidated_at := NULL;
  IF NEW.status = 'superseded' THEN
    RAISE EXCEPTION 'only the database supersedes approvals' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IN ('pending', 'approved') THEN
    IF current_setting('transaction_isolation') = 'repeatable read' THEN
      RAISE EXCEPTION 'isolation_unsupported: use READ COMMITTED or SERIALIZABLE' USING ERRCODE = 'RV008';
    END IF;
    IF EXISTS (SELECT 1 FROM app.draft_revision s WHERE s.tenant_id = r.tenant_id AND s.previous_revision_id = r.id) THEN
      RAISE EXCEPTION 'stale_revision: only the latest revision of a draft can be approved' USING ERRCODE = 'RV001';
    END IF;
    IF NEW.status = 'pending' AND EXISTS (
      SELECT 1 FROM app.approval p WHERE p.tenant_id = NEW.tenant_id AND p.draft_id = NEW.draft_id AND p.status = 'pending'
    ) THEN
      RAISE EXCEPTION 'approval_pending_exists: this draft already has a pending approval' USING ERRCODE = 'RV002';
    END IF;
    IF NEW.status = 'approved' THEN
      IF NEW.expires_at <= now() THEN
        RAISE EXCEPTION 'approval_not_valid: an approval must expire in the future' USING ERRCODE = 'RV004';
      END IF;
      NEW.decided_by := coalesce(app.current_subject(), NEW.decided_by);
      NEW.decided_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Approval changes: the binding never moves; pending is decided once; an approval can stop counting (superseded
-- by an edit, or expired) but is never deleted and never turns into another decision.
CREATE FUNCTION app_private.guard_approval_decision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'approvals are kept for audit; expire or reject instead' USING ERRCODE = '42501';
  END IF;
  IF NEW.draft_revision_id <> OLD.draft_revision_id OR NEW.tenant_id <> OLD.tenant_id OR NEW.workspace_id <> OLD.workspace_id
     OR NEW.id <> OLD.id OR NEW.draft_id <> OLD.draft_id OR NEW.revision_sha256 <> OLD.revision_sha256
     OR NEW.requested_at <> OLD.requested_at OR NEW.expires_at <> OLD.expires_at
     OR NEW.provenance IS DISTINCT FROM OLD.provenance THEN
    RAISE EXCEPTION 'an approval cannot be moved to another revision' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'superseded' AND NOT EXISTS (
    SELECT 1 FROM app.draft_revision s JOIN app.draft_revision r ON r.tenant_id = s.tenant_id AND r.id = OLD.draft_revision_id
    WHERE s.tenant_id = OLD.tenant_id AND s.draft_id = OLD.draft_id AND s.id = NEW.superseded_by_revision_id
      AND s.revision_number > r.revision_number
  ) THEN
    RAISE EXCEPTION 'an approval is superseded only by a newer revision of its draft' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'pending' THEN
    IF NEW.status <> 'pending' THEN
      NEW.decided_at := now();
    END IF;
    IF NEW.status = 'approved' THEN
      IF OLD.expires_at <= now() THEN
        RAISE EXCEPTION 'approval_not_valid: this approval request has expired' USING ERRCODE = 'RV004';
      END IF;
      IF current_setting('transaction_isolation') = 'repeatable read' THEN
        RAISE EXCEPTION 'isolation_unsupported: use READ COMMITTED or SERIALIZABLE' USING ERRCODE = 'RV008';
      END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended('agentcity.draft:' || OLD.draft_id::text, 0));
      IF EXISTS (SELECT 1 FROM app.draft_revision s WHERE s.tenant_id = OLD.tenant_id AND s.previous_revision_id = OLD.draft_revision_id) THEN
        RAISE EXCEPTION 'stale_revision: only the latest revision of a draft can be approved' USING ERRCODE = 'RV001';
      END IF;
      IF OLD.revision_sha256 IS DISTINCT FROM app.draft_revision_sha256(OLD.tenant_id, OLD.draft_revision_id) THEN
        RAISE EXCEPTION 'revision_hash_mismatch: the revision no longer matches what was submitted for approval' USING ERRCODE = 'RV003';
      END IF;
      NEW.decided_by := coalesce(app.current_subject(), NEW.decided_by);
    END IF;
    IF NEW.status IN ('superseded', 'expired') THEN
      NEW.invalidated_at := now();
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' AND NEW.status IN ('superseded', 'expired') THEN
    NEW.decided_by := OLD.decided_by;
    NEW.decided_at := OLD.decided_at;
    NEW.invalidated_at := now();
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'approval already %', OLD.status USING ERRCODE = '42501';
END $$;

-- Dispatch gate (C05, C13): an approved, unexpired approval of exactly this revision, which is the latest of its
-- draft, whose stored hash equals the revision's current canonical hash, sent to the approved recipient.
CREATE FUNCTION app_private.authorize_dispatch() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  a app.approval;
  r app.draft_revision;
BEGIN
  SELECT * INTO a FROM app.approval WHERE tenant_id = NEW.tenant_id AND workspace_id = NEW.workspace_id AND id = NEW.approval_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF current_setting('transaction_isolation') = 'repeatable read' THEN
    RAISE EXCEPTION 'isolation_unsupported: use READ COMMITTED or SERIALIZABLE' USING ERRCODE = 'RV008';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('agentcity.draft:' || a.draft_id::text, 0));
  -- Read again under the lock: a concurrent edit may have just superseded it.
  SELECT * INTO a FROM app.approval WHERE tenant_id = NEW.tenant_id AND id = NEW.approval_id;
  IF a.draft_revision_id <> NEW.draft_revision_id THEN
    RAISE EXCEPTION 'approval_not_valid: the approval is for another revision' USING ERRCODE = 'RV004';
  END IF;
  IF a.status <> 'approved' THEN
    RAISE EXCEPTION 'approval_not_valid: the approval is %', a.status USING ERRCODE = 'RV004';
  END IF;
  IF a.expires_at <= now() THEN
    RAISE EXCEPTION 'approval_not_valid: the approval has expired' USING ERRCODE = 'RV004';
  END IF;
  SELECT * INTO r FROM app.draft_revision WHERE tenant_id = a.tenant_id AND id = a.draft_revision_id;
  IF EXISTS (SELECT 1 FROM app.draft_revision s WHERE s.tenant_id = r.tenant_id AND s.previous_revision_id = r.id) THEN
    RAISE EXCEPTION 'stale_revision: the draft has a newer revision' USING ERRCODE = 'RV001';
  END IF;
  IF a.revision_sha256 IS DISTINCT FROM app.draft_revision_sha256(r.tenant_id, r.id) THEN
    RAISE EXCEPTION 'revision_hash_mismatch: the revision no longer matches the approved content' USING ERRCODE = 'RV003';
  END IF;
  IF r.recipient IS NOT NULL AND NEW.recipient IS DISTINCT FROM r.recipient THEN
    RAISE EXCEPTION 'recipient_mismatch: the dispatch recipient is not the approved recipient' USING ERRCODE = 'RV007';
  END IF;
  NEW.revision_sha256 := a.revision_sha256;
  RETURN NEW;
END $$;

CREATE TRIGGER prepare BEFORE INSERT ON app.draft_revision FOR EACH ROW EXECUTE FUNCTION app_private.prepare_revision();
CREATE TRIGGER supersede AFTER INSERT ON app.draft_revision FOR EACH ROW EXECUTE FUNCTION app_private.supersede_approvals();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.draft_revision FOR EACH ROW EXECUTE FUNCTION app_private.guard_revision();
CREATE TRIGGER prepare BEFORE INSERT ON app.approval FOR EACH ROW EXECUTE FUNCTION app_private.prepare_approval();
CREATE TRIGGER guard BEFORE UPDATE OR DELETE ON app.approval FOR EACH ROW EXECUTE FUNCTION app_private.guard_approval_decision();
-- Named to fire before no_demo (triggers fire in name order); both must pass.
CREATE TRIGGER authorize BEFORE INSERT ON app.dispatch_attempt FOR EACH ROW EXECUTE FUNCTION app_private.authorize_dispatch();

-- ───────────────────────── Protection of the new tables (M02 pattern) ─────────────────────────
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
SELECT app_private.protect('app.asset_version', true, true, 'SELECT, INSERT');
SELECT app_private.protect('app.draft_revision_attachment', true, true, 'SELECT, INSERT');
DROP FUNCTION app_private.protect(regclass, boolean, boolean, text, text);

CREATE TRIGGER guard BEFORE INSERT ON app.draft_revision_attachment FOR EACH ROW EXECUTE FUNCTION app_private.guard_attachment();
CREATE TRIGGER refresh_hash AFTER INSERT ON app.draft_revision_attachment FOR EACH ROW EXECUTE FUNCTION app_private.refresh_revision_hash();

-- ───────────────────────── Ownership and execute rights ─────────────────────────
REVOKE ALL ON FUNCTION app.canonical_json(jsonb), app.revision_sha256(text, text, text, text, jsonb, jsonb),
  app.draft_revision_sha256(uuid, uuid), app_private.prepare_revision(), app_private.supersede_approvals(),
  app_private.guard_revision(), app_private.guard_attachment(), app_private.refresh_revision_hash(),
  app_private.prepare_approval(), app_private.guard_approval_decision(),
  app_private.authorize_dispatch() FROM PUBLIC;
ALTER FUNCTION app_private.supersede_approvals() OWNER TO agentcity_scope;
ALTER FUNCTION app_private.refresh_revision_hash() OWNER TO agentcity_scope;
GRANT EXECUTE ON FUNCTION app.canonical_json(jsonb), app.revision_sha256(text, text, text, text, jsonb, jsonb),
  app.draft_revision_sha256(uuid, uuid) TO agentcity_app, agentcity_scope;
-- What the two scope-role triggers need: read the chain, mark approvals superseded, refresh a revision's hash.
GRANT SELECT ON app.draft_revision, app.approval, app.draft_revision_attachment, app.asset_version TO agentcity_scope;
GRANT UPDATE (status, superseded_by_revision_id, reason, decided_at, decided_by, invalidated_at) ON app.approval TO agentcity_scope;
GRANT UPDATE (revision_sha256) ON app.draft_revision TO agentcity_scope;

INSERT INTO platform.table_classification (table_schema, table_name, class, immutable, note) VALUES
  ('app', 'asset_version', 'tenant', true, 'Stored file versions; object key under the tenant/workspace prefix.'),
  ('app', 'draft_revision_attachment', 'tenant', true, 'Ordered attachments; frozen once approved or edited.');
UPDATE platform.table_classification SET note = 'Revision chain per draft; canonical hash set by the database.'
WHERE table_schema = 'app' AND table_name = 'draft_revision';
UPDATE platform.table_classification SET note = 'Bound to (revision, hash); superseded by edits; never deleted.'
WHERE table_schema = 'app' AND table_name = 'approval';
UPDATE platform.table_classification SET note = 'Needs a current approved revision. Not allowed for demo tenants.'
WHERE table_schema = 'app' AND table_name = 'dispatch_attempt';

-- Down Migration
UPDATE platform.table_classification SET note = '' WHERE table_schema = 'app' AND table_name = 'draft_revision';
UPDATE platform.table_classification SET note = 'Status changes once; never deleted.' WHERE table_schema = 'app' AND table_name = 'approval';
UPDATE platform.table_classification SET note = 'Not allowed for demo tenants.' WHERE table_schema = 'app' AND table_name = 'dispatch_attempt';
DELETE FROM platform.table_classification WHERE table_schema = 'app' AND table_name IN ('asset_version', 'draft_revision_attachment');

REVOKE UPDATE (revision_sha256) ON app.draft_revision FROM agentcity_scope;
REVOKE UPDATE (status, superseded_by_revision_id, reason, decided_at, decided_by, invalidated_at) ON app.approval FROM agentcity_scope;
REVOKE SELECT ON app.draft_revision, app.approval FROM agentcity_scope;

DROP TABLE app.draft_revision_attachment;
DROP TABLE app.asset_version;

DROP TRIGGER authorize ON app.dispatch_attempt;
DROP TRIGGER guard ON app.approval;
DROP TRIGGER prepare ON app.approval;
DROP TRIGGER immutable ON app.draft_revision;
DROP TRIGGER supersede ON app.draft_revision;
DROP TRIGGER prepare ON app.draft_revision;

ALTER TABLE app.dispatch_attempt DROP COLUMN revision_sha256;

DROP INDEX app.approval_one_pending_per_draft;
DROP INDEX app.approval_draft;
ALTER TABLE app.approval
  DROP CONSTRAINT approval_superseded_by_fkey,
  DROP CONSTRAINT approval_revision_in_draft,
  DROP CONSTRAINT approval_superseded_by,
  DROP CONSTRAINT approval_sha256_hex,
  DROP CONSTRAINT approval_status_check,
  DROP COLUMN invalidated_at,
  DROP COLUMN superseded_by_revision_id,
  DROP COLUMN revision_sha256,
  DROP COLUMN draft_id;
-- M02 knows no "superseded": keep the history as expired.
UPDATE app.approval SET status = 'expired' WHERE status = 'superseded';
ALTER TABLE app.approval ADD CONSTRAINT approval_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'expired'));

ALTER TABLE app.draft_revision
  DROP CONSTRAINT draft_revision_previous_fkey,
  DROP CONSTRAINT draft_revision_one_successor,
  DROP CONSTRAINT draft_revision_number_unique,
  DROP CONSTRAINT draft_revision_in_draft,
  DROP CONSTRAINT draft_revision_policy_object,
  DROP CONSTRAINT draft_revision_number_chain,
  DROP CONSTRAINT draft_revision_sha256_hex,
  DROP COLUMN created_xact,
  DROP COLUMN revision_sha256,
  DROP COLUMN policy_context,
  DROP COLUMN revision_number,
  DROP COLUMN previous_revision_id,
  DROP COLUMN draft_id;
COMMENT ON COLUMN app.draft_revision.body_sha256 IS NULL;

DROP FUNCTION app_private.authorize_dispatch();
DROP FUNCTION app_private.guard_approval_decision();
DROP FUNCTION app_private.prepare_approval();
DROP FUNCTION app_private.refresh_revision_hash();
DROP FUNCTION app_private.guard_attachment();
DROP FUNCTION app_private.guard_revision();
DROP FUNCTION app_private.supersede_approvals();
DROP FUNCTION app_private.prepare_revision();
DROP FUNCTION app.draft_revision_sha256(uuid, uuid);
DROP FUNCTION app.revision_sha256(text, text, text, text, jsonb, jsonb);
DROP FUNCTION app.canonical_json(jsonb);

CREATE TRIGGER hash BEFORE INSERT ON app.draft_revision FOR EACH ROW EXECUTE FUNCTION app_private.hash_draft();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.draft_revision FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();
CREATE TRIGGER guard BEFORE UPDATE OR DELETE ON app.approval FOR EACH ROW EXECUTE FUNCTION app_private.guard_approval();
