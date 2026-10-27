import { BRAND_MODELS, buildCity, makeAgent, TRAINING_SOURCES } from './data/buildings';
import {
  CATEGORY_COPY, COMPETITOR_INSIGHTS, CTAS, DEALER_TOPICS, fill, FORMATS, HOOKS, INBOX_SAMPLES, OPTIMIZATION_INSIGHTS,
  PLATFORMS, POST_TIMES, SOCIAL_HANDLES, STRATEGY_INSIGHTS, TRAINING_TOPICS, TREND_INSIGHTS,
} from './data/templates';
import { CHANNELS, DEALERSHIP_TASKS, FAST_SALES_TASKS } from './data/tasks';
import type {
  Agent, Approval, ApprovalKind, Building, Channel, ContentItem, FeedItem, Floor, InboxItem, Insight, Lead, Message,
  MessageStatus, Patch, Report, Settings, Snapshot, StageEvent, StatsDump, Task, Tenant,
} from './types';

export const TRAINING_STAGES = ['New lead', 'Contacted', 'Call booked', 'Training started', 'Active student', 'Completed / placed'];
export const DEALER_STAGES = ['New lead', 'Contacted', 'Appointment', 'Test drive', 'Negotiation', 'Sold'];
export const AFFILIATE_STAGES = ['New affiliate', 'Contacted', 'Signed up', 'Active affiliate'];
/** Stage that counts as "booked" and the one that counts as "closed" (enrolled / sold). */
const BOOKED = new Set(['Call booked', 'Appointment']);
const CLOSED = new Set(['Training started', 'Sold']);

const FIRST = ['Glenn', 'David', 'Aparna', 'Stephanie', 'Braulio', 'Ana', 'Bella', 'Marcus', 'Priya', 'Tom', 'Lucia', 'Kevin', 'Sara', 'Jamal', 'Mei', 'Carlos', 'Olivia', 'Ethan', 'Fatima', 'Ryan', 'Grace', 'Diego', 'Hannah', 'Victor'];
const LAST = ['Arthur', 'Bennett', 'Grant', 'Peña', 'Wilson', 'Rodriguez', 'Nguyen', 'Patel', 'Kim', 'Okafor', 'Silva', 'Brooks', 'Rossi', 'Chen', 'Lopez', 'Martin', 'Haddad', 'Novak'];
const DEALER_SOURCES = ['Website', 'Walk-in', 'Phone-up', 'Facebook', 'Instagram', 'Referral', 'Cars.com', 'Service drive'];
const AFFILIATE_CATS = new Set(['New affiliates', 'Affiliates follow-up']);
/** Tasks aimed at people who already bought / enrolled, not at open prospects. */
const CUSTOMER_CATS = new Set([
  'Sold customers', 'Customer birthday', 'Ownership anniversary', 'CSI follow', 'Lease end', 'Service visits', 'Orphans',
  'Mastermind', 'Current customers', 'Contract to expire', 'Referrals',
]);
/** Minimum minutes between agent touches on the same prospect / customer. */
const COOLDOWN = { prospect: 360, customer: 3 * 1440 };

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const chance = (p: number) => Math.random() < p;
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

export const MINUTES_PER_TICK = 2;
const LIMITS = { feed: 300, messages: 300, inbox: 400, insights: 200, reports: 60, leads: 3000, stageDays: 45 };

export const DEFAULT_SETTINGS: Settings = {
  companyName: 'Fast Sales',
  reportRecipients: [],
  deliveryMode: 'simulate',
  crmUrlTemplate: '',
  morningReportAt: 8 * 60,
  dailyReportAt: 18 * 60,
  aiDrafts: false,
  speed: 1,
};

export interface ReportRow { category: string; email: number; phone: number; text: number; other: number }
type Stats = Map<string, Map<string, Record<string, number>>>;

/** Side effects the server plugs in (delivery, AI drafting). The browser mirror leaves them unset. */
export interface SimHooks {
  outbound?(m: Message, lead?: Lead): void;
  report?(r: Report): void;
  draftPost?(c: ContentItem, b: Building): void;
  draftMessage?(m: Message, lead: Lead, b: Building): void;
}

export class Sim {
  startDate: string;
  now: number;
  buildings: Building[];
  leads = new Map<string, Lead>();
  feed: FeedItem[] = [];
  approvals: Approval[] = [];
  messages = new Map<string, Message>();
  content = new Map<string, ContentItem>();
  inbox = new Map<string, InboxItem>();
  insights = new Map<string, Insight>();
  reports = new Map<string, Report>();
  stats: Stats = new Map();
  statsToday: Stats = new Map();
  statsDay = 0;
  revenue: Snapshot['revenue'] = [];
  stageLog: StageEvent[] = [];
  settings: Settings;
  hooks: SimHooks = {};
  private seq: number;
  private agentIx = new Map<string, Agent>();
  private listeners = new Set<() => void>();

  // change tracking for patches
  private dAgents = new Set<string>();
  private dFloors = new Set<string>();
  private dLeads = new Set<string>();
  private dMessages = new Set<string>();
  private dContent = new Set<string>();
  private dInbox = new Set<string>();
  private dInsights = new Set<string>();
  private dReports = new Set<string>();
  private removedLeads: string[] = [];
  private removedContent: string[] = [];
  private newFeed: FeedItem[] = [];
  private newStage: StageEvent[] = [];
  private dApprovals = false;
  private dStats = false;
  private dRevenue = false;
  private dSettings = false;

  constructor(s: Snapshot) {
    this.startDate = s.startDate;
    this.now = s.now;
    this.buildings = s.buildings;
    for (const l of s.leads) this.leads.set(l.id, l);
    this.feed = s.feed;
    this.approvals = s.approvals;
    for (const m of s.messages) this.messages.set(m.id, m);
    for (const c of s.content) this.content.set(c.id, c);
    for (const i of s.inbox) this.inbox.set(i.id, i);
    for (const i of s.insights) this.insights.set(i.id, i);
    for (const r of s.reports) this.reports.set(r.id, r);
    this.stats = undump(s.stats);
    this.statsToday = undump(s.statsToday);
    this.statsDay = s.statsDay;
    this.revenue = s.revenue;
    this.stageLog = s.stageLog;
    this.settings = { ...DEFAULT_SETTINGS, ...s.settings };
    this.seq = s.seq;
    this.reindex();
  }

  static readonly VERSION = 2;

  /** A fresh city: seeded leads and a few days of planned content. */
  static create(startDate = new Date().toISOString().slice(0, 10)): Sim {
    const sim = new Sim({
      version: Sim.VERSION, startDate, now: 8 * 60, buildings: buildCity(), leads: [], feed: [], approvals: [], messages: [],
      content: [], inbox: [], insights: [], reports: [], stats: [], statsToday: [], statsDay: 0, revenue: [], stageLog: [],
      settings: DEFAULT_SETTINGS, seq: 1,
    });
    for (const b of sim.buildings) {
      if (b.kind === 'rental') continue;
      for (let i = 0; i < rint(4, 8); i++) sim.newLead(b, -rint(0, 300));
      // An existing customer base for birthday / service / lease-end / CSI work.
      for (let i = 0; i < 20; i++) {
        const l = sim.newLead(b, -rint(2, 400) * 1440);
        l.stage = sim.stagesFor(l).at(-1)!;
        l.history.unshift({ t: l.createdAt, text: `Became a customer`, channel: 'stage' });
      }
    }
    for (let i = 0; i < 6; i++) sim.newLead(sim.building('fast-sales'), -rint(0, 3000), { kind: 'affiliate', source: 'Affiliate inquiry', interest: 'Affiliate', floor: 3, stage: AFFILIATE_STAGES[0] });
    sim.takePatch();
    return sim;
  }

