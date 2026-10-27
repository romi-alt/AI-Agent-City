'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { LifeEnv } from '../env-adapter.ts';
import { ROAD_Y } from '../geometry.ts';
import { hideInstance, instanceAttr, Placer } from '../mesh-utils.ts';
import { createRng } from '../rng.ts';
import type { StreetSim } from '../street-sim.ts';
import { VEHICLE_KINDS, type VehicleKind } from './sim.ts';
import { PAINTS, VEHICLE_EMISSIVE, VEHICLE_FRAGMENT_HEAD, VEHICLE_VERTEX_HEAD, vehicleGeometry } from './vehicles.ts';

interface Props {
  sim: StreetSim;
  env: LifeEnv;
  shadows: boolean;
  /** Headlight pools on the road at night (skipped on the lowest quality). */
  pools: boolean;
  /** Flashing beacons and brake-light changes stop with reduced motion. */
  animate: boolean;
}

function vehicleMaterial(uniforms: { uNight: THREE.IUniform<number>; uTime: THREE.IUniform<number> }) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.3 });
  m.onBeforeCompile = shader => {
    shader.uniforms.uNight = uniforms.uNight;
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader =
      VEHICLE_VERTEX_HEAD +
      shader.vertexShader.replace(
        '#include <color_vertex>',
        `vColor = vec4(color, 1.0);
#ifdef USE_INSTANCING_COLOR
      if (aSlot < 0.5) vColor.rgb *= instanceColor.rgb;
#endif
      vSlot = aSlot;
      vState = iState;`,
      );
    shader.fragmentShader =
      VEHICLE_FRAGMENT_HEAD +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' + VEHICLE_EMISSIVE,
      );
  };
  m.customProgramCacheKey = () => 'agentcity-vehicle';
  return m;
}

function poolTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,240,205,1)');
  grad.addColorStop(0.45, 'rgba(255,225,170,0.35)');
  grad.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Vehicles: one instanced mesh per kind (per-instance paint), plus additive headlight pools at night. */
export function Traffic({ sim, env, shadows, pools, animate }: Props) {
  const vehicles = sim.traffic.vehicles;
  const built = useMemo(() => {
    const uniforms = { uNight: { value: 0 }, uTime: { value: 0 } };
    const material = vehicleMaterial(uniforms);
    const rng = createRng(99);
    const meshes = new Map<VehicleKind, THREE.InstancedMesh>();
    const slot: number[] = [];
    const color = new THREE.Color();
    for (const kind of VEHICLE_KINDS) {
      const ofKind = vehicles.filter(v => v.kind === kind);
      if (!ofKind.length) continue;
      const mesh = new THREE.InstancedMesh(vehicleGeometry(kind), material, ofKind.length);
      mesh.name = `life-vehicles-${kind}`;
      mesh.frustumCulled = false;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instanceAttr(mesh, 'iState', 2);
      ofKind.forEach((v, i) => {
        slot[v.id] = i;
        const paints = PAINTS[kind];
        mesh.setColorAt(i, color.set(paints[Math.floor(rng() * paints.length)]!));
        (mesh.geometry.getAttribute('iState') as THREE.InstancedBufferAttribute).setY(i, rng());
      });
      meshes.set(kind, mesh);
    }
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      toneMapped: false,
    });
    const poolGeo = new THREE.PlaneGeometry(2.6, 1.5).rotateX(-Math.PI / 2).translate(1.9, 0, 0);
    const poolMesh = new THREE.InstancedMesh(poolGeo, poolMat, vehicles.length);
    poolMesh.name = 'life-headlight-pools';
    poolMesh.frustumCulled = false;
    poolMesh.renderOrder = 2;
    return { meshes, slot, uniforms, material, poolMesh, poolMat };
  }, [vehicles, shadows]);

  useEffect(
    () => () => {
      for (const m of built.meshes.values()) m.geometry.dispose();
      built.material.dispose();
      built.poolMesh.geometry.dispose();
      built.poolMat.map?.dispose();
      built.poolMat.dispose();
    },
    [built],
  );

  const placer = useMemo(() => new Placer(), []);
  useFrame(state => {
    built.uniforms.uNight.value = env.nightFactor;
    if (animate) built.uniforms.uTime.value = state.clock.elapsedTime;
    built.poolMat.opacity = pools ? Math.max(0, env.nightFactor - 0.25) * 0.75 : 0;
    built.poolMesh.visible = built.poolMat.opacity > 0.01;
    for (const v of vehicles) {
      const mesh = built.meshes.get(v.kind)!;
      const i = built.slot[v.id]!;
      const fade = v.active ? sim.traffic.edgeFade(v) : 0;
      if (fade <= 0) {
        hideInstance(mesh, i);
        hideInstance(built.poolMesh, v.id);
        continue;
      }
      const m = placer.set(v.pose.x, ROAD_Y, v.pose.z, v.pose.yaw, fade);
      mesh.setMatrixAt(i, m);
      built.poolMesh.setMatrixAt(v.id, placer.set(v.pose.x, ROAD_Y + 0.02, v.pose.z, v.pose.yaw, fade));
      (mesh.geometry.getAttribute('iState') as THREE.InstancedBufferAttribute).setX(i, v.brake);
    }
    for (const mesh of built.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.getAttribute('iState').needsUpdate = true;
    }
    built.poolMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group name="life-traffic">
      {[...built.meshes.values()].map(m => (
        <primitive key={m.name} object={m} />
      ))}
      {pools && <primitive object={built.poolMesh} />}
    </group>
  );
}
