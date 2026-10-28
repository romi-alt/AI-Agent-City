/**
 * Simulated activity for the public city's building tags (X04): how many of a building's AI desks are working
 * and how many items need a person. The public map has no tenant data, so this is a deterministic, slowly
 * changing simulation (the tags say so). Pure: the same key and time always give the same numbers.
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export interface Activity {
  working: number;
  needs: number;
}

export function simulatedActivity(key: string, desks: number, timeSeconds: number): Activity {
  if (desks <= 0) return { working: 0, needs: 0 };
  const h = hash(key);
  // Each building drifts on its own slow cycle (minutes), so counts change now and then, never in sync.
  const phase = h * Math.PI * 2;
  const share = 0.55 + 0.25 * Math.sin(timeSeconds / (90 + h * 60) + phase);
  const working = Math.max(1, Math.min(desks, Math.round(desks * share)));
  const step = Math.floor(timeSeconds / (45 + h * 40) + h * 7);
  const needs = hash(`${key}:${step}`) < 0.35 ? 1 + Math.floor(hash(`${key}:n${step}`) * 2) : 0;
  return { working, needs };
}
