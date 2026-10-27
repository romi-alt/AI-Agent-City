'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CityLayout } from '../../types.ts';
import type { LifeClock } from '../clock.ts';
import type { LifeEnv } from '../env-adapter.ts';
import { fadingMaterial } from '../fade-material.ts';
import { LightPoints } from '../light-points.ts';
import { hideInstance, instanceAttr, Placer } from '../mesh-utils.ts';
import { AirTraffic, type AirSample } from './flights.ts';
import { airlinerGeometry, helicopterGeometry, rotorGeometry } from './models.ts';

interface Props {
  layout: CityLayout;
  clock: LifeClock;
  env: LifeEnv;
  aircraft: number;
  helicopters: number;
}

const PLANE_LIGHTS: [number, number, number, string, 'nav' | 'strobe' | 'beacon'][] = [
  [-1.9, -0.15, 5.4, '#ff2a2a', 'nav'],
  [-1.9, -0.15, -5.4, '#2aff6a', 'nav'],
  [-1.9, -0.15, 5.5, '#ffffff', 'strobe'],
  [-1.9, -0.15, -5.5, '#ffffff', 'strobe'],
  [0.2, -0.55, 0, '#ff3030', 'beacon'],
  [-6.3, 0.2, 0, '#ffffff', 'nav'],
];
const HELI_LIGHTS: [number, number, number, string, 'nav' | 'strobe' | 'beacon'][] = [
  [0.1, 0.55, 0.62, '#ff2a2a', 'nav'],
  [0.1, 0.55, -0.62, '#2aff6a', 'nav'],
  [-2.65, 1.6, 0, '#ffffff', 'strobe'],
  [0.3, 0.12, 0, '#ff3030', 'beacon'],
];

/** Airliners on the distant skyline and helicopters near it, with navigation lights and strobes. */
export function Air({ layout, clock, env, aircraft, helicopters }: Props) {
  const dpr = useThree(s => s.viewport.dpr);
  const built = useMemo(() => {
    const traffic = new AirTraffic(layout, { aircraft, helicopters });
    const planeMat = fadingMaterial('plane', { roughness: 0.35, metalness: 0.25 });
    const planes = new THREE.InstancedMesh(airlinerGeometry(), planeMat, Math.max(1, aircraft));
    planes.name = 'life-airliners';
    const heliMat = fadingMaterial('heli', { roughness: 0.4, metalness: 0.35 });
    const helis = new THREE.InstancedMesh(helicopterGeometry(), heliMat, Math.max(1, helicopters));
    helis.name = 'life-helicopters';
    const rotors = new THREE.InstancedMesh(rotorGeometry(), heliMat, Math.max(1, helicopters));
    rotors.name = 'life-rotors';
    for (const m of [planes, helis, rotors]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instanceAttr(m, 'iFade', 1);
      for (let i = 0; i < m.count; i++) hideInstance(m, i);
    }
    const lights = new LightPoints(aircraft * PLANE_LIGHTS.length + helicopters * HELI_LIGHTS.length + 4, 1);
    return { traffic, planes, helis, rotors, planeMat, heliMat, lights };
  }, [layout, aircraft, helicopters]);

  useEffect(() => {
    (built.lights.points.material as THREE.ShaderMaterial).uniforms.uPixelRatio!.value = dpr;
  }, [built, dpr]);
  useEffect(
    () => () => {
      for (const m of [built.planes, built.helis, built.rotors]) m.geometry.dispose();
      built.planeMat.dispose();
      built.heliMat.dispose();
      built.lights.dispose();
    },
    [built],
  );

  const tmp = useMemo(
    () => ({
      s: { active: false, x: 0, y: 0, z: 0, yaw: 0, bank: 0, fade: 0 } as AirSample,
      placer: new Placer(),
      v: new THREE.Vector3(),
      rot: new THREE.Matrix4(),
      off: new THREE.Matrix4(),
    }),
    [],
  );

  useFrame(() => {
    const t = clock.t;
    const { s, placer, v } = tmp;
    const night = env.nightFactor;
    const L = built.lights;
    L.begin();
    const lightAlpha = (kind: 'nav' | 'strobe' | 'beacon', phase: number) => {
      if (kind === 'nav') return 0.1 + night * 0.9;
      if (kind === 'strobe') {
        const f = (t * 0.85 + phase) % 1;
        return f < 0.04 || (f > 0.1 && f < 0.14) ? 0.5 + night * 0.5 : 0;
      }
      const f = (t + phase) % 1.1;
      return f < 0.18 ? 0.25 + night * 0.75 : 0;
    };
    const fadeP = built.planes.geometry.getAttribute('iFade') as THREE.InstancedBufferAttribute;
    for (let k = 0; k < aircraft; k++) {
      built.traffic.airliner(k, t, s);
      if (!s.active || s.fade <= 0) {
        hideInstance(built.planes, k);
        continue;
      }
      const m = placer.set(s.x, s.y, s.z, s.yaw, 1, s.bank, -0.02);
      built.planes.setMatrixAt(k, m);
      fadeP.setX(k, s.fade);
      for (const [x, y, z, c, kind] of PLANE_LIGHTS) {
        v.set(x, y, z).applyMatrix4(m);
        L.push(v.x, v.y, v.z, c, lightAlpha(kind, k * 0.37) * s.fade, kind === 'strobe' ? 20 : 12);
      }
    }
    const fadeH = built.helis.geometry.getAttribute('iFade') as THREE.InstancedBufferAttribute;
    const fadeR = built.rotors.geometry.getAttribute('iFade') as THREE.InstancedBufferAttribute;
    for (let k = 0; k < helicopters; k++) {
      built.traffic.helicopter(k, t, s);
      if (s.fade <= 0) {
        hideInstance(built.helis, k);
        hideInstance(built.rotors, k);
        continue;
      }
      const m = placer.set(s.x, s.y, s.z, s.yaw, 1, s.bank, -s.bank * 0.2 - 0.04);
      built.helis.setMatrixAt(k, m);
      tmp.off.makeTranslation(0.25, 1.54, 0);
      tmp.rot.makeRotationY(t * 19 + k);
      built.rotors.setMatrixAt(k, tmp.off.premultiply(m).multiply(tmp.rot));
      fadeH.setX(k, s.fade);
      fadeR.setX(k, s.fade);
      for (const [x, y, z, c, kind] of HELI_LIGHTS) {
        v.set(x, y, z).applyMatrix4(m);
        L.push(v.x, v.y, v.z, c, lightAlpha(kind, k * 0.53 + 0.2) * s.fade, kind === 'strobe' ? 18 : 10);
      }
    }
    L.end();
    for (const mesh of [built.planes, built.helis, built.rotors]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.getAttribute('iFade').needsUpdate = true;
    }
  });

  return (
    <group name="life-air">
      {aircraft > 0 && <primitive object={built.planes} />}
      {helicopters > 0 && <primitive object={built.helis} />}
      {helicopters > 0 && <primitive object={built.rotors} />}
      <primitive object={built.lights.points} />
    </group>
  );
}
