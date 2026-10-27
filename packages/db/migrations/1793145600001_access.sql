-- Up Migration
-- M03 access (owner: access module). Invitations, role changes, removals and staff assignments. Every membership
-- write goes through a SECURITY DEFINER function owned by agentcity_scope that checks the actor's own membership in
-- the database (never what the caller claims) and writes app.audit_event in the same transaction. The app role keeps
-- having no INSERT/UPDATE/DELETE on app.tenant_member, app.agency_member, app.agency_assignment and app.invitation.
--
-- Invitation links expire after INVITATION_TTL_HOURS (default 48 h), passed in by the API. This is the proposal's
-- "48-hour sign-in link" requirement. The proposal's separate "48-hour shadow mode" (agents observing before they
-- act) is a different requirement and has nothing to do with these tokens.
--
-- Error codes (SQLSTATE) the API maps to HTTP responses. Messages never name another tenant, person or email:
--   42501 not allowed (actor lacks the authority)      22023 invalid input
--   ACI01 invitation token not recognised              ACI02 invitation token expired
--   ACI03 invitation token already used or replaced    ACI04 signed-in email does not match the invitation
--   ACI05 signed-in email not verified                 ACM01 would remove the last tenant-wide client admin / owner
--   ACM02 no such member, staff person or invitation

-- ───────────────────────── Invitation tokens ─────────────────────────
-- Only the SHA-256 of the token is stored; the token itself is shown once to the person who created it. A token
-- is single-use; issuing a new one for the same invitation replaces (revokes) the earlier unused ones.
CREATE TABLE identity.invitation_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  invitation_id uuid NOT NULL,
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  used_at timestamptz,
  used_by text,
  revoked_at timestamptz,
  CHECK ((used_at IS NULL) = (used_by IS NULL)),
  FOREIGN KEY (tenant_id, invitation_id) REFERENCES app.invitation (tenant_id, id)
);
CREATE INDEX invitation_token_invitation ON identity.invitation_token (tenant_id, invitation_id);
-- No policy: nobody but the owner and the scope role (BYPASSRLS) reads it, and the app role has no grant at all.
ALTER TABLE identity.invitation_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.invitation_token FORCE ROW LEVEL SECURITY;

-- ───────────────────────── Private helpers ─────────────────────────
CREATE FUNCTION app_private.check_subject(p_subject text) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_subject IS NULL OR p_subject !~ '^[A-Za-z0-9._@:+-]{1,200}$' THEN
    RAISE EXCEPTION 'invalid subject' USING ERRCODE = '22023';
  END IF;
END $$;

-- Membership changes in one tenant (or one agency) are serialised, so two concurrent removals cannot both pass the
-- last-admin check. Advisory locks are transaction-scoped and re-entrant.
CREATE FUNCTION app_private.lock_members(p_key text, p_id uuid) RETURNS void
LANGUAGE sql VOLATILE SET search_path = pg_catalog, pg_temp AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('agentcity:' || p_key || ':' || p_id::text, 0))
$$;

-- What the actor may do in a tenant, from the actor's own membership rows. An agency owner administers every tenant
-- of the agency, so ownership is checked first; then client membership; then a staff assignment. Support people
-- and strangers get 'none': support access is read-only and administers nothing. An unknown tenant looks exactly
-- like a tenant the actor is not in.
CREATE FUNCTION app_private.actor_authority(p_actor text, p_tenant uuid,
  OUT o_role text, OUT o_workspace uuid, OUT o_agency uuid, OUT o_tenant_kind text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_member app.tenant_member;
BEGIN
  PERFORM app_private.check_subject(p_actor);
  SELECT t.agency_id, t.kind INTO o_agency, o_tenant_kind FROM app.tenant t WHERE t.id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'not authorized for this tenant' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM app.agency_member m
             WHERE m.agency_id = o_agency AND m.subject = p_actor AND m.role = 'owner' AND m.revoked_at IS NULL) THEN
    o_role := 'agency-owner';
    RETURN;
  END IF;
  SELECT * INTO v_member FROM app.tenant_member m WHERE m.tenant_id = p_tenant AND m.subject = p_actor AND m.revoked_at IS NULL;
  IF FOUND THEN
    o_role := v_member.role;
    o_workspace := v_member.workspace_id;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM app.agency_assignment a JOIN app.agency_member m USING (agency_id, subject)
             WHERE a.tenant_id = p_tenant AND a.subject = p_actor AND a.revoked_at IS NULL AND m.revoked_at IS NULL) THEN
    o_role := 'agency-staff';
    RETURN;
  END IF;
  o_role := 'none';
