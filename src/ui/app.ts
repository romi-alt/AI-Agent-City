import { api, ApiError, stream, type Integrations, type Me, type Person } from '../api';
import { clock, Sim } from '../core/sim';
import type { Building, Floor } from '../core/types';
import { CityView } from '../scene/cityView';
import { Engine } from '../scene/engine';
import { OfficeView, type OfficeScreens } from '../scene/officeView';
import { editing, esc, formData, money, toast } from './util';
import * as V from './views';

export type ViewMode = 'office' | 'city' | 'dashboard';
export type Overlay = 'crm' | 'content' | 'outbox' | 'admin' | 'screen';
export type Tab = 'live' | 'crm' | 'content' | 'team' | 'ok' | 'floors';
export type ContentTab = 'calendar' | 'posts' | 'inbox' | 'analytics' | 'insights' | 'reports';

const SPEEDS: [number, string][] = [[0, '❚❚'], [1 / 120, 'Real time'], [1, '1×'], [5, '5×']];

function stored(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function store(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* private mode */ }
}

export class App {
  sim: Sim;
  me: NonNullable<Me['user']>;
  people: Person[];
  integrations: Integrations;
  engine: Engine;
  mode: ViewMode = 'office';
  overlay?: Overlay;
  tab: Tab = 'live';
  contentTab: ContentTab = 'calendar';
  buildingId?: string;
  level?: number;
  agentId?: string;
  leadId?: string;
  /** Building the CRM board / content wall is looking at. */
  boardBuilding = '';
  crmQuery = '';
  realOnly = false;
  outboxFilter = 'all';
  adminData?: V.AdminData;
  private city: CityView;
  private office?: OfficeView;
  private stopStream: () => void;
  private queued = false;
  /** Lists only repaint from live updates once a second and never mid-click, so they don't jump under the cursor. */
  private force = false;
  private pointerDown = false;
  private lastHeavy = 0;
  private later?: number;
  private root: HTMLElement;
  private onSignedOut: () => void;
  $ = <T extends HTMLElement = HTMLElement>(sel: string) => this.root.querySelector<T>(sel)!;

  constructor(root: HTMLElement, state: Awaited<ReturnType<typeof api.state>>, onSignedOut: () => void) {
    this.root = root;
    this.onSignedOut = onSignedOut;
    this.sim = new Sim(state.snapshot);
    this.me = state.me.user!;
    this.people = state.people;
    this.integrations = state.integrations;
    root.innerHTML = V.shell(this);
    this.engine = new Engine(this.$('#stage-3d'));
    this.city = new CityView(this.sim, id => this.selectBuilding(id));
    this.engine.onPick = o => {
      const d = o.userData;
      if (d.agentId) return this.selectAgent(d.agentId);
      if (d.buildingId && this.mode === 'city') {
        if (this.buildingId === d.buildingId) this.enterFloor(d.buildingId, d.level);
        else this.selectBuilding(d.buildingId);
      }
    };
    const night = stored('fs-theme', 'light') === 'dark';
    document.documentElement.dataset.theme = night ? 'dark' : 'light';
    this.engine.setNight(night);
    this.bind();
    this.sim.onChange(() => this.refresh(false));
    this.stopStream = stream(p => this.sim.applyPatch(p), p => { this.people = p; this.syncMe(); this.refresh(false); }, () => this.signedOut());

    root.dataset.role = this.me.role;
    this.boardBuilding = this.home.id;
    // Start in "your office" like the reference: your desk's floor, else your home building's top floor.
    const desk = this.me.agentId ? this.sim.agent(this.me.agentId) : undefined;
    this.enterFloor(desk?.buildingId ?? this.home.id, desk?.floor ?? this.homeLevel);
  }

  private syncMe() {
    const p = this.people.find(x => x.id === this.me.id);
    if (p) Object.assign(this.me, { onDuty: p.onDuty, agentId: p.agentId });
  }

  private signedOut() {
    this.stopStream();
    this.engine.renderer.setAnimationLoop(null);
    this.onSignedOut();
  }

