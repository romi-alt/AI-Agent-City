import { fileURLToPath } from 'node:url';

export const CATALOG_MIGRATION = fileURLToPath(
  new URL('../../db/migrations/1793059200001_catalog-legacy-city.sql', import.meta.url),
);
