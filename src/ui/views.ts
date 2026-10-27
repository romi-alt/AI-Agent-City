import { SOCIAL_TASKS } from '../core/data/tasks';
import { AFFILIATE_STAGES, clock, DEALER_STAGES, TRAINING_STAGES } from '../core/sim';
import type { Agent, Approval, Building, Lead } from '../core/types';
import type { App, Overlay } from './app';
import { age, esc, hhmm, money } from './util';

export interface AdminData {
  users: { id: string; username: string; name: string; role: string; onDuty: boolean; agentId?: string; enrolled: boolean; createdAt: number }[];
  signins: { t: number; username: string; ip: string; ua: string; result: string }[];
}

const STATUS_COLOR: Record<string, string> = {
  idea: '#64748b', draft: '#a78bfa', 'asset-ready': '#38bdf8', 'needs-approval': '#ef4444', scheduled: '#f5b335', published: '#22c55e', rejected: '#94a3b8',
};
const KIND_ICON: Record<string, string> = { training: '🎓', dealership: '🚗', associates: '👥', rental: '🏢' };

// ── shell ───────────────────────────────────────────────────────
export function shell(app: App) {
  return `
<header class="top">
  <div class="brand"><div class="logo">FS</div><div><b>${esc(app.sim.settings.companyName.toUpperCase())}</b><small id="ctx"></small></div></div>
  <nav class="seg"><button data-act="mode:office">Office</button><button data-act="mode:city">City</button><button data-act="mode:dashboard">Dashboard</button></nav>
  <div class="right">
    <button class="pill" id="duty" data-act="duty" title="Toggle on duty"></button>
    <span class="seg small" id="speed" title="Simulation speed"></span>
    <span class="box mono" id="clock"></span>
    <span class="box who">${esc(app.me.name)}</span>
    <button class="box" id="night" data-act="night" title="Day / night"></button>
    <button class="box" data-act="lock" title="Lock">🔒</button>
    <button class="box" data-act="overlay:admin" title="Settings">⚙</button>
    <button class="box" data-act="logout">Sign out</button>
  </div>
</header>
<main>
  <section id="stage">
    <div id="stage-3d"></div>
    <nav class="menu">
      <button data-act="myoffice">View office</button>
      <button data-act="mode:city">City view</button>
      <button data-act="agent:fast-sales-L12-0:focus">Elvis's desk</button>
      <button data-act="agent:fast-sales-L12-1:focus">Max</button>
      <button data-act="tab:team">Agents</button>
      <button data-act="overlay:screen">Big screen</button>
      <button data-act="overlay:content">Content wall</button>
      <button data-act="tab:live">Live screen</button>
      <button data-act="overlay:outbox">Outbox & reports</button>
      <button data-act="overlay:crm">My CRM ↗</button>
    </nav>
    <div id="chip" class="chip-title"></div>
    <div id="floors" class="floors"></div>
    <div class="legend"><span><i class="h"></i>Human</span><span><i class="ai"></i>AI agent</span><span><i class="w"></i>Working</span><span><i class="n"></i>Needs you</span></div>
    <div class="pad">
      <button data-act="cam:in" title="Zoom in">+</button><button data-act="cam:up" title="Forward">▲</button><button data-act="cam:out" title="Zoom out">−</button>
      <button data-act="cam:left" title="Rotate left">⟲</button><button data-act="cam:home" title="Reset view">⌂</button><button data-act="cam:right" title="Rotate right">⟳</button>
      <button data-act="overlay:screen" title="Big screen">▶</button><button data-act="cam:down" title="Back">▼</button><button data-act="mode:city" title="City">▦</button>
    </div>
    <div id="dash" class="dash" hidden></div>
    <div id="overlay" class="overlay" hidden></div>
  </section>
  <aside class="panel"><div id="panel-head" class="panel-head"></div><nav id="tabs" class="tabs"></nav><div id="panel-body" class="panel-body"></div></aside>
</main>
<aside id="drawer" class="drawer" hidden></aside>
<div id="modal" class="modal" hidden></div>`;
}

export function floorPicker(app: App, b: Building) {
  const mine = app.myFloor;
  return `<div class="fp-head">${esc(b.short)}</div>` + b.floors.map(f => {
    const here = app.mode === 'office' && f.level === app.level && b.id === app.buildingId;
    const needs = f.agents.some(a => a.status === 'needs-you');
    const yours = mine && mine.buildingId === b.id && mine.level === f.level;
    const label = yours ? 'Your office' : f.vacant ? (f.rent ? `For rent $${f.rent}/mo` : 'Available') : esc(f.name);
    return `<button data-act="floor:${b.id}:${f.level}" class="${here ? 'on' : ''} ${f.vacant ? 'vac' : ''}">
      <i class="dot ${needs ? 'needs' : f.vacant ? '' : 'ok'}"></i>L${f.level} <span>${label}</span></button>`;
  }).join('');
}

export function panelHead(app: App) {
  const b = app.building;
  return `<div class="logo">FS</div><div><b>${esc(b?.name ?? app.sim.settings.companyName)}</b><small>${b ? `${b.floors.length} floors · ${b.kind === 'training' ? 'Training Center' : b.kind}` : 'Virtual sales city'} · virtual office</small></div>`;
}

export function tabs(app: App) {
  const okN = app.sim.approvals.filter(p => !app.buildingId || p.buildingId === app.buildingId).length;
  return (['live', 'crm', 'content', 'team', 'ok', 'floors'] as const).map(t =>
    `<button data-act="tab:${t}" class="${t === app.tab ? 'on' : ''}">${t.toUpperCase()}${t === 'ok' && okN ? `<i class="n">${okN}</i>` : ''}</button>`).join('');
}

export function panel(app: App) {
  const b = app.building;
  switch (app.tab) {
    case 'live': return live(app, b);
    case 'crm': return crmTab(app, b);
    case 'content': return contentTab(app, b);
    case 'team': return team(app, b);
    case 'ok': return okTab(app, b);
    case 'floors': return floorsTab(app, b);
  }
}

// ── LIVE ────────────────────────────────────────────────────────
function tile(label: string, v: number | string, alert = false) {
  return `<div class="tile ${alert ? 'alert' : ''}"><small>${label}</small><b>${v}</b></div>`;
}

function kpiTiles(app: App, b?: Building) {
  const k = app.sim.kpis(b?.id);
  const t = b?.kind === 'training';
  return tile('Leads today', k.leadsToday) + tile(t ? 'Booked calls · 24h' : 'Appointments · 24h', k.booked24h)
    + tile(t ? 'Enrolled this month' : 'Sold this month', k.closedMonth) + tile('Revenue this month', money(k.revenueMonth))
    + tile('Appointments today', k.apptsToday) + tile('Waiting over 1h', k.waiting, k.waiting > 0);
}

