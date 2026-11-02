'use client';

// The signed-in office page's 3D view: the same New York city and Fast Sales floor the public demo shows, with the
// visitor's own AI team sitting at its desks. It replaces the older explorer scene; the page's panels, tour and
// workflow player are unchanged and drive this view through the same store. Without WebGL (or if the engine fails
// to start) it falls back to the older view, so the page always has something to show. Browser only.
import { detectWebGL, type CityStore } from '@agentcity/city-scene';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LiteAgent, LiteMe } from '../../lib/api-client';
import { AGENTS } from '../asc/demo-app';
import { LiteCityView } from './LiteCityView';
import './asc-office.css';

/** The engine's own desks, filled in order by the visitor's agents (the first sits at the big CEO desk). */
const SLOTS = ['max', 'vera', 'nico', 'luna', 'teo', 'iris', 'dante'] as const;

interface Engine {
  paused: boolean;
  extras: unknown[];
  build(opts: Record<string, unknown>): void;
  setTimeOfDay(t: string): void;
  flyTo(pos: number[], tgt: number[], instant?: boolean): void;
  view(name: string, instant?: boolean): void;
  select(key: string | null, fromScene?: boolean): void;
  drawCRM(data: object): void;
  drawDash(data: object): void;
  drawContent(posts: object[], week?: string): void;
  say(key: string, text: string, ms?: number): void;
  setStatus(key: string, status: 'working' | 'needs' | null): void;
  spin(on: boolean): boolean;
  resize(): void;
  dispose(): void;
}
interface EngineModule {
  Office3D: new (el: HTMLElement, opts: object) => Engine;
  DemoWorld: new (office: Engine, opts: object) => unknown;
  Florida: new (office: Engine, opts: object) => { view(id: string): [number[], number[]] };
}

export function AscCityView(props: {
  me: LiteMe;
  agents: LiteAgent[];
  store: CityStore;
  onSelect: (id: string) => void;
}) {
  const [failed, setFailed] = useState(() => !detectWebGL());
  if (failed) return <LiteCityView {...props} />;
  return <Scene {...props} onFail={() => setFailed(true)} />;
}

