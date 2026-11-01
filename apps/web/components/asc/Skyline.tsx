import type { ReactNode } from 'react';

// The design's little neon skylines (district cards, the demo preview, the closing call to action). Seeded so the
// server and the browser draw the same city and nothing jumps after hydration.
export function Skyline({
  width,
  height,
  color,
  seed,
  className,
  id,
}: {
  width: number;
  height: number;
  color: string;
  seed: number;
  className?: string;
  id?: string;
}) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out: ReactNode[] = [];
  let x = 0;
  let key = 0;
  while (x < width) {
    const w = 18 + rnd() * 34;
    const h = 30 + rnd() * (height - 40);
    out.push(
      <rect
        key={key++}
        x={x.toFixed(1)}
        y={(height - h).toFixed(1)}
        width={w.toFixed(1)}
        height={h.toFixed(1)}
        fill="#0d1326"
        stroke={color}
        strokeOpacity=".35"
      />,
    );
    for (let wy = height - h + 8; wy < height - 6; wy += 10) {
      for (let wx = x + 5; wx < x + w - 5; wx += 8) {
        if (rnd() < 0.35) {
          const opacity = (0.4 + rnd() * 0.6).toFixed(2);
          const lo = (0.2 + rnd() * 0.3).toFixed(2);
          const hi = (0.2 + rnd() * 0.3).toFixed(2);
          const dur = (2 + rnd() * 5).toFixed(1);
          const begin = (rnd() * 4).toFixed(1);
          out.push(
            <rect key={key++} x={wx.toFixed(1)} y={wy.toFixed(1)} width="3" height="4" fill={color} opacity={opacity}>
              <animate
                attributeName="opacity"
                values={`${lo};1;${hi}`}
                dur={`${dur}s`}
                repeatCount="indefinite"
                begin={`${begin}s`}
              />
            </rect>,
          );
        }
      }
    }
    x += w + 2 + rnd() * 6;
  }
  return (
    <svg id={id} className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {out}
    </svg>
  );
}
