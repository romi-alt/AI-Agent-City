'use client';
import { useCallback } from 'react';
import { useCityContext } from '../context.tsx';
import type { CityStore } from '../store.ts';
import type { CityLayout, CityMode } from '../types.ts';
import { type NavAction, reduceMode, sameMode } from './modes.ts';

/** Navigation requests, plus choosing an agent (kept in `store.selectedAgent`, beside the mode). */
export type Nav = NavAction | { type: 'select-agent'; id: string | null; desk?: number | null };

/**
 * Apply a navigation request to a store, following the rules in modes.ts. Back clears a selected agent before it
 * leaves the floor; moving to another floor or building, or home, clears it. Returns true when anything changed.
 */
export function navigate(store: CityStore, layout: CityLayout, action: Nav): boolean {
  const s = store.get();
  if (action.type === 'select-agent') {
    const desk = action.desk === undefined ? null : action.desk;
    const mode: CityMode = s.mode.kind === 'office' ? { ...s.mode, desk: action.id === null ? null : desk } : s.mode;
    if (s.selectedAgent === action.id && sameMode(mode, s.mode)) return false;
    store.set({ selectedAgent: action.id, mode });
    return true;
  }
  if (action.type === 'back' && s.selectedAgent && (s.mode.kind === 'floor' || s.mode.kind === 'office')) {
    store.set({ selectedAgent: null, mode: s.mode.kind === 'office' ? { ...s.mode, desk: null } : s.mode });
    return true;
  }
  const before = s.mode;
  const next = reduceMode(before, action, { layout, enterable: s.enterable, highlight: s.highlight });
  if (next === before) return false;
  const samePlace =
    'building' in next &&
    'building' in before &&
    next.building === before.building &&
    'level' in next &&
    'level' in before &&
    next.level === before.level;
  store.set(samePlace ? { mode: next } : { mode: next, selectedAgent: null });
  return true;
}

/** `nav(action)` for components inside the city context (HUD, interior, rig). */
export function useNav(): (action: Nav) => boolean {
  const { store, layout } = useCityContext();
  return useCallback((action: Nav) => navigate(store, layout, action), [store, layout]);
}
