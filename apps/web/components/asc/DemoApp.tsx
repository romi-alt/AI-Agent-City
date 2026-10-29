'use client';
import {
  CITY_LAYOUT,
  CityScene,
  type CityStore,
  createCityStore,
  detectWebGL,
  floorSummary,
  KIND_LABEL,
  keyToCommand,
  navigate,
  sceneBus,
  SceneErrorBoundary,
  type LayoutBuilding,
  type TimeOfDay,
} from '@agentcity/city-scene';
import { type CSSProperties, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BUYERS, VEHICLES } from './data';
import { pick, prefersReducedMotion } from './landing';

// The live demo: the design's full-screen overlay (visit list, info panel, light switch, tour, camera pad) around the
// existing AgentCity city scene. Loaded only when a visitor opens the demo. Everything shown is simulated.

type Tod = 'day' | 'evening' | 'night';
const TODS: Array<[Tod, string, string]> = [
  ['day', '☀', 'Day'],
  ['evening', '◐', 'Evening'],
  ['night', '☾', 'Night'],
];
const TOD_KEY = 'asc-tod';

interface Place {
  id: string;
  name: string;
  sub: string;
  color: string;
  icon: string;
  building: LayoutBuilding | null;
}

function districtLabel(key: string): string {
  return CITY_LAYOUT.districts.find(d => d.key === key)?.name ?? key;
}

// Fast Sales first: it is the building the rest of the page talks about.
const BUILDINGS = [...CITY_LAYOUT.buildings].sort(
  (a, b) => Number(b.key === 'fast-sales') - Number(a.key === 'fast-sales'),
);
const PLACES: Place[] = [
  { id: 'city', name: 'City overview', sub: 'The whole public map', color: '#64748b', icon: '◎', building: null },
  ...BUILDINGS.map(b => ({
    id: b.key,
    name: b.name,
    sub: `${districtLabel(b.district)} · ${KIND_LABEL[b.kind]}`,
    color: b.color,
    icon: b.shortName
      .split(' ')
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
    building: b,
  })),
];

/** Dark text on pale building colours, white on strong ones. */
function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.68 ? '#1c2230' : '#ffffff';
}
const cv = (c: string) => ({ '--c': c, '--ink': inkFor(c) }) as CSSProperties;

interface Info {
  tag: string;
  title: string;
  text: string;
  list: string[];
}

function infoFor(place: Place, level: number | null): Info {
  const b = place.building;
  if (!b) {
    const dealers = CITY_LAYOUT.buildings.filter(x => x.kind === 'dealership').length;
    return {
      tag: 'AgentCity · public map',
      title: 'City overview',
      text: `${CITY_LAYOUT.buildings.length} buildings in ${CITY_LAYOUT.districts.length} districts. Every building is a client and every lit floor is a team of agents at work. Pick one on the left, or fly around with the pad.`,
      list: [
        `${dealers} car dealerships on Dealer Row`,
        'The Fast Sales campus in the middle',
        'Rental Park, with floors to rent',
        'Day, Evening and Night from the top bar',
      ],
    };
  }
  const ai = b.floors.reduce((n, f) => n + f.desks.filter(d => d.kind === 'ai').length, 0);
  const tag = `${districtLabel(b.district)} · ${KIND_LABEL[b.kind]}`;
  if (level !== null) {
    const f = b.floors.find(x => x.level === level);
    if (f) {
      return {
        tag,
        title: `${b.shortName} · Floor ${f.level}`,
        text: f.info ?? `${f.name}. ${floorSummary(f)}.`,
        list: f.desks.length
          ? f.desks.slice(0, 6).map(d => (d.name ? `${d.name} · ${d.role}` : `${d.role} (a person)`))
          : [floorSummary(f)],
      };
    }
  }
  const busy = b.floors.filter(f => f.desks.length).slice(0, 5);
  return {
    tag,
    title: b.name,
    text: `${b.name} has ${b.floors.length} floors${ai ? ` and ${ai} AI agent${ai === 1 ? '' : 's'} at work` : ''}.`,
    list: busy.length
      ? busy.map(f => `Floor ${f.level}: ${f.name} · ${floorSummary(f)}`)
      : [`${b.floors.length} floors`],
  };
}

