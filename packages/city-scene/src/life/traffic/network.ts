import type { CityLayout } from '../../types.ts';
import { CROSSWALK_AT, LANE, STOP_FRONT } from '../geometry.ts';

/**
 * The lane graph of the street grid. Roads along x sit at `roadsZ`, roads along z at `roadsX`; each road has one
 * lane per direction, driving on the right. A lane is cut into straight **links** between junction boxes, and every
 * junction has 12 **connectors** (4 approaches × straight/right/left) drawn as quadratic Béziers inside the box.
 *
 * Headings: 0 = +x (east), 1 = +z (south), 2 = −x (west), 3 = −z (north). A right turn is heading + 1.
 * Legs and crosswalks use the same numbering: leg h is the arm of the junction in direction h.
 */
export const HEADINGS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
export type Move = 'straight' | 'right' | 'left';
export const MOVES: readonly Move[] = ['straight', 'right', 'left'];
const TURN: Record<Move, number> = { straight: 0, right: 1, left: 3 };

export interface Pose {
  x: number;
  z: number;
  /** Yaw about +y so that a model facing +x points along the travel direction. */
  yaw: number;
}

export interface Link {
  kind: 'link';
  id: number;
  heading: number;
  /** Fixed coordinate of the lane (z for x-roads, x for z-roads). */
  lane: number;
  /** Coordinate along the travel axis where the link starts. */
  start: number;
  length: number;
  /** Junction at the end (−1: the road leaves the city here). */
  toJ: number;
  /** Junction at the start (−1: the road enters the city here). */
  fromJ: number;
  /** Connectors leaving this link, indexed like MOVES (empty for an exit link). */
  out: number[];
}

export interface Connector {
  kind: 'conn';
  id: number;
  junction: number;
  /** Index 0..11 inside the junction: heading * 3 + move. */
  local: number;
  heading: number;
  move: Move;
  from: number;
  to: number;
  p0: [number, number];
  c: [number, number];
  p2: [number, number];
  length: number;
  /** Arc-length table: cumulative length at t = i / (samples − 1). */
  table: number[];
  /** Crosswalks this movement passes: the approach leg's and the exit leg's. */
  crosswalks: [number, number];
}

export type Piece = Link | Connector;

export interface Junction {
  id: number;
  x: number;
  z: number;
}

export interface Crosswalk {
  id: number;
  junction: number;
  leg: number;
  /** Centre of the stripe. */
  x: number;
  z: number;
  /** Pedestrians on it walk along this axis: along z for the east/west legs, along x for north/south. */
  walkAxis: 'x' | 'z';
}

export interface Network {
  junctions: Junction[];
  links: Link[];
  conns: Connector[];
  /** pieces[id] for links (0..L−1) and connectors (L..). */
  pieces: Piece[];
  crosswalks: Crosswalk[];
  /** Links that enter the city at its edge (where vehicles appear). */
  sources: number[];
  /** conflicts[a][b]: connectors with local indices a and b may not be used at once. */
  conflicts: boolean[][];
  extent: number;
}

const SAMPLES = 24;

function bezier(p0: [number, number], c: [number, number], p2: [number, number], t: number): [number, number] {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]];
}

function headingYaw(h: number) {
  return [0, -Math.PI / 2, Math.PI, Math.PI / 2][h]!;
}

/** Turn geometry for a junction at the origin. */
function connectorShape(heading: number, move: Move) {
  const [hx, hz] = HEADINGS[heading]!;
  const out = (heading + TURN[move]) % 4;
  const [ox, oz] = HEADINGS[out]!;
  const right = (h: number) => HEADINGS[(h + 1) % 4]!;
  const [rx, rz] = right(heading);
  const [qx, qz] = right(out);
  const p0: [number, number] = [-hx * STOP_FRONT + rx * LANE, -hz * STOP_FRONT + rz * LANE];
  const p2: [number, number] = [ox * STOP_FRONT + qx * LANE, oz * STOP_FRONT + qz * LANE];
  const c: [number, number] =
    move === 'straight' ? [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2] : hx !== 0 ? [p2[0], p0[1]] : [p0[0], p2[1]];
  return { p0, c, p2, out };
}

function sampled(p0: [number, number], c: [number, number], p2: [number, number]) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) pts.push(bezier(p0, c, p2, i / 40));
  return pts;
}

/** Two movements conflict when their paths come closer than a car's width plus a margin. */
export const CONFLICT_DISTANCE = 1.7;

function conflictTable(): boolean[][] {
  const shapes = Array.from({ length: 12 }, (_, i) => connectorShape(Math.floor(i / 3), MOVES[i % 3]!));
  const pts = shapes.map(s => sampled(s.p0, s.c, s.p2));
  return shapes.map((_, a) =>
    shapes.map((__, b) => {
      if (a === b) return false;
      for (const p of pts[a]!)
        for (const q of pts[b]!) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < CONFLICT_DISTANCE) return true;
      return false;
    }),
  );
}

