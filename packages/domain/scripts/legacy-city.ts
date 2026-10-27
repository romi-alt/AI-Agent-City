// Reads the legacy city seed straight from apps/legacy, so the catalog can never drift from the app it replaces.
import { buildCity, makeAgent } from '../../../apps/legacy/src/core/data/buildings.ts';
import type { LegacyAgent, LegacyBuilding } from '../src/catalog.ts';

export function legacyCity(): { city: LegacyBuilding[]; rentalAgents: LegacyAgent[] } {
  return {
    city: buildCity() as LegacyBuilding[],
    // What renting a floor installs (Sim.rentFloor): a follow-up AI and a social AI.
    rentalAgents: [
      makeAgent('rental-x', 1, 0, 'Rental AI', 'follow-up', 'ai', 'dealership'),
      makeAgent('rental-x', 1, 1, 'Rental Social', 'social', 'ai', 'social'),
    ] as LegacyAgent[],
  };
}
