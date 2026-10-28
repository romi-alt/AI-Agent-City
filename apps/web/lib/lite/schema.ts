// The tables of the lite backend, created idempotently on first use. schema.sql is the same text for people to
// read and to run by hand; a test keeps the two identical. Dates are UTC DATETIME(3). Email addresses are only in
// `lead`; links keep SHA-256 hashes, never the token.

export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS lite_lead (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  company VARCHAR(200) NOT NULL,
  industry VARCHAR(100) NULL,
  phone VARCHAR(40) NULL,
  website VARCHAR(300) NULL,
  marketing_consent TINYINT(1) NOT NULL,
  consent_recorded_at DATETIME(3) NOT NULL,
  consent_notice_version VARCHAR(64) NOT NULL,
  attribution JSON NOT NULL,
  status VARCHAR(20) NOT NULL,
  generation INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  verified_at DATETIME(3) NULL,
  UNIQUE KEY lite_lead_email (email),
  KEY lite_lead_created (created_at),
  KEY lite_lead_expires (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS lite_request (
  id CHAR(36) NOT NULL PRIMARY KEY,
  lead_id CHAR(36) NOT NULL,
  generation INT NOT NULL,
  idempotency_hash CHAR(64) NOT NULL,
  shadow TINYINT(1) NOT NULL,
  shadow_expires_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY lite_request_idem (idempotency_hash),
  KEY lite_request_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS lite_link (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  lead_id CHAR(36) NOT NULL,
  generation INT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  KEY lite_link_lead (lead_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS lite_workspace (
  lead_id CHAR(36) NOT NULL PRIMARY KEY,
  seq INT NOT NULL AUTO_INCREMENT,
  building_key VARCHAR(40) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY lite_workspace_seq (seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS lite_rate (
  bucket CHAR(64) NOT NULL PRIMARY KEY,
  n INT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  KEY lite_rate_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

export const SCHEMA_SQL = `${SCHEMA_STATEMENTS.map(s => `${s};`).join('\n\n')}\n`;
