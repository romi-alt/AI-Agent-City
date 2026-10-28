import type { CityLayout, CityMode, LayoutBuilding, LayoutFloor } from '../types.ts';

/** What the visitor asked for. The camera rig and the HUD both go through `reduceMode`, so the rules live here. */
export type NavAction =
  | { type: 'select-building'; building: string }
  | { type: 'select-floor'; level: number; building?: string }
  | { type: 'enter-office' }
  | { type: 'select-desk'; desk: number | null }
  | { type: 'back' }
  | { type: 'home' }
  | { type: 'arrival-done' };

export interface NavContext {
  layout: CityLayout;
  enterable: string[];
  highlight: string | null;
}

export function findBuilding(layout: CityLayout, key: string | null | undefined): LayoutBuilding | null {
  return (key && layout.buildings.find(b => b.key === key)) || null;
}
export function findFloor(layout: CityLayout, key: string, level: number): LayoutFloor | null {
  return findBuilding(layout, key)?.floors.find(f => f.level === level) ?? null;
}

export function canEnter(ctx: Pick<NavContext, 'enterable'>, building: string): boolean {
  return ctx.enterable.includes(building);
}

/** Where the arrival flight ends: the visitor's building when there is one, otherwise the open city. */
export function arrivalEnd(ctx: NavContext): CityMode {
  return findBuilding(ctx.layout, ctx.highlight) ? { kind: 'building', building: ctx.highlight! } : { kind: 'explore' };
}

/** One level up: office → floor → building → city. */
export function parentMode(mode: CityMode, ctx: NavContext): CityMode {
  switch (mode.kind) {
    case 'office':
      return mode.desk !== null
        ? { ...mode, desk: null }
        : { kind: 'floor', building: mode.building, level: mode.level };
    case 'floor':
      return { kind: 'building', building: mode.building };
    case 'building':
      return { kind: 'explore' };
    case 'arrival':
      return arrivalEnd(ctx);
    case 'explore':
      return mode;
  }
}

/**
 * The navigation rules. Invalid requests leave the mode unchanged (the caller can compare by reference):
 * unknown buildings or floors, entering an office the viewer may not enter, choosing a desk outside an office.
 */
export function reduceMode(mode: CityMode, action: NavAction, ctx: NavContext): CityMode {
  switch (action.type) {
    case 'home':
      // Already in the city: unchanged, so callers know to reset the view instead.
      return mode.kind === 'explore' ? mode : { kind: 'explore' };
    case 'back':
      return parentMode(mode, ctx);
    case 'arrival-done':
      return mode.kind === 'arrival' ? arrivalEnd(ctx) : mode;
    case 'select-building': {
      if (!findBuilding(ctx.layout, action.building)) return mode;
      if (mode.kind === 'building' && mode.building === action.building) return mode;
      return { kind: 'building', building: action.building };
    }
    case 'select-floor': {
      const building = action.building ?? ('building' in mode ? mode.building : null);
      if (!building || !findFloor(ctx.layout, building, action.level)) return mode;
      if (mode.kind === 'floor' && mode.building === building && mode.level === action.level) return mode;
      return { kind: 'floor', building, level: action.level };
    }
    case 'enter-office': {
      if (mode.kind !== 'floor' || !canEnter(ctx, mode.building)) return mode;
      return { kind: 'office', building: mode.building, level: mode.level, desk: null };
    }
    case 'select-desk': {
      if (mode.kind !== 'office') return mode;
      // Any slot is accepted: the demo office's host supplies its own agents, which may outnumber the layout's desks.
      if (action.desk !== null && (!Number.isInteger(action.desk) || action.desk < 0)) return mode;
      return mode.desk === action.desk ? mode : { ...mode, desk: action.desk };
    }
  }
}

export interface Crumb {
  label: string;
  /** Mode to go to when the crumb is chosen; null for the current (last) crumb. */
  mode: CityMode | null;
}

/** City › Building › Floor › Office › Agent, for the HUD breadcrumb. */
export function breadcrumbs(mode: CityMode, layout: CityLayout, agent: string | null = null): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'City', mode: { kind: 'explore' } }];
  if (mode.kind === 'building' || mode.kind === 'floor' || mode.kind === 'office') {
    const b = findBuilding(layout, mode.building);
    crumbs.push({ label: b?.shortName ?? mode.building, mode: { kind: 'building', building: mode.building } });
  }
  if (mode.kind === 'floor' || mode.kind === 'office') {
    crumbs.push({ label: `Floor ${mode.level}`, mode: { kind: 'floor', building: mode.building, level: mode.level } });
  }
  if (mode.kind === 'office') crumbs.push({ label: 'Office', mode: { ...mode, desk: null } });
  if (agent && (mode.kind === 'floor' || mode.kind === 'office')) crumbs.push({ label: agent, mode: null });
  crumbs[crumbs.length - 1] = { ...crumbs[crumbs.length - 1]!, mode: null };
  return crumbs;
}

export function sameMode(a: CityMode, b: CityMode): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