function pipelineBars(app: App, b?: Building) {
  const training = b?.kind === 'training';
  const stages = training ? TRAINING_STAGES : DEALER_STAGES;
  const leads = [...app.sim.leads.values()].filter(l => l.kind === 'customer' && (b ? l.buildingId === b.id : app.sim.building(l.buildingId).kind !== 'training'));
  const counts = stages.map(s => leads.filter(l => l.stage === s).length);
  const open = counts.slice(0, -1).reduce((a, n) => a + n, 0);
  const max = Math.max(1, ...counts.slice(0, -1));
  return `<h4>${training ? 'Enrollment' : 'Sales'} pipeline <span>${open} open</span></h4>
    ${stages.map((s, i) => `<div class="bar"><span>${s}</span><i><b style="width:${Math.min(100, (counts[i] / max) * 100)}%"></b></i><em>${counts[i]}</em></div>`).join('')}`;
}

function feedList(app: App, b?: Building, n = 30) {
  const items = app.sim.feed.filter(x => !b || x.buildingId === b.id).slice(0, n);
  return `<ul class="feed">${items.map(x => `<li class="${x.kind}"><time>${clock(x.t)}</time><div><b>${esc(x.agent)}</b>${b ? '' : ` <small>${esc(app.sim.building(x.buildingId).short)}</small>`} · ${esc(x.text)}</div></li>`).join('') || '<li class="empty">Agents are warming up…</li>'}</ul>`;
}

function live(app: App, b?: Building) {
  const k = app.sim.kpis(b?.id);
  return `<div class="kpis">${kpiTiles(app, b)}</div>
    <button class="cta" data-act="overlay:crm">Open my CRM</button>
    ${pipelineBars(app, b)}
    <h4>What's happening in your office <span>${k.agentsWorking}/${k.agentsTotal} working</span></h4>
    ${feedList(app, b)}`;
}

// ── CRM ─────────────────────────────────────────────────────────
function stagesOf(b?: Building) {
  return b?.kind === 'training' ? [...TRAINING_STAGES, ...AFFILIATE_STAGES.filter(s => s !== 'Contacted')] : b ? DEALER_STAGES : [...new Set([...DEALER_STAGES, ...TRAINING_STAGES])];
}

function crmTab(app: App, b?: Building) {
  const leads = [...app.sim.leads.values()].filter(l => !b || l.buildingId === b.id);
  return `<h4>Pipeline · tap a lead to open it <span><button class="link" data-act="new-lead:${b?.id ?? ''}">+ Add lead</button></span></h4>` + stagesOf(b).map(s => {
    const rows = leads.filter(l => l.stage === s).sort((x, y) => x.touchedAt - y.touchedAt);
    if (!rows.length) return '';
    return `<div class="stage"><div class="stage-h">${s}<span>${rows.length}</span></div>${rows.slice(0, 20).map(l => leadRow(app, l, !b)).join('')}</div>`;
  }).join('');
}

function leadRow(app: App, l: Lead, showBuilding: boolean) {
  return `<button class="lead" data-act="lead:${l.id}"><div><b>${esc(l.name)}${l.real ? ' <i class="real">real</i>' : ''}</b><small>${esc(l.source)} · ${esc(l.interest)}${showBuilding ? ` · ${esc(app.sim.building(l.buildingId).short)}` : ''}</small></div>
    <em>${age(app.sim.now - l.createdAt)}</em></button>`;
}

// ── CONTENT ─────────────────────────────────────────────────────
function contentTab(app: App, b?: Building) {
  const items = [...app.sim.content.values()].filter(c => !b || c.buildingId === b.id);
  const n = (s: string) => items.filter(c => c.status === s).length;
  const inbox = [...app.sim.inbox.values()].filter(i => !b || i.buildingId === b.id);
  const m = app.sim.socialTotals(b?.id, 7);
  const social = app.sim.agents(b?.id).filter(a => a.taskSet === 'social');
  const insights = [...app.sim.insights.values()].filter(i => !b || i.buildingId === b.id).slice(-4).reverse();
  return `<div class="kpis">${tile('Ideas', n('idea'))}${tile('Drafts', n('draft') + n('asset-ready'))}${tile('Awaiting OK', n('needs-approval'), n('needs-approval') > 0)}${tile('Scheduled', n('scheduled'))}${tile('Published · 7d', m.posts)}${tile('Leads from social · 7d', m.leads)}</div>
    <button class="cta" data-act="overlay:content">Open content wall</button>
    <h4>This week</h4>${weekStrip(app, b)}
    <h4>Inbox <span>${inbox.filter(i => i.status === 'open').length} open · ${inbox.filter(i => i.status === 'escalated').length} escalated</span></h4>
    <h4>Social media agents <span>${social.length}</span></h4>
    <div class="chips">${social.slice(0, 30).map(a => agentChip(app, a)).join('')}</div>
    <h4>Latest insights</h4>
    <ul class="tasks">${insights.map(i => `<li><div><b>${esc(i.kind)}</b><small>${esc(i.text)}</small></div></li>`).join('') || '<li class="muted">None yet.</li>'}</ul>`;
}

function weekStrip(app: App, b?: Building) {
  return `<div class="week">${Array.from({ length: 7 }, (_, i) => app.sim.today + i).map(d => {
    const posts = [...app.sim.content.values()].filter(c => c.day === d && (!b || c.buildingId === b.id));
    return `<div><small>${app.sim.dayLabel(d).split(',')[0]}</small>${posts.slice(0, 6).map(c => `<i style="background:${STATUS_COLOR[c.status]}" title="${esc(c.status)} · ${esc(c.topic)}"></i>`).join('')}${posts.length > 6 ? `<em>+${posts.length - 6}</em>` : ''}</div>`;
  }).join('')}</div>`;
}

// ── TEAM ────────────────────────────────────────────────────────
function team(app: App, b?: Building) {
  const a = app.agentId ? app.sim.agent(app.agentId) : undefined;
  let html = a ? agentCard(app, a) : '';
  if (app.mode === 'office' && b && app.level != null) {
    const f = b.floors.find(x => x.level === app.level)!;
    return html + `<h4>L${f.level} · ${esc(f.name)}</h4>${f.info ? `<p class="muted small">${esc(f.info)}</p>` : ''}` + (f.agents.map(x => agentRow(app, x)).join('') || '<p class="muted">No one on this floor yet.</p>');
  }
  if (b) return html + b.floors.filter(f => f.agents.length).map(f => `<h4>L${f.level} · ${esc(f.name)}</h4>${f.agents.map(x => agentRow(app, x)).join('')}`).join('');
  html += '<h4>People signed in</h4>' + app.people.map(p => {
    const desk = p.agentId ? app.sim.agent(p.agentId) : undefined;
    return `<div class="arow static"><i class="dot ${p.onDuty ? 'st-working' : 'st-idle'}"></i><b>${esc(p.name)}</b><span class="role kind-human">${p.onDuty ? 'on duty' : 'off duty'}</span><small>${desk ? `${esc(app.sim.building(desk.buildingId).short)} L${desk.floor}` : 'no desk'}</small><em></em></div>`;
  }).join('');
  return html + `<h4>Buildings</h4>` + app.sim.buildings.map(x => {
    const ag = x.floors.flatMap(f => f.agents);
    return `<button class="brow" data-act="building:${x.id}"><i style="background:${x.color}"></i><b>${esc(x.name)}</b><em>${ag.filter(y => y.status === 'working').length}/${ag.length}</em></button>`;
  }).join('');
}

