import type { CityLayout, LayoutBuilding } from '../../types.ts';
import { roofHeight, ROOF_TOP, tallestRoof } from '../geometry.ts';
import { createRng, range, type Rng } from '../rng.ts';

/**
 * Birds as pure functions of time.
 *
 * - **Roof flocks** (pigeons): a small flock rests on a roof edge, then flies to another roof on a high arc (each bird
 *   with its own start delay, speed and wobble) and settles there. While resting, a bird now and then hops up and
 *   lands again.
 * - **Soaring birds** (gulls): a few larger birds circle slowly above the towers, drifting with a wandering centre,
 *   gliding more than flapping.
 *
 * Every position stays inside the city's bounds and above every roof it crosses (tests check this).
 */
export interface BirdSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  bank: number;
  /** Wing beat amplitude 0 (gliding or folded) … 1. */
  flap: number;
  /** Wing beats per second. */
  rate: number;
  /** 1 when resting with wings folded. */
  perched: number;
  /** Size multiplier. */
  scale: number;
}

interface Perch {
  x: number;
  y: number;
  z: number;
  /** Yaw the bird faces while resting (out over the street). */
  yaw: number;
}

interface Leg {
  from: number;
  to: number;
  /** Start time of the rest at `from`. */
  t0: number;
  rest: number;
  flight: number;
  apex: number;
}

interface RoofFlock {
  size: number;
  legs: Leg[];
  cycle: number;
  /** Per-bird offsets: perch spacing, delay, lateral wobble seed, speed factor. */
  birds: { slot: number; delay: number; seed: number; speed: number; scale: number }[];
}

export const BIRD_LIMITS = { pad: 30, maxY: 75, clearance: 2.5 } as const;

/** Edge spots on a roof: along its four parapets, facing outwards. */
function roofPerches(b: LayoutBuilding): Perch[] {
  const y = roofHeight(b) + ROOF_TOP;
  const out: Perch[] = [];
  const hw = b.w / 2 - 0.15;
  const hd = b.d / 2 - 0.15;
  for (const [nx, nz] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const) {
    const yaw = Math.atan2(-nz, nx);
    for (let k = -3; k <= 3; k++) {
      const along = k * 0.42;
      out.push({ x: b.x + nx * hw + (nz !== 0 ? along : 0), y, z: b.z + nz * hd + (nx !== 0 ? along : 0), yaw });
    }
  }
  return out;
}

