import type { CityLayout } from '../../types.ts';
import { createRng, range, type Rng } from '../rng.ts';

/**
 * Pigeon flocks as boids (Reynolds: separation, alignment, cohesion) that follow a flock route and avoid
 * buildings. Pure and deterministic: stepped at a fixed rate from the life clock, rendered by interpolating the
 * last two steps, so motion is smooth at any frame rate and never jittery.
 *
 * A route alternates: rest on a roof edge → take off → fly either high over the rooftops or down a street canyon
 * between the towers → climb and land on another roof. Birds never enter a building: a predictive steer pushes them
 * away and a hard constraint projects any bird that would end up inside a box back to its surface.
 */
/** An axis-aligned box the birds must not enter (a building mass or a large rooftop part). */
export interface Obstacle {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** A roof the flocks land on: its centre, standing height and free spots along its edge. */
export interface Roof {
  x: number;
  z: number;
  y: number;
  spots: { x: number; y: number; z: number; yaw: number }[];
}

/** Everything the birds need to know about the buildings. */
export interface BirdWorld {
  obstacles: Obstacle[];
  roofs: Roof[];
  /** Height of the tallest main roof (high routes cross above it). */
  skyline: number;
}

export interface BirdState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 1 resting, 0 flying (eased during landing and take-off). */
  perched: number;
}

export interface BirdView {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Bank (roll) from turning, pitch from climbing. */
  bank: number;
  pitch: number;
  /** Wing-beat amplitude 0 … 1 and rate (Hz). */
  flap: number;
  rate: number;
  perched: number;
  scale: number;
}

interface Bird extends BirdState {
  /** Previous step, for interpolation. */
  px: number;
  py: number;
  pz: number;
  speed: number;
  scale: number;
  /** Perch slot on the current roof. */
  slot: number;
  /** Smoothed vertical speed (for wing beats). */
  climb: number;
  turn: number;
  yaw: number;
  pyaw: number;
  /** Personal wing-beat rhythm: seconds into the flap-and-glide cycle, its length, and the eased glide (0 flapping … 1 wings held). */
  cyc: number;
  period: number;
  glide: number;
  /** 0 … 1 while riding a thermal: wings held out, no beating. */
  soar: number;
  /** Phase of the slow altitude drift. */
  wob: number;
}

interface Leg {
  /** Roof the flock rests on before this leg. */
  from: number;
  to: number;
  rest: number;
  /** Route waypoints (x, y, z) from take-off to landing. */
  path: [number, number, number][];
  /** Cumulative length along the path. */
  lengths: number[];
  /** The flock circles on a thermal over the rooftops, wings held out. */
  thermal: boolean;
}

interface Flock {
  birds: Bird[];
  legs: Leg[];
  leg: number;
  /** Seconds into the current leg (rest first, then flight). */
  t: number;
  speed: number;
}

function cumulative(path: [number, number, number][]): number[] {
  const lengths = [0];
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1]!;
    const q = path[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]));
  }
  return lengths;
}

/** Share of flights that are a thermal circle, and the share of a wing-beat cycle spent flapping before gliding. */
const THERMAL_ODDS = 0.28;
const FLAP_SHARE = 0.62;

export const BOIDS = {
  step: 1 / 30,
  separation: 0.55,
  neighbour: 3.5,
  margin: 1.4,
  minY: 3,
  maxY: 70,
  pad: 30,
} as const;

