'use client';
import { useFrame } from '@react-three/fiber';
import { useContext, useEffect, useMemo } from 'react';
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { buildParts, disposeParts, type Part } from '../buildings/parts.ts';
import { useCity, useCityContext } from '../context.tsx';
import { type SharedUniforms, useEnvRuntime } from '../environment/palette.ts';
import { QUALITY } from '../quality/quality.ts';
import { planFurniture } from './furniture.ts';
import { createRoadMaterial, createSidewalkMaterial } from './ground.ts';
import { CURB_H, extendedGrid } from './grid.ts';
import { planPlazas } from './plazas.ts';
import { type SignalLight, SignalSourceContext } from './signal-source.ts';
import { Trees } from './Trees.tsx';

/**
 * Roads, sidewalks and curbs, crossings, street lamps, traffic signals, street trees, plazas with a fountain,
 * benches and flags. Matches the legacy street geometry (road half-width 2, lanes at ±1, walking line at 2.7) so
 * A2's traffic and pedestrians line up. Owner: A1.
 */
export function Streets() {
  const { layout } = useCityContext();
  const rt = useEnvRuntime();
  const quality = useCity(s => s.quality);
  const budget = QUALITY[quality];
  const lampReach = budget.decorBuildingDetail === 'minimal' ? 70 : 110;
  const grid = useMemo(() => extendedGrid(layout.streets), [layout]);

  const { road, slabs } = useMemo(() => {
    const roadMat = createRoadMaterial(rt.uniforms, grid, lampReach);
    const road = new Mesh(new PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), roadMat);
    road.receiveShadow = true;
    road.name = 'a1-road';
    const slabMat = createSidewalkMaterial(rt.uniforms, grid, lampReach);
    const slabs = new InstancedMesh(new BoxGeometry(1, 1, 1), slabMat, grid.blocks.length);
    const m = new Matrix4();
    grid.blocks.forEach((b, i) =>
      slabs.setMatrixAt(
        i,
        m.compose(new Vector3(b.x, CURB_H / 2, b.z), new Quaternion(), new Vector3(b.half * 2, CURB_H, b.half * 2)),
      ),
    );
    slabs.instanceMatrix.needsUpdate = true;
    slabs.receiveShadow = true;
    slabs.computeBoundingSphere();
    slabs.name = 'a1-sidewalks';
    return { road, slabs };
  }, [rt, grid, lampReach]);
  useEffect(
    () => () => {
      for (const o of [road, slabs]) {
        o.geometry.dispose();
        (o.material as Material).dispose();
      }
    },
    [road, slabs],
  );

  const furniture = useMemo(() => planFurniture(layout, lampReach), [layout, lampReach]);
  const plazas = useMemo(() => planPlazas(), []);
  const trees = useMemo(() => [...furniture.trees, ...plazas.trees], [furniture, plazas]);

  return (
    <group name="a1-streets">
      <primitive object={road} />
      <primitive object={slabs} />
      <StreetParts lamps={furniture.lamps} signals={furniture.signals} plazaParts={plazas.parts} />
      <SignalHeads signals={furniture.signals} shared={rt.uniforms} />
      <Trees items={trees} shared={rt.uniforms} castShadow={budget.shadows} />
      {plazas.fountains.map(f => (
        <Fountain key={`${f.x},${f.z}`} x={f.x} z={f.z} r={f.r} shared={rt.uniforms} />
      ))}
      <Flags flags={plazas.flags} shared={rt.uniforms} />
    </group>
  );
}