function Scene({
  me,
  agents,
  store,
  onSelect,
  onFail,
}: {
  me: LiteMe;
  agents: LiteAgent[];
  store: CityStore;
  onSelect: (id: string) => void;
  onFail: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const flyHome = useRef<() => void>(() => undefined);
  // Which engine desk belongs to which of the visitor's agents (and back).
  const slots = useMemo(() => agents.slice(0, SLOTS.length).map((a, i) => ({ key: SLOTS[i]!, agent: a })), [agents]);
  const latest = useRef({ slots, onSelect, store });
  latest.current = { slots, onSelect, store };
  const slotKeys = slots.map(s => s.key).join();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let off = () => undefined as void;
    (async () => {
      const { Office3D, DemoWorld, Florida } = (await import('../asc/engine')) as unknown as EngineModule;
      if (cancelled) return;
      const mobile = window.innerWidth < 760;
      const info: Record<string, unknown> = {};
      latest.current.slots.forEach(({ key, agent }) => {
        info[key] = {
          name: agent.name,
          short: agent.role,
          role: agent.role,
          color: AGENTS[key].color,
          desc: agent.summary ?? '',
        };
      });
      const office = new Office3D(el, {
        agentsInfo: info,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        timeZone: 'America/New_York',
        onSelect: (key: string) => {
          const hit = latest.current.slots.find(s => s.key === key);
          if (hit) latest.current.onSelect(hit.agent.id);
        },
        cityOpts: {
          demo: {
            skipFront: [
              [56, 90],
              [-90, -56],
            ],
          },
        },
        maxDistance: 900,
      });
      engine.current = office;
      office.build({
        agents: latest.current.slots.map(s => s.key),
        human: { name: me.firstName, role: 'Owner' },
        floorLabel: `L${me.office.level}`,
        showCeo: latest.current.slots.some(s => s.key === 'max'),
        available: false,
      });
      // The wall screens would otherwise sit on "pending" and "connecting": they show a labelled sample week instead.
      office.drawCRM({
        title: 'CRM · SAMPLE SALES PIPELINE',
        won: ['sold'],
        pipeline: [
          ['new', 'New lead', 23],
          ['contacted', 'Contacted', 41],
          ['appointment', 'Appointment set', 17],
          ['drive', 'Test drive done', 11],
          ['quote', 'Quote sent', 8],
          ['sold', 'Sold', 6],
        ].map(([key, label, count]) => ({ key, label, count })),
      });
      office.drawDash({
        leadsToday: 18,
        booked24h: 7,
        enrolledMonth: 6,
        replySeconds: 38,
        labels: ['TEST DRIVES BOOKED · 24H', 'SOLD THIS MONTH'],
      });
      office.drawContent(
        [
          {
            day: 'Mon',
            format: 'Reel',
            title: 'Three phrases that lose a car deal, and what to say instead',
            status: 'approved',
          },
          { day: 'Tue', format: 'Carousel', title: 'Meet the team: a day on the sales floor', status: 'approved' },
          { day: 'Wed', format: 'Short video', title: 'How to handle "I need to think about it"', status: 'pending' },
          { day: 'Thu', format: 'Post', title: 'Customer story: first car, delivered', status: 'approved' },
          { day: 'Fri', format: 'Reel', title: 'Why a fast first reply wins the test drive', status: 'pending' },
          { day: 'Sat', format: 'Live', title: 'Weekend open house Q&A', status: 'changes' },
          { day: 'Sun', format: 'Post', title: 'Weekend test-drive offer', status: 'pending' },
        ],
        'sample week',
      );
      office.extras.push(new DemoWorld(office, { mobile }));
      const florida = new Florida(office, { mobile });
      office.extras.push(florida);
      office.setTimeOfDay('day');
      const [aerialPos, aerialTgt] = florida.view('aerial');
      const city = () => office.flyTo(aerialPos, aerialTgt);
      flyHome.current = city;
      office.flyTo(aerialPos, aerialTgt, true);
      office.resize();
      applyStatus.current();
      const ro = new ResizeObserver(() => office.resize());
      ro.observe(el);

      // The page's panels drive the camera through the store: city, our building, the whole floor, one desk.
      const apply = () => {
        const s = latest.current.store.get();
        const m = s.mode;
        const sel = latest.current.slots.find(x => x.agent.id === s.selectedAgent);
        if (m.kind === 'office' && sel) {
          office.spin(false);
          office.select(sel.key);
        } else if (m.kind === 'office' || m.kind === 'floor') {
          office.spin(false);
          office.select(null);
          office.view('overview');
        } else if (m.kind === 'building') {
          office.spin(false);
          office.flyTo([6, 30, 48], [0, 0.4, -3]);
        } else {
          office.select(null);
          city();
        }
      };
      let lastKey = '';
      const keyOf = () => {
        const s = latest.current.store.get();
        return `${s.mode.kind}|${s.mode.kind === 'office' ? s.mode.desk : ''}|${s.selectedAgent ?? ''}`;
      };
      // The page may already be on the floor or at a desk when the scene finishes loading.
      lastKey = keyOf();
      if (latest.current.store.get().mode.kind !== 'explore') apply();
      const unsub = latest.current.store.subscribe(() => {
        const key = keyOf();
        if (key === lastKey) return;
        lastKey = key;
        apply();
      });
      off = () => {
        unsub();
        ro.disconnect();
      };
    })().catch(() => !cancelled && onFail());
    return () => {
      cancelled = true;
      off();
      engine.current?.dispose();
      engine.current = null;
    };
    // The scene is built once per set of desks; panel state flows in through the store and refs, not by rebuilding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotKeys, me.office.level]);

  // The server's view of each agent drives the floor: working agents type with the green ring on, agents that need the
  // visitor raise a hand under a red tag, and a new task shows once as a speech bubble over the desk.
  const lastTask = useRef<Record<string, string>>({});
  const applyStatus = useRef<() => void>(() => undefined);
  applyStatus.current = () => {
    const office = engine.current;
    if (!office) return;
    slots.forEach(({ key, agent }) => {
      office.setStatus(key, agent.status === 'needs-you' ? 'needs' : agent.status === 'working' ? 'working' : null);
      const task = agent.status === 'working' && agent.currentTask ? agent.currentTask.slice(0, 60) : '';
      if (task && lastTask.current[key] !== task) office.say(key, task, 6000);
      lastTask.current[key] = task;
    });
  };
  useEffect(() => applyStatus.current(), [slots]);

  return (
    <div
      ref={host}
      className="asc-office"
      role="img"
      aria-label={`AutoSalesCity, with ${me.company}'s office and AI team. Use the panel to enter it and meet your team.`}
    />
  );
}
