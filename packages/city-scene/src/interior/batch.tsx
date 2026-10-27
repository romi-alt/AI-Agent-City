'use client';
import { type ReactNode, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Static batching: after its children mount, merges every static mesh that shares a material into one mesh, so a
 * furnished office costs a few dozen draw calls instead of a thousand. Meshes marked `userData.dynamic` (animated
 * people, selection rings, hit areas) and multi-material meshes are left alone. Rebuilt when `version` changes.
 */
export function StaticBatch({ version, children }: { version: string; children: ReactNode }) {
  const root = useRef<THREE.Group>(null);
  const merged = useRef<THREE.Mesh[]>([]);

  useLayoutEffect(() => {
    const group = root.current;
    if (!group) return;
    const hidden: THREE.Mesh[] = [];
    group.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    group.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      // Skip anything dynamic, or under a dynamic parent.
      for (let p: THREE.Object3D | null = mesh; p && p !== group; p = p.parent) if (p.userData.dynamic) return;
      if (!mesh.visible) return;
      const g = mesh.geometry.index ? mesh.geometry.clone() : mesh.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
      for (const name of Object.keys(g.attributes))
        if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.index) {
        const n = g.attributes.position!.count;
        g.setIndex([...Array(n).keys()]);
      }
      const list = buckets.get(mesh.material) ?? [];
      list.push(g);
      buckets.set(mesh.material, list);
      hidden.push(mesh);
    });
    const out: THREE.Mesh[] = [];
    for (const [mat, geos] of buckets) {
      const geo = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      m.userData.batched = true;
      out.push(m);
    }
    // Only swap when merging worked for everything (otherwise keep the originals visible).
    for (const h of hidden) h.visible = false;
    for (const m of out) group.add(m);
    merged.current = out;
    return () => {
      for (const m of merged.current) {
        group.remove(m);
        m.geometry.dispose();
      }
      merged.current = [];
      for (const h of hidden) h.visible = true;
    };
  }, [version]);

  return <group ref={root as never}>{children}</group>;
}
