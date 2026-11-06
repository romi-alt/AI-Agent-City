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
  camera: { matrixWorldInverse: { elements: number[] }; projectionMatrix: { elements: number[] } };
  resize(): void;
  dispose(): void;
}

/** The engine is design code without types, so the three classes this backdrop uses are described here. */
interface EngineModule {
  Office3D: new (el: HTMLElement, opts: object) => Engine;
  DemoWorld: new (office: Engine, opts: object) => unknown;
  Florida: new (office: Engine, opts: object) => { view(id: string): [number[], number[]] };
}

/** Where the floor tag points: a little below the top of the HQ tower, in city units. */
const HQ_TAG_HEIGHT = 30;

export default function HeroWorldCanvas({ paused, onError }: { paused: boolean; onError: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const tag = useRef<HTMLDivElement>(null);
  const pausedNow = useRef(paused);
  pausedNow.current = paused;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let ro: ResizeObserver | undefined;
    let spinTimer = 0;
    let stopTimer = 0;
    let raf = 0;
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
      office.setTimeOfDay('evening'); // dusk: warm sky and lit windows, the hero's lighting
      // Dusk skyline: the demo's skyline view pulled back and raised so the towers stand against the warm sky, like a
      // photograph of the city at the end of the day. On a tall phone screen the old close aerial still works better.
      const [far, tgt] = florida.view(mobile ? 'aerial' : 'skyline');
      const k = mobile ? [0.35, 0.75, 0.35] : [1.5, 1.5, 1.5];
      const pos = far.map((v, i) => tgt[i]! + (v - tgt[i]!) * k[i]!);
      if (!mobile) pos[1] = 120;
      office.flyTo(pos, tgt, true);
      office.paused = pausedNow.current;
      office.resize();
      ro = new ResizeObserver(() => office.resize());
      ro.observe(el);
      // Start turning once the live scene has faded in over the still frame, so the two line up at first. It turns for
      // a short while and then holds, so the camera never swings round to the back of the skyline.
      spinTimer = window.setTimeout(() => {
        office.spin(true);
        stopTimer = window.setTimeout(() => office.spin(false), 6000);
      }, 3000);
      // The floor tag follows the HQ tower as the camera turns: a small card on a leader line, hidden whenever the tower
      // is behind the camera, outside the frame or under the headline.
      const place = () => {
        raf = requestAnimationFrame(place);
        const t = tag.current;
        if (!t || pausedNow.current) return;
        const v = office.camera.matrixWorldInverse.elements;
        const pr = office.camera.projectionMatrix.elements;
        // the tag's world point (the HQ tower) through the camera's view and projection matrices (column-major)
        const vx = v[12]! + v[4]! * HQ_TAG_HEIGHT;
        const vy = v[13]! + v[5]! * HQ_TAG_HEIGHT;
        const vz = v[14]! + v[6]! * HQ_TAG_HEIGHT;
        const cw = pr[11]! * vz;
        const nx = (pr[0]! * vx) / cw;
        const ny = (pr[5]! * vy) / cw;
        const w = el.clientWidth;
        const h = el.clientHeight;
        const x = (nx * 0.5 + 0.5) * w;
        const y = (-ny * 0.5 + 0.5) * h;
        const ok = vz < 0 && x > w * 0.42 && x < w - 190 && y > 90 && y < h - 150;
        t.style.opacity = ok ? '1' : '0';
        if (ok) t.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      };
      raf = requestAnimationFrame(place);
    })().catch(() => !cancelled && onError());
    return () => {
      cancelled = true;
      window.clearTimeout(spinTimer);
      window.clearTimeout(stopTimer);
      cancelAnimationFrame(raf);
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

  return (
    <>
      <div ref={host} className="hero-world" />
      <div ref={tag} className="hero-floor-tag" aria-hidden="true">
        <span className="hero-floor-tag-dot" />
        <span className="hero-floor-tag-card">
          <small>Floor 24</small>
          <b>Fast Sales</b>
          <em>Simulated sample floor</em>
        </span>
      </div>
    </>
  );
}
