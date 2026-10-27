#!/bin/bash
# Runs once, when the database volume is first created. The API and worker connect as APP_DB_USER: a plain
# login role, never a superuser, owner or BYPASSRLS role, so row-level security (M02) applies to it.
# Schema changes run as the admin role through migrations (packages/db).
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE "${APP_DB_USER}" LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO "${APP_DB_USER}";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