interface FeedLine {
  who: string;
  text: string;
  where: string;
  color: string;
}
function feedLine(): FeedLine {
  const b = pick(BUILDINGS);
  const r = Math.random();
  const secs = 24 + Math.floor(Math.random() * 34);
  if (b.kind === 'dealership' || r < 0.4) {
    return {
      who: 'Vera',
      text: `answered ${pick(BUYERS)} about a ${pick(VEHICLES)} in ${secs}s`,
      where: b.shortName,
      color: '#ff6b5e',
    };
  }
  if (r < 0.7)
    return {
      who: 'Test drive booked',
      text: `${pick(BUYERS)} · ${pick(VEHICLES)}`,
      where: b.shortName,
      color: '#3ccf8e',
    };
  if (r < 0.88)
    return { who: 'Nico', text: `brought back an aged lead, ${pick(BUYERS)}`, where: b.shortName, color: '#818cf8' };
  return { who: 'Max', text: 'sent the morning pipeline report to the owner', where: b.shortName, color: '#f5b83d' };
}

function useStore<T>(store: CityStore, select: (s: ReturnType<CityStore['get']>) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  );
}

export default function DemoApp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [store] = useState<CityStore>(() => {
    let tod: Tod = 'day';
    try {
      const saved = sessionStorage.getItem(TOD_KEY);
      if (saved === 'day' || saved === 'evening' || saved === 'night') tod = saved;
    } catch {
      /* private mode: nothing remembered */
    }
    return createCityStore({
      quality: 'balanced',
      qualityAuto: true,
      reducedMotion: reduced,
      timeOfDay: tod as TimeOfDay,
      weather: 'partly-cloudy',
      mode: { kind: 'explore' },
      view: 'overview',
      enterable: [],
    });
  });
  const bus = useMemo(() => sceneBus(store), [store]);
  const mode = useStore(store, s => s.mode);
  const tod = useStore(store, s => s.timeOfDay) as Tod;
  const view = useStore(store, s => s.view);

  const [webgl] = useState(() => detectWebGL());
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(() => bus.last('ready') !== undefined);
  const [tour, setTour] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [hint, setHint] = useState(true);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const exitRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);

  const placeId = mode.kind === 'building' || mode.kind === 'floor' || mode.kind === 'office' ? mode.building : 'city';
  const place = PLACES.find(p => p.id === placeId) ?? PLACES[0]!;
  const level = mode.kind === 'floor' || mode.kind === 'office' ? mode.level : null;
  const sub = mode.kind === 'building' ? 'outside' : level !== null ? `floor:${level}` : null;
  const info = infoFor(place, level);

  const go = (id: string, wanted?: string) => {
    const p = PLACES.find(x => x.id === id);
    if (!p) return;
    if (!p.building) {
      if (!navigate(store, CITY_LAYOUT, { type: 'home' })) bus.emit({ type: 'reset' });
      return;
    }
    if (wanted?.startsWith('floor:')) {
      navigate(store, CITY_LAYOUT, { type: 'select-floor', level: Number(wanted.slice(6)), building: p.id });
    } else if (!navigate(store, CITY_LAYOUT, { type: 'select-building', building: p.id })) {
      bus.emit({ type: 'reset' });
    }
  };

  // The scene says when it has drawn its first frames.
  useEffect(() => bus.on(e => e.type === 'ready' && setReady(true)), [bus]);

  // Closed: stop drawing. Open: take focus, tell the hero to rest.
  useEffect(() => {
    store.set({ paused: !open });
    if (open) exitRef.current?.focus();
  }, [open, store]);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setHint(false), 9000);
    return () => window.clearTimeout(t);
  }, [open]);

  // Simulated feed.
  useEffect(() => {
    if (!open) return;
    setFeed(f => (f.length ? f : Array.from({ length: 4 }, feedLine)));
    const t = window.setInterval(() => setFeed(f => [feedLine(), ...f].slice(0, 6)), reduced ? 6000 : 2600);
    return () => window.clearInterval(t);
  }, [open, reduced]);

  // Light: Day is the light theme, Evening and Night the dark one.
  const setTod = (t: Tod) => {
    store.set({ timeOfDay: t as TimeOfDay });
    try {
      sessionStorage.setItem(TOD_KEY, t);
    } catch {
      /* private mode: nothing remembered */
    }
  };

  // Guided tour: the city, then each building in turn; any manual move stops it.
  useEffect(() => {
    if (!tour || !open) return;
    const stops = ['city', ...BUILDINGS.map(b => b.key)];
    let i = 0;
    const next = () => go(stops[i++ % stops.length]!);
    next();
    const t = window.setInterval(next, 8000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go() only reads the store
  }, [tour, open]);
  const manual = () => setTour(false);

  const pad = (a: string) => {
    manual();
    if (a === 'zin') bus.emit({ type: 'zoom', dir: 1 });
    else if (a === 'zout') bus.emit({ type: 'zoom', dir: -1 });
    else if (a === 'left') bus.emit({ type: 'rotate', dir: -1 });
    else if (a === 'right') bus.emit({ type: 'rotate', dir: 1 });
    else if (a === 'up') store.set({ view: 'top' });
    else if (a === 'down') store.set({ view: 'overview' });
    else if (a === 'spin') store.set({ view: store.get().view === 'orbit' ? 'overview' : 'orbit' });
    else if (a === 'home') bus.emit({ type: 'reset' });
    else if (a === 'city') go('city');
  };

  // Keyboard: the city's own keys, plus C for the overview. Escape steps back, then leaves.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      if (e.key === 'Escape') {
        if (!navigate(store, CITY_LAYOUT, { type: 'back' })) onClose();
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setTour(false);
        go('city');
        return;
      }
      const cmd = keyToCommand(e);
      if (!cmd) return;
      e.preventDefault();
      setTour(false);
      if (cmd.type === 'home') go('city');
      else if (cmd.type === 'back') navigate(store, CITY_LAYOUT, { type: 'back' });
      else if (cmd.type === 'tilt') store.set({ view: cmd.dir < 0 ? 'top' : 'overview' });
      else bus.emit(cmd);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go() only reads the store
  }, [open, store, bus, onClose]);

  // Keep the active place in view in the (horizontal, on phones) list.
  useEffect(() => {
    railRef.current?.querySelector('.place.on')?.scrollIntoView({ inline: 'start', block: 'nearest' });
  }, [placeId]);

  const where = place.building ? `${place.building.shortName}${level !== null ? ` · Floor ${level}` : ''}` : place.name;
  const subs: Array<[string, string]> = place.building
    ? [
        ['outside', 'Outside'],
        ...(place.building.floors.length > 1
          ? ([
              [`floor:${place.building.floors[0]!.level}`, `Floor ${place.building.floors[0]!.level}`],
              [`floor:${place.building.floors[place.building.floors.length - 1]!.level}`, 'Top floor'],
            ] as Array<[string, string]>)
          : []),
      ]
    : [];

  return (
    <div
      id="demoApp"
      className={open ? undefined : 'hidden'}
      data-theme={tod === 'day' ? 'light' : 'dark'}
      role="dialog"
      aria-modal="true"
      aria-label="AutoSalesCity live demo"
    >
      <div id="dScene" className="d-scene" onPointerDown={manual}>
        {webgl && !failed ? (
          <SceneErrorBoundary onShowMap={() => setFailed(true)}>
            <CityScene
              store={store}
              label="AgentCity: a 3D city of office towers and dealerships where AI agents work. Use the list of buildings and the camera pad to explore."
            />
          </SceneErrorBoundary>
        ) : null}
      </div>
      {(!ready || !webgl || failed) && (
        <div className="d-loading" id="dLoading">
          <span />
          {!webgl || failed
            ? 'The 3D demo needs a browser with WebGL. Try another browser or device.'
            : 'Building the demo city…'}
        </div>
      )}
      <header className="d-top">
        <div className="d-brand">
          <span className="d-mark">AS</span>
          <span>
            AutoSales<b>City</b>
          </span>
          <span className="d-live">LIVE DEMO</span>
        </div>
        <div className="d-where" id="dWhere">
          {where}
        </div>
        <div className="d-right">
          <div className="seg" id="dTod" role="group" aria-label="Light">
            {TODS.map(([k, icon, label]) => (
              <button
                key={k}
                type="button"
                className={tod === k ? 'on' : undefined}
                aria-pressed={tod === k}
                title={label}
                onClick={() => setTod(k)}
              >
                {icon} <span>{label}</span>
              </button>
            ))}
          </div>
          <button
            className={`d-btn${tour ? ' on' : ''}`}
            id="dTour"
            type="button"
            aria-pressed={tour}
            onClick={() => setTour(t => !t)}
          >
            {tour ? '❚❚ Tour' : '▶ Tour'}
          </button>
          <button
            className="d-btn"
            id="dExit"
            type="button"
            title="Back to the page (Esc)"
            ref={exitRef}
            onClick={onClose}
          >
            ✕ Exit
          </button>
        </div>
      </header>

      <nav className="d-visit" id="dVisit" aria-label="Visit a building" ref={railRef}>
        <h4>Visit the city</h4>
        {PLACES.map(p => {
          const on = p.id === placeId;
          return (
            <div key={p.id} style={{ display: 'contents' }}>
              <button
                type="button"
                className={`place${on ? ' on' : ''}`}
                aria-current={on ? 'true' : undefined}
                style={cv(p.color)}
                onClick={() => {
                  manual();
                  go(p.id);
                }}
              >
                <i style={{ color: 'var(--ink)' }}>{p.icon}</i>
                <span>
                  <b>{p.name}</b>
                  <small>{p.sub}</small>
                </span>
              </button>
              {on && subs.length > 0 && (
                <div className="subs" style={cv(p.color)}>
                  {subs.map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      className={sub === k ? 'on' : undefined}
                      onClick={() => {
                        manual();
                        go(p.id, k);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <aside className={`d-info${infoOpen ? ' open' : ''}`} id="dInfo" aria-live="polite" style={cv(place.color)}>
        <button
          className="d-info-toggle"
          id="dInfoToggle"
          type="button"
          aria-label="Show or hide details"
          aria-expanded={infoOpen}
          onClick={() => setInfoOpen(o => !o)}
        >
          i
        </button>
        <div className="d-info-body">
          <div className="d-tag" id="dTag">
            {info.tag}
          </div>
          <h2 id="dTitle">{info.title}</h2>
          <p id="dText">{info.text}</p>
          <h3>{place.building ? 'What is here' : 'Sales automations at work'}</h3>
          <ul id="dList">
            {info.list.map(x => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <h3>
            City feed <span className="dot-live" />
          </h3>
          <ul className="feed" id="dFeed">
            {feed.map((l, i) => (
              <li key={`${i}-${l.who}-${l.text}`} style={{ '--c': l.color } as CSSProperties}>
                <i />
                <span>
                  <b>{l.who}</b> {l.text} <em>· {l.where}</em>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="d-hint" id="dHint" style={{ opacity: hint ? 1 : 0 }}>
        Drag to look around · scroll to zoom · click a building to look inside
      </div>
      <div className="navpad" role="toolbar" aria-label="Move the camera">
        <button type="button" title="Zoom in (+)" onClick={() => pad('zin')}>
          +
        </button>
        <button
          type="button"
          title="Top-down view"
          aria-pressed={view === 'top'}
          className={view === 'top' ? 'on' : undefined}
          onClick={() => pad('up')}
        >
          ▲
        </button>
        <button type="button" title="Zoom out (−)" onClick={() => pad('zout')}>
          −
        </button>
        <button type="button" title="Rotate left (Q)" onClick={() => pad('left')}>
          ⟲
        </button>
        <button type="button" title="Back to this place's view (R)" onClick={() => pad('home')}>
          ⌂
        </button>
        <button type="button" title="Rotate right (E)" onClick={() => pad('right')}>
          ⟳
        </button>
        <button
          type="button"
          title="Slow orbit on/off"
          aria-pressed={view === 'orbit'}
          className={view === 'orbit' ? 'on' : undefined}
          onClick={() => pad('spin')}
        >
          ◎
        </button>
        <button type="button" title="Aerial view" aria-pressed={view === 'overview'} onClick={() => pad('down')}>
          ▼
        </button>
        <button type="button" title="City overview (C)" onClick={() => pad('city')}>
          🏙
        </button>
      </div>
    </div>
  );
}
