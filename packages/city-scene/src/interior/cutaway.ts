'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { dampFactor } from '../camera/math.ts';

/**
 * Cuts one building open at a height: every mesh under an object tagged `userData.buildingKey === key` (A1's
 * architecture) gets a clipping plane, animated down from the roof so the floor is revealed like a section drawing.
 * Materials are cloned per mesh (they may be shared with other buildings) and restored when the cut ends.
 *
 * Instanced meshes shared by several buildings cannot be cut for one building; they are left alone.
 */
export function useBuildingCut(key: string | null, cutY: number | null, topY: number, instant: boolean) {
  const { scene: sceneR3f, gl } = useThree();
  const scene = sceneR3f as unknown as THREE.Scene;
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), topY), [topY]);
  const height = useRef(topY);
  const patched = useRef(new Map<THREE.Mesh, THREE.Material | THREE.Material[]>());
  const lastScan = useRef(-1);

  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  const restore = () => {
    for (const [mesh, original] of patched.current) {
      const cloned = mesh.material;
      mesh.material = original;
      for (const c of Array.isArray(cloned) ? cloned : [cloned]) c.dispose();
    }
    patched.current.clear();
  };

  const scan = () => {
    if (!key) return;
    scene.traverse(o => {
      if (o.userData.buildingKey !== key) return;
      o.traverse(child => {
        const mesh = child as unknown as THREE.Mesh;
        if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || patched.current.has(mesh)) return;
        if (mesh.userData.interior) return;
        const original = mesh.material;
        const clone = (mat: THREE.Material) => {
          const c = mat.clone();
          c.clippingPlanes = [plane];
          c.clipShadows = true;
          return c;
        };
        mesh.material = Array.isArray(original) ? original.map(clone) : clone(original);
        patched.current.set(mesh, original);
      });
    });
  };

  useEffect(() => {
    if (key === null || cutY === null) {
      restore();
      return;
    }
    if (instant) height.current = cutY;
    else if (height.current < cutY) height.current = topY;
    scan();
    lastScan.current = 0;
    return restore;
    // A new building or a new cut restarts the reveal.
  }, [key, cutY === null, plane]);

  useFrame((_, dt) => {
    if (key === null || cutY === null) return;
    // Architecture may mount after the cut starts (streamed detail): pick it up during the first seconds.
    lastScan.current += dt;
    if (lastScan.current < 3 && Math.round(lastScan.current * 4) !== Math.round((lastScan.current - dt) * 4)) scan();
    const k = instant ? 1 : dampFactor(3.2, dt);
    height.current += (cutY - height.current) * k;
    plane.constant = height.current;
  });
}
