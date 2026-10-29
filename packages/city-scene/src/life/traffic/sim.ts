import { createRng, range, weighted, type Rng } from '../rng.ts';
import { signalPhase, type SignalColor } from '../signals.ts';
import {
  buildNetwork,
  HEADINGS,
  poseAt,
  type Connector,
  type Link,
  type Network,
  type Piece,
  type Pose,
} from './network.ts';
import type { CityLayout } from '../../types.ts';

export type VehicleKind = 'sedan' | 'suv' | 'taxi' | 'van' | 'bus' | 'emergency';
export const VEHICLE_KINDS: readonly VehicleKind[] = ['sedan', 'suv', 'taxi', 'van', 'bus', 'emergency'];

/** Sizes in world units (legacy scale), cruising speed range in units/s. */
export const VEHICLE_SPEC: Record<VehicleKind, { len: number; width: number; v0: [number, number] }> = {
  sedan: { len: 1.8, width: 0.76, v0: [6, 8] },
  suv: { len: 1.95, width: 0.82, v0: [5.8, 7.6] },
  taxi: { len: 1.8, width: 0.76, v0: [6.5, 8.4] },
  van: { len: 2.2, width: 0.86, v0: [5.2, 6.8] },
  bus: { len: 4.6, width: 0.98, v0: [4.2, 5] },
  emergency: { len: 2.3, width: 0.88, v0: [7, 8.5] },
};

/** How a budget of N vehicles is split between kinds (a city of yellow cabs; one emergency vehicle at most). */
export function vehicleMix(total: number): Record<VehicleKind, number> {
  const mix: Record<VehicleKind, number> = { sedan: 0, suv: 0, taxi: 0, van: 0, bus: 0, emergency: 0 };
  if (total <= 0) return mix;
  mix.emergency = total >= 30 ? 1 : 0;
  mix.bus = Math.max(total >= 12 ? 1 : 0, Math.round(total * 0.05));
  mix.van = Math.round(total * 0.12);
  mix.taxi = Math.round(total * 0.4);
  mix.suv = Math.round(total * 0.12);
  mix.sedan = Math.max(0, total - mix.emergency - mix.bus - mix.van - mix.taxi - mix.suv);
  return mix;
}

export interface Vehicle {
  id: number;
  kind: VehicleKind;
  len: number;
  width: number;
  v0: number;
  active: boolean;
  piece: number;
  /** Distance of the vehicle's centre along its piece. */
  s: number;
  v: number;
  a: number;
  /** Connector chosen for the junction ahead (−1: none, e.g. on an exit link). */
  next: number;
  /** Holds a junction reservation (from commit until its rear leaves the box). */
  committed: boolean;
  /** Connector it holds the reservation for. */
  holding: number;
  /** Signal colour when it committed (tests: never red). */
  commitColor: SignalColor | null;
  pose: Pose;
  brake: number;
  /** Seconds spent waiting at the line for room on the chosen exit. */
  blocked: number;
  /** Distance driven (world units); the wheels roll by it. */
  odo: number;
  /** Personal driving style: peak acceleration (units/s²), reaction time to a car pulling away (s). */
  accel: number;
  reaction: number;
  /** Seconds this car has been held back by a leader that is already moving (start-up delay down a queue). */
  react: number;
  /** Where in its lane the driver sits, as a sideways offset from the lane centre (units, positive towards the kerb). */
  lat: number;
  /** The speed cap of the previous step: its fall is fed forward when stopping. */
  cap: number;
  /** Yaw rate (rad/s, positive turning left), smoothed: the body rolls with it. */
  yawRate: number;
  /** Stop planned on the current link (distance along it, −1: none) and the dwell left once there (−1: not there yet). */
  stopAt: number;
  dwell: number;
  /** 0..1: eased towards the kerb while a bus or taxi pulls in. */
  pull: number;
}

