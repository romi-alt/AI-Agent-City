-- Up Migration
-- X01 workstream C: the demo funnel (planning/agentcity-migration/x01-cinematic-city/PLAN.md, decisions 4–6).
--
-- A visitor asks for a demo → a lead is stored (marketing.lead, personal data) → the visitor gets their own demo
-- tenant (kind 'demo', under the platform agency "AgentCity demos") with one workspace, a demo profile with a
-- simulated agent team and safe sample data, and a pending client-admin invitation for their email address. After
-- Keycloak has verified the address and the visitor has signed in, app.claim_demo accepts that invitation. After
-- DEMO_TTL_DAYS app.expire_demos ends the access and removes the demo data.
--
-- Every write goes through the SECURITY DEFINER functions below, owned by agentcity_scope with a fixed search_path,
-- not executable by PUBLIC, and executable by the app role only. The app role has no access to schema marketing.
-- No placement is created: demos are shown on a Rental Building 2 floor visually only (PLAN decision 6).
--
-- Error codes (SQLSTATE), in addition to the access migration's:
--   22023 invalid input        42501 not allowed
--   DEM01 no demo for this email address          DEM02 the demo has expired
--   ACI03 the demo was already claimed by someone else    ACI05 signed-in email not verified
--
-- What expiry removes and what it keeps (app.expire_demos):
--   removed: the demo profile (agents, first name, company), sample and visitor-created contacts, notes,
--            opportunities, content items, schedules, suppressions and external ids (where no immutable record still
--            points at them), the invitation (it holds the email address) and its tokens;
--   ended:   every client membership of the demo tenant (revoked_at), and sessions pointing into it;
--   kept:    the tenant and workspace rows (no personal data; immutable rows reference them), immutable facts
--            (app.message_evidence marked 'simulated', app.audit_event without email addresses, and any immutable
--            row the visitor created: consent events, stage events, draft revisions, approvals), and the lead itself,
--            marked 'expired' (it is the marketing record, kept under the consent it was given; deleting personal data
--            on request is a separate erasure process).

-- ───────────────────────── Platform agency for demos ─────────────────────────
CREATE SCHEMA marketing;
REVOKE ALL ON SCHEMA marketing FROM PUBLIC;
GRANT USAGE ON SCHEMA marketing TO agentcity_scope;

-- Which agency owns the demo tenants. Its owners (app.agency_member role 'owner') are the platform owners who may
-- read the lead list. Created here; owners are added by an administrator.
CREATE TABLE marketing.settings (
  id int PRIMARY KEY CHECK (id = 1),
  demo_agency_id uuid NOT NULL REFERENCES app.agency
);
WITH a AS (INSERT INTO app.agency (id, name) VALUES (gen_random_uuid(), 'AgentCity demos') RETURNING id)
INSERT INTO marketing.settings (id, demo_agency_id) SELECT 1, id FROM a;

-- Demo offices are assigned round-robin over the 12 floors of Rental Building 2 (visual only, no placement).
CREATE SEQUENCE marketing.demo_office_seq MINVALUE 1 MAXVALUE 12 START 1 CYCLE;

-- ───────────────────────── Leads (personal data) ─────────────────────────
CREATE TABLE marketing.lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE
    CHECK (email = lower(email) AND length(email) <= 320 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  full_name text NOT NULL CHECK (length(full_name) BETWEEN 1 AND 200),
  company text NOT NULL CHECK (length(company) BETWEEN 1 AND 200),
  industry text CHECK (length(industry) <= 100),
  phone text CHECK (length(phone) <= 40),
  website text CHECK (length(website) <= 300),
  -- The visitor's marketing choice (true or false), when it was recorded, and which privacy notice they saw.
  marketing_consent boolean NOT NULL,
  consent_recorded_at timestamptz NOT NULL,
  consent_notice_version text NOT NULL CHECK (length(consent_notice_version) BETWEEN 1 AND 64),
  -- utmSource, utmMedium, utmCampaign, utmTerm, utmContent, referrerHost (strings only; the API filters them).
  attribution jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attribution) = 'object'),
  status text NOT NULL CHECK (status IN ('verification-sent', 'ready', 'expired')),
  demo_tenant_id uuid NOT NULL,
  demo_workspace_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  provisioned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  claimed_by text,
  expired_at timestamptz,
  CHECK ((claimed_at IS NULL) = (claimed_by IS NULL)),
  CHECK ((status = 'expired') = (expired_at IS NOT NULL)),
  FOREIGN KEY (demo_tenant_id, demo_workspace_id) REFERENCES app.workspace (tenant_id, id)
);
CREATE INDEX lead_created ON marketing.lead (created_at DESC, id DESC);
CREATE INDEX lead_expiry ON marketing.lead (expires_at) WHERE status <> 'expired';

-- One row per accepted form submission. Its id is the public, unguessable request id. A submission for an email
-- whose demo was already claimed is a "shadow" request: its status never reveals that the address is known.
CREATE TABLE marketing.demo_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES marketing.lead,
  demo_tenant_id uuid NOT NULL REFERENCES app.tenant,
  -- SHA-256 of (form token, email): a double-submitted form returns the first request instead of a second one.
  idempotency_sha256 text NOT NULL UNIQUE CHECK (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  shadow boolean NOT NULL,
  shadow_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (shadow = (shadow_expires_at IS NOT NULL))
);
CREATE INDEX demo_request_lead ON marketing.demo_request (lead_id);

