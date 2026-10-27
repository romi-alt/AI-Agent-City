# P07 — Complete the promised integration catalog

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement and document connector SDK contracts for authorization, capabilities, secret references, pagination, schema mapping, webhooks, rate limits, retries, idempotency and external-reference reconciliation. Finish HubSpot and Salesforce CRM adapters, Twilio communications, SendGrid email, Google relevant services and Meta Ads, while maintaining GHL. Specify exact Google capabilities required by source tasks rather than claiming all Google products work.

Keep n8n for custom client flows through scoped authenticated triggers/callbacks and service identities. Provide versioned example exports, import documentation, secret references and a registry. n8n must not bypass consent/approvals, tenant boundaries, spend caps or audit ledger; generic webhook success does not mean a task completed.

Build the integration settings/health UI with required scopes, consent/account readiness, retry/reconnect and per-capability status. Finish real ad budget/launch/measurement and email domain verification readiness. Route telephony capability honestly; a human call log is not actual calling. Inspect existing SDK contracts before adding provider-specific shortcuts.

## Required evidence

For every provider, deliver fixture contract tests, signed webhook negative tests and opt-in sandbox smoke procedures with exact expected provider IDs. Exercise revocation, missing scope, rate limit, duplicate callback and cross-tenant credential denial. Distinguish implementation complete from provider-app approval/sandbox/live verification; never show connected based only on a saved token.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
