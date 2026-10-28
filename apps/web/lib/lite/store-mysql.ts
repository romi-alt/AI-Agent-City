import mysql from 'mysql2/promise';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { SCHEMA_STATEMENTS } from './schema.ts';
import type { DemoRequestRow, Lead, LeadPage, LeadStatus, Store, WorkspaceRow } from './store.ts';

// MySQL implementation. All dates are UTC (the connection time zone is pinned) and handed out as Date objects.
// Queries use placeholders only.

type Row = RowDataPacket;
const asDate = (v: unknown): Date => (v instanceof Date ? v : new Date(`${String(v)}Z`));
const optDate = (v: unknown): Date | null => (v === null || v === undefined ? null : asDate(v));

function toLead(r: Row): Lead {
  const attribution = typeof r.attribution === 'string' ? JSON.parse(r.attribution) : (r.attribution ?? {});
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    company: r.company,
    industry: r.industry,
    phone: r.phone,
    website: r.website,
    marketingConsent: !!r.marketing_consent,
    consentRecordedAt: asDate(r.consent_recorded_at),
    consentNoticeVersion: r.consent_notice_version,
    attribution,
    status: r.status as LeadStatus,
    generation: r.generation,
    createdAt: asDate(r.created_at),
    expiresAt: asDate(r.expires_at),
    verifiedAt: optDate(r.verified_at),
  };
}

function toRequest(r: Row): DemoRequestRow {
  return {
    id: r.id,
    leadId: r.lead_id,
    generation: r.generation,
    idempotencyHash: r.idempotency_hash,
    shadow: !!r.shadow,
    shadowExpiresAt: optDate(r.shadow_expires_at),
    createdAt: asDate(r.created_at),
  };
}

const toWorkspace = (r: Row): WorkspaceRow => ({
  leadId: r.lead_id,
  buildingKey: r.building_key,
  seq: r.seq,
  createdAt: asDate(r.created_at),
});

const PATCH_COLUMNS: Record<string, string> = {
  fullName: 'full_name',
  company: 'company',
  industry: 'industry',
  phone: 'phone',
  website: 'website',
  marketingConsent: 'marketing_consent',
  consentRecordedAt: 'consent_recorded_at',
  consentNoticeVersion: 'consent_notice_version',
  attribution: 'attribution',
  status: 'status',
  generation: 'generation',
  expiresAt: 'expires_at',
  verifiedAt: 'verified_at',
};

