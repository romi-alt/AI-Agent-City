-- Up Migration
-- M01 foundation. Extensions are created here, by the migration (admin) role, never by the app role.
-- pg_search provides BM25 full-text ranking and vector provides embeddings; knowledge tables arrive in M09.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_search;

-- Platform plumbing, not tenant data: it holds no customer, client or agency information, so it is classified
-- "platform operational" and does not take tenant row-level security (tenant tables arrive in M02).
CREATE SCHEMA platform;
GRANT USAGE ON SCHEMA platform TO agentcity_app;

-- One row per step of the heartbeat workflow. The primary key makes each step idempotent: a retried or
-- restarted activity cannot record the same step twice.
CREATE TABLE platform.heartbeat (
  run_id text NOT NULL CHECK (run_id ~ '^[a-z0-9-]{6,64}$'),
  step text NOT NULL CHECK (step IN ('started', 'finished')),
  worker_id text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, step)
);
GRANT SELECT, INSERT ON platform.heartbeat TO agentcity_app;

-- Down Migration
DROP SCHEMA platform CASCADE;
