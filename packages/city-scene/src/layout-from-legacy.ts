import type { BuildingKind, CityLayout } from './types.ts';

interface LegacyAgent {
  name: string;
  role: string;
  kind: 'ai' | 'human';
}
interface LegacyFloor {
  level: number;
  name: string;
  info?: string;
  agents: LegacyAgent[];
}
interface LegacyBuilding {
  id: string;
  name: string;
  short: string;
  kind: BuildingKind;
  brand?: string;
  color: string;
  accent: string;
  x: number;
  z: number;
  w: number;
  d: number;
  floors: LegacyFloor[];
}

const districtFor = (kind: BuildingKind) =>
  kind === 'dealership' ? 'dealer-row' : kind === 'rental' ? 'rental-park' : 'campus';

/** Legacy city (apps/legacy buildCity) → public layout. Same street grid as the legacy city view. */
export function toLayout(
  city: LegacyBuilding[],
  districts: readonly { key: string; name: string }[],
  buildingId: (key: string) => string,
): CityLayout {
  return {
    version: 1,
    districts: districts.map(d => ({ key: d.key, name: d.name })),
    buildings: city.map(b => ({
      key: b.id,
      id: buildingId(b.id),
      district: districtFor(b.kind),
      name: b.name,
      shortName: b.short,
      kind: b.kind,
      brand: b.brand ?? null,
      color: b.color,
      accent: b.accent,
      x: b.x,
      z: b.z,
      w: b.w,
      d: b.d,
      floors: [...b.floors]
        .sort((a, c) => a.level - c.level)
        .map(f => ({
          level: f.level,
          // A person's own office floor is named after them in the legacy city; the public layout says what it is.
          name: f.agents.some(a => a.kind === 'human') && /'s office$/.test(f.name) ? 'Sales associate office' : f.name,
          info: f.agents.some(a => a.kind === 'human') ? null : (f.info ?? null),
          rentable: b.kind === 'rental',
          desks: f.agents.map((a, slot) => ({
            slot,
            kind: a.kind,
            role: a.role,
            name: a.kind === 'ai' && !/'s AI$/.test(a.name) ? a.name : null,
          })),
        })),
    })),
    streets: { roadsX: [-50, -30, -10, 10, 30, 50], roadsZ: [-30, -10, 10, 30], extent: 60 },
  };
}