END $$;

-- Why the actor may not grant this role (NULL if it may). Escalation rules:
--   agency owner: any role in its agency's tenants, but agency roles only in the agency's own tenant (kind 'agency');
--   client admin: client-admin or client-viewer only, and a workspace-limited admin only within its own workspace;
--   everyone else (viewer, staff, support, stranger): nothing.
CREATE FUNCTION app_private.grant_refusal(p_actor_role text, p_actor_ws uuid, p_tenant_kind text, p_role text, p_ws uuid)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor_role = 'agency-owner' THEN
    IF p_role IN ('agency-owner', 'agency-staff') AND p_tenant_kind <> 'agency' THEN
      RETURN 'agency roles can only be granted in the agency''s own tenant';
    END IF;
    RETURN NULL;
  ELSIF p_actor_role = 'client-admin' THEN
    IF p_role NOT IN ('client-admin', 'client-viewer') THEN RETURN 'a client admin cannot grant this role'; END IF;
    IF p_actor_ws IS NOT NULL AND p_ws IS DISTINCT FROM p_actor_ws THEN
      RETURN 'not allowed outside your own workspace';
    END IF;
    RETURN NULL;
  END IF;
  RETURN 'not allowed to manage members of this tenant';
END $$;

CREATE FUNCTION app_private.check_grant(p_tenant uuid, p_role text, p_ws uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('agency-owner', 'agency-staff', 'client-admin', 'client-viewer') THEN
    RAISE EXCEPTION 'invalid role' USING ERRCODE = '22023';
  END IF;
  IF p_role IN ('agency-owner', 'agency-staff') AND p_ws IS NOT NULL THEN
    RAISE EXCEPTION 'agency roles are not limited to a workspace' USING ERRCODE = '22023';
  END IF;
  IF p_ws IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app.workspace w WHERE w.tenant_id = p_tenant AND w.id = p_ws) THEN
    RAISE EXCEPTION 'unknown workspace' USING ERRCODE = '22023';
  END IF;
END $$;

