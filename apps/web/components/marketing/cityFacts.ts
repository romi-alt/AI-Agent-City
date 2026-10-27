import 'server-only';
// The landing page describes the public city from its generated layout, so every count and floor name on the page is
// the map's own. Imported as data on the server: `CITY_LAYOUT` from the package entry lives in a client module, and
// importing the JSON here keeps the 80 KB layout out of the landing page's browser bundle.
// (Integrator: if @agentcity/city-scene gains a `./layout` export, switch this import to it.)
import layoutJson from '../../../../packages/city-scene/src/data/city-layout.json';

interface Desk {
  kind: 'ai' | 'human';
  role: string;
  name: string | null;
}
interface Floor {
  level: number;
  name: string;
  info: string | null;
  rentable: boolean;
  desks: Desk[];
}
interface Building {
  key: string;
  district: string;
  name: string;
  kind: 'training' | 'dealership' | 'associates' | 'rental';
  floors: Floor[];
}
interface Layout {
  districts: { key: string; name: string }[];
  buildings: Building[];
}

const layout = layoutJson as unknown as Layout;

export interface DirectoryRow {
  level: number;
  name: string;
  info: string | null;
  agents: { name: string | null; role: string }[];
  people: number;
}

function building(key: string): Building {
  const b = layout.buildings.find(x => x.key === key);
  if (!b) throw new Error(`The public city layout has no building "${key}".`);
  return b;
}

function directory(b: Building): DirectoryRow[] {
  return [...b.floors]
    .sort((a, z) => z.level - a.level)
    .map(f => ({
      level: f.level,
      name: f.name,
      info: f.info,
      agents: f.desks.filter(d => d.kind === 'ai').map(d => ({ name: d.name, role: d.role })),
      people: f.desks.filter(d => d.kind === 'human').length,
    }));
}

const floors = layout.buildings.flatMap(b => b.floors);
const desks = floors.flatMap(f => f.desks);

export const CITY_FACTS = {
  buildings: layout.buildings.length,
  districts: layout.districts.map(d => d.name),
  floors: floors.length,
  desks: desks.length,
  aiDesks: desks.filter(d => d.kind === 'ai').length,
  dealerships: layout.buildings.filter(b => b.kind === 'dealership').length,
  rentalBuildings: layout.buildings.filter(b => b.kind === 'rental').length,
  rentableFloors: floors.filter(f => f.rentable).length,
};

/** The training centre's directory: a floor per course, with its named AI agents. */
export const TRAINING_DIRECTORY = directory(building('fast-sales'));
export const TRAINING_NAME = building('fast-sales').name;

/**
 * A dealership tower's departments. Every dealership in the public city shares this floor plan; the brand is left
 * out on purpose (the map's dealership names are building labels, not customers).
 */
export const DEALERSHIP_DIRECTORY = directory(layout.buildings.find(b => b.kind === 'dealership') ?? building('audi'));

/** Rental Building 2, where demo offices are shown (PLAN.md decision 6). */
export const DEMO_BUILDING = building('rental-2');
export const RENTAL_DIRECTORY = directory(DEMO_BUILDING);

/** A sales associate's floor: one person, one follow-up agent, one social agent. */
export const ASSOCIATE_FLOOR = directory(layout.buildings.find(b => b.kind === 'associates') ?? building('rc-new'))[0];