-- ───────────────────────── Demo profile (tenant-owned) ─────────────────────────
-- Welcome and office data for a demo tenant: the visitor's first name and company, the visual office, and the
-- simulated agent team. Everything in `agents` and `activity` is labelled simulated.
CREATE TABLE app.demo_profile (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  company text NOT NULL,
  first_name text NOT NULL,
  industry text,
  building_key text NOT NULL DEFAULT 'rental-2' CHECK (building_key = 'rental-2'),
  office_level int NOT NULL CHECK (office_level BETWEEN 1 AND 99),
  agents jsonb NOT NULL CHECK (jsonb_typeof(agents) = 'array'),
  activity jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(activity) = 'array'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, workspace_id),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES app.workspace (tenant_id, id)
);

-- A demo profile belongs to a demo tenant only.
CREATE FUNCTION app_private.guard_demo_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF (SELECT kind FROM app.tenant WHERE id = NEW.tenant_id) IS DISTINCT FROM 'demo' THEN
    RAISE EXCEPTION 'a demo profile can only belong to a demo tenant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER demo_only BEFORE INSERT OR UPDATE ON app.demo_profile FOR EACH ROW EXECUTE FUNCTION app_private.guard_demo_profile();

-- The standard tenant protection (as app_private.protect did in the tenancy migration): forced RLS on the scope,
-- restrictive write policies, read-only grant. Writes happen only in the definer functions.
ALTER TABLE app.demo_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.demo_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.demo_profile
  USING (tenant_id = (SELECT app.current_tenant_id()) AND ((SELECT app.current_workspace_id()) IS NULL OR workspace_id = (SELECT app.current_workspace_id())))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()) AND ((SELECT app.current_workspace_id()) IS NULL OR workspace_id = (SELECT app.current_workspace_id())));
CREATE POLICY writable_insert ON app.demo_profile AS RESTRICTIVE FOR INSERT WITH CHECK ((SELECT app.current_can_write()));
CREATE POLICY writable_update ON app.demo_profile AS RESTRICTIVE FOR UPDATE USING ((SELECT app.current_can_write()));
CREATE POLICY writable_delete ON app.demo_profile AS RESTRICTIVE FOR DELETE USING ((SELECT app.current_can_write()));
GRANT SELECT ON app.demo_profile TO agentcity_app;

-- ───────────────────────── Private helpers ─────────────────────────
CREATE FUNCTION app_private.demo_agency() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT s.demo_agency_id FROM marketing.settings s WHERE s.id = 1
$$;

-- A token hash nobody holds the token for: the demo invitation is accepted by app.claim_demo after the email
-- address was verified by the identity provider, never through an invitation link.
CREATE FUNCTION app_private.unusable_token_hash() RETURNS text
LANGUAGE sql VOLATILE SET search_path = pg_catalog, pg_temp AS $$
  SELECT encode(sha256(public.gen_random_bytes(32)), 'hex')
$$;

