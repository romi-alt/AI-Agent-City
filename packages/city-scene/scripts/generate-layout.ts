// Generates src/data/city-layout.json: the public city map the 3D scene renders, from the same legacy seed and
// catalog as the database (packages/domain). Public-safe by construction: human desks carry no names (the legacy
// city's people are real; see M00 containment F15), and nothing tenant-owned is included.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildingId, DISTRICTS } from '@agentcity/domain';
import { legacyCity } from '../../domain/scripts/legacy-city.ts';
import { toLayout } from '../src/layout-from-legacy.ts';

export const LAYOUT_FILE = fileURLToPath(new URL('../src/data/city-layout.json', import.meta.url));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { city } = legacyCity();
  const layout = toLayout(city, DISTRICTS, buildingId);
  writeFileSync(LAYOUT_FILE, JSON.stringify(layout, null, 2) + '\n');
  console.log(`wrote ${LAYOUT_FILE}: ${layout.buildings.length} buildings`);
}
