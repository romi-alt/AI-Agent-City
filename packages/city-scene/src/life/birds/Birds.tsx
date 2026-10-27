'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CityLayout } from '../../types.ts';
import type { LifeClock } from '../clock.ts';
import { hideInstance, instanceAttr, Placer } from '../mesh-utils.ts';
import { createRng } from '../rng.ts';
import { Birds as Flocks, type BirdSample } from './flock.ts';
import { BIRD_VERTEX_HEAD, birdGeometry } from './model.ts';

interface Props {
  layout: CityLayout;
  clock: LifeClock;
  count: number;
  /** Reduced motion: only resting birds are shown, wings folded. */
  still: boolean;
}

const PIGEONS = ['#8d939b', '#7a8088', '#9ea3a8', '#5f646b', '#b4b0a8', '#6d6a66'];

/** Pigeon flocks hopping between rooftops and a few gulls soaring above the towers: one instanced draw. */
export function Birds({ layout, clock, count, still }: Props) {
  const built = useMemo(() => {
    const flocks = new Flocks(layout, { count });
    const uTime = { value: 0 };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    mat.onBeforeCompile = shader => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = (BIRD_VERTEX_HEAD + shader.vertexShader)
        .replace(
          '#include <beginnormal_vertex>',
          'vec3 objectNormal = vec3(normal);\n{ vec3 bdP = vec3(position); bdPose(bdP, objectNormal); }',
        )
        .replace(
          '#include <begin_vertex>',
          'vec3 transformed = vec3(position);\n{ vec3 bdN = vec3(0.0, 1.0, 0.0); bdPose(transformed, bdN); }',
        );
    };
    mat.customProgramCacheKey = () => 'agentcity-bird';
    const mesh = new THREE.InstancedMesh(birdGeometry(), mat, Math.max(1, count));
    mesh.name = 'life-birds';
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const attr = instanceAttr(mesh, 'iBird', 4);
    const rng = createRng(4242);
    const c = new THREE.Color();
    const roofBirds = count - flocks.soarers.length;
    for (let i = 0; i < mesh.count; i++) {
      mesh.setColorAt(i, c.set(i >= roofBirds ? '#f4f4f2' : PIGEONS[Math.floor(rng() * PIGEONS.length)]!));
      attr.setXYZW(i, rng() * 6.28, 0, 6, 1);
      hideInstance(mesh, i);
    }
    return { flocks, mesh, mat, uTime, attr };
  }, [layout, count]);

  useEffect(
    () => () => {
      built.mesh.geometry.dispose();
      built.mat.dispose();
    },
    [built],
  );

  const tmp = useMemo(
    () => ({
      s: { x: 0, y: 0, z: 0, yaw: 0, bank: 0, flap: 0, rate: 6, perched: 1, scale: 1 } as BirdSample,
      placer: new Placer(),
    }),
    [],
  );
  useFrame(() => {
    const t = clock.t;
    built.uTime.value = t;
    const { mesh, attr } = built;
    built.flocks.all(
      t,
      (s, i) => {
        if (still && s.perched < 1) {
          hideInstance(mesh, i);
          return;
        }
        mesh.setMatrixAt(i, tmp.placer.set(s.x, s.y + 0.04 * s.scale, s.z, s.yaw, s.scale * 1.15, s.bank));
        attr.setY(i, still ? 0 : s.flap);
        attr.setZ(i, s.rate);
        // Fold and unfold over a few frames rather than snapping.
        const w = attr.getW(i);
        attr.setW(i, w + (s.perched - w) * Math.min(1, clock.dt * 8 + (still ? 1 : 0)));
      },
      tmp.s,
    );
    mesh.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
  });

  return <primitive object={built.mesh} />;
}
