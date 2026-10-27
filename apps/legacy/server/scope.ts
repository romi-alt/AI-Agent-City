import type { Sim } from '../src/core/sim';
import type { Building, Neighbour, Patch, Snapshot, StatsDump } from '../src/core/types';

/**
 * Multi-client isolation. Agency people (owner, staff) see the whole city. Client people see only the
 * buildings their client owns, and client viewers can't change anything. Everything a browser receives
 * (the opening snapshot, every live patch, the people list) goes through these filters, and every action
 * is checked against the scope before it runs.
 */

export type Role = 'owner' | 'staff' | 'client-admin' | 'client-viewer';
export const ROLES: Role[] = ['owner', 'staff', 'client-admin', 'client-viewer'];
export const isClientRole = (r: Role) => r === 'client-admin' || r === 'client-viewer';

export interface Client { id: string; name: string; buildingIds: string[]; createdAt: number }

export type Scope =
  | { all: true; readOnly: false }
  | { all: false; readOnly: boolean; clientId?: string; clientName: string; buildings: Set<string> };

export function scopeFor(user: { role: Role; clientId?: string }, clients: Client[]): Scope {
  if (!isClientRole(user.role)) return { all: true, readOnly: false };
  const c = clients.find(x => x.id === user.clientId);
  return { all: false, readOnly: user.role === 'client-viewer', clientId: c?.id, clientName: c?.name ?? '', buildings: new Set(c?.buildingIds ?? []) };
}

export const sees = (s: Scope, buildingId: string | undefined) => s.all || (!!buildingId && s.buildings.has(buildingId));

const keep = <T extends { buildingId: string }>(s: Scope, xs: T[]) => xs.filter(x => sees(s, x.buildingId));
const keepStats = (s: Scope, d: StatsDump) => d.filter(([bid]) => sees(s, bid));

function clientSettings(s: Scope, settings: Snapshot['settings']): Snapshot['settings'] {
  if (s.all) return settings;
  // Report recipients are the agency's own addresses; the company name becomes the client's.
  return { ...settings, companyName: s.clientName || settings.companyName, reportRecipients: [] };
}

export function scopeSnapshot(snap: Snapshot, s: Scope): Snapshot {
  if (s.all) return { ...snap, neighbours: [] };
  const mine: Building[] = [];
  const neighbours: Neighbour[] = [];
  for (const b of snap.buildings) {
    if (s.buildings.has(b.id)) mine.push(b);
    else neighbours.push({ x: b.x, z: b.z, w: b.w, d: b.d, floors: b.floors.length });
  }
  return {
    ...snap,
    buildings: mine,
    neighbours,
    leads: keep(s, snap.leads),
    feed: keep(s, snap.feed),
    approvals: keep(s, snap.approvals),
    messages: keep(s, snap.messages),
    content: keep(s, snap.content),
    inbox: keep(s, snap.inbox),
    insights: keep(s, snap.insights),
    // Morning, daily and weekly reports cover the whole city, so they stay with the agency for now.
    reports: [],
    stats: keepStats(s, snap.stats),
    statsToday: keepStats(s, snap.statsToday),
    revenue: keep(s, snap.revenue),
    stageLog: snap.stageLog.filter(e => sees(s, e.b)),
    settings: clientSettings(s, snap.settings),
  };
}

export function scopePatch(p: Patch, s: Scope): Patch {
  if (s.all) return p;
  const out: Patch = { now: p.now };
  if (p.agents) out.agents = keep(s, p.agents);
  if (p.floors) out.floors = keep(s, p.floors);
  if (p.leads) out.leads = keep(s, p.leads);
  // Removed ids are opaque; the browser ignores ones it never had.
  if (p.removedLeads) out.removedLeads = p.removedLeads;
  if (p.removedContent) out.removedContent = p.removedContent;
  if (p.feed) out.feed = keep(s, p.feed);
  if (p.approvals) out.approvals = keep(s, p.approvals);
  if (p.messages) out.messages = keep(s, p.messages);
  if (p.content) out.content = keep(s, p.content);
  if (p.inbox) out.inbox = keep(s, p.inbox);
  if (p.insights) out.insights = keep(s, p.insights);
  if (p.stats) { out.stats = keepStats(s, p.stats); out.statsToday = keepStats(s, p.statsToday ?? []); out.statsDay = p.statsDay; }
  if (p.revenue) out.revenue = keep(s, p.revenue);
  if (p.stageLog) out.stageLog = p.stageLog.filter(e => sees(s, e.b));
  if (p.settings) out.settings = clientSettings(s, p.settings);
  for (const k of Object.keys(out) as (keyof Patch)[]) {
    const v = out[k];
    if (Array.isArray(v) && !v.length && k !== 'approvals' && k !== 'revenue') delete out[k];
  }
  return out;
}

/** Anything an action can point at. */
export type ActionTarget =
  | { type: 'approve'; id: string }
  | { type: 'approveAll'; buildingId?: string }
  | { type: 'rent' | 'vacate'; buildingId: string }
  | { type: 'leadCreate'; lead: { buildingId: string } }
  | { type: 'leadUpdate' | 'leadNote' | 'leadSend'; id: string }
  | { type: 'contentUpdate'; id: string }
  | { type: 'inboxReply'; id: string }
  | { type: 'duty' }
  | { type: 'desk'; agentId: string | null };

export type Verdict = { ok: true } | { ok: false; status: 403 | 404; error: string };

const NOT_FOUND: Verdict = { ok: false, status: 404, error: 'Not found.' };
const READ_ONLY: Verdict = { ok: false, status: 403, error: 'Your account can view this client but not change anything.' };
const AGENCY_ONLY: Verdict = { ok: false, status: 403, error: 'Only the agency can do that.' };
const OK: Verdict = { ok: true };

/**
 * May this person run this action? Out-of-scope targets answer "Not found" so a client can't learn
 * that another client's lead, post or approval exists.
 */
export function authorize(a: ActionTarget, s: Scope, sim: Sim): Verdict {
  if (a.type === 'duty') return OK;
  if (a.type === 'desk') {
    if (a.agentId === null) return OK;
    const agent = sim.agent(a.agentId);
    return agent && sees(s, agent.buildingId) ? OK : NOT_FOUND;
  }
  if (s.readOnly) return READ_ONLY;
  if (a.type === 'rent' || a.type === 'vacate') return s.all ? OK : AGENCY_ONLY;
  if (s.all) return OK;
  switch (a.type) {
    case 'approve': return sees(s, sim.approvals.find(x => x.id === a.id)?.buildingId) ? OK : NOT_FOUND;
    case 'approveAll': return !a.buildingId || sees(s, a.buildingId) ? OK : NOT_FOUND;
    case 'leadCreate': return sees(s, a.lead.buildingId) ? OK : NOT_FOUND;
    case 'leadUpdate': case 'leadNote': case 'leadSend': return sees(s, sim.leads.get(a.id)?.buildingId) ? OK : NOT_FOUND;
    case 'contentUpdate': return sees(s, sim.content.get(a.id)?.buildingId) ? OK : NOT_FOUND;
    case 'inboxReply': return sees(s, sim.inbox.get(a.id)?.buildingId) ? OK : NOT_FOUND;
  }
}
