// A golden-hour Manhattan skyline drawn in SVG: the hero's first paint (its LCP backdrop) and its permanent fallback
// when there is no WebGL or the visitor prefers reduced motion. Generated on the server from fixed data, so it costs
// no client JavaScript. Silhouettes follow the city's visual direction (PLAN.md): setbacks, crowns, spires, a
// slanted top, water tanks and rooftop gardens; sunlit glass with teal and sky reflections, warm stone and brick.
// Clouds, an airliner and birds drift slowly; the CSS stops them under prefers-reduced-motion.

const W = 1600;
const GROUND = 900;

type Crown = 'flat' | 'spire' | 'stepped' | 'arch' | 'slant' | 'tank' | 'garden' | 'needle';
type Skin = 'teal' | 'sky' | 'stone' | 'brick' | 'slate' | 'cream';
interface Tower {
  x: number;
  w: number;
  h: number;
  crown: Crown;
  skin: Skin;
  /** Number of setbacks: each tier above the base is narrower. */
  tiers?: number;
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
          <path d={`M${top.x + top.w * 0.2} ${top.y} L${cx} ${top.y - 60} L${top.x + top.w * 0.8} ${top.y} Z`} />
          <rect x={cx - 1.2} y={top.y - 112} width={2.4} height={54} className="sky-mast" />
        </>
      );
    case 'stepped':
      return (
        <>
          <rect x={top.x + top.w * 0.15} y={top.y - 16} width={top.w * 0.7} height={16} />
          <rect x={top.x + top.w * 0.28} y={top.y - 30} width={top.w * 0.44} height={14} />
          <rect x={top.x + top.w * 0.4} y={top.y - 42} width={top.w * 0.2} height={12} />
          <rect x={cx - 1.2} y={top.y - 84} width={2.4} height={42} className="sky-mast" />
        </>
      );
    case 'arch': {
      // Art-deco crown: nested arches narrowing to a needle, lit gold by the low sun.
      const arcs = [0.5, 0.38, 0.26, 0.15];
      return (
        <g className="sky-crown">
          {arcs.map((r, i) => {
            const rw = top.w * r;
            const base = top.y - i * 14;
            return <path key={i} d={`M${cx - rw} ${base} A${rw} ${rw * 1.1} 0 0 1 ${cx + rw} ${base} Z`} />;
          })}
          <rect x={cx - 1.2} y={top.y - 112} width={2.4} height={74} className="sky-mast" />
        </g>
      );
    }
    case 'slant':
      return (
        <path
          d={`M${top.x} ${top.y} L${top.x} ${top.y - 52} L${top.x + top.w} ${top.y - 6} L${top.x + top.w} ${top.y} Z`}
        />
      );
    case 'tank': {
      const tx = top.x + top.w * 0.6;
      return (
        <g className="sky-tank">
          <rect x={tx} y={top.y - 9} width={2} height={9} />
          <rect x={tx + 14} y={top.y - 9} width={2} height={9} />
          <rect x={tx - 1} y={top.y - 25} width={18} height={16} rx={1} />
          <path d={`M${tx - 3} ${top.y - 25} L${tx + 8} ${top.y - 34} L${tx + 19} ${top.y - 25} Z`} />
        </g>
      );
    }
    case 'garden':
      return (
        <g className="sky-garden">
          <rect x={top.x + 4} y={top.y - 5} width={top.w - 8} height={5} />
          {[0.16, 0.32, 0.5, 0.68, 0.84].map((p, i) => (
            <circle key={i} cx={top.x + top.w * p} cy={top.y - 7 - (i % 2) * 3} r={6 + (i % 3)} />
          ))}
        </g>
      );
    case 'needle':
      return <rect x={cx - 1.2} y={top.y - 52} width={2.4} height={52} className="sky-mast" />;
    default:
      return <rect x={top.x - 3} y={top.y - 5} width={top.w + 6} height={5} />;
  }
}

/** Far and middle layers: flat, hazy silhouettes for depth. */
function Silhouettes({ towers, className }: { towers: Tower[]; className: string }) {
  return (
    <g className={className}>
      {towers.map((t, i) => {
        const rects = tiers(t);
        return (
          <g key={i}>
            {rects.map((r, j) => (
              <rect key={j} x={r.x} y={r.y} width={r.w} height={r.h} />
            ))}
            <Crown t={t} top={rects[rects.length - 1]!} />
          </g>
        );
      })}
    </g>
  );
}

