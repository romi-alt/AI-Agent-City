'use client';
// Loaded only on demand (see HeroCity): this module pulls in the 3D engine, so the page must never import it statically.
// It is the same city the live demo and /city open (the design's Florida city), shown as a hero backdrop: aerial view,
// slow spin, nothing to click and no side panels.
import { useEffect, useRef } from 'react';
import { AGENTS } from './demo-app';

/** The slice of the engine this backdrop drives; the engine itself is untyped design code. */
interface Engine {
  paused: boolean;
  extras: unknown[];
  build(opts: Record<string, unknown>): void;
  setTimeOfDay(t: string): void;
  flyTo(pos: number[], tgt: number[], instant?: boolean): void;
  spin(on: boolean): boolean;
  resize(): void;
  dispose(): void;
}

/** The engine is design code without types, so the three classes this backdrop uses are described here. */
interface EngineModule {
  Office3D: new (el: HTMLElement, opts: object) => Engine;
  DemoWorld: new (office: Engine, opts: object) => unknown;
  Florida: new (office: Engine, opts: object) => { view(id: string): [number[], number[]] };
}

export default function HeroWorldCanvas({ paused, onError }: { paused: boolean; onError: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const pausedNow = useRef(paused);
  pausedNow.current = paused;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let ro: ResizeObserver | undefined;
    let spinTimer = 0;
    (async () => {
      const { Office3D, DemoWorld, Florida } = (await import('./engine')) as unknown as EngineModule;
      if (cancelled) return;
      const mobile = window.innerWidth < 760;
      const office = new Office3D(el, {
        agentsInfo: AGENTS,
        reducedMotion: false,
        timeZone: 'America/New_York',
        onSelect: () => {},
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
        agents: Object.keys(AGENTS),
        human: { name: 'Elvis', role: 'Owner' },
        floorLabel: 'L4',
        showCeo: true,
        available: false,
      });
      office.extras.push(new DemoWorld(office, { mobile }));
      const florida = new Florida(office, { mobile });
      office.extras.push(florida);
      office.setTimeOfDay('day');
      // The demo's aerial view, pulled in to about half the distance: a steeper look down over the river and the
      // dealership core, with no world edge on the horizon. On a tall phone screen it comes in closer and steeper still, so the far edge of the ground stays out of frame.
      const [far, tgt] = florida.view('aerial');
      const k = mobile ? [0.35, 0.75, 0.35] : [0.5, 0.5, 0.5];
      const pos = far.map((v, i) => tgt[i]! + (v - tgt[i]!) * k[i]!);
      office.flyTo(pos, tgt, true);
      office.paused = pausedNow.current;
      office.resize();
      ro = new ResizeObserver(() => office.resize());
      ro.observe(el);
      // Start turning once the live scene has faded in over the still frame, so the two line up at first.
      spinTimer = window.setTimeout(() => office.spin(true), 3000);
    })().catch(() => !cancelled && onError());
    return () => {
      cancelled = true;
      window.clearTimeout(spinTimer);
      ro?.disconnect();
      engine.current?.dispose();
      engine.current = null;
    };
    // onError is stable for the life of the hero; the effect must not restart the scene when the parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (engine.current) engine.current.paused = paused;
  }, [paused]);

  return <div ref={host} className="hero-world" />;
}
