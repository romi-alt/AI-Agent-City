import { writeFileSync } from 'node:fs';
import { CATALOG_MIGRATION } from './paths.ts';
import { catalogFromLegacy, catalogSql, inventory } from '../src/catalog.ts';
import { legacyCity } from './legacy-city.ts';

const { city, rentalAgents } = legacyCity();
const catalog = catalogFromLegacy(city, rentalAgents);
writeFileSync(CATALOG_MIGRATION, catalogSql(catalog));
console.log(`wrote ${CATALOG_MIGRATION}`, inventory(catalog));
