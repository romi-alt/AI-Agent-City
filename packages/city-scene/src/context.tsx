'use client';
import { createContext, useContext } from 'react';
import type { CityStore } from './store.ts';
import { useCityState } from './store.ts';
import type { CityLayout, CityState } from './types.ts';

export interface CityContextValue {
  store: CityStore;
  layout: CityLayout;
  /** Called by the scene when the user asks to go somewhere the host app must handle (e.g. open the demo office). */
  onNavigate?: (target: { kind: 'office'; building: string; level: number }) => void;
  /** Overrides the overview camera (e.g. the landing page's framed hero). Defaults to the whole-city overview. */
  homePose?: { pos: [number, number, number]; target: [number, number, number] };
}

export const CityContext = createContext<CityContextValue | null>(null);

export function useCityContext(): CityContextValue {
  const v = useContext(CityContext);
  if (!v) throw new Error('City components must be rendered inside <CityScene>.');
  return v;
}

/** Read a slice of the city state from inside the scene or its overlay. */
export function useCity<T>(select: (s: CityState) => T): T {
  return useCityState(useCityContext().store, select);
}
