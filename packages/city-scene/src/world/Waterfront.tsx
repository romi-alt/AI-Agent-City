'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useCity } from '../context.tsx';
import { useEnvRuntime } from '../environment/palette.ts';
import { QUALITY } from '../quality/quality.ts';
import { CITY_EXTENT } from '../streets/extent.ts';
import { createWaterMaterial } from '../streets/ground.ts';
import { type BoatKind, boatPose, bridgeCarPose, planBoats, planBridgeCars } from './fleet.ts';
import { Kit } from './kitbash.ts';
import { DECK_Y } from './fleet.ts';
import { bridgeGeometry, boatGeometry, pierGeometry } from './shapes.ts';
import { bankLine, RIVERS } from './waterfront.ts';

/** A flat ribbon between two bank lines at height y (facing up). */
function ribbon(a: [number, number][], b: [number, number][], y: number): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < a.length; i++) pos.push(a[i]![0], y, a[i]![1], b[i]![0], y, b[i]![1]);
  for (let i = 0; i < a.length - 1; i++) {
    const k = i * 2;
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute(
    'normal',
    new Float32BufferAttribute(
      new Float32Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.setIndex(idx);
  return g;
}

/** A vertical skirt under a bank line, from y0 up to y1 (the seawall's face). */
function skirt(a: [number, number][], y0: number, y1: number, face: 1 | -1): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const [x, z] of a) pos.push(x, y0, z, x, y1, z);
  for (let i = 0; i < a.length - 1; i++) {
    const k = i * 2;
    if (face === 1) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    else idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const Z0 = -CITY_EXTENT;
const Z1 = CITY_EXTENT;
const STEP = 10;

/** Water, seawalls, promenades and park strips of both rivers. */
function Rivers() {
  const rt = useEnvRuntime();
  const built = useMemo(() => {
    const water: BufferGeometry[] = [];
    const wall: BufferGeometry[] = [];
    const walk: BufferGeometry[] = [];
    const grass: BufferGeometry[] = [];
    for (const r of RIVERS) {
      const line = (o: number) => bankLine(r, o, Z0, Z1, STEP);
      water.push(ribbon(line(-r.half), line(r.half), 0.07));
      for (const s of [-1, 1] as const) {
        const edge = s * r.half;
        wall.push(ribbon(line(edge), line(edge + s * 1.2), 0.5));
        wall.push(skirt(line(edge), 0.0, 0.5, s === 1 ? -1 : 1));
        walk.push(ribbon(line(edge + s * 1.2), line(edge + s * 6.5), 0.3));
        grass.push(ribbon(line(edge + s * 6.5), line(edge + s * 13), 0.22));
      }
    }
    const merge = (l: BufferGeometry[]) => {
      const g = mergeGeometries(l.map(x => (x.index ? x.toNonIndexed() : x)))!;
      for (const x of l) x.dispose();
      return g;
    };
    const mats = {
      water: createWaterMaterial(rt.uniforms, '#2b5872'),
      wall: new MeshStandardMaterial({ color: '#b3ada1', roughness: 0.85 }),
      walk: new MeshStandardMaterial({ color: '#9d9686', roughness: 0.9 }),
      grass: new MeshStandardMaterial({ color: '#486f3a', roughness: 0.95 }),
    };
    const meshes = {
      water: new Mesh(merge(water), mats.water),
      wall: new Mesh(merge(wall), mats.wall),
      walk: new Mesh(merge(walk), mats.walk),
      grass: new Mesh(merge(grass), mats.grass),
    };
    for (const m of Object.values(meshes)) {
      m.raycast = () => {};
      m.receiveShadow = false;
    }
    return { mats, meshes };
  }, [rt]);
  useEffect(
    () => () => {
      for (const m of Object.values(built.meshes)) m.geometry.dispose();
      for (const m of Object.values(built.mats)) m.dispose();
    },
    [built],
  );
  return (
    <group name="rivers">
      {Object.values(built.meshes).map(m => (
        <primitive key={m.id} object={m} />
      ))}
    </group>
  );
}

/** Quay lamps along both banks: instanced posts and heads that light up at night. */
function QuayLamps({ every }: { every: number }) {
  const rt = useEnvRuntime();
  const built = useMemo(() => {
    const spots: [number, number][] = [];
    for (const r of RIVERS)
      for (const s of [-1, 1]) {
        const pts = bankLine(r, s * (r.half + 4.2), Z0, Z1, every);
        spots.push(...pts);
      }
    const post = new InstancedMesh(
      new CylinderGeometry(0.07, 0.1, 3.4, 6).translate(0, 1.7, 0),
      new MeshStandardMaterial({ color: '#2b2f36' }),
      spots.length,
    );
    const headMat = new MeshStandardMaterial({ color: '#f3ecd8', emissive: '#ffd49a', emissiveIntensity: 0.2 });
    const head = new InstancedMesh(new SphereGeometry(0.26, 8, 6).translate(0, 3.5, 0), headMat, spots.length);
    const m = new Matrix4();
    spots.forEach(([x, z], i) => {
      m.makeTranslation(x, 0.3, z);
      post.setMatrixAt(i, m);
      head.setMatrixAt(i, m);
    });
    for (const mesh of [post, head]) {
      mesh.raycast = () => {};
      mesh.computeBoundingSphere();
    }
    return { post, head, headMat };
  }, [every]);
  useEffect(
    () => () => {
      for (const m of [built.post, built.head]) {
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
      }
    },
    [built],
  );
  useFrame(() => {
    built.headMat.emissiveIntensity = 0.1 + rt.state.nightFactor * 3;
  });
  return (
    <>
      <primitive object={built.post} />
      <primitive object={built.head} />
    </>
  );
}

/** Piers and bridges (static), their lamps, and the cars that cross. */
function Bridges({ carsPerBridge }: { carsPerBridge: number }) {
  const rt = useEnvRuntime();
  const built = useMemo(() => {
    const { structure, lamps } = bridgeGeometry();
    const steel = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
    const lampMat = new MeshBasicMaterial({ color: '#fff1d0', toneMapped: false });
    const structureMesh = new Mesh(structure, steel);
    const lampMesh = new Mesh(lamps, lampMat);
    const pierMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const pierMesh = new Mesh(pierGeometry(), pierMat);
    // A simple car for the bridge: dark glass over a tinted body (instance colour).
    const kit = new Kit().box(0, 0.35, 0, 2.1, 0.5, 0.95, '#ffffff').box(-0.15, 0.78, 0, 1.0, 0.36, 0.85, '#2a323c');
    const carMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 });
    const plan = planBridgeCars(carsPerBridge);
    const cars = new InstancedMesh(kit.build(), carMat, Math.max(1, plan.length));
    cars.count = plan.length;
    cars.instanceMatrix.setUsage(DynamicDrawUsage);
    const taxi = new Color('#f2b705');
    const rest = ['#3a3f47', '#d9dde3', '#2d3b57', '#7a2e2e', '#202226'].map(c => new Color(c));
    plan.forEach((c, i) => cars.setColorAt(i, c.taxi ? taxi : rest[i % rest.length]!));
    cars.frustumCulled = false;
    for (const m of [structureMesh, lampMesh, pierMesh, cars]) m.raycast = () => {};
    return { structureMesh, lampMesh, pierMesh, cars, plan, mats: [steel, lampMat, pierMat, carMat] };
  }, [carsPerBridge]);
  useEffect(
    () => () => {
      for (const m of [built.structureMesh, built.lampMesh, built.pierMesh, built.cars]) m.geometry.dispose();
      for (const m of built.mats) m.dispose();
    },
    [built],
  );
  const mx = useMemo(() => new Matrix4(), []);
  const q = useMemo(() => new Quaternion(), []);
  const one = useMemo(() => new Vector3(1, 1, 1), []);
  const at = useMemo(() => new Vector3(), []);
  const axis = useMemo(() => new Vector3(0, 1, 0), []);
  useFrame(() => {
    const t = rt.uniforms.uTime.value * rt.uniforms.uMotion.value;
    built.plan.forEach((c, i) => {
      const p = bridgeCarPose(c, t);
      q.setFromAxisAngle(axis, p.yaw);
      built.cars.setMatrixAt(i, mx.compose(at.set(p.x, DECK_Y + 0.1, p.z), q, one));
    });
    built.cars.instanceMatrix.needsUpdate = true;
  });
  return (
    <group name="bridges">
      <primitive object={built.structureMesh} />
      <primitive object={built.lampMesh} />
      <primitive object={built.pierMesh} />
      <primitive object={built.cars} />
    </group>
  );
}

