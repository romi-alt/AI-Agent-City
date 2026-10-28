// The storage interface of the lite backend. Two implementations: MySQL (production) and in-memory (tests and
// `next dev` only). The service holds all rules; a store only keeps rows and makes single steps atomic.

export type LeadStatus = 'verification-sent' | 'ready' | 'expired';

export interface Lead {
  id: string;
  email: string;
  fullName: string;
  company: string;
  industry: string | null;
  phone: string | null;
  website: string | null;
  marketingConsent: boolean;
  consentRecordedAt: Date;
  consentNoticeVersion: string;
  attribution: Record<string, string>;
  status: LeadStatus;
  /** Bumped when a returning visitor gets a fresh demo after expiry; old requests and cookies stop matching. */
  generation: number;
  createdAt: Date;
  expiresAt: Date;
  verifiedAt: Date | null;
}

export interface DemoRequestRow {
  id: string;
  leadId: string;
  generation: number;
  idempotencyHash: string;
  /** True when the address already had a verified demo: nothing is sent and the status never reveals that. */
  shadow: boolean;
  shadowExpiresAt: Date | null;
  createdAt: Date;
}

export interface LinkRow {
  tokenHash: string;
  leadId: string;
  generation: number;
  expiresAt: Date;
}

export interface WorkspaceRow {
  leadId: string;
  buildingKey: string;
  /** A counter that only grows, used to number offices. */
  seq: number;
  createdAt: Date;
}

export interface LeadPage {
  rows: Lead[];
  total: number;
}

export interface Store {
  /** Creates tables when missing (idempotent). Called once before first use. */
  migrate(): Promise<void>;
  /** Counts one hit on a rate-limit bucket and returns the count in it; the bucket disappears after `expiresAt`. */
  hitRate(bucket: string, expiresAt: Date): Promise<number>;
  findLeadByEmail(email: string): Promise<Lead | null>;
  findLead(id: string): Promise<Lead | null>;
  /** Returns false when the address already has a lead (a concurrent submission won). */
  insertLead(lead: Lead): Promise<boolean>;
  updateLead(id: string, patch: Partial<Omit<Lead, 'id' | 'email' | 'createdAt'>>): Promise<void>;
  findRequestByHash(idempotencyHash: string): Promise<DemoRequestRow | null>;
  findRequest(id: string): Promise<DemoRequestRow | null>;
  insertRequest(row: DemoRequestRow): Promise<void>;
  /** Stores a verification link and voids the lead's earlier unused ones. */
  replaceLink(link: LinkRow): Promise<void>;
  /** Atomically marks a link used. Null when unknown, already used or expired. */
  consumeLink(tokenHash: string, now: Date): Promise<LinkRow | null>;
  /** Creates the lead's demo workspace record once; a second call returns the existing one. */
  ensureWorkspace(leadId: string, buildingKey: string, now: Date): Promise<WorkspaceRow>;
  findWorkspace(leadId: string): Promise<WorkspaceRow | null>;
  listLeads(offset: number, limit: number): Promise<LeadPage>;
  /** Ends every demo past its expiry: status 'expired', workspace removed, links removed. Returns the lead ids. */
  expireDue(now: Date): Promise<string[]>;
  /** Ends one demo now (same effects as expireDue for that lead). */
  expireLead(id: string): Promise<void>;
  /** Removes finished rate-limit buckets, used or expired links and old requests. Returns rows removed. */
  cleanup(now: Date): Promise<number>;
}