export class Birds {
  readonly roofFlocks: RoofFlock[] = [];
  readonly soarers: { r: number; speed: number; phase: number; y: number; cx: number; cz: number; seed: number }[] = [];
  private perches: Perch[][] = [];
  private buildings: LayoutBuilding[];
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number };
  readonly count: number;

  constructor(layout: CityLayout, opts: { count: number; seed?: number }) {
    const rng = createRng(opts.seed ?? 77);
    this.buildings = layout.buildings;
    this.perches = layout.buildings.map(roofPerches);
    const e = layout.streets.extent;
    this.bounds = {
      minX: -e - BIRD_LIMITS.pad,
      maxX: e + BIRD_LIMITS.pad,
      minZ: -e - BIRD_LIMITS.pad,
      maxZ: e + BIRD_LIMITS.pad,
      maxY: BIRD_LIMITS.maxY,
    };
    const soaring = opts.count >= 20 ? Math.round(opts.count * 0.15) : 0;
    let left = opts.count - soaring;
    while (left > 0) {
      const size = Math.min(left, 4 + Math.floor(rng() * 6));
      this.roofFlocks.push(this.makeFlock(rng, size, tallestRoof(layout)));
      left -= size;
    }
    for (let i = 0; i < soaring; i++)
      this.soarers.push({
        r: range(rng, 18, 40),
        speed: range(rng, 0.09, 0.16) * (rng() < 0.5 ? 1 : -1),
        phase: rng() * Math.PI * 2,
        y: tallestRoof(layout) + range(rng, 10, 26),
        cx: range(rng, -25, 25),
        cz: range(rng, -15, 15),
        seed: rng() * 100,
      });
    this.count = opts.count;
  }

  private makeFlock(rng: Rng, size: number, tallest: number): RoofFlock {
    const n = this.buildings.length;
    let at = Math.floor(rng() * n);
    const legs: Leg[] = [];
    let t = -rng() * 20;
    for (let i = 0; i < 24; i++) {
      let to = Math.floor(rng() * n);
      if (to === at) to = (to + 1 + Math.floor(rng() * (n - 1))) % n;
      const a = this.buildings[at]!;
      const b = this.buildings[to]!;
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      const rest = range(rng, 9, 26);
      const flight = Math.max(4, dist / range(rng, 6.5, 9));
      legs.push({ from: at, to, t0: t, rest, flight, apex: tallest + range(rng, 6, 12) });
      t += rest + flight;
      at = to;
    }
    // Close the loop: the last leg returns to where the first started.
    const last = legs[legs.length - 1]!;
    last.to = legs[0]!.from;
    const a = this.buildings[last.from]!;
    const b = this.buildings[last.to]!;
    last.flight = Math.max(4, Math.hypot(b.x - a.x, b.z - a.z) / 7.5);
    if (last.from === last.to) last.flight = 6;
    const cycle = last.t0 + last.rest + last.flight - legs[0]!.t0;
    const birds = Array.from({ length: size }, (_, i) => ({
      slot: i,
      delay: rng() * 0.9,
      seed: rng() * 100,
      speed: range(rng, 0.93, 1.07),
      scale: range(rng, 0.9, 1.1),
    }));
    return { size, legs, cycle, birds };
  }

  private perch(building: number, slot: number, flockSeed: number): Perch {
    const ps = this.perches[building]!;
    const side = (Math.floor(flockSeed) + Math.floor(slot / 7)) % 4;
    return ps[side * 7 + (slot % 7)]!;
  }

  /** Sample bird `i` of roof flock `f` at time t. */
  roofBird(f: number, i: number, t: number, out: BirdSample): BirdSample {
    const flock = this.roofFlocks[f]!;
    const bird = flock.birds[i]!;
    const first = flock.legs[0]!.t0;
    const local = ((((t - first) % flock.cycle) + flock.cycle) % flock.cycle) + first;
    let li = flock.legs.length - 1;
    while (li > 0 && flock.legs[li]!.t0 > local) li--;
    const leg = flock.legs[li]!;
    const into = local - leg.t0;
    const startFly = leg.rest + bird.delay;
    const flight = leg.flight / bird.speed;
    out.scale = bird.scale;
    const fseed = f * 13 + leg.from;
    if (into < startFly || into > startFly + flight) {
      // Resting (at the start of this leg, or already landed at its end).
      const landed = into > startFly + flight;
      const p = this.perch(landed ? leg.to : leg.from, bird.slot, landed ? f * 13 + leg.to : fseed);
      out.x = p.x;
      out.z = p.z;
      out.yaw = p.yaw + Math.sin(t * 0.3 + bird.seed) * 0.6;
      out.bank = 0;
      // Now and then a short hop: up, flap, down.
      const hopT = (t + bird.seed * 3.7) % 23;
      const hop = hopT < 1.2 ? Math.sin((hopT / 1.2) * Math.PI) : 0;
      out.y = p.y + hop * 0.7;
      out.flap = hop > 0 ? 1 : 0;
      out.rate = 7;
      out.perched = hop > 0 ? 0 : 1;
      return out;
    }
    const u = (into - startFly) / flight;
    const a = this.perch(leg.from, bird.slot, fseed);
    const b = this.perch(leg.to, bird.slot, f * 13 + leg.to);
    this.arc(a, b, leg.apex + Math.sin(bird.seed) * 1.5, u, bird.seed, t, out);
    out.flap = u < 0.25 ? 1 : u > 0.85 ? 0.9 : 0.35 + 0.35 * Math.max(0, Math.sin(t * 0.9 + bird.seed));
    out.rate = 6.5 + Math.sin(bird.seed) * 0.8;
    out.perched = 0;
    return out;
  }

  /**
   * A flight from roof spot a to b: climb straight up off the roof, cross at `apex`, and come down onto b.
   * Horizontal motion is eased so a bird only crosses other roofs once it is high.
   */
  private arc(a: Perch, b: Perch, apex: number, u: number, seed: number, t: number, out: BirdSample) {
    const pos = (s: number) => {
      const h = s * s * (3 - 2 * s);
      const climb = Math.min(1, s / 0.3);
      const descend = Math.min(1, (1 - s) / 0.3);
      const lift = Math.min(climb * (2 - climb), descend * (2 - descend));
      const wob = Math.sin(s * Math.PI) * 0.8;
      return {
        x: a.x + (b.x - a.x) * h + Math.sin(t * 0.8 + seed) * wob,
        y: a.y + (b.y - a.y) * h + (apex - Math.max(a.y, b.y)) * lift + Math.sin(t * 1.3 + seed * 2) * 0.3 * wob,
        z: a.z + (b.z - a.z) * h + Math.cos(t * 0.7 + seed) * wob,
      };
    };
    const p = pos(u);
    const q = pos(Math.min(1, u + 0.01));
    out.x = p.x;
    out.y = p.y;
    out.z = p.z;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    out.yaw = Math.hypot(dx, dz) > 1e-5 ? Math.atan2(-dz, dx) : out.yaw;
    out.bank = Math.sin(t * 0.8 + seed) * 0.25;
  }

  soarer(i: number, t: number, out: BirdSample): BirdSample {
    const s = this.soarers[i]!;
    const a = s.phase + t * s.speed;
    // The circle's centre wanders slowly, so the birds drift across the skyline.
    const cx = s.cx + Math.sin(t * 0.017 + s.seed) * 20;
    const cz = s.cz + Math.cos(t * 0.013 + s.seed) * 12;
    out.x = cx + Math.cos(a) * s.r;
    out.z = cz - Math.sin(a) * s.r;
    out.y = s.y + Math.sin(t * 0.21 + s.seed) * 2.5;
    out.yaw = a + (s.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
    out.bank = s.speed > 0 ? 0.35 : -0.35;
    const beat = Math.sin(t * 0.37 + s.seed * 3);
    out.flap = beat > 0.6 ? 0.8 : 0.05;
    out.rate = 3.2;
    out.perched = 0;
    out.scale = 1.7;
    return out;
  }

  /** Every bird in order: roof flocks first, then soarers. */
  all(t: number, each: (s: BirdSample, i: number) => void, tmp: BirdSample) {
    let k = 0;
    this.roofFlocks.forEach((f, fi) => {
      for (let i = 0; i < f.size; i++) each(this.roofBird(fi, i, t, tmp), k++);
    });
    for (let i = 0; i < this.soarers.length; i++) each(this.soarer(i, t, tmp), k++);
  }
}
