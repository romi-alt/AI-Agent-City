/**
 * The shapes of the waterfront: bridges (plain girder, cable-stayed with stone towers, steel arch), piers with
 * sheds, and four kinds of boat, as vertex-coloured geometry built with `Kit`. Recipes follow the design file's
 * river city (deck, rails, cable fans, arch ribs with hangers) re-cut for a steel-and-stone New York.
 */
import type { BufferGeometry } from 'three';
import { BRIDGES, type Bridge, bridgeSpan, type BoatKind, DECK_Y, riverOf } from './fleet.ts';
import { Kit } from './kitbash.ts';
import { riverX } from './waterfront.ts';

const STEEL = '#8d96a1';
const STONE = '#a89e8c';
const ASPHALT = '#2f3339';

/** One bridge into `kit` (and its lamp heads into `lamps`). */
function bridge(kit: Kit, lamps: Kit, b: Bridge): void {
  const [x0, x1] = bridgeSpan(b);
  const r = riverOf(b.river);
  const cx = riverX(r, b.z);
  const len = x1 - x0;
  const mid = (x0 + x1) / 2;
  const w = b.wide;
  kit.box(mid, DECK_Y - 0.4, b.z, len, 0.8, w, '#9aa0a8');
  kit.box(mid, DECK_Y + 0.03, b.z, len, 0.1, w - 1.6, ASPHALT);
  for (const s of [-1, 1]) {
    kit.box(mid, DECK_Y + 0.5, b.z + s * (w / 2 - 0.15), len, 0.9, 0.3, '#aeb4bb');
    // Deep girders under the edge of the deck.
    kit.box(mid, DECK_Y - 1.3, b.z + s * (w / 2 - 0.4), len, 1.2, 0.5, STEEL);
  }
  // Approach blocks where the deck meets the quay, and piers in the water.
  for (const x of [x0 + 2, x1 - 2]) kit.box(x, DECK_Y / 2 - 0.3, b.z, 4, DECK_Y - 0.6, w, '#b5afa3');
  const piers = b.kind === 'plain' ? 5 : 2;
  for (let i = 0; i < piers; i++) {
    const x = cx - r.half * 0.8 + (i / Math.max(1, piers - 1)) * r.half * 1.6;
    kit.box(x, 0.2, b.z, 3, DECK_Y + 0.4, w * 0.6, STONE);
  }
  for (let x = x0 + 8; x < x1 - 4; x += 14)
    for (const s of [-1, 1]) lamps.box(x, DECK_Y + 3.4, b.z + s * (w / 2 - 0.2), 0.7, 0.18, 0.4, '#fff1d0');
  for (let x = x0 + 8; x < x1 - 4; x += 14)
    for (const s of [-1, 1]) kit.post(x, b.z + s * (w / 2 - 0.2), DECK_Y, DECK_Y + 3.3, 0.07, '#30363c');

  if (b.kind === 'cable') {
    // Two stone towers with pointed arches, and a fan of cables from each tower to the deck.
    const top = DECK_Y + 34;
    for (const tx of [cx - r.half * 0.5, cx + r.half * 0.5]) {
      for (const s of [-1, 1]) {
        const z = b.z + s * (w / 2 - 1.2);
        kit.box(tx, top / 2 - 1, z, 2.6, top, 2.4, STONE);
        for (let i = 1; i <= 9; i++)
          for (const d of [-1, 1])
            kit.strut([tx, top - i * 1.1, z], [tx + d * i * 6, DECK_Y + 0.9, z], 0.12, '#c9ced4');
      }
      kit.box(tx, DECK_Y + 22, b.z, 2.6, 1.6, w - 2.4, STONE);
      kit.box(tx, top - 1, b.z, 2.8, 2, w - 2.4, STONE);
      kit.post(tx, b.z, top, top + 3, 0.1, '#c9ced4');
    }
  } else if (b.kind === 'arch') {
    const R = r.half + 2;
    const H = 26;
    const steps = 18;
    for (const s of [-1, 1]) {
      const z = b.z + s * (w / 2 - 0.6);
      let prev: [number, number, number] | null = null;
      for (let i = 0; i <= steps; i++) {
        const x = cx - R + (2 * R * i) / steps;
        const u = (x - cx) / R;
        const p: [number, number, number] = [x, DECK_Y + H * (1 - u * u), z];
        if (prev) kit.strut(prev, p, 0.7, '#7a8795');
        // Hangers from the rib down to the deck.
        if (i > 1 && i < steps - 1) kit.strut([x, DECK_Y + 0.9, z], [x, p[1], z], 0.12, '#c9ced4');
        prev = p;
      }
    }
    kit.box(cx, DECK_Y + H * 0.85, b.z, 0.5, 0.5, w - 1, '#7a8795');
  }
}