/** Gaps (units) between bumpers: kept while driving, never closed (hard), reserved when entering a junction. */
const GAP_DESIRED = 0.8;
/** Extra following distance per unit of speed (a time headway). */
const HEADWAY = 0.22;
const GAP_HARD = 0.3;
const GAP_RESERVE = GAP_DESIRED + 0.3;
/** How quickly the commanded acceleration may build up (units/s³): no instant throttle, a progressive brake. */
const JERK_UP = 5;
const JERK_DOWN = 9;
/** Seconds of braking lost while the brake comes on: stops are planned this much earlier. */
const BRAKE_LAG = 0.22;
/** A car may carry a little more speed than its cap while the throttle comes off (units/s). */
const CRUISE_SLACK = 0.9;
/** Odds that a bus (a taxi) plans a stop on a link long enough for it, and how long it waits there (seconds). */
const STOP_CHANCE: Partial<Record<VehicleKind, number>> = { bus: 0.5, taxi: 0.1 };
const DWELL: Partial<Record<VehicleKind, [number, number]>> = { bus: [5, 10], taxi: [2.5, 4.5] };
/** Sideways shift towards the kerb while stopped at a stop (units). */
const PULL_OVER: Partial<Record<VehicleKind, number>> = { bus: 0.3, taxi: 0.36 };
const DECEL_COMFORT = 3.6;
const DECEL_MAX = 10;
const TURN_SPEED = { straight: Infinity, right: 3.2, left: 4 };
const LOOKAHEAD = 30;

export interface Area {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TrafficOptions {
  seed?: number;
  count: number;
  /**
   * The downtown the camera looks at. Drivers outside it lean towards it at each junction (they are heading into
   * town), so the district stays busy while the outer grid carries thinner traffic that thins out into the fog.
   */
  focus?: Area;
  /** Distance over which vehicles fade in and out at the edge of the road grid (deep in the fog). */
  edgeFade?: number;
}

/** How much more likely a driver outside the focus takes a turn towards it than away from it. */
const PULL = 1.6;

/**
 * Deterministic traffic on the lane graph: cars follow their lane, choose a movement at each junction, commit to
 * it only with a green light (or an amber they cannot stop for), a free path through the box, clear crosswalks
 * and room on the exit link, then keep their distance from the car ahead. Vehicles that leave the city re-enter
 * at a random edge when there is room (on the generated city's grid that edge is deep in the fog).
 */
export class TrafficSim {
  readonly net: Network;
  readonly vehicles: Vehicle[] = [];
  /** Cars on each piece. */
  private occ: Vehicle[][];
  /** Length reserved on each link by committed cars that have not reached it yet. */
  private reserved: Float64Array;
  /** Reservations per junction. */
  private boxes: Vehicle[][];
  /** Cars holding each crosswalk; pedestrians may not step on while non-zero. */
  readonly carsOnCrosswalk: Int32Array;
  /** Pedestrians on (or committed to) each crosswalk; set by the pedestrian simulation. */
  readonly pedsOnCrosswalk: Int32Array;
  private rng: Rng;
  private focus: Area | null;
  private fadeLength: number;
  /** Pieces whose occupant order may have changed this step (sorting all of a large grid's pieces is wasteful). */
  private dirty = new Set<number>();
  time = 0;
  /** Length of the step in progress. */
  private dt = 1 / 30;

  constructor(streets: CityLayout['streets'], opts: TrafficOptions) {
    this.net = buildNetwork(streets);
    this.rng = createRng(opts.seed ?? 7);
    this.focus = opts.focus ?? null;
    this.fadeLength = opts.edgeFade ?? 6;
    this.occ = this.net.pieces.map(() => []);
    this.reserved = new Float64Array(this.net.links.length);
    this.boxes = this.net.junctions.map(() => []);
    this.carsOnCrosswalk = new Int32Array(this.net.crosswalks.length);
    this.pedsOnCrosswalk = new Int32Array(this.net.crosswalks.length);
    const mix = vehicleMix(opts.count);
    const kinds: VehicleKind[] = [];
    for (const k of VEHICLE_KINDS) for (let i = 0; i < mix[k]; i++) kinds.push(k);
    // Shuffle so kinds spread over the streets.
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
    }
    kinds.forEach((kind, id) => {
      const spec = VEHICLE_SPEC[kind];
      this.vehicles.push({
        id,
        kind,
        len: spec.len,
        width: spec.width,
        v0: range(this.rng, spec.v0[0], spec.v0[1]),
        active: false,
        piece: -1,
        s: 0,
        v: 0,
        a: 0,
        next: -1,
        committed: false,
        holding: -1,
        commitColor: null,
        pose: { x: 0, z: 0, yaw: 0 },
        brake: 0,
        blocked: 0,
        odo: 0,
        accel: range(this.rng, 2.1, 3.0),
        reaction: range(this.rng, 0.35, 1.1),
        react: 0,
        lat: range(this.rng, -0.06, 0.1),
        cap: spec.v0[1],
        yawRate: 0,
        stopAt: -1,
        dwell: -1,
        pull: 0,
      });
    });
    this.scatter();
  }

