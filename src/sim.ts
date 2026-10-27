import { buildCity } from './data/buildings';
import { CHANNELS, DEALERSHIP_TASKS, FAST_SALES_TASKS, SOCIAL_PLATFORMS, SOCIAL_TASKS } from './data/tasks';
import type { Agent, Approval, Building, FeedItem, Lead, Task } from './types';

export const TRAINING_STAGES = ['New lead', 'Contacted', 'Call booked', 'Training started', 'Active student', 'Completed / placed'];
export const DEALER_STAGES = ['New lead', 'Contacted', 'Appointment', 'Test drive', 'Negotiation', 'Sold'];

const FIRST = ['Glenn', 'David', 'Aparna', 'Stephanie', 'Braulio', 'Ana', 'Bella', 'Marcus', 'Priya', 'Tom', 'Lucia', 'Kevin', 'Sara', 'Jamal', 'Mei', 'Carlos', 'Olivia', 'Ethan', 'Fatima', 'Ryan', 'Grace', 'Diego', 'Hannah', 'Victor'];
const LAST = ['Arthur', 'Bennett', 'Grant', 'Peña', 'Wilson', 'Rodriguez', 'Nguyen', 'Patel', 'Kim', 'Okafor', 'Silva', 'Brooks', 'Rossi', 'Chen', 'Lopez', 'Martin', 'Haddad', 'Novak'];
const TRAINING_SOURCES = [
  ['Individual Program Website', 'Individual Program'], ['F&I Manager Program Website', 'F&I Manager'],
  ['Auto Broker Program Website', 'Auto Broker'], ['Dealership Packages', 'Dealer package'], ['Amazon Books', 'Book buyer'],
];
const DEALER_SOURCES = ['Website', 'Walk-in', 'Phone-up', 'Facebook', 'Instagram', 'Referral', 'Cars.com', 'Service drive'];

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const chance = (p: number) => Math.random() < p;

export const MINUTES_PER_TICK = 2;
export const START_MINUTE = 8 * 60;

export interface ReportRow { category: string; email: number; phone: number; text: number; other: number }

export class Sim {
  buildings: Building[] = buildCity();
  leads: Lead[] = [];
  feed: FeedItem[] = [];
  approvals: Approval[] = [];
  /** Sim minutes since midnight of day 1. */
  now = START_MINUTE;
  /** Completed tasks per building → category → channel. */
  stats = new Map<string, Map<string, Record<string, number>>>();
  revenue = new Map<string, number>();
  private seq = 0;
  private listeners = new Set<() => void>();

  constructor() {
    for (const b of this.buildings) {
      if (b.kind === 'rental') continue;
      for (let i = 0; i < 4 + Math.floor(Math.random() * 5); i++) this.newLead(b, -Math.floor(Math.random() * 300));
    }
  }