-- The simulated agent team and sample records of a new demo. Roles are catalog AI roles (catalog.agent_template)
-- and names are catalog AI persona names; every record says it is simulated. Sample people are "Sample …" at
-- example.test; opportunities have no value (values need a verified source); nothing is published or sent.
CREATE FUNCTION app_private.seed_demo(p_tenant uuid, p_ws uuid, p_company text, p_first_name text)
RETURNS TABLE (o_agents jsonb, o_activity jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_prov jsonb := jsonb_build_object('source', 'demo-funnel', 'simulated', true);
  v_contacts uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_agents jsonb;
  v_activity jsonb;
BEGIN
  WITH roster (ord, role, name, status, summary, tasks, talk_with, talk_channel, talk_in, talk_out) AS (VALUES
    (1, 'web leads', 'Wren', 'working',
     format('Replies to %s''s website enquiries within minutes and books the first call.', p_company),
     ARRAY['Replied to a new website enquiry from Sample Jordan Lee', 'Qualified two enquiries from last night', 'Booked a call for tomorrow 10:00'],
     'Sample Jordan Lee', 'email', 'Hi, is the offer on your website still available?', 'Hi Jordan, yes it is. Would tomorrow at 10:00 suit you for a quick call?'),
    (2, 'chat', 'Nora', 'working',
     'Answers chat questions day and night and hands warm conversations to the team.',
     ARRAY['Answered 6 chat questions', 'Handed one hot lead to Vera', 'Updated the opening-hours answer'],
     'Sample Priya Shah', 'chat', 'Do you have anything available this weekend?', 'Yes, Saturday morning is open. Shall I reserve a slot for you?'),
    (3, 'follow-up', 'Kai', 'reviewing',
     'Follows up with quiet prospects so nobody is forgotten.',
     ARRAY['Drafted follow-ups for 4 quiet prospects', 'Waiting for your approval on 2 drafts', 'Closed one stale conversation'],
     'Sample Alex Morgan', 'email', 'Sorry, I have been busy. Still interested though.', 'No problem, Alex. Here is a short summary so you can pick up where we left off.'),
    (4, 'closer', 'Vera', 'working',
     'Prepares proposals and next steps for prospects who are ready to decide.',
     ARRAY['Prepared a proposal outline for Sample Sam Rivera', 'Listed open questions before signing', 'Scheduled a decision call'],
     'Sample Sam Rivera', 'phone', 'Can you send the details before our call?', 'Of course. I have put the options and the next steps in one page for you.'),
    (5, 'CSI', 'Hana', 'idle',
     'Checks in after every visit and turns feedback into improvements.',
     ARRAY['Sent 3 satisfaction check-ins (simulated)', 'Summarised this week''s feedback', 'Flagged one unhappy customer for a call'],
     'Sample Chris Novak', 'text', 'Everything went well, thank you!', 'Great to hear, Chris. Thanks for letting us know.'),
    (6, 'service visits', 'Dex', 'working',
     'Reminds customers about upcoming visits and fills empty slots.',
     ARRAY['Reminded 5 customers about next week''s visits', 'Filled a cancelled slot', 'Updated the visit calendar'],
     'Sample Taylor Brooks', 'email', 'Can I move my visit to Friday?', 'Done, Taylor. You are booked for Friday at 14:00.'),
    (7, 'content', 'Luna', 'reviewing',
     format('Plans and drafts social posts for %s; nothing is published without your approval.', p_company),
     ARRAY['Drafted 3 posts for next week', 'Suggested a customer-story idea', 'Waiting for your approval before anything goes live'],
     'Sample Jordan Lee', 'social', 'Love your last post!', 'Thank you, Jordan! More stories coming soon.'),
    (8, 'reviews', 'Rio', 'idle',
     'Thanks happy customers for reviews and drafts careful replies to critical ones.',
     ARRAY['Drafted replies to 2 new reviews', 'Asked 3 happy customers for a review (simulated)', 'Reported the weekly rating trend'],
     'Sample Morgan Ellis', 'review', 'Friendly team, quick answers.', 'Thank you, Morgan. We are glad we could help.')
  ), agents AS (
    SELECT r.*, gen_random_uuid() AS id FROM roster r
  )
  SELECT
    jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'role', a.role, 'status', a.status, 'summary', a.summary, 'simulated', true,
      'tasks', (SELECT jsonb_agg(jsonb_build_object(
                  'title', t.title,
                  'status', CASE t.n WHEN 1 THEN 'done' WHEN 2 THEN 'done' ELSE 'in-progress' END,
                  'at', now() - make_interval(mins => (a.ord * 37 + (4 - t.n) * 53)::int),
                  'simulated', true) ORDER BY t.n)
                FROM unnest(a.tasks) WITH ORDINALITY AS t(title, n)),
      'conversations', jsonb_build_array(jsonb_build_object(
        'with', a.talk_with, 'channel', a.talk_channel, 'simulated', true,
        'messages', jsonb_build_array(
          jsonb_build_object('from', 'contact', 'text', a.talk_in, 'at', now() - make_interval(mins => (a.ord * 41 + 30)::int)),
          jsonb_build_object('from', 'agent', 'text', a.talk_out, 'at', now() - make_interval(mins => (a.ord * 41 + 25)::int)))))
    ) ORDER BY a.ord),
    jsonb_agg(jsonb_build_object(
      'at', now() - make_interval(mins => (a.ord * 37 + 53)::int), 'agentId', a.id,
      'text', format('%s (%s): %s', a.name, a.role, a.tasks[3]), 'simulated', true) ORDER BY a.ord)
  INTO v_agents, v_activity
  FROM agents a;

  INSERT INTO app.contact (tenant_id, workspace_id, id, display_name, email, phone, kind, source, interest, provenance) VALUES
    (p_tenant, p_ws, v_contacts[1], 'Sample Jordan Lee', 'jordan.lee@example.test', NULL, 'customer', 'demo-sample', 'Website enquiry', v_prov),
    (p_tenant, p_ws, v_contacts[2], 'Sample Priya Shah', 'priya.shah@example.test', NULL, 'customer', 'demo-sample', 'Weekend availability', v_prov),
    (p_tenant, p_ws, v_contacts[3], 'Sample Alex Morgan', 'alex.morgan@example.test', NULL, 'customer', 'demo-sample', 'Follow-up', v_prov),
    (p_tenant, p_ws, v_contacts[4], 'Sample Sam Rivera', 'sam.rivera@example.test', NULL, 'customer', 'demo-sample', 'Proposal', v_prov),
    (p_tenant, p_ws, v_contacts[5], 'Sample Chris Novak', 'chris.novak@example.test', NULL, 'customer', 'demo-sample', 'Feedback', v_prov),
    (p_tenant, p_ws, v_contacts[6], 'Sample Taylor Brooks', 'taylor.brooks@example.test', NULL, 'customer', 'demo-sample', 'Visit booking', v_prov);
  INSERT INTO app.opportunity (tenant_id, workspace_id, id, contact_id, stage, value_cents, value_source, provenance) VALUES
    (p_tenant, p_ws, gen_random_uuid(), v_contacts[1], 'new', NULL, NULL, v_prov),
    (p_tenant, p_ws, gen_random_uuid(), v_contacts[3], 'qualified', NULL, NULL, v_prov),
    (p_tenant, p_ws, gen_random_uuid(), v_contacts[4], 'proposal', NULL, NULL, v_prov);
  INSERT INTO app.note (tenant_id, workspace_id, id, contact_id, body, created_by, provenance) VALUES
    (p_tenant, p_ws, gen_random_uuid(), v_contacts[1], 'Simulated note: prefers a call in the morning.', 'demo-agent:Wren', v_prov),
    (p_tenant, p_ws, gen_random_uuid(), v_contacts[3], 'Simulated note: asked for a short summary before deciding.', 'demo-agent:Kai', v_prov),
    (p_tenant, p_ws, gen_random_uuid(), v_contacts[4], 'Simulated note: decision expected after the call.', 'demo-agent:Vera', v_prov),
    (p_tenant, p_ws, gen_random_uuid(), NULL, format('Simulated note: welcome to the %s demo office, %s.', p_company, p_first_name), 'demo-agent:Nora', v_prov);
  INSERT INTO app.content_item (tenant_id, workspace_id, id, platform, format, topic, caption, status, provenance) VALUES
    (p_tenant, p_ws, gen_random_uuid(), 'instagram', 'post', 'Customer story', 'Sample caption: how we helped a customer this week.', 'draft', v_prov),
    (p_tenant, p_ws, gen_random_uuid(), 'facebook', 'post', 'Weekend opening hours', 'Sample caption: we are open on Saturday morning.', 'needs-approval', v_prov),
    (p_tenant, p_ws, gen_random_uuid(), 'linkedin', 'article', 'Meet the team', NULL, 'idea', v_prov);
  -- Simulated message history. Immutable by design, so it points at no contact (contacts are removed at expiry).
  INSERT INTO app.message_evidence (tenant_id, workspace_id, id, contact_id, channel, recipient, subject, body, legacy_status, verification, occurred_at, provenance) VALUES
    (p_tenant, p_ws, gen_random_uuid(), NULL, 'email', 'jordan.lee@example.test', 'Your enquiry', 'Simulated message: Hi Jordan, would tomorrow at 10:00 suit you for a quick call?', 'simulated', 'simulated', now() - interval '3 hours', v_prov),
    (p_tenant, p_ws, gen_random_uuid(), NULL, 'text', 'sample-phone', NULL, 'Simulated message: Thanks for your visit, Chris!', 'simulated', 'simulated', now() - interval '5 hours', v_prov),
    (p_tenant, p_ws, gen_random_uuid(), NULL, 'email', 'alex.morgan@example.test', 'Picking up where we left off', 'Simulated message: Here is a short summary, Alex.', 'simulated', 'simulated', now() - interval '1 day', v_prov),
    (p_tenant, p_ws, gen_random_uuid(), NULL, 'email', 'taylor.brooks@example.test', 'Visit moved to Friday', 'Simulated message: You are booked for Friday at 14:00.', 'simulated', 'simulated', now() - interval '2 days', v_prov);

  RETURN QUERY SELECT v_agents, v_activity;
