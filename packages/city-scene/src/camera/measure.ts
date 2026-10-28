import * as THREE from 'three';
import type { CityLayout } from '../types.ts';
import type { Box } from './bounds.ts';

export type MeasuredBox = Omit<Box, 'key'>;

/** How far past its lot a building's details may reach (entrance canopies, signs) and still count as its own. */
const REACH = 2.5;

/**
 * Measures the real extent of every layout building from the rendered scene: its facade (the mesh tagged
 * `userData.buildingKey`) and every detail instance (crowns, spires, canopies, rooftop plant) standing on or next
 * to its lot. A1 merges details of all buildings into shared instanced meshes, so instances are assigned by position.
 */
export function measureBuildings(scene: THREE.Object3D, layout: CityLayout): Map<string, MeasuredBox> {
  const out = new Map<string, MeasuredBox>();
  const lots = layout.buildings.map(b => ({
    key: b.key,
    minX: b.x - b.w / 2,
    maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2,
    maxZ: b.z + b.d / 2,
  }));
  const grow = (key: string, box: THREE.Box3) => {
    const m = out.get(key);
    if (!m) out.set(key, { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, top: box.max.y });
    else {
      m.minX = Math.min(m.minX, box.min.x);
      m.maxX = Math.max(m.maxX, box.max.x);
      m.minZ = Math.min(m.minZ, box.min.z);
      m.maxZ = Math.max(m.maxZ, box.max.z);
      m.top = Math.max(m.top, box.max.y);
    }
  };
  const lotAt = (x: number, z: number) =>
    lots.find(l => x > l.minX - REACH && x < l.maxX + REACH && z > l.minZ - REACH && z < l.maxZ + REACH)?.key;

  const root = scene.getObjectByName('a1-buildings') ?? scene;
  const box = new THREE.Box3();
  const m4 = new THREE.Matrix4();
  root.updateWorldMatrix(true, true);
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.interior || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const local = mesh.geometry.boundingBox;
    if (!local) return;
    const tagged = findKey(mesh);
    const inst = mesh as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, m4);
        box.copy(local).applyMatrix4(m4.premultiply(mesh.matrixWorld));
        const key = tagged ?? lotAt((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2);
        if (key && box.max.y - box.min.y < 200) grow(key, box);
      }
    } else {
      box.copy(local).applyMatrix4(mesh.matrixWorld);
      const key = tagged ?? lotAt((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2);
      // A merged mesh spanning several lots (all signs in one mesh) belongs to no single building.
      if (key && box.max.x - box.min.x < 40 && box.max.z - box.min.z < 40) grow(key, box);
    }
  });
  return out;
}

function findKey(o: THREE.Object3D): string | undefined {
  for (let p: THREE.Object3D | null = o; p; p = p.parent)
    if (p.userData.buildingKey) return String(p.userData.buildingKey);
  return undefined;
}
