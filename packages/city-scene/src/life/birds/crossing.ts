import { createRng, range } from '../rng.ts';

/**
 * Loose flocks of larger birds (gulls and geese) that cross the whole city high above the roofs now and then, on
 * their way somewhere else. Unlike the resident pigeons they never land or weave between buildings: each pass is
 * a gentle arc from the fog on one side to the fog on the other, well above the tallest roof, so they can never
 * meet geometry. Everything is a pure function of time, so a pass is smooth at any frame rate and reproducible.
 */
export interface CrossingBird {
  x: number;
  y: number;
  z: number;
  /** Yaw for a +x-facing model. */
  yaw: number;
  bank: number;
  /** Wing-beat amplitude: 0 while gliding. */
  flap: number;
  /** Beats per second. */
  rate: number;
  /** 0 outside a pass (hidden). */
  visible: number;
}

export interface CrossingOptions {
  /** Flocks taking turns; each one crosses once per period. */
  flocks: number;
  birdsPerFlock: number;
  /** Height of the tallest roof: passes stay at least `clearance` above it. */
  roof: number;
  /** Where passes start and end (in the fog, from the city centre). */
  radius: number;
  seed?: number;
}

export const CROSSING = {
  /** Ground speed in world units per second: about 14 m/s at 0.4 units per metre, a cruising gull. */
  speed: 5.5,
  clearance: 14,
  /** Seconds between passes of one flock, and the extra per flock so passes rarely overlap. */
  period: 150,
  periodStep: 47,
} as const;

interface Member {
  /** Offset in the flock frame: along the heading (back is negative), sideways, up. */
  along: number;
  side: number;
  up: number;
  /** Slow personal drift (rad/s) and its phase, so the formation breathes instead of being rigid. */
  drift: number;
  phase: number;
  /** Flap/glide cycle: seconds per cycle and its phase. */
  cycle: number;
  rate: number;
}

interface Flock {
  period: number;
  offset: number;
  heading0: number;
  altitude: number;
  members: Member[];
}

export class CrossingFlocks {
  readonly flocks: Flock[] = [];
  readonly radius: number;

  constructor(opts: CrossingOptions) {
    const rng = createRng(opts.seed ?? 913);
    this.radius = opts.radius;
    for (let f = 0; f < opts.flocks; f++) {
      const members: Member[] = [];
      // A loose, ragged V: two trailing arms with scatter, a few stragglers.
      for (let i = 0; i < opts.birdsPerFlock; i++) {
        const arm = i % 2 === 0 ? 1 : -1;
        const rank = Math.ceil(i / 2);
        members.push({
          along: -rank * range(rng, 1.1, 1.8) + range(rng, -0.5, 0.5),
          side: arm * rank * range(rng, 0.8, 1.4) + range(rng, -0.6, 0.6),
          up: range(rng, -0.6, 0.6),
          drift: range(rng, 0.15, 0.35),
          phase: rng() * Math.PI * 2,
          cycle: range(rng, 3.5, 6),
          rate: range(rng, 2.6, 3.4),
        });
      }
      this.flocks.push({
        period: CROSSING.period + f * CROSSING.periodStep,
        offset: (f * CROSSING.period) / Math.max(1, opts.flocks) + rng() * 20,
        heading0: rng() * Math.PI * 2,
        altitude: opts.roof + CROSSING.clearance + range(rng, 0, 18),
        members,
      });
    }
  }

  /** Seconds a pass takes from fog to fog. */
  get passTime() {
    return (2 * this.radius) / CROSSING.speed;
  }

  get count() {
    return this.flocks.reduce((n, f) => n + f.members.length, 0);
  }

  /** Pose of bird `i` of flock `f` at time `t` (seconds). */
  view(f: number, i: number, t: number, out: CrossingBird): CrossingBird {
    const flock = this.flocks[f]!;
    const m = flock.members[i]!;
    const local = t + flock.offset;
    const pass = Math.floor(local / flock.period);
    const u = local - pass * flock.period;
    out.visible = 0;
    if (u > this.passTime) return out;
    // Each pass comes from a different direction; the path is a gentle arc (constant turn rate) that passes
    // within about a third of the radius of the centre.
    const heading = flock.heading0 + pass * 2.39996;
    const turn = (((pass * 7) % 5) - 2) * 0.0009;
    const s = u * CROSSING.speed - this.radius;
    const yaw0 = heading;
    const yaw = yaw0 + turn * s;
    // Integrate the arc analytically: position along a circle of curvature `turn`.
    const fx = Math.cos(yaw0);
    const fz = -Math.sin(yaw0);
    const lx = -fz;
    const lz = fx;
    const along = Math.abs(turn) < 1e-6 ? s : Math.sin(turn * s) / turn;
    const across = Math.abs(turn) < 1e-6 ? 0 : (1 - Math.cos(turn * s)) / turn;
    const offset = (((pass * 13) % 7) - 3) * (this.radius / 12);
    const cx = fx * along - lx * (across + offset);
    const cz = fz * along - lz * (across + offset);
    // Formation in the flock frame, breathing slowly.
    const breathe = Math.sin(local * m.drift + m.phase);
    const a = m.along + breathe * 0.4;
    const sd = m.side * (1 + breathe * 0.08);
    const hx = Math.cos(yaw);
    const hz = -Math.sin(yaw);
    out.x = cx + hx * a - hz * sd;
    out.z = cz + hz * a + hx * sd;
    out.y = flock.altitude + m.up + Math.sin(local * m.drift * 0.7 + m.phase) * 0.5;
    out.yaw = yaw;
    out.bank = -turn * 120 + breathe * 0.06;
    // Flap for most of the cycle, then a short glide; eased so the amplitude never jumps.
    const c = ((local + m.phase) % m.cycle) / m.cycle;
    out.flap = c < 0.7 ? 1 : c < 0.75 ? 1 - (c - 0.7) / 0.05 : c < 0.95 ? 0 : (c - 0.95) / 0.05;
    out.rate = m.rate;
    out.visible = 1;
    return out;
  }
}
