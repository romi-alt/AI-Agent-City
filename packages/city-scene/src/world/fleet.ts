/**
 * What moves on and over the rivers, as plain data: the bridges (where, how wide, which kind), the boats that sail
 * up and down each river and the cars that cross the bridges. Pure and seeded; the renderer only draws these poses.
 */
import { RIVERS, type River, riverSlope, riverX } from './waterfront.ts';

export type BridgeKind = 'plain' | 'cable' | 'arch';

export interface Bridge {
  river: 'west' | 'east';
  /** World z of the crossing: always a cross street, so the deck lines up with the grid. */
  z: number;
  kind: BridgeKind;
  /** Deck width (along z). */
  wide: number;
}

/** Crossings at cross streets (z is 10 mod 20): a cable-stayed bridge and a plain one east, an arch and a plain west. */
export const BRIDGES: readonly Bridge[] = [
  { river: 'east', z: -50, kind: 'cable', wide: 12 },
  { river: 'east', z: 210, kind: 'plain', wide: 9 },
  { river: 'west', z: 130, kind: 'arch', wide: 12 },
  { river: 'west', z: -310, kind: 'plain', wide: 9 },
];

/** Height of a bridge deck above the street. */
export const DECK_Y = 2.6;

export function riverOf(name: Bridge['river']): River {
  return RIVERS.find(r => r.name === name)!;
}

/** The span of a bridge in x (bank to bank, with a landing on each side). */
export function bridgeSpan(b: Bridge): [number, number] {
  const r = riverOf(b.river);
  const cx = riverX(r, b.z);
  return [cx - r.half - 6, cx + r.half + 6];
}

export type BoatKind = 'speed' | 'yacht' | 'ferry' | 'tug';

export interface Boat {
  kind: BoatKind;
  river: 'west' | 'east';
  /** +1 sails toward +z, -1 toward -z. */
  dir: 1 | -1;
  /** Offset from the river's centre line (each direction keeps to its own side). */
  lane: number;
  speed: number;
  /** Where it starts along the river, 0..1 of the sailing range. */
  phase: number;
  length: number;
}

export const SAIL_RANGE = 900;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LENGTH: Record<BoatKind, number> = { speed: 5, yacht: 12, ferry: 22, tug: 11 };

/** The fleet: speedboats, yachts, commuter ferries and tugboats, split across both rivers. */
export function planBoats(count: number, seed = 91): Boat[] {
  const r = mulberry(seed);
  const kinds: BoatKind[] = ['ferry', 'tug', 'speed', 'yacht', 'ferry', 'speed', 'tug', 'yacht'];
  const out: Boat[] = [];
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length]!;
    const river = i % 3 === 2 ? 'east' : 'west';
    const half = riverOf(river).half;
    const dir = i % 2 ? 1 : -1;
    out.push({
      kind,
      river,
      dir,
      lane: dir * (half * (0.18 + 0.4 * r())),
      speed: kind === 'speed' ? 13 + 5 * r() : kind === 'ferry' ? 7 + 2 * r() : 4.5 + 2 * r(),
      phase: r(),
      length: LENGTH[kind],
    });
  }
  return out;
}

export interface Pose {
  x: number;
  z: number;
  /** Rotation about y so local +x points along the sailing direction. */
  yaw: number;
}

/** A boat's pose after `t` seconds: it sails along its river and wraps round the far end of the range. */
export function boatPose(b: Boat, t: number): Pose {
  const r = riverOf(b.river);
  const s = (((b.phase * SAIL_RANGE * 2 + b.speed * t) % (SAIL_RANGE * 2)) + SAIL_RANGE * 2) % (SAIL_RANGE * 2);
  const z = b.dir === 1 ? -SAIL_RANGE + s : SAIL_RANGE - s;
  const slope = riverSlope(r, z);
  const x = riverX(r, z) + b.lane;
  // Heading along the centre line: direction (slope, 1) * dir in (x, z); yaw maps local +x there.
  const hx = slope * b.dir;
  const hz = b.dir;
  return { x, z, yaw: Math.atan2(-hz, hx) };
}

export interface BridgeCar {
  bridge: number;
  lane: -1 | 1;
  speed: number;
  phase: number;
  taxi: boolean;
}

/** Cars crossing each bridge; most are yellow cabs. */
export function planBridgeCars(perBridge: number, seed = 17): BridgeCar[] {
  const r = mulberry(seed);
  const out: BridgeCar[] = [];
  BRIDGES.forEach((_, bridge) => {
    for (let i = 0; i < perBridge; i++)
      out.push({ bridge, lane: i % 2 ? 1 : -1, speed: 9 + 4 * r(), phase: r(), taxi: r() < 0.6 });
  });
  return out;
}

/** A bridge car's position (x along the span, z in its lane) after `t` seconds. */
export function bridgeCarPose(c: BridgeCar, t: number): { x: number; z: number; yaw: number } {
  const b = BRIDGES[c.bridge]!;
  const [x0, x1] = bridgeSpan(b);
  const len = x1 - x0;
  const s = (((c.phase * len + c.speed * t) % len) + len) % len;
  // Lane -1 heads east (+x), lane 1 heads west; the lane sits a quarter deck from the centre line.
  const x = c.lane === -1 ? x0 + s : x1 - s;
  return { x, z: b.z + c.lane * (b.wide / 4), yaw: c.lane === -1 ? 0 : Math.PI };
}
