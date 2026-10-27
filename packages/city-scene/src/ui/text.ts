import type { BuildingKind, CityLayout, CityMode, LayoutBuilding, LayoutFloor } from '../types.ts';

/** Plain-language names and summaries for the HUD and the 2D map (pure; tested). */

export const KIND_LABEL: Record<BuildingKind, string> = {
  training: 'Training center',
  dealership: 'Car dealership',
  associates: 'Sales associates',
  rental: 'Offices for rent',
};

export function districtName(layout: CityLayout, key: string): string {
  return layout.districts.find(d => d.key === key)?.name ?? key;
}

export function aiCount(b: LayoutBuilding): number {
  return b.floors.reduce((n, f) => n + f.desks.filter(d => d.kind === 'ai').length, 0);
}

export function floorSummary(f: LayoutFloor): string {
  if (!f.desks.length) return f.rentable ? 'Available to rent' : 'No desks yet';
  const ai = f.desks.filter(d => d.kind === 'ai').length;
  const people = f.desks.length - ai;
  const parts = [];
  if (ai) parts.push(`${ai} AI agent${ai === 1 ? '' : 's'}`);
  if (people) parts.push(`${people} ${people === 1 ? 'person' : 'people'}`);
  return parts.join(' · ');
}

/** What the screen reader hears when the view changes. */
export function announce(mode: CityMode, layout: CityLayout): string {
  const b = 'building' in mode ? layout.buildings.find(x => x.key === mode.building) : undefined;
  switch (mode.kind) {
    case 'arrival':
      return 'Arriving in AgentCity. Press any key to skip.';
    case 'explore':
      return 'City overview. Choose a building to look inside.';
    case 'building':
      return b ? `${b.name}. ${b.floors.length} floors. ${KIND_LABEL[b.kind]}.` : '';
    case 'floor': {
      const f = b?.floors.find(x => x.level === mode.level);
      return b && f ? `${b.shortName}, floor ${f.level}: ${f.name}. ${floorSummary(f)}.` : '';
    }
    case 'office':
      return b ? `Inside the office on floor ${mode.level} of ${b.shortName}.` : '';
  }
}

/** Floors listed top to bottom, like a lobby directory. */
export function floorsTopDown(b: LayoutBuilding): LayoutFloor[] {
  return [...b.floors].sort((a, c) => c.level - a.level);
}