  /** Spread vehicles over the links with room between them (a believable mid-traffic start). */
  private scatter() {
    const links = this.net.links.filter(l => l.length >= 6);
    const order = links.map((_, i) => i);
    let li = Math.floor(this.rng() * order.length);
    for (const v of this.vehicles) {
      for (let tries = 0; tries < links.length * 2; tries++) {
        const link = links[order[li % order.length]!]!;
        li += 3;
        // Start close to the steady state: denser downtown, thinner towards the fog.
        if (this.rng() > this.startDensity(link)) continue;
        const used = this.occ[link.id]!;
        const tail = used.reduce((m, o) => Math.min(m, o.s - o.len / 2), link.length);
        const s = tail - GAP_DESIRED * 2 - v.len / 2;
        if (s - v.len / 2 < 0.5) continue;
        this.place(v, link, s, v.v0 * 0.5);
        break;
      }
    }
  }

  /** Relative traffic density by distance from the focus (1 inside it), for the starting spread. */
  private startDensity(link: Link): number {
    const f = this.focus;
    if (!f) return 1;
    const mid = link.start + ((link.heading === 0 || link.heading === 1 ? 1 : -1) * link.length) / 2;
    const x = link.heading % 2 === 0 ? mid : link.lane;
    const z = link.heading % 2 === 0 ? link.lane : mid;
    const d = Math.max(f.minX - x, x - f.maxX, f.minZ - z, z - f.maxZ, 0);
    return 1 / (1 + d / 25);
  }

  /** Weight for a movement: towards the focus when outside it, neutral inside. */
  private pull(link: Link, conn: number): number {
    const f = this.focus;
    if (!f || conn < 0 || link.toJ < 0) return 1;
    const J = this.net.junctions[link.toJ]!;
    const out = this.net.links[(this.net.pieces[conn] as Connector).to]!.heading;
    const dx = J.x < f.minX ? 1 : J.x > f.maxX ? -1 : 0;
    const dz = J.z < f.minZ ? 1 : J.z > f.maxZ ? -1 : 0;
    if (dx === 0 && dz === 0) return 1;
    const [hx, hz] = HEADINGS[out]!;
    const toward = hx * dx + hz * dz;
    return toward > 0 ? PULL : toward < 0 ? 1 / PULL : 1;
  }

  private place(v: Vehicle, link: Link, s: number, speed: number) {
    v.active = true;
    v.piece = link.id;
    v.s = s;
    v.v = speed;
    v.committed = false;
    v.holding = -1;
    this.occ[link.id]!.push(v);
    this.dirty.add(link.id);
    this.chooseNext(v, link);
    poseAt(link, s, v.pose);
  }

  /** Buses and now and then a taxi plan to stop somewhere along a link that is long enough to hold them. */
  private planStop(v: Vehicle, link: Link) {
    v.stopAt = -1;
    v.dwell = -1;
    const odds = STOP_CHANCE[v.kind];
    if (!odds || link.length < 12 || this.rng() > odds) return;
    const at = link.length * range(this.rng, 0.4, 0.7);
    if (at > v.s + 3 + v.len) v.stopAt = at;
  }

  private chooseNext(v: Vehicle, link: Link) {
    this.planStop(v, link);
    if (link.toJ < 0) {
      v.next = -1;
      return;
    }
    const [straight, right, left] = link.out as [number, number, number];
    // Drivers avoid streets that are already backed up.
    const w = (c: number) =>
      c < 0 ? 0 : this.room(this.net.links[(this.net.pieces[c] as Connector).to]!) >= v.len + GAP_RESERVE + 2 ? 1 : 0.1;
    v.blocked = 0;
    const options = (
      [
        [straight, 0.62 * w(straight) * this.pull(link, straight)],
        [right, 0.22 * w(right) * this.pull(link, right)],
        [left, 0.16 * w(left) * this.pull(link, left)],
      ] as [number, number][]
    ).filter(([c]) => c >= 0);
    // Buses keep straight on where they can (at a ring corner they must turn).
    v.next =
      v.kind === 'bus' && straight >= 0
        ? straight
        : weighted(this.rng, options.length ? options : [[link.out.find(c => c >= 0)!, 1]]);
  }

  /** A driver held at the line by a full exit for a while takes another way, which also dissolves gridlock. */
  private reroute(v: Vehicle, link: Link) {
    const free = link.out.filter(
      c =>
        c >= 0 &&
        c !== v.next &&
        this.room(this.net.links[(this.net.pieces[c] as Connector).to]!) >= v.len + GAP_RESERVE,
    );
    v.blocked = 0;
    if (free.length) v.next = free[Math.floor(this.rng() * free.length)]!;
  }

