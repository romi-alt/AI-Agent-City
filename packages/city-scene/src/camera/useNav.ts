'use client';
import { useCallback } from 'react';
import { useCityContext } from '../context.tsx';
import type { CityStore } from '../store.ts';
import type { CityLayout } from '../types.ts';
import { type NavAction, reduceMode } from './modes.ts';

/** Apply a navigation request to a store, following the rules in modes.ts. Returns true when the mode changed. */
export function navigate(store: CityStore, layout: CityLayout, action: NavAction): boolean {
  const before = store.get().mode;
  const s = store.get();
  const next = reduceMode(before, action, { layout, enterable: s.enterable, highlight: s.highlight });
  if (next === before) return false;
  store.set({ mode: next });
  return true;
}

/** `nav(action)` for components inside the city context (HUD, interior, rig). */
export function useNav(): (action: NavAction) => boolean {
  const { store, layout } = useCityContext();
  return useCallback((action: NavAction) => navigate(store, layout, action), [store, layout]);
}
