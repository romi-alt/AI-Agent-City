import { deterministicId } from './ids.js';

/** The parts of the legacy city seed (apps/legacy/src/core/data/buildings.ts) the catalog is built from. */
export interface LegacyAgent {
  id: string;
  name: string;
  role: string;
  kind: 'ai' | 'human';
  taskSet: string;
  categories: string[];
}
export interface LegacyFloor {
  level: number;
  name: string;
  vacant: boolean;
  rent?: number;
  info?: string;
  agents: LegacyAgent[];
}
export interface LegacyBuilding {
  id: string;
  name: string;
  short: string;
  kind: 'training' | 'dealership' | 'associates' | 'rental';
  brand?: string;
  color: string;
  accent: string;
  x: number;
  z: number;
  w: number;
  d: number;
  floors: LegacyFloor[];
}

/**
 * Districts are new (the legacy city has none). They group buildings by what they are, which is also how the
 * city is laid out: dealerships on the outer rows, the Fast Sales campus and rentals in the middle row.
 */
export const DISTRICTS = [
  { key: 'campus', name: 'Fast Sales Campus' },
  { key: 'dealer-row', name: 'Dealer Row' },
  { key: 'rental-park', name: 'Rental Park' },
] as const;

const districtFor = (kind: LegacyBuilding['kind']) =>
  kind === 'dealership' ? 'dealer-row' : kind === 'rental' ? 'rental-park' : 'campus';

export interface Catalog {
  districts: { id: string; key: string; name: string }[];
  buildings: {
    id: string;
    key: string;
    districtId: string;
    name: string;
    shortName: string;
    kind: LegacyBuilding['kind'];
    brand: string | null;
    color: string;
    accent: string;
    x: number;
    z: number;
    w: number;
    d: number;
  }[];
  aliases: { alias: string; buildingId: string; source: string }[];
  floors: {
    id: string;
    buildingId: string;
    buildingKey: string;
    level: number;
    name: string;
    info: string | null;
    rentable: boolean;
    askingRentCents: number | null;
  }[];
  templates: { id: string; key: string; taskSet: string; role: string }[];
  templateVersions: { id: string; templateId: string; templateKey: string; version: number; categories: string[] }[];
  desks: {
    id: string;
    legacyId: string;
    floorId: string;
    slot: number;
    kind: 'ai' | 'human';
    personaName: string;
    role: string;
    templateVersionId: string | null;
  }[];
}

export const buildingId = (legacyKey: string) => deterministicId('building', legacyKey);
export const floorId = (legacyKey: string, level: number) => deterministicId('floor', legacyKey, String(level));
export const deskId = (legacyAgentId: string) => deterministicId('desk', legacyAgentId);
export const templateVersionId = (key: string, version: number) =>
  deterministicId('agent-template-version', key, String(version));

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Builds the catalog from the legacy seed. `rentalAgents` are the agents the legacy app installs when a floor is
 * rented; they become templates (rental floors have no seeded desks).
 */
export function catalogFromLegacy(city: LegacyBuilding[], rentalAgents: LegacyAgent[]): Catalog {
  const c: Catalog = {
    districts: [],
    buildings: [],
    aliases: [],
    floors: [],
    templates: [],
    templateVersions: [],
    desks: [],
  };
  for (const d of DISTRICTS) c.districts.push({ id: deterministicId('district', d.key), key: d.key, name: d.name });

  // One template per task set + role + category list, in order of first appearance.
  const byCategories = new Map<string, string>();
  const baseCount = new Map<string, number>();
  const templateFor = (a: LegacyAgent) => {
    const sig = `${a.taskSet}|${a.role}|${a.categories.join('|')}`;
    const known = byCategories.get(sig);
    if (known) return known;
    const base = `${slug(a.taskSet)}/${slug(a.role)}`;
    const n = (baseCount.get(base) ?? 0) + 1;
    baseCount.set(base, n);
    const key = n === 1 ? base : `${base}-${n}`;
    const id = deterministicId('agent-template', key);
    c.templates.push({ id, key, taskSet: a.taskSet, role: a.role });
    c.templateVersions.push({
      id: templateVersionId(key, 1),
      templateId: id,
      templateKey: key,
      version: 1,
      categories: [...a.categories],
    });
    byCategories.set(sig, key);
    return key;
  };

  for (const b of city) {
    const bid = buildingId(b.id);
    c.buildings.push({
      id: bid,
      key: b.id,
      districtId: deterministicId('district', districtFor(b.kind)),
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
    });
    c.aliases.push({ alias: b.id, buildingId: bid, source: 'legacy-v2' });
    for (const f of [...b.floors].sort((x, y) => x.level - y.level)) {
      const fid = floorId(b.id, f.level);
      const rentable = b.kind === 'rental';
      c.floors.push({
        id: fid,
        buildingId: bid,
        buildingKey: b.id,
        level: f.level,
        name: f.name,
        info: f.info ?? null,
        rentable,
        askingRentCents: rentable && f.rent ? f.rent * 100 : null,
      });
      f.agents.forEach((a, slot) => {
        c.desks.push({
          id: deskId(a.id),
          legacyId: a.id,
          floorId: fid,
          slot,
          kind: a.kind,
          personaName: a.name,
          role: a.role,
          templateVersionId: a.kind === 'ai' ? templateVersionId(templateFor(a), 1) : null,
        });
      });
    }
  }
  for (const a of rentalAgents) templateFor(a);
  return c;
}