  /** Free length at the start of a link for a car about to commit into it. */
  private room(link: Link): number {
    let tail = link.length;
    for (const o of this.occ[link.id]!) tail = Math.min(tail, o.s - o.len / 2);
    return tail - this.reserved[link.id]!;
  }

  private colorFor(link: Link, t: number): SignalColor {
    const p = signalPhase(t);
    return link.heading % 2 === 0 ? p.ew : p.ns;
  }

  private mayCommit(v: Vehicle, link: Link, conn: Connector, distStop: number, t: number): SignalColor | null {
    // First come, first served: never hold the box while a car ahead in the lane still waits for it.
    for (const o of this.occ[link.id]!)
      if (o !== v && o.s > v.s && (!o.committed || o.holding !== conn.id)) return null;
    const color = this.colorFor(link, t);
    if (color === 'red') return null;
    if (color === 'amber') {
      const canStop = v.v < 0.5 || (v.v * v.v) / (2 * DECEL_COMFORT * 1.5) <= distStop - 0.05;
      if (canStop) return null;
    }
    for (const o of this.boxes[conn.junction]!) {
      const oc = this.net.pieces[o.holding] as Connector;
      if (oc.local !== conn.local && this.net.conflicts[conn.local]![oc.local]) return null;
    }
    for (const cw of conn.crosswalks) if (this.pedsOnCrosswalk[cw]! > 0) return null;
    if (this.room(this.net.links[conn.to]!) < v.len + GAP_RESERVE) return null;
    return color;
  }

  private commit(v: Vehicle, conn: Connector, color: SignalColor) {
    v.committed = true;
    v.holding = conn.id;
    v.commitColor = color;
    this.boxes[conn.junction]!.push(v);
    for (const cw of conn.crosswalks) this.carsOnCrosswalk[cw]!++;
    this.reserved[conn.to] = this.reserved[conn.to]! + v.len + GAP_RESERVE;
  }

  private release(v: Vehicle) {
    const conn = this.net.pieces[v.holding] as Connector;
    const box = this.boxes[conn.junction]!;
    box.splice(box.indexOf(v), 1);
    for (const cw of conn.crosswalks) this.carsOnCrosswalk[cw]!--;
    v.committed = false;
    v.holding = -1;
  }

  /** Distance from v's centre to the centre of the nearest car ahead on its planned path, and that car. */
  private leader(v: Vehicle): { d: number; o: Vehicle } | null {
    const plan: Piece[] = [];
    const cur = this.net.pieces[v.piece]!;
    plan.push(cur);
    if (cur.kind === 'link') {
      if (v.next >= 0) {
        const c = this.net.pieces[v.next] as Connector;
        plan.push(c, this.net.links[c.to]!);
      }
    } else plan.push(this.net.links[cur.to]!);
    let base = -v.s;
    let best: { d: number; o: Vehicle } | null = null;
    for (let k = 0; k < plan.length; k++) {
      const p = plan[k]!;
      for (const o of this.occ[p.id]!) {
        if (o === v) continue;
        if (k === 0 && (o.s < v.s || (o.s === v.s && o.id > v.id))) continue;
        const d = base + o.s;
        if (!best || d < best.d) best = { d, o };
      }
      // Cars that just turned off this link still stick out of it with their rear.
      if (p.kind === 'link')
        for (const cid of p.out) {
          if (cid < 0) continue;
          if (cid === plan[k + 1]?.id) continue;
          for (const o of this.occ[cid]!) {
            const d = base + p.length + o.s;
            if (!best || d < best.d) best = { d, o };
          }
        }
      if (best) return best;
      base += p.length;
      if (base > LOOKAHEAD) break;
    }
    return best;
  }

