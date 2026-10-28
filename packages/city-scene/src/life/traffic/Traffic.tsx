'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { LifeEnv } from '../env-adapter.ts';
import { ROAD_Y } from '../geometry.ts';
import { LightPoints } from '../light-points.ts';
import { instanceAttr, Placer } from '../mesh-utils.ts';
import { createRng } from '../rng.ts';
import type { StreetSim } from '../street-sim.ts';
import { VEHICLE_KINDS, VEHICLE_SPEC, type Vehicle, type VehicleKind } from './sim.ts';
import {
  PAINTS,
  type VehicleDetail,
  VEHICLE_EMISSIVE,
  VEHICLE_FRAGMENT_HEAD,
  VEHICLE_VERTEX_HEAD,
  vehicleGeometry,
  WHEEL_RADIUS,
} from './vehicles.ts';

interface Props {
  sim: StreetSim;
  env: LifeEnv;
  shadows: boolean;
  /** Headlight pools on the road at night (skipped on the lowest quality). */
  pools: boolean;
  /** Flashing beacons and brake-light changes stop with reduced motion. */
  animate: boolean;
  /** Model detail: `low` drops bevels and rims. */
  detail: VehicleDetail;
}

function vehicleMaterial(uniforms: { uNight: THREE.IUniform<number>; uTime: THREE.IUniform<number> }) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.2 });
  m.onBeforeCompile = shader => {
    shader.uniforms.uNight = uniforms.uNight;
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader =
      VEHICLE_VERTEX_HEAD +
      shader.vertexShader
        .replace(
          '#include <color_vertex>',
          `vColor = vec4(color, 1.0);
#ifdef USE_INSTANCING_COLOR
      if (aSlot < 0.5) vColor.rgb *= instanceColor.rgb;
      else if (aSlot > 7.5) vColor.rgb = min(vec3(1.0), instanceColor.rgb * 1.35 + 0.08);
#endif
      vSlot = aSlot;
      vState = iState;`,
        )
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = acRoll(vec3(normal), false);')
        .replace('#include <begin_vertex>', 'vec3 transformed = acRoll(vec3(position), true);');
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

/** Beyond this distance from the camera a vehicle is drawn with the low-detail model (no rims, bevels, trims). */
const NEAR = 70;
/** Vehicles farther than this are lost in the fog (and a few pixels long), so they are not drawn at all. */
const FAR = 420;

/** Body lean: radians per unit of acceleration (pitch) and of lateral acceleration (roll), and their limits. */
const PITCH_PER_ACCEL = 0.0065;
const PITCH_MAX = 0.04;
const ROLL_PER_LATERAL = 0.01;
const ROLL_MAX = 0.05;
/** Light points replace the lamp glow beyond LIGHT_MIN (the model's own lamps carry the near view). */
const LIGHT_MIN = 14;
const LIGHT_MAX = 330;

/** Two headlights and two tail lights of a vehicle at (x, z) facing its yaw, brighter and bigger when braking. */
function pushLights(lights: LightPoints, v: Vehicle, x: number, z: number, level: number, brake: number) {
  const { len, width } = VEHICLE_SPEC[v.kind];
  const fx = Math.cos(v.pose.yaw);
  const fz = -Math.sin(v.pose.yaw);
  const sx = Math.sin(v.pose.yaw);
  const sz = Math.cos(v.pose.yaw);
  const y = ROAD_Y + (v.kind === 'bus' ? 0.36 : 0.3);
  for (const side of [-1, 1]) {
    const s = side * width * 0.36;
    lights.push(x + fx * len * 0.5 + sx * s, y, z + fz * len * 0.5 + sz * s, '#fff1cf', level * 0.8, 5);
    lights.push(
      x - fx * len * 0.5 + sx * s,
      y,
      z - fz * len * 0.5 + sz * s,
      '#ff2a1c',
      level * (0.45 + brake * 0.5),
      4 + brake * 3,
    );
  }
}

interface Lod {
  mesh: THREE.InstancedMesh;
  state: THREE.InstancedBufferAttribute;
  /** Per-vehicle paint, copied into the instance slot it gets this frame. */
  paint: Map<number, THREE.Color>;
  n: number;
}

function lodMesh(kind: VehicleKind, detail: VehicleDetail, material: THREE.Material, count: number, name: string) {
  const mesh = new THREE.InstancedMesh(vehicleGeometry(kind, detail), material, count);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const state = instanceAttr(mesh, 'iState', 4);
  mesh.setColorAt(0, new THREE.Color());
  mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  return { mesh, state, paint: new Map<number, THREE.Color>(), n: 0 };
}

/**
 * Vehicles, instanced per kind and level of detail: full models near the camera (casting shadows), low-detail ones
 * farther out, none beyond the fog or outside the view. Instances are packed every frame so only drawn vehicles
 * cost anything. Additive headlight pools follow the near vehicles at night.
 */
export function Traffic({ sim, env, shadows, pools, animate, detail }: Props) {
  const vehicles = sim.traffic.vehicles;
  const built = useMemo(() => {
    const uniforms = { uNight: { value: 0 }, uTime: { value: 0 } };
    const material = vehicleMaterial(uniforms);
    const rng = createRng(99);
    const near = new Map<VehicleKind, Lod>();
    const far = new Map<VehicleKind, Lod>();
    const paint: THREE.Color[] = [];
    const beacon: number[] = [];
    for (const kind of VEHICLE_KINDS) {
      const ofKind = vehicles.filter(v => v.kind === kind);
      if (!ofKind.length) continue;
      const n = ofKind.length;
      const a = lodMesh(kind, detail, material, n, `life-vehicles-${kind}`);
      a.mesh.castShadow = shadows;
      a.mesh.receiveShadow = shadows;
      near.set(kind, a);
      if (detail !== 'low') far.set(kind, lodMesh(kind, 'low', material, n, `life-vehicles-${kind}-far`));
      for (const v of ofKind) {
        const paints = PAINTS[kind];
        paint[v.id] = new THREE.Color(paints[Math.floor(rng() * paints.length)]!);
        beacon[v.id] = rng();
      }
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
    // Distant headlights and tail lights: fixed-size glowing points, so a car 200 units away is still a light.
    const lights = new LightPoints(vehicles.length * 4, Math.min(2, window.devicePixelRatio || 1));
    lights.points.name = 'life-vehicle-lights';
    return { near, far, paint, beacon, uniforms, material, poolMesh, poolMat, lights };
  }, [vehicles, shadows, detail]);

  useEffect(
    () => () => {
      for (const l of [...built.near.values(), ...built.far.values()]) l.mesh.geometry.dispose();
      built.material.dispose();
      built.poolMesh.geometry.dispose();
      built.poolMat.map?.dispose();
      built.poolMat.dispose();
      built.lights.dispose();
    },
    [built],
  );

  const tmp = useMemo(
    () => ({ placer: new Placer(), frustum: new THREE.Frustum(), m: new THREE.Matrix4(), sphere: new THREE.Sphere() }),
    [],
  );
  useFrame(state => {
    const { near, far, poolMesh } = built;
    built.uniforms.uNight.value = env.nightFactor;
    if (animate) built.uniforms.uTime.value = state.clock.elapsedTime;
    built.poolMat.opacity = pools ? Math.max(0, env.nightFactor - 0.25) * 0.75 : 0;
    poolMesh.visible = built.poolMat.opacity > 0.01;
    const cam = state.camera as unknown as THREE.Camera;
    tmp.frustum.setFromProjectionMatrix(tmp.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const cx = cam.position.x;
    const cy = cam.position.y;
    const cz = cam.position.z;
    for (const l of near.values()) l.n = 0;
    for (const l of far.values()) l.n = 0;
    let poolCount = 0;
    const night = env.nightFactor;
    const lit = pools && night > 0.2;
    built.lights.begin();
    for (const v of vehicles) {
      const fade = v.active ? sim.traffic.edgeFade(v) : 0;
      if (fade <= 0) continue;
      const d = Math.hypot(v.pose.x - cx, cy, v.pose.z - cz);
      if (d > FAR) continue;
      // Near vehicles keep a margin outside the view, so their shadows still fall into it.
      tmp.sphere.center.set(v.pose.x, ROAD_Y + 0.5, v.pose.z);
      tmp.sphere.radius = d < NEAR ? 6 : 2.5;
      if (!tmp.frustum.intersectsSphere(tmp.sphere)) continue;
      const lod = (d < NEAR ? near : far).get(v.kind) ?? near.get(v.kind)!;
      const i = lod.n++;
      const off = sim.traffic.laneOffset(v);
      // The body leans with the car: nose down under braking, up under power, outward in a turn.
      const pitch = animate ? Math.max(-PITCH_MAX, Math.min(PITCH_MAX, v.a * PITCH_PER_ACCEL)) : 0;
      const roll = animate ? Math.max(-ROLL_MAX, Math.min(ROLL_MAX, v.v * v.yawRate * ROLL_PER_LATERAL)) : 0;
      const px = v.pose.x + Math.sin(v.pose.yaw) * off;
      const pz = v.pose.z + Math.cos(v.pose.yaw) * off;
      lod.mesh.setMatrixAt(i, tmp.placer.set(px, ROAD_Y, pz, v.pose.yaw, 1, roll, pitch));
      if (lit && d > LIGHT_MIN && d < LIGHT_MAX)
        pushLights(built.lights, v, px, pz, night * fade, animate ? v.brake : 0);
      lod.mesh.setColorAt(i, built.paint[v.id]!);
      const turn = 2 * Math.PI * WHEEL_RADIUS[v.kind];
      lod.state.setXYZW(i, v.brake, built.beacon[v.id]!, v.odo % turn, fade);
      if (d < NEAR && poolMesh.visible)
        poolMesh.setMatrixAt(poolCount++, tmp.placer.set(px, ROAD_Y + 0.02, pz, v.pose.yaw, fade));
    }
    built.lights.end();
    for (const l of [...near.values(), ...far.values()]) {
      l.mesh.count = l.n;
      l.mesh.instanceMatrix.needsUpdate = true;
      l.mesh.instanceColor!.needsUpdate = true;
      l.state.needsUpdate = true;
    }
    poolMesh.count = poolCount;
    poolMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group name="life-traffic">
      {[...built.near.values(), ...built.far.values()].map(l => (
        <primitive key={l.mesh.name} object={l.mesh} />
      ))}
      {pools && <primitive object={built.poolMesh} />}
      {pools && <primitive object={built.lights.points} />}
    </group>
  );
}
