import { existsSync, readFileSync } from 'node:fs';
import { Sim } from '../src/core/sim';
import type { Snapshot } from '../src/core/types';

/**
 * Migration containment (M00): reading the saved city fails closed. A missing file means "first start".
 * Anything else that can't be read, parsed, recognised or loaded stops the server instead of starting a
 * fresh city that the periodic saver would later write over the original. The file is never modified here.
 */
export type LoadResult =
  | { kind: 'fresh' }
  | { kind: 'loaded'; sim: Sim }
  | { kind: 'refused'; reason: string };

export function loadState(file: string): LoadResult {
  if (!existsSync(file)) return { kind: 'fresh' };
  let snap: Partial<Snapshot>;
  try {
    snap = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { kind: 'refused', reason: `the saved city is not valid JSON (${(e as Error).message})` };
  }
  if (!snap || typeof snap !== 'object') return { kind: 'refused', reason: 'the saved city is not an object' };
  if (snap.version !== Sim.VERSION) return { kind: 'refused', reason: `the saved city is version ${JSON.stringify(snap.version)}, this server reads version ${Sim.VERSION}` };
  for (const key of ['buildings', 'leads', 'feed', 'approvals', 'messages', 'content', 'inbox', 'insights', 'reports', 'stageLog', 'revenue'] as const) {
    if (!Array.isArray(snap[key])) return { kind: 'refused', reason: `the saved city has no valid "${key}" list` };
  }
  if (!snap.settings || typeof snap.settings !== 'object') return { kind: 'refused', reason: 'the saved city has no settings' };
  try {
    return { kind: 'loaded', sim: new Sim(snap as Snapshot) };
  } catch (e) {
    return { kind: 'refused', reason: `the saved city could not be loaded (${(e as Error).message})` };
  }
}