  step(dt: number, t: number) {
    this.time = t;
    this.dt = dt;
    const vs = this.vehicles;
    // 1. Decide speeds from the current positions (everyone ahead only moves forward, so this is safe).
    const advance = new Float64Array(vs.length);
    for (const v of vs) {
      if (!v.active) continue;
      const piece = this.net.pieces[v.piece]!;
      let vMax = v.v0;
      let hard = Infinity;
      if (piece.kind === 'conn') vMax = Math.min(vMax, TURN_SPEED[piece.move]);
      if (piece.kind === 'link' && v.next >= 0) {
        const conn = this.net.pieces[v.next] as Connector;
        const toEnd = piece.length - v.s - v.len / 2;
        const turn = TURN_SPEED[conn.move];
        if (turn < Infinity) vMax = Math.min(vMax, Math.sqrt(turn * turn + 2 * DECEL_COMFORT * Math.max(0, toEnd)));
        if (v.holding !== conn.id) {
          const stopDist = (v.v * v.v) / (2 * DECEL_COMFORT);
          // One reservation at a time: a car still leaving the previous box waits before claiming the next.
          if (v.holding < 0 && toEnd <= stopDist + 3) {
            const color = this.mayCommit(v, piece, conn, toEnd, t);
            if (color) this.commit(v, conn, color);
          }
          if (v.holding !== conn.id && toEnd < 0.5 && v.v < 0.2) {
            v.blocked = this.room(this.net.links[conn.to]!) < v.len + GAP_RESERVE ? v.blocked + dt : 0;
            if (v.blocked > 2.5) this.reroute(v, piece);
          }
          if (v.holding !== conn.id) {
            vMax = Math.min(vMax, Math.sqrt(2 * DECEL_COMFORT * Math.max(0, toEnd - 0.1 - v.v * BRAKE_LAG)));
            hard = Math.min(hard, Math.max(0, toEnd - 0.02));
          }
        }
      }
      const lead = this.leader(v);
      if (lead) {
        const gap = lead.d - (v.len + lead.o.len) / 2;
        vMax = Math.min(
          vMax,
          Math.sqrt(lead.o.v * lead.o.v + 2 * DECEL_COMFORT * Math.max(0, gap - GAP_DESIRED - HEADWAY * v.v)),
        );
        if (gap < GAP_DESIRED)
          vMax = Math.min(vMax, lead.o.v * Math.max(0, (gap - GAP_HARD) / (GAP_DESIRED - GAP_HARD)));
        hard = Math.min(hard, Math.max(0, gap - GAP_HARD));
      }
      if (piece.kind === 'link' && v.stopAt >= 0) vMax = Math.min(vMax, this.stopLimit(v, dt));
      // A driver sets off a moment after the car ahead does, so a queue releases as a wave, not all at once.
      if (v.v < 0.15 && lead && lead.o.v > 0.4 && vMax > 0.2) {
        v.react += dt;
        if (v.react < v.reaction) vMax = Math.min(vMax, 0.05);
      } else if (v.v >= 0.15 || !lead) v.react = 0;
      // Follow the speed cap like a driver: feed forward the cap's own fall (a stop curve) and correct what is left.
      const fall = Math.min(0, (vMax - v.cap) / dt);
      v.cap = vMax;
      const gain = vMax < v.v ? 4 : 2.2;
      const wanted = Math.max(-DECEL_MAX, Math.min(v.accel, fall + (vMax - v.v) * gain));
      v.a = this.easeAcceleration(v.a, wanted, dt);
      let nv = Math.max(0, Math.min(v.v + v.a * dt, vMax + CRUISE_SLACK));
      let ds = nv * dt;
      if (ds > hard) {
        ds = hard;
        nv = hard / Math.max(dt, 1e-6);
        nv = Math.min(nv, v.v);
      }
      v.v = nv;
      advance[v.id] = ds;
      const braking = v.a < -0.8 || v.v < 0.25 ? 1 : 0;
      v.brake += (braking - v.brake) * Math.min(1, dt * 8);
      this.updatePull(v, piece, dt);
    }
    // 2. Move.
    for (const v of vs) {
      if (!v.active) continue;
      v.s += advance[v.id]!;
      v.odo += advance[v.id]!;
      this.dirty.add(v.piece);
      this.transition(v);
    }
    for (const id of this.dirty) {
      const list = this.occ[id]!;
      if (list.length > 1) list.sort((a, b) => a.s - b.s);
    }
    this.dirty.clear();
    // 3. Bring back vehicles that left the city.
    for (const v of vs) if (!v.active) this.respawn(v);
  }

  /**
   * Acceleration changes at a bounded rate (throttle builds, the brake comes on progressively) so speed curves have no
   * corners; only braking harder than a driver ever would by choice (a car ahead stopping short) is applied at once.
   */
  private easeAcceleration(a: number, wanted: number, dt: number): number {
    if (wanted < -DECEL_COMFORT * 2.2) return Math.max(-DECEL_MAX, wanted);
    const jerk = wanted > a ? JERK_UP : JERK_DOWN;
    return a + Math.max(-jerk * dt, Math.min(jerk * dt, wanted - a));
  }

