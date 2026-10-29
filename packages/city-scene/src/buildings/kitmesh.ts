import { Color, Euler, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { muteHex } from '../environment/grade.ts';
import type { KitPart } from './kit.ts';
import type { KitMaterials } from './materials.ts';
import { type Shape, UNIT } from './parts.ts';

/** Lit and metallic parts keep their colour; everything else is muted toward grey (see `grade.ts`). */
const UNGRADED = new Set(['glow', 'beacon', 'gold', 'lantern']);

/** Instances of one building in one instanced mesh, with their resting matrices and floors (for explode). */
interface Slice {
  mesh: InstancedMesh;
  index: number[];
  level: number[];
  base: Float32Array;
}

export interface KitMeshes {
  group: Group;
  /** Moves every instance of `building` by offset(level) in y (0 restores the resting pose). */
  explode(building: string, offset: (level: number) => number): void;
  dispose(): void;
  instances: number;
}

/**
 * Turns kit parts into one InstancedMesh per (shape, material, shadow) — a few dozen draw calls for the whole
 * district — keeping, per building, the instance indices and floors so exploded floors are a matrix update.
 */
export function buildKitMeshes(parts: KitPart[], mats: KitMaterials, maxLod: 0 | 1 | 2): KitMeshes {
  const groups = new Map<string, KitPart[]>();
  for (const p of parts) {
    if ((p.lod ?? 0) > maxLod) continue;
    const k = `${p.shape}|${p.mat}|${p.cast ? 1 : 0}`;
    const list = groups.get(k);
    if (list) list.push(p);
    else groups.set(k, [p]);
  }
  const group = new Group();
  group.name = 'a1-kit';
  const slices = new Map<string, Slice[]>();
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const pos = new Vector3();
  const scl = new Vector3();
  const c = new Color();
  let instances = 0;
  for (const [key, list] of groups) {
    const [shape, matKey, cast] = key.split('|') as [Shape, string, string];
    const material = mats[matKey];
    if (!material) throw new Error(`No kit material "${matKey}".`);
    const geo = UNIT[shape]();
    const seeds = new Float32Array(list.length);
    const mesh = new InstancedMesh(geo, material, list.length);
    const perBuilding = new Map<string, { index: number[]; level: number[] }>();
    list.forEach((p, i) => {
      q.setFromEuler(e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0));
      mesh.setMatrixAt(i, m.compose(pos.set(p.x, p.y, p.z), q, scl.set(p.sx, p.sy, p.sz)));
      mesh.setColorAt(
        i,
        c.set(UNGRADED.has(matKey) || !p.color ? (p.color ?? '#ffffff') : muteHex(p.color, 0.3, 0.92)),
      );
      seeds[i] = i + 1;
      let s = perBuilding.get(p.b);
      if (!s) perBuilding.set(p.b, (s = { index: [], level: [] }));
      s.index.push(i);
      s.level.push(p.lv);
    });
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = cast === '1';
    mesh.receiveShadow = true;
    // Exploded floors leave the resting bounds; the district is always roughly in view anyway.
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    mesh.name = key;
    group.add(mesh);
    instances += list.length;
    for (const [b, s] of perBuilding) {
      const base = new Float32Array(s.index.length * 16);
      s.index.forEach((idx, j) => base.set(mesh.instanceMatrix.array.subarray(idx * 16, idx * 16 + 16), j * 16));
      const arr = slices.get(b) ?? [];
      arr.push({ mesh, index: s.index, level: s.level, base });
      slices.set(b, arr);
    }
  }

  return {
    group,
    instances,
    explode(building, offset) {
      for (const s of slices.get(building) ?? []) {
        const arr = s.mesh.instanceMatrix.array as Float32Array;
        s.index.forEach((idx, j) => {
          const o = idx * 16;
          arr.set(s.base.subarray(j * 16, j * 16 + 16), o);
          arr[o + 13] = s.base[j * 16 + 13]! + offset(s.level[j]!);
        });
        s.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      group.traverse(o => {
        if (o instanceof InstancedMesh) o.geometry.dispose();
      });
    },
  };
}
