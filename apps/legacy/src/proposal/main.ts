import './proposal.css';
import { buildCity } from '../core/data/buildings';
import type { Building, BuildingKind } from '../core/types';
import { P, type Lang, type T } from './content';

/**
 * The public, bilingual proposal page at /proposal. Containment (M00): it shows no live office data. The
 * running office holds people's names, real contacts and client activity, none of which belongs on a public
 * page, so the dashboard here is an empty sample layout and the dial shows the fixed building catalog.
 */

const LANG_KEY = 'fs-proposal-lang';
const root = document.getElementById('proposal')!;
const city = buildCity();
const cityAgents = city.reduce((n, b) => n + b.floors.reduce((m, f) => m + f.agents.filter(a => a.kind === 'ai').length, 0), 0);
const GAUGE_MAX = Math.ceil(cityAgents / 60) * 60;

let lang: Lang = (() => {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    const saved = q ?? localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch { /* storage blocked */ }
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
})();

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Translate and escape. */
const tr = (x: T, vars: Record<string, string | number> = {}) =>
  esc(x[lang].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)));
const officeUrl = `${location.origin}/`;
const officeShown = officeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

const head = (s: { eyebrow: T; title: T[]; lead?: T }, dark = false) => `
  <p class="eyebrow">${tr(s.eyebrow)}</p>
  <h2 class="display${dark ? ' on-dark' : ''}">${s.title.map(l => `<span>${tr(l)}</span>`).join('')}</h2>
  ${s.lead ? `<p class="lead">${tr(s.lead)}</p>` : ''}`;

// ── gauge: live "agents working right now" ───────────────────
const G = { cx: 160, cy: 160, r: 128, from: -135, to: 135 };
const polar = (deg: number, r: number) => {
  const a = (deg - 90) * Math.PI / 180;
  return [G.cx + r * Math.cos(a), G.cy + r * Math.sin(a)] as const;
};
function gaugeSvg(max: number) {
  const ticks: string[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const deg = G.from + (G.to - G.from) * i / steps;
    const major = i % 4 === 0;
    const [x1, y1] = polar(deg, G.r - (major ? 22 : 12));
    const [x2, y2] = polar(deg, G.r - 2);
    ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${major ? 'major' : ''}"/>`);
    if (major) {
      const [tx, ty] = polar(deg, G.r - 42);
      ticks.push(`<text x="${tx.toFixed(1)}" y="${(ty + 5).toFixed(1)}">${Math.round(max * i / steps)}</text>`);
    }
  }
  const [ax, ay] = polar(G.to - 50, G.r - 8);
  const [bx, by] = polar(G.to, G.r - 8);
  return `<svg viewBox="0 0 320 320" class="gauge-svg" aria-hidden="true">
    <circle cx="160" cy="160" r="152" class="rim"/><circle cx="160" cy="160" r="140" class="face"/>
    <path d="M${ax.toFixed(1)} ${ay.toFixed(1)} A ${G.r - 8} ${G.r - 8} 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)}" class="redline"/>
    ${ticks.join('')}
    <g class="needle" style="transform: rotate(${G.from}deg)"><line x1="160" y1="172" x2="160" y2="46"/></g>
    <circle cx="160" cy="160" r="11" class="hub"/><circle cx="160" cy="160" r="4" class="hub-dot"/>
  </svg>`;
}
function setGauge(working: number, total: number) {
  const needle = root.querySelector<SVGGElement>('.needle');
  const num = root.querySelector<HTMLElement>('.gauge-num');
  if (!needle || !num) return;
  const deg = G.from + (G.to - G.from) * Math.min(1, working / Math.max(1, total));
  needle.style.transform = `rotate(${deg}deg)`;
  num.textContent = String(working);
}

// ── sections ─────────────────────────────────────────────────
function cityGroups() {
  const kinds: BuildingKind[] = ['training', 'dealership', 'associates', 'rental'];
  return kinds.map(k => {
    const bs = city.filter(b => b.kind === k);
    const agents = (b: Building) => b.floors.reduce((n, f) => n + f.agents.filter(a => a.kind === 'ai').length, 0);
    const forRent = (b: Building) => b.floors.filter(f => f.rent).length;
    return `<article class="grp reveal">
      <div class="grp-h"><span class="grp-n">${bs.length}</span><div><h3>${tr(P.city.groups[k])}</h3><p>${tr(P.city.groupInfo[k])}</p></div></div>
      <ul class="blds">${bs.map(b => `<li style="--c:${b.accent === '#ffffff' ? b.color : b.accent}">
        <b>${esc(b.kind === 'dealership' ? b.short : b.name.replace('Rick Case Honda · ', ''))}</b>
        <small>${b.floors.length} ${tr(P.city.floors)} · ${k === 'rental' ? `${forRent(b)} ${tr(P.city.forRent)} · $199` : `${agents(b)} ${tr(P.city.agents)}`}</small>
      </li>`).join('')}</ul>
    </article>`;
  }).join('');
}

