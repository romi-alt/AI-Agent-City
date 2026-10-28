import type { CityStore } from '../store.ts';

/**
 * Commands from the HUD (DOM) to the camera rig (inside the canvas), and signals back. One bus per city store, so
 * two scenes on a page never talk to each other; no module-level state is shared between them.
 */
export type CameraCommand =
  | { type: 'zoom'; dir: 1 | -1 }
  | { type: 'rotate'; dir: 1 | -1 }
  | { type: 'pan'; right: number; forward: number }
  | { type: 'reset' }
  | { type: 'skip' };

export type SceneEvent =
  | CameraCommand
  /** Screen space covered by HUD panels (px), so framings centre in the visible part of the view. */
  | { type: 'insets'; right: number; bottom: number; top?: number }
  /** A floor the visitor is pointing at in the floor list (highlighted on the building), or null. */
  | { type: 'floor-preview'; level: number | null }
  /** The scene has drawn its first frames. */
  | { type: 'ready' }
  /** Arrival progress 0..1. */
  | { type: 'arrival-progress'; value: number };

export interface SceneBus {
  emit(e: SceneEvent): void;
  on(fn: (e: SceneEvent) => void): () => void;
  /** Last event of each type, for late subscribers (e.g. insets measured before the rig mounted). */
  last<T extends SceneEvent['type']>(type: T): Extract<SceneEvent, { type: T }> | undefined;
}

const buses = new WeakMap<CityStore, SceneBus>();

export function sceneBus(store: CityStore): SceneBus {
  let bus = buses.get(store);
  if (!bus) {
    const fns = new Set<(e: SceneEvent) => void>();
    const latest = new Map<string, SceneEvent>();
    bus = {
      emit(e) {
        latest.set(e.type, e);
        for (const fn of [...fns]) fn(e);
      },
      on(fn) {
        fns.add(fn);
        return () => fns.delete(fn);
      },
      last(type) {
        return latest.get(type) as never;
      },
    };
    buses.set(store, bus);
  }
  return bus;
}
