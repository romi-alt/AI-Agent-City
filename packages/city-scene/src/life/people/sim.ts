import type { CityLayout } from '../../types.ts';
import {
  buildingDoors,
  CROSSWALK_HALF_WIDTH,
  roofHeight,
  ROOF_TOP,
  SIDEWALK,
  SIDEWALK_Y,
  type Door,
} from '../geometry.ts';
import { createRng, range, type Rng } from '../rng.ts';
import { walkSignal } from '../signals.ts';
import { plazaSpots } from './plaza.ts';
import { STRIDE } from './proportions.ts';
import type { Network } from '../traffic/network.ts';

/**
 * Pedestrians: walkers on the sidewalk graph (corners at every junction, sidewalks along the blocks, crosswalks
 * across each junction leg), people waiting at the kerb for their walk signal, people going in and out of lobby
 * doors, standing groups, people seated on benches and (with micro-animations) a worker on a roof.
 *
 * Corners: q = 0 SE (+x,+z), 1 SW, 2 NW, 3 NE. Crosswalk on leg L joins corners (L + 3) % 4 and L.
 */
export type PersonMode = 0 | 1 | 2 | 3;
/** 0 walking/standing, 1 talking (groups), 2 seated, 3 waiting at the kerb. */
export const MODE = { walk: 0, talk: 1, seated: 2, wait: 3 } as const;

export interface PersonPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Uniform scale (height variety). 0 hides the person (inside a building). */
  scale: number;
  /** Walk-cycle phase in radians, advanced by distance walked so the feet never slide. */
  phase: number;
  /** Distance walked so far (world units): skeletal walk clips are timed from it. */
  dist: number;
  /** 0 standing … 1 full stride. */
  gait: number;
  mode: PersonMode;
}

interface Edge {
  id: number;
  a: number;
  b: number;
  kind: 'side' | 'cross';
  /** Crosswalk id for crossings. */
  cw: number;
  length: number;
  doors: { s: number; door: Door }[];
}

export interface Bench {
  x: number;
  z: number;
  /** Seated people face this way (yaw for a +x-facing model). */
  yaw: number;
}

interface RoofWorker {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  s: number;
  dir: 1 | -1;
  pause: number;
  pose: PersonPose;
}

type WalkerState = 'side' | 'toWait' | 'wait' | 'cross' | 'toDoor' | 'inside' | 'fromDoor';

/** A walking companion: keeps beside (and, for a third, slightly behind) the walker it came with. */
interface Companion {
  pose: PersonPose;
  leader: Walker;
  /** Distance to the side of the leader (always on the side away from the road) and behind it. */
  side: number;
  back: number;
  /** Stride offset so a pair is not in lockstep. */
  stride: number;
  /** Where it is beside the leader now (signed, eased): it moves across when the pavement side changes at a corner. */
  off: number | null;
  /** Body size (the pose's scale drops to 0 while the group is indoors). */
  size: number;
}

interface Walker {
  id: number;
  /** The walking line position, before smoothing (the pose holds the smoothed one). */
  ix: number;
  iz: number;
  /** Speed cap from people just ahead on the same pavement. */
  cap: number;
  /** Sideways step to the right to pass someone coming the other way, eased. */
  nudge: number;
  nudgeTo: number;
  /** Seconds left stopped to look around (phone, shop window), 0 when walking. */
  pause: number;
  /** The position shown (smoothed). */
  sx: number;
  sz: number;
  v0: number;
  v: number;
  lat: number;
  height: number;
  state: WalkerState;
  edge: number;
  /** Walking a → b (true) or b → a. */
  fwd: boolean;
  /** Current straight segment. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  s: number;
  len: number;
  /** Where to stop on a side edge (door) or −1. */
  stopAt: number;
  door: Door | null;
  timer: number;
  /** The corner the walker is at or heading to. */
  corner: number;
  cameFrom: number;
  pose: PersonPose;
}