/** Lamp posts, signal poles and housings, benches and plaza beds, instanced per shape and material. */
function StreetParts({
  lamps,
  signals,
  plazaParts,
}: {
  lamps: { x: number; z: number; ry: number }[];
  signals: { x: number; z: number; sx: 1 | -1; sz: 1 | -1 }[];
  plazaParts: Part[];
}) {
  const rt = useEnvRuntime();
  const mats = useMemo(
    () => ({
      pole: new MeshStandardMaterial({ color: '#2c3136', roughness: 0.5, metalness: 0.6 }),
      lampHead: new MeshStandardMaterial({
        color: '#d8d2c4',
        emissive: '#ffd59a',
        emissiveIntensity: 0,
        roughness: 0.4,
      }),
      housing: new MeshStandardMaterial({ color: '#2f3326', roughness: 0.6, metalness: 0.3 }),
      wood: new MeshStandardMaterial({ color: '#8a6446', roughness: 0.8 }),
      iron: new MeshStandardMaterial({ color: '#23272b', roughness: 0.5, metalness: 0.5 }),
      granite: new MeshStandardMaterial({ color: '#b9b6ae', roughness: 0.6 }),
      lawn: new MeshStandardMaterial({ color: '#5d9a48', roughness: 0.95 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) m.dispose();
    },
    [mats],
  );
  const group = useMemo(() => {
    const parts: Part[] = [...plazaParts];
    for (const l of lamps) {
      const c = Math.cos(l.ry);
      const s = Math.sin(l.ry);
      // Local +x (the arm) rotated by ry about y: (cos, -sin).
      const ax = (d: number): [number, number] => [l.x + d * c, l.z - d * s];
      parts.push({ shape: 'cyl', mat: 'pole', x: l.x, y: CURB_H + 2.15, z: l.z, sx: 0.12, sy: 4.3, sz: 0.12 });
      const [mx, mz] = ax(0.6);
      parts.push({ shape: 'box', mat: 'pole', x: mx, y: CURB_H + 4.28, z: mz, sx: 1.2, sy: 0.06, sz: 0.06, ry: l.ry });
      const [hx, hz] = ax(1.25);
      parts.push({
        shape: 'box',
        mat: 'lampHead',
        x: hx,
        y: CURB_H + 4.22,
        z: hz,
        sx: 0.55,
        sy: 0.09,
        sz: 0.24,
        ry: l.ry,
      });
    }
    for (const sg of signals) {
      parts.push({ shape: 'cyl', mat: 'pole', x: sg.x, y: CURB_H + 1.6, z: sg.z, sx: 0.14, sy: 3.2, sz: 0.14 });
      parts.push({
        shape: 'box',
        mat: 'housing',
        x: sg.x + sg.sx * 0.2,
        y: CURB_H + 2.75,
        z: sg.z,
        sx: 0.22,
        sy: 0.82,
        sz: 0.3,
      });
      parts.push({
        shape: 'box',
        mat: 'housing',
        x: sg.x,
        y: CURB_H + 2.75,
        z: sg.z + sg.sz * 0.2,
        sx: 0.3,
        sy: 0.82,
        sz: 0.22,
      });
    }
    const g = buildParts(parts, mats, { noShadow: new Set(['lampHead']) });
    g.traverse(o => {
      o.raycast = () => {};
    });
    return g;
  }, [lamps, signals, plazaParts, mats]);
  useEffect(() => () => disposeParts(group), [group]);
  useFrame(() => {
    mats.lampHead.emissiveIntensity = rt.state.nightFactor * 3.2;
  });
  return <primitive object={group} />;
}

const SIGNAL_COLORS: Record<SignalLight, string> = { r: '#ff3b2f', y: '#ffb627', g: '#2bd46f' };
const LIGHTS: SignalLight[] = ['r', 'y', 'g'];

/** The red/amber/green discs, one instanced mesh per (direction, colour), lit from the signal source. */
function SignalHeads({
  signals,
  shared,
}: {
  signals: { x: number; z: number; sx: 1 | -1; sz: 1 | -1 }[];
  shared: SharedUniforms;
}) {
  const source = useContext(SignalSourceContext);
  const heads = useMemo(() => {
    const geo = new SphereGeometry(0.085, 10, 8);
    const out: { axis: 'x' | 'z'; light: SignalLight; mesh: InstancedMesh; mat: MeshStandardMaterial }[] = [];
    const m = new Matrix4();
    for (const axis of ['x', 'z'] as const)
      LIGHTS.forEach((light, li) => {
        const mat = new MeshStandardMaterial({
          color: '#1a1a1a',
          emissive: SIGNAL_COLORS[light],
          emissiveIntensity: 0.05,
          roughness: 0.3,
        });
        const mesh = new InstancedMesh(geo, mat, signals.length);
        signals.forEach((sg, i) => {
          const y = CURB_H + 3.0 - li * 0.25;
          const pos =
            axis === 'x' ? new Vector3(sg.x + sg.sx * 0.32, y, sg.z) : new Vector3(sg.x, y, sg.z + sg.sz * 0.32);
          const flat = axis === 'x' ? new Vector3(0.5, 1, 1) : new Vector3(1, 1, 0.5);
          mesh.setMatrixAt(i, m.compose(pos, new Quaternion(), flat));
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.raycast = () => {};
        out.push({ axis, light, mesh, mat });
      });
    return { geo, out };
  }, [signals]);
  useEffect(
    () => () => {
      heads.geo.dispose();
      for (const h of heads.out) h.mat.dispose();
    },
    [heads],
  );
  useFrame(() => {
    const ph = source.phase(shared.uTime.value);
    for (const h of heads.out) h.mat.emissiveIntensity = ph[h.axis] === h.light ? 1.8 : 0.03;
  });
  return (
    <>
      {heads.out.map(h => (
        <primitive key={`${h.axis}${h.light}`} object={h.mesh} />
      ))}
    </>
  );
}

/** A granite fountain: basin, rippling water and a central jet that rises and falls. */
function Fountain({ x, z, r, shared }: { x: number; z: number; r: number; shared: SharedUniforms }) {
  const parts = useMemo(() => {
    const stone = new MeshStandardMaterial({ color: '#b9b4aa', roughness: 0.55 });
    const water = new MeshStandardMaterial({ color: '#1d3a46', roughness: 0.04, metalness: 0.3 });
    water.onBeforeCompile = shader => {
      shader.uniforms.uTime = shared.uTime;
      shader.uniforms.uMotion = shared.uMotion;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uMotion;')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            float t = uTime * uMotion;
            normal = normalize(normal + vec3(sin(gl_FragCoord.x * 0.08 + t * 3.0), 0.0, cos(gl_FragCoord.y * 0.09 - t * 2.4)) * 0.08);
          }`,
        );
    };
    water.customProgramCacheKey = () => 'a1-water';
    const jet = new MeshStandardMaterial({
      color: '#e8f2f5',
      transparent: true,
      opacity: 0.55,
      roughness: 0.2,
      depthWrite: false,
    });
    const basin = new Mesh(new CylinderGeometry(r, r + 0.15, 0.55, 40), stone);
    basin.position.set(x, CURB_H + 0.275, z);
    const pool = new Mesh(new CylinderGeometry(r - 0.18, r - 0.18, 0.04, 40), water);
    pool.position.set(x, CURB_H + 0.5, z);
    const bowl = new Mesh(new CylinderGeometry(0.75, 0.3, 0.35, 24), stone);
    bowl.position.set(x, CURB_H + 1.05, z);
    const stem = new Mesh(new CylinderGeometry(0.16, 0.22, 0.7, 12), stone);
    stem.position.set(x, CURB_H + 0.75, z);
    const spout = new Mesh(new CylinderGeometry(0.04, 0.16, 1, 12, 1, true).translate(0, 0.5, 0), jet);
    spout.position.set(x, CURB_H + 1.2, z);
    for (const o of [basin, bowl, stem]) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
    for (const o of [basin, pool, bowl, stem, spout]) o.raycast = () => {};
    return { stone, water, jet, basin, pool, bowl, stem, spout };
  }, [x, z, r, shared]);
  useEffect(
    () => () => {
      for (const o of [parts.basin, parts.pool, parts.bowl, parts.stem, parts.spout]) o.geometry.dispose();
      for (const mm of [parts.stone, parts.water, parts.jet]) mm.dispose();
    },
    [parts],
  );
  useFrame(() => {
    const t = shared.uTime.value;
    const h = shared.uMotion.value ? 1.6 + 0.35 * Math.sin(t * 1.7) + 0.15 * Math.sin(t * 4.3) : 1.6;
    parts.spout.scale.set(1, h, 1);
  });
  return (
    <>
      <primitive object={parts.basin} />
      <primitive object={parts.pool} />
      <primitive object={parts.stem} />
      <primitive object={parts.bowl} />
      <primitive object={parts.spout} />
    </>
  );
}

/** Flags on poles, waving in the vertex shader with their own phase. */
function Flags({
  flags,
  shared,
}: {
  flags: { x: number; z: number; h: number; color: string }[];
  shared: SharedUniforms;
}) {
  const { poles, cloth, poleMat, clothMat } = useMemo(() => {
    const poleMat = new MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.35, metalness: 0.8 });
    const clothMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, side: DoubleSide });
    clothMat.onBeforeCompile = shader => {
      shader.uniforms.uTime = shared.uTime;
      shader.uniforms.uMotion = shared.uMotion;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nuniform float uMotion;\nattribute float aPhase;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            float u = clamp(position.x / 1.8, 0.0, 1.0);
            float t = uTime * uMotion;
            transformed.z += (sin(position.x * 3.2 - t * 4.2 + aPhase) * 0.16 + sin(position.x * 5.1 - t * 6.1 + aPhase * 2.0) * 0.05) * u;
            transformed.y -= u * u * 0.08;
          }`,
        );
    };
    clothMat.customProgramCacheKey = () => 'a1-flag';
    const poles = new InstancedMesh(new CylinderGeometry(0.05, 0.07, 1, 8).translate(0, 0.5, 0), poleMat, flags.length);
    const clothGeo = new PlaneGeometry(1.8, 1.1, 14, 6).translate(0.9, -0.55, 0);
    clothGeo.setAttribute('aPhase', new InstancedBufferAttribute(new Float32Array(flags.map((_, i) => i * 1.9)), 1));
    const cloth = new InstancedMesh(clothGeo, clothMat, flags.length);
    const m = new Matrix4();
    const c = new Color();
    flags.forEach((f, i) => {
      poles.setMatrixAt(i, m.compose(new Vector3(f.x, CURB_H, f.z), new Quaternion(), new Vector3(1, f.h, 1)));
      // Flags stream toward +x (the prevailing breeze), facing the plaza.
      cloth.setMatrixAt(
        i,
        m.compose(new Vector3(f.x + 0.05, CURB_H + f.h - 0.1, f.z), new Quaternion(), new Vector3(1, 1, 1)),
      );
      cloth.setColorAt(i, c.set(f.color));
    });
    for (const mesh of [poles, cloth]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.computeBoundingSphere();
      mesh.raycast = () => {};
    }
    return { poles, cloth, poleMat, clothMat };
  }, [flags, shared]);
  useEffect(
    () => () => {
      poles.geometry.dispose();
      cloth.geometry.dispose();
      poleMat.dispose();
      clothMat.dispose();
    },
    [poles, cloth, poleMat, clothMat],
  );
  if (!flags.length) return null;
  return (
    <>
      <primitive object={poles} />
      <primitive object={cloth} />
    </>
  );
}