function agentCard(app: App, a: Agent) {
  const hist = app.sim.feed.filter(x => x.agent === a.name && x.buildingId === a.buildingId).slice(0, 10);
  const user = a.userId ? app.people.find(p => p.id === a.userId) : undefined;
  const mine = app.me.agentId === a.id;
  const what = a.taskSet === 'social' ? 'Social media tasks' : a.taskSet === 'manager' ? 'Manager: hourly lead checks, morning & daily reports, ad tests' : a.taskSet === 'none' ? '' : 'Email · phone · text';
  return `<div class="agent-card kind-${a.kind}">
    <div class="ac-h"><b>${esc(a.name)}</b><span class="role">${esc(a.role)}</span><span class="st st-${a.status}">${a.status}</span></div>
    <small>${a.kind === 'ai' ? 'AI agent' : user ? `Human · ${esc(user.name)}` : 'Human'} · ${esc(app.sim.building(a.buildingId).short)} L${a.floor} · ${a.done} tasks done</small>
    <p>${a.current ? `Now: ${esc(a.current.title)}${a.current.channel ? ` <i class="ch">${a.current.channel}</i>` : ''}` : 'Between tasks'}</p>
    ${what ? `<details><summary>${what}</summary><div class="chips">${a.categories.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div></details>` : ''}
    ${a.kind === 'human' ? `<button class="btn-line sm" data-act="desk:${mine ? '' : a.id}">${mine ? 'Not my desk' : 'This is my desk'}</button>` : ''}
    <ul class="feed">${hist.map(x => `<li class="${x.kind}"><time>${clock(x.t)}</time><div>${esc(x.text)}</div></li>`).join('')}</ul></div>`;
}

function agentRow(app: App, a: Agent) {
  return `<button class="arow" data-act="agent:${a.id}"><i class="dot st-${a.status}"></i><b>${esc(a.name)}</b><span class="role kind-${a.kind}">${esc(a.role)}</span>
    <small>${esc(a.current?.title ?? (a.userId ? (app.people.find(p => p.id === a.userId)?.name ?? 'Human') : a.kind === 'human' ? 'Human' : 'Idle'))}</small><em>${a.done}</em></button>`;
}

function agentChip(app: App, a: Agent) {
  return `<button class="chip" data-act="agent:${a.id}"><i class="dot st-${a.status}"></i>${esc(a.name)} <small>${esc(app.sim.building(a.buildingId).short)}</small></button>`;
}

// ── OK (approvals) ──────────────────────────────────────────────
function okTab(app: App, b?: Building) {
  const list = app.sim.approvals.filter(p => !b || p.buildingId === b.id);
  if (!list.length) return '<p class="muted">Nothing needs your OK right now. Agents bring offers, posts, escalations and messages to real customers here before anything goes out.</p>';
  return `<h4>Needs your OK <span><button class="link" data-act="approve-all">Approve all</button></span></h4>` + list.map(p => approval(app, p)).join('');
}

function approval(app: App, p: Approval) {
  const a = app.sim.agent(p.agentId);
  const head = `<div><b>${esc(a?.name ?? '?')}</b> <small>${esc(app.sim.building(p.buildingId).short)} L${a?.floor ?? ''} · ${clock(p.t)}</small><p>${esc(p.text)}</p></div>`;
  let body = '', yes = 'Approve', no = 'No';
  if (p.kind === 'message' || p.kind === 'call') {
    const m = app.sim.messages.get(p.refId ?? '');
    if (m) body = `<small class="muted">${p.kind === 'call' ? 'Script' : `To ${esc(m.to)}${m.subject ? ` · ${esc(m.subject)}` : ''}`}${m.by === 'claude' ? ' · drafted by Claude' : ''}</small><textarea rows="5">${esc(m.body)}</textarea>`;
    yes = p.kind === 'call' ? 'Mark called' : app.sim.settings.deliveryMode === 'live' ? 'Approve & send' : 'Approve (simulated)';
    no = 'Skip';
  } else if (p.kind === 'post') {
    const c = app.sim.content.get(p.refId ?? '');
    if (c) body = `<small class="muted">${esc(c.platform)} ${esc(c.format)} · ${app.sim.dayLabel(c.day)} ${c.time}${c.by === 'claude' ? ' · drafted by Claude' : ''}</small><textarea rows="4">${esc(c.caption ?? '')}</textarea><small class="muted">${esc(c.cta ?? '')} ${esc((c.hashtags ?? []).join(' '))}</small>`;
    yes = 'Approve & schedule'; no = 'Reject';
  } else if (p.kind === 'reply') {
    const i = app.sim.inbox.get(p.refId ?? '');
    if (i) body = `<small class="muted">${esc(i.author)} on ${esc(i.platform)} · suggested reply</small><textarea rows="3">${esc(i.reply ?? '')}</textarea>`;
    yes = 'Send reply'; no = 'Handled';
  }
  return `<div class="approval kind-${p.kind}">${head}${body}<div class="btns"><button data-act="approve:${p.id}:yes" class="yes">${yes}</button><button data-act="approve:${p.id}:no">${no}</button></div></div>`;
}

// ── FLOORS ──────────────────────────────────────────────────────
function floorsTab(app: App, b?: Building) {
  if (!b) return `<h4>Pick a building</h4>` + app.sim.buildings.map(x =>
    `<button class="brow" data-act="building:${x.id}"><i style="background:${x.color}"></i><b>${KIND_ICON[x.kind]} ${esc(x.name)}</b><em>${x.floors.length} fl · ${x.floors.filter(f => f.vacant).length} free</em></button>`).join('');
  const k = app.sim.kpis(b.id);
  return `<h4>${esc(b.name)} <span><button class="link" data-act="building:">← all</button></span></h4>
    ${b.kind === 'rental' ? `<p class="muted small">${b.floors.filter(f => f.tenant).length} of ${b.floors.length} floors rented · ${money(k.rentMonthly)}/mo</p>` : ''}` + b.floors.map(f => `
    <div class="floor-row ${f.vacant ? 'vac' : ''}">
      <button data-act="floor:${b.id}:${f.level}"><b>L${f.level}</b><span>${esc(f.vacant ? (f.rent ? 'Floor for rent' : 'Empty floor') : f.name)}${f.tenant ? `<small>${esc([f.tenant.contact, f.tenant.email, f.tenant.phone].filter(Boolean).join(' · ') || 'Tenant')}</small>` : ''}</span>
      <em>${f.vacant ? (f.rent ? `$${f.rent}/mo` : 'Available') : `${f.agents.length} agents`}</em></button>
      ${f.vacant && f.rent ? `<button class="rent" data-act="rent:${b.id}:${f.level}">Rent</button>` : ''}
      ${f.tenant ? `<button class="rent ghost" data-act="vacate:${b.id}:${f.level}">Vacate</button>` : ''}
    </div>`).join('');
}

// ── dashboard ───────────────────────────────────────────────────
export function dashboard(app: App) {
  const k = app.sim.kpis();
  const reports = [...app.sim.reports.values()].reverse().slice(0, 6);
  return `<div class="dash-in"><h2>City dashboard <small>${app.sim.dayLabel(app.sim.today)} · ${clock(app.sim.now)}</small></h2>
    <div class="kpis wide">${tile('Leads today', k.leadsToday)}${tile('Booked · 24h', k.booked24h)}${tile('Closed this month', k.closedMonth)}${tile('Revenue this month', money(k.revenueMonth))}${tile('Tasks today', k.tasksToday)}${tile('Needs you', k.needsYou, k.needsYou > 0)}</div>
    <div class="cards">${app.sim.buildings.map(b => {
      const kb = app.sim.kpis(b.id);
      const vac = b.floors.filter(f => f.vacant).length;
      return `<button class="card" data-act="building:${b.id}" style="--c:${b.color}">
        <div class="card-h"><b>${KIND_ICON[b.kind]} ${esc(b.name)}</b><small>${b.floors.length} floors · ${vac} available${kb.needsYou ? ` · <span class="red">${kb.needsYou} need you</span>` : ''}</small></div>
        <div class="card-k">${b.kind === 'rental'
          ? `<span><em>${b.floors.length - vac}</em>rented</span><span><em>${money(kb.rentMonthly)}</em>per month</span><span><em>${kb.agentsTotal}</em>agents</span><span><em>${kb.tasksToday}</em>tasks today</span>`
          : `<span><em>${kb.agentsWorking}/${kb.agentsTotal}</em>working</span><span><em>${kb.tasksToday}</em>tasks today</span><span><em>${kb.closedMonth}</em>${b.kind === 'training' ? 'enrolled' : 'sold'}/mo</span><span><em>${kb.waiting}</em>waiting</span>`}</div></button>`;
    }).join('')}</div>
    <div class="dash-cols">
      <section><h4>Today's tasks by type <span><button class="link" data-act="report:today">Open daily report</button></span></h4>${reportTable(app, undefined, true)}</section>
      <section><h4>Reports sent</h4><ul class="tasks">${reports.map(r => `<li><button class="plain" data-act="report:${r.id}"><b>${esc(r.subject)}</b><small>${clock(r.t)} · ${r.to.length ? `to ${r.to.length} recipient(s)` : 'no recipients set'} · ${r.status}</small></button></li>`).join('') || '<li class="muted">The first morning report goes out at ' + hhmm(app.sim.settings.morningReportAt) + '.</li>'}</ul></section>
    </div></div>`;
}

function reportTable(app: App, buildingId: string | undefined, today: boolean) {
  const rows = app.sim.report(buildingId, today);
  return `<table class="tbl"><thead><tr><th>Task</th><th>Email</th><th>Phone</th><th>Text</th><th>Other</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(r.category)}</td><td>${r.email}</td><td>${r.phone}</td><td>${r.text}</td><td>${r.other}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No tasks completed yet today.</td></tr>'}</tbody></table>`;
}

export function reportModal(app: App, id: string) {
  const r = id === 'today' ? undefined : app.sim.reports.get(id);
  if (!r) return `<div class="sheet-h"><b>Today so far — ${esc(app.building?.name ?? 'all buildings')}</b><button data-act="close">✕</button></div>
    <div class="sheet-b">${reportTable(app, app.buildingId, true)}<p class="muted small">The full daily email goes out at ${hhmm(app.sim.settings.dailyReportAt)} to ${app.sim.settings.reportRecipients.length ? esc(app.sim.settings.reportRecipients.join(', ')) : 'nobody yet – add recipients in Settings'}.</p></div>`;
  return `<div class="sheet-h"><b>${esc(r.subject)}</b><button data-act="close">✕</button></div>
    <div class="sheet-b"><small class="muted">${app.sim.dayLabel(Math.floor(r.t / 1440))} ${clock(r.t)} · ${r.to.length ? `to ${esc(r.to.join(', '))}` : 'no recipients'} · ${r.status}${r.error ? ` – ${esc(r.error)}` : ''}</small><pre>${esc(r.body)}</pre></div>
    <div class="sheet-f"><button class="cta" data-act="copy">Copy</button></div>`;
}

// ── overlays ────────────────────────────────────────────────────
export function overlay(app: App, o: Overlay) {
  const title = { crm: 'My CRM', content: 'Content wall', outbox: 'Outbox & reports', admin: 'Settings', screen: '' }[o];
  if (o === 'screen') return bigScreen(app);
  const body = o === 'crm' ? crmBoard(app) : o === 'content' ? contentWall(app) : o === 'outbox' ? outbox(app) : admin(app);
  return `<div class="ov-h"><h2>${title}</h2><button class="box" data-act="overlay:">✕ Close</button></div><div class="ov-body">${body}</div>`;
}

function buildingSelect(app: App, includeAll = false) {
  return `<select data-change="board">${includeAll ? `<option value="">All buildings</option>` : ''}${app.sim.buildings.filter(b => b.kind !== 'rental' || b.floors.some(f => f.tenant)).map(b => `<option value="${b.id}" ${b.id === app.boardBuilding ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`;
}

function crmBoard(app: App) {
  const tmpl = app.sim.settings.crmUrlTemplate;
  return `<div class="toolbar">${buildingSelect(app)}<input data-input="crmq" placeholder="Search name, email, phone, source…" value="${esc(app.crmQuery)}">
    <label class="check"><input type="checkbox" data-change="realOnly" ${app.realOnly ? 'checked' : ''}> Real leads only</label>
    <button class="btn-gold sm" data-act="new-lead:${app.boardBuilding}">+ Add lead</button>
    ${tmpl ? `<a class="btn-line sm" href="${esc(tmpl.split('/contacts')[0])}" target="_blank" rel="noopener">External CRM ↗</a>` : ''}</div>
    ${kanban(app)}`;
}

export function kanban(app: App) {
  const b = app.sim.building(app.boardBuilding);
  const q = app.crmQuery.trim().toLowerCase();
  const leads = [...app.sim.leads.values()].filter(l => l.buildingId === b.id && (!app.realOnly || l.real)
    && (!q || [l.name, l.email, l.phone, l.source, l.interest].some(v => v?.toLowerCase().includes(q))));
  const groups: [string, string[]][] = b.kind === 'training' ? [['Students', TRAINING_STAGES], ['Affiliates', AFFILIATE_STAGES]] : [['Customers', DEALER_STAGES]];
  return `<div class="kanban">${groups.map(([g, stages]) => stages.map(s => {
    const rows = leads.filter(l => l.stage === s && (g !== 'Affiliates') === (l.kind === 'customer')).sort((x, y) => y.createdAt - x.createdAt);
    return `<div class="col"><div class="col-h">${groups.length > 1 ? `<small>${g}</small>` : ''}${s}<span>${rows.length}</span></div>${rows.slice(0, 60).map(l => `
      <button class="kcard ${l.priority ? 'prio' : ''}" data-act="lead:${l.id}"><b>${esc(l.name)}${l.real ? ' <i class="real">real</i>' : ''}</b><small>${esc(l.interest)} · ${esc(l.source)}</small><em>${age(app.sim.now - l.touchedAt)} since last touch</em></button>`).join('')}${rows.length > 60 ? `<p class="muted small">+${rows.length - 60} more</p>` : ''}</div>`;
  }).join('')).join('')}</div>`;
}

function contentWall(app: App) {
  const b = app.sim.building(app.boardBuilding);
  const tab = app.contentTab;
  const tabs = (['calendar', 'posts', 'inbox', 'analytics', 'insights', 'reports'] as const).map(t => `<button data-act="ctab:${t}" class="${t === tab ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('');
  const body = tab === 'calendar' ? calendar(app, b) : tab === 'posts' ? posts(app, b) : tab === 'inbox' ? inbox(app, b) : tab === 'analytics' ? analytics(app, b) : tab === 'insights' ? insightsView(app, b) : socialReports(app);
  return `<div class="toolbar">${buildingSelect(app)}<nav class="seg">${tabs}</nav></div>${body}`;
}

function calendar(app: App, b: Building) {
  const items = [...app.sim.content.values()].filter(c => c.buildingId === b.id);
  const start = app.sim.today - app.sim.dateOf(app.sim.today).getUTCDay();
  const days = Array.from({ length: 35 }, (_, i) => start + i);
  return `<div class="legend-row">${Object.entries(STATUS_COLOR).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}</div>
    <div class="cal">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="cal-h">${d}</div>`).join('')}
    ${days.map(d => {
      const list = items.filter(c => c.day === d).sort((x, y) => x.time.localeCompare(y.time));
      return `<div class="cal-d ${d === app.sim.today ? 'today' : ''} ${d < app.sim.today ? 'past' : ''}"><small>${app.sim.dateOf(d).getUTCDate()}</small>${list.map(c => `<button class="cal-p" style="--s:${STATUS_COLOR[c.status]}" data-act="post:${c.id}"><b>${c.time} ${esc(c.platform)}</b>${esc(c.topic)}</button>`).join('')}</div>`;
    }).join('')}</div>
    <p class="muted small">Social agents keep a rolling 30-day calendar: plan → write → produce → your OK → scheduled → published.</p>`;
}

function posts(app: App, b: Building) {
  const order = ['needs-approval', 'asset-ready', 'draft', 'idea', 'scheduled', 'published'];
  const list = [...app.sim.content.values()].filter(c => c.buildingId === b.id && c.status !== 'rejected')
    .sort((x, y) => order.indexOf(x.status) - order.indexOf(y.status) || x.day - y.day).slice(0, 80);
  return `<table class="tbl"><thead><tr><th>When</th><th>Where</th><th>Post</th><th>Status</th><th>Results</th></tr></thead><tbody>${list.map(c => `
    <tr class="click" data-act="post:${c.id}"><td>${app.sim.dayLabel(c.day)}<br><small>${c.time}</small></td><td>${esc(c.platform)}<br><small>${esc(c.format)}${c.campaign ? ' · campaign' : ''}</small></td>
    <td><b>${esc(c.topic)}</b><br><small>${esc(c.caption ?? '—')}</small></td><td><span class="tag" style="--s:${STATUS_COLOR[c.status]}">${c.status}</span>${c.by === 'claude' ? '<br><small>by Claude</small>' : ''}</td>
    <td>${c.metrics ? `<small>${c.metrics.reach.toLocaleString()} reach · ${c.metrics.engagement} eng · ${c.metrics.clicks} clicks · ${c.metrics.leads} leads</small>` : ''}</td></tr>`).join('')}</tbody></table>`;
}

function inbox(app: App, b: Building) {
  const order = ['escalated', 'open', 'answered', 'resolved'];
  const list = [...app.sim.inbox.values()].filter(i => i.buildingId === b.id).sort((x, y) => order.indexOf(x.status) - order.indexOf(y.status) || y.t - x.t).slice(0, 60);
  if (!list.length) return '<p class="muted">No comments or messages yet. They arrive once posts are published.</p>';
  return list.map(i => `<div class="inbox-item st-${i.status}">
    <div class="ib-h"><b>${esc(i.author)}</b><small>${esc(i.platform)} ${i.kind} · ${clock(i.t)} · ${i.intent}</small><span class="tag">${i.status}</span></div>
    <p>${esc(i.text)}</p>${i.reply ? `<p class="reply">↳ ${esc(i.reply)}</p>` : ''}${i.leadId ? `<button class="link" data-act="lead:${i.leadId}">Open lead →</button>` : ''}
    ${i.status === 'escalated' || i.status === 'open' ? `<form data-form="reply" class="row"><input type="hidden" name="id" value="${i.id}"><input name="text" placeholder="Write a reply…" value="${esc(i.reply ?? '')}" required><button class="btn-gold sm" type="submit">Reply</button></form>` : ''}
  </div>`).join('');
}

function analytics(app: App, b: Building) {
  const m7 = app.sim.socialTotals(b.id, 7), m30 = app.sim.socialTotals(b.id, 30);
  const pub = [...app.sim.content.values()].filter(c => c.buildingId === b.id && c.status === 'published' && c.metrics);
  const byPlat = new Map<string, { posts: number; reach: number; engagement: number; clicks: number; leads: number }>();
  for (const c of pub) {
    const r = byPlat.get(c.platform) ?? { posts: 0, reach: 0, engagement: 0, clicks: 0, leads: 0 };
    r.posts++; r.reach += c.metrics!.reach; r.engagement += c.metrics!.engagement; r.clicks += c.metrics!.clicks; r.leads += c.metrics!.leads;
    byPlat.set(c.platform, r);
  }
  const top = pub.sort((x, y) => y.metrics!.engagement - x.metrics!.engagement).slice(0, 5);
  return `<div class="kpis wide">${tile('Posts · 7d', m7.posts)}${tile('Reach · 7d', m7.reach.toLocaleString())}${tile('Impressions · 7d', m7.impressions.toLocaleString())}${tile('Engagement · 7d', m7.engagement.toLocaleString())}${tile('Clicks · 7d', m7.clicks)}${tile('Leads · 30d', m30.leads)}</div>
    <div class="dash-cols"><section><h4>By platform</h4><table class="tbl"><thead><tr><th>Platform</th><th>Posts</th><th>Reach</th><th>Engagement</th><th>Clicks</th><th>Leads</th></tr></thead><tbody>
    ${[...byPlat].map(([p, r]) => `<tr><td>${p}</td><td>${r.posts}</td><td>${r.reach.toLocaleString()}</td><td>${r.engagement}</td><td>${r.clicks}</td><td>${r.leads}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nothing published yet.</td></tr>'}</tbody></table></section>
    <section><h4>Top posts</h4><ul class="tasks">${top.map(c => `<li><button class="plain" data-act="post:${c.id}"><b>${esc(c.topic)}</b><small>${esc(c.platform)} ${c.format} · ${c.metrics!.engagement} engagements · ${c.metrics!.leads} leads</small></button></li>`).join('') || '<li class="muted">—</li>'}</ul></section></div>`;
}

function insightsView(app: App, b: Building) {
  const list = [...app.sim.insights.values()].filter(i => i.buildingId === b.id).reverse();
  const kinds = ['strategy', 'campaign', 'trend', 'competitor', 'optimization'] as const;
  return `<div class="dash-cols three">${kinds.map(k => `<section><h4>${k}</h4><ul class="tasks">${list.filter(i => i.kind === k).slice(0, 8).map(i => `<li><div><small>${esc(i.agent)} · ${app.sim.dayLabel(Math.floor(i.t / 1440))}</small>${esc(i.text)}</div></li>`).join('') || '<li class="muted">—</li>'}</ul></section>`).join('')}</div>
    <h4>What social agents do</h4><ul class="tasks cols">${SOCIAL_TASKS.map(t => `<li><div><b>${t.name}</b><small>${t.detail}</small></div></li>`).join('')}</ul>`;
}

function socialReports(app: App) {
  const list = [...app.sim.reports.values()].filter(r => r.kind === 'weekly-social').reverse();
  return list.length ? `<ul class="tasks">${list.map(r => `<li><button class="plain" data-act="report:${r.id}"><b>${esc(r.subject)}</b><small>${r.status}</small></button></li>`).join('')}</ul>`
    : '<p class="muted">The weekly social media report is written every Monday at 09:00.</p>';
}

function outbox(app: App) {
  const f = app.outboxFilter;
  const msgs = [...app.sim.messages.values()].reverse().filter(m => f === 'all' || (f === 'real' ? m.real : f === 'pending' ? m.status === 'pending' : m.channel === f)).slice(0, 150);
  const reports = [...app.sim.reports.values()].reverse();
  const mode = app.sim.settings.deliveryMode;
  return `<p class="banner ${mode}">${mode === 'live' ? 'Live mode: approved messages to <b>real</b> leads and reports to recipients are sent through your email / text providers.' : 'Simulate mode: nothing leaves the building. Switch to live in Settings once email / texting is configured.'}</p>
    <div class="dash-cols"><section><h4>Messages <span><select data-change="outbox">${[['all', 'All'], ['real', 'Real leads'], ['pending', 'Pending'], ['email', 'Email'], ['text', 'Text'], ['phone', 'Calls']].map(([v, l]) => `<option value="${v}" ${v === f ? 'selected' : ''}>${l}</option>`).join('')}</select></span></h4>
      <table class="tbl"><thead><tr><th>Time</th><th>From</th><th>To</th><th>Message</th><th>Status</th></tr></thead><tbody>
      ${msgs.map(m => `<tr class="click" data-act="message:${m.id}"><td>${clock(m.t)}</td><td>${esc(m.agentName)}<br><small>${esc(app.sim.building(m.buildingId).short)}</small></td><td>${m.channel} · ${esc(m.to)}</td><td><b>${esc(m.subject ?? m.category ?? '')}</b><br><small>${esc(m.body.slice(0, 90))}</small></td><td><span class="tag ms-${m.status}">${m.status}</span></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No messages yet.</td></tr>'}
      </tbody></table></section>
    <section><h4>Reports</h4><ul class="tasks">${reports.map(r => `<li><button class="plain" data-act="report:${r.id}"><b>${esc(r.subject)}</b><small>${r.kind} · ${clock(r.t)} · ${r.status}${r.to.length ? ` · ${r.to.length} recipient(s)` : ''}</small></button></li>`).join('') || '<li class="muted">No reports yet.</li>'}</ul></section></div>`;
}

export function messageModal(app: App, id: string) {
  const m = app.sim.messages.get(id);
  if (!m) return '<div class="sheet-b">Gone.</div>';
  return `<div class="sheet-h"><b>${m.channel === 'email' ? esc(m.subject ?? 'Email') : m.channel === 'text' ? 'Text message' : 'Call'}</b><button data-act="close">✕</button></div>
    <div class="sheet-b"><small class="muted">${clock(m.t)} · ${esc(m.agentName)} → ${esc(m.to)} · ${m.status}${m.error ? ` – ${esc(m.error)}` : ''} · ${m.real ? 'real lead' : 'simulated lead'} · by ${m.by}</small><pre>${esc(m.body)}</pre>
    ${m.leadId ? `<button class="link" data-act="lead:${m.leadId}">Open lead →</button>` : ''}</div>`;
}

function bigScreen(app: App) {
  const b = app.building;
  const k = app.sim.kpis(b?.id);
  return `<div class="tv"><div class="tv-h"><div><b>${esc(b?.name ?? app.sim.settings.companyName)}</b><small>${app.sim.dayLabel(app.sim.today)}</small></div><div class="tv-clock">${clock(app.sim.now)}</div><button class="box" data-act="overlay:">✕</button></div>
    <div class="kpis tvk">${kpiTiles(app, b)}</div>
    <div class="tv-cols"><section>${pipelineBars(app, b)}</section><section><h4>Live <span>${k.agentsWorking}/${k.agentsTotal} agents working · ${k.needsYou} need you</span></h4>${feedList(app, b, 12)}</section></div></div>`;
}

// ── settings ────────────────────────────────────────────────────
function admin(app: App) {
  const s = app.sim.settings, i = app.integrations, d = app.adminData;
  const humans = app.sim.agents().filter(a => a.kind === 'human');
  const me = `<section><h4>My account</h4>
    <p>${esc(app.me.name)} · <code>${esc(app.me.username)}</code> · ${app.me.role}</p>
    <p class="muted small">${app.me.recoveryLeft} recovery code(s) left.</p>
    <button class="btn-line sm" data-act="new-codes">New recovery codes</button>
    <h4>My desk</h4><p class="muted small">Your desk is "Your office" in the floor picker and shows your on-duty status.</p>
    <div class="chips">${humans.map(a => `<button class="chip ${app.me.agentId === a.id ? 'on' : ''}" data-act="desk:${app.me.agentId === a.id ? '' : a.id}">${esc(a.name)} <small>${esc(app.sim.building(a.buildingId).short)} L${a.floor}</small></button>`).join('')}</div></section>`;
  if (!app.isAdmin) return `<div class="dash-cols">${me}</div>`;
  return `<div class="dash-cols">
    <section><h4>Office settings</h4>
    <form data-form="settings" class="form">
      <label>Company name<input name="companyName" value="${esc(s.companyName)}" required></label>
      <label>Daily report recipients (comma separated)<input name="reportRecipients" value="${esc(s.reportRecipients.join(', '))}" placeholder="owner@example.com, manager@example.com"></label>
      <div class="row"><label>Morning report<input type="time" name="morningReportAt" value="${hhmm(s.morningReportAt)}"></label><label>Daily email report<input type="time" name="dailyReportAt" value="${hhmm(s.dailyReportAt)}"></label></div>
      <label>Delivery<select name="deliveryMode"><option value="simulate" ${s.deliveryMode === 'simulate' ? 'selected' : ''}>Simulate – nothing is sent</option><option value="live" ${s.deliveryMode === 'live' ? 'selected' : ''}>Live – send to real leads & report recipients</option></select></label>
      <label>External CRM contact link (optional)<input name="crmUrlTemplate" value="${esc(s.crmUrlTemplate)}" placeholder="https://app.gohighlevel.com/v2/location/XXXX/contacts/detail/{id}"></label>
      <small class="muted">Placeholders: {id} {email} {phone} {name}. Shows an "Open in CRM" button on each lead.</small>
      <label class="check"><input type="checkbox" name="aiDrafts" ${s.aiDrafts ? 'checked' : ''} ${i.claude.configured ? '' : 'disabled'}> Let Claude write social posts and messages to real leads${i.claude.configured ? '' : ' (set ANTHROPIC_API_KEY on the server first)'}</label>
      <button class="btn-gold" type="submit">Save settings</button>
    </form></section>
    <section><h4>Integrations</h4><ul class="tasks">
      <li><div><b>Email (SMTP)</b><small>${i.email ? `Configured${i.from ? ` · from ${esc(i.from)}` : ''}` : 'Not configured – set SMTP_URL and MAIL_FROM on the server'}</small></div><em class="${i.email ? 'okc' : ''}">${i.email ? '●' : '○'}</em></li>
      <li><div><b>Text messages (Twilio)</b><small>${i.sms ? 'Configured' : 'Not configured – set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM'}</small></div><em class="${i.sms ? 'okc' : ''}">${i.sms ? '●' : '○'}</em></li>
      <li><div><b>Claude drafting</b><small>${i.claude.configured ? `${esc(i.claude.model)} · ${i.claude.usedLastHour}/${i.claude.perHour} drafts this hour` : 'Not configured – set ANTHROPIC_API_KEY'}</small></div><em class="${i.claude.configured ? 'okc' : ''}">${i.claude.configured ? '●' : '○'}</em></li>
    </ul>
    ${i.email ? `<form data-form="test-email" class="row"><input name="to" type="email" placeholder="you@example.com" required><button class="btn-line sm" type="submit">Send test email</button></form>` : ''}
    ${me}</section>
    <section><h4>People</h4>
      <form data-form="user" class="form row wrap"><input name="name" placeholder="Name" required><input name="username" placeholder="username" required pattern="[a-zA-Z0-9._\\-]{3,32}"><select name="role"><option value="member">Member</option><option value="admin">Admin</option></select><button class="btn-gold sm" type="submit">Add person</button></form>
      <table class="tbl"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
      ${(d?.users ?? []).map(u => `<tr><td>${esc(u.name)}</td><td><code>${esc(u.username)}</code></td><td>${u.role}</td><td>${u.enrolled ? (u.onDuty ? 'on duty' : 'off duty') : 'setup pending'}</td>
        <td class="nowrap"><button class="link" data-act="user-reset:${u.id}">Reset</button>${u.id !== app.me.id ? ` · <button class="link red" data-act="user-delete:${u.id}">Remove</button>` : ''}</td></tr>`).join('')}</tbody></table>
      <h4>Sign-in log</h4><table class="tbl small"><thead><tr><th>When</th><th>Who</th><th>Result</th><th>IP</th></tr></thead><tbody>
      ${(d?.signins ?? []).slice(0, 40).map(e => `<tr><td class="nowrap">${new Date(e.t).toLocaleString()}</td><td>${esc(e.username)}</td><td class="${e.result.startsWith('ok') || e.result === 'enrolled' || e.result === 'unlocked' ? '' : 'red'}">${e.result}</td><td>${esc(e.ip)}</td></tr>`).join('')}</tbody></table>
    </section></div>`;
}

// ── lead drawer ─────────────────────────────────────────────────
export function leadDrawer(app: App, l: Lead) {
  const b = app.sim.building(l.buildingId);
  const stages = app.sim.stagesFor(l);
  const tmpl = app.sim.settings.crmUrlTemplate;
  const crmLink = tmpl ? tmpl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(String((l as unknown as Record<string, unknown>)[k] ?? ''))) : '';
  const msgs = [...app.sim.messages.values()].filter(m => m.leadId === l.id).reverse().slice(0, 10);
  return `<div class="drawer-h"><div><b>${esc(l.name)}</b> ${l.real ? '<i class="real">real</i>' : '<i class="sim">simulated</i>'}<small>${esc(b.name)}${l.floor ? ` · L${l.floor}` : ''} · ${esc(l.source)}</small></div><button class="box" data-act="lead:">✕</button></div>
  <div class="drawer-body">
    <div class="row"><label>Stage<select data-change="stage">${stages.map(s => `<option ${s === l.stage ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    ${crmLink ? `<a class="btn-line sm" href="${esc(crmLink)}" target="_blank" rel="noopener">Open in CRM ↗</a>` : ''}</div>
    <form data-form="lead-edit" class="form">
      <div class="row"><label>Name<input name="name" value="${esc(l.name)}" required></label><label>Interest<input name="interest" value="${esc(l.interest)}"></label></div>
      <div class="row"><label>Email<input name="email" type="email" value="${esc(l.email ?? '')}"></label><label>Phone<input name="phone" value="${esc(l.phone ?? '')}"></label></div>
      <button class="btn-line sm" type="submit">Save details</button>
    </form>
    <h4>Reach out</h4>
    <form data-form="lead-send" class="form">
      <div class="row"><select name="channel"><option value="email" ${l.email ? '' : 'disabled'}>Email</option><option value="text" ${l.phone ? '' : 'disabled'}>Text</option><option value="phone" ${l.phone ? '' : 'disabled'}>Log a call</option></select><input name="subject" placeholder="Subject (email)"></div>
      <textarea name="body" rows="4" placeholder="${l.email || l.phone ? 'Write your message or call notes…' : 'Add an email or phone number first'}" required></textarea>
      <button class="btn-gold sm" type="submit" ${l.email || l.phone ? '' : 'disabled'}>${l.real && app.sim.settings.deliveryMode === 'live' ? 'Send' : 'Send (simulated)'}</button>
    </form>
    <h4>Notes</h4>
    <form data-form="lead-note" class="row"><input name="text" placeholder="Add a note…" required><button class="btn-line sm" type="submit">Add</button></form>
    <h4>Timeline</h4>
    <ul class="feed">${l.history.map(h => `<li class="${h.channel === 'stage' ? 'done' : ''}"><time>${clock(h.t)}</time><div>${h.agent ? `<b>${esc(h.agent)}</b> · ` : ''}${esc(h.text)}</div></li>`).join('')}</ul>
    ${msgs.length ? `<h4>Messages</h4><ul class="tasks">${msgs.map(m => `<li><button class="plain" data-act="message:${m.id}"><b>${m.channel} · ${esc(m.subject ?? m.category ?? '')}</b><small>${clock(m.t)} · ${esc(m.agentName)} · ${m.status}</small></button></li>`).join('')}</ul>` : ''}
  </div>`;
}

// ── small forms / modals ────────────────────────────────────────
export function rentForm(app: App, buildingId: string, level: number) {
  const b = app.sim.building(buildingId);
  const f = b.floors.find(x => x.level === level)!;
  return `<div class="sheet-h"><b>Rent ${esc(b.name)} · L${level}</b><button data-act="close">✕</button></div>
    <form data-form="rent" class="form sheet-b"><input type="hidden" name="buildingId" value="${b.id}"><input type="hidden" name="level" value="${level}">
      <p class="muted">$${f.rent}/month. A follow-up AI and a social media AI move in and start working the tenant's leads.</p>
      <label>Business name<input name="name" required maxlength="80"></label>
      <label>Contact person<input name="contact" maxlength="80"></label>
      <div class="row"><label>Email<input name="email" type="email"></label><label>Phone<input name="phone"></label></div>
      <button class="btn-gold" type="submit">Rent floor</button></form>`;
}

export function leadForm(app: App, buildingId: string) {
  const b = app.sim.buildings.find(x => x.id === buildingId) ?? app.sim.building('fast-sales');
  const courses = app.sim.building('fast-sales').floors.filter(f => f.level >= 3 && f.level <= 11);
  return `<div class="sheet-h"><b>Add a real lead</b><button data-act="close">✕</button></div>
    <form data-form="lead" class="form sheet-b">
      <p class="muted small">Real leads are only ever contacted after you approve each message.</p>
      <label>Building<select name="buildingId">${app.sim.buildings.filter(x => x.kind !== 'rental').map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label>Name<input name="name" required maxlength="80"></label>
      <div class="row"><label>Email<input name="email" type="email"></label><label>Phone<input name="phone" placeholder="+1…"></label></div>
      <div class="row"><label>Source<input name="source" placeholder="Website, walk-in, referral…"></label><label>Interest<input name="interest" placeholder="Model or program"></label></div>
      <div class="row"><label>Type<select name="kind"><option value="customer">Customer / student</option><option value="affiliate">Affiliate</option></select></label>
      <label>Course floor (Training Center)<select name="floor"><option value="">—</option>${courses.map(f => `<option value="${f.level}">L${f.level} ${esc(f.name)}</option>`).join('')}</select></label></div>
      <button class="btn-gold" type="submit">Add lead</button></form>`;
}

export function postEditor(app: App, id: string) {
  const c = app.sim.content.get(id);
  if (!c) return '<div class="sheet-b">Gone.</div>';
  const b = app.sim.building(c.buildingId);
  const locked = c.status === 'published';
  return `<div class="sheet-h"><b>${esc(b.short)} · ${app.sim.dayLabel(c.day)}</b><span class="tag" style="--s:${STATUS_COLOR[c.status]}">${c.status}</span><button data-act="close">✕</button></div>
    <form data-form="post" class="form sheet-b"><input type="hidden" name="id" value="${c.id}">
      <div class="row"><label>Platform<select name="platform" ${locked ? 'disabled' : ''}>${['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'YouTube'].map(p => `<option ${p === c.platform ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <label>Time<input type="time" name="time" value="${c.time}" ${locked ? 'disabled' : ''}></label><label>Format<input value="${c.format}" disabled></label></div>
      <label>Topic<input name="topic" value="${esc(c.topic)}" ${locked ? 'disabled' : ''}></label>
      <label>Hook<input name="hook" value="${esc(c.hook ?? '')}" ${locked ? 'disabled' : ''}></label>
      <label>Caption<textarea name="caption" rows="4" ${locked ? 'disabled' : ''}>${esc(c.caption ?? '')}</textarea></label>
      <div class="row"><label>Call to action<input name="cta" value="${esc(c.cta ?? '')}" ${locked ? 'disabled' : ''}></label><label>Hashtags<input name="hashtags" value="${esc((c.hashtags ?? []).join(' '))}" ${locked ? 'disabled' : ''}></label></div>
      ${c.brief ? `<p class="muted small"><b>Creative brief:</b> ${esc(c.brief)}</p>` : ''}
      ${c.metrics ? `<p class="muted small">${c.metrics.reach.toLocaleString()} reach · ${c.metrics.impressions.toLocaleString()} impressions · ${c.metrics.engagement} engagements · ${c.metrics.clicks} clicks · ${c.metrics.leads} leads</p>` : ''}
      ${locked ? '' : '<button class="btn-gold" type="submit">Save post</button>'}</form>`;
}

export function linkModal(title: string, path: string) {
  const url = `${location.origin}${path}`;
  return `<div class="sheet-h"><b>${esc(title)}</b><button data-act="close">✕</button></div>
    <div class="sheet-b"><p>Send this one-time link to the person. It works for 72 hours. They'll choose a password and set up their authenticator app.</p>
    <pre class="wrap">${esc(url)}</pre><button class="cta" data-act="copy" data-copy="${esc(url)}">Copy link</button></div>`;
}

export function codesModal(codes: string[]) {
  return `<div class="sheet-h"><b>New recovery codes</b><button data-act="close">✕</button></div>
    <div class="sheet-b"><p>Each code signs you in once. Your old codes no longer work.</p><div class="codes">${codes.map(c => `<code>${c}</code>`).join('')}</div>
    <button class="cta" data-act="copy" data-copy="${esc(codes.join('\n'))}">Copy</button></div>`;
}