const WALK_SPEED: [number, number] = [0.85, 1.45];
const CROSS_SPEED = 1.4;
const TURN_RATE = 5;
/** Rate (1/s) at which the shown position follows the walking line: it rounds corners instead of snapping to them. */
const SMOOTH = 9;
/** Share of walkers that walk as a pair or trio, and the chance per second a walker stops to look around. */
const COMPANION_SHARE = 0.28;
const LOOK_RATE = 0.02;
/** People closer than this on a pavement notice each other. */
const PERSONAL = 0.9;
const GRID = 1.2;
const NUDGE = 0.25;

export interface PeopleOptions {
  seed?: number;
  /** Total people (budget). */
  count: number;
  /** Rooftop workers (micro-animations). */
  roofWorkers: number;
  /** Where sidewalks are walked (default: inside the outermost roads of the network). */
  area?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export class PeopleSim {
  readonly poses: PersonPose[] = [];
  readonly benches: Bench[] = [];
  readonly walkers: Walker[] = [];
  private companions: Companion[] = [];
  private corners: { x: number; z: number; edges: number[] }[] = [];
  private edges: Edge[] = [];
  private rng: Rng;
  private roof: RoofWorker[] = [];
  private readonly net: Network;
  private readonly pedsOnCrosswalk: Int32Array;
  private readonly carsOnCrosswalk: Int32Array;

  constructor(
    net: Network,
    layout: CityLayout,
    pedsOnCrosswalk: Int32Array,
    carsOnCrosswalk: Int32Array,
    opts: PeopleOptions,
  ) {
    this.net = net;
    this.pedsOnCrosswalk = pedsOnCrosswalk;
    this.carsOnCrosswalk = carsOnCrosswalk;
    this.rng = createRng(opts.seed ?? 21);
    this.buildGraph(layout, opts.area);
    const roofWorkers = Math.min(opts.roofWorkers, opts.count);
    const rest = opts.count - roofWorkers;
    const statics = Math.round(rest * 0.3);
    const walkers = rest - statics;
    const followers = Math.round(walkers * COMPANION_SHARE);
    for (let i = 0; i < walkers - followers; i++) this.addWalker();
    this.addCompanions(followers);
    this.addStatics(layout, statics);
    this.addRoofWorkers(layout, roofWorkers);
  }

  private buildGraph(layout: CityLayout, area?: PeopleOptions['area']) {
    // The same junctions as the traffic network (which may include A1's ring road).
    const xs = [...new Set(this.net.junctions.map(j => j.x))].sort((a, b) => a - b);
    const zs = [...new Set(this.net.junctions.map(j => j.z))].sort((a, b) => a - b);
    const ring = this.net.extent;
    // Pedestrians stay on the sidewalks of their area (the district and the first ring of blocks round it).
    const inside = area
      ? (c: { x: number; z: number }) => c.x > area.minX && c.x < area.maxX && c.z > area.minZ && c.z < area.maxZ
      : (c: { x: number; z: number }) => Math.abs(c.x) < ring && Math.abs(c.z) < ring;
    const sx = [1, -1, -1, 1];
    const sz = [1, 1, -1, -1];
    for (const J of this.net.junctions)
      for (let q = 0; q < 4; q++)
        this.corners.push({ x: J.x + sx[q]! * SIDEWALK, z: J.z + sz[q]! * SIDEWALK, edges: [] });
    const add = (a: number, b: number, kind: Edge['kind'], cw = -1) => {
      const A = this.corners[a]!;
      const B = this.corners[b]!;
      if (!inside(A) || !inside(B)) return null;
      const e: Edge = { id: this.edges.length, a, b, kind, cw, length: Math.hypot(B.x - A.x, B.z - A.z), doors: [] };
      this.edges.push(e);
      A.edges.push(e.id);
      B.edges.push(e.id);
      return e;
    };
    for (const J of this.net.junctions)
      for (let leg = 0; leg < 4; leg++) add(J.id * 4 + ((leg + 3) % 4), J.id * 4 + leg, 'cross', J.id * 4 + leg);
    const nx = xs.length;
    for (let j = 0; j < zs.length; j++)
      for (let i = 0; i < nx; i++) {
        const J = j * nx + i;
        if (i + 1 < nx) {
          const E = J + 1;
          add(J * 4 + 0, E * 4 + 1, 'side'); // south side of the x-road
          add(J * 4 + 3, E * 4 + 2, 'side'); // north side
        }
        if (j + 1 < zs.length) {
          const S = J + nx;
          add(J * 4 + 0, S * 4 + 3, 'side'); // east side of the z-road
          add(J * 4 + 1, S * 4 + 2, 'side'); // west side
        }
      }
    // Doors hang off the sidewalk that runs past them.
    for (const door of buildingDoors(layout)) {
      // The sidewalk line in front of the door: along x for doors facing ±z, along z for doors facing ±x.
      const alongX = door.nz !== 0;
      const roads = alongX ? zs : xs;
      const at = alongX ? door.z : door.x;
      const n = alongX ? door.nz : door.nx;
      const road = n > 0 ? roads.find(r => r > at) : roads.filter(r => r < at).at(-1);
      if (road === undefined) continue;
      const line = road - n * SIDEWALK;
      for (const e of this.edges) {
        if (e.kind !== 'side') continue;
        const A = this.corners[e.a]!;
        const B = this.corners[e.b]!;
        const [la, lb, pa, pb, d] = alongX ? [A.z, B.z, A.x, B.x, door.x] : [A.x, B.x, A.z, B.z, door.z];
        if (Math.abs(la - line) > 0.01 || Math.abs(lb - line) > 0.01) continue;
        if (d > Math.min(pa, pb) + 0.5 && d < Math.max(pa, pb) - 0.5) e.doors.push({ s: Math.abs(d - pa), door });
      }
    }
  }

  private newPose(): PersonPose {
    const p: PersonPose = {
      x: 0,
      y: SIDEWALK_Y,
      z: 0,
      yaw: 0,
      scale: range(this.rng, 0.88, 1.12),
      phase: this.rng() * 6.28,
      dist: this.rng() * 10,
      gait: 0,
      mode: 0,
    };
    this.poses.push(p);
    return p;
  }

  private addWalker() {
    const sides = this.edges.filter(e => e.kind === 'side');
    const e = sides[Math.floor(this.rng() * sides.length)]!;
    const w: Walker = {
      id: this.walkers.length,
      ix: 0,
      iz: 0,
      cap: Infinity,
      nudge: 0,
      nudgeTo: 0,
      pause: 0,
      sx: 0,
      sz: 0,
      v0: range(this.rng, WALK_SPEED[0], WALK_SPEED[1]),
      v: 0,
      lat: range(this.rng, 0.12, 0.4),
      height: 1,
      state: 'side',
      edge: e.id,
      fwd: this.rng() < 0.5,
      x0: 0,
      z0: 0,
      x1: 0,
      z1: 0,
      s: 0,
      len: 0,
      stopAt: -1,
      door: null,
      timer: 0,
      corner: -1,
      cameFrom: -1,
      pose: this.newPose(),
    };
    w.v = w.v0;
    w.height = w.pose.scale;
    this.walkers.push(w);
    // Start somewhere along the sidewalk.
    const [x0, z0, x1, z1] = this.edgeLine(e, w.fwd, w.lat);
    const f = this.rng() * 0.9;
    this.setSegment(w, x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, x1, z1);
    w.corner = w.fwd ? e.b : e.a;
    w.pose.yaw = Math.atan2(-(z1 - z0), x1 - x0);
    w.ix = w.sx = w.pose.x = w.x0;
    w.iz = w.sz = w.pose.z = w.z0;
  }

  /** Make `n` more people walk beside walkers already on the pavement: mostly pairs, now and then a trio. */
  private addCompanions(n: number) {
    for (let i = 0; i < n; i++) {
      const leader = this.walkers[Math.floor(i / 1.4) % this.walkers.length]!;
      const nth = this.companions.filter(c => c.leader === leader).length;
      const pose = this.newPose();
      this.companions.push({
        pose,
        size: pose.scale,
        off: null,
        leader,
        side: nth === 0 ? 0.5 : 0.28,
        back: nth === 0 ? 0 : 0.6,
        stride: range(this.rng, 0.3, 1.2),
      });
    }
  }

  /** The walking line of an edge, offset to the walker's right. */
  private edgeLine(e: Edge, fwd: boolean, lat: number): [number, number, number, number] {
    const A = this.corners[fwd ? e.a : e.b]!;
    const B = this.corners[fwd ? e.b : e.a]!;
    const dx = (B.x - A.x) / e.length;
    const dz = (B.z - A.z) / e.length;
    // Right of travel for a y-up world seen from above: (−dz, dx).
    const ox = -dz * lat;
    const oz = dx * lat;
    return [A.x + ox, A.z + oz, B.x + ox, B.z + oz];
  }

  private setSegment(w: Walker, x0: number, z0: number, x1: number, z1: number) {
    w.x0 = x0;
    w.z0 = z0;
    w.x1 = x1;
    w.z1 = z1;
    w.s = 0;
    w.len = Math.hypot(x1 - x0, z1 - z0);
  }

  private addStatics(layout: CityLayout, n: number) {
    const doors = buildingDoors(layout);
    const { roadsZ } = layout.streets;
    let left = n;
    let k = 0;
    // About half the people out and about are in the plaza, talking in small groups.
    const plaza = plazaSpots(layout);
    let plazaLeft = Math.round(n * 0.5);
    for (let round = 0; plazaLeft > 0 && plaza.groups.length > 0 && round < 2; round++) {
      for (const g of plaza.groups) {
        if (plazaLeft <= 0) break;
        const size = Math.min(plazaLeft, 2 + Math.floor(this.rng() * 3));
        const gx = g.x + round * 0.55;
        const gz = g.z - round * 0.45;
        for (let i = 0; i < size; i++) {
          const a = (i / size) * Math.PI * 2 + this.rng() * 0.5;
          const r = size === 2 ? 0.22 : 0.3;
          const p = this.newPose();
          p.x = gx + Math.cos(a) * r;
          p.z = gz + Math.sin(a) * r * 0.8;
          p.yaw = Math.atan2(-(gz - p.z), gx - p.x);
          p.mode = this.rng() < 0.75 ? MODE.talk : MODE.wait;
          plazaLeft--;
          left--;
        }
      }
    }
    // Rotate through doors: a group on one side of the entrance, a bench on the other.
    const spots: { door: Door; kind: 'group' | 'bench' }[] = [];
    for (const door of doors) {
      const alongX = door.nz !== 0;
      const roads = alongX ? roadsZ : layout.streets.roadsX;
      const at = alongX ? door.z : door.x;
      const n = alongX ? door.nz : door.nx;
      const road = n > 0 ? roads.find(r => r > at) : roads.filter(r => r < at).at(-1);
      if (road === undefined) continue;
      const space = Math.abs(road - at) - SIDEWALK - 0.6;
      if (space < 2) continue;
      spots.push({ door, kind: k++ % 2 === 0 ? 'group' : 'bench' });
    }
    for (let round = 0; left > 0 && round < 3; round++)
      for (const spot of spots) {
        if (left <= 0) break;
        const { door } = spot;
        // Along the facade (t) and out from it (n).
        const tx = -door.nz;
        const tz = door.nx;
        const side = (round % 2 === 0) === (spot.kind === 'group') ? 1 : -1;
        if (spot.kind === 'group' || round === 2) {
          const size = Math.min(left, 2 + Math.floor(this.rng() * 3));
          const cx = door.x + tx * side * (2.2 + round * 0.4) + door.nx * 1.35;
          const cz = door.z + tz * side * (2.2 + round * 0.4) + door.nz * 1.35;
          for (let i = 0; i < size; i++) {
            const a = (i / size) * Math.PI * 2 + this.rng() * 0.5;
            const r = size === 2 ? 0.22 : 0.3;
            const p = this.newPose();
            p.x = cx + Math.cos(a) * r;
            p.z = cz + Math.sin(a) * r * 0.8;
            p.yaw = Math.atan2(-(cz - p.z), cx - p.x);
            p.mode = MODE.talk;
            left--;
          }
        } else {
          const bx = door.x + tx * side * (2.6 + round * 0.3) + door.nx * 0.85;
          const bz = door.z + tz * side * (2.6 + round * 0.3) + door.nz * 0.85;
          const yaw = Math.atan2(-door.nz, door.nx);
          this.benches.push({ x: bx, z: bz, yaw });
          const seats = Math.min(left, this.rng() < 0.6 ? 2 : 1);
          for (let i = 0; i < seats; i++) {
            const p = this.newPose();
            const off = seats === 1 ? (this.rng() - 0.5) * 0.4 : i === 0 ? -0.27 : 0.27;
            p.x = bx + tx * off;
            p.z = bz + tz * off;
            p.yaw = yaw;
            p.mode = MODE.seated;
            p.scale = 1;
            left--;
          }
        }
      }
    // Anyone left over waits by a lobby door.
    while (left-- > 0) {
      const d = doors[Math.floor(this.rng() * doors.length)]!;
      const p = this.newPose();
      const along = (this.rng() - 0.5) * 3;
      p.x = d.x - d.nz * along + d.nx * 0.9;
      p.z = d.z + d.nx * along + d.nz * 0.9;
      p.yaw = Math.atan2(-d.nz, d.nx) + (this.rng() - 0.5);
      p.mode = MODE.wait;
    }
  }

  private addRoofWorkers(layout: CityLayout, n: number) {
    const roofs = [...layout.buildings].sort((a, b) => a.floors.length - b.floors.length || a.key.localeCompare(b.key));
    for (let i = 0; i < n; i++) {
      const b = roofs[(i * 5) % roofs.length]!;
      const p = this.newPose();
      p.scale = 1;
      const y = roofHeight(b) + ROOF_TOP;
      this.roof.push({
        x0: b.x - b.w * 0.3,
        z0: b.z + b.d * 0.25,
        x1: b.x + b.w * 0.3,
        z1: b.z + b.d * 0.25,
        y,
        s: this.rng(),
        dir: 1,
        pause: 0,
        pose: p,
      });
      p.y = y;
    }
  }

  /** Doors on the edge that lie ahead of the walker, as distances from its start. */
  private chooseNextAtCorner(w: Walker, t: number) {
    const c = this.corners[w.corner]!;
    const options = c.edges.filter(id => id !== w.cameFrom);
    const pickFrom = options.length > 0 ? options : c.edges;
    const id = pickFrom[Math.floor(this.rng() * pickFrom.length)]!;
    const e = this.edges[id]!;
    w.edge = id;
    w.fwd = e.a === w.corner;
    w.cameFrom = id;
    if (e.kind === 'cross') {
      // Walk to a spot at the kerb and wait for the walk signal.
      const [ax, az, bx, bz] = this.edgeLine(e, w.fwd, w.lat * 0.7);
      const dx = (bx - ax) / e.length;
      const dz = (bz - az) / e.length;
      const back = 0.05 + this.rng() * 0.45;
      const side = (this.rng() - 0.5) * 0.5;
      this.setSegment(w, w.ix, w.iz, ax - dx * back - dz * side, az - dz * back + dx * side);
      w.state = 'toWait';
      this.tryCross(w, t, true);
      return;
    }
    const [x0, z0, x1, z1] = this.edgeLine(e, w.fwd, w.lat);
    this.setSegment(w, w.ix, w.iz, x1, z1);
    w.state = 'side';
    w.corner = w.fwd ? e.b : e.a;
    w.stopAt = -1;
    w.door = null;
    if (e.doors.length && this.rng() < 0.22) {
      const d = e.doors[Math.floor(this.rng() * e.doors.length)]!;
      const along = w.fwd ? d.s : e.length - d.s;
      if (along > 1) {
        const f = along / e.length;
        this.setSegment(w, w.ix, w.iz, x0 + (x1 - x0) * f, z0 + (z1 - z0) * f);
        w.door = d.door;
      }
    }
  }

  private tryCross(w: Walker, t: number, onlyIfAtKerb = false) {
    const e = this.edges[w.edge]!;
    if (onlyIfAtKerb && w.s < w.len - 0.05) return false;
    const cw = this.net.crosswalks[e.cw]!;
    const sig = walkSignal(t);
    // Walking along x crosses a north-south road: that is safe while east-west traffic has green.
    const ok = (cw.walkAxis === 'x' ? sig.ew : sig.ns) === 'walk' && this.carsOnCrosswalk[e.cw] === 0;
    if (!ok) return false;
    this.pedsOnCrosswalk[e.cw]!++;
    const [, , bx, bz] = this.edgeLine(e, w.fwd, Math.min(w.lat, CROSSWALK_HALF_WIDTH) * 0.7);
    this.setSegment(w, w.ix, w.iz, bx, bz);
    w.state = 'cross';
    w.corner = w.fwd ? e.b : e.a;
    return true;
  }

  step(dt: number, t: number) {
    this.sense();
    for (const w of this.walkers) this.stepWalker(w, dt, t);
    for (const c of this.companions) this.stepCompanion(c, dt);
    for (const r of this.roof) this.stepRoof(r, dt);
  }

  /**
   * Who is near whom on the pavement, from a coarse grid: someone ahead going the same way caps our speed to theirs,
   * someone coming towards us makes us step a little to our right (as people do), so nobody walks through anyone.
   */
  private sense() {
    const cells = new Map<number, Walker[]>();
    const key = (x: number, z: number) => Math.floor(x / GRID) * 100003 + Math.floor(z / GRID);
    const on = (w: Walker) => w.state === 'side' || w.state === 'fromDoor';
    for (const w of this.walkers) {
      w.cap = Infinity;
      w.nudgeTo = 0;
      if (!on(w)) continue;
      const k = key(w.pose.x, w.pose.z);
      const list = cells.get(k);
      if (list) list.push(w);
      else cells.set(k, [w]);
    }
    for (const w of this.walkers) if (on(w)) this.notice(w, cells, key);
  }

  private notice(w: Walker, cells: Map<number, Walker[]>, key: (x: number, z: number) => number) {
    const p = w.pose;
    const hx = Math.cos(p.yaw);
    const hz = -Math.sin(p.yaw);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const o of cells.get(key(p.x + dx * GRID, p.z + dz * GRID)) ?? []) {
          if (o === w) continue;
          const rx = o.pose.x - p.x;
          const rz = o.pose.z - p.z;
          const ahead = rx * hx + rz * hz;
          const side = Math.abs(rx * -hz + rz * hx);
          if (ahead < 0.05 || ahead > PERSONAL || side > 0.45) continue;
          const together = Math.cos(o.pose.yaw - p.yaw) > 0;
          if (together) w.cap = Math.min(w.cap, Math.max(0.2, o.v - 0.05));
          else w.nudgeTo = NUDGE;
        }
  }