  snapshot(): Snapshot {
    return {
      version: Sim.VERSION, startDate: this.startDate, now: this.now, buildings: this.buildings,
      leads: [...this.leads.values()], feed: this.feed, approvals: this.approvals, messages: [...this.messages.values()],
      content: [...this.content.values()], inbox: [...this.inbox.values()], insights: [...this.insights.values()],
      reports: [...this.reports.values()], stats: dump(this.stats), statsToday: dump(this.statsToday), statsDay: this.statsDay,
      revenue: this.revenue, stageLog: this.stageLog, settings: this.settings, seq: this.seq,
    };
  }

  // ── change tracking ─────────────────────────────────────────
  onChange(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(); }

  private reindex() {
    this.agentIx.clear();
    for (const b of this.buildings) for (const f of b.floors) for (const a of f.agents) this.agentIx.set(a.id, a);
  }

  takePatch(): Patch | undefined {
    const p: Patch = { now: this.now };
    let any = false;
    const put = <K extends keyof Patch>(k: K, v: Patch[K] | undefined) => { if (v && (!Array.isArray(v) || v.length)) { p[k] = v; any = true; } };
    put('floors', [...this.dFloors].map(key => {
      const [buildingId, level] = key.split('|');
      return { buildingId, floor: this.building(buildingId).floors.find(f => f.level === Number(level))! };
    }));
    // Categories never change after creation, so leave them out of the per-tick traffic.
    put('agents', [...this.dAgents].map(id => this.agentIx.get(id)).filter(a => !!a).map(({ categories: _c, ...rest }) => rest as Agent));
    put('leads', [...this.dLeads].map(id => this.leads.get(id)!).filter(Boolean));
    put('removedLeads', this.removedLeads);
    put('feed', this.newFeed);
    put('messages', [...this.dMessages].map(id => this.messages.get(id)!).filter(Boolean));
    put('content', [...this.dContent].map(id => this.content.get(id)!).filter(Boolean));
    put('removedContent', this.removedContent);
    put('inbox', [...this.dInbox].map(id => this.inbox.get(id)!).filter(Boolean));
    put('insights', [...this.dInsights].map(id => this.insights.get(id)!).filter(Boolean));
    put('reports', [...this.dReports].map(id => this.reports.get(id)!).filter(Boolean));
    put('stageLog', this.newStage);
    if (this.dApprovals) { p.approvals = this.approvals; any = true; }
    if (this.dStats) { p.stats = dump(this.stats); p.statsToday = dump(this.statsToday); p.statsDay = this.statsDay; any = true; }
    if (this.dRevenue) { p.revenue = this.revenue; any = true; }
    if (this.dSettings) { p.settings = this.settings; any = true; }
    for (const s of [this.dAgents, this.dFloors, this.dLeads, this.dMessages, this.dContent, this.dInbox, this.dInsights, this.dReports]) s.clear();
    this.removedLeads = []; this.removedContent = []; this.newFeed = []; this.newStage = [];
    this.dApprovals = this.dStats = this.dRevenue = this.dSettings = false;
    return any ? p : undefined;
  }

  /** Browser side: fold a server patch into this mirror. */
  applyPatch(p: Patch) {
    this.now = p.now;
    for (const { buildingId, floor } of p.floors ?? []) {
      const b = this.building(buildingId);
      b.floors = b.floors.map(f => (f.level === floor.level ? floor : f));
    }
    if (p.floors) this.reindex();
    for (const a of p.agents ?? []) {
      const mine = this.agentIx.get(a.id);
      if (mine) { Object.assign(mine, a); if (!a.current) delete mine.current; }
    }
    for (const l of p.leads ?? []) this.leads.set(l.id, l);
    for (const id of p.removedLeads ?? []) this.leads.delete(id);
    if (p.feed) { this.feed.unshift(...p.feed); this.feed.length = Math.min(this.feed.length, LIMITS.feed); }
    for (const m of p.messages ?? []) this.messages.set(m.id, m);
    for (const c of p.content ?? []) this.content.set(c.id, c);
    for (const id of p.removedContent ?? []) this.content.delete(id);
    for (const i of p.inbox ?? []) this.inbox.set(i.id, i);
    for (const i of p.insights ?? []) this.insights.set(i.id, i);
    for (const r of p.reports ?? []) this.reports.set(r.id, r);
    if (p.stageLog) this.stageLog.push(...p.stageLog);
    if (p.approvals) this.approvals = p.approvals;
    if (p.stats) { this.stats = undump(p.stats); this.statsToday = undump(p.statsToday ?? []); this.statsDay = p.statsDay ?? 0; }
    if (p.revenue) this.revenue = p.revenue;
    if (p.settings) this.settings = p.settings;
    this.trim();
    this.emit();
  }

  private markAgent(a: Agent) { this.dAgents.add(a.id); }
  private markLead(l: Lead) { this.dLeads.add(l.id); }
  private markFloor(b: Building, f: Floor) { this.dFloors.add(`${b.id}|${f.level}`); }

