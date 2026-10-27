# P09 — Prepare repeatable deployment and operational controls

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Finish production Docker images, Kubernetes manifests (or documented proposal-permitted Fly initial target), Terraform modules and GitHub Actions for staged environments. Include secret injection, private services, least privilege, health/readiness, resource limits, autoscaling, durable backups/restore, migrations compatible with rolling app versions, per-tenant feature flags and rollback. Never commit credentials or deploy to production during this task.

Complete OpenTelemetry dashboards/alerts in Grafana and Sentry redaction, correlated per-run model traces, cost/queue/send/receipt/latency alerts, audit access controls and retention. Implement per-contact export/deletion across Postgres, vectors/BM25, objects, caches, workflow payload handling and configured connector obligations; explain retention/legal holds and backup expiry. Deletion cannot leave retrievable embeddings or silently promise erasure from immutable backups.

Add channel readiness controls for consent, opt-out, A2P10DLC, sender domains SPF/DKIM/DMARC, DND and quiet hours. Produce SOC2 Type I readiness evidence organization by end Phase2 and Type II operational evidence plan afterward; do not claim certification from code.

## Required evidence

Run local/staging deployment smoke, rolling compatibility, restore drill, failover/restart and scoped feature rollout. Verify secret/PII redaction, export completeness, deletion search disappearance and audit access. Demonstrate zero-downtime behavior under an actual rolling test before claiming it. External DNS, registrations, auditors and infrastructure provisioning remain clearly assigned gates.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
