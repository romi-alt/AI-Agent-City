import type { CityLayout } from '../../types.ts';
import { buildingBoxes, tallestRoof } from '../geometry.ts';
import { createRng, range } from '../rng.ts';

/**
 * Aircraft as pure functions of time, so they need no state, pause cleanly and are easy to test.
 *
 * Airliners cross the distant skyline on long, gently curving paths high above the city (they never come near
 * the towers), one every minute or two per slot, fading in and out with distance. Helicopters fly loops around the
 * skyline with hovering holds, well above the roofs, and leave for a while between visits.
 */
export interface AirSample {
  active: boolean;
  x: number;
  y: number;
  z: number;
  /** Yaw for a model facing +x. */
  yaw: number;
  bank: number;
  /** 0 invisible … 1 fully visible. */
  fade: number;
}

export const AIRLINER = {
  speed: 24,
  duration: 52,
  /** Closest horizontal approach to the city centre. */
  minDistance: 380,
  minAltitudeAboveRoofs: 120,
} as const;

export const HELICOPTER = {
  speed: 8,
  minRadius: 78,
  minAltitudeAboveRoofs: 32,
} as const;

interface Flight {
  pts: { x: number; z: number; yaw: number; bank: number }[];
  y0: number;
  y1: number;
}

function airlinerFlight(seed: number): Flight {
  const rng = createRng(seed);
  const theta = rng() * Math.PI * 2;
  const dist = range(rng, AIRLINER.minDistance + 20, AIRLINER.minDistance + 420);
  const turn = range(rng, -0.45, 0.45);
  const n = 96;
  const len = AIRLINER.speed * AIRLINER.duration;
  // Heading eases into and out of the turn, so the bank does too.
  const h0 = theta + Math.PI / 2 - turn / 2;
  const pts: Flight['pts'] = [];
  let x = 0;
  let z = 0;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const h = h0 + turn * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI));
    const rate = turn * (1 - Math.cos(2 * Math.PI * u));
    pts.push({ x, z, yaw: h, bank: -rate * 0.32 });
    x += (Math.cos(h) * len) / (n - 1);
    z -= (Math.sin(h) * len) / (n - 1);
  }
  // Put the middle of the path at the closest-approach point, then push the whole path out if the curve bends in.
  const mid = pts[Math.floor(n / 2)]!;
  const cx = Math.cos(theta) * dist - mid.x;
  const cz = -Math.sin(theta) * dist - mid.z;
  for (const p of pts) {
    p.x += cx;
    p.z += cz;
  }
  const closest = Math.min(...pts.map(p => Math.hypot(p.x, p.z)));
  if (closest < AIRLINER.minDistance) {
    const k = AIRLINER.minDistance - closest + 5;
    for (const p of pts) {
      p.x += Math.cos(theta) * k;
      p.z -= Math.sin(theta) * k;
    }
  }
  const y0 = range(rng, 0.12, 1);
  return { pts, y0, y1: y0 - range(rng, 0.02, 0.1) };
}

function samplePath(f: Flight, u: number, yBase: number, ySpan: number, out: AirSample) {
  const n = f.pts.length;
  const fi = Math.max(0, Math.min(n - 1.0001, u * (n - 1)));
  const i = Math.floor(fi);
  const k = fi - i;
  const a = f.pts[i]!;
  const b = f.pts[i + 1]!;
  out.x = a.x + (b.x - a.x) * k;
  out.z = a.z + (b.z - a.z) * k;
  out.yaw = a.yaw + (b.yaw - a.yaw) * k;
  out.bank = a.bank + (b.bank - a.bank) * k;
  out.y = yBase + ySpan * (f.y0 + (f.y1 - f.y0) * u);
}

export class AirTraffic {
  private airliners: { period: number; offset: number; seed: number; cache: Map<number, Flight> }[] = [];
  private helis: { pts: { x: number; y: number; z: number; hold: number }[]; times: number[]; total: number }[] = [];
  readonly airlinerFloor: number;
  readonly heliFloor: number;

  constructor(layout: CityLayout, opts: { aircraft: number; helicopters: number; seed?: number }) {
    const seed = opts.seed ?? 5;
    const roofs = tallestRoof(layout);
    this.airlinerFloor = roofs + AIRLINER.minAltitudeAboveRoofs;
    this.heliFloor = roofs + HELICOPTER.minAltitudeAboveRoofs;
    for (let k = 0; k < opts.aircraft; k++)
      this.airliners.push({ period: 75 + k * 31, offset: k * 23 + 6, seed: seed * 1000 + k * 97, cache: new Map() });
    for (let k = 0; k < opts.helicopters; k++) this.helis.push(this.heliLoop(layout, seed * 31 + k * 7, k));
  }