/** The numbers MIGRATION-MAP.md says must survive the migration. */
export function inventory(c: Catalog) {
  return {
    buildings: c.buildings.length,
    floors: c.floors.length,
    aiDesks: c.desks.filter(d => d.kind === 'ai').length,
    humanDesks: c.desks.filter(d => d.kind === 'human').length,
    desks: c.desks.length,
  };
}

const lit = (v: string | number | boolean | null) =>
  v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v);
const row = (vs: (string | number | boolean | null)[]) => `(${vs.map(lit).join(', ')})`;
const arr = (xs: string[]) => `ARRAY[${xs.map(lit).join(', ')}]::text[]`;

/** The versioned seed migration for the catalog. Generated; never edit the SQL by hand. */
export function catalogSql(c: Catalog): string {
  const out: string[] = [
    '-- Up Migration',
    '-- GENERATED by packages/domain (pnpm --filter @agentcity/domain catalog:generate) from the legacy city seed',
    '-- (apps/legacy/src/core/data/buildings.ts). Do not edit by hand; a test fails if this file is out of date.',
    `-- Inventory: ${JSON.stringify(inventory(c))}`,
    '',
    'INSERT INTO catalog.district (id, key, name) VALUES',
    c.districts.map(d => row([d.id, d.key, d.name])).join(',\n') + ';',
    '',
    'INSERT INTO catalog.building (id, key, district_id, name, short_name, kind, brand, color, accent, x, z, w, d) VALUES',
    c.buildings
      .map(b =>
        row([b.id, b.key, b.districtId, b.name, b.shortName, b.kind, b.brand, b.color, b.accent, b.x, b.z, b.w, b.d]),
      )
      .join(',\n') + ';',
    '',
    'INSERT INTO catalog.building_alias (alias, building_id, source) VALUES',
    c.aliases.map(a => row([a.alias, a.buildingId, a.source])).join(',\n') + ';',
    '',
    'INSERT INTO catalog.floor (id, building_id, level, name, info, rentable, asking_rent_cents) VALUES',
    c.floors.map(f => row([f.id, f.buildingId, f.level, f.name, f.info, f.rentable, f.askingRentCents])).join(',\n') +
      ';',
    '',
    'INSERT INTO catalog.agent_template (id, key, task_set, role) VALUES',
    c.templates.map(t => row([t.id, t.key, t.taskSet, t.role])).join(',\n') + ';',
    '',
    'INSERT INTO catalog.agent_template_version (id, template_id, version, categories) VALUES',
    c.templateVersions
      .map(v => `(${[lit(v.id), lit(v.templateId), lit(v.version), arr(v.categories)].join(', ')})`)
      .join(',\n') + ';',
    '',
    'INSERT INTO catalog.desk (id, legacy_id, floor_id, slot, kind, persona_name, role, template_version_id) VALUES',
    c.desks
      .map(d => row([d.id, d.legacyId, d.floorId, d.slot, d.kind, d.personaName, d.role, d.templateVersionId]))
      .join(',\n') + ';',
    '',
    '-- Down Migration',
    'DELETE FROM catalog.desk;',
    'DELETE FROM catalog.agent_template_version;',
    'DELETE FROM catalog.agent_template;',
    'DELETE FROM catalog.floor;',
    'DELETE FROM catalog.building_alias;',
    'DELETE FROM catalog.building;',
    'DELETE FROM catalog.district;',
    '',
  ];
  return out.join('\n');
}
