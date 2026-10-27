import { useSyncExternalStore } from 'react';
import type { CityState } from './types.ts';

/**
 * One small store per city instance (no extra dependency). Components read slices with useCity(selector); anything
 * may update with city.set(patch). The camera workstream owns `mode` transitions; the quality manager owns `quality`
 * unless the user overrides it.
 */
export interface CityStore {
  get(): CityState;
  set(patch: Partial<CityState> | ((s: CityState) => Partial<CityState>)): void;
  subscribe(fn: () => void): () => void;
}

export const DEFAULT_STATE: CityState = {
  mode: { kind: 'explore' },
  quality: 'balanced',
  qualityAuto: true,
  timeOfDay: 'day',
  weather: 'partly-cloudy',
  reducedMotion: false,
  paused: false,
  hovered: null,
  enterable: [],
  highlight: null,
};

export function createCityStore(initial: Partial<CityState> = {}): CityStore {
  let state: CityState = { ...DEFAULT_STATE, ...initial };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      for (const l of listeners) l();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function useCityState<T>(store: CityStore, select: (s: CityState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  );
}
