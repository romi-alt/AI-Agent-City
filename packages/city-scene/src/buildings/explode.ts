/**
 * Exploded floors — the contract between A1 (buildings) and A3 (interior, camera, labels). X02.
 *
 *   floorOffset(buildingKey, level, t): number
 *     Extra height (world units) of floor `level` (1-based, as in city-layout.json) of `buildingKey` when the
 *     building is exploded by `t` (0 = closed, 1 = fully open; eased inside). Lobby/podium levels return 0.
 *     The roof, crown and spire move with the top floor: use `level = floors.length`.
 *     Floor L's slab therefore sits at  BUILDING_BASE_Y + (L - 1) * FLOOR_HEIGHT + floorOffset(key, L, t).
 *
 *   useFloorOffset(): (buildingKey, level) => number
 *     The same, at the building's live (animated) explode progress. Call the returned function inside useFrame.
 *
 *   useExplodeProgress(): (buildingKey) => number   live t in 0..1 (before easing).
 *
 *   EXPLODE_GAP: gap added between consecutive exploded floors; EXPLODE_SECONDS: open/close duration.
 *
 * A1 animates t toward 1 for the building in `mode` (kind 'building' or 'floor') while `store.explode` is true,
 * and back toward 0 otherwise, frame-rate independently. Pure parts are in this file; the hooks read a small
 * per-city runtime updated by <Buildings>.
 */
import { useCityContext } from '../context.tsx';
import layoutJson from '../data/city-layout.json';
import type { CityStore } from '../store.ts';
import type { BuildingKind, CityLayout } from '../types.ts';

export const EXPLODE_GAP = 1.15;
export const EXPLODE_SECONDS = 0.8;

const LAYOUT = layoutJson as CityLayout;

/** Floors that stay on the ground when the building explodes (lobby, showroom or podium). */
export function lobbyLevels(kind: BuildingKind): number {
  return kind === 'training' ? 3 : kind === 'dealership' ? 2 : 1;
}

const KIND = new Map(LAYOUT.buildings.map(b => [b.key, b.kind] as const));

/** Ease in-out (smootherstep), so floors start and settle gently. */
export function easeExplode(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function floorOffset(buildingKey: string, level: number, t: number): number {
  const kind = KIND.get(buildingKey);
  if (!kind || t <= 0) return 0;
  const lobby = lobbyLevels(kind);
  return level <= lobby ? 0 : (level - lobby) * EXPLODE_GAP * easeExplode(t);
}

/** Advances a building's explode progress toward its target by dt seconds (frame-rate independent, linear). */
export function stepExplode(t: number, open: boolean, dt: number): number {
  const step = dt / EXPLODE_SECONDS;
  return open ? Math.min(1, t + step) : Math.max(0, t - step);
}

export interface ExplodeRuntime {
  /** Raw progress per building key (missing = 0). */
  progress: Map<string, number>;
}

const runtimes = new WeakMap<CityStore, ExplodeRuntime>();

export function explodeRuntime(store: CityStore): ExplodeRuntime {
  let rt = runtimes.get(store);
  if (!rt) runtimes.set(store, (rt = { progress: new Map() }));
  return rt;
}

export function useExplodeProgress(): (buildingKey: string) => number {
  const rt = explodeRuntime(useCityContext().store);
  return key => rt.progress.get(key) ?? 0;
}

export function useFloorOffset(): (buildingKey: string, level: number) => number {
  const rt = explodeRuntime(useCityContext().store);
  return (key, level) => floorOffset(key, level, rt.progress.get(key) ?? 0);
}
