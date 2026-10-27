import { CityView } from '../scene/cityView';
import { Engine } from '../scene/engine';
import { OfficeView } from '../scene/officeView';
import { SOCIAL_TASKS } from '../data/tasks';
import { clock, DEALER_STAGES, Sim, TRAINING_STAGES } from '../sim';
import type { Agent, Building } from '../types';

type ViewMode = 'office' | 'city' | 'dashboard';
type Tab = 'live' | 'crm' | 'content' | 'team' | 'ok' | 'floors';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n: number) => n ? `$${n.toLocaleString()}` : '—';

export class App {
  sim = new Sim();
  engine: Engine;
  mode: ViewMode = 'city';
  tab: Tab = 'live';
  buildingId?: string;
  level?: number;
  agentId?: string;
  speed = 1;
  private city: CityView;
  private office?: OfficeView;
  private timer?: number;
  private $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

  constructor(root: HTMLElement) {
    root.innerHTML = SHELL;
    this.engine = new Engine(this.$('#stage-3d'));
    this.city = new CityView(this.sim, id => this.selectBuilding(id));
    this.engine.setView(this.city);
    this.engine.onPick = o => {
      const d = o.userData;
      if (d.agentId) return this.selectAgent(d.agentId);
      if (d.buildingId && this.mode === 'city') {
        if (this.buildingId === d.buildingId) this.enterFloor(d.buildingId, d.level);
        else this.selectBuilding(d.buildingId);
      }
    };
    this.bind();
    this.sim.onChange(() => this.refresh());
    this.setSpeed(1);
    this.refresh();
  }

  // ── navigation ────────────────────────────────────────────────
  selectBuilding(id: string | undefined) {
    this.buildingId = id;
    this.agentId = undefined;
    if (this.mode !== 'city') this.setMode('city');
    this.city.focus(id, this.engine.camera, this.engine.controls);
    if (id) this.tab = this.tab === 'ok' ? 'ok' : 'floors';
    this.refresh();
  }

  enterFloor(buildingId: string, level?: number) {
    const b = this.sim.building(buildingId);
    level ??= b.floors.find(f => !f.vacant)?.level ?? b.floors[0].level;
    const f = b.floors.find(x => x.level === level)!;
    this.buildingId = buildingId;
    this.level = level;
    this.agentId = undefined;
    this.office = new OfficeView(b, f, id => this.selectAgent(id));
    this.mode = 'office';
    this.engine.setView(this.office);
    if (this.tab === 'floors' && !f.vacant) this.tab = 'team';
    this.refresh();
  }

  setMode(m: ViewMode) {
    if (m === 'office') return this.enterFloor(this.buildingId ?? 'fast-sales', this.level);
    this.mode = m;
    if (m === 'city' && this.engine.view !== this.city) {
      this.office = undefined;
      this.engine.setView(this.city);
      this.city.focus(this.buildingId, this.engine.camera, this.engine.controls);
    }
    this.refresh();
  }

  selectAgent(id: string) {
    const a = this.sim.agent(id);
    if (!a) return;
    if (this.mode !== 'office' || this.level !== a.floor || this.buildingId !== a.buildingId) this.enterFloor(a.buildingId, a.floor);
    this.agentId = id;
    this.tab = a.status === 'needs-you' ? 'ok' : 'team';
    this.refresh();
  }

  setSpeed(s: number) {
    this.speed = s;
    clearInterval(this.timer);
    if (s) this.timer = window.setInterval(() => this.sim.tick(), 1000 / s);
    this.refresh();
  }

  setNight(n: boolean) {
    this.engine.setNight(n);
    document.documentElement.dataset.theme = n ? 'dark' : 'light';
    this.refresh();
  }

