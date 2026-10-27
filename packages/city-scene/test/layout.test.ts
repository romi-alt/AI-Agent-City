import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { buildingId, DISTRICTS } from '@agentcity/domain';
import { legacyCity } from '../../domain/scripts/legacy-city.ts';
import { LAYOUT_FILE } from '../scripts/generate-layout.ts';
import { toLayout } from '../src/layout-from-legacy.ts';

const { city } = legacyCity();
const layout = toLayout(city, DISTRICTS, buildingId);

it('is generated from the legacy city and up to date', () => {
  assert.deepEqual(
    JSON.parse(readFileSync(LAYOUT_FILE, 'utf8')),
    JSON.parse(JSON.stringify(layout)),
    'run: pnpm --filter @agentcity/city-scene layout:generate',
  );
});

it('keeps the exact inventory: 15 buildings, 183 floors, 303 desks', () => {
  assert.equal(layout.buildings.length, 15);
  assert.equal(
    layout.buildings.reduce((n, b) => n + b.floors.length, 0),
    183,
  );
  assert.equal(
    layout.buildings.reduce((n, b) => n + b.floors.reduce((m, f) => m + f.desks.length, 0), 0),
    303,
  );
});

it('never names a real person in the public layout', () => {
  const humans = new Set(
    city.flatMap(b => b.floors.flatMap(f => f.agents.filter(a => a.kind === 'human').map(a => a.name))),
  );
  const text = JSON.stringify(layout);
  for (const name of humans) assert.ok(!text.includes(name), `public layout contains "${name}"`);
});
