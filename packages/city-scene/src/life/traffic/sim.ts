import { createRng, range, weighted, type Rng } from '../rng.ts';
import { signalPhase, type SignalColor } from '../signals.ts';
import { buildNetwork, poseAt, type Connector, type Link, type Network, type Piece, type Pose } from './network.ts';
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
  mix.taxi = Math.round(total * 0.24);
  mix.suv = Math.round(total * 0.2);
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
}

/** Gaps (units) between bumpers: kept while driving, never closed (hard), reserved when entering a junction. */
const GAP_DESIRED = 0.8;
/** Extra following distance per unit of speed (a time headway). */
const HEADWAY = 0.22;
const GAP_HARD = 0.3;
const GAP_RESERVE = GAP_DESIRED + 0.3;
const ACCEL = 2.6;
const DECEL_COMFORT = 4;
const DECEL_MAX = 10;
const TURN_SPEED = { straight: Infinity, right: 3.2, left: 4 };
const LOOKAHEAD = 30;

export interface TrafficOptions {
  seed?: number;
  count: number;
}

/**
 * Deterministic traffic on the lane graph: cars follow their lane, choose a movement at each junction, commit to
 * it only with a green light (or an amber they cannot stop for), a free path through the box, clear crosswalks
 * and room on the exit link, then keep their distance from the car ahead. Vehicles that leave the city re-enter
 * at a random edge when there is room.
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
  time = 0;

  constructor(streets: CityLayout['streets'], opts: TrafficOptions) {
    this.net = buildNetwork(streets);
    this.rng = createRng(opts.seed ?? 7);
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
      for (let tries = 0; tries < links.length; tries++) {
        const link = links[order[li % order.length]!]!;
        li += 3;
        const used = this.occ[link.id]!;
        const tail = used.reduce((m, o) => Math.min(m, o.s - o.len / 2), link.length);
        const s = tail - GAP_DESIRED * 2 - v.len / 2;
        if (s - v.len / 2 < 0.5) continue;
        this.place(v, link, s, v.v0 * 0.5);
        break;
      }
    }
  }

  private place(v: Vehicle, link: Link, s: number, speed: number) {
    v.active = true;
    v.piece = link.id;
    v.s = s;
    v.v = speed;
    v.committed = false;
    v.holding = -1;
    this.occ[link.id]!.push(v);
    this.chooseNext(v, link);
    poseAt(link, s, v.pose);
  }

  private chooseNext(v: Vehicle, link: Link) {
    if (link.toJ < 0) {
      v.next = -1;
      return;
    }
    const [straight, right, left] = link.out as [number, number, number];
    // Drivers avoid streets that are already backed up.
    const w = (c: number) =>
      this.room(this.net.links[(this.net.pieces[c] as Connector).to]!) >= v.len + GAP_RESERVE + 2 ? 1 : 0.1;
    v.blocked = 0;
    v.next =
      v.kind === 'bus'
        ? straight
        : weighted(this.rng, [
            [straight, 0.62 * w(straight)],
            [right, 0.22 * w(right)],
            [left, 0.16 * w(left)],
          ]);
  }

  /** A driver held at the line by a full exit for a while takes another way, which also dissolves gridlock. */
  private reroute(v: Vehicle, link: Link) {
    const free = link.out.filter(
      c => c !== v.next && this.room(this.net.links[(this.net.pieces[c] as Connector).to]!) >= v.len + GAP_RESERVE,
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
            vMax = Math.min(vMax, Math.sqrt(2 * DECEL_COMFORT * Math.max(0, toEnd - 0.1)));
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
      const want = Math.max(-DECEL_MAX, Math.min(ACCEL, (vMax - v.v) * 2.2));
      v.a += (want - v.a) * Math.min(1, dt * 6);
      if (vMax < v.v && want < v.a) v.a = want;
      let nv = Math.max(0, Math.min(v.v + v.a * dt, vMax + 0.01));
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
    }
    // 2. Move.
    for (const v of vs) {
      if (!v.active) continue;
      v.s += advance[v.id]!;
      this.transition(v);
    }
    for (const list of this.occ) list.sort((a, b) => a.s - b.s);
    // 3. Bring back vehicles that left the city.
    for (const v of vs) if (!v.active) this.respawn(v);
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
    poseAt(this.net.pieces[v.piece]!, v.s, v.pose);
  }

  private moveTo(v: Vehicle, piece: number, s: number) {
    const list = this.occ[v.piece]!;
    list.splice(list.indexOf(v), 1);
    v.piece = piece;
    v.s = s;
    this.occ[piece]!.push(v);
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
    const e = this.net.extent;
    const d = e - Math.max(Math.abs(v.pose.x), Math.abs(v.pose.z));
    return Math.max(0, Math.min(1, d / 3));
  }
}
