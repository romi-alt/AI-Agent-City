# M03 — Replace custom authentication with proposal identity

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Configure OIDC with the selected Keycloak default, using authorization code + PKCE where appropriate and secure server sessions. Validate issuer/audience/signature/expiry, CSRF and logout. Implement agency owner/staff/client admin/viewer authorization and explicit client/workspace assignments. Add agency SSO, passkeys, passwordless email sign-in codes and step-up for credential/billing/permission changes; verify actual IdP capabilities rather than equating TOTP or verification email with email codes.

Implement device/session visibility, revocation and reauthentication policy, including socket disconnection and worker permissions where relevant. Device binding must be a concrete security design, not a user-agent string check. Treat 48-hour sign-in links and the separate 48-hour shadow mode as different requirements where carrying over pilot behavior.

Provide verified-email invitation/migration mapping because legacy users have no reliable email field. Never import password hashes, TOTP secrets, old sessions or remembered-device tokens. Retire old endpoints only after new access and break-glass procedures are tested. Keep development login shortcuts impossible in production.

## Required evidence

Test wrong issuer/audience, expired tokens, login/logout, replay/expired invitation, passkey and email-code flows, step-up denial, revoked device, member role changes and tenant switching. A revoked user loses HTTP and socket access. Any unavailable IdP capability remains an explicit release blocker with a concrete resolution plan.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