export function createMysqlStore(url: string): Store {
  let pool: Pool | null = null;
  const db = (): Pool => {
    pool ??= mysql.createPool({
      uri: url,
      timezone: 'Z',
      connectionLimit: 5,
      dateStrings: false,
      connectTimeout: 8000,
    });
    return pool;
  };
  const rows = async (sql: string, params: unknown[] = []) => (await db().query<Row[]>(sql, params))[0];
  const exec = async (sql: string, params: unknown[] = []) =>
    (await db().execute<ResultSetHeader>(sql, params as never))[0];

  async function endLead(id: string) {
    await exec(`UPDATE lite_lead SET status = 'expired' WHERE id = ?`, [id]);
    await exec('DELETE FROM lite_workspace WHERE lead_id = ?', [id]);
    await exec('DELETE FROM lite_link WHERE lead_id = ?', [id]);
  }

  return {
    async migrate() {
      for (const statement of SCHEMA_STATEMENTS) await db().query(statement);
    },
    async hitRate(bucket, expiresAt) {
      await exec('INSERT INTO lite_rate (bucket, n, expires_at) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE n = n + 1', [
        bucket,
        expiresAt,
      ]);
      const r = await rows('SELECT n FROM lite_rate WHERE bucket = ?', [bucket]);
      return Number(r[0]?.n ?? 1);
    },
    async findLeadByEmail(email) {
      const r = await rows('SELECT * FROM lite_lead WHERE email = ?', [email]);
      return r[0] ? toLead(r[0]) : null;
    },
    async findLead(id) {
      const r = await rows('SELECT * FROM lite_lead WHERE id = ?', [id]);
      return r[0] ? toLead(r[0]) : null;
    },
    async insertLead(l) {
      const res = await exec(
        `INSERT IGNORE INTO lite_lead (id, email, full_name, company, industry, phone, website, marketing_consent,
           consent_recorded_at, consent_notice_version, attribution, status, generation, created_at, expires_at, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          l.id,
          l.email,
          l.fullName,
          l.company,
          l.industry,
          l.phone,
          l.website,
          l.marketingConsent ? 1 : 0,
          l.consentRecordedAt,
          l.consentNoticeVersion,
          JSON.stringify(l.attribution),
          l.status,
          l.generation,
          l.createdAt,
          l.expiresAt,
          l.verifiedAt,
        ],
      );
      return res.affectedRows === 1;
    },
    async updateLead(id, patch) {
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [key, value] of Object.entries(patch)) {
        const column = PATCH_COLUMNS[key];
        if (!column || value === undefined) continue;
        sets.push(`${column} = ?`);
        params.push(
          key === 'attribution' ? JSON.stringify(value) : key === 'marketingConsent' ? (value ? 1 : 0) : value,
        );
      }
      if (sets.length) await exec(`UPDATE lite_lead SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    },
    async findRequestByHash(hash) {
      const r = await rows('SELECT * FROM lite_request WHERE idempotency_hash = ?', [hash]);
      return r[0] ? toRequest(r[0]) : null;
    },
    async findRequest(id) {
      const r = await rows('SELECT * FROM lite_request WHERE id = ?', [id]);
      return r[0] ? toRequest(r[0]) : null;
    },
    async insertRequest(q) {
      await exec(
        `INSERT INTO lite_request (id, lead_id, generation, idempotency_hash, shadow, shadow_expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [q.id, q.leadId, q.generation, q.idempotencyHash, q.shadow ? 1 : 0, q.shadowExpiresAt, q.createdAt],
      );
    },
    async replaceLink(link) {
      await exec('DELETE FROM lite_link WHERE lead_id = ? AND used_at IS NULL', [link.leadId]);
      await exec('INSERT INTO lite_link (token_hash, lead_id, generation, expires_at) VALUES (?, ?, ?, ?)', [
        link.tokenHash,
        link.leadId,
        link.generation,
        link.expiresAt,
      ]);
    },
    async consumeLink(tokenHash, now) {
      // One conditional UPDATE: of two simultaneous clicks only one changes a row.
      const res = await exec(
        'UPDATE lite_link SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
        [now, tokenHash, now],
      );
      if (res.affectedRows !== 1) return null;
      const r = await rows('SELECT * FROM lite_link WHERE token_hash = ?', [tokenHash]);
      const l = r[0];
      return l ? { tokenHash, leadId: l.lead_id, generation: l.generation, expiresAt: asDate(l.expires_at) } : null;
    },
    async ensureWorkspace(leadId, buildingKey, now) {
      await exec('INSERT IGNORE INTO lite_workspace (lead_id, building_key, created_at) VALUES (?, ?, ?)', [
        leadId,
        buildingKey,
        now,
      ]);
      const r = await rows('SELECT * FROM lite_workspace WHERE lead_id = ?', [leadId]);
      return toWorkspace(r[0]!);
    },
    async findWorkspace(leadId) {
      const r = await rows('SELECT * FROM lite_workspace WHERE lead_id = ?', [leadId]);
      return r[0] ? toWorkspace(r[0]) : null;
    },
    async listLeads(offset, limit): Promise<LeadPage> {
      const page = await rows('SELECT * FROM lite_lead ORDER BY created_at DESC, id LIMIT ? OFFSET ?', [limit, offset]);
      const total = await rows('SELECT COUNT(*) AS c FROM lite_lead');
      return { rows: page.map(toLead), total: Number(total[0]?.c ?? 0) };
    },
    async expireDue(now) {
      const due = await rows(`SELECT id FROM lite_lead WHERE status <> 'expired' AND expires_at <= ?`, [now]);
      for (const r of due) await endLead(r.id);
      return due.map(r => r.id as string);
    },
    async expireLead(id) {
      await endLead(id);
    },
    async cleanup(now) {
      const a = await exec('DELETE FROM lite_rate WHERE expires_at <= ?', [now]);
      const b = await exec('DELETE FROM lite_link WHERE used_at IS NOT NULL OR expires_at <= ?', [now]);
      return a.affectedRows + b.affectedRows;
    },
  };
}