export class Boids {
  readonly flocks: Flock[] = [];
  readonly obstacles: Obstacle[];
  readonly roofs: Roof[];
  /** Top of everything the birds must clear: the main roofs, crowns, spires and signs included. */
  readonly top: number;
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number };
  readonly count: number;
  private simT = 0;
  private roads: { x: number[]; z: number[] };

  constructor(layout: CityLayout, world: BirdWorld, opts: { count: number; seed?: number }) {
    const rng = createRng(opts.seed ?? 77);
    this.obstacles = world.obstacles;
    this.roofs = world.roofs;
    this.top = world.obstacles.reduce((m, o) => Math.max(m, o.maxY), world.skyline);
    this.roads = { x: layout.streets.roadsX, z: layout.streets.roadsZ };
    const e = layout.streets.extent;
    this.bounds = {
      minX: -e - BOIDS.pad,
      maxX: e + BOIDS.pad,
      minZ: -e - BOIDS.pad,
      maxZ: e + BOIDS.pad,
      maxY: BOIDS.maxY,
    };
    let left = opts.count;
    while (left > 0) {
      const size = Math.min(left, 6 + Math.floor(rng() * 8));
      this.flocks.push(this.makeFlock(rng, size));
      left -= size;
    }
    this.count = opts.count;
    // Start each flock somewhere in its routine.
    for (const f of this.flocks) {
      f.t = rng() * (f.legs[0]!.rest + 10);
      this.placePerched(f, f.legs[0]!.from);
    }
  }

  private makeFlock(rng: Rng, size: number): Flock {
    const n = this.roofs.length;
    const legs: Leg[] = [];
    let at = Math.floor(rng() * n);
    for (let i = 0; i < 16; i++) {
      let to = Math.floor(rng() * n);
      if (to === at) to = (to + 1 + Math.floor(rng() * (n - 1))) % n;
      legs.push(rng() < THERMAL_ODDS ? this.thermal(rng, at, to) : this.route(rng, at, to));
      at = to;
    }
    legs[legs.length - 1] = this.route(rng, legs[legs.length - 1]!.from, legs[0]!.from);
    const birds: Bird[] = Array.from({ length: size }, (_, slot) => ({
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      px: 0,
      py: 0,
      pz: 0,
      perched: 1,
      speed: range(rng, 0.92, 1.08),
      scale: range(rng, 0.9, 1.1),
      slot,
      climb: 0,
      turn: 0,
      yaw: 0,
      pyaw: 0,
      cyc: rng() * 4,
      period: range(rng, 2.4, 4.4),
      glide: 0,
      soar: 0,
      wob: rng() * 6.28,
    }));
    return { birds, legs, leg: 0, t: 0, speed: range(rng, 6.5, 8.5) };
  }

  /**
   * A route from roof a to roof b. Half the time high over the rooftops; otherwise down into the street canyon
   * nearest the start, along it, and up to the destination.
   */
  private route(rng: Rng, a: number, b: number): Leg {
    const A = this.roofs[a]!;
    const B = this.roofs[b]!;
    const ca: [number, number] = [A.x, A.z];
    const cb: [number, number] = [B.x, B.z];
    const path: [number, number, number][] = [];
    path.push([ca[0], A.y + 3, ca[1]]);
    if (rng() < 0.5) {
      const high = this.top + range(rng, 3, 8);
      path.push([ca[0] + (cb[0] - ca[0]) * 0.3, high, ca[1] + (cb[1] - ca[1]) * 0.3]);
      path.push([ca[0] + (cb[0] - ca[0]) * 0.7, high, ca[1] + (cb[1] - ca[1]) * 0.7]);
    } else {
      // The street canyon: the nearest road line between the two, at a height below the roofs.
      const canyon = range(rng, 7, 12);
      const nearest = (xs: number[], v: number) => xs.reduce((p, c) => (Math.abs(c - v) < Math.abs(p - v) ? c : p));
      const alongX = Math.abs(cb[0] - ca[0]) > Math.abs(cb[1] - ca[1]);
      if (alongX) {
        const z = nearest(this.roads.z, (ca[1] + cb[1]) / 2);
        path.push([ca[0], canyon + 4, z], [cb[0], canyon, z]);
      } else {
        const x = nearest(this.roads.x, (ca[0] + cb[0]) / 2);
        path.push([x, canyon + 4, ca[1]], [x, canyon, cb[1]]);
      }
    }
    path.push([cb[0], B.y + 3, cb[1]]);
    const lengths = cumulative(path);
    return { from: a, to: b, rest: range(rng, 8, 22), path, lengths, thermal: false };
  }

  /**
   * A lazy thermal: climb steeply off roof a, circle one to two turns well above the skyline (so never near a tower)
   * with the wings held out, then glide down to roof b.
   */
  private thermal(rng: Rng, a: number, b: number): Leg {
    const A = this.roofs[a]!;
    const B = this.roofs[b]!;
    const radius = range(rng, 13, 22);
    const base = this.top + range(rng, 5, 10);
    const turns = range(rng, 1.2, 2);
    const dir = rng() < 0.5 ? 1 : -1;
    const lift = range(rng, 4, 8);
    // The circle is centred so that its first point is straight above the roof the flock left.
    const phi = range(rng, 0, Math.PI * 2);
    const cx = A.x - Math.cos(phi) * radius;
    const cz = A.z - Math.sin(phi) * radius;
    const path: [number, number, number][] = [[A.x, A.y + 3, A.z]];
    const points = Math.ceil(turns * 14);
    for (let i = 0; i <= points; i++) {
      const k = i / points;
      const ang = phi + dir * turns * Math.PI * 2 * k;
      path.push([cx + Math.cos(ang) * radius, base + lift * k, cz + Math.sin(ang) * radius]);
    }
    path.push([B.x, B.y + 3, B.z]);
    return { from: a, to: b, rest: range(rng, 8, 22), path, lengths: cumulative(path), thermal: true };
  }

  private placePerched(f: Flock, roof: number) {
    const spots = this.roofs[roof]!.spots;
    f.birds.forEach((b, i) => {
      const s = spots[i % spots.length]!;
      b.x = b.px = s.x;
      b.y = b.py = s.y;
      b.z = b.pz = s.z;
      b.vx = b.vy = b.vz = 0;
      b.perched = 1;
      b.yaw = b.pyaw = s.yaw;
    });
  }

  /** The flock's moving target on its route, `ahead` seconds into the flight. */
  private target(f: Flock, leg: Leg, flight: number): [number, number, number] {
    const d = Math.max(0, flight * f.speed);
    const L = leg.lengths;
    const total = L[L.length - 1]!;
    if (d >= total) return leg.path[leg.path.length - 1]!;
    let i = 1;
    while (i < L.length - 1 && L[i]! < d) i++;
    const k = (d - L[i - 1]!) / (L[i]! - L[i - 1]!);
    const p = leg.path[i - 1]!;
    const q = leg.path[i]!;
    return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
  }

  /** Advance the simulation to life time `t` (fixed steps). */
  advance(t: number) {
    const h = BOIDS.step;
    let steps = 0;
    while (this.simT + h <= t && steps < 300) {
      this.simT += h;
      for (const f of this.flocks) this.stepFlock(f, h);
      steps++;
    }
    if (steps >= 300) this.simT = t;
  }

  private stepFlock(f: Flock, h: number) {
    const leg = f.legs[f.leg]!;
    f.t += h;
    const total = leg.lengths[leg.lengths.length - 1]!;
    const flight = f.t - leg.rest;
    const spots = this.roofs[leg.to]!.spots;
    const resting = flight < 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let vx = 0;
    let vy = 0;
    let vz = 0;
    for (const b of f.birds) {
      cx += b.x;
      cy += b.y;
      cz += b.z;
      vx += b.vx;
      vy += b.vy;
      vz += b.vz;
    }
    const n = f.birds.length;
    cx /= n;
    cy /= n;
    cz /= n;
    vx /= n;
    vy /= n;
    vz /= n;
    const arrive = flight > total / f.speed;
    let allLanded = true;
    f.birds.forEach((b, i) => {
      b.px = b.x;
      b.py = b.y;
      b.pz = b.z;
      b.pyaw = b.yaw;
      if (resting) {
        // Settled on the roof: fully perched, wings folded, no turn left over from the landing.
        b.perched = Math.min(1, b.perched + h * 3);
        b.turn *= 0.9;
        b.climb *= 0.9;
        return;
      }
      // Staggered take-off: each bird leaves a fraction of a second after its neighbour.
      if (b.perched > 0 && flight < i * 0.12) return;
      if (b.perched > 0 && !arrive) {
        b.perched = Math.max(0, b.perched - h * 4);
        b.vy = Math.max(b.vy, 2.5);
      }
      let ax = 0;
      let ay = 0;
      let az = 0;
      if (arrive) {
        // Landing: each bird seeks its own spot on the roof edge, slowing as it comes in.
        const s = spots[i % spots.length]!;
        const dx = s.x - b.x;
        const dy = s.y - b.y;
        const dz = s.z - b.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < 0.08) {
          b.x = s.x;
          b.y = s.y;
          b.z = s.z;
          b.vx = b.vy = b.vz = 0;
          b.perched = Math.min(1, b.perched + h * 3);
          b.yaw += Math.atan2(Math.sin(s.yaw - b.yaw), Math.cos(s.yaw - b.yaw)) * Math.min(1, h * 4);
          return;
        }
        allLanded = false;
        const want = Math.min(f.speed, d * 1.6 + 0.4);
        ax += (dx / d) * want - b.vx;
        ay += (dy / d) * want - b.vy;
        az += (dz / d) * want - b.vz;
        ax *= 3;
        ay *= 3;
        az *= 3;
      } else {
        allLanded = false;
        const [tx, ty0, tz] = this.target(f, leg, flight + 0.6);
        // Birds drift a little up and down on their own rhythm, only where there is sky to spare.
        const ty = ty0 + Math.sin(f.t * 0.45 + b.wob) * (ty0 > this.top ? 1.6 : 0.3);
        // Seek the route, keep together, match heading, keep apart.
        ax += (tx - b.x) * 0.9 + (cx - b.x) * 0.35 + (vx - b.vx) * 0.6;
        ay += (ty - b.y) * 0.9 + (cy - b.y) * 0.35 + (vy - b.vy) * 0.6;
        az += (tz - b.z) * 0.9 + (cz - b.z) * 0.35 + (vz - b.vz) * 0.6;
        for (const o of f.birds) {
          if (o === b) continue;
          const dx = b.x - o.x;
          const dy = b.y - o.y;
          const dz = b.z - o.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < BOIDS.separation * BOIDS.separation * 4 && d2 > 1e-6) {
            const k = 3 / d2;
            ax += dx * k;
            ay += dy * k;
            az += dz * k;
          }
        }
        // Look ahead and steer around buildings.
        const look = 1.2;
        const fx = b.x + b.vx * look;
        const fy = b.y + b.vy * look;
        const fz = b.z + b.vz * look;
        for (const o of this.obstacles) {
          const m = BOIDS.margin;
          if (fy > o.maxY + m || fy < o.minY - m) continue;
          if (fx < o.minX - m || fx > o.maxX + m || fz < o.minZ - m || fz > o.maxZ + m) continue;
          // Push out along the shallowest side (or up, if close to the top).
          const ox = fx - (o.minX + o.maxX) / 2;
          const oz = fz - (o.minZ + o.maxZ) / 2;
          const px = (o.maxX - o.minX) / 2 + m - Math.abs(ox);
          const pz = (o.maxZ - o.minZ) / 2 + m - Math.abs(oz);
          const py = o.maxY + m - fy;
          if (py < Math.min(px, pz)) ay += 12;
          else if (px < pz) ax += Math.sign(ox) * 12;
          else az += Math.sign(oz) * 12;
        }
        if (b.y < BOIDS.minY + 2) ay += (BOIDS.minY + 2 - b.y) * 4;
      }
      const amax = 14;
      const al = Math.hypot(ax, ay, az);
      if (al > amax) {
        ax *= amax / al;
        ay *= amax / al;
        az *= amax / al;
      }
      b.vx += ax * h;
      b.vy += ay * h;
      b.vz += az * h;
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      const vmax = f.speed * 1.35 * b.speed;
      const vmin = arrive ? 0 : f.speed * 0.6 * b.speed;
      const k = sp > vmax ? vmax / sp : sp < vmin && sp > 1e-6 ? vmin / sp : 1;
      b.vx *= k;
      b.vy *= k;
      b.vz *= k;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.z += b.vz * h;
      this.constrain(b, arrive ? i : -1, spots);
      // Heading, turn rate (for banking) and climb (for wing beats), smoothed.
      if (Math.hypot(b.vx, b.vz) > 0.2) {
        const yaw = Math.atan2(-b.vz, b.vx);
        const dyaw = Math.atan2(Math.sin(yaw - b.yaw), Math.cos(yaw - b.yaw));
        b.yaw += dyaw * Math.min(1, h * 8);
        b.turn += (dyaw / h - b.turn) * Math.min(1, h * 3);
      }
      b.climb += (b.vy - b.climb) * Math.min(1, h * 4);
      this.rhythm(b, h, leg.thermal && !arrive && b.y > this.top + 1);
    });
    if (arrive && allLanded) {
      f.leg = (f.leg + 1) % f.legs.length;
      f.t = 0;
    }
  }

  /** Flap for most of a cycle, then hold the wings out and glide; on a thermal, soar. */
  private rhythm(b: Bird, h: number, thermal: boolean) {
    b.cyc += h;
    const phase = (b.cyc % b.period) / b.period;
    const glideNow = phase > FLAP_SHARE && b.climb < 0.9 ? 1 : 0;
    b.glide += (glideNow - b.glide) * Math.min(1, h * 5);
    b.soar += ((thermal ? 1 : 0) - b.soar) * Math.min(1, h * 1.5);
  }

  /** Never inside a building, never below the street or above the sky limit, never out of the district. */
  private constrain(b: Bird, landingSlot: number, spots: { x: number; y: number; z: number }[]) {
    const landing = landingSlot >= 0 ? spots[landingSlot % spots.length] : null;
    // Pushing out of one box can land in a neighbouring one (a crown on a tower): repeat until clear.
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (const o of this.obstacles) {
        if (b.y >= o.maxY || b.y <= o.minY || b.x <= o.minX || b.x >= o.maxX || b.z <= o.minZ || b.z >= o.maxZ)
          continue;
        const dx = Math.min(b.x - o.minX, o.maxX - b.x);
        const dz = Math.min(b.z - o.minZ, o.maxZ - b.z);
        const dy = o.maxY - b.y;
        moved = true;
        if (dy <= dx && dy <= dz) {
          b.y = o.maxY + 0.01;
          b.vy = Math.max(0, b.vy);
        } else if (dx < dz) {
          b.x = b.x - o.minX < o.maxX - b.x ? o.minX - 0.01 : o.maxX + 0.01;
          b.vx = 0;
        } else {
          b.z = b.z - o.minZ < o.maxZ - b.z ? o.minZ - 0.01 : o.maxZ + 0.01;
          b.vz = 0;
        }
      }
      if (!moved) break;
    }
    // Still inside (wedged between two boxes): go back to the last free position and turn away upwards.
    if (this.inside(b)) {
      b.x = b.px;
      b.y = b.py;
      b.z = b.pz;
      b.vx *= -0.3;
      b.vz *= -0.3;
      b.vy = Math.abs(b.vy) * 0.3 + 1;
    }
    const { minX, maxX, minZ, maxZ, maxY } = this.bounds;
    b.x = Math.max(minX, Math.min(maxX, b.x));
    b.z = Math.max(minZ, Math.min(maxZ, b.z));
    b.y = Math.max(landing ? Math.min(BOIDS.minY, landing.y) : BOIDS.minY, Math.min(maxY, b.y));
  }

  private inside(b: { x: number; y: number; z: number }) {
    for (const o of this.obstacles)
      if (b.y < o.maxY && b.y > o.minY && b.x > o.minX && b.x < o.maxX && b.z > o.minZ && b.z < o.maxZ) return true;
    return false;
  }

  /** Interpolated view of bird `i` of flock `f` at the current time (alpha = fraction of the next step). */
  view(f: number, i: number, alpha: number, out: BirdView): BirdView {
    const b = this.flocks[f]!.birds[i]!;
    out.x = b.px + (b.x - b.px) * alpha;
    out.y = b.py + (b.y - b.py) * alpha;
    out.z = b.pz + (b.z - b.pz) * alpha;
    out.yaw = b.pyaw + Math.atan2(Math.sin(b.yaw - b.pyaw), Math.cos(b.yaw - b.pyaw)) * alpha;
    out.bank = Math.max(-0.7, Math.min(0.7, -b.turn * 0.8)) * (1 - b.perched);
    const sp = Math.hypot(b.vx, b.vz) || 1;
    out.pitch = Math.max(-0.5, Math.min(0.5, Math.atan2(b.vy, sp) * 0.6));
    // Strong beats when climbing or slow, a glide when descending fast.
    const climbing = Math.max(0, Math.min(1, b.climb / 2));
    const gliding = Math.max(0, Math.min(1, -b.climb / 2.5));
    const beat = Math.max(0.3, Math.min(1, 0.65 + climbing * 0.45 - gliding * 0.3));
    // Gliding and soaring hold the wings out, with a faint shiver so they are not frozen.
    const held = Math.max(b.glide, b.soar);
    out.flap = b.perched >= 1 ? 0 : beat * (1 - held) + 0.04 * held;
    out.rate = 5.5 + climbing * 2.5;
    out.perched = b.perched;
    out.scale = b.scale;
    return out;
  }

  /** Fraction of the way to the next fixed step for time t (for interpolation). */
  alpha(t: number) {
    return Math.max(0, Math.min(1, (t - this.simT) / BOIDS.step));
  }
}
