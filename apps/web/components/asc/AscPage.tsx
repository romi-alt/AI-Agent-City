import type { CSSProperties } from 'react';
import { AscClient } from './AscClient';
import { BookDemo } from './BookDemo';
import {
  CLIENTS,
  DEMO_STOPS,
  DISTRICTS,
  FEATURES,
  LANDING_AGENTS,
  MARQUEE,
  NAV_LINKS,
  NUMBERS,
  PLANS,
  STEPS,
} from './data';
import { HeroCity } from './HeroCity';
import { DemoOverlay } from './DemoOverlay';
import { Skyline } from './Skyline';

const cv = (c: string) => ({ '--c': c }) as CSSProperties;
const HEADLINE = ['Every', 'dealership', 'gets', 'an'];

// The bars in the control-room mock: fixed numbers (not random) so the server and the browser agree.
function barValues() {
  let s = 20260;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return CLIENTS.map(c => ({ ...c, width: 30 + Math.round(rnd() * 65), value: Math.round(60 + rnd() * 240) }));
}

/** The AutoSalesCity front page: markup is rendered on the server, AscClient wires the behaviour. */
export function AscPage({ contactEmail, bookForm }: { contactEmail: string; bookForm: boolean }) {
  // With the demo backend switched on, every "book a demo" button opens the request form; without it they keep their
  // plain links (scroll to the call to action, or write to the contact address).
  const book = bookForm ? { 'data-open-book': true } : {};
  const bars = barValues();
  const mailto = `mailto:${contactEmail}?subject=AutoSalesCity%20demo`;
  return (
    <div className="asc">
      <header className="nav" id="nav">
        <div className="wrap">
          <a className="logo" href="#top" aria-label="AutoSalesCity home">
            <span className="logo-mark">
              <span>AS</span>
            </span>
            AutoSales<b>City</b>
          </a>
          <nav className="nav-links" aria-label="Main">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="nav-right">
            <a className="nav-demo" href="#live-demo" data-open-demo>
              Live demo
            </a>
            <a className="btn primary" href="#demo" style={{ padding: '10px 18px', fontSize: 14 }} {...book}>
              Book a demo
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO: live 3D city */}
        <section className="hero" id="hero" aria-label="AutoSalesCity live city">
          <HeroCity />
          <div className="scrim" aria-hidden="true" />

          <div className="hero-copy">
            <div className="wrap">
              <span className="badge">
                <span className="live">LIVE</span> 6 dealerships · 42 AI agents on the clock
              </span>
              <h1 id="headline">
                {HEADLINE.map((w, i) => (
                  <span key={w}>
                    <span className="word" style={{ animationDelay: `${(0.15 + i * 0.09).toFixed(2)}s` }}>
                      {w}
                    </span>{' '}
                  </span>
                ))}
                <span className="word grad" style={{ animationDelay: `${(0.15 + 4 * 0.09).toFixed(2)}s` }}>
                  AI&nbsp;sales&nbsp;floor.
                </span>
              </h1>
              <p className="lead">
                AutoSalesCity is a living city of AI-staffed showrooms. Each client is a building, each agent a desk,
                and every lead is answered in under a minute, straight from your CRM.
              </p>
              <div className="hero-cta">
                <a className="btn primary" href="#demo" {...book}>
                  Get your building <span aria-hidden="true">→</span>
                </a>
                <a className="btn" href="#live-demo" data-open-demo>
                  ▶ Walk the live demo city
                </a>
              </div>
            </div>
          </div>

          <div className="hud">
            <div className="wrap">
              <div>
                <div className="stats">
                  <div className="stat">
                    <div className="n mono" id="sLeads">
                      0
                    </div>
                    <div className="l">Leads answered today</div>
                  </div>
                  <div className="stat">
                    <div className="n mono" id="sReply">
                      0s
                    </div>
                    <div className="l">Avg first reply</div>
                  </div>
                  <div className="stat">
                    <div className="n mono" id="sBooked">
                      0
                    </div>
                    <div className="l">Test drives booked</div>
                  </div>
                </div>
                <div className="demo-note">Simulated demo city · numbers are illustrative</div>
              </div>
              <div className="ticker" aria-live="polite">
                <div className="t-head">
                  <span>City feed</span>
                  <span id="clock">--:--</span>
                </div>
                <ul id="feed" />
              </div>
            </div>
          </div>
          <div className="scroll-hint">Scroll to enter ↓</div>
        </section>

        <div className="marquee" aria-hidden="true">
          <div className="marquee-track" id="marquee">
            {[...MARQUEE, ...MARQUEE].map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>

        {/* LIVE DEMO */}
        <section className="block demo-sec" id="live-demo" style={{ paddingBottom: 40 }}>
          <div className="wrap">
            <div className="eyebrow reveal">Live demo city</div>
            <h2 className="reveal d1">
              Walk into a showroom.
              <br />
              Read the sales board yourself.
            </h2>
            <div className="demo-grid">
              <div className="reveal d2">
                <p className="lead">
                  Fly over the city, step inside four dealerships and the Fast Sales Training Center HQ, and watch AI
                  agents answer leads, book test drives and move the pipeline in real time. Click any sales board or
                  salesperson&apos;s screen to open it full size.
                </p>
                <div className="demo-creds">
                  <span>Public demo login</span>
                  <b>
                    Username: <code>demo</code>
                  </b>
                  <b>
                    Password: <code>autosales</code>
                  </b>
                </div>
                <ul className="demo-stops">
                  {DEMO_STOPS.map(s => (
                    <li key={s.label} style={cv(s.color)}>
                      <i>{s.mark}</i>
                      {s.label}
                    </li>
                  ))}
                </ul>
                <a className="btn primary" href="#live-demo" data-open-demo>
                  Open the live demo <span aria-hidden="true">→</span>
                </a>
              </div>
              <a
                className="demo-preview reveal d3"
                href="#live-demo"
                data-open-demo
                aria-label="Open the live demo city"
              >
                <div className="chips">
                  <span style={cv('#2f7cf6')}>Aurora Motors</span>
                  <span style={cv('#f5b83d')}>Fast Sales HQ</span>
                  <span style={cv('#18b67a')}>Volta EV</span>
                </div>
                <Skyline id="demoSky" width={800} height={400} color="#f5b83d" seed={4242} />
                <span className="play">▶ Enter the demo city</span>
              </a>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="block" id="how">
          <div className="wrap">
            <div className="eyebrow reveal">How it works</div>
            <h2 className="reveal d1">
              From new lead to booked test drive
              <br />
              before your coffee cools.
            </h2>
            <p className="lead reveal d2">
              Agents read the lead, the vehicle and the conversation history before they write a word. Your people step
              in when a human touch closes the deal.
            </p>
            <div className="flow">
              <div className="pulse" aria-hidden="true" />
              {STEPS.map(s => (
                <article key={s.num} className={`step reveal ${s.delay}`.trim()} style={cv(s.color)}>
                  <div className="num">{s.num}</div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                  <span className="chip">{s.chip}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* DISTRICTS */}
        <section className="block" id="districts" style={{ paddingTop: 40 }}>
          <div className="wrap">
            <div className="eyebrow reveal">The city map</div>
            <h2 className="reveal d1">
              One city. A district for every
              <br />
              corner of the car business.
            </h2>
            <p className="lead reveal d2">
              Agencies run many clients from one skyline. Zoom from the whole city down to a single desk where an agent
              is texting a buyer right now.
            </p>
            <div className="districts">
              {DISTRICTS.map((d, i) => (
                <article
                  key={d.n}
                  className={`district${d.wide ? ' wide' : ''} reveal ${d.delay}`.trim()}
                  style={cv(d.color)}
                >
                  <span className="tag">District {d.n}</span>
                  <h3>{d.title}</h3>
                  <p>{d.text}</p>
                  <Skyline className="sky" width={d.wide ? 600 : 300} height={120} color={d.hex} seed={101 + i * 37} />
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* AGENTS */}
        <section className="block" id="agents" style={{ paddingTop: 40 }}>
          <div className="wrap">
            <div className="eyebrow reveal">Your AI team</div>
            <h2 className="reveal d1">
              Seven specialists per building.
              <br />
              Zero sick days.
            </h2>
            <p className="lead reveal d2">
              Hire the agents you need. Each one knows your inventory, your offers and your voice, and anything risky
              waits for a human yes.
            </p>
            <div className="agents" id="agentGrid">
              {LANDING_AGENTS.map((a, i) => (
                <article
                  key={a.name}
                  className={`agent reveal ${['', 'd1', 'd2', 'd3'][i % 4]}`.trim()}
                  style={cv(a.color)}
                >
                  <div className="typing" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="av">{a.name[0]}</div>
                  <h3>{a.name}</h3>
                  <div className="role">{a.role}</div>
                  <p>{a.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* CONTROL ROOM */}
        <section className="block" id="control" style={{ paddingTop: 40 }}>
          <div className="wrap control">
            <div>
              <div className="eyebrow reveal">Agency control room</div>
              <h2 className="reveal d1">Run 50 showrooms from one screen.</h2>
              <p className="lead reveal d2">
                White-label it under your brand. Every client building, every agent and every message is one click away,
                with spend caps and approvals built in.
              </p>
              <ul className="feature-list">
                {FEATURES.map(f => (
                  <li key={f.n} className={`reveal ${f.delay}`}>
                    <span className="ic">{f.n}</span>
                    <div>
                      <b>{f.title}</b>
                      {f.text}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="screen reveal d2" id="screen">
              <div className="scr-top">
                <div className="dots">
                  <i />
                  <i />
                  <i />
                </div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  agency.autosalescity.app · demo
                </span>
              </div>
              <div className="kpis">
                <div className="kpi">
                  <div className="n" data-count="1284">
                    0
                  </div>
                  <div className="l">Leads this week</div>
                </div>
                <div className="kpi">
                  <div className="n" data-count="312">
                    0
                  </div>
                  <div className="l">Appointments</div>
                </div>
                <div className="kpi">
                  <div className="n" data-count="38" data-suffix="s">
                    0
                  </div>
                  <div className="l">Median reply</div>
                </div>
              </div>
              <div className="bars" id="bars">
                {bars.map(b => (
                  <div key={b.key} className="bar" style={cv(b.color)}>
                    <span>{b.name.replace(' Training Center', '')}</span>
                    <div className="track">
                      <div className="fill" data-w={b.width} />
                    </div>
                    <span className="v">{b.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* NUMBERS */}
        <section className="block" style={{ paddingTop: 20 }}>
          <div className="wrap">
            <div className="eyebrow reveal">Built on a live pilot</div>
            <h2 className="reveal d1">Already running for a real training center.</h2>
            <div className="numbers reveal d2">
              {NUMBERS.map(n => (
                <div key={n.label}>
                  <div
                    className="n"
                    data-count={n.count}
                    data-prefix={n.prefix || undefined}
                    data-suffix={n.suffix || undefined}
                  >
                    0
                  </div>
                  <div className="l">{n.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section className="block" id="pricing" style={{ paddingTop: 40 }}>
          <div className="wrap">
            <div className="eyebrow reveal">Pricing</div>
            <h2 className="reveal d1">
              Rent a floor. Own a building.
              <br />
              Run the district.
            </h2>
            <div className="plans">
              {PLANS.map(p => (
                <article key={p.name} className={`plan${p.hot ? ' hot' : ''} reveal ${p.delay}`.trim()}>
                  <h3>{p.name}</h3>
                  <div className="who">{p.who}</div>
                  <div className="price">
                    {p.price}
                    <small>{p.per}</small>
                  </div>
                  <ul>
                    {p.items.map(it => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                  <a className={`btn${p.hot ? ' primary' : ''}`} href="#demo" {...book}>
                    {p.cta}
                  </a>
                </article>
              ))}
            </div>
            <p className="demo-note" style={{ marginTop: 18 }}>
              Proposed launch pricing. AI usage above the monthly allowance is billed by use.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="block" id="demo" style={{ paddingTop: 40 }}>
          <div className="wrap">
            <div className="cta reveal">
              <div className="eyebrow">Open for the first 10 buildings</div>
              <h2>Put your dealership on the skyline.</h2>
              <p className="lead">
                A 20-minute walkthrough of the live city, then your building goes up in under a day.
              </p>
              <a className="btn primary" href={mailto} {...book}>
                Book a demo <span aria-hidden="true">→</span>
              </a>
              <Skyline className="cta-sky" id="ctaSky" width={1200} height={140} color="#f5b83d" seed={777} />
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>© 2026 AutoSalesCity. A product concept built on the Fast Sales virtual office pilot.</span>
          <span className="mono">Made with Three.js</span>
        </div>
      </footer>

      <DemoOverlay />
      {bookForm && <BookDemo contactEmail={contactEmail} />}
      <AscClient />
    </div>
  );
}