  // ── events ────────────────────────────────────────────────────
  private bind() {
    document.addEventListener('click', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el) return;
      const [act, arg, arg2] = el.dataset.act!.split(':');
      switch (act) {
        case 'mode': return this.setMode(arg as ViewMode);
        case 'tab': this.tab = arg as Tab; return this.refresh();
        case 'building': return arg ? this.selectBuilding(arg) : this.selectBuilding(undefined);
        case 'floor': return this.enterFloor(arg, Number(arg2));
        case 'agent': return this.selectAgent(arg);
        case 'cam': return this.engine.nudge(arg as never);
        case 'speed': return this.setSpeed(Number(arg));
        case 'night': return this.setNight(!this.engine.night);
        case 'approve': return this.sim.resolve(arg, arg2 === 'yes');
        case 'approve-all': for (const p of [...this.sim.approvals]) this.sim.resolve(p.id, true); return;
        case 'report': return this.openReport();
        case 'close': this.$('#modal').hidden = true; return;
        case 'copy-report': navigator.clipboard?.writeText(this.reportText()); el.textContent = 'Copied ✓'; return;
        case 'boss': return this.selectAgent('fast-sales-L12-0');
        case 'rent': {
          const name = prompt(`Tenant name for L${arg2}?`, 'New Dealer Group');
          if (name?.trim()) this.sim.rentFloor(arg, Number(arg2), name.trim());
          if (this.mode === 'office' && this.buildingId === arg && this.level === Number(arg2)) this.enterFloor(arg, Number(arg2));
          return;
        }
      }
    });
  }

  // ── rendering ─────────────────────────────────────────────────
  private refresh() {
    const b = this.buildingId ? this.sim.building(this.buildingId) : undefined;
    const f = b && this.level != null ? b.floors.find(x => x.level === this.level) : undefined;

    this.$('#clock').textContent = clock(this.sim.now);
    this.$('#ctx').textContent = this.mode === 'office' && b && f ? `${b.name} · floor L${f.level}` : b ? b.name : 'Sales City · all buildings';
    document.querySelectorAll<HTMLElement>('[data-act^="mode:"]').forEach(el => el.classList.toggle('on', el.dataset.act === `mode:${this.mode}`));
    document.querySelectorAll<HTMLElement>('[data-act^="speed:"]').forEach(el => el.classList.toggle('on', el.dataset.act === `speed:${this.speed}`));
    this.$('#night').textContent = this.engine.night ? '☀' : '☾';

    const chip = this.$('#chip');
    chip.innerHTML = this.mode === 'office' && b && f
      ? `<b>${esc(b.short)} · floor L${f.level}</b><span>${esc(f.name)} — tap an agent. Drag to look around.</span>`
      : b ? `<b>${esc(b.name)}</b><span>Click again or pick a floor to go inside.</span>`
        : `<b>Sales City</b><span>${this.sim.buildings.length} buildings · tap one to see its floors. Drag to look around.</span>`;

    this.$('#dash').hidden = this.mode !== 'dashboard';
    if (this.mode === 'dashboard') this.$('#dash').innerHTML = this.dashboard();
    this.$('#floors').innerHTML = b ? this.floorPicker(b) : '';

    this.city.refresh();
    if (this.office) { this.office.selected = this.agentId; this.office.refresh(); }

    const body = this.$('#panel-body');
    const scroll = body.scrollTop;
    this.$('#panel-head').innerHTML = `<div class="logo">FS</div><div><b>${esc(b?.name ?? 'Sales City')}</b><small>${b ? `${b.floors.length} floors · ${b.kind}` : 'Virtual sales city'}</small></div>`;
    const okN = this.sim.approvals.filter(p => !b || p.buildingId === b.id).length;
    this.$('#tabs').innerHTML = (['live', 'crm', 'content', 'team', 'ok', 'floors'] as Tab[]).map(t =>
      `<button data-act="tab:${t}" class="${t === this.tab ? 'on' : ''}">${t.toUpperCase()}${t === 'ok' && okN ? `<i class="n">${okN}</i>` : ''}</button>`).join('');
    body.innerHTML = this[this.tab](b);
    body.scrollTop = scroll;
  }

  private floorPicker(b: Building) {
    return `<div class="fp-head">${esc(b.short)}</div>` + b.floors.map(f => {
      const here = this.mode === 'office' && f.level === this.level;
      const needs = f.agents.some(a => a.status === 'needs-you');
      const label = f.vacant ? (f.rent ? `For rent $${f.rent}` : 'Available') : esc(f.name);
      return `<button data-act="floor:${b.id}:${f.level}" class="${here ? 'on' : ''} ${f.vacant ? 'vac' : ''}">
        <i class="dot ${needs ? 'needs' : f.vacant ? '' : 'ok'}"></i>L${f.level} <span>${label}</span></button>`;
    }).join('');
  }

  private live(b?: Building) {
    const k = this.sim.kpis(b?.id);
    const training = b?.kind === 'training';
    const stages = training ? TRAINING_STAGES : DEALER_STAGES;
    const leads = this.sim.leads.filter(l => (b ? l.buildingId === b.id : this.sim.building(l.buildingId).kind !== 'training'));
    const max = Math.max(1, ...stages.map(s => leads.filter(l => l.stage === s).length));
    const feed = this.sim.feed.filter(x => !b || x.buildingId === b.id).slice(0, 30);
    return `
      <div class="kpis">
        ${tile('Leads today', k.leadsToday)}${tile(training ? 'Booked calls' : 'Appointments', k.booked)}
        ${tile(training ? 'Enrolled' : 'Sold', k.closed)}${tile('Revenue', money(k.revenue))}
        ${tile('Tasks done', k.tasksDone)}${tile('Waiting over 1h', k.waiting, k.waiting > 0)}
      </div>
      <button class="cta" data-act="report">Daily email report</button>
      <h4>${training ? 'Enrollment' : 'Sales'} pipeline <span>${leads.filter(l => l.stage !== stages.at(-1)).length} open</span></h4>
      ${stages.map(s => { const n = leads.filter(l => l.stage === s).length; return `<div class="bar"><span>${s}</span><i><b style="width:${(n / max) * 100}%"></b></i><em>${n}</em></div>`; }).join('')}
      <h4>What's happening <span>${k.agentsWorking}/${k.agentsTotal} agents working</span></h4>
      <ul class="feed">${feed.map(x => `<li class="${x.kind}"><time>${clock(x.t)}</time><div><b>${esc(x.agent)}</b>${b ? '' : ` <small>${esc(this.sim.building(x.buildingId).short)}</small>`} · ${esc(x.text)}</div></li>`).join('') || '<li class="empty">Agents are warming up…</li>'}</ul>`;
  }

  private crm(b?: Building) {
    const leads = this.sim.leads.filter(l => !b || l.buildingId === b.id);
    const stages = b?.kind === 'training' ? TRAINING_STAGES : b ? DEALER_STAGES : [...new Set([...DEALER_STAGES, ...TRAINING_STAGES])];
    return `<h4>Pipeline <span>${leads.length} leads</span></h4>` + stages.map(s => {
      const rows = leads.filter(l => l.stage === s).sort((x, y) => x.touchedAt - y.touchedAt);
      if (!rows.length) return '';
      return `<div class="stage"><div class="stage-h">${s}<span>${rows.length}</span></div>${rows.slice(0, 25).map(l => `
        <div class="lead"><div><b>${esc(l.name)}</b><small>${esc(l.source)} · ${esc(l.interest)}${b ? '' : ` · ${esc(this.sim.building(l.buildingId).short)}`}</small></div>
        <em>${age(this.sim.now - l.touchedAt)}</em></div>`).join('')}</div>`;
    }).join('');
  }

  private content(b?: Building) {
    const social = this.sim.agents(b?.id).filter(a => a.taskSet === 'social');
    const counts = new Map<string, number>();
    for (const [bid, byCat] of this.sim.stats) if (!b || bid === b.id) for (const [cat, r] of byCat) counts.set(cat, (counts.get(cat) ?? 0) + Object.values(r).reduce((s, n) => s + n, 0));
    return `<h4>Social media agents <span>${social.length}</span></h4>
      <div class="chips">${social.slice(0, 40).map(a => agentChip(a, this.sim)).join('')}</div>
      <h4>Social tasks</h4>
      <ul class="tasks">${SOCIAL_TASKS.map(t => `<li><div><b>${t.name}</b><small>${t.detail}</small></div><em>${counts.get(t.name) ?? 0}</em></li>`).join('')}</ul>`;
  }

  private team(b?: Building) {
    const a = this.agentId ? this.sim.agent(this.agentId) : undefined;
    let html = '';
    if (a) {
      const hist = this.sim.feed.filter(x => x.agent === a.name && x.buildingId === a.buildingId).slice(0, 12);
      html += `<div class="agent-card kind-${a.kind}">
        <div class="ac-h"><b>${esc(a.name)}</b><span class="role">${esc(a.role)}</span><span class="st st-${a.status}">${a.status}</span></div>
        <small>${a.kind === 'ai' ? 'AI agent' : 'Human'} · ${esc(this.sim.building(a.buildingId).short)} L${a.floor} · ${a.done} tasks done</small>
        <p>${a.current ? `Now: ${esc(a.current.title)}${a.current.channel ? ` <i class="ch">${a.current.channel}</i>` : ''}` : 'Between tasks'}</p>
        <ul class="feed">${hist.map(x => `<li class="${x.kind}"><time>${clock(x.t)}</time><div>${esc(x.text)}</div></li>`).join('')}</ul></div>`;
    }
    if (this.mode === 'office' && b && this.level != null) {
      const f = b.floors.find(x => x.level === this.level)!;
      return html + `<h4>L${f.level} · ${esc(f.name)}</h4>` + (f.agents.map(x => agentRow(x)).join('') || '<p class="muted">No one on this floor yet.</p>');
    }
    if (b) return html + b.floors.filter(f => f.agents.length).map(f => `<h4>L${f.level} · ${esc(f.name)}</h4>${f.agents.map(x => agentRow(x)).join('')}`).join('');
    return html + `<h4>Buildings</h4>` + this.sim.buildings.map(x => {
      const ag = x.floors.flatMap(f => f.agents);
      return `<button class="brow" data-act="building:${x.id}"><i style="background:${x.color}"></i><b>${esc(x.name)}</b><em>${ag.filter(y => y.status === 'working').length}/${ag.length}</em></button>`;
    }).join('');
  }

  private ok(b?: Building) {
    const list = this.sim.approvals.filter(p => !b || p.buildingId === b.id);
    if (!list.length) return '<p class="muted">Nothing needs your OK right now. Agents flag offers and posts here before they go out.</p>';
    return `<h4>Needs your OK <span><button class="link" data-act="approve-all">Approve all</button></span></h4>` + list.map(p => {
      const a = this.sim.agent(p.agentId);
      return `<div class="approval"><div><b>${esc(a?.name ?? '?')}</b> <small>${esc(this.sim.building(p.buildingId).short)} L${a?.floor} · ${clock(p.t)}</small><p>${esc(p.text)}</p></div>
        <div class="btns"><button data-act="approve:${p.id}:yes" class="yes">Approve</button><button data-act="approve:${p.id}:no">No</button></div></div>`;
    }).join('');
  }

  private floors(b?: Building) {
    if (!b) return `<h4>Pick a building</h4>` + this.sim.buildings.map(x =>
      `<button class="brow" data-act="building:${x.id}"><i style="background:${x.color}"></i><b>${esc(x.name)}</b><em>${x.floors.length} fl</em></button>`).join('');
    return `<h4>${esc(b.name)} <span><button class="link" data-act="building:">← all</button></span></h4>` + b.floors.map(f => `
      <div class="floor-row ${f.vacant ? 'vac' : ''}">
        <button data-act="floor:${b.id}:${f.level}"><b>L${f.level}</b><span>${esc(f.vacant ? (f.rent ? 'Floor for rent' : 'Empty floor') : f.name)}</span>
        <em>${f.vacant ? (f.rent ? `$${f.rent}/mo` : 'Available') : `${f.agents.length} agents`}</em></button>
        ${f.vacant && f.rent ? `<button class="rent" data-act="rent:${b.id}:${f.level}">Rent</button>` : ''}
      </div>`).join('');
  }

  private dashboard() {
    const k = this.sim.kpis();
    return `<div class="dash-in"><h2>City dashboard <small>${clock(this.sim.now)}</small></h2>
      <div class="kpis wide">${tile('Leads today', k.leadsToday)}${tile('Booked', k.booked)}${tile('Closed', k.closed)}${tile('Revenue', money(k.revenue))}${tile('Tasks done', k.tasksDone)}${tile('Needs you', this.sim.approvals.length, this.sim.approvals.length > 0)}</div>
      <div class="cards">${this.sim.buildings.map(b => {
        const kb = this.sim.kpis(b.id);
        const vac = b.floors.filter(f => f.vacant).length;
        return `<button class="card" data-act="building:${b.id}" style="--c:${b.color};--a:${b.accent}">
          <div class="card-h"><b>${esc(b.name)}</b><small>${b.floors.length} floors · ${vac} available</small></div>
          <div class="card-k"><span><em>${kb.agentsWorking}/${kb.agentsTotal}</em>working</span><span><em>${kb.tasksDone}</em>tasks</span><span><em>${kb.closed}</em>closed</span><span><em>${kb.waiting}</em>waiting</span></div></button>`;
      }).join('')}</div></div>`;
  }

  private openReport() {
    const b = this.buildingId ? this.sim.building(this.buildingId) : undefined;
    const rows = this.sim.report(b?.id);
    const m = this.$('#modal');
    m.hidden = false;
    m.innerHTML = `<div class="sheet"><div class="sheet-h"><b>Daily email report — ${esc(b?.name ?? 'All buildings')}</b><button data-act="close">✕</button></div>
      <table><thead><tr><th>Task</th><th>Email</th><th>Phone</th><th>Text</th><th>Other</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.category)}</td><td>${r.email}</td><td>${r.phone}</td><td>${r.text}</td><td>${r.other}</td></tr>`).join('') || '<tr><td colspan="5">No tasks completed yet.</td></tr>'}
      </tbody></table><div class="sheet-f"><button class="cta" data-act="copy-report">Copy as email</button></div></div>`;
  }

  private reportText() {
    const b = this.buildingId ? this.sim.building(this.buildingId) : undefined;
    const k = this.sim.kpis(b?.id);
    const lines = this.sim.report(b?.id).map(r => `- ${r.category}: ${r.email} email, ${r.phone} phone, ${r.text} text${r.other ? `, ${r.other} other` : ''}`);
    return `Daily report — ${b?.name ?? 'Sales City'} (${clock(this.sim.now)})\n\nLeads today: ${k.leadsToday}\nBooked: ${k.booked}\nClosed: ${k.closed}\nRevenue: ${money(k.revenue)}\nWaiting over 1h: ${k.waiting}\n\nTasks completed:\n${lines.join('\n')}\n`;
  }
}

function tile(label: string, v: number | string, alert = false) {
  return `<div class="tile ${alert ? 'alert' : ''}"><small>${label}</small><b>${v}</b></div>`;
}
function age(min: number) { return min < 60 ? `${Math.max(0, min)}m` : min < 1440 ? `${Math.floor(min / 60)}h` : `${Math.floor(min / 1440)}d`; }
function agentRow(a: Agent) {
  return `<button class="arow" data-act="agent:${a.id}"><i class="dot st-${a.status}"></i><b>${esc(a.name)}</b><span class="role kind-${a.kind}">${esc(a.role)}</span>
    <small>${esc(a.current?.title ?? (a.kind === 'human' ? 'Human' : 'Idle'))}</small><em>${a.done}</em></button>`;
}
function agentChip(a: Agent, sim: Sim) {
  return `<button class="chip" data-act="agent:${a.id}"><i class="dot st-${a.status}"></i>${esc(a.name)} <small>${esc(sim.building(a.buildingId).short)}</small></button>`;
}

const SHELL = `
<header class="top">
  <div class="brand"><div class="logo">FS</div><div><b>FAST SALES</b><small id="ctx"></small></div></div>
  <nav class="seg"><button data-act="mode:office">Office</button><button data-act="mode:city">City</button><button data-act="mode:dashboard">Dashboard</button></nav>
  <div class="right">
    <span class="pill">● ON DUTY</span>
    <span class="seg small"><button data-act="speed:0">❚❚</button><button data-act="speed:1">1×</button><button data-act="speed:5">5×</button></span>
    <span class="box" id="clock"></span>
    <button class="box" id="night" data-act="night" title="Day / night"></button>
  </div>
