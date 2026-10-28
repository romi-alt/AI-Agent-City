'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CityLayout } from '../../types.ts';
import type { LifeClock } from '../clock.ts';
import { hideInstance, instanceAttr, Placer } from '../mesh-utils.ts';
import { createRng } from '../rng.ts';
import { tallestRoof } from '../geometry.ts';
import { Boids, type BirdView } from './boids.ts';
import { CrossingFlocks, type CrossingBird } from './crossing.ts';
import { BIRD_VERTEX_HEAD, birdGeometry } from './model.ts';
import { birdWorld } from './obstacles.ts';

interface Props {
  layout: CityLayout;
  clock: LifeClock;
  count: number;
  /** Reduced motion: only resting birds are shown, wings folded. */
  still: boolean;
}

/** Tints over the painted plumage: most birds grey, a few browner or darker. */
const PIGEONS = ['#ffffff', '#f2f2f0', '#e6e7e9', '#d9dbde', '#efe4d6', '#b9bdc3', '#ffffff'];
/** Model-to-world scale: a 0.66-unit model wingspan becomes about 0.26 units (a real 0.65 m pigeon). */
const BIRD_SCALE = 0.4;
/** Gulls and geese crossing the city: a 0.66-unit model wingspan drawn at full size, about 1.65 m. */
const CROSSING_SCALE = 1;
/** Crossing birds read as dark silhouettes against the pale sky (the tint multiplies the painted plumage). */
const CROSSING_TINTS = ['#8a8580', '#7b766f', '#96918a', '#6f6a64'];
/** Passes start and end this far from the centre, deep in the fog. */
const CROSSING_RADIUS = 240;
/** Simulated seconds run before the first frame, so flocks are spread over their routines. */
const WARM_UP = 30;

/**
 * Pigeon flocks (boids) flying over rooftops and down street canyons, landing on roof edges, plus now and then a
 * loose flock of larger birds crossing the whole city high above the roofs: one instanced draw for all of them.
 */
export function Birds({ layout, clock, count, still }: Props) {
  const built = useMemo(() => {
    const world = birdWorld(layout);
    const boids = new Boids(layout, world, { count });
    boids.advance(WARM_UP);
    const crossing = new CrossingFlocks({
      flocks: count >= 60 ? 3 : count >= 30 ? 2 : 1,
      birdsPerFlock: count >= 30 ? 11 : 7,
      // The top of everything in the district, spires and crowns included.
      roof: world.obstacles.reduce((m, o) => Math.max(m, o.maxY), tallestRoof(layout)),
      radius: CROSSING_RADIUS,
    });
    const residents = count;
    const total = residents + crossing.count;
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
    const mesh = new THREE.InstancedMesh(birdGeometry(), mat, Math.max(1, total));
    mesh.name = 'life-birds';
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const attr = instanceAttr(mesh, 'iBird', 4);
    const rng = createRng(4242);
    const c = new THREE.Color();
    for (let i = 0; i < mesh.count; i++) {
      const tints = i < residents ? PIGEONS : CROSSING_TINTS;
      mesh.setColorAt(i, c.set(tints[Math.floor(rng() * tints.length)]!));
      attr.setXYZW(i, rng() * 6.28, 0, 6, 1);
      hideInstance(mesh, i);
    }
    return { boids, crossing, residents, mesh, mat, uTime, attr };
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
      c: { x: 0, y: 0, z: 0, yaw: 0, bank: 0, flap: 0, rate: 3, visible: 0 } as CrossingBird,
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
        mesh.setMatrixAt(
          k,
          tmp.placer.set(s.x, s.y + 0.012 * s.scale, s.z, s.yaw, s.scale * BIRD_SCALE, s.bank, s.pitch),
        );
        const phase = attr.getX(k) + (still ? 0 : clock.dt * s.rate * Math.PI * 2);
        attr.setXYZW(k, phase % (Math.PI * 2000), still ? 0 : s.flap, 0, s.perched);
        k++;
      }),
    );
    // Crossing flocks are in flight, so reduced motion hides them.
    built.crossing.flocks.forEach((f, fi) =>
      f.members.forEach((_, i) => {
        const b = built.crossing.view(fi, i, t, tmp.c);
        if (still || !b.visible) {
          hideInstance(mesh, k++);
          return;
        }
        mesh.setMatrixAt(k, tmp.placer.set(b.x, b.y, b.z, b.yaw, CROSSING_SCALE, b.bank, 0));
        const phase = attr.getX(k) + clock.dt * b.rate * Math.PI * 2;
        attr.setXYZW(k, phase % (Math.PI * 2000), b.flap * 0.8, 0, 0);
        k++;
      }),
    );
    mesh.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
  });

  return <primitive object={built.mesh} />;
}