  get isOwner() { return this.me.role === 'owner'; }
  /** Owner and staff run the agency; client people only see their own buildings. */
  get isAgency() { return this.me.role === 'owner' || this.me.role === 'staff'; }
  get readOnly() { return this.me.role === 'client-viewer'; }
  /** The Training Center for the agency; a client's first building otherwise. */
  get home(): Building { return this.sim.buildings.find(b => b.id === 'fast-sales') ?? this.sim.buildings[0]!; }
  get homeLevel() { return this.home.floors.find(f => !f.vacant)?.level ?? this.home.floors[0]!.level; }
  get building(): Building | undefined { return this.buildingId ? this.sim.building(this.buildingId) : undefined; }
  get floor(): Floor | undefined { return this.building?.floors.find(f => f.level === this.level); }
  /** The floor that is "Your office" in the floor picker. */
  get myFloor() {
    const a = this.me.agentId ? this.sim.agent(this.me.agentId) : undefined;
    return a ? { buildingId: a.buildingId, level: a.floor } : undefined;
  }

  // ── navigation ────────────────────────────────────────────────
  selectBuilding(id: string | undefined) {
    this.buildingId = id;
    this.agentId = undefined;
    this.overlay = undefined;
    if (this.mode !== 'city') this.setMode('city');
    this.city.focus(id, this.engine.camera, this.engine.controls);
    if (id) { this.tab = this.tab === 'ok' ? 'ok' : 'floors'; this.boardBuilding = id; }
    this.refresh();
  }

  enterFloor(buildingId: string, level?: number) {
    const b = this.sim.building(buildingId);
    level ??= b.floors.find(f => !f.vacant)?.level ?? b.floors[0].level;
    const f = b.floors.find(x => x.level === level)!;
    this.buildingId = buildingId;
    this.boardBuilding = buildingId;
    this.level = level;
    this.agentId = undefined;
    this.overlay = undefined;
    this.office = new OfficeView(b, f, id => this.selectAgent(id), () => this.screens());
    this.mode = 'office';
    this.engine.setView(this.office);
    if (this.tab === 'floors' && !f.vacant) this.tab = 'team';
    this.refresh();
  }

  setMode(m: ViewMode) {
    this.overlay = undefined;
    if (m === 'office') {
      const mine = this.myFloor;
      return this.enterFloor(this.buildingId ?? mine?.buildingId ?? this.home.id, this.level ?? mine?.level);
    }
    this.mode = m;
    if (m === 'city' && this.engine.view !== this.city) {
      this.office = undefined;
      this.engine.setView(this.city);
      this.city.focus(this.buildingId, this.engine.camera, this.engine.controls);
    }
    this.refresh();
  }

  selectAgent(id: string, focus = false) {
    const a = this.sim.agent(id);
    if (!a) return;
    if (this.mode !== 'office' || this.level !== a.floor || this.buildingId !== a.buildingId) this.enterFloor(a.buildingId, a.floor);
    this.agentId = id;
    this.overlay = undefined;
    this.tab = a.status === 'needs-you' ? 'ok' : 'team';
    if (focus) this.office?.focusAgent(id, this.engine.camera, this.engine.controls);
    this.refresh();
  }

  openOverlay(o: Overlay | undefined) {
    this.overlay = o;
    if (o === 'admin') this.loadAdmin();
    if (o === 'screen') document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    this.refresh();
  }

  openLead(id: string | undefined) {
    this.leadId = id;
    this.refresh();
  }

  async loadAdmin() {
    if (!this.isOwner) { this.adminData = { users: [], signins: [], clients: [] }; return; }
    try {
      const [users, signins, integrations, clients] = await Promise.all([
        api.get<V.AdminData['users']>('/api/admin/users'), api.get<V.AdminData['signins']>('/api/admin/signins'), api.get<Integrations>('/api/admin/integrations'),
        api.get<V.AdminData['clients']>('/api/admin/clients'),
      ]);
      this.adminData = { users, signins, clients };
      this.integrations = integrations;
      this.refresh();
    } catch (e) { toast((e as Error).message, 'err'); }
  }