export function buildNetwork(streets: CityLayout['streets']): Network {
  const roadsX = [...streets.roadsX].sort((a, b) => a - b);
  const roadsZ = [...streets.roadsZ].sort((a, b) => a - b);
  const extent = streets.extent;
  const nx = roadsX.length;
  const jid = (i: number, j: number) => j * nx + i;
  const junctions: Junction[] = [];
  for (let j = 0; j < roadsZ.length; j++)
    for (let i = 0; i < nx; i++) junctions.push({ id: jid(i, j), x: roadsX[i]!, z: roadsZ[j]! });

  const links: Link[] = [];
  /** incoming[junction][heading] / outgoing[junction][heading] → link id */
  const incoming = junctions.map(() => [-1, -1, -1, -1]);
  const outgoing = junctions.map(() => [-1, -1, -1, -1]);
  const sources: number[] = [];

  const addLane = (heading: number, laneAt: number, stops: { at: number; j: number }[]) => {
    // stops are junction centres along the travel axis, in travel order.
    const dir = heading === 0 || heading === 1 ? 1 : -1;
    let from = -dir * extent;
    let fromJ = -1;
    for (let k = 0; k <= stops.length; k++) {
      const stop = stops[k];
      const end = stop ? stop.at - dir * STOP_FRONT : dir * extent;
      const link: Link = {
        kind: 'link',
        id: links.length,
        heading,
        lane: laneAt,
        start: from,
        length: Math.abs(end - from),
        toJ: stop ? stop.j : -1,
        fromJ,
        out: [],
      };
      links.push(link);
      if (fromJ < 0) sources.push(link.id);
      else outgoing[fromJ]![heading] = link.id;
      if (stop) incoming[stop.j]![heading] = link.id;
      if (stop) {
        from = stop.at + dir * STOP_FRONT;
        fromJ = stop.j;
      }
    }
  };
  for (let j = 0; j < roadsZ.length; j++) {
    const z = roadsZ[j]!;
    const east = roadsX.map((x, i) => ({ at: x, j: jid(i, j) }));
    addLane(0, z + LANE, east);
    addLane(2, z - LANE, [...east].reverse());
  }
  for (let i = 0; i < nx; i++) {
    const x = roadsX[i]!;
    const south = roadsZ.map((z, j) => ({ at: z, j: jid(i, j) }));
    addLane(1, x - LANE, south);
    addLane(3, x + LANE, [...south].reverse());
  }

  const conns: Connector[] = [];
  for (const J of junctions) {
    for (let h = 0; h < 4; h++) {
      const from = incoming[J.id]![h]!;
      for (let m = 0; m < 3; m++) {
        const move = MOVES[m]!;
        const s = connectorShape(h, move);
        const to = outgoing[J.id]![s.out]!;
        const p0: [number, number] = [J.x + s.p0[0], J.z + s.p0[1]];
        const c: [number, number] = [J.x + s.c[0], J.z + s.c[1]];
        const p2: [number, number] = [J.x + s.p2[0], J.z + s.p2[1]];
        const table = [0];
        let prev = p0;
        for (let i = 1; i < SAMPLES; i++) {
          const p = bezier(p0, c, p2, i / (SAMPLES - 1));
          table.push(table[i - 1]! + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
          prev = p;
        }
        const conn: Connector = {
          kind: 'conn',
          id: -1,
          junction: J.id,
          local: h * 3 + m,
          heading: h,
          move,
          from,
          to,
          p0,
          c,
          p2,
          length: table[SAMPLES - 1]!,
          table,
          crosswalks: [J.id * 4 + ((h + 2) % 4), J.id * 4 + s.out],
        };
        conns.push(conn);
      }
    }
  }
  const pieces: Piece[] = [...links];
  for (const c of conns) {
    c.id = pieces.length;
    pieces.push(c);
    links[c.from]!.out.push(c.id);
  }
  const crosswalks: Crosswalk[] = [];
  for (const J of junctions)
    for (let leg = 0; leg < 4; leg++) {
      const [hx, hz] = HEADINGS[leg]!;
      crosswalks.push({
        id: J.id * 4 + leg,
        junction: J.id,
        leg,
        x: J.x + hx * CROSSWALK_AT,
        z: J.z + hz * CROSSWALK_AT,
        walkAxis: leg % 2 === 0 ? 'z' : 'x',
      });
    }
  return { junctions, links, conns, pieces, crosswalks, sources, conflicts: conflictTable(), extent };
}

/** Position and heading at distance `s` along a piece. */
export function poseAt(p: Piece, s: number, out: Pose): Pose {
  if (p.kind === 'link') {
    const [hx, hz] = HEADINGS[p.heading]!;
    const along = p.start + (hx + hz) * s;
    if (hx !== 0) {
      out.x = along;
      out.z = p.lane;
    } else {
      out.x = p.lane;
      out.z = along;
    }
    out.yaw = headingYaw(p.heading);
    return out;
  }
  const d = Math.max(0, Math.min(p.length, s));
  const tb = p.table;
  let i = 1;
  while (i < tb.length - 1 && tb[i]! < d) i++;
  const a = tb[i - 1]!;
  const b = tb[i]!;
  const t = (i - 1 + (b > a ? (d - a) / (b - a) : 0)) / (tb.length - 1);
  const [x, z] = bezier(p.p0, p.c, p.p2, t);
  const u = 1 - t;
  const dx = 2 * u * (p.c[0] - p.p0[0]) + 2 * t * (p.p2[0] - p.c[0]);
  const dz = 2 * u * (p.c[1] - p.p0[1]) + 2 * t * (p.p2[1] - p.c[1]);
  out.x = x;
  out.z = z;
  out.yaw = Math.atan2(-dz, dx);
  return out;
}