  /** Companions stay beside their leader, copy its pace and wait where it waits. */
  private stepCompanion(c: Companion, dt: number) {
    const p = c.pose;
    const l = c.leader.pose;
    // Away from the road: the pavement side of the leader's heading.
    const want = this.awaySide(c.leader) * c.side;
    c.off = c.off === null ? want : c.off + (want - c.off) * Math.min(1, dt * 3);
    p.x = l.x + Math.sin(l.yaw) * c.off - Math.cos(l.yaw) * c.back;
    p.z = l.z + Math.cos(l.yaw) * c.off + Math.sin(l.yaw) * c.back;
    p.yaw = l.yaw;
    p.phase = l.phase + c.stride;
    p.dist = l.dist + c.stride;
    p.gait = l.gait;
    p.mode = l.mode;
    p.y = l.y;
    // Shown only while the leader is (people go through a door together).
    p.scale = l.scale === 0 ? 0 : c.size;
  }

  /** +1 when the pavement's outer side is to the leader's right, −1 when to the left. */
  private awaySide(w: Walker): number {
    const e = this.edges[w.edge]!;
    if (e.kind !== 'side') return 1;
    const A = this.corners[e.a]!;
    const B = this.corners[e.b]!;
    const q = e.a % 4;
    const sx = [1, -1, -1, 1][q]!;
    const sz = [1, 1, -1, -1][q]!;
    const alongX = Math.abs(A.z - B.z) < 0.01;
    const outX = alongX ? 0 : sx;
    const outZ = alongX ? sz : 0;
    return outX * Math.sin(w.pose.yaw) + outZ * Math.cos(w.pose.yaw) >= 0 ? 1 : -1;
  }