  // ── what the office screens show ──────────────────────────────
  private screens(): OfficeScreens {
    const b = this.building;
    const k = this.sim.kpis(b?.id);
    const t = b?.kind === 'training';
    const week = Array.from({ length: 7 }, (_, i) => this.sim.today + i);
    const colors: Record<string, string> = { idea: '#64748b', draft: '#a78bfa', 'asset-ready': '#38bdf8', 'needs-approval': '#ef4444', scheduled: '#f5b335', published: '#22c55e', rejected: '#475569' };
    return {
      live: {
        title: b?.short ?? 'City',
        lines: [['Leads today', String(k.leadsToday)], [t ? 'Booked calls · 24h' : 'Appointments · 24h', String(k.booked24h)], [t ? 'Enrolled this month' : 'Sold this month', String(k.closedMonth)], ['Revenue this month', money(k.revenueMonth)], ['Waiting over 1h', String(k.waiting)], ['Needs you', String(k.needsYou)]],
      },
      wall: week.map(d => ({
        day: this.sim.dayLabel(d).replace(/,.*/, '') + ' ' + this.sim.dateOf(d).getUTCDate(),
        items: [...this.sim.content.values()].filter(c => c.day === d && (!b || c.buildingId === b.id)).map(c => ({ text: `${c.time} ${c.platform} · ${c.topic}`, color: colors[c.status] })),
      })),
    };
  }