  // ── lookups ─────────────────────────────────────────────────
  building(id: string) { return this.buildings.find(b => b.id === id)!; }
  agents(buildingId?: string): Agent[] {
    if (!buildingId) return [...this.agentIx.values()];
    return this.building(buildingId).floors.flatMap(f => f.agents);
  }
  agent(id: string) { return this.agentIx.get(id); }
  stagesFor(l: Lead) {
    if (l.kind === 'affiliate') return AFFILIATE_STAGES;
    return this.building(l.buildingId).kind === 'training' ? TRAINING_STAGES : DEALER_STAGES;
  }
  stages(b: Building) { return b.kind === 'training' ? TRAINING_STAGES : DEALER_STAGES; }
  get today() { return Math.floor(this.now / 1440); }
  dateOf(day: number) {
    const d = new Date(`${this.startDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + day);
    return d;
  }
  dayLabel(day: number) {
    return this.dateOf(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  private monthStart() {
    const d = this.dateOf(this.today);
    return (this.today - (d.getUTCDate() - 1)) * 1440;
  }
  private nextId(prefix: string) { return `${prefix}${this.seq++}`; }

  // ── the clock ───────────────────────────────────────────────
  tick() {
    const prev = this.now;
    this.now += MINUTES_PER_TICK;
    const crossed = (minuteOfDay: number) => {
      const at = this.today * 1440 + minuteOfDay;
      return prev < at && at <= this.now;
    };
    if (this.today !== this.statsDay) { this.statsToday.clear(); this.statsDay = this.today; this.dStats = true; this.rollContent(); }

    if (crossed(this.settings.morningReportAt)) this.morningReports();
    if (crossed(this.settings.dailyReportAt)) this.dailyReport();
    if (crossed(9 * 60) && this.dateOf(this.today).getUTCDay() === 1) this.weeklySocialReport();
    if (crossed(10 * 60)) this.adTests();
    if (Math.floor(prev / 60) !== Math.floor(this.now / 60)) this.hourly();
    if (Math.floor(prev / 10) !== Math.floor(this.now / 10)) this.unblock();

    for (const c of this.content.values()) {
      if (c.status === 'scheduled' && c.day * 1440 + toMinutes(c.time) <= this.now) this.publish(c);
    }
    for (const b of this.buildings) {
      const rate = b.kind === 'rental' ? 0.01 * b.floors.filter(f => f.tenant).length : 0.035;
      if (rate && chance(rate)) this.newLead(b);
      for (const f of b.floors) for (const a of f.agents) this.step(b, a);
    }
    this.trim();
    this.emit();
  }

  private step(b: Building, a: Agent) {
    if (a.kind === 'human' || a.taskSet === 'none') {
      if (a.userId) return; // signed-in people set their own duty status
      if (chance(0.04)) { a.status = a.status === 'working' ? 'idle' : 'working'; this.markAgent(a); }
      return;
    }
    if (a.status === 'needs-you') return;
    if (a.status === 'idle') {
      if (!chance(a.taskSet === 'manager' ? 0.15 : 0.35)) return;
      const t = a.taskSet === 'social' ? this.socialTask(b, a) : this.contactTask(b, a);
      if (!t) return;
      a.current = t;
      a.status = 'working';
      this.markAgent(a);
      return;
    }
    const t = a.current;
    if (!t) { a.status = 'idle'; this.markAgent(a); return; }
    if (--t.remaining > 0) { this.markAgent(a); return; }
    if (t.action === 'social') this.finishSocial(b, a, t);
    else this.finishContact(b, a, t);
  }

  // ── contact tasks (email / phone / text) ────────────────────
  private contactTask(b: Building, a: Agent): Task | undefined {
    if (!a.categories.length) return;
    const category = pick(a.categories);
    const lead = this.pickLead(b, a, category);
    if (!lead) return;
    const channel = pick(CHANNELS);
    const verb = channel === 'email' ? 'Email' : channel === 'phone' ? 'Call' : 'Text';
    const offer = !lead.real && chance(0.01);
    return {
      id: this.nextId('t'), action: 'contact', category, channel, leadId: lead.id, remaining: rint(2, 6),
      needsApproval: offer || lead.real,
      title: offer ? `${verb} ${lead.name} a special offer (${category})` : `${verb} ${lead.name} · ${category}`,
    };
  }

  private pickLead(b: Building, a: Agent, category: string) {
    const affiliate = AFFILIATE_CATS.has(category);
    const customers = !affiliate && CUSTOMER_CATS.has(category);
    const wait = customers ? COOLDOWN.customer : COOLDOWN.prospect;
    let pool = [...this.leads.values()].filter(l =>
      l.buildingId === b.id && (l.kind === 'affiliate') === affiliate
      && (affiliate || (l.stage === this.stagesFor(l).at(-1)) === customers)
      && (l.touchedAt === l.createdAt || this.now - l.touchedAt >= wait)
      && !this.busy.has(l.id));
    if (b.kind === 'training' && a.floor !== 12) {
      const mine = pool.filter(l => l.floor === a.floor);
      if (mine.length) pool = mine;
    }
    // Speed to lead: never-touched leads first, then ones a manager flagged, then the longest-waiting.
    const fresh = (l: Lead) => Number(l.touchedAt === l.createdAt);
    pool.sort((x, y) => fresh(y) - fresh(x) || Number(!!y.priority) - Number(!!x.priority) || x.touchedAt - y.touchedAt);
    const lead = pool.length ? pool[Math.floor(Math.random() * Math.min(3, pool.length))] : undefined;
    if (lead) this.busy.add(lead.id);
    return lead;
  }
  /** Leads some agent is already working right now. */
  private busy = new Set<string>();

  private compose(b: Building, a: Agent, lead: Lead, category: string, channel: Channel) {
    const copy = CATEGORY_COPY[category] ?? CATEGORY_COPY['Follow-up'];
    const v = {
      first: lead.name.split(' ')[0], agent: a.name.replace(/'s AI$/, ''), interest: lead.interest,
      store: b.kind === 'training' ? 'Fast Sales Training Center' : b.kind === 'associates' ? 'Rick Case Honda' : b.name,
    };
    if (channel === 'email') return { subject: fill(copy.subject, v), body: fill(copy.email, v) };
    if (channel === 'text') return { body: fill(copy.text, v) };
    return { body: `Call script: ${fill(copy.call, v)}` };
  }

  private finishContact(b: Building, a: Agent, t: Task) {
    const lead = t.leadId ? this.leads.get(t.leadId) : undefined;
    if (!lead) return this.release(a);
    const channel = t.channel!;
    const { subject, body } = this.compose(b, a, lead, t.category, channel);

    if (lead.real) {
      // Real people are never contacted without a human OK.
      const to = channel === 'email' ? lead.email : lead.phone;
      if (!to) {
        this.log(a, `Skipped ${t.title}: no ${channel === 'email' ? 'email' : 'phone'} on file`, 'info');
        return this.release(a);
      }
      const m = this.addMessage({ buildingId: b.id, agentId: a.id, agentName: a.name, leadId: lead.id, channel, to, subject, body, category: t.category, status: 'pending', real: true, by: 'template' });
      this.hooks.draftMessage?.(m, lead, b);
      a.status = 'needs-you';
      this.markAgent(a);
      const kind: ApprovalKind = channel === 'phone' ? 'call' : 'message';
      this.ask(kind, a, b.id, channel === 'phone' ? `Call ${lead.name} (${lead.phone}) · ${t.category}` : `${channel === 'email' ? 'Email' : 'Text'} ${lead.name} · ${t.category}`, m.id);
      return;
    }
    if (t.needsApproval && a.status !== 'needs-you') {
      a.status = 'needs-you';
      this.markAgent(a);
      this.ask('task', a, b.id, t.title);
      this.log(a, `Needs your OK: ${t.title}`, 'needs-you');
      return;
    }
    this.completeContact(b, a, t, lead, subject, body);
  }

  private completeContact(b: Building, a: Agent, t: Task, lead: Lead, subject: string | undefined, body: string, status: MessageStatus = 'simulated') {
    const channel = t.channel!;
    const outcome = channel === 'phone' ? pick(['Spoke – interested', 'Left voicemail', 'No answer', 'Spoke – call back later']) : undefined;
    this.addMessage({
      buildingId: b.id, agentId: a.id, agentName: a.name, leadId: lead.id, channel, to: lead.email ?? lead.phone ?? lead.name,
      subject, body: outcome ? `${body}\nOutcome: ${outcome}` : body, category: t.category, status, real: lead.real, by: 'template',
    });
    this.count(b.id, t.category, channel);
    a.done++;
    lead.touchedAt = this.now;
    lead.priority = false;
    this.history(lead, `${channel === 'email' ? 'Emailed' : channel === 'phone' ? `Called (${outcome})` : 'Texted'} · ${t.category}`, a.name, channel);
    const stages = this.stagesFor(lead);
    const ix = stages.indexOf(lead.stage);
    if (!lead.real && ix < stages.length - 1 && chance(ix === 0 ? 0.5 : 0.15)) {
      this.setStage(lead, stages[ix + 1], a.name);
      this.log(a, `${t.title} → ${lead.name} moved to ${lead.stage}`, 'done');
    } else this.log(a, `Done: ${t.title}`, 'done');
    this.markLead(lead);
    this.release(a);
  }

  private release(a: Agent) {
    if (a.current?.leadId) this.busy.delete(a.current.leadId);
    a.status = 'idle';
    a.current = undefined;
    this.markAgent(a);
  }

  private setStage(lead: Lead, stage: string, by: string) {
    lead.stage = stage;
    lead.stageAt = this.now;
    this.history(lead, `Stage → ${stage}`, by, 'stage');
    this.stageLog.push({ t: this.now, b: lead.buildingId, s: stage });
    this.newStage.push({ t: this.now, b: lead.buildingId, s: stage });
    const b = this.building(lead.buildingId);
    if (lead.kind === 'customer' && b.kind !== 'training' && stage === this.stages(b).at(-1)) {
      const amount = rint(1500, 4000);
      this.revenue.push({ t: this.now, buildingId: b.id, amount });
      this.dRevenue = true;
    }
    if (lead.kind === 'customer' && b.kind === 'training' && stage === 'Training started') {
      this.revenue.push({ t: this.now, buildingId: b.id, amount: 997 });
      this.dRevenue = true;
    }
    this.markLead(lead);
  }

  private history(lead: Lead, text: string, agent?: string, channel?: Lead['history'][number]['channel']) {
    lead.history.unshift({ t: this.now, text, agent, channel });
    if (lead.history.length > 15) lead.history.length = 15;
  }

  private count(buildingId: string, category: string, channel: string) {
    for (const stats of [this.stats, this.statsToday]) {
      const byCat = stats.get(buildingId) ?? new Map();
      const row = byCat.get(category) ?? {};
      row[channel] = (row[channel] ?? 0) + 1;
      byCat.set(category, row);
      stats.set(buildingId, byCat);
    }
    this.dStats = true;
  }

  // ── social media agents ─────────────────────────────────────
  private socialTask(b: Building, a: Agent): Task | undefined {
    const mk = (category: string, title: string, extra: Partial<Task> = {}): Task =>
      ({ id: this.nextId('t'), action: 'social', category, title, remaining: rint(2, 5), needsApproval: false, ...extra });
    const items = [...this.content.values()].filter(c => c.buildingId === b.id && !c.agentId);
    const open = [...this.inbox.values()].find(i => i.buildingId === b.id && i.status === 'open');
    if (open) {
      open.status = 'answered'; // claimed; finishSocial sets the real outcome
      this.dInbox.add(open.id);
      return mk('Community engagement', `Reply to ${open.author} on ${open.platform}`, { inboxId: open.id });
    }
    const planned = [...this.content.values()].filter(c => c.buildingId === b.id && c.day >= this.today && c.status !== 'rejected').length;
    if (planned < 30) return mk('Content calendar', `Plan the next posts on ${b.short}'s 30-day calendar`);
    const claim = (c: ContentItem, cat: string, title: string) => { c.agentId = a.id; this.dContent.add(c.id); return mk(cat, title, { contentId: c.id }); };
    // Write and produce a week ahead; ask for approval a few days ahead so the OK queue stays short.
    const idea = items.find(c => c.status === 'idea' && c.day <= this.today + 7);
    if (idea) return claim(idea, 'Content creation', `Write ${idea.platform} ${idea.format}: ${idea.topic}`);
    const draft = items.find(c => c.status === 'draft');
    if (draft) return claim(draft, 'Graphic & video production', `Produce ${draft.format} for "${draft.topic}"`);
    const ready = items.find(c => c.status === 'asset-ready' && c.day <= this.today + 3);
    if (ready) return claim(ready, 'Multi-platform publishing', `Schedule ${ready.platform} post for ${this.dayLabel(ready.day)} ${ready.time}`);
    const cat = pick(['Trend monitoring', 'Competitor analysis', 'Performance analytics', 'Content optimization', 'Content strategy', 'Lead generation', 'Weekly reporting']);
    return mk(cat, `${cat} · ${b.short}`);
  }

  private finishSocial(b: Building, a: Agent, t: Task) {
    const c = t.contentId ? this.content.get(t.contentId) : undefined;
    if (c) { c.agentId = undefined; this.dContent.add(c.id); }
    switch (t.category) {
      case 'Content calendar': this.planCalendar(b); break;
      case 'Content creation': if (c) this.draftContent(b, c); break;
      case 'Graphic & video production':
        if (c) { c.brief = `${cap(c.format)} brief: ${c.topic}. Brand colours, ${c.format === 'reel' || c.format === 'video' ? '15–30s vertical, captions on, hook in first 2s' : '1080×1350, bold headline, logo bottom-right'}.`; c.status = 'asset-ready'; }
        break;
      case 'Multi-platform publishing':
        if (c) { c.status = 'needs-approval'; this.ask('post', a, b.id, `Publish ${c.platform} ${c.format} on ${this.dayLabel(c.day)} ${c.time}: ${c.topic}`, c.id); }
        break;
      case 'Community engagement': if (t.inboxId) this.engage(b, a, t.inboxId); break;
      case 'Lead generation': {
        const day = this.today + 1;
        if ([...this.content.values()].some(x => x.buildingId === b.id && x.campaign && x.day >= this.today)) break;
        const lg: ContentItem = {
          id: this.nextId('c'), buildingId: b.id, day, time: '18:00', platform: pick(['Facebook', 'Instagram']), format: 'carousel', campaign: true,
          topic: b.kind === 'training' ? 'Enroll now: next class starts Monday' : `Get pre-approved in 2 minutes – ${b.short}`, status: 'idea',
        };
        this.content.set(lg.id, lg); this.dContent.add(lg.id);
        this.addInsight(b.id, 'campaign', a.name, `Lead-gen campaign queued for ${this.dayLabel(day)}: "${lg.topic}"`);
        break;
      }
      case 'Trend monitoring': this.addInsight(b.id, 'trend', a.name, pick(TREND_INSIGHTS)); break;
      case 'Competitor analysis': this.addInsight(b.id, 'competitor', a.name, pick(COMPETITOR_INSIGHTS)); break;
      case 'Content optimization': this.addInsight(b.id, 'optimization', a.name, pick(OPTIMIZATION_INSIGHTS)); break;
      case 'Content strategy': this.addInsight(b.id, 'strategy', a.name, pick(STRATEGY_INSIGHTS)); break;
      case 'Performance analytics': {
        const m = this.socialTotals(b.id, 7);
        this.addInsight(b.id, 'optimization', a.name, `Last 7 days: ${m.posts} posts, ${m.reach.toLocaleString()} reach, ${m.engagement.toLocaleString()} engagements, ${m.clicks} clicks, ${m.leads} leads.`);
        break;
      }
      case 'Weekly reporting': this.addInsight(b.id, 'strategy', a.name, `Weekly log ready: ${this.socialTotals(b.id, 7).posts} posts published, ${[...this.content.values()].filter(x => x.buildingId === b.id && x.status === 'scheduled').length} scheduled.`); break;
    }
    this.count(b.id, t.category, 'other');
    a.done++;
    this.log(a, `Done: ${t.title}`, 'done');
    this.release(a);
  }

  /** Posts that missed their day (never approved / produced) move to the next open day. */
  private rollContent() {
    for (const c of this.content.values()) {
      if (c.day >= this.today || !['idea', 'draft', 'asset-ready', 'needs-approval'].includes(c.status)) continue;
      const taken = new Set([...this.content.values()].filter(x => x.buildingId === c.buildingId && x.day >= this.today).map(x => x.day));
      let d = this.today + 1;
      while (taken.has(d)) d++;
      c.day = d;
      this.dContent.add(c.id);
    }
  }

  private planCalendar(b: Building) {
    const taken = new Set([...this.content.values()].filter(c => c.buildingId === b.id).map(c => c.day));
    let added = 0;
    for (let d = this.today; d < this.today + 30 && added < 7; d++) {
      if (taken.has(d)) continue;
      const c: ContentItem = {
        id: this.nextId('c'), buildingId: b.id, day: d, time: pick(POST_TIMES), platform: pick(PLATFORMS),
        format: pick(FORMATS), topic: this.topic(b), status: 'idea',
      };
      this.content.set(c.id, c);
      this.dContent.add(c.id);
      added++;
    }
  }

  private topic(b: Building) {
    const model = pick(BRAND_MODELS[b.brand ?? ''] ?? ['latest model']);
    return fill(pick(b.kind === 'training' ? TRAINING_TOPICS : DEALER_TOPICS), { model }).replace(/\{model\}/g, model);
  }

  private draftContent(b: Building, c: ContentItem) {
    const store = b.kind === 'training' ? 'Fast Sales' : b.short;
    c.hook = pick(HOOKS);
    c.caption = `${c.hook} ${c.topic}. ${b.kind === 'training' ? 'Learn the exact process our students use to win more deals.' : `Come see us at ${store} – our team makes it easy.`}`;
    c.cta = c.campaign ? 'Tap to get started – takes 2 minutes' : pick(CTAS);
    c.hashtags = [`#${store.replace(/\W/g, '')}`, b.kind === 'training' ? '#CarSales' : '#NewCar', '#Auto', b.kind === 'training' ? '#SalesTraining' : '#TestDrive'];
    c.status = 'draft';
    c.by = 'template';
    this.hooks.draftPost?.(c, b);
  }

  private publish(c: ContentItem) {
    c.status = 'published';
    c.publishedAt = this.now;
    const base = { TikTok: 1800, Instagram: 1200, Facebook: 900, YouTube: 700, LinkedIn: 500 }[c.platform] ?? 800;
    const mult = c.format === 'reel' || c.format === 'video' ? 2.2 : c.format === 'carousel' ? 1.4 : 1;
    const reach = Math.round(base * mult * (0.6 + Math.random() * 0.8));
    c.metrics = { reach, impressions: Math.round(reach * 1.6), engagement: Math.round(reach * 0.05), clicks: Math.round(reach * 0.012), leads: 0 };
    this.dContent.add(c.id);
    const b = this.building(c.buildingId);
    this.pushFeed({ t: this.now, agent: 'Social', buildingId: b.id, text: `Published on ${c.platform}: ${c.topic}`, kind: 'done' });
  }

  private engage(b: Building, a: Agent, inboxId: string) {
    const i = this.inbox.get(inboxId);
    if (!i) return;
    const sample = INBOX_SAMPLES.find(s => s.text === i.text);
    if (i.intent === 'sensitive') {
      i.status = 'escalated';
      i.reply = 'I\'m sorry about this. I\'ve asked our manager to contact you personally today – could you DM us your phone number?';
      this.ask('reply', a, b.id, `Escalated ${i.platform} ${i.kind} from ${i.author}: "${i.text}"`, i.id);
      this.log(a, `Escalated a sensitive ${i.platform} message from ${i.author} to you`, 'needs-you');
    } else if (i.intent === 'lead') {
      const lead = this.newLead(b, 0, { source: i.platform, name: `${pick(FIRST)} ${pick(LAST)}` });
      i.leadId = lead.id;
      i.status = 'answered';
      i.reply = 'Thanks for reaching out! We just sent you a DM to get you the details.';
      this.history(lead, `Came in from ${i.platform} (${i.author}): "${i.text}"`, a.name, 'social');
      const post = i.contentId ? this.content.get(i.contentId) : undefined;
      if (post?.metrics) { post.metrics.leads++; this.dContent.add(post.id); }
    } else {
      i.status = 'answered';
      i.reply = sample?.reply ?? 'Thank you!';
    }
    this.dInbox.add(i.id);
  }

  socialTotals(buildingId: string | undefined, days: number) {
    const since = this.now - days * 1440;
    const posts = [...this.content.values()].filter(c => (!buildingId || c.buildingId === buildingId) && c.status === 'published' && (c.publishedAt ?? 0) >= since);
    const sum = (k: keyof NonNullable<ContentItem['metrics']>) => posts.reduce((s, c) => s + (c.metrics?.[k] ?? 0), 0);
    return { posts: posts.length, reach: sum('reach'), impressions: sum('impressions'), engagement: sum('engagement'), clicks: sum('clicks'), leads: sum('leads'), top: posts.sort((x, y) => (y.metrics?.engagement ?? 0) - (x.metrics?.engagement ?? 0))[0] };
  }

  private addInsight(buildingId: string, kind: Insight['kind'], agent: string, text: string) {
    const i: Insight = { id: this.nextId('i'), t: this.now, buildingId, kind, agent, text };
    this.insights.set(i.id, i);
    this.dInsights.add(i.id);
  }

  // ── routines run by managers (Max, store managers) ─────────
  private manager(b: Building) {
    return b.floors.flatMap(f => f.agents).find(a => a.taskSet === 'manager');
  }

  private hourly() {
    for (const b of this.buildings) {
      // Fresh posts collect engagement, comments and DMs.
      for (const c of this.content.values()) {
        if (c.buildingId !== b.id || c.status !== 'published' || !c.metrics || this.now - (c.publishedAt ?? 0) > 3 * 1440) continue;
        const grow = 1 + Math.random() * 0.08;
        c.metrics.reach = Math.round(c.metrics.reach * grow);
        c.metrics.impressions = Math.round(c.metrics.impressions * grow);
        c.metrics.engagement = Math.round(c.metrics.engagement * grow) + rint(0, 3);
        c.metrics.clicks += rint(0, 2);
        this.dContent.add(c.id);
        if (chance(0.12)) {
          const s = pick(INBOX_SAMPLES);
          const i: InboxItem = { id: this.nextId('m'), t: this.now, buildingId: b.id, platform: c.platform, author: pick(SOCIAL_HANDLES), kind: pick(['comment', 'comment', 'dm', 'mention'] as const), text: s.text, intent: s.intent, status: 'open', contentId: c.id };
          this.inbox.set(i.id, i);
          this.dInbox.add(i.id);
        }
      }
      // Managers check for leads waiting over an hour and hand them to a closer.
      const mgr = this.manager(b);
      if (!mgr) continue;
      const waiting = [...this.leads.values()].filter(l => l.buildingId === b.id && this.isWaiting(l));
      if (!waiting.length) continue;
      const closer = this.agents(b.id).find(a => a.role === 'closer') ?? this.agents(b.id).find(a => a.taskSet === 'dealership' || a.taskSet === 'fastSales');
      for (const l of waiting) { l.priority = true; this.markLead(l); }
      if (closer) this.log(mgr, `${waiting.length} new lead(s) waiting over 1 hour: asked ${closer.name} to prioritise them`, 'info');
    }
  }

  /**
   * Nobody answered within an hour: simulated special offers lapse; messages to real people stay
   * in the OK queue, but the agent stops waiting and goes back to work.
   */
  private unblock() {
    for (const ap of [...this.approvals]) {
      if (!ap.taskId || this.now - ap.t < 60) continue;
      const a = this.agent(ap.agentId);
      const waiting = a?.current?.id === ap.taskId;
      if (ap.kind === 'task') {
        this.approvals = this.approvals.filter(p => p !== ap);
        this.dApprovals = true;
        if (a && waiting) { this.log(a, `No answer in an hour – offer lapsed: ${ap.text}`, 'info'); this.release(a); }
      } else if (a && waiting) {
        this.log(a, `Still waiting for your OK on "${ap.text}" – moving on meanwhile`, 'needs-you');
        this.release(a);
      }
    }
  }

  private isWaiting(l: Lead) {
    // Nobody has reached out yet and it's been over an hour.
    return (l.stage === 'New lead' || l.stage === 'New affiliate') && l.touchedAt === l.createdAt && this.now - l.createdAt > 60;
  }

  private adTests() {
    for (const b of this.buildings) {
      const mgr = this.manager(b);
      const ads = this.agents(b.id).find(a => a.role === 'ads');
      if (!mgr || !ads || !chance(0.4)) continue;
      const n = rint(2, 4);
      this.ask('ads', ads, b.id, `Test ${n} new ad variations for ${b.short}`);
      this.log(mgr, `Needs your OK: Test ${n} new ad variations`, 'needs-you');
    }
  }

  private morningReports() {
    const lines: string[] = [];
    for (const b of this.buildings) {
      const mgr = this.manager(b);
      if (!mgr) continue;
      const k = this.kpis(b.id);
      const training = b.kind === 'training';
      const text = `Morning report sent: ${k.leadsToday} new leads, ${k.booked24h} ${training ? 'calls booked' : 'appointments set'}, ${k.closedMonth} ${training ? 'enrolled' : 'sold'} this month`;
      this.log(mgr, text, 'info');
      lines.push(`${b.name}: ${k.leadsToday} new leads · ${k.booked24h} ${training ? 'calls booked' : 'appointments'} (24h) · ${k.closedMonth} ${training ? 'enrolled' : 'sold'} this month · ${k.waiting} waiting over 1h`);
    }
    this.addReport('morning', `Morning report – ${this.dayLabel(this.today)}`, `Good morning,\n\nHere's where every building stands:\n\n${lines.map(l => `• ${l}`).join('\n')}\n\nNeeds your OK: ${this.approvals.length} item(s).\n`);
  }

  /** The daily email report: every task item from the documents, by channel. */
  private dailyReport() {
    const k = this.kpis();
    const rows = this.report(undefined, true);
    const fs = new Map(this.report(undefined, true, b => b.kind === 'training').map(r => [r.category, r]));
    const dealer = new Map(this.report(undefined, true, b => b.kind !== 'training').map(r => [r.category, r]));
    const section = (title: string, cats: string[], byCat: Map<string, ReportRow>) => `${title}\n${cats.map(c => {
      const r = byCat.get(c);
      return `  • ${c}: ${r?.email ?? 0} email · ${r?.phone ?? 0} phone · ${r?.text ?? 0} text`;
    }).join('\n')}`;
    const social = rows.filter(r => !DEALERSHIP_TASKS.includes(r.category) && !FAST_SALES_TASKS.includes(r.category));
    const perBuilding = this.buildings.filter(b => b.kind !== 'rental' || b.floors.some(f => f.tenant)).map(b => {
      const kb = this.kpis(b.id);
      return `  • ${b.name}: ${kb.leadsToday} new leads · ${kb.tasksToday} tasks · ${kb.closedMonth} closed this month · ${kb.waiting} waiting`;
    });
    const body = [
      `Daily report – ${this.dayLabel(this.today)}`, '',
      `New leads today: ${k.leadsToday}`, `Booked (24h): ${k.booked24h}`, `Closed this month: ${k.closedMonth}`,
      `Revenue this month: $${k.revenueMonth.toLocaleString()}`, `Waiting over 1h: ${k.waiting}`, `Needs your OK: ${this.approvals.length}`, '',
      section('DEALERSHIP & RENTAL AGENTS (email · phone · text)', DEALERSHIP_TASKS, dealer), '',
      section('FAST SALES AGENTS (email · phone · text)', FAST_SALES_TASKS, fs), '',
      `SOCIAL MEDIA AGENTS\n${social.map(r => `  • ${r.category}: ${r.other}`).join('\n') || '  • nothing yet'}`, '',
      `BY BUILDING\n${perBuilding.join('\n')}`,
    ].join('\n');
    this.addReport('daily', `Daily report – ${this.dayLabel(this.today)}`, body);
    const max = this.manager(this.building('fast-sales'));
    if (max) this.log(max, 'Daily email report sent', 'info');
  }

  private weeklySocialReport() {
    const parts = this.buildings.filter(b => b.kind !== 'rental').map(b => {
      const m = this.socialTotals(b.id, 7);
      const tip = [...this.insights.values()].filter(i => i.buildingId === b.id && i.kind === 'optimization').at(-1);
      const upcoming = [...this.content.values()].filter(c => c.buildingId === b.id && c.status === 'scheduled').length;
      return `${b.name}\n  Posts: ${m.posts} · Reach: ${m.reach.toLocaleString()} · Engagement: ${m.engagement.toLocaleString()} · Clicks: ${m.clicks} · Leads: ${m.leads}\n  Top post: ${m.top ? `${m.top.platform} – ${m.top.topic}` : '—'}\n  Scheduled next: ${upcoming}\n  Recommendation: ${tip?.text ?? 'Keep posting daily; reply to every comment within an hour.'}`;
    });
    this.addReport('weekly-social', `Weekly social media report – week of ${this.dayLabel(this.today)}`, parts.join('\n\n'));
  }

  private addReport(kind: Report['kind'], subject: string, body: string) {
    const r: Report = { id: this.nextId('r'), t: this.now, kind, subject, body, to: this.settings.reportRecipients, status: 'simulated' };
    this.reports.set(r.id, r);
    this.dReports.add(r.id);
    this.hooks.report?.(r);
  }

  setReportStatus(id: string, status: Report['status'], error?: string) {
    const r = this.reports.get(id);
    if (!r) return;
    r.status = status;
    r.error = error;
    this.dReports.add(id);
  }

  // ── approvals ("Needs you") ─────────────────────────────────
  private ask(kind: ApprovalKind, a: Agent, buildingId: string, text: string, refId?: string) {
    const blocking = kind === 'task' || kind === 'message' || kind === 'call';
    this.approvals.push({ id: this.nextId('ap'), kind, agentId: a.id, buildingId, text, refId, t: this.now, taskId: blocking ? a.current?.id : undefined });
    this.dApprovals = true;
  }

  resolve(approvalId: string, ok: boolean, by: string, edit?: string) {
    const ap = this.approvals.find(p => p.id === approvalId);
    if (!ap) return;
    this.approvals = this.approvals.filter(p => p !== ap);
    this.dApprovals = true;
    const a = this.agent(ap.agentId);
    const b = this.building(ap.buildingId);
    // Is the agent still sitting on this task, or did it move on while waiting?
    const waiting = !!a?.current && a.current.id === ap.taskId;
    switch (ap.kind) {
      case 'task': {
        if (!a?.current || !waiting) break;
        const lead = this.leads.get(a.current.leadId ?? '');
        if (ok && lead) {
          const { subject, body } = this.compose(b, a, lead, a.current.category, a.current.channel!);
          this.completeContact(b, a, a.current, lead, subject, body);
        } else { this.log(a, `Skipped (you said no): ${a.current.title}`, 'info'); this.release(a); }
        break;
      }
      case 'message':
      case 'call': {
        const m = this.messages.get(ap.refId ?? '');
        const lead = m?.leadId ? this.leads.get(m.leadId) : undefined;
        if (m && ok) {
          if (edit) m.body = edit;
          if (ap.kind === 'call') {
            m.status = 'sent';
            m.body = `${m.body}\nOutcome: called by ${by}`;
          } else { m.status = 'pending'; this.hooks.outbound?.(m, lead); }
          const category = m.category ?? 'Follow-up';
          if (lead) {
            this.count(b.id, category, m.channel);
            lead.touchedAt = this.now;
            this.history(lead, `${m.channel === 'phone' ? 'Called' : m.channel === 'email' ? 'Emailed' : 'Texted'} · ${category} (approved by ${by})`, a?.name ?? by, m.channel);
            if (lead.stage === this.stagesFor(lead)[0]) this.setStage(lead, this.stagesFor(lead)[1], a?.name ?? by);
            this.markLead(lead);
            if (a) { a.done++; this.markAgent(a); }
          }
        } else if (m) m.status = 'skipped';
        if (m) this.dMessages.add(m.id);
        if (a) { this.log(a, ok ? `Approved by ${by}: ${ap.text}` : `Skipped (you said no): ${ap.text}`, ok ? 'done' : 'info'); if (waiting) this.release(a); }
        break;
      }
      case 'post': {
        const c = this.content.get(ap.refId ?? '');
        if (!c) break;
        if (ok) { if (edit) c.caption = edit; c.status = 'scheduled'; } else c.status = 'rejected';
        this.dContent.add(c.id);
        if (a) this.log(a, ok ? `Scheduled ${c.platform} post for ${this.dayLabel(c.day)} ${c.time} (approved by ${by})` : `Post rejected: ${c.topic}`, ok ? 'done' : 'info');
        break;
      }
      case 'reply': {
        const i = this.inbox.get(ap.refId ?? '');
        if (!i) break;
        i.status = 'resolved';
        if (ok && edit) i.reply = edit;
        if (!ok) i.reply = undefined;
        this.dInbox.add(i.id);
        if (a) this.log(a, ok ? `Replied to ${i.author} (approved by ${by})` : `Escalation handled by ${by}`, 'done');
        break;
      }
      case 'ads': {
        if (!a) break;
        this.log(a, ok ? `${ap.text.replace(/^Test/, 'Launched test of')} (approved by ${by})` : `Ad test skipped: ${ap.text}`, ok ? 'done' : 'info');
        if (ok) this.addInsight(b.id, 'campaign', a.name, `A/B test running: ${ap.text.replace(/^Test /, '')}.`);
        break;
      }
    }
  }

  // ── actions from people ─────────────────────────────────────
  rentFloor(buildingId: string, level: number, tenant: Omit<Tenant, 'since'>) {
    const b = this.building(buildingId);
    const f = b.floors.find(x => x.level === level);
    if (!f || !f.vacant || !f.rent) return false;
    f.vacant = false;
    f.name = tenant.name;
    f.tenant = { ...tenant, since: this.now };
    f.info = `Rented by ${tenant.name} ($${f.rent}/mo). Contact: ${tenant.contact}.`;
    f.agents = [
      makeAgent(b.id, level, 0, `${tenant.name.split(' ')[0]} AI`, 'follow-up', 'ai', 'dealership'),
      makeAgent(b.id, level, 1, `${tenant.name.split(' ')[0]} Social`, 'social', 'ai', 'social'),
    ];
    this.reindex();
    this.markFloor(b, f);
    this.pushFeed({ t: this.now, agent: 'City', buildingId: b.id, text: `${tenant.name} rented L${level} of ${b.name} ($${f.rent}/mo)`, kind: 'info' });
    return true;
  }

  vacateFloor(buildingId: string, level: number) {
    const b = this.building(buildingId);
    const f = b.floors.find(x => x.level === level);
    if (!f?.tenant) return false;
    const name = f.tenant.name;
    this.approvals = this.approvals.filter(p => !f.agents.some(a => a.id === p.agentId));
    this.dApprovals = true;
    Object.assign(f, { vacant: true, name: 'Floor for Rent', tenant: undefined, info: undefined, agents: [] });
    delete f.tenant; delete f.info;
    this.reindex();
    this.markFloor(b, f);
    this.pushFeed({ t: this.now, agent: 'City', buildingId: b.id, text: `${name} moved out of L${level}`, kind: 'info' });
    return true;
  }

  newLead(b: Building, ageMinutes = 0, over: Partial<Lead> = {}) {
    const t = this.now + ageMinutes;
    let source: string, interest: string, floor: number | undefined, kind: Lead['kind'] = 'customer';
    if (b.kind === 'training') {
      if (chance(0.12)) { source = 'Affiliate inquiry'; interest = 'Affiliate'; floor = 3; kind = 'affiliate'; }
      else [source, interest, floor] = pick(TRAINING_SOURCES);
    } else {
      source = pick(DEALER_SOURCES);
      interest = `${pick(BRAND_MODELS[b.brand ?? ''] ?? ['pre-owned vehicle'])}`;
    }
    const name = over.name ?? `${pick(FIRST)} ${pick(LAST)}`;
    const lead: Lead = {
      id: this.nextId('l'), name, source, interest, buildingId: b.id, floor, kind, real: false,
      // Simulated people get reserved example addresses / 555 numbers that can never reach anyone.
      email: `${name.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/ /g, '.')}@example.com`,
      phone: `+1555${String(rint(1000000, 9999999))}`,
      stage: kind === 'affiliate' ? AFFILIATE_STAGES[0] : 'New lead', stageAt: t, createdAt: t, touchedAt: t, history: [], ...over,
    };
    lead.history.push({ t, text: `Lead created from ${lead.source}`, channel: 'note' });
    this.leads.set(lead.id, lead);
    this.markLead(lead);
    return lead;
  }

  /** A real person entered by a human. */
  createLead(input: { buildingId: string; name: string; email?: string; phone?: string; source?: string; interest?: string; floor?: number; kind?: Lead['kind'] }, by: string) {
    const b = this.building(input.buildingId);
    const kind = input.kind ?? 'customer';
    const lead = this.newLead(b, 0, {
      name: input.name, email: input.email || undefined, phone: input.phone || undefined, source: input.source || 'Manual entry',
      interest: input.interest || (b.kind === 'training' ? 'Individual Program' : 'New vehicle'), floor: input.floor, kind, real: true,
      stage: kind === 'affiliate' ? AFFILIATE_STAGES[0] : 'New lead', history: [],
    });
    lead.history = [{ t: this.now, text: `Added by ${by}`, agent: by, channel: 'note' }];
    this.pushFeed({ t: this.now, agent: by, buildingId: b.id, text: `Added lead ${lead.name}`, kind: 'info' });
    return lead;
  }

  updateLead(id: string, fields: { stage?: string; name?: string; email?: string; phone?: string; interest?: string }, by: string) {
    const lead = this.leads.get(id);
    if (!lead) return;
    if (fields.stage && fields.stage !== lead.stage && this.stagesFor(lead).includes(fields.stage)) this.setStage(lead, fields.stage, by);
    for (const k of ['name', 'email', 'phone', 'interest'] as const) if (fields[k] !== undefined) lead[k] = fields[k] || undefined as never;
    lead.touchedAt = this.now;
    this.markLead(lead);
  }

  addNote(id: string, text: string, by: string) {
    const lead = this.leads.get(id);
    if (!lead || !text.trim()) return;
    this.history(lead, text.trim(), by, 'note');
    this.markLead(lead);
  }

  /** A person writes to a lead from the CRM. Real leads go out through the delivery provider. */
  sendManual(leadId: string, channel: Channel, subject: string | undefined, body: string, by: string) {
    const lead = this.leads.get(leadId);
    if (!lead) return;
    const to = channel === 'email' ? lead.email : lead.phone;
    if (!to) return;
    const m = this.addMessage({ buildingId: lead.buildingId, agentName: by, leadId, channel, to, subject, body, status: lead.real ? 'pending' : 'simulated', real: lead.real, by: 'human' });
    this.history(lead, `${channel === 'email' ? 'Emailed' : channel === 'phone' ? 'Called' : 'Texted'} by ${by}`, by, channel);
    lead.touchedAt = this.now;
    this.markLead(lead);
    if (lead.real && channel !== 'phone') this.hooks.outbound?.(m, lead);
    if (channel === 'phone') { m.status = lead.real ? 'sent' : 'simulated'; }
    return m;
  }

  setMessageStatus(id: string, status: MessageStatus, error?: string) {
    const m = this.messages.get(id);
    if (!m) return;
    m.status = status;
    m.error = error;
    this.dMessages.add(id);
  }

  updateMessageDraft(id: string, subject: string | undefined, body: string) {
    const m = this.messages.get(id);
    if (!m || m.status !== 'pending') return;
    if (subject) m.subject = subject;
    m.body = body;
    m.by = 'claude';
    this.dMessages.add(id);
  }

  updateContent(id: string, fields: Partial<Pick<ContentItem, 'hook' | 'caption' | 'cta' | 'hashtags' | 'day' | 'time' | 'platform' | 'topic' | 'by'>>) {
    const c = this.content.get(id);
    if (!c) return;
    Object.assign(c, fields);
    this.dContent.add(id);
  }

  replyInbox(id: string, text: string, by: string) {
    const i = this.inbox.get(id);
    if (!i) return;
    i.reply = text;
    i.status = 'resolved';
    this.dInbox.add(id);
    const ap = this.approvals.find(p => p.kind === 'reply' && p.refId === id);
    if (ap) { this.approvals = this.approvals.filter(p => p !== ap); this.dApprovals = true; }
    this.pushFeed({ t: this.now, agent: by, buildingId: i.buildingId, text: `Replied to ${i.author} on ${i.platform}`, kind: 'done' });
  }

  setDuty(agentId: string, onDuty: boolean) {
    const a = this.agent(agentId);
    if (!a) return;
    a.status = onDuty ? 'working' : 'idle';
    this.markAgent(a);
  }

  linkUser(agentId: string | undefined, userId: string) {
    for (const a of this.agentIx.values()) if (a.userId === userId) { a.userId = undefined; this.markAgent(a); }
    const a = agentId ? this.agent(agentId) : undefined;
    if (a && a.kind === 'human') { a.userId = userId; this.markAgent(a); }
  }

  updateSettings(s: Partial<Settings>) {
    this.settings = { ...this.settings, ...s };
    this.dSettings = true;
  }

  private addMessage(m: Omit<Message, 'id' | 't'>) {
    const full: Message = { id: this.nextId('msg'), t: this.now, ...m };
    this.messages.set(full.id, full);
    this.dMessages.add(full.id);
    return full;
  }

  private log(a: Agent, text: string, kind: FeedItem['kind']) {
    this.pushFeed({ t: this.now, agent: a.name, buildingId: a.buildingId, text, kind });
  }

  private pushFeed(f: FeedItem) {
    this.feed.unshift(f);
    this.newFeed.unshift(f);
  }

  private trim() {
    if (this.feed.length > LIMITS.feed) this.feed.length = LIMITS.feed;
    for (const [map, n] of [[this.messages, LIMITS.messages], [this.inbox, LIMITS.inbox], [this.insights, LIMITS.insights], [this.reports, LIMITS.reports]] as const) {
      const extra = map.size - n;
      if (extra <= 0) continue;
      let i = 0;
      for (const k of map.keys()) { if (i++ >= extra) break; map.delete(k); }
    }
    const cutoff = this.now - LIMITS.stageDays * 1440;
    if (this.stageLog.length && this.stageLog[0].t < cutoff) this.stageLog = this.stageLog.filter(e => e.t >= cutoff);
    if (this.revenue.length && this.revenue[0].t < cutoff) this.revenue = this.revenue.filter(e => e.t >= cutoff);
    // Server only from here: the browser mirror gets explicit removals.
    if (this.leads.size > LIMITS.leads) {
      const closed = [...this.leads.values()].filter(l => !l.real && l.stage === this.stagesFor(l).at(-1)).sort((a, b) => a.touchedAt - b.touchedAt);
      for (const l of closed.slice(0, this.leads.size - LIMITS.leads)) { this.leads.delete(l.id); this.removedLeads.push(l.id); }
    }
    for (const c of this.content.values()) {
      const old = (c.status === 'published' && this.now - (c.publishedAt ?? 0) > 30 * 1440) || (c.status === 'rejected' && c.day < this.today - 7);
      if (old) { this.content.delete(c.id); this.removedContent.push(c.id); }
    }
  }

  // ── numbers for the panels ──────────────────────────────────
  kpis(buildingId?: string) {
    const inB = (id: string) => !buildingId || id === buildingId;
    const dayStart = this.today * 1440, month = this.monthStart();
    let leadsToday = 0, waiting = 0, open = 0;
    for (const l of this.leads.values()) {
      if (!inB(l.buildingId)) continue;
      if (l.createdAt >= dayStart) leadsToday++;
      if (this.isWaiting(l)) waiting++;
      if (l.stage !== this.stagesFor(l).at(-1)) open++;
    }
    let booked24h = 0, apptsToday = 0, closedMonth = 0;
    for (const e of this.stageLog) {
      if (!inB(e.b)) continue;
      if (BOOKED.has(e.s)) { if (e.t >= this.now - 1440) booked24h++; if (e.t >= dayStart) apptsToday++; }
      if (CLOSED.has(e.s) && e.t >= month) closedMonth++;
    }
    const bs = buildingId ? [this.building(buildingId)] : this.buildings;
    const rent = bs.reduce((s, b) => s + b.floors.reduce((x, f) => x + (f.tenant ? f.rent ?? 0 : 0), 0), 0);
    const revenueMonth = this.revenue.filter(r => inB(r.buildingId) && r.t >= month).reduce((s, r) => s + r.amount, 0) + rent;
    const agents = this.agents(buildingId);
    let tasksToday = 0;
    for (const [bid, byCat] of this.statsToday) if (inB(bid)) for (const r of byCat.values()) for (const n of Object.values(r)) tasksToday += n;
    return {
      leadsToday, booked24h, apptsToday, closedMonth, revenueMonth, waiting, open, tasksToday,
      tasksDone: agents.reduce((s, a) => s + a.done, 0),
      agentsWorking: agents.filter(a => a.status === 'working').length,
      agentsTotal: agents.length,
      needsYou: this.approvals.filter(p => inB(p.buildingId)).length,
      rentMonthly: rent,
    };
  }

  /** Daily email report rows: completed tasks by category × channel. */
  report(buildingId?: string, today = false, which?: (b: Building) => boolean): ReportRow[] {
    const rows = new Map<string, ReportRow>();
    for (const [bid, byCat] of today ? this.statsToday : this.stats) {
      if (buildingId && bid !== buildingId) continue;
      if (which && !which(this.building(bid))) continue;
      for (const [cat, r] of byCat) {
        const row = rows.get(cat) ?? { category: cat, email: 0, phone: 0, text: 0, other: 0 };
        row.email += r.email ?? 0; row.phone += r.phone ?? 0; row.text += r.text ?? 0; row.other += r.other ?? 0;
        rows.set(cat, row);
      }
    }
    return [...rows.values()].sort((a, b) => (b.email + b.phone + b.text + b.other) - (a.email + a.phone + a.text + a.other));
  }
}

function dump(s: Stats): StatsDump { return [...s].map(([b, m]) => [b, [...m]]); }
function undump(d: StatsDump): Stats { return new Map(d.map(([b, m]) => [b, new Map(m)])); }
function toMinutes(hhmm: string) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }

export function clock(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