END $$;

-- A new demo tenant, workspace, profile, sample data and pending client-admin invitation for the email address.
CREATE FUNCTION app_private.provision_demo(p_email text, p_company text, p_first_name text, p_industry text,
  p_demo_ttl interval, p_invitation_ttl interval, OUT o_tenant uuid, OUT o_workspace uuid, OUT o_expires timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_level int := nextval('marketing.demo_office_seq')::int;
  v_inv uuid := gen_random_uuid();
  s record;
BEGIN
  o_tenant := gen_random_uuid();
  o_workspace := gen_random_uuid();
  o_expires := now() + p_demo_ttl;
  -- The tenant name is shown in tenant pickers; it holds no personal data (company and name live in the profile).
  INSERT INTO app.tenant (id, agency_id, name, kind) VALUES (o_tenant, app_private.demo_agency(), 'AgentCity demo', 'demo');
  INSERT INTO app.workspace (tenant_id, id, name, kind) VALUES (o_tenant, o_workspace, 'Demo office', 'demo');
  SELECT * INTO s FROM app_private.seed_demo(o_tenant, o_workspace, p_company, p_first_name);
  INSERT INTO app.demo_profile (tenant_id, workspace_id, company, first_name, industry, office_level, agents, activity, expires_at)
  VALUES (o_tenant, o_workspace, p_company, p_first_name, p_industry, v_level, s.o_agents, s.o_activity, o_expires);
  INSERT INTO app.invitation (tenant_id, id, email, role, workspace_id, provenance)
  VALUES (o_tenant, v_inv, p_email, 'client-admin', NULL, jsonb_build_object('source', 'demo-funnel'));
  PERFORM app_private.put_token(o_tenant, v_inv, app_private.unusable_token_hash(), p_invitation_ttl, 'demo-funnel');
  -- No email address in immutable records: the audit trail names the invitation, not the person.
  INSERT INTO app.audit_event (tenant_id, actor, action, target_kind, target_id, detail)
  VALUES (o_tenant, 'demo-funnel', 'demo-provisioned', 'invitation', v_inv::text,
          jsonb_build_object('expires_at', o_expires, 'office_level', v_level));
END $$;

-- Ends one demo: memberships, sessions, invitation and data (see the header for what is kept). Returns the people
-- whose access ended, so callers can disconnect their live sockets.
CREATE FUNCTION app_private.expire_lead(p_lead uuid) RETURNS text[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_lead marketing.lead;
  v_t uuid;
  v_subjects text[];
  v_subject text;
BEGIN
  SELECT * INTO v_lead FROM marketing.lead l WHERE l.id = p_lead FOR UPDATE;
  IF NOT FOUND OR v_lead.status = 'expired' THEN RETURN ARRAY[]::text[]; END IF;
  v_t := v_lead.demo_tenant_id;
  PERFORM app_private.lock_members('tenant-members', v_t);

  WITH revoked AS (
    UPDATE app.tenant_member m SET revoked_at = now() WHERE m.tenant_id = v_t AND m.revoked_at IS NULL RETURNING m.subject
  ) SELECT coalesce(array_agg(subject ORDER BY subject), ARRAY[]::text[]) INTO v_subjects FROM revoked;
  FOREACH v_subject IN ARRAY v_subjects LOOP
    PERFORM app_private.clear_sessions(v_subject, ARRAY[v_t]);
  END LOOP;
  UPDATE app.agency_assignment a SET revoked_at = now() WHERE a.tenant_id = v_t AND a.revoked_at IS NULL;

  DELETE FROM identity.invitation_token t WHERE t.tenant_id = v_t;
  DELETE FROM app.invitation i WHERE i.tenant_id = v_t;
  DELETE FROM app.demo_profile p WHERE p.tenant_id = v_t;
  DELETE FROM app.note n WHERE n.tenant_id = v_t;
  DELETE FROM app.contact_external_id x WHERE x.tenant_id = v_t;
  DELETE FROM app.suppression s WHERE s.tenant_id = v_t;
  DELETE FROM app.schedule s WHERE s.tenant_id = v_t;
  DELETE FROM app.content_item c WHERE c.tenant_id = v_t;
  DELETE FROM app.opportunity o WHERE o.tenant_id = v_t
    AND NOT EXISTS (SELECT 1 FROM app.opportunity_stage_event e WHERE e.tenant_id = v_t AND e.opportunity_id = o.id);
  DELETE FROM app.contact c WHERE c.tenant_id = v_t
    AND NOT EXISTS (SELECT 1 FROM app.opportunity o WHERE o.tenant_id = v_t AND o.contact_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM app.consent_event e WHERE e.tenant_id = v_t AND e.contact_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM app.draft_revision d WHERE d.tenant_id = v_t AND d.contact_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM app.message_evidence m WHERE m.tenant_id = v_t AND m.contact_id = c.id);

  UPDATE marketing.lead l SET status = 'expired', expired_at = now() WHERE l.id = p_lead;
  INSERT INTO app.audit_event (tenant_id, actor, action, target_kind, target_id, detail)
  VALUES (v_t, 'demo-funnel', 'demo-expired', 'tenant', v_t::text, jsonb_build_object('members_revoked', cardinality(v_subjects)));
  RETURN v_subjects;
END $$;

-- ───────────────────────── Public functions (EXECUTE: agentcity_app) ─────────────────────────
-- Stores a demo request. The same email address always maps to the same lead, and to the same demo tenant while
-- that demo has not expired; an expired (or past-expiry) demo is ended and replaced by a fresh one. Resubmitting
-- never changes an active lead's personal data (anyone can type any address into the form). A replay of the same
-- form submission (same idempotency hash) returns the first request and asks for no new email.
-- send_verification: whether the caller should (re)send the verification email; false once the demo was claimed.
CREATE FUNCTION app.submit_demo_request(p_email text, p_full_name text, p_company text, p_industry text,
  p_phone text, p_website text, p_marketing_consent boolean, p_consent_notice_version text, p_attribution jsonb,
  p_idempotency_sha256 text, p_demo_ttl interval, p_invitation_ttl interval)
RETURNS TABLE (request_id uuid, lead_id uuid, demo_tenant_id uuid, send_verification boolean, replayed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_email text := lower(btrim(p_email));
  v_name text := btrim(p_full_name);
  v_company text := btrim(p_company);
  v_first text;
  v_lead marketing.lead;
  v_req marketing.demo_request;
  v_prov record;
  v_shadow boolean := false;
  v_send boolean := false;
  v_inv uuid;
BEGIN
  IF v_email IS NULL OR length(v_email) > 320 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'invalid email address' USING ERRCODE = '22023';
  END IF;
  IF v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 200 OR v_company IS NULL OR length(v_company) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'name and company are required' USING ERRCODE = '22023';
  END IF;
  IF p_marketing_consent IS NULL OR coalesce(length(p_consent_notice_version), 0) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'the consent choice and notice version are required' USING ERRCODE = '22023';
  END IF;
  IF p_attribution IS NOT NULL AND jsonb_typeof(p_attribution) <> 'object' THEN
    RAISE EXCEPTION 'invalid attribution' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_sha256 IS NULL OR p_idempotency_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid idempotency hash' USING ERRCODE = '22023';
  END IF;
  IF p_demo_ttl IS NULL OR p_demo_ttl < interval '1 hour' OR p_demo_ttl > interval '90 days' THEN
    RAISE EXCEPTION 'invalid demo lifetime' USING ERRCODE = '22023';
  END IF;
  v_first := (regexp_split_to_array(v_name, '[[:space:]]+'))[1];

  -- One submission at a time per address, so two concurrent forms cannot create two demos.
  PERFORM pg_advisory_xact_lock(hashtextextended('agentcity:demo-lead:' || v_email, 0));

  SELECT * INTO v_req FROM marketing.demo_request r WHERE r.idempotency_sha256 = p_idempotency_sha256;
  IF FOUND THEN
    RETURN QUERY SELECT v_req.id, v_req.lead_id, v_req.demo_tenant_id, false, true;
    RETURN;
  END IF;

  SELECT * INTO v_lead FROM marketing.lead l WHERE l.email = v_email FOR UPDATE;
  IF FOUND AND v_lead.status <> 'expired' AND v_lead.expires_at <= now() THEN
    -- Past its expiry but the expiry job has not run yet: end it now, then start a fresh demo.
    PERFORM app_private.expire_lead(v_lead.id);
    SELECT * INTO v_lead FROM marketing.lead l WHERE l.id = v_lead.id;
  END IF;

  IF NOT FOUND THEN
    SELECT * INTO v_prov FROM app_private.provision_demo(v_email, v_company, v_first, nullif(btrim(p_industry), ''),
                                                         p_demo_ttl, p_invitation_ttl);
    INSERT INTO marketing.lead AS l (email, full_name, company, industry, phone, website, marketing_consent,
      consent_recorded_at, consent_notice_version, attribution, status, demo_tenant_id, demo_workspace_id, expires_at)
    VALUES (v_email, v_name, v_company, nullif(btrim(p_industry), ''), nullif(btrim(p_phone), ''), nullif(btrim(p_website), ''),
      p_marketing_consent, now(), p_consent_notice_version, coalesce(p_attribution, '{}'), 'verification-sent',
      v_prov.o_tenant, v_prov.o_workspace, v_prov.o_expires)
    RETURNING * INTO v_lead;
    v_send := true;
  ELSIF v_lead.status = 'expired' THEN
    -- A returning visitor after expiry: a new demo, and the new submission's details and consent choice.
    SELECT * INTO v_prov FROM app_private.provision_demo(v_email, v_company, v_first, nullif(btrim(p_industry), ''),
                                                         p_demo_ttl, p_invitation_ttl);
    UPDATE marketing.lead l SET full_name = v_name, company = v_company, industry = nullif(btrim(p_industry), ''),
      phone = nullif(btrim(p_phone), ''), website = nullif(btrim(p_website), ''), marketing_consent = p_marketing_consent,
      consent_recorded_at = now(), consent_notice_version = p_consent_notice_version,
      attribution = coalesce(p_attribution, '{}'), status = 'verification-sent', demo_tenant_id = v_prov.o_tenant,
      demo_workspace_id = v_prov.o_workspace, provisioned_at = now(), expires_at = v_prov.o_expires,
      claimed_at = NULL, claimed_by = NULL, expired_at = NULL
    WHERE l.id = v_lead.id
    RETURNING * INTO v_lead;
    v_send := true;
  ELSIF v_lead.status = 'ready' THEN
    -- Already claimed: nothing new is sent, and the request's status will not reveal that the address is known.
    v_shadow := true;
  ELSE
    -- Still waiting for verification: send again, with a usable invitation token behind it.
    v_send := true;
    SELECT i.id INTO v_inv FROM app.invitation i
    WHERE i.tenant_id = v_lead.demo_tenant_id AND i.email = v_email AND i.status = 'pending';
    IF FOUND AND NOT EXISTS (
      SELECT 1 FROM identity.invitation_token t WHERE t.tenant_id = v_lead.demo_tenant_id AND t.invitation_id = v_inv
        AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at > now()) THEN
      PERFORM app_private.put_token(v_lead.demo_tenant_id, v_inv, app_private.unusable_token_hash(), p_invitation_ttl, 'demo-funnel');
    END IF;
  END IF;

  INSERT INTO marketing.demo_request (lead_id, demo_tenant_id, idempotency_sha256, shadow, shadow_expires_at)
  VALUES (v_lead.id, v_lead.demo_tenant_id, p_idempotency_sha256, v_shadow, CASE WHEN v_shadow THEN now() + p_demo_ttl END)
  RETURNING * INTO v_req;
  RETURN QUERY SELECT v_req.id, v_lead.id, v_lead.demo_tenant_id, v_send, false;
END $$;

-- The public status of a request: 'verification-sent' | 'ready' | 'expired', or NULL for an unknown id. No personal
-- data. 'ready' means the demo was claimed after this request was made.
CREATE FUNCTION app.demo_request_status(p_request uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_req marketing.demo_request;
  v_lead marketing.lead;
BEGIN
  SELECT * INTO v_req FROM marketing.demo_request r WHERE r.id = p_request;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_req.shadow THEN
    RETURN CASE WHEN v_req.shadow_expires_at <= now() THEN 'expired' ELSE 'verification-sent' END;
  END IF;
  SELECT * INTO v_lead FROM marketing.lead l WHERE l.id = v_req.lead_id;
  IF v_lead.demo_tenant_id <> v_req.demo_tenant_id OR v_lead.status = 'expired' OR v_lead.expires_at <= now() THEN
    RETURN 'expired';
  END IF;
  RETURN CASE WHEN v_lead.claimed_at IS NOT NULL THEN 'ready' ELSE 'verification-sent' END;
END $$;

-- Attaches the signed-in person to the demo of their verified email address, by accepting its pending invitation
-- (app.accept_invitation, so the membership and audit trail are exactly an invitation's). Calling it again as the
-- same person returns the same demo; someone else can never claim it once claimed.
CREATE FUNCTION app.claim_demo(p_subject text, p_email text, p_email_verified boolean)
RETURNS TABLE (tenant_id uuid, workspace_id uuid, first_name text, company text, industry text, building_key text,
               building_name text, office_level int, expires_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_email text := lower(btrim(p_email));
  v_lead marketing.lead;
  v_inv uuid;
  v_hash text;
BEGIN
  PERFORM app_private.check_subject(p_subject);
  IF v_email IS NULL OR NOT coalesce(p_email_verified, false) THEN
    RAISE EXCEPTION 'sign in with a verified email address to open your demo' USING ERRCODE = 'ACI05';
  END IF;
  SELECT * INTO v_lead FROM marketing.lead l WHERE l.email = v_email FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no demo for this email address' USING ERRCODE = 'DEM01'; END IF;
  IF v_lead.status = 'expired' OR v_lead.expires_at <= now() THEN
    RAISE EXCEPTION 'this demo has expired' USING ERRCODE = 'DEM02';
  END IF;

  IF v_lead.claimed_by IS NOT NULL THEN
    IF v_lead.claimed_by <> p_subject THEN
      RAISE EXCEPTION 'this demo was already opened by another account' USING ERRCODE = 'ACI03';
    END IF;
  ELSE
    SELECT i.id INTO v_inv FROM app.invitation i
    WHERE i.tenant_id = v_lead.demo_tenant_id AND i.email = v_email AND i.status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'this demo was already opened by another account' USING ERRCODE = 'ACI03'; END IF;
    -- The verified address is the proof here, not a link: a token that expired while the visitor was verifying is
    -- replaced rather than refused.
    SELECT t.token_sha256 INTO v_hash FROM identity.invitation_token t
    WHERE t.tenant_id = v_lead.demo_tenant_id AND t.invitation_id = v_inv AND t.used_at IS NULL AND t.revoked_at IS NULL
      AND t.expires_at > now()
    ORDER BY t.created_at DESC LIMIT 1;
    IF NOT FOUND THEN
      v_hash := app_private.unusable_token_hash();
      PERFORM app_private.put_token(v_lead.demo_tenant_id, v_inv, v_hash, interval '1 hour', 'demo-funnel');
    END IF;
    PERFORM app.accept_invitation(p_subject, v_email, true, v_hash);
    UPDATE marketing.lead l SET status = 'ready', claimed_at = now(), claimed_by = p_subject WHERE l.id = v_lead.id;
  END IF;

  RETURN QUERY
  SELECT p.tenant_id, p.workspace_id, p.first_name, p.company, p.industry, p.building_key, b.name, p.office_level, p.expires_at
  FROM app.demo_profile p
  JOIN catalog.building_alias a ON a.alias = p.building_key
  JOIN catalog.building b ON b.id = a.building_id
  WHERE p.tenant_id = v_lead.demo_tenant_id AND p.workspace_id = v_lead.demo_workspace_id;
END $$;

-- The lead list, newest first, keyset-paginated on (created_at, id). Only owners of the platform demo agency.
CREATE FUNCTION app.list_leads(p_actor text, p_after_created timestamptz, p_after_id uuid, p_limit int)
RETURNS TABLE (id uuid, created_at timestamptz, full_name text, email text, company text, industry text, phone text,
               website text, marketing_consent boolean, consent_recorded_at timestamptz, consent_notice_version text,
               attribution jsonb, status text, expires_at timestamptz, claimed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM app_private.check_subject(p_actor);
  IF NOT EXISTS (SELECT 1 FROM app.agency_member m WHERE m.agency_id = app_private.demo_agency()
                   AND m.subject = p_actor AND m.role = 'owner' AND m.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'only platform owners can read leads' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1001 THEN RAISE EXCEPTION 'invalid page size' USING ERRCODE = '22023'; END IF;
  RETURN QUERY
  SELECT l.id, l.created_at, l.full_name, l.email, l.company, l.industry, l.phone, l.website, l.marketing_consent,
         l.consent_recorded_at, l.consent_notice_version, l.attribution,
         CASE WHEN l.status <> 'expired' AND l.expires_at <= now() THEN 'expired' ELSE l.status END,
         l.expires_at, l.claimed_at
  FROM marketing.lead l
  WHERE p_after_created IS NULL OR (l.created_at, l.id) < (p_after_created, p_after_id)
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
END $$;

-- Ends every demo whose expiry has passed (see the header). p_now can only move expiry earlier than the database
-- clock, never later: a caller cannot expire demos ahead of time by passing a future timestamp.
CREATE FUNCTION app.expire_demos(p_now timestamptz DEFAULT now())
RETURNS TABLE (lead_id uuid, tenant_id uuid, revoked_subjects text[])
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_now timestamptz := least(coalesce(p_now, now()), now());
  v record;
BEGIN
  FOR v IN
    SELECT l.id, l.demo_tenant_id FROM marketing.lead l
    WHERE l.status <> 'expired' AND l.expires_at <= v_now
    ORDER BY l.expires_at, l.id
    FOR UPDATE SKIP LOCKED
  LOOP
    RETURN QUERY SELECT v.id, v.demo_tenant_id, app_private.expire_lead(v.id);
  END LOOP;
END $$;

-- ───────────────────────── Ownership and execute rights ─────────────────────────
REVOKE ALL ON FUNCTION
  app_private.guard_demo_profile(), app_private.demo_agency(), app_private.unusable_token_hash(),
  app_private.seed_demo(uuid, uuid, text, text), app_private.provision_demo(text, text, text, text, interval, interval),
  app_private.expire_lead(uuid),
  app.submit_demo_request(text, text, text, text, text, text, boolean, text, jsonb, text, interval, interval),
  app.demo_request_status(uuid), app.claim_demo(text, text, boolean),
  app.list_leads(text, timestamptz, uuid, int), app.expire_demos(timestamptz)
FROM PUBLIC;
ALTER FUNCTION app_private.guard_demo_profile() OWNER TO agentcity_scope;
ALTER FUNCTION app_private.demo_agency() OWNER TO agentcity_scope;
ALTER FUNCTION app_private.unusable_token_hash() OWNER TO agentcity_scope;
ALTER FUNCTION app_private.seed_demo(uuid, uuid, text, text) OWNER TO agentcity_scope;
ALTER FUNCTION app_private.provision_demo(text, text, text, text, interval, interval) OWNER TO agentcity_scope;
ALTER FUNCTION app_private.expire_lead(uuid) OWNER TO agentcity_scope;
ALTER FUNCTION app.submit_demo_request(text, text, text, text, text, text, boolean, text, jsonb, text, interval, interval) OWNER TO agentcity_scope;
ALTER FUNCTION app.demo_request_status(uuid) OWNER TO agentcity_scope;
ALTER FUNCTION app.claim_demo(text, text, boolean) OWNER TO agentcity_scope;
ALTER FUNCTION app.list_leads(text, timestamptz, uuid, int) OWNER TO agentcity_scope;
ALTER FUNCTION app.expire_demos(timestamptz) OWNER TO agentcity_scope;

-- What the scope role needs for these writes. The app role gets nothing on marketing.* and only SELECT on the profile.
GRANT SELECT ON marketing.settings TO agentcity_scope;
GRANT SELECT, INSERT, UPDATE ON marketing.lead, marketing.demo_request TO agentcity_scope;
GRANT USAGE ON SEQUENCE marketing.demo_office_seq TO agentcity_scope;
GRANT INSERT ON app.tenant, app.workspace TO agentcity_scope;
GRANT SELECT, INSERT, DELETE ON app.demo_profile TO agentcity_scope;
GRANT SELECT, INSERT, DELETE ON app.contact, app.note, app.opportunity, app.content_item TO agentcity_scope;
GRANT SELECT, DELETE ON app.contact_external_id, app.suppression, app.schedule TO agentcity_scope;
GRANT SELECT ON app.opportunity_stage_event, app.consent_event, app.draft_revision TO agentcity_scope;
GRANT SELECT, INSERT ON app.message_evidence TO agentcity_scope;
GRANT DELETE ON app.invitation, identity.invitation_token TO agentcity_scope;
GRANT USAGE ON SCHEMA catalog TO agentcity_scope;
GRANT SELECT ON catalog.building, catalog.building_alias TO agentcity_scope;
GRANT EXECUTE ON FUNCTION
  app.submit_demo_request(text, text, text, text, text, text, boolean, text, jsonb, text, interval, interval),
  app.demo_request_status(uuid), app.claim_demo(text, text, boolean),
  app.list_leads(text, timestamptz, uuid, int), app.expire_demos(timestamptz)
TO agentcity_app;

INSERT INTO platform.table_classification (table_schema, table_name, class, immutable, note) VALUES
  ('marketing', 'settings', 'private', false, 'Which agency owns demo tenants. Admin and scope role only.'),
  ('marketing', 'lead', 'private', false, 'Demo leads: personal data and consent. Reached only through the demo SECURITY DEFINER functions (no app-role grant).'),
  ('marketing', 'demo_request', 'private', false, 'One row per demo form submission; public request ids. No app-role grant.'),
  ('app', 'demo_profile', 'tenant', false, 'Demo welcome/office data and the simulated agent team; removed at demo expiry.');

-- Down Migration
-- Refuses (foreign keys) while demo tenants exist: their immutable records cannot be removed by a rollback.
DROP FUNCTION app.expire_demos(timestamptz);
DROP FUNCTION app.list_leads(text, timestamptz, uuid, int);
DROP FUNCTION app.claim_demo(text, text, boolean);
DROP FUNCTION app.demo_request_status(uuid);
DROP FUNCTION app.submit_demo_request(text, text, text, text, text, text, boolean, text, jsonb, text, interval, interval);
DROP FUNCTION app_private.expire_lead(uuid);
DROP FUNCTION app_private.provision_demo(text, text, text, text, interval, interval);
DROP FUNCTION app_private.seed_demo(uuid, uuid, text, text);
DROP FUNCTION app_private.unusable_token_hash();
DELETE FROM platform.table_classification
WHERE (table_schema = 'marketing') OR (table_schema = 'app' AND table_name = 'demo_profile');
DROP TABLE app.demo_profile;
DROP FUNCTION app_private.guard_demo_profile();
REVOKE SELECT ON catalog.building, catalog.building_alias FROM agentcity_scope;
REVOKE USAGE ON SCHEMA catalog FROM agentcity_scope;
REVOKE DELETE ON app.invitation, identity.invitation_token FROM agentcity_scope;
REVOKE SELECT, INSERT ON app.message_evidence FROM agentcity_scope;
REVOKE SELECT ON app.opportunity_stage_event, app.consent_event, app.draft_revision FROM agentcity_scope;
REVOKE SELECT, DELETE ON app.contact_external_id, app.suppression, app.schedule FROM agentcity_scope;
REVOKE SELECT, INSERT, DELETE ON app.contact, app.opportunity, app.content_item FROM agentcity_scope;
REVOKE INSERT, DELETE ON app.note FROM agentcity_scope;
REVOKE INSERT ON app.tenant, app.workspace FROM agentcity_scope;
WITH s AS (DELETE FROM marketing.settings RETURNING demo_agency_id)
DELETE FROM app.agency a USING s WHERE a.id = s.demo_agency_id;
DROP FUNCTION app_private.demo_agency();
DROP SCHEMA marketing CASCADE;