  /** Speed cap that brings a bus or taxi to rest exactly at its planned stop, then holds it for the dwell time. */
  private stopLimit(v: Vehicle, dt: number): number {
    const toStop = v.stopAt - v.s;
    if (v.dwell >= 0) {
      v.dwell -= dt;
      if (v.dwell > 0) return 0;
      v.stopAt = -1;
      v.dwell = -1;
      return Infinity;
    }
    if (toStop < -0.5) {
      v.stopAt = -1;
      return Infinity;
    }
    if (toStop < 0.25 && v.v < 0.15) {
      const [lo, hi] = DWELL[v.kind] ?? [3, 5];
      v.dwell = range(this.rng, lo, hi);
      return 0;
    }
    return Math.sqrt(2 * DECEL_COMFORT * 0.8 * Math.max(0, toStop - 0.05 - v.v * BRAKE_LAG)) + 0.08;
  }

  /** Buses and taxis ease towards the kerb as they near their stop and back into the lane when they leave. */
  private updatePull(v: Vehicle, piece: Piece, dt: number) {
    const near = piece.kind === 'link' && v.stopAt >= 0 && v.stopAt - v.s < 5;
    v.pull += ((near ? 1 : 0) - v.pull) * Math.min(1, dt * 1.6);
  }

  /** Sideways offset of a driver from the lane centre right now (towards the kerb is positive). */
  laneOffset(v: Vehicle): number {
    return v.lat + v.pull * (PULL_OVER[v.kind] ?? 0);
  }

  private transition(v: Vehicle) {
    for (;;) {
      const p = this.net.pieces[v.piece]!;
      // Rear left the junction box: the reservation ends.
      if (v.committed && p.id === (this.net.pieces[v.holding] as Connector).to && v.s - v.len / 2 >= 0.1)
        this.release(v);
      if (v.s < p.length) break;
      if (p.kind === 'link') {
        if (p.toJ < 0) {
          this.remove(v);
          return;
        }
        if (v.next < 0 || v.holding !== v.next) {
          v.s = p.length - 0.001;
          break;
        }
        this.moveTo(v, v.next, v.s - p.length);
        v.next = -1;
      } else {
        const link = this.net.links[p.to]!;
        this.reserved[link.id] = Math.max(0, this.reserved[link.id]! - (v.len + GAP_RESERVE));
        this.moveTo(v, link.id, v.s - p.length);
        this.chooseNext(v, link);
      }
    }
    const yaw = v.pose.yaw;
    poseAt(this.net.pieces[v.piece]!, v.s, v.pose);
    this.turnRate(v, yaw);
  }

  /** Smoothed yaw rate from the change of heading over the last step. */
  private turnRate(v: Vehicle, before: number) {
    const d = Math.atan2(Math.sin(v.pose.yaw - before), Math.cos(v.pose.yaw - before));
    v.yawRate += (d / Math.max(this.dt, 1e-3) - v.yawRate) * Math.min(1, this.dt * 6);
  }

  private moveTo(v: Vehicle, piece: number, s: number) {
    const list = this.occ[v.piece]!;
    list.splice(list.indexOf(v), 1);
    v.piece = piece;
    v.s = s;
    this.occ[piece]!.push(v);
    this.dirty.add(piece);
  }

  private remove(v: Vehicle) {
    if (v.committed) this.release(v);
    const list = this.occ[v.piece]!;
    list.splice(list.indexOf(v), 1);
    v.active = false;
    v.piece = -1;
  }

  private respawn(v: Vehicle) {
    const sources = this.net.sources;
    for (let tries = 0; tries < 3; tries++) {
      const link = this.net.links[sources[Math.floor(this.rng() * sources.length)]!]!;
      if (v.kind === 'bus' && link.length < 15) continue;
      if (this.room(link) < v.len + GAP_DESIRED * 2) continue;
      this.place(v, link, v.len / 2, v.v0 * 0.8);
      return;
    }
  }

  /** Visibility of a vehicle near the city edge (0 at the edge), so arrivals and exits fade into the haze. */
  edgeFade(v: Vehicle): number {
    if (this.net.closed) return 1;
    const e = this.net.extent;
    const d = e - Math.max(Math.abs(v.pose.x), Math.abs(v.pose.z));
    return Math.max(0, Math.min(1, d / this.fadeLength));
  }
}
