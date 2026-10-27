'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SIDEWALK_Y } from '../geometry.ts';
import { instanceAttr, PartBuilder, Placer } from '../mesh-utils.ts';
import { createRng } from '../rng.ts';
import type { StreetSim } from '../street-sim.ts';
import { BODY, personGeometry, personLook, personMaterials } from './body.ts';
import { MODE } from './sim.ts';

/**
 * People are drawn at 85% of the body model: still a little larger than life next to the legacy-scale cars, so
 * they read from the default camera, but no longer giants beside them.
 */
export const PERSON_SCALE = 0.85;
/** Seat height of the benches (above the sidewalk): a seated person's lower leg reaches the ground. */
const SEAT = 0.29 * PERSON_SCALE;

function benchGeometry(benches: { x: number; z: number; yaw: number }[]) {
  const b = new PartBuilder();
  for (const bench of benches) {
    const c = Math.cos(bench.yaw);
    const s = -Math.sin(bench.yaw);
    // Local frame: +x forward (where the sitter faces), z along the bench.
    const at = (fx: number, y: number, fz: number): [number, number, number] => [
      bench.x + c * fx - s * fz,
      SIDEWALK_Y + y,
      bench.z + s * fx + c * fz,
    ];
    const rot: [number, number, number] = [0, bench.yaw, 0];
    b.add(new THREE.BoxGeometry(0.36, 0.05, 1.5), { at: at(0, SEAT - 0.025, 0), rot, color: '#7a5a3c' });
    b.add(new THREE.BoxGeometry(0.05, 0.3, 1.5), {
      at: at(-0.2, SEAT + 0.17, 0),
      rot: [0, bench.yaw, 0.12],
      color: '#7a5a3c',
    });
    for (const fz of [-0.62, 0.62])
      b.add(new THREE.BoxGeometry(0.34, SEAT, 0.05), { at: at(0, SEAT / 2, fz), rot, color: '#2e3135' });
  }
  return b.build();
}

interface Props {
  sim: StreetSim;
  shadows: boolean;
  /** Limb animation runs only when true (paused or reduced motion: people hold a calm standing pose). */
  animate: boolean;
}

/** Everyone on foot: one instanced draw for all bodies (posed in the vertex shader) and one for the benches. */
export function People({ sim, shadows, animate }: Props) {
  const poses = sim.people.poses;
  const built = useMemo(() => {
    const uTime = { value: 0 };
    const mats = personMaterials(uTime);
    const mesh = new THREE.InstancedMesh(personGeometry(), mats.color, poses.length);
    mesh.name = 'life-people';
    mesh.customDepthMaterial = mats.depth;
    mesh.castShadow = shadows;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const top = instanceAttr(mesh, 'iTop', 4);
    const bottom = instanceAttr(mesh, 'iBottom', 4);
    const skin = instanceAttr(mesh, 'iSkin', 4);
    const hair = instanceAttr(mesh, 'iHair', 4);
    const anim = instanceAttr(mesh, 'iAnim', 4);
    const rng = createRng(1234);
    const c = new THREE.Color();
    const set = (a: THREE.InstancedBufferAttribute, i: number, hex: string, w: number) => {
      c.set(hex);
      a.setXYZW(i, c.r, c.g, c.b, w);
    };
    poses.forEach((p, i) => {
      const look = personLook(rng);
      // Rooftop workers wear high-visibility orange and a hard hat.
      const worker = p.y > 2;
      set(top, i, worker ? '#ff7a1a' : look.top, worker ? 0 : look.coat);
      set(bottom, i, look.bottom, worker ? 0 : look.bag);
      set(skin, i, look.skin, worker ? 0 : look.longHair);
      set(hair, i, worker ? '#f5c518' : look.hair, 0);
      anim.setXYZW(i, p.phase, 0, p.mode, rng() * 10);
    });
    const benches = sim.people.benches.length
      ? new THREE.Mesh(
          benchGeometry(sim.people.benches),
          new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
        )
      : null;
    if (benches) {
      benches.name = 'life-benches';
      benches.castShadow = shadows;
      benches.receiveShadow = shadows;
    }
    return { mesh, mats, uTime, anim, benches };
  }, [poses, sim.people.benches, shadows]);

  useEffect(
    () => () => {
      built.mesh.geometry.dispose();
      built.mats.color.dispose();
      built.mats.depth.dispose();
      if (built.benches) {
        built.benches.geometry.dispose();
        (built.benches.material as THREE.Material).dispose();
      }
    },
    [built],
  );

  const placer = useMemo(() => new Placer(), []);
  useFrame(state => {
    if (animate) built.uTime.value = state.clock.elapsedTime;
    const { mesh, anim } = built;
    poses.forEach((p, i) => {
      const seated = p.mode === MODE.seated;
      const k = p.scale * PERSON_SCALE;
      const y = seated ? SIDEWALK_Y + SEAT + (0.065 - BODY.hip) * k : p.y;
      const back = seated ? -0.12 : 0;
      mesh.setMatrixAt(i, placer.set(p.x + Math.cos(p.yaw) * back, y, p.z - Math.sin(p.yaw) * back, p.yaw, k));
      anim.setX(i, p.phase);
      anim.setY(i, animate ? p.gait : 0);
      anim.setZ(i, p.mode);
    });
    mesh.instanceMatrix.needsUpdate = true;
    anim.needsUpdate = true;
  });

  return (
    <group name="life-people">
      <primitive object={built.mesh} />
      {built.benches && <primitive object={built.benches} />}
    </group>
  );
}