const KINDS: BoatKind[] = ['speed', 'yacht', 'ferry', 'tug'];

/** Boats sailing both rivers, each kind one instanced mesh, with a pale wake behind every boat. */
function Boats({ count }: { count: number }) {
  const rt = useEnvRuntime();
  const built = useMemo(() => {
    const fleet = planBoats(count);
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 });
    const byKind = KINDS.map(kind => {
      const mine = fleet.filter(b => b.kind === kind);
      const mesh = new InstancedMesh(boatGeometry(kind), mat, Math.max(1, mine.length));
      mesh.count = mine.length;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      return { kind, mine, mesh };
    });
    const wakeMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false });
    const wakes = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), wakeMat, Math.max(1, fleet.length));
    wakes.count = fleet.length;
    wakes.instanceMatrix.setUsage(DynamicDrawUsage);
    wakes.frustumCulled = false;
    wakes.raycast = () => {};
    return { fleet, byKind, wakes, mats: [mat, wakeMat] };
  }, [count]);
  useEffect(
    () => () => {
      for (const k of built.byKind) k.mesh.geometry.dispose();
      built.wakes.geometry.dispose();
      for (const m of built.mats) m.dispose();
    },
    [built],
  );
  const mx = useMemo(() => new Matrix4(), []);
  const q = useMemo(() => new Quaternion(), []);
  const at = useMemo(() => new Vector3(), []);
  const sc = useMemo(() => new Vector3(), []);
  const axis = useMemo(() => new Vector3(0, 1, 0), []);
  const t0 = useRef(0);
  useFrame(() => {
    const t = rt.uniforms.uTime.value * rt.uniforms.uMotion.value + t0.current;
    let w = 0;
    for (const k of built.byKind) {
      k.mine.forEach((b, i) => {
        const p = boatPose(b, t);
        q.setFromAxisAngle(axis, p.yaw);
        k.mesh.setMatrixAt(
          i,
          mx.compose(at.set(p.x, 0.12 + Math.sin(t * 1.7 + b.phase * 40) * 0.05, p.z), q, sc.set(1, 1, 1)),
        );
        // The wake trails behind the stern, along the heading.
        const back = -b.length * 1.1;
        const wx = p.x + Math.cos(p.yaw) * back;
        const wz = p.z - Math.sin(p.yaw) * back;
        built.wakes.setMatrixAt(w++, mx.compose(at.set(wx, 0.1, wz), q, sc.set(b.length * 2.2, 1, b.length * 0.5)));
      });
      k.mesh.instanceMatrix.needsUpdate = true;
    }
    built.wakes.instanceMatrix.needsUpdate = true;
  });
  return (
    <group name="boats">
      {built.byKind.map(k => (
        <primitive key={k.kind} object={k.mesh} />
      ))}
      <primitive object={built.wakes} />
    </group>
  );
}

/**
 * The two rivers around the island (see `waterfront.ts`): water, seawalls, riverwalk, park strip, quay lamps, piers,
 * four bridges with traffic crossing, and a fleet of ferries, tugs, yachts and speedboats. Cheap at every quality:
 * about a dozen draw calls; low thins the lamps, cars and boats.
 */
export function Waterfront() {
  const quality = useCity(s => s.quality);
  const budget = QUALITY[quality];
  return (
    <group name="waterfront">
      <Rivers />
      <QuayLamps every={quality === 'low' ? 56 : 28} />
      <Bridges carsPerBridge={budget.bridgeCars} />
      <Boats count={budget.boats} />
    </group>
  );
}
