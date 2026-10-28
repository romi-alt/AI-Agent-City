'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { measureBuildings } from '../camera/measure.ts';
import { dampFactor } from '../camera/math.ts';
import { floorLift, liveExplode } from '../camera/explode.ts';
import { useCityContext } from '../context.tsx';
import type { CityLayout } from '../types.ts';

/**
 * Cuts one building open above a floor, like a section drawing. A1 merges the details of every building (crowns,
 * spires, signs, rooftop planting) into shared instanced meshes, so the cut is a region of space rather than a set
 * of meshes: five clipping planes with `clipIntersection` remove whatever lies above the cut height *and* inside
 * the building's lot (measured, so canopies and crowns are included). The planes go on the materials of the
 * architecture near that lot; nothing else in the city occupies that volume. The cut slides down from the roof.
 */
export function useBuildingCut(
  layout: CityLayout,
  key: string | null,
  cutY: number | null,
  instant: boolean,
  level = 1,
) {
  const { scene: sceneR3f, gl } = useThree();
  const { store } = useCityContext();
  const scene = sceneR3f as unknown as THREE.Scene;
  const planes = useMemo(
    () => [
      new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
      new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      // Top of the cut region: open (far above). With exploded floors the opened floor rides on top of the
      // separated stack below it, so everything above it stays removed and the room can be seen from above.
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -1e4),
    ],
    [],
  );
  const height = useRef(1e4);
  const top = useRef(1e4);
  const patched = useRef(
    new Map<THREE.Material, { planes: THREE.Plane[] | null; intersect: boolean; shadows: boolean }>(),
  );
  const since = useRef(0);

  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  const restore = () => {
    for (const [mat, prev] of patched.current) {
      mat.clippingPlanes = prev.planes;
      mat.clipIntersection = prev.intersect;
      mat.clipShadows = prev.shadows;
      mat.needsUpdate = true;
    }
    patched.current.clear();
  };

  /** Put the planes on every architecture material whose mesh reaches into the cut region. */
  const apply = (region: THREE.Box3) => {
    // A1's architecture, plus A2's rooftop details (fans, beacon masts, billboards) standing on the opened roof.
    const roots = [scene.getObjectByName('a1-buildings') ?? scene, scene.getObjectByName('life-details')].filter(
      (o): o is THREE.Object3D => !!o,
    );
    const box = new THREE.Box3();
    for (const root of roots)
      root.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData.interior || mesh.userData.noPick || !mesh.geometry) return;
        const inst = mesh as THREE.InstancedMesh;
        if (inst.isInstancedMesh) {
          if (!inst.boundingBox) inst.computeBoundingBox();
          box.copy(inst.boundingBox!).applyMatrix4(mesh.matrixWorld);
        } else {
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
        }
        if (!box.intersectsBox(region)) return;
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (patched.current.has(mat)) continue;
          patched.current.set(mat, {
            planes: mat.clippingPlanes,
            intersect: mat.clipIntersection,
            shadows: mat.clipShadows,
          });
          mat.clippingPlanes = planes;
          mat.clipIntersection = true;
          mat.clipShadows = true;
          mat.needsUpdate = true;
        }
      });
  };

  const region = useRef<THREE.Box3 | null>(null);
  useEffect(() => {
    if (key === null || cutY === null) {
      restore();
      region.current = null;
      height.current = 1e4;
      return;
    }
    const lot = layout.buildings.find(b => b.key === key);
    if (!lot) return;
    const m = measureBuildings(scene, layout).get(key);
    const pad = 0.3;
    const minX = Math.min(lot.x - lot.w / 2, m?.minX ?? Infinity) - pad;
    const maxX = Math.max(lot.x + lot.w / 2, m?.maxX ?? -Infinity) + pad;
    const minZ = Math.min(lot.z - lot.d / 2, m?.minZ ?? Infinity) - pad;
    const maxZ = Math.max(lot.z + lot.d / 2, m?.maxZ ?? -Infinity) + pad;
    top.current = (m?.top ?? lot.floors.length * 1.4) + 2;
    planes[1]!.constant = minX;
    planes[2]!.constant = -maxX;
    planes[3]!.constant = minZ;
    planes[4]!.constant = -maxZ;
    region.current = new THREE.Box3(new THREE.Vector3(minX, cutY, minZ), new THREE.Vector3(maxX, 1e4, maxZ));
    // A new building starts the reveal from its roof; moving between floors slides the cut from where it is.
    height.current = instant ? cutY : Math.min(height.current, top.current);
    since.current = 0;
    apply(region.current);
    return restore;
  }, [key, cutY === null, layout]);

  useFrame((_, dt) => {
    if (key === null || cutY === null || !region.current) return;
    // Architecture that mounts after the cut started (quality change, streamed detail) is picked up too.
    since.current += dt;
    if (since.current > 1.5 && since.current - dt <= 1.5) apply(region.current);
    const t = key ? liveExplode(store, key) : 0;
    const bottom = cutY + (key ? floorLift(key, level, t) : 0);
    region.current.min.y = bottom;
    const k = instant ? 1 : dampFactor(3.2, dt);
    height.current += (bottom - height.current) * k;
    planes[0]!.constant = height.current;
  });
}
