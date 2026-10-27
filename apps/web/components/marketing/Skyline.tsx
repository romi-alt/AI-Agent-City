// A dusk skyline drawn in SVG: the hero's first paint and its permanent fallback (no WebGL, reduced motion). It is
// generated on the server from a fixed seed, so it is identical on every render and costs no client JavaScript.
// Silhouettes follow the city's visual direction (PLAN.md): setbacks, crowns, spires, a slanted top, water tanks and
// a rooftop garden; no two towers alike.

const GROUND = 600;

type Crown = 'flat' | 'spire' | 'stepped' | 'arch' | 'slant' | 'tank' | 'garden' | 'needle';
interface Tower {
  x: number;
  w: number;
  h: number;
  crown: Crown;
  /** Number of setbacks: each tier above the base is narrower. */
  tiers?: number;
  /** Window pattern (a, b, c) or glass mullions (g). */
  skin?: 'a' | 'b' | 'c' | 'g';
  beacon?: boolean;
}

/** Deterministic pseudo-random numbers (mulberry32), so the drawing never changes between renders. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rectangles of a tower: the base and its setback tiers, bottom to top. */
function tiers(t: Tower): { x: number; y: number; w: number; h: number }[] {
  const n = (t.tiers ?? 0) + 1;
  const shares = n === 1 ? [1] : n === 2 ? [0.72, 0.28] : n === 3 ? [0.6, 0.25, 0.15] : [0.5, 0.22, 0.16, 0.12];
  const out: { x: number; y: number; w: number; h: number }[] = [];
  let y = GROUND;
  shares.forEach((s, i) => {
    const h = Math.round(t.h * s);
    const w = Math.round(t.w * (1 - i * 0.18));
    const x = Math.round(t.x + (t.w - w) / 2);
    y -= h;
    out.push({ x, y, w, h });
  });
  return out;
}

function Crown({ t, top }: { t: Tower; top: { x: number; y: number; w: number } }) {
  const cx = top.x + top.w / 2;
  switch (t.crown) {
    case 'spire':
      return (
        <>
          <path d={`M${top.x + top.w * 0.2} ${top.y} L${cx} ${top.y - 46} L${top.x + top.w * 0.8} ${top.y} Z`} />
          <rect x={cx - 1} y={top.y - 86} width={2} height={42} />
        </>
      );
    case 'stepped':
      return (
        <>
          <rect x={top.x + top.w * 0.15} y={top.y - 14} width={top.w * 0.7} height={14} />
          <rect x={top.x + top.w * 0.28} y={top.y - 26} width={top.w * 0.44} height={12} />
          <rect x={top.x + top.w * 0.4} y={top.y - 36} width={top.w * 0.2} height={10} />
          <rect x={cx - 1} y={top.y - 70} width={2} height={34} />
        </>
      );
    case 'arch': {
      // Art-deco crown: nested arches narrowing to a needle.
      const arcs = [0.5, 0.38, 0.26, 0.15];
      return (
        <>
          {arcs.map((r, i) => {
            const rw = top.w * r;
            const base = top.y - i * 12;
            return <path key={i} d={`M${cx - rw} ${base} A${rw} ${rw * 1.1} 0 0 1 ${cx + rw} ${base} Z`} />;
          })}
          <rect x={cx - 1} y={top.y - 92} width={2} height={60} />
        </>
      );
    }
    case 'slant':
      return (
        <path
          d={`M${top.x} ${top.y} L${top.x} ${top.y - 40} L${top.x + top.w} ${top.y - 4} L${top.x + top.w} ${top.y} Z`}
        />
      );
    case 'tank': {
      const tx = top.x + top.w * 0.62;
      return (
        <>
          <rect x={tx} y={top.y - 8} width={1.5} height={8} />
          <rect x={tx + 12} y={top.y - 8} width={1.5} height={8} />
          <rect x={tx - 1} y={top.y - 22} width={16} height={14} rx={1} />
          <path d={`M${tx - 2} ${top.y - 22} L${tx + 7} ${top.y - 30} L${tx + 16} ${top.y - 22} Z`} />
        </>
      );
    }
    case 'garden':
      return (
        <g className="sky-garden">
          <rect x={top.x + 4} y={top.y - 4} width={top.w - 8} height={4} />
          {[0.18, 0.34, 0.52, 0.7, 0.84].map((p, i) => (
            <circle key={i} cx={top.x + top.w * p} cy={top.y - 6 - (i % 2) * 2} r={5 + (i % 3)} />
          ))}
        </g>
      );
    case 'needle':
      return <rect x={cx - 1} y={top.y - 40} width={2} height={40} />;
    default:
      return <rect x={top.x - 2} y={top.y - 4} width={top.w + 4} height={4} />;
  }
}