-- A tenant always keeps at least one tenant-wide client admin once it has one (agency owners are not counted: they
-- are the agency's people, not the client's). Call with the members lock held.
CREATE FUNCTION app_private.guard_last_admin(p_tenant uuid, p_subject text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.tenant_member m WHERE m.tenant_id = p_tenant AND m.subject = p_subject
               AND m.role = 'client-admin' AND m.workspace_id IS NULL AND m.revoked_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM app.tenant_member m WHERE m.tenant_id = p_tenant AND m.subject <> p_subject
               AND m.role = 'client-admin' AND m.workspace_id IS NULL AND m.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'the last tenant-wide client admin cannot be removed or demoted' USING ERRCODE = 'ACM01';
  END IF;
END $$;

CREATE FUNCTION app_private.guard_last_owner(p_agency uuid, p_subject text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.agency_member m WHERE m.agency_id = p_agency AND m.subject = p_subject
               AND m.role = 'owner' AND m.revoked_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM app.agency_member m WHERE m.agency_id = p_agency AND m.subject <> p_subject
               AND m.role = 'owner' AND m.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'the last agency owner cannot be removed or demoted' USING ERRCODE = 'ACM01';
  END IF;
END $$;

-- Creates or re-activates a client membership with exactly this role and workspace limit.
CREATE FUNCTION app_private.put_client_member(p_tenant uuid, p_subject text, p_role text, p_ws uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM app_private.lock_members('tenant-members', p_tenant);
  IF NOT (p_role = 'client-admin' AND p_ws IS NULL) THEN
    PERFORM app_private.guard_last_admin(p_tenant, p_subject);
  END IF;
  INSERT INTO app.tenant_member AS m (tenant_id, subject, workspace_id, role) VALUES (p_tenant, p_subject, p_ws, p_role)
  ON CONFLICT (tenant_id, subject) DO UPDATE SET role = EXCLUDED.role, workspace_id = EXCLUDED.workspace_id, revoked_at = NULL;
END $$;

CREATE FUNCTION app_private.put_agency_member(p_agency uuid, p_subject text, p_role text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM app_private.lock_members('agency-members', p_agency);
  IF p_role <> 'owner' THEN PERFORM app_private.guard_last_owner(p_agency, p_subject); END IF;
  INSERT INTO app.agency_member AS m (agency_id, subject, role) VALUES (p_agency, p_subject, p_role)
  ON CONFLICT (agency_id, subject) DO UPDATE SET role = EXCLUDED.role, revoked_at = NULL;
END $$;

-- A person whose access to these tenants changed must choose a tenant again: the API's session no longer points
-- into them. (Their next request re-enters scope anyway; this keeps the stored selection honest.)
CREATE FUNCTION app_private.clear_sessions(p_subject text, p_tenants uuid[]) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  UPDATE identity.session s SET tenant_id = NULL, workspace_id = NULL
  WHERE s.subject = p_subject AND s.tenant_id = ANY (p_tenants) AND s.revoked_at IS NULL
$$;

CREATE FUNCTION app_private.put_token(p_tenant uuid, p_invitation uuid, p_token_sha256 text, p_ttl interval, p_actor text)
RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_expires timestamptz;
BEGIN
  IF p_token_sha256 IS NULL OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid token hash' USING ERRCODE = '22023';
  END IF;
  IF p_ttl IS NULL OR p_ttl <= interval '0' OR p_ttl > interval '14 days' THEN
    RAISE EXCEPTION 'invalid invitation lifetime' USING ERRCODE = '22023';
  END IF;
  UPDATE identity.invitation_token t SET revoked_at = now()
  WHERE t.tenant_id = p_tenant AND t.invitation_id = p_invitation AND t.used_at IS NULL AND t.revoked_at IS NULL;
  v_expires := now() + p_ttl;
  INSERT INTO identity.invitation_token (tenant_id, invitation_id, token_sha256, created_by, expires_at)
  VALUES (p_tenant, p_invitation, p_token_sha256, p_actor, v_expires);
  RETURN v_expires;
END $$;

-- ───────────────────────── Public functions (EXECUTE: agentcity_app) ─────────────────────────
-- Tenants (and their workspaces) the person can enter, with the role app.enter_scope would give them there (same
-- precedence: client membership, agency owner, assigned staff, an open support session).
CREATE FUNCTION app.list_memberships(p_subject text)
RETURNS TABLE (tenant_id uuid, tenant_name text, tenant_kind text, agency_id uuid, role text, workspace_id uuid, workspaces jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM app_private.check_subject(p_subject);
  RETURN QUERY
  WITH candidates AS (
    SELECT m.tenant_id AS tid, m.role AS r, m.workspace_id AS ws, 1 AS rank
    FROM app.tenant_member m WHERE m.subject = p_subject AND m.revoked_at IS NULL
    UNION ALL
    SELECT t.id, 'agency-owner', NULL::uuid, 2
    FROM app.agency_member am JOIN app.tenant t ON t.agency_id = am.agency_id
    WHERE am.subject = p_subject AND am.role = 'owner' AND am.revoked_at IS NULL
    UNION ALL
    SELECT a.tenant_id, 'agency-staff', NULL::uuid, 3
    FROM app.agency_assignment a JOIN app.agency_member am ON am.agency_id = a.agency_id AND am.subject = a.subject
    WHERE a.subject = p_subject AND a.revoked_at IS NULL AND am.revoked_at IS NULL
    UNION ALL
    SELECT s.tenant_id, 'support', NULL::uuid, 4
    FROM app_private.support_session s JOIN app_private.support_grant g ON g.id = s.grant_id
    WHERE s.subject = p_subject AND s.expires_at > now() AND s.opened_at < transaction_timestamp()
      AND g.revoked_at IS NULL AND g.expires_at > now()
  ), best AS (
    SELECT DISTINCT ON (c.tid) c.tid, c.r, c.ws FROM candidates c ORDER BY c.tid, c.rank
  )
  SELECT b.tid, t.name, t.kind, t.agency_id, b.r, b.ws,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind) ORDER BY w.name, w.id)
              FROM app.workspace w WHERE w.tenant_id = b.tid AND (b.ws IS NULL OR w.id = b.ws)), '[]'::jsonb)
  FROM best b JOIN app.tenant t ON t.id = b.tid
  ORDER BY t.name, t.id;
END $$;

-- Invites an email address into a tenant with a role, and stores the hash of a new single-use token. Re-inviting
-- the same address resets that invitation to pending with the new role and replaces its earlier unused tokens.
-- Also records app.outbox_event 'invitation.created' (without the token). No email is sent by the database or API.
CREATE FUNCTION app.create_invitation(p_actor text, p_tenant uuid, p_email text, p_role text, p_workspace uuid,
  p_token_sha256 text, p_ttl interval DEFAULT interval '48 hours')
RETURNS TABLE (invitation_id uuid, expires_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  a record;
  v_email text := lower(btrim(p_email));
  v_refusal text;
  v_existing app.invitation;
  v_id uuid;
  v_expires timestamptz;
BEGIN
  SELECT * INTO a FROM app_private.actor_authority(p_actor, p_tenant);
  IF a.o_role NOT IN ('agency-owner', 'client-admin') THEN
    RAISE EXCEPTION 'not allowed to invite people to this tenant' USING ERRCODE = '42501';
  END IF;
  IF v_email IS NULL OR length(v_email) > 320 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'invalid email address' USING ERRCODE = '22023';
  END IF;
  PERFORM app_private.check_grant(p_tenant, p_role, p_workspace);
  v_refusal := app_private.grant_refusal(a.o_role, a.o_workspace, a.o_tenant_kind, p_role, p_workspace);
  IF v_refusal IS NOT NULL THEN RAISE EXCEPTION '%', v_refusal USING ERRCODE = '42501'; END IF;

  -- Re-inviting an address must not let an actor overwrite an invitation it could not have created.
  SELECT * INTO v_existing FROM app.invitation i WHERE i.tenant_id = p_tenant AND i.email = v_email FOR UPDATE;
  IF FOUND AND app_private.grant_refusal(a.o_role, a.o_workspace, a.o_tenant_kind, v_existing.role, v_existing.workspace_id) IS NOT NULL THEN
    RAISE EXCEPTION 'not allowed to change this invitation' USING ERRCODE = '42501';
  END IF;

  INSERT INTO app.invitation AS i (tenant_id, id, email, role, workspace_id, provenance)
  VALUES (p_tenant, gen_random_uuid(), v_email, p_role, p_workspace,
          jsonb_build_object('source', 'access-api', 'created_by', p_actor))
  ON CONFLICT (tenant_id, email) DO UPDATE SET role = EXCLUDED.role, workspace_id = EXCLUDED.workspace_id, status = 'pending'
  RETURNING i.id INTO v_id;
  v_expires := app_private.put_token(p_tenant, v_id, p_token_sha256, p_ttl, p_actor);

  INSERT INTO app.audit_event (tenant_id, actor, action, target_kind, target_id, detail)
  VALUES (p_tenant, p_actor, 'invitation-created', 'invitation', v_id::text,
          jsonb_build_object('email', v_email, 'role', p_role, 'workspace', p_workspace, 'expires_at', v_expires));
  INSERT INTO app.outbox_event (tenant_id, workspace_id, topic, payload)
  VALUES (p_tenant, p_workspace, 'invitation.created',
          jsonb_build_object('invitationId', v_id, 'email', v_email, 'role', p_role, 'workspaceId', p_workspace,
                             'expiresAt', v_expires, 'createdBy', p_actor));
  RETURN QUERY SELECT v_id, v_expires;
END $$;

-- A new token for an invitation that already exists (e.g. one created by the legacy import, which has no token).
-- Agency owners only. Earlier unused tokens of that invitation stop working.
CREATE FUNCTION app.issue_invitation_token(p_actor text, p_tenant uuid, p_invitation uuid, p_token_sha256 text,
  p_ttl interval DEFAULT interval '48 hours')
RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  a record;
  v_inv app.invitation;
  v_expires timestamptz;
BEGIN
  SELECT * INTO a FROM app_private.actor_authority(p_actor, p_tenant);
  IF a.o_role <> 'agency-owner' THEN
    RAISE EXCEPTION 'only an agency owner can issue invitation links for existing invitations' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_inv FROM app.invitation i WHERE i.tenant_id = p_tenant AND i.id = p_invitation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such invitation' USING ERRCODE = 'ACM02'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'invitation is no longer pending' USING ERRCODE = 'ACI03'; END IF;
  v_expires := app_private.put_token(p_tenant, p_invitation, p_token_sha256, p_ttl, p_actor);
  INSERT INTO app.audit_event (tenant_id, actor, action, target_kind, target_id, detail)
  VALUES (p_tenant, p_actor, 'invitation-token-issued', 'invitation', p_invitation::text,
          jsonb_build_object('expires_at', v_expires));
  RETURN v_expires;
END $$;

-- Accepts an invitation as the signed-in person. The token must be known, unused, not replaced and unexpired; the
-- person's email must be verified and equal (case-insensitively) to the invited one. Creates exactly the invited
-- membership (no staff assignment, nothing else implicit). Concurrency-safe: the token row is locked, so of two
-- simultaneous accepts one wins and the other sees a used token.
CREATE FUNCTION app.accept_invitation(p_subject text, p_email text, p_email_verified boolean, p_token_sha256 text)
RETURNS TABLE (tenant_id uuid, workspace_id uuid, role text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_tok identity.invitation_token;
  v_inv app.invitation;
  v_tenant app.tenant;
BEGIN
  PERFORM app_private.check_subject(p_subject);
  IF p_token_sha256 IS NULL OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invitation link not recognised' USING ERRCODE = 'ACI01';
  END IF;
  SELECT * INTO v_tok FROM identity.invitation_token t WHERE t.token_sha256 = p_token_sha256 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation link not recognised' USING ERRCODE = 'ACI01'; END IF;
  IF v_tok.used_at IS NOT NULL OR v_tok.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'invitation link already used or replaced' USING ERRCODE = 'ACI03';
  END IF;
  IF v_tok.expires_at <= now() THEN RAISE EXCEPTION 'invitation link expired' USING ERRCODE = 'ACI02'; END IF;
  SELECT * INTO v_inv FROM app.invitation i WHERE i.tenant_id = v_tok.tenant_id AND i.id = v_tok.invitation_id FOR UPDATE;
  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'invitation link already used or replaced' USING ERRCODE = 'ACI03';
  END IF;
  IF p_email IS NULL OR NOT coalesce(p_email_verified, false) THEN
    RAISE EXCEPTION 'sign in with a verified email address to accept an invitation' USING ERRCODE = 'ACI05';
  END IF;
  IF lower(btrim(p_email)) <> v_inv.email THEN
    RAISE EXCEPTION 'the signed-in email address does not match the invitation' USING ERRCODE = 'ACI04';
  END IF;

  SELECT * INTO v_tenant FROM app.tenant t WHERE t.id = v_inv.tenant_id;
  IF v_inv.role IN ('client-admin', 'client-viewer') THEN
    PERFORM app_private.put_client_member(v_inv.tenant_id, p_subject, v_inv.role, v_inv.workspace_id);
  ELSE
    -- Re-checked here too: an imported invitation could name an agency role in a client tenant.
    IF v_tenant.kind <> 'agency' THEN
      RAISE EXCEPTION 'agency roles can only be granted in the agency''s own tenant' USING ERRCODE = '42501';
    END IF;
    PERFORM app_private.put_agency_member(v_tenant.agency_id, p_subject,
      CASE v_inv.role WHEN 'agency-owner' THEN 'owner' ELSE 'staff' END);
  END IF;

  UPDATE identity.invitation_token t SET used_at = now(), used_by = p_subject WHERE t.id = v_tok.id;
  UPDATE app.invitation i SET status = 'accepted' WHERE i.tenant_id = v_inv.tenant_id AND i.id = v_inv.id;
  INSERT INTO app.audit_event (tenant_id, actor, action, target_kind, target_id, detail)
  VALUES (v_inv.tenant_id, p_subject, 'invitation-accepted', 'invitation', v_inv.id::text,
          jsonb_build_object('role', v_inv.role, 'workspace', v_inv.workspace_id));
  RETURN QUERY SELECT v_inv.tenant_id, v_inv.workspace_id, v_inv.role;
END $$;

-- Changes an existing member's role (and workspace limit). Client roles change app.tenant_member; agency roles
-- change app.agency_member and only in the agency's own tenant, by an owner. Returns the previous role and the
-- tenants whose access changed (for revocation events).
CREATE FUNCTION app.set_member_role(p_actor text, p_tenant uuid, p_subject text, p_role text, p_workspace uuid DEFAULT NULL)
RETURNS TABLE (previous_role text, affected_tenants uuid[])
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  a record;
  v_refusal text;
  v_cur app.tenant_member;
  v_prev text;
  v_affected uuid[];
BEGIN
  PERFORM app_private.lock_members('tenant-members', p_tenant);
  SELECT * INTO a FROM app_private.actor_authority(p_actor, p_tenant);
  IF a.o_role NOT IN ('agency-owner', 'client-admin') THEN
    RAISE EXCEPTION 'not allowed to manage members of this tenant' USING ERRCODE = '42501';
  END IF;
  PERFORM app_private.check_subject(p_subject);
  PERFORM app_private.check_grant(p_tenant, p_role, p_workspace);
  v_refusal := app_private.grant_refusal(a.o_role, a.o_workspace, a.o_tenant_kind, p_role, p_workspace);
  IF v_refusal IS NOT NULL THEN RAISE EXCEPTION '%', v_refusal USING ERRCODE = '42501'; END IF;

  IF p_role IN ('client-admin', 'client-viewer') THEN
    SELECT * INTO v_cur FROM app.tenant_member m WHERE m.tenant_id = p_tenant AND m.subject = p_subject AND m.revoked_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'not a member of this tenant' USING ERRCODE = 'ACM02'; END IF;
    -- A workspace-limited admin manages only the members of its own workspace.
    IF a.o_role = 'client-admin' AND a.o_workspace IS NOT NULL AND v_cur.workspace_id IS DISTINCT FROM a.o_workspace THEN
      RAISE EXCEPTION 'not allowed outside your own workspace' USING ERRCODE = '42501';
    END IF;
    PERFORM app_private.put_client_member(p_tenant, p_subject, p_role, p_workspace);
    v_prev := v_cur.role;
    v_affected := ARRAY[p_tenant];
  ELSE
    SELECT 'agency-' || m.role INTO v_prev FROM app.agency_member m
    WHERE m.agency_id = a.o_agency AND m.subject = p_subject AND m.revoked_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'not a member of this agency' USING ERRCODE = 'ACM02'; END IF;
    PERFORM app_private.put_agency_member(a.o_agency, p_subject, CASE p_role WHEN 'agency-owner' THEN 'owner' ELSE 'staff' END);
    v_affected := ARRAY(SELECT t.id FROM app.tenant t WHERE t.agency_id = a.o_agency ORDER BY t.id);
  END IF;

  PERFORM app_private.clear_sessions(p_subject, v_affected);
  INSERT INTO app.audit_event (tenant_id, actor, action, target_kind, target_id, detail)
  VALUES (p_tenant, p_actor, 'member-role-changed', 'subject', p_subject,
          jsonb_build_object('from', v_prev, 'to', p_role, 'workspace', p_workspace));
  RETURN QUERY SELECT v_prev, v_affected;
END $$;

-- Removes a member from a tenant. In the agency's own tenant an owner can also remove an agency member, which ends
-- their agency membership and every staff assignment. Returns the removed role and the tenants affected.
CREATE FUNCTION app.remove_member(p_actor text, p_tenant uuid, p_subject text)
RETURNS TABLE (removed_role text, affected_tenants uuid[])
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  a record;
  v_cur app.tenant_member;
  v_agency_role text;
  v_removed text;
  v_affected uuid[];
BEGIN
  PERFORM app_private.lock_members('tenant-members', p_tenant);
  SELECT * INTO a FROM app_private.actor_authority(p_actor, p_tenant);
  -- Checked before looking the person up, so nobody without authority can probe who is a member.
  IF a.o_role NOT IN ('agency-owner', 'client-admin') THEN
    RAISE EXCEPTION 'not allowed to manage members of this tenant' USING ERRCODE = '42501';
  END IF;
  PERFORM app_private.check_subject(p_subject);

  SELECT * INTO v_cur FROM app.tenant_member m WHERE m.tenant_id = p_tenant AND m.subject = p_subject AND m.revoked_at IS NULL;
  IF FOUND THEN
    IF a.o_role = 'client-admin' AND a.o_workspace IS NOT NULL AND v_cur.workspace_id IS DISTINCT FROM a.o_workspace THEN
      RAISE EXCEPTION 'not allowed outside your own workspace' USING ERRCODE = '42501';
    END IF;
    PERFORM app_private.guard_last_admin(p_tenant, p_subject);
    UPDATE app.tenant_member m SET revoked_at = now() WHERE m.tenant_id = p_tenant AND m.subject = p_subject;
    v_removed := v_cur.role;
    v_affected := ARRAY[p_tenant];
  ELSE
    SELECT m.role INTO v_agency_role FROM app.agency_member m
    WHERE m.agency_id = a.o_agency AND m.subject = p_subject AND m.revoked_at IS NULL;
    IF NOT FOUND OR a.o_tenant_kind <> 'agency' THEN
      RAISE EXCEPTION 'not a member of this tenant' USING ERRCODE = 'ACM02';
    END IF;
    IF a.o_role <> 'agency-owner' THEN
      RAISE EXCEPTION 'only an agency owner can remove agency people' USING ERRCODE = '42501';
    END IF;
    PERFORM app_private.lock_members('agency-members', a.o_agency);
    PERFORM app_private.guard_last_owner(a.o_agency, p_subject);
    UPDATE app.agency_member m SET revoked_at = now() WHERE m.agency_id = a.o_agency AND m.subject = p_subject;
    UPDATE app.agency_assignment s SET revoked_at = now()
    WHERE s.agency_id = a.o_agency AND s.subject = p_subject AND s.revoked_at IS NULL;
    v_removed := 'agency-' || v_agency_role;
    v_affected := ARRAY(SELECT t.id FROM app.tenant t WHERE t.agency_id = a.o_agency ORDER BY t.id);
  END IF;

  PERFORM app_private.clear_sessions(p_subject, v_affected);
  INSERT INTO app.audit_event (tenant_id, actor, action, target_kind, target_id, detail)
  VALUES (p_tenant, p_actor, 'member-removed', 'subject', p_subject, jsonb_build_object('role', v_removed));
  RETURN QUERY SELECT v_removed, v_affected;
END $$;

-- Assigns agency staff to a tenant of the agency, or ends the assignment. Owners only. Returns whether anything
-- changed (assigning twice, or unassigning someone who is not assigned, changes nothing and writes no audit row).
CREATE FUNCTION app.set_assignment(p_actor text, p_tenant uuid, p_subject text, p_assigned boolean)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  a record;
  v_n int;
BEGIN
  SELECT * INTO a FROM app_private.actor_authority(p_actor, p_tenant);
  IF a.o_role <> 'agency-owner' THEN
    RAISE EXCEPTION 'only an agency owner can assign staff' USING ERRCODE = '42501';
  END IF;
  PERFORM app_private.check_subject(p_subject);
  IF p_assigned IS NULL THEN RAISE EXCEPTION 'invalid assignment' USING ERRCODE = '22023'; END IF;
  IF p_assigned THEN
    IF NOT EXISTS (SELECT 1 FROM app.agency_member m WHERE m.agency_id = a.o_agency AND m.subject = p_subject
                     AND m.role = 'staff' AND m.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'not a staff member of this agency' USING ERRCODE = 'ACM02';
    END IF;
    INSERT INTO app.agency_assignment AS s (agency_id, tenant_id, subject) VALUES (a.o_agency, p_tenant, p_subject)
    ON CONFLICT (tenant_id, subject) DO UPDATE SET revoked_at = NULL WHERE s.revoked_at IS NOT NULL;
  ELSE
    UPDATE app.agency_assignment s SET revoked_at = now()
    WHERE s.tenant_id = p_tenant AND s.subject = p_subject AND s.revoked_at IS NULL;
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN false; END IF;
  IF NOT p_assigned THEN PERFORM app_private.clear_sessions(p_subject, ARRAY[p_tenant]); END IF;
  INSERT INTO app.audit_event (tenant_id, actor, action, target_kind, target_id, detail)
  VALUES (p_tenant, p_actor, CASE WHEN p_assigned THEN 'staff-assigned' ELSE 'staff-unassigned' END, 'subject', p_subject, '{}');
  RETURN true;
END $$;

-- ───────────────────────── Ownership and execute rights ─────────────────────────
REVOKE ALL ON FUNCTION
  app_private.check_subject(text), app_private.lock_members(text, uuid), app_private.actor_authority(text, uuid),
  app_private.grant_refusal(text, uuid, text, text, uuid), app_private.check_grant(uuid, text, uuid),
  app_private.guard_last_admin(uuid, text), app_private.guard_last_owner(uuid, text),
  app_private.put_client_member(uuid, text, text, uuid), app_private.put_agency_member(uuid, text, text),
  app_private.clear_sessions(text, uuid[]), app_private.put_token(uuid, uuid, text, interval, text),
  app.list_memberships(text), app.create_invitation(text, uuid, text, text, uuid, text, interval),
  app.issue_invitation_token(text, uuid, uuid, text, interval), app.accept_invitation(text, text, boolean, text),
  app.set_member_role(text, uuid, text, text, uuid), app.remove_member(text, uuid, text),
  app.set_assignment(text, uuid, text, boolean)
FROM PUBLIC;
ALTER FUNCTION app_private.check_subject(text) OWNER TO agentcity_scope;
ALTER FUNCTION app_private.lock_members(text, uuid) OWNER TO agentcity_scope;
ALTER FUNCTION app_private.actor_authority(text, uuid) OWNER TO agentcity_scope;
ALTER FUNCTION app_private.grant_refusal(text, uuid, text, text, uuid) OWNER TO agentcity_scope;
ALTER FUNCTION app_private.check_grant(uuid, text, uuid) OWNER TO agentcity_scope;
ALTER FUNCTION app_private.guard_last_admin(uuid, text) OWNER TO agentcity_scope;
ALTER FUNCTION app_private.guard_last_owner(uuid, text) OWNER TO agentcity_scope;
ALTER FUNCTION app_private.put_client_member(uuid, text, text, uuid) OWNER TO agentcity_scope;
ALTER FUNCTION app_private.put_agency_member(uuid, text, text) OWNER TO agentcity_scope;
ALTER FUNCTION app_private.clear_sessions(text, uuid[]) OWNER TO agentcity_scope;
ALTER FUNCTION app_private.put_token(uuid, uuid, text, interval, text) OWNER TO agentcity_scope;
ALTER FUNCTION app.list_memberships(text) OWNER TO agentcity_scope;
ALTER FUNCTION app.create_invitation(text, uuid, text, text, uuid, text, interval) OWNER TO agentcity_scope;
ALTER FUNCTION app.issue_invitation_token(text, uuid, uuid, text, interval) OWNER TO agentcity_scope;
ALTER FUNCTION app.accept_invitation(text, text, boolean, text) OWNER TO agentcity_scope;
ALTER FUNCTION app.set_member_role(text, uuid, text, text, uuid) OWNER TO agentcity_scope;
ALTER FUNCTION app.remove_member(text, uuid, text) OWNER TO agentcity_scope;
ALTER FUNCTION app.set_assignment(text, uuid, text, boolean) OWNER TO agentcity_scope;

-- What the scope role needs to make these writes. The app role gets nothing new on these tables.
GRANT USAGE ON SCHEMA identity TO agentcity_scope;
GRANT SELECT, INSERT, UPDATE ON identity.invitation_token TO agentcity_scope;
GRANT SELECT (id, subject, tenant_id, workspace_id, revoked_at), UPDATE (tenant_id, workspace_id) ON identity.session TO agentcity_scope;
GRANT SELECT, INSERT, UPDATE ON app.invitation TO agentcity_scope;
GRANT INSERT, UPDATE ON app.tenant_member, app.agency_member, app.agency_assignment TO agentcity_scope;
GRANT INSERT ON app.outbox_event TO agentcity_scope;
GRANT USAGE ON SEQUENCE app.outbox_event_id_seq TO agentcity_scope;
GRANT EXECUTE ON FUNCTION
  app.list_memberships(text), app.create_invitation(text, uuid, text, text, uuid, text, interval),
  app.issue_invitation_token(text, uuid, uuid, text, interval), app.accept_invitation(text, text, boolean, text),
  app.set_member_role(text, uuid, text, text, uuid), app.remove_member(text, uuid, text),
  app.set_assignment(text, uuid, text, boolean)
TO agentcity_app;

INSERT INTO platform.table_classification (table_schema, table_name, class, immutable, note) VALUES
  ('identity', 'invitation_token', 'private', false,
   'Invitation token hashes; reached only through the access SECURITY DEFINER functions (no app-role grant).');

-- Down Migration
DROP FUNCTION app.set_assignment(text, uuid, text, boolean);
DROP FUNCTION app.remove_member(text, uuid, text);
DROP FUNCTION app.set_member_role(text, uuid, text, text, uuid);
DROP FUNCTION app.accept_invitation(text, text, boolean, text);
DROP FUNCTION app.issue_invitation_token(text, uuid, uuid, text, interval);
DROP FUNCTION app.create_invitation(text, uuid, text, text, uuid, text, interval);
DROP FUNCTION app.list_memberships(text);
DROP FUNCTION app_private.put_token(uuid, uuid, text, interval, text);
DROP FUNCTION app_private.clear_sessions(text, uuid[]);
DROP FUNCTION app_private.put_agency_member(uuid, text, text);
DROP FUNCTION app_private.put_client_member(uuid, text, text, uuid);
DROP FUNCTION app_private.guard_last_owner(uuid, text);
DROP FUNCTION app_private.guard_last_admin(uuid, text);
DROP FUNCTION app_private.check_grant(uuid, text, uuid);
DROP FUNCTION app_private.grant_refusal(text, uuid, text, text, uuid);
DROP FUNCTION app_private.actor_authority(text, uuid);
DROP FUNCTION app_private.lock_members(text, uuid);
DROP FUNCTION app_private.check_subject(text);
DELETE FROM platform.table_classification WHERE table_schema = 'identity' AND table_name = 'invitation_token';
DROP TABLE identity.invitation_token;
REVOKE USAGE ON SEQUENCE app.outbox_event_id_seq FROM agentcity_scope;
REVOKE INSERT ON app.outbox_event FROM agentcity_scope;
REVOKE INSERT, UPDATE ON app.tenant_member, app.agency_member, app.agency_assignment FROM agentcity_scope;
REVOKE SELECT, INSERT, UPDATE ON app.invitation FROM agentcity_scope;
REVOKE SELECT (id, subject, tenant_id, workspace_id, revoked_at), UPDATE (tenant_id, workspace_id) ON identity.session FROM agentcity_scope;
REVOKE USAGE ON SCHEMA identity FROM agentcity_scope;