/** An empty sample of the signed-in dashboard: labels only, no numbers from the running office. */
function dashboard() {
  const d = P.access.dash;
  return `<div class="dash-h"><span class="live-dot off"></span><b>FAST SALES</b><span>${tr(d.title)}</span><time>--:--</time></div>
    <div class="dash-k">
      <div><small>${tr(d.leads)}</small><b>–</b></div>
      <div><small>${tr(d.booked)}</small><b>–</b></div>
      <div><small>${tr(d.enrolled)}</small><b>–</b></div>
      <div><small>${tr(d.working)}</small><b>–</b></div>
    </div>
    <div class="dash-b">
      <section><h4>${tr(d.pipeline)}</h4>
        ${Object.keys(d.stages).map(stage => `<div class="bar"><span>${tr(d.stages[stage]!)}</span><i><em style="width:0%"></em></i><b>–</b></div>`).join('')}
      </section>
      <section><h4>${tr(d.doing)}</h4><p class="dash-off">${tr(d.offline)}</p></section>
    </div>
    <p class="dash-note">${tr(d.note)}</p>`;
}

function render() {
  document.documentElement.lang = lang;
  const h = P.hero;
  root.innerHTML = `
  <header class="top wrap">
    <div class="from"><b>${esc(P.from.company)}</b> · ${esc(P.from.site)}</div>
    <div class="meta"><span>${tr(P.ui.proposal)} · ${tr(P.date)} · ${tr(P.ui.valid, { n: P.validDays })}</span>
      <div class="lang" role="group" aria-label="Language"><button data-lang="en" class="${lang === 'en' ? 'on' : ''}">EN</button><button data-lang="es" class="${lang === 'es' ? 'on' : ''}">ES</button></div>
    </div>
  </header>

  <section class="hero wrap">
    <div class="hero-l">
      <p class="eyebrow">${tr(h.eyebrow)}</p>
      <h1 class="display xl"><span>${tr(h.title[0]!)}</span><span class="red">${tr(h.title[1]!)}</span></h1>
      <p class="lead">${tr(h.lead)}</p>
      <div class="ctas"><a class="btn red" href="${officeUrl}">${tr(h.cta)}</a><a class="btn line" href="#investment">${tr(h.cta2)}</a></div>
      <dl class="stats">${h.stats.map(s => `<div><dt>${tr(s.v, { agents: cityAgents })}</dt><dd>${tr(s.l)}</dd></div>`).join('')}</dl>
    </div>
    <div class="gauge">${gaugeSvg(GAUGE_MAX)}<div class="gauge-c"><b class="gauge-num">0</b><small>${tr(h.gauge)}</small></div></div>
  </section>

  <section class="sec wrap" id="found">
    ${head(P.found)}
    <div class="cards3">${P.found.cards.map(c => `<article class="card reveal"><p class="tag ${c.tone}">${tr(c.tag)}</p><h3>${tr(c.h)}</h3><p>${tr(c.p)}</p></article>`).join('')}</div>
  </section>

  <section class="sec wrap" id="team">
    ${head(P.team)}
    <div class="team">
      <article class="ceo reveal"><p class="tag red">${tr(P.team.ceo.tag)}</p><h3 class="display">${P.team.ceo.name}</h3><p>${tr(P.team.ceo.p)}</p><span class="x" aria-hidden="true">✕</span></article>
      <div class="agents">${P.team.agents.map(a => `<article class="agent reveal"><h3><span class="dot"></span>${a.name}</h3><p class="tag red">${tr(a.role)}</p><p>${tr(a.p)}</p></article>`).join('')}</div>
    </div>
  </section>

  <section class="sec wrap" id="city">
    ${head(P.city)}
    <div class="groups">${cityGroups()}</div>
  </section>

  <section class="sec wrap" id="access">
    ${head(P.access)}
    <div class="access">
      <div class="creds reveal">
        <label>${tr(P.access.address)}</label><div class="cred"><code>${esc(officeShown)}</code><button data-copy="${esc(officeUrl)}">${tr(P.access.copy)}</button></div>
        <label>${tr(P.access.user)}</label><div class="cred"><code>${esc(P.client.username)}</code><button data-copy="${esc(P.client.username)}">${tr(P.access.copy)}</button></div>
        <label>${tr(P.access.password)}</label><div class="cred muted"><code>••••••••••</code><small>${tr(P.access.passwordNote)}</small></div>
        <a class="btn red block" href="${officeUrl}">${tr(P.access.open)}</a>
        <ul>${P.access.tips.map(x => `<li>${tr(x)}</li>`).join('')}</ul>
      </div>
      <div class="dash reveal" id="dash">${dashboard()}</div>
    </div>
  </section>

  <section class="sec wrap" id="content">
    ${head(P.content)}
    <div class="week">${P.content.days.map(d => `<article class="day reveal"><h3 class="display">${tr(d.d)}</h3><p class="tag red">${tr(d.ch)}</p><p class="d-h">${tr(d.h)}</p><small>${tr(P.content.pillars[d.pillar]!.n)}</small></article>`).join('')}</div>
    <div class="pillars">${P.content.pillars.map(p => `<span>${tr(p.n)} <b>${p.pct}%</b></span>`).join('')}</div>
    <ol class="funnel">${P.content.steps.map((s, i) => `<li class="reveal"><p class="tag red">${tr(P.content.stepWord)} ${i + 1}</p><p>${tr(s)}</p></li>`).join('')}</ol>
  </section>

  <section class="sec wrap" id="investment">
    ${head(P.price)}
    <div class="four reveal">
      ${P.price.squares.map(s => `<article class="sq">
        <p class="tag">${tr(s.tag)}</p>
        <p class="price"><b class="display">${esc(s.v)}</b><span>${tr(s.unit)}</span></p>
        ${s.items ? `<ul>${s.items.map(x => `<li>${tr(x)}</li>`).join('')}</ul>` : ''}
        ${s.note ? `<p class="sq-note">${tr(s.note)}</p>` : ''}
      </article>`).join('')}
      <span class="seal" aria-hidden="true">FAST<br>SALES</span>
    </div>
    <p class="fine">${tr(P.price.fine)}</p>
  </section>

  <section class="sec wrap split" id="complex">
    <div>${head(P.complex)}</div>
    <div>
      <ul class="tower reveal">${P.complex.rows.map(r => `<li class="${r.you ? 'you' : ''}"><b>${r.l}</b><span>${tr(r.n)}</span><em>${tr(r.p)}</em></li>`).join('')}</ul>
      <p class="fine">${tr(P.complex.rent)}</p>
    </div>
  </section>

  <section class="sec wrap" id="plan">
    ${head(P.plan)}
    <ol class="plan">${P.plan.steps.map(s => `<li class="reveal"><p class="tag red">${tr(s.w)}</p><h3 class="display">${tr(s.h)}</h3><p>${tr(s.p)}</p></li>`).join('')}</ol>
  </section>

  <section class="close">
    <div class="wrap">
      ${head(P.close, true)}
      <a class="btn red" href="${officeUrl}">${tr(P.close.cta)}</a>
      <div class="sigs">${P.signatures.map(s => `<div><b class="display">${esc(s.name)}</b><span>${esc(s.org)}</span>${s.contact ? `<a href="mailto:${esc(s.contact)}">${esc(s.contact)}</a>` : ''}</div>`).join('')}</div>
    </div>
  </section>
  <footer class="wrap foot">${tr(P.footer)}</footer>`;

  wire();
  setGauge(cityAgents, GAUGE_MAX);
}

function wire() {
  root.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach(b => b.addEventListener('click', () => {
    lang = b.dataset.lang as Lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage blocked */ }
    const y = scrollY;
    render();
    scrollTo(0, y);
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy!); } catch { return; }
    b.textContent = P.access.copied[lang];
    setTimeout(() => { b.textContent = P.access.copy[lang]; }, 1500);
  }));
  // Fade sections in as they scroll into view.
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io!.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' }) : undefined;
  root.querySelectorAll('.reveal').forEach((el, i) => {
    (el as HTMLElement).style.transitionDelay = `${(i % 7) * 50}ms`;
    if (io) io.observe(el); else el.classList.add('in');
  });
}

render();
// Let the needle sweep up once the page has painted.
requestAnimationFrame(() => setGauge(cityAgents, GAUGE_MAX));