function crownTop(t: Tower, top: { x: number; y: number; w: number }): number {
  const extra = { spire: 86, stepped: 70, arch: 92, slant: 40, tank: 30, garden: 12, needle: 40, flat: 4 }[t.crown];
  return top.y - extra;
}

function Layer({ towers, className }: { towers: Tower[]; className: string }) {
  return (
    <g className={className}>
      {towers.map((t, i) => {
        const rects = tiers(t);
        const top = rects[rects.length - 1]!;
        return (
          <g key={i}>
            {rects.map((r, j) => (
              <rect key={j} x={r.x} y={r.y} width={r.w} height={r.h} />
            ))}
            <Crown t={t} top={top} />
            {t.skin &&
              rects.map((r, j) => (
                <rect
                  key={`s${j}`}
                  x={r.x + 4}
                  y={r.y + 8}
                  width={Math.max(0, r.w - 8)}
                  height={Math.max(0, r.h - 8)}
                  fill={`url(#sky-win-${t.skin})`}
                  className="sky-skin"
                />
              ))}
            {t.beacon && <circle className="sky-beacon" cx={top.x + top.w / 2} cy={crownTop(t, top)} r={2.4} />}
          </g>
        );
      })}
    </g>
  );
}

/** Window patterns: a fixed grid, a deterministic share of windows lit warm gold. */
function WindowPattern({ id, seed, lit }: { id: string; seed: number; lit: number }) {
  const r = rng(seed);
  const cells: { x: number; y: number; on: number }[] = [];
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const v = r();
      cells.push({ x: col * 12 + 3, y: row * 15 + 3, on: v < lit ? (v < lit * 0.45 ? 2 : 1) : 0 });
    }
  return (
    <pattern id={`sky-win-${id}`} width={96} height={120} patternUnits="userSpaceOnUse">
      {cells.map((c, i) => (
        <rect
          key={i}
          x={c.x}
          y={c.y}
          width={6}
          height={8}
          className={c.on === 2 ? 'sky-lit' : c.on === 1 ? 'sky-warm' : 'sky-dark'}
        />
      ))}
    </pattern>
  );
}

const FAR: Tower[] = [
  { x: 0, w: 70, h: 190, crown: 'flat' },
  { x: 80, w: 50, h: 240, crown: 'needle' },
  { x: 150, w: 90, h: 170, crown: 'flat' },
  { x: 260, w: 60, h: 260, crown: 'stepped', tiers: 1 },
  { x: 340, w: 80, h: 200, crown: 'flat' },
  { x: 450, w: 56, h: 300, crown: 'spire', tiers: 2 },
  { x: 540, w: 100, h: 210, crown: 'flat' },
  { x: 660, w: 60, h: 280, crown: 'needle', tiers: 1 },
  { x: 760, w: 90, h: 230, crown: 'flat' },
  { x: 880, w: 64, h: 330, crown: 'stepped', tiers: 2 },
  { x: 980, w: 80, h: 250, crown: 'flat' },
  { x: 1080, w: 60, h: 310, crown: 'spire', tiers: 1 },
  { x: 1170, w: 110, h: 220, crown: 'flat' },
  { x: 1300, w: 70, h: 290, crown: 'needle', tiers: 1 },
  { x: 1400, w: 90, h: 240, crown: 'flat' },
  { x: 1510, w: 90, h: 270, crown: 'stepped', tiers: 1 },
];

