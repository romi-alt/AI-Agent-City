import type { DemoRequestRow, Lead, LeadPage, LinkRow, Store, WorkspaceRow } from './store.ts';

/** In-memory store for tests and `next dev` (LITE_STORE=memory). Data vanishes on restart; never used in production. */
export function createMemoryStore(): Store {
  const leads = new Map<string, Lead>();
  const requests = new Map<string, DemoRequestRow>();
  const links = new Map<string, LinkRow & { usedAt: Date | null }>();
  const workspaces = new Map<string, WorkspaceRow>();
  const rates = new Map<string, { n: number; expiresAt: Date }>();
  let seq = 0;

  const byEmail = (email: string) => [...leads.values()].find(l => l.email === email) ?? null;
  const copy = (l: Lead | null): Lead | null => (l ? { ...l, attribution: { ...l.attribution } } : null);

  function endLead(id: string) {
    const lead = leads.get(id);
    if (lead) lead.status = 'expired';
    workspaces.delete(id);
    for (const [h, l] of links) if (l.leadId === id) links.delete(h);
  }

  return {
    async migrate() {},
    async hitRate(bucket, expiresAt) {
      const cur = rates.get(bucket);
      const n = (cur?.n ?? 0) + 1;
      rates.set(bucket, { n, expiresAt });
      return n;
    },
    async findLeadByEmail(email) {
      return copy(byEmail(email));
    },
    async findLead(id) {
      return copy(leads.get(id) ?? null);
    },
    async insertLead(lead) {
      if (byEmail(lead.email)) return false;
      leads.set(lead.id, { ...lead });
      return true;
    },
    async updateLead(id, patch) {
      const lead = leads.get(id);
      if (lead) Object.assign(lead, patch);
    },
    async findRequestByHash(hash) {
      return [...requests.values()].find(r => r.idempotencyHash === hash) ?? null;
    },
    async findRequest(id) {
      return requests.get(id) ?? null;
    },
    async insertRequest(row) {
      requests.set(row.id, { ...row });
    },
    async replaceLink(link) {
      for (const [h, l] of links) if (l.leadId === link.leadId && !l.usedAt) links.delete(h);
      links.set(link.tokenHash, { ...link, usedAt: null });
    },
    async consumeLink(tokenHash, now) {
      const l = links.get(tokenHash);
      if (!l || l.usedAt || l.expiresAt <= now) return null;
      l.usedAt = now;
      return { tokenHash: l.tokenHash, leadId: l.leadId, generation: l.generation, expiresAt: l.expiresAt };
    },
    async ensureWorkspace(leadId, buildingKey, now) {
      const existing = workspaces.get(leadId);
      if (existing) return existing;
      const row = { leadId, buildingKey, seq: ++seq, createdAt: now };
      workspaces.set(leadId, row);
      return row;
    },
    async findWorkspace(leadId) {
      return workspaces.get(leadId) ?? null;
    },
    async listLeads(offset, limit): Promise<LeadPage> {
      const all = [...leads.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return { rows: all.slice(offset, offset + limit).map(l => copy(l)!), total: all.length };
    },
    async expireDue(now) {
      const due = [...leads.values()].filter(l => l.status !== 'expired' && l.expiresAt <= now).map(l => l.id);
      for (const id of due) endLead(id);
      return due;
    },
    async expireLead(id) {
      endLead(id);
    },
    async cleanup(now) {
      let removed = 0;
      for (const [k, r] of rates) if (r.expiresAt <= now) (rates.delete(k), removed++);
      for (const [h, l] of links) if (l.usedAt || l.expiresAt <= now) (links.delete(h), removed++);
      return removed;
    },
  };
}