  /** A loop of waypoints around the skyline (hovering at some), with a long trip away from the city. */
  private heliLoop(layout: CityLayout, seed: number, k: number) {
    const rng = createRng(seed);
    const boxes = buildingBoxes(layout);
    const reach = Math.max(
      ...boxes.map(b => Math.max(Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minZ), Math.abs(b.maxZ))),
    );
    const r0 = Math.max(HELICOPTER.minRadius, reach + 30);
    const start = rng() * Math.PI * 2 + k * 2;
    const pts: { x: number; y: number; z: number; hold: number }[] = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = start + (i / n) * Math.PI * 1.4;
      const r = r0 + range(rng, 0, 30);
      pts.push({
        x: Math.cos(a) * r,
        y: this.heliFloor + range(rng, 6, 18),
        z: -Math.sin(a) * r,
        hold: rng() < 0.45 ? range(rng, 4, 10) : 0,
      });
    }
    // Away: out into the haze and back from the other side.
    const away = start + Math.PI * 1.7;
    pts.push({ x: Math.cos(away) * 520, y: this.heliFloor + 40, z: -Math.sin(away) * 520, hold: range(rng, 40, 90) });
    const times: number[] = [];
    let total = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      times.push(total);
      total += a.hold + Math.hypot(b.x - a.x, b.z - a.z) / HELICOPTER.speed;
    }
    return { pts, times, total };
  }

  private flight(slot: (typeof this.airliners)[number], n: number) {
    let f = slot.cache.get(n);
    if (!f) {
      if (slot.cache.size > 4) slot.cache.clear();
      f = airlinerFlight(slot.seed + n * 7919);
      slot.cache.set(n, f);
    }
    return f;
  }

  airliner(k: number, t: number, out: AirSample): AirSample {
    const slot = this.airliners[k]!;
    const local = t + slot.offset;
    const n = Math.floor(local / slot.period);
    const u = (local - n * slot.period) / AIRLINER.duration;
    out.active = u >= 0 && u <= 1;
    if (!out.active) {
      out.fade = 0;
      return out;
    }
    samplePath(this.flight(slot, n), u, this.airlinerFloor, 70, out);
    const edge = Math.min(u, 1 - u) / 0.14;
    out.fade = Math.max(0, Math.min(1, edge));
    return out;
  }

  helicopter(k: number, t: number, out: AirSample): AirSample {
    const h = this.helis[k]!;
    const local = (((t + k * 37) % h.total) + h.total) % h.total;
    let i = h.times.length - 1;
    while (i > 0 && h.times[i]! > local) i--;
    const a = h.pts[i]!;
    const b = h.pts[(i + 1) % h.pts.length]!;
    const prev = h.pts[(i - 1 + h.pts.length) % h.pts.length]!;
    const next = h.pts[(i + 2) % h.pts.length]!;
    const into = local - h.times[i]!;
    const travel = Math.hypot(b.x - a.x, b.z - a.z) / HELICOPTER.speed;
    out.active = true;
    if (into < a.hold) {
      // Hovering: a slow yaw drift and a gentle bob.
      out.x = a.x;
      out.y = a.y + Math.sin(t * 0.7 + k) * 0.25;
      out.z = a.z;
      const dir = Math.atan2(-(b.z - prev.z), b.x - prev.x);
      out.yaw = dir + Math.sin(into * 0.3) * 0.25;
      out.bank = 0;
    } else {
      const raw = Math.min(1, (into - a.hold) / travel);
      // Ease out of and into holds; fly through waypoints without a hold.
      const u =
        a.hold > 0 && b.hold > 0
          ? raw * raw * (3 - 2 * raw)
          : a.hold > 0
            ? raw * raw * (2 - raw)
            : b.hold > 0
              ? raw * (1 + raw - raw * raw)
              : raw;
      const p = catmull(prev, a, b, next, Math.max(0, Math.min(1, u)));
      const q = catmull(prev, a, b, next, Math.max(0, Math.min(1, u + 0.02)));
      const r = catmull(prev, a, b, next, Math.max(0, Math.min(1, u + 0.04)));
      out.x = p.x;
      out.y = p.y;
      out.z = p.z;
      const y1 = Math.atan2(-(q.z - p.z), q.x - p.x);
      const y2 = Math.atan2(-(r.z - q.z), r.x - q.x);
      out.yaw = y1;
      let d = y2 - y1;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      out.bank = Math.max(-0.3, Math.min(0.3, -d * 4));
    }
    // Fade with distance: helicopters far out over the river are lost in the haze.
    const dist = Math.hypot(out.x, out.z);
    out.fade = Math.max(0, Math.min(1, (420 - dist) / 120));
    out.y = Math.max(out.y, this.heliFloor);
    return out;
  }
}

function catmull(p0: { x: number; y: number; z: number }, p1: typeof p0, p2: typeof p0, p3: typeof p0, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), z: f(p0.z, p1.z, p2.z, p3.z) };
}