  onChange(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { for (const fn of this.listeners) fn(); }

  building(id: string) { return this.buildings.find(b => b.id === id)!; }
  agents(buildingId?: string): Agent[] {
    return this.buildings.filter(b => !buildingId || b.id === buildingId).flatMap(b => b.floors.flatMap(f => f.agents));
  }
  agent(id: string) { return this.agents().find(a => a.id === id); }
  stages(b: Building) { return b.kind === 'training' ? TRAINING_STAGES : DEALER_STAGES; }

  tick() {
    this.now += MINUTES_PER_TICK;
    for (const b of this.buildings) {
      if (b.kind !== 'rental' && chance(0.04)) this.newLead(b);
      for (const f of b.floors) for (const a of f.agents) this.step(b, a);
    }
    this.emit();
  }

  private step(b: Building, a: Agent) {
    if (a.kind === 'human') {
      if (chance(0.05)) a.status = a.status === 'working' ? 'idle' : 'working';
      return;
    }
    if (a.taskSet === 'none') {
      if (chance(0.05)) a.status = a.status === 'working' ? 'idle' : 'working';
      return;
    }
    if (a.status === 'needs-you') return;
    if (a.status === 'idle') {
      if (chance(0.35)) { a.current = this.makeTask(b, a); a.status = 'working'; }
      return;
    }
    const t = a.current!;
    if (--t.remaining > 0) return;
    if (t.needsApproval) {
      a.status = 'needs-you';
      this.approvals.push({ id: `ap${this.seq++}`, agentId: a.id, buildingId: b.id, text: t.title, t: this.now });
      this.log(a, `Needs your OK: ${t.title}`, 'needs-you');
      return;
    }
    this.complete(b, a);
  }

  private makeTask(b: Building, a: Agent): Task {
    const id = `t${this.seq++}`;
    const remaining = 2 + Math.floor(Math.random() * 5);
    if (a.taskSet === 'social') {
      const s = pick(SOCIAL_TASKS), platform = pick(SOCIAL_PLATFORMS);
      const approval = (s.name === 'Multi-platform publishing' || s.name === 'Lead generation') && chance(0.5);
      const title = approval ? `Publish ${1 + Math.floor(Math.random() * 3)} ${platform} post(s) for ${b.short}` : `${s.name} · ${platform}`;
      return { id, title, category: s.name, remaining, needsApproval: approval };
    }
    const category = pick(a.taskSet === 'fastSales' ? FAST_SALES_TASKS : DEALERSHIP_TASKS);
    const channel = pick(CHANNELS);
    const lead = this.pickLead(b);
    const verb = channel === 'email' ? 'Email' : channel === 'phone' ? 'Call' : 'Text';
    const approval = chance(0.04);
    const title = approval
      ? `${verb} ${lead?.name ?? 'customer'} a special offer (${category})`
      : `${verb} ${lead?.name ?? 'customer list'} · ${category}`;
    return { id, title, category, channel, leadId: lead?.id, remaining, needsApproval: approval };
  }

  private complete(b: Building, a: Agent) {
    const t = a.current!;
    a.done++;
    a.status = 'idle';
    a.current = undefined;
    const byCat = this.stats.get(b.id) ?? new Map();
    const row = byCat.get(t.category) ?? {};
    const key = t.channel ?? 'other';
    row[key] = (row[key] ?? 0) + 1;
    byCat.set(t.category, row);
    this.stats.set(b.id, byCat);

    const lead = t.leadId ? this.leads.find(l => l.id === t.leadId) : undefined;
    if (lead) {
      lead.touchedAt = this.now;
      const stages = this.stages(b);
      const ix = stages.indexOf(lead.stage);
      if (ix < stages.length - 1 && chance(ix === 0 ? 0.6 : 0.25)) {
        lead.stage = stages[ix + 1];
        if (ix + 1 === stages.length - 1) {
          const gross = b.kind === 'training' ? 997 : 1500 + Math.floor(Math.random() * 2500);
          this.revenue.set(b.id, (this.revenue.get(b.id) ?? 0) + gross);
        }
        this.log(a, `${t.title} → ${lead.name} moved to ${lead.stage}`, 'done');
        return;
      }
    }
    this.log(a, `Done: ${t.title}`, 'done');
  }

  resolve(approvalId: string, ok: boolean) {
    const ap = this.approvals.find(p => p.id === approvalId);
    if (!ap) return;
    this.approvals = this.approvals.filter(p => p !== ap);
    const a = this.agent(ap.agentId);
    if (!a?.current) return;
    if (ok) this.complete(this.building(ap.buildingId), a);
    else {
      this.log(a, `Skipped (you said no): ${a.current.title}`, 'info');
      a.current = undefined;
      a.status = 'idle';
    }
    this.emit();
  }

  /** Rent a vacant floor in a rental building: two AI agents move in and start working. */
  rentFloor(buildingId: string, level: number, tenant: string) {
    const b = this.building(buildingId);
    const f = b.floors.find(x => x.level === level);
    if (!f || !f.vacant) return;
    f.vacant = false;
    f.name = tenant;
    f.agents = ['follow-up', 'social'].map((role, i) => ({
      id: `${b.id}-L${level}-${i}`, name: `${tenant.split(' ')[0]} ${role === 'social' ? 'Social' : 'AI'}`, role,
      kind: 'ai' as const, taskSet: role === 'social' ? 'social' as const : 'dealership' as const,
      buildingId: b.id, floor: level, status: 'idle' as const, done: 0,
    }));
    this.feed.unshift({ t: this.now, agent: 'City', buildingId: b.id, text: `${tenant} rented L${level} of ${b.name} ($${f.rent}/mo)`, kind: 'info' });
    this.emit();
  }

  private newLead(b: Building, ageMinutes = 0) {
    const src = b.kind === 'training' ? pick(TRAINING_SOURCES) : [pick(DEALER_SOURCES), `${b.short} ${pick(['new', 'used', 'lease', 'CPO'])}`];
    const t = this.now + ageMinutes;
    this.leads.push({
      id: `l${this.seq++}`, name: `${pick(FIRST)} ${pick(LAST)}`, source: src[0], interest: src[1],
      buildingId: b.id, stage: 'New lead', createdAt: t, touchedAt: t,
    });
  }

  private pickLead(b: Building) {
    const pool = this.leads.filter(l => l.buildingId === b.id && l.stage !== this.stages(b).at(-1));
    // Prefer the leads that have waited longest.
    pool.sort((x, y) => x.touchedAt - y.touchedAt);
    return pool.length ? pool[Math.floor(Math.random() * Math.min(3, pool.length))] : undefined;
  }

  private log(a: Agent, text: string, kind: FeedItem['kind']) {
    this.feed.unshift({ t: this.now, agent: a.name, buildingId: a.buildingId, text, kind });
    if (this.feed.length > 300) this.feed.length = 300;
  }

  kpis(buildingId?: string) {
    const leads = this.leads.filter(l => !buildingId || l.buildingId === buildingId);
    const dayStart = Math.floor(this.now / 1440) * 1440;
    const bs = buildingId ? [this.building(buildingId)] : this.buildings;
    const final = (l: Lead) => this.stages(this.building(l.buildingId)).at(-1) === l.stage;
    const booked = (l: Lead) => ['Call booked', 'Appointment', 'Test drive'].includes(l.stage);
    return {
      leadsToday: leads.filter(l => l.createdAt >= dayStart).length,
      booked: leads.filter(booked).length,
      closed: leads.filter(final).length,
      revenue: bs.reduce((s, b) => s + (this.revenue.get(b.id) ?? 0), 0),
      tasksDone: this.agents(buildingId).reduce((s, a) => s + a.done, 0),
      waiting: leads.filter(l => l.stage === 'New lead' && this.now - l.touchedAt > 60).length,
      agentsWorking: this.agents(buildingId).filter(a => a.status === 'working').length,
      agentsTotal: this.agents(buildingId).length,
    };
  }

  /** Daily email report: completed tasks by category × channel. */
  report(buildingId?: string): ReportRow[] {
    const rows = new Map<string, ReportRow>();
    for (const [bid, byCat] of this.stats) {
      if (buildingId && bid !== buildingId) continue;
      for (const [cat, r] of byCat) {
        const row = rows.get(cat) ?? { category: cat, email: 0, phone: 0, text: 0, other: 0 };
        row.email += r.email ?? 0; row.phone += r.phone ?? 0; row.text += r.text ?? 0; row.other += r.other ?? 0;
        rows.set(cat, row);
      }
    }
    return [...rows.values()].sort((a, b) => (b.email + b.phone + b.text + b.other) - (a.email + a.phone + a.text + a.other));
  }
}

export function clock(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
