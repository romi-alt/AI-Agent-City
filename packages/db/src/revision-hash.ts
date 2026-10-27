import { createHash } from 'node:crypto';

/**
 * The canonical revision hash, computed exactly as the database does (`app.revision_sha256` in migration
 * 1793232000000_revisions.sql). The API and worker use it to show or recheck what an approval covers; the database
 * remains the authority. Format: planning/agentcity-migration/m04/REVISIONS.md.
 */
export const REVISION_HASH_FORMAT = 'agentcity.revision.v1';

export type CanonicalJson =
  null | boolean | number | string | readonly CanonicalJson[] | { [key: string]: CanonicalJson };

export interface RevisionAttachment {
  assetVersionId: string;
  /** SHA-256 of the file's bytes, lowercase hex. */
  contentSha256: string;
  mediaType: string;
  /** pg returns bigint columns as strings; both are accepted. */
  sizeBytes: number | string | bigint;
}

export interface RevisionContent {
  channel: string;
  recipient: string | null;
  subject: string | null;
  body: string;
  /** In position order. */
  attachments: readonly RevisionAttachment[];
  policyContext: { [key: string]: CanonicalJson };
}

const utf8Order = (a: string, b: string) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));

/**
 * Canonical JSON: object keys sorted by Unicode code point, no whitespace, strings escaped as JSON.stringify does
 * (which matches PostgreSQL's to_json), and only safe integers as numbers.
 */
export function canonicalJson(value: CanonicalJson): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isSafeInteger(value)) throw new RangeError(`canonical JSON allows only safe integers, not ${value}`);
      return String(value);
    case 'object':
      if (Array.isArray(value)) return `[${value.map(v => canonicalJson(v)).join(',')}]`;
      return `{${Object.keys(value)
        .sort(utf8Order)
        .map(k => {
          const v = (value as { [key: string]: CanonicalJson })[k];
          if (v === undefined) throw new TypeError(`canonical JSON has no undefined (key ${JSON.stringify(k)})`);
          return `${JSON.stringify(k)}:${canonicalJson(v)}`;
        })
        .join(',')}}`;
    default:
      throw new TypeError(`canonical JSON cannot hold a ${typeof value}`);
  }
}

function sizeOf(n: number | string | bigint): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isSafeInteger(v) || v < 0 || String(v) !== String(n))
    throw new RangeError(`invalid attachment size ${n}`);
  return v;
}

/** The exact text that is hashed. */
export function revisionCanonicalDocument(c: RevisionContent): string {
  return canonicalJson({
    format: REVISION_HASH_FORMAT,
    channel: c.channel,
    recipient: c.recipient,
    subject: c.subject,
    body: c.body,
    attachments: c.attachments.map(a => ({
      asset_version_id: a.assetVersionId.toLowerCase(),
      content_sha256: a.contentSha256,
      media_type: a.mediaType,
      size_bytes: sizeOf(a.sizeBytes),
    })),
    policy_context: c.policyContext,
  });
}

/** SHA-256 (lowercase hex) of the canonical document's UTF-8 bytes. */
export function revisionHash(c: RevisionContent): string {
  return createHash('sha256').update(revisionCanonicalDocument(c), 'utf8').digest('hex');
}