  private stepWalker(w: Walker, dt: number, t: number) {
    const p = w.pose;
    p.x = w.ix;
    p.z = w.iz;
    this.advanceWalker(w, dt, t);
    w.ix = p.x;
    w.iz = p.z;
    this.shown(w, dt);
  }

  /** The pose shows the walking line smoothed (corners are rounded) and shifted aside when passing someone. */
  private shown(w: Walker, dt: number) {
    const p = w.pose;
    const k = 1 - Math.exp(-SMOOTH * dt);
    w.nudge += (w.nudgeTo - w.nudge) * Math.min(1, dt * 3);
    const tx = w.ix + Math.sin(p.yaw) * w.nudge;
    const tz = w.iz + Math.cos(p.yaw) * w.nudge;
    // Doors and teleports show at once.
    const jump = p.scale === 0 || Math.hypot(tx - w.sx, tz - w.sz) > 1.5;
    w.sx = jump ? tx : w.sx + (tx - w.sx) * k;
    w.sz = jump ? tz : w.sz + (tz - w.sz) * k;
    p.x = w.sx;
    p.z = w.sz;
  }

  /** Ease a walker's heading towards its path, turning no faster than a person can. */
  private turnToward(p: PersonPose, want: number, dt: number) {
    const d = Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw));
    const step = d * Math.min(1, dt * 8);
    p.yaw += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, step));
  }

  /** Now and then a walker on a pavement stops to look at a phone or a shop window. */
  private lookAround(w: Walker, dt: number, target: number): number {
    if (w.pause > 0) {
      w.pause -= dt;
      return 0;
    }
    const midway = w.s > 1 && w.len - w.s > 1.5 && !w.door;
    if (midway && w.v > 0.5 && this.rng() < LOOK_RATE * dt) w.pause = range(this.rng, 2, 5);
    return target;
  }

  private advanceWalker(w: Walker, dt: number, t: number) {
    const p = w.pose;
    let target = Math.min(w.v0, w.cap);
    if (w.state === 'side') target = this.lookAround(w, dt, target);
    if (w.state === 'wait') {
      if (!this.tryCross(w, t)) target = 0;
    }
    if (w.state === 'inside') {
      w.timer -= dt;
      p.scale = 0;
      if (w.timer <= 0) {
        const d = w.door!;
        const e = this.edges[w.edge]!;
        w.fwd = this.rng() < 0.5;
        const [x0, z0, x1, z1] = this.edgeLine(e, w.fwd, w.lat);
        // Back to the walking line, level with the door.
        const lx = x1 - x0;
        const lz = z1 - z0;
        const f = Math.max(0, Math.min(1, ((d.x - x0) * lx + (d.z - z0) * lz) / Math.max(1e-9, lx * lx + lz * lz)));
        p.x = d.x;
        p.z = d.z;
        p.scale = w.height;
        this.setSegment(w, d.x, d.z, x0 + (x1 - x0) * f, z0 + (z1 - z0) * f);
        w.corner = w.fwd ? e.b : e.a;
        w.state = 'fromDoor';
        p.yaw = Math.atan2(-d.nz, d.nx);
      }
      return;
    }
    if (w.state === 'cross') target = Math.max(w.v0, CROSS_SPEED);
    // Ease towards the target pace; slow down to stop on a waiting spot.
    const remaining = w.len - w.s;
    if (w.state === 'toWait' || w.state === 'toDoor') target = Math.min(target, Math.max(0.25, remaining * 2));
    w.v += Math.max(-3 * dt, Math.min(1.6 * dt, target - w.v));
    if (w.state === 'wait') w.v = Math.min(w.v, 0);
    const ds = Math.min(w.v * dt, remaining);
    w.s += ds;
    const f = w.len > 0 ? w.s / w.len : 1;
    p.x = w.x0 + (w.x1 - w.x0) * f;
    p.z = w.z0 + (w.z1 - w.z0) * f;
    p.phase += (ds / (STRIDE * p.scale)) * Math.PI * 2;
    p.dist += ds;
    p.gait += (Math.min(1, w.v / 0.9) - p.gait) * Math.min(1, dt * 6);
    p.mode = w.state === 'wait' ? MODE.wait : MODE.walk;
    if (w.len > 0.02 && w.state !== 'wait') {
      this.turnToward(p, Math.atan2(-(w.z1 - w.z0), w.x1 - w.x0), dt);
    }
    if (w.s < w.len - 1e-4) return;
    // Arrived at the end of the segment.
    switch (w.state) {
      case 'side':
        if (w.door) {
          const d = w.door;
          this.setSegment(w, p.x, p.z, d.x - d.nx * 0.25, d.z - d.nz * 0.25);
          w.state = 'toDoor';
        } else this.chooseNextAtCorner(w, t);
        break;
      case 'fromDoor': {
        const e = this.edges[w.edge]!;
        const [, , x1, z1] = this.edgeLine(e, w.fwd, w.lat);
        this.setSegment(w, p.x, p.z, x1, z1);
        w.state = 'side';
        w.door = null;
        break;
      }
      case 'toDoor':
        w.state = 'inside';
        w.timer = range(this.rng, 6, 28);
        p.gait = 0;
        break;
      case 'toWait':
        w.state = 'wait';
        if (this.tryCross(w, t)) break;
        w.v = 0;
        break;
      case 'cross': {
        const e = this.edges[w.edge]!;
        this.pedsOnCrosswalk[e.cw]!--;
        this.chooseNextAtCorner(w, t);
        break;
      }
      default:
        break;
    }
  }

  private stepRoof(r: RoofWorker, dt: number) {
    const p = r.pose;
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    if (r.pause > 0) {
      r.pause -= dt;
      p.gait += (0 - p.gait) * Math.min(1, dt * 6);
      p.mode = MODE.talk;
      return;
    }
    const v = 0.7;
    r.s += (r.dir * v * dt) / len;
    p.phase += ((v * dt) / (STRIDE * p.scale)) * Math.PI * 2;
    p.dist += v * dt;
    if (r.s >= 1 || r.s <= 0) {
      r.s = Math.max(0, Math.min(1, r.s));
      r.dir = r.dir === 1 ? -1 : 1;
      r.pause = range(this.rng, 3, 9);
    }
    p.x = r.x0 + (r.x1 - r.x0) * r.s;
    p.z = r.z0 + (r.z1 - r.z0) * r.s;
    p.mode = MODE.walk;
    p.gait += (1 - p.gait) * Math.min(1, dt * 6);
    const want = Math.atan2(-(r.z1 - r.z0) * r.dir, (r.x1 - r.x0) * r.dir);
    let d = want - p.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    p.yaw += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, d));
  }

  /** Walking groups: each companion with the walker it came with (for tests). */
  groups(): { leader: PersonPose; member: PersonPose }[] {
    return this.companions.map(c => ({ leader: c.leader.pose, member: c.pose }));
  }

  /** Pedestrians currently on a crosswalk (between the kerbs), for tests. */
  crossing(): { id: number; cw: number; x: number; z: number }[] {
    return this.walkers
      .filter(w => w.state === 'cross')
      .map(w => ({ id: w.id, cw: this.edges[w.edge]!.cw, x: w.pose.x, z: w.pose.z }));
  }

  /** Where each walker is in its routine (for tests). */
  states(): WalkerState[] {
    return this.walkers.map(w => w.state);
  }
}