/** Foreground towers: material, facade pattern, a sunlit right face and a shaded left edge. */
function Towers({ towers }: { towers: Tower[] }) {
  return (
    <g className="sky-near">
      {towers.map((t, i) => {
        const rects = tiers(t);
        const glass = t.skin === 'teal' || t.skin === 'sky' || t.skin === 'slate';
        return (
          <g key={i} className={`sky-t sky-${t.skin}`}>
            {rects.map((r, j) => (
              <g key={j}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#sky-g-${t.skin})`} />
                <rect
                  x={r.x + 3}
                  y={r.y + 6}
                  width={Math.max(0, r.w - 6)}
                  height={Math.max(0, r.h - 6)}
                  fill={`url(#sky-p-${glass ? 'glass' : 'punched'})`}
                />
                <rect x={r.x + r.w * 0.62} y={r.y} width={r.w * 0.38} height={r.h} className="sky-sunface" />
                <rect x={r.x} y={r.y} width={Math.max(2, r.w * 0.08)} height={r.h} className="sky-shade" />
              </g>
            ))}
            <g className={`sky-roof sky-roof-${t.skin}`}>
              <Crown t={t} top={rects[rects.length - 1]!} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

function Cloud({ x, y, s, className }: { x: number; y: number; s: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={`sky-cloud ${className ?? ''}`}>
        <ellipse cx={0} cy={0} rx={70} ry={20} />
        <ellipse cx={-34} cy={-10} rx={34} ry={22} />
        <ellipse cx={14} cy={-22} rx={40} ry={30} />
        <ellipse cx={52} cy={-6} rx={30} ry={18} />
        <ellipse cx={0} cy={10} rx={86} ry={9} className="sky-cloud-base" />
      </g>
    </g>
  );
}

const FAR: Tower[] = [
  { x: 0, w: 80, h: 250, crown: 'flat', skin: 'stone' },
  { x: 90, w: 56, h: 320, crown: 'needle', skin: 'stone' },
  { x: 170, w: 100, h: 230, crown: 'flat', skin: 'stone' },
  { x: 290, w: 64, h: 350, crown: 'stepped', skin: 'stone', tiers: 1 },
  { x: 380, w: 90, h: 270, crown: 'flat', skin: 'stone' },
  { x: 500, w: 60, h: 400, crown: 'spire', skin: 'stone', tiers: 2 },
  { x: 590, w: 110, h: 280, crown: 'flat', skin: 'stone' },
  { x: 720, w: 64, h: 380, crown: 'needle', skin: 'stone', tiers: 1 },
  { x: 820, w: 96, h: 300, crown: 'flat', skin: 'stone' },
  { x: 940, w: 70, h: 440, crown: 'stepped', skin: 'stone', tiers: 2 },
  { x: 1040, w: 90, h: 330, crown: 'flat', skin: 'stone' },
  { x: 1150, w: 64, h: 410, crown: 'spire', skin: 'stone', tiers: 1 },
  { x: 1240, w: 120, h: 290, crown: 'flat', skin: 'stone' },
  { x: 1380, w: 76, h: 390, crown: 'needle', skin: 'stone', tiers: 1 },
  { x: 1480, w: 120, h: 320, crown: 'stepped', skin: 'stone', tiers: 1 },
];

const MID: Tower[] = [
  { x: -10, w: 90, h: 190, crown: 'tank', skin: 'stone' },
  { x: 100, w: 70, h: 270, crown: 'flat', skin: 'stone', tiers: 1 },
  { x: 200, w: 100, h: 170, crown: 'tank', skin: 'stone' },
  { x: 350, w: 76, h: 310, crown: 'needle', skin: 'stone', tiers: 1 },
  { x: 460, w: 104, h: 220, crown: 'garden', skin: 'stone' },
  { x: 640, w: 80, h: 360, crown: 'stepped', skin: 'stone', tiers: 2 },
  { x: 760, w: 92, h: 250, crown: 'tank', skin: 'stone' },
  { x: 950, w: 76, h: 330, crown: 'flat', skin: 'stone', tiers: 1 },
  { x: 1060, w: 108, h: 260, crown: 'garden', skin: 'stone' },
  { x: 1270, w: 86, h: 390, crown: 'stepped', skin: 'stone', tiers: 2 },
  { x: 1380, w: 96, h: 230, crown: 'tank', skin: 'stone' },
  { x: 1500, w: 90, h: 300, crown: 'flat', skin: 'stone', tiers: 1 },
];

// The foreground: low on the left (the headline sits over open sky), the landmark towers to the right.
const NEAR: Tower[] = [
  { x: 0, w: 120, h: 90, crown: 'tank', skin: 'brick' },
  { x: 130, w: 96, h: 120, crown: 'flat', skin: 'cream' },
  { x: 240, w: 130, h: 80, crown: 'garden', skin: 'brick' },
  { x: 390, w: 90, h: 140, crown: 'tank', skin: 'cream' },
  { x: 500, w: 104, h: 105, crown: 'garden', skin: 'brick' },
  { x: 620, w: 120, h: 150, crown: 'flat', skin: 'cream', tiers: 1 },
  { x: 760, w: 78, h: 200, crown: 'slant', skin: 'sky' },
  { x: 852, w: 100, h: 430, crown: 'arch', skin: 'stone', tiers: 3 },
  { x: 966, w: 118, h: 210, crown: 'garden', skin: 'brick' },
  { x: 1098, w: 92, h: 520, crown: 'spire', skin: 'teal', tiers: 3 },
  { x: 1204, w: 84, h: 330, crown: 'slant', skin: 'sky' },
  { x: 1300, w: 92, h: 400, crown: 'stepped', skin: 'slate', tiers: 2 },
  { x: 1404, w: 100, h: 220, crown: 'tank', skin: 'cream' },
  { x: 1516, w: 84, h: 300, crown: 'needle', skin: 'teal', tiers: 1 },
];

/** Keeps the left of the picture low, so the headline always sits over open sky. */
function lowLeft(towers: Tower[]): Tower[] {
  return towers.map(t =>
    t.x < 780
      ? { ...t, h: Math.round(t.h * 0.5), crown: t.crown === 'tank' || t.crown === 'garden' ? t.crown : 'flat' }
      : t,
  );
}

const GRADIENTS: Record<Skin, [string, string, string]> = {
  teal: ['#9ad9dc', '#2a9a9a', '#17616a'],
  sky: ['#e6f4fc', '#8cc6ec', '#4a86b8'],
  slate: ['#a6c2d8', '#4f7193', '#2c4866'],
  stone: ['#f8eed9', '#e6d3b1', '#c4a983'],
  cream: ['#fdf6e8', '#f0dfc0', '#d3b991'],
  brick: ['#f3ad8d', '#d77f5e', '#a9573f'],
};

export function Skyline({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${GROUND}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {Object.entries(GRADIENTS).map(([k, [a, b, c]]) => (
          <linearGradient key={k} id={`sky-g-${k}`} x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset="0.45" stopColor={b} />
            <stop offset="1" stopColor={c} />
          </linearGradient>
        ))}
        {/* Curtain wall: mullions and floor lines. */}
        <pattern id="sky-p-glass" width={12} height={14} patternUnits="userSpaceOnUse">
          <rect x={0} y={0} width={1} height={14} fill="#ffffff" fillOpacity={0.35} />
          <rect x={0} y={13} width={12} height={1} fill="#0f1b2d" fillOpacity={0.12} />
        </pattern>
        {/* Punched windows in stone and brick: dark panes, some catching the sun. */}
        <pattern id="sky-p-punched" width={48} height={60} patternUnits="userSpaceOnUse">
          {[0, 1, 2, 3].map(r =>
            [0, 1, 2, 3].map(c => (
              <rect
                key={`${r}${c}`}
                x={c * 12 + 3}
                y={r * 15 + 3}
                width={6}
                height={9}
                fill={(r * 4 + c) % 7 === 2 ? '#ffd27a' : '#2b4560'}
                fillOpacity={(r * 4 + c) % 7 === 2 ? 0.95 : 0.5}
              />
            )),
          )}
        </pattern>
        <linearGradient id="sky-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4d6" stopOpacity="0" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0.5" />
        </linearGradient>
      </defs>

      <g className="sky-clouds">
        <Cloud x={1000} y={150} s={1.2} className="sky-cloud-a" />
        <Cloud x={1400} y={250} s={0.8} className="sky-cloud-b" />
        <Cloud x={1260} y={400} s={0.7} className="sky-cloud-c" />
        <Cloud x={720} y={110} s={0.6} className="sky-cloud-b" />
      </g>

      {/* A distant airliner with its contrail, and a few birds. */}
      <g className="sky-plane">
        <g transform="translate(0 200)">
          <rect x={-180} y={-0.6} width={176} height={1.2} className="sky-contrail" />
          <path d="M0 0 L16 -1 L20 0 L16 1 Z M8 -1 L4 -6 L6 -6 L12 -1 Z M8 1 L4 5 L6 5 L12 1 Z M1 -1 L-1 -4 L1 -4 L3 -1 Z" />
        </g>
      </g>
      <g transform="translate(900 250)">
        <g className="sky-birds">
          <path className="sky-bird" d="M0 0 q6 -6 12 0 q6 -6 12 0" />
          <path className="sky-bird sky-bird-2" d="M30 -14 q5 -5 10 0 q5 -5 10 0" />
          <path className="sky-bird sky-bird-3" d="M54 6 q4 -4 8 0 q4 -4 8 0" />
        </g>
      </g>

      <rect x={0} y={GROUND - 420} width={W} height={420} fill="url(#sky-haze)" />
      <Silhouettes towers={lowLeft(FAR)} className="sky-far" />
      <Silhouettes towers={lowLeft(MID)} className="sky-mid" />
      <Towers towers={NEAR} />
      <rect x={0} y={GROUND - 10} width={W} height={10} className="sky-street" />
    </svg>
  );
}