const MID: Tower[] = [
  { x: -10, w: 80, h: 150, crown: 'tank', skin: 'c' },
  { x: 90, w: 64, h: 210, crown: 'flat', skin: 'b', tiers: 1 },
  { x: 190, w: 92, h: 130, crown: 'tank', skin: 'c' },
  { x: 330, w: 70, h: 240, crown: 'needle', skin: 'a', tiers: 1 },
  { x: 430, w: 96, h: 170, crown: 'garden', skin: 'b' },
  { x: 610, w: 74, h: 280, crown: 'stepped', skin: 'a', tiers: 2 },
  { x: 720, w: 86, h: 190, crown: 'tank', skin: 'c' },
  { x: 900, w: 70, h: 250, crown: 'flat', skin: 'b', tiers: 1 },
  { x: 1010, w: 100, h: 200, crown: 'garden', skin: 'a' },
  { x: 1240, w: 80, h: 300, crown: 'stepped', skin: 'b', tiers: 2 },
  { x: 1350, w: 90, h: 180, crown: 'tank', skin: 'c' },
  { x: 1480, w: 80, h: 230, crown: 'flat', skin: 'a', tiers: 1 },
];

// The foreground: low on the left (the headline sits over open sky), the landmark towers to the right.
const NEAR: Tower[] = [
  { x: 0, w: 110, h: 70, crown: 'tank', skin: 'c' },
  { x: 120, w: 90, h: 96, crown: 'flat', skin: 'b' },
  { x: 230, w: 120, h: 60, crown: 'garden', skin: 'c' },
  { x: 380, w: 84, h: 120, crown: 'tank', skin: 'b' },
  { x: 520, w: 96, h: 150, crown: 'flat', skin: 'a', tiers: 1 },
  { x: 640, w: 70, h: 210, crown: 'slant', skin: 'g' },
  { x: 735, w: 92, h: 330, crown: 'arch', skin: 'a', tiers: 3, beacon: true },
  { x: 850, w: 110, h: 160, crown: 'garden', skin: 'b' },
  { x: 985, w: 86, h: 390, crown: 'spire', skin: 'a', tiers: 3, beacon: true },
  { x: 1095, w: 74, h: 250, crown: 'slant', skin: 'g' },
  { x: 1190, w: 120, h: 180, crown: 'tank', skin: 'c', tiers: 1 },
  { x: 1330, w: 84, h: 300, crown: 'stepped', skin: 'b', tiers: 2 },
  { x: 1440, w: 100, h: 140, crown: 'garden', skin: 'a' },
  { x: 1545, w: 70, h: 220, crown: 'needle', skin: 'g', tiers: 1 },
];

export function Skyline({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1600 600"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <WindowPattern id="a" seed={11} lit={0.3} />
        <WindowPattern id="b" seed={23} lit={0.2} />
        <WindowPattern id="c" seed={37} lit={0.12} />
        <pattern id="sky-win-g" width={10} height={600} patternUnits="userSpaceOnUse">
          <rect x={0} y={0} width={1} height={600} className="sky-mullion" />
        </pattern>
        <linearGradient id="sky-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f5b335" stopOpacity="0" />
          <stop offset="1" stopColor="#ff7a5c" stopOpacity="0.22" />
        </linearGradient>
      </defs>
      <rect x={0} y={300} width={1600} height={300} fill="url(#sky-haze)" />
      <Layer towers={FAR} className="sky-far" />
      <Layer towers={MID} className="sky-mid" />
      <Layer towers={NEAR} className="sky-near" />
      <rect x={0} y={592} width={1600} height={8} className="sky-street" />
    </svg>
  );
}