  // ── rendering (batched to one paint per frame) ────────────────
  refresh(force = true) {
    if (force) this.force = true;
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.render(); });
  }

  private render() {
    const b = this.building, f = this.floor;
    const now = performance.now();
    const heavy = this.force || (!this.pointerDown && now - this.lastHeavy > 1000);
    if (heavy) { this.force = false; this.lastHeavy = now; }
    else if (!this.later) this.later = window.setTimeout(() => { this.later = undefined; this.refresh(false); }, 1000);
    this.$('#clock').textContent = `${this.sim.dayLabel(this.sim.today).replace(/,.*/, '')} ${clock(this.sim.now)}`;
    this.$('#ctx').textContent = this.mode === 'office' && b && f ? `${b.name} · floor L${f.level}` : b ? b.name : 'Sales City · all buildings';
    this.root.querySelectorAll<HTMLElement>('[data-act^="mode:"]').forEach(el => el.classList.toggle('on', !this.overlay && el.dataset.act === `mode:${this.mode}`));
    const duty = this.$('#duty');
    duty.textContent = this.me.onDuty ? '● ON DUTY' : '○ OFF DUTY';
    duty.classList.toggle('off', !this.me.onDuty);
    this.$('#speed').innerHTML = this.isOwner ? SPEEDS.map(([v, l]) => `<button data-act="speed:${v}" class="${Math.abs(this.sim.settings.speed - v) < 1e-6 ? 'on' : ''}">${l}</button>`).join('') : '';
    this.$('#night').textContent = this.engine.night ? '☀' : '☾';

    this.$('#chip').innerHTML = this.mode === 'office' && b && f
      ? `<b>${esc(b.short)} · floor L${f.level}</b><span>${esc(f.name)} — tap ${f.agents.slice(0, 2).map(a => esc(a.name)).join(', ') || 'a floor'}${f.agents.length > 2 ? ' or any agent' : ''}. Drag to look around.</span>`
      : b ? `<b>${esc(b.name)}</b><span>Tap it again or pick a floor to go inside.</span>`
        : `<b>Sales City</b><span>${this.sim.buildings.length} buildings · tap one to see its floors. Drag to look around.</span>`;

    this.city.refresh();
    if (this.office) { this.office.selected = this.agentId; this.office.refresh(); }
    if (!heavy) return;

    const floors = this.$('#floors');
    if (!editing(floors)) floors.innerHTML = b ? V.floorPicker(this, b) : '';

    const dash = this.$('#dash');
    const showDash = this.mode === 'dashboard' && !this.overlay;
    dash.hidden = !showDash;
    if (showDash && !editing(dash)) dash.innerHTML = V.dashboard(this);

    const ov = this.$('#overlay');
    ov.hidden = !this.overlay;
    ov.className = `overlay ov-${this.overlay ?? ''}`;
    if (this.overlay && !editing(ov)) {
      const scroll = ov.querySelector('.ov-body')?.scrollTop ?? 0;
      ov.innerHTML = V.overlay(this, this.overlay);
      const body = ov.querySelector('.ov-body');
      if (body) body.scrollTop = scroll;
    }

    this.$('#panel-head').innerHTML = V.panelHead(this);
    this.$('#tabs').innerHTML = V.tabs(this);
    const body = this.$('#panel-body');
    if (!editing(body)) {
      const scroll = body.scrollTop;
      body.innerHTML = V.panel(this);
      body.scrollTop = scroll;
    }

    const drawer = this.$('#drawer');
    drawer.hidden = !this.leadId;
    if (this.leadId && !editing(drawer)) {
      const lead = this.sim.leads.get(this.leadId);
      if (!lead) { this.leadId = undefined; drawer.hidden = true; }
      else { const s = drawer.querySelector('.drawer-body')?.scrollTop ?? 0; drawer.innerHTML = V.leadDrawer(this, lead); const nb = drawer.querySelector('.drawer-body'); if (nb) nb.scrollTop = s; }
    }
  }

  // ── events ────────────────────────────────────────────────────
  private bind() {
    document.addEventListener('pointerdown', () => { this.pointerDown = true; }, true);
    document.addEventListener('pointerup', () => { this.pointerDown = false; }, true);
    this.root.addEventListener('click', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el) return;
      const [act, ...args] = el.dataset.act!.split(':');
      if (this.readOnly && WRITE_ACTS.has(act)) return toast(VIEW_ONLY, 'err');
      this.act(act, args, el).catch(err => toast(err instanceof Error ? err.message : String(err), 'err'));
    });
    this.root.addEventListener('submit', e => {
      const form = (e.target as HTMLElement).closest<HTMLFormElement>('form[data-form]');
      if (!form) return;
      e.preventDefault();
      if (this.readOnly && WRITE_FORMS.has(form.dataset.form!)) return toast(VIEW_ONLY, 'err');
      const btn = form.querySelector<HTMLButtonElement>('button[type=submit]');
      if (btn) btn.disabled = true;
      this.submit(form.dataset.form!, formData(form), form)
        .catch(err => toast(err instanceof Error ? err.message : String(err), 'err'))
        .finally(() => { if (btn) btn.disabled = false; (document.activeElement as HTMLElement | null)?.blur?.(); this.refresh(); });
    });
    this.root.addEventListener('change', e => {
      const el = e.target as HTMLSelectElement | HTMLInputElement;
      const ch = el.dataset.change;
      if (!ch) return;
      if (ch === 'board') { this.boardBuilding = el.value; el.blur(); this.refresh(); }
      if (ch === 'realOnly') { this.realOnly = (el as HTMLInputElement).checked; this.refresh(); }
      if (ch === 'outbox') { this.outboxFilter = el.value; el.blur(); this.refresh(); }
      if (ch === 'stage' && this.leadId && !this.readOnly) { api.action({ type: 'leadUpdate', id: this.leadId, fields: { stage: el.value } }).catch(err => toast(err.message, 'err')); el.blur(); }
    });
    this.root.addEventListener('input', e => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.input === 'crmq') { this.crmQuery = el.value; this.renderBoardOnly(); }
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (this.leadId) this.openLead(undefined);
      else if (!this.$('#modal').hidden) this.closeModal();
      else if (this.overlay) this.openOverlay(undefined);
    });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && this.overlay === 'screen') this.openOverlay(undefined); });
  }

  /** The CRM search box keeps focus, so re-render only the board columns while typing. */
  private renderBoardOnly() {
    const cols = this.root.querySelector('.kanban');
    if (cols) cols.outerHTML = V.kanban(this);
  }

  modal(html: string) {
    const m = this.$('#modal');
    m.hidden = false;
    m.innerHTML = `<div class="sheet">${html}</div>`;
    m.querySelector<HTMLInputElement>('input,textarea')?.focus();
  }
  closeModal() { this.$('#modal').hidden = true; this.$('#modal').innerHTML = ''; }

  private async act(act: string, args: string[], el: HTMLElement) {
    const [a1, a2] = args;
    switch (act) {
      case 'mode': return this.setMode(a1 as ViewMode);
      case 'overlay': return this.openOverlay((a1 || undefined) as Overlay | undefined);
      case 'tab': this.tab = a1 as Tab; return this.refresh();
      case 'ctab': this.contentTab = a1 as ContentTab; return this.refresh();
      case 'building': return this.selectBuilding(a1 || undefined);
      case 'floor': return this.enterFloor(a1, Number(a2));
      case 'myoffice': { const m = this.myFloor; return m ? this.enterFloor(m.buildingId, m.level) : this.enterFloor(this.home.id, this.homeLevel); }
      case 'agent': return this.selectAgent(a1, a2 === 'focus');
      case 'cam': return this.engine.nudge(a1 as never);
      case 'night': {
        const n = !this.engine.night;
        this.engine.setNight(n);
        document.documentElement.dataset.theme = n ? 'dark' : 'light';
        store('fs-theme', n ? 'dark' : 'light');
        return this.refresh();
      }
      case 'speed': await api.put('/api/admin/settings', { speed: Number(a1) }); return;
      case 'duty': await api.action({ type: 'duty', onDuty: !this.me.onDuty }); this.me.onDuty = !this.me.onDuty; return this.refresh();
      case 'lock': await api.post('/api/auth/lock'); return this.signedOut();
      case 'logout': await api.post('/api/auth/logout'); return this.signedOut();
      case 'lead': return this.openLead(a1 || undefined);
      case 'approve': {
        const edit = el.closest('.approval')?.querySelector<HTMLTextAreaElement>('textarea')?.value;
        await api.action({ type: 'approve', id: a1, ok: a2 === 'yes', edit: a2 === 'yes' ? edit : undefined });
        return toast(a2 === 'yes' ? 'Approved' : 'Skipped');
      }
      case 'approve-all': await api.action({ type: 'approveAll', buildingId: this.buildingId }); return toast('All approved');
      case 'report': return this.modal(V.reportModal(this, a1));
      case 'copy': {
        const text = el.dataset.copy ?? el.closest('.sheet')?.querySelector('pre')?.textContent ?? '';
        await navigator.clipboard?.writeText(text);
        el.textContent = 'Copied ✓';
        return;
      }
      case 'close': return this.closeModal();
      case 'rent': return this.modal(V.rentForm(this, a1, Number(a2)));
      case 'vacate':
        if (!confirm('Move this tenant out? Their agents leave the floor.')) return;
        await api.action({ type: 'vacate', buildingId: a1, level: Number(a2) });
        return toast('Floor is available again');
      case 'new-lead': return this.modal(V.leadForm(this, a1 || this.boardBuilding));
      case 'post': return this.modal(V.postEditor(this, a1));
      case 'message': return this.modal(V.messageModal(this, a1));
      case 'desk': await api.action({ type: 'desk', agentId: a1 || null }); this.me.agentId = a1 || undefined; toast(a1 ? 'This is now your desk' : 'Desk cleared'); return this.refresh();
      case 'user-reset': {
        if (!confirm('Reset this person\'s password and 2-step sign-in? They\'ll need a new setup link.')) return;
        const r = await api.post<{ link: string }>(`/api/admin/users/${a1}/reset`);
        this.modal(V.linkModal('Reset link', r.link));
        return this.loadAdmin();
      }
      case 'user-delete':
        if (!confirm('Remove this person? They will be signed out everywhere.')) return;
        await api.del(`/api/admin/users/${a1}`);
        return this.loadAdmin();
      case 'client-edit': return this.modal(V.clientForm(this, a1 || undefined));
      case 'client-delete':
        if (!confirm('Delete this client? Its buildings go back to the agency.')) return;
        await api.del(`/api/admin/clients/${a1}`);
        toast('Client deleted');
        return this.loadAdmin();
      case 'new-codes': {
        if (!confirm('Make new recovery codes? Your old ones stop working.')) return;
        const r = await api.post<{ codes: string[] }>('/api/me/recovery-codes');
        this.me.recoveryLeft = r.codes.length;
        return this.modal(V.codesModal(r.codes));
      }
      case 'fullscreen': return document.documentElement.requestFullscreen?.();
    }
  }

  private async submit(name: string, f: Record<string, string>, form: HTMLFormElement) {
    switch (name) {
      case 'rent':
        await api.action({ type: 'rent', buildingId: f.buildingId, level: Number(f.level), tenant: { name: f.name, contact: f.contact, email: f.email, phone: f.phone } });
        this.closeModal();
        return toast(`${f.name} moved in`);
      case 'lead': {
        const r = await api.action<{ id: string }>({
          type: 'leadCreate', lead: {
            buildingId: f.buildingId, name: f.name, email: f.email || undefined, phone: f.phone || undefined, source: f.source || undefined,
            interest: f.interest || undefined, floor: f.floor ? Number(f.floor) : undefined, kind: f.kind as 'customer' | 'affiliate',
          },
        });
        this.closeModal();
        toast('Lead added');
        return this.openLead(r.id);
      }
      case 'lead-edit':
        await api.action({ type: 'leadUpdate', id: this.leadId, fields: { name: f.name, email: f.email, phone: f.phone, interest: f.interest } });
        return toast('Saved');
      case 'lead-note':
        await api.action({ type: 'leadNote', id: this.leadId, text: f.text });
        form.reset();
        return;
      case 'lead-send':
        await api.action({ type: 'leadSend', id: this.leadId, channel: f.channel, subject: f.subject || undefined, body: f.body });
        form.reset();
        return toast(f.channel === 'phone' ? 'Call logged' : 'Sent');
      case 'post':
        await api.action({ type: 'contentUpdate', id: f.id, fields: { topic: f.topic, hook: f.hook, caption: f.caption, cta: f.cta, hashtags: f.hashtags.split(/[\s,]+/).filter(Boolean), time: f.time, platform: f.platform } });
        this.closeModal();
        return toast('Post updated');
      case 'reply':
        await api.action({ type: 'inboxReply', id: f.id, text: f.text });
        return toast('Reply sent');
      case 'settings': {
        const recipients = f.reportRecipients.split(/[\s,;]+/).filter(Boolean);
        const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
        await api.put('/api/admin/settings', {
          companyName: f.companyName, reportRecipients: recipients, deliveryMode: f.deliveryMode, crmUrlTemplate: f.crmUrlTemplate,
          morningReportAt: toMin(f.morningReportAt), dailyReportAt: toMin(f.dailyReportAt), aiDrafts: f.aiDrafts === 'on',
        });
        return toast('Settings saved');
      }
      case 'user': {
        const r = await api.post<{ link: string }>('/api/admin/users', { username: f.username, name: f.name, role: f.role, clientId: f.clientId });
        form.reset();
        this.modal(V.linkModal(`Setup link for ${f.name}`, r.link));
        return this.loadAdmin();
      }
      case 'access':
        await api.put(`/api/admin/users/${f.id}/access`, { role: f.role, clientId: f.clientId });
        toast('Access changed. They\'ll need to sign in again.');
        return this.loadAdmin();
      case 'client': {
        const buildingIds = [...form.querySelectorAll<HTMLInputElement>('input[name=b]:checked')].map(x => x.value);
        const body = { name: f.name, buildingIds };
        if (f.id) await api.put(`/api/admin/clients/${f.id}`, body); else await api.post('/api/admin/clients', body);
        this.closeModal();
        toast(f.id ? 'Client saved' : 'Client added');
        return this.loadAdmin();
      }
      case 'test-email':
        await api.post('/api/admin/test-email', { to: f.to });
        return toast('Test email sent');
    }
  }
}

const VIEW_ONLY = 'Your account can view this client but not change anything.';
const WRITE_ACTS = new Set(['approve', 'approve-all', 'rent', 'vacate', 'new-lead']);
const WRITE_FORMS = new Set(['lead', 'lead-edit', 'lead-note', 'lead-send', 'post', 'reply', 'rent']);

export function isAuthError(e: unknown) {
  return e instanceof ApiError && (e.status === 401 || e.status === 423);
}
