'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CityLayout } from '../../types.ts';
import type { LifeClock } from '../clock.ts';
import { hideInstance, instanceAttr, Placer } from '../mesh-utils.ts';
import { createRng } from '../rng.ts';
import { Boids, type BirdView } from './boids.ts';
import { BIRD_VERTEX_HEAD, birdGeometry } from './model.ts';
import { birdWorld } from './obstacles.ts';

interface Props {
  layout: CityLayout;
  clock: LifeClock;
  count: number;
  /** Reduced motion: only resting birds are shown, wings folded. */
  still: boolean;
}

const PIGEONS = ['#8d939b', '#7a8088', '#9ea3a8', '#5f646b', '#b4b0a8', '#6d6a66', '#83878c'];
/** Simulated seconds run before the first frame, so flocks are spread over their routines. */
const WARM_UP = 30;

/** Pigeon flocks (boids) flying over rooftops and down street canyons, landing on roof edges: one instanced draw. */
export function Birds({ layout, clock, count, still }: Props) {
  const built = useMemo(() => {
    const boids = new Boids(layout, birdWorld(layout), { count });
    boids.advance(WARM_UP);
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
    for (let i = 0; i < mesh.count; i++) {
      mesh.setColorAt(i, c.set(PIGEONS[Math.floor(rng() * PIGEONS.length)]!));
      attr.setXYZW(i, rng() * 6.28, 0, 6, 1);
      hideInstance(mesh, i);
    }
    return { boids, mesh, mat, uTime, attr };
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
      v: { x: 0, y: 0, z: 0, yaw: 0, bank: 0, pitch: 0, flap: 0, rate: 6, perched: 1, scale: 1 } as BirdView,
      placer: new Placer(),
    }),
    [],
  );
  useFrame(() => {
    const t = WARM_UP + clock.t;
    const { boids, mesh, attr } = built;
    boids.advance(t);
    const alpha = boids.alpha(t);
    // Wing beats run on a per-bird phase accumulated from its own beat rate, so a change of rate never jumps.
    built.uTime.value = 0;
    let k = 0;
    boids.flocks.forEach((f, fi) =>
      f.birds.forEach((_, i) => {
        const s = boids.view(fi, i, alpha, tmp.v);
        if (still && s.perched < 1) {
          hideInstance(mesh, k);
          k++;
          return;
        }
        mesh.setMatrixAt(k, tmp.placer.set(s.x, s.y + 0.03 * s.scale, s.z, s.yaw, s.scale * 1.1, s.bank, s.pitch));
        const phase = attr.getX(k) + (still ? 0 : clock.dt * s.rate * Math.PI * 2);
        attr.setXYZW(k, phase % (Math.PI * 2000), still ? 0 : s.flap, 0, s.perched);
        k++;
      }),
    );
    mesh.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
  });

  return <primitive object={built.mesh} />;
}