/** All bridges: structure (vertex colours) and lamp heads (lit at night). */
export function bridgeGeometry(): { structure: BufferGeometry; lamps: BufferGeometry } {
  const kit = new Kit();
  const lamps = new Kit();
  for (const b of BRIDGES) bridge(kit, lamps, b);
  return { structure: kit.build(), lamps: lamps.build() };
}

/** Piers jutting from the island's quay on both rivers, each with a long shed, and a few moored barges. */
export function pierGeometry(): BufferGeometry {
  const kit = new Kit();
  for (const name of ['west', 'east'] as const) {
    const r = riverOf(name);
    // The island side: east of the western river, west of the eastern one.
    const dir = name === 'west' ? -1 : 1;
    const span = name === 'west' ? 60 : 44;
    for (let z = -600; z <= 600; z += name === 'west' ? 80 : 110) {
      if (BRIDGES.some(b => b.river === name && Math.abs(b.z - z) < 40)) continue;
      const bank = riverX(r, z) - dir * r.half;
      const len = span * (0.55 + 0.3 * Math.abs(Math.sin(z * 0.37)));
      const cx = bank + dir * (len / 2 - 3);
      kit.box(cx, 0.45, z, len, 0.7, 9, '#7d7469');
      kit.box(cx - dir * len * 0.12, 3.2, z, len * 0.62, 4.4, 6.4, name === 'west' ? '#c9c0ae' : '#9fa7ae');
      kit.box(cx - dir * len * 0.12, 5.6, z, len * 0.64, 0.4, 7, '#5d6670');
      for (let k = 0; k < 4; k++) kit.post(bank + dir * (len * (0.2 + k * 0.22)), z + 4.9, 0, 2, 0.35, '#4a3f35');
    }
  }
  return kit.build();
}

/** A boat's geometry, length along +x, sitting on the water at y = 0. */
export function boatGeometry(kind: BoatKind): BufferGeometry {
  const kit = new Kit();
  if (kind === 'speed') {
    kit.box(0, 0.35, 0, 5, 0.7, 1.5, '#f4f6f8').box(2.6, 0.3, 0, 1.4, 0.4, 0.9, '#f4f6f8', 0);
    kit.box(0, 0.5, 0, 5.02, 0.18, 1.52, '#d8432f').box(-0.4, 1.0, 0, 1.6, 0.6, 1.0, '#26303c');
  } else if (kind === 'yacht') {
    kit.box(0, 0.7, 0, 12, 1.4, 3.4, '#f7f8fa').box(0, 0.9, 0, 12.02, 0.3, 3.42, '#1f3b63');
    kit
      .box(-1, 2.2, 0, 7, 1.4, 2.8, '#f7f8fa')
      .box(-1, 3.4, 0, 4.4, 1.2, 2.2, '#f7f8fa')
      .box(-1, 2.3, 0, 7.05, 0.5, 2.85, '#26303c');
  } else if (kind === 'ferry') {
    kit.box(0, 1.0, 0, 22, 2, 6, '#1f3b63').box(0, 2.2, 0, 22.02, 0.4, 6.02, '#e8862f');
    kit.box(-1, 3.6, 0, 17, 2.4, 5.2, '#f1f3f5').box(-1, 3.8, 0, 17.05, 0.9, 5.25, '#26303c');
    kit.box(-2, 5.4, 0, 11, 1.2, 4.4, '#f1f3f5').box(-5, 6.6, 0, 3, 1.6, 2.4, '#e8862f');
  } else {
    kit.box(0, 0.9, 0, 11, 1.8, 3.8, '#2d2f35').box(0, 1.6, 0, 11.02, 0.5, 3.82, '#a83a2e');
    kit.box(-1.5, 3.0, 0, 4, 2.6, 3, '#f1f3f5').box(-1.5, 4.6, 0, 2.5, 1.0, 2.2, '#f1f3f5');
    kit.post(-3.4, 0, 3.2, 6.2, 0.55, '#a83a2e');
  }
  return kit.build();
}