</header>
<main>
  <section id="stage">
    <div id="stage-3d"></div>
    <nav class="menu">
      <button data-act="mode:office">View office</button>
      <button data-act="mode:city">City view</button>
      <button data-act="boss">Boss's desk</button>
      <button data-act="tab:content">Content wall</button>
      <button data-act="tab:live">Live screen</button>
      <button data-act="report">Daily report</button>
      <button data-act="tab:crm">My CRM ↗</button>
    </nav>
    <div id="chip" class="chip-title"></div>
    <div id="floors" class="floors"></div>
    <div class="legend"><span><i class="h"></i>Human</span><span><i class="ai"></i>AI agent</span><span><i class="w"></i>Working</span><span><i class="n"></i>Needs you</span></div>
    <div class="pad">
      <button data-act="cam:in">+</button><button data-act="cam:up">▲</button><button data-act="cam:out">−</button>
      <button data-act="cam:left">⟲</button><button data-act="cam:home">⌂</button><button data-act="cam:right">⟳</button>
      <span></span><button data-act="cam:down">▼</button><span></span>
    </div>
    <div id="dash" class="dash" hidden></div>
  </section>
  <aside class="panel"><div id="panel-head" class="panel-head"></div><nav id="tabs" class="tabs"></nav><div id="panel-body" class="panel-body"></div></aside>
</main>
<div id="modal" class="modal" hidden></div>`;
