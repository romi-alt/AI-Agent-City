import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildingId, catalogFromLegacy, catalogSql, deskId, inventory } from '../src/catalog.ts';
import { deterministicId } from '../src/ids.ts';
import { legacyCity } from '../scripts/legacy-city.ts';
import { CATALOG_MIGRATION } from '../scripts/paths.ts';

const { city, rentalAgents } = legacyCity();
const catalog = catalogFromLegacy(city, rentalAgents);
const LEGACY_BUILDING_IDS = [
  'fast-sales',
  'audi',
  'honda',
  'hyundai',
  'genesis',
  'acura',
  'volkswagen',
  'alfa-romeo',
  'maserati',
  'fiat',
  'rc-new',
  'rc-used',
  'rental-1',
  'rental-2',
  'rental-3',
];

describe('city catalog', () => {
  it('keeps the exact legacy inventory (MIGRATION-MAP: 15 / 183 / 281 / 22 / 303)', () => {
    assert.deepEqual(inventory(catalog), { buildings: 15, floors: 183, aiDesks: 281, humanDesks: 22, desks: 303 });
  });

  it('keeps every legacy building id as an alias', () => {
    assert.deepEqual(catalog.aliases.map(a => a.alias).sort(), [...LEGACY_BUILDING_IDS].sort());
    for (const k of LEGACY_BUILDING_IDS)
      assert.equal(catalog.aliases.find(a => a.alias === k)?.buildingId, buildingId(k));
  });

  it('keeps Fast Sales as 32 AI agents and Elvis, with seven AI leaders on the leadership floor', () => {
    const fs = catalog.floors.filter(f => f.buildingKey === 'fast-sales').map(f => f.id);
    const desks = catalog.desks.filter(d => fs.includes(d.floorId));
    assert.equal(desks.filter(d => d.kind === 'ai').length, 32);
    assert.deepEqual(
      desks.filter(d => d.kind === 'human').map(d => d.personaName),
      ['Elvis'],
    );
    const l12 = catalog.floors.find(f => f.buildingKey === 'fast-sales' && f.level === 12)!;
    assert.equal(catalog.desks.filter(d => d.floorId === l12.id && d.kind === 'ai').length, 7);
  });

  it('keeps the 21 named Rick Case associates and Elvis as human desks that can never run an agent', () => {
    const humans = catalog.desks.filter(d => d.kind === 'human');
    assert.equal(humans.length, 22);
    assert.ok(humans.every(d => d.templateVersionId === null));
    assert.ok(catalog.desks.filter(d => d.kind === 'ai').every(d => d.templateVersionId !== null));
  });

  it('starts rental buildings empty, with asking rent only', () => {
    const rentals = catalog.floors.filter(f => f.buildingKey.startsWith('rental-'));
    assert.equal(rentals.length, 36);
    assert.ok(rentals.every(f => f.rentable && f.askingRentCents === 19900));
    assert.equal(catalog.desks.filter(d => rentals.some(f => f.id === d.floorId)).length, 0);
    assert.ok(catalog.floors.filter(f => !f.rentable).every(f => f.askingRentCents === null));
  });

  it('gives stable ids: the same legacy id always maps to the same uuid', () => {
    assert.equal(deskId('fast-sales-L12-0'), catalog.desks.find(d => d.legacyId === 'fast-sales-L12-0')!.id);
    assert.equal(deterministicId('a', 'b'), deterministicId('a', 'b'));
    assert.notEqual(deterministicId('a/b'), deterministicId('a', 'b'), 'parts are separated unambiguously');
    assert.match(deterministicId('x'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('has an up-to-date generated seed migration', () => {
    assert.equal(
      readFileSync(CATALOG_MIGRATION, 'utf8'),
      catalogSql(catalog),
      'run: pnpm --filter @agentcity/domain catalog:generate',
    );
  });
});
