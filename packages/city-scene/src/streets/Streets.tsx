'use client';
import { useFrame } from '@react-three/fiber';
import { useContext, useEffect, useMemo } from 'react';
import {
  BoxGeometry,
  CircleGeometry,
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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildParts, disposeParts, type Part } from '../buildings/parts.ts';
import { useCity, useCityContext } from '../context.tsx';
import { type SharedUniforms, useEnvRuntime } from '../environment/palette.ts';
import { QUALITY } from '../quality/quality.ts';
import { planFurniture } from './furniture.ts';
import { createBlockMaterial, createFarGroundMaterial, createRoadMaterial, createWaterMaterial } from './ground.ts';
import { CURB_H, type CellKind, districtPlan, ROAD_HALF } from './grid.ts';
import { planLandscape } from './plazas.ts';
import { type SignalLight, SignalSourceContext } from './signal-source.ts';
import { Flags, Fountain } from './PlazaFeatures.tsx';
import { Trees } from './Trees.tsx';

const KIND: Record<CellKind, number> = { lot: 0, plaza: 1, park: 2, decor: 3, city: 4 };

/**
 * The city's ground (X04): one road grid to the horizon (merged strips with crisp markings), curbed sidewalk
 * blocks for every block of the city, the fountain plaza and one small park, street lamps, signals and street
 * trees in the district, and paving beyond the last road that dissolves into the fog — no edge, no water.
 * Street geometry matches the legacy street.ts so traffic and pedestrians line up. Owner: D1.
 */
export function Streets() {
  const { layout } = useCityContext();
  const rt = useEnvRuntime();
  const quality = useCity(s => s.quality);
  const budget = QUALITY[quality];
  const district = useMemo(() => districtPlan(layout.streets), [layout]);

  const { road, blocks, ground } = useMemo(() => {
    const R = district.extent + ROAD_HALF;
    const strips = [
      ...district.xs.map(x => new PlaneGeometry(ROAD_HALF * 2, R * 2).rotateX(-Math.PI / 2).translate(x, 0.012, 0)),
      ...district.zs.map(z => new PlaneGeometry(R * 2, ROAD_HALF * 2).rotateX(-Math.PI / 2).translate(0, 0.012, z)),
    ];
    const road = new Mesh(mergeGeometries(strips), createRoadMaterial(rt.uniforms, district));
    road.receiveShadow = true;
    road.name = 'a1-roads';
    const cells = district.cells;
    const blocks = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      createBlockMaterial(rt.uniforms, district),
      cells.length,
    );
    const kinds = new Float32Array(cells.length);
    const m = new Matrix4();
    cells.forEach((c, i) => {
      blocks.setMatrixAt(
        i,
        m.compose(new Vector3(c.cx, CURB_H / 2, c.cz), new Quaternion(), new Vector3(c.x1 - c.x0, CURB_H, c.z1 - c.z0)),
      );
      kinds[i] = KIND[c.kind];
    });
    blocks.geometry.setAttribute('aKind', new InstancedBufferAttribute(kinds, 1));
    blocks.instanceMatrix.needsUpdate = true;
    blocks.receiveShadow = true;
    blocks.computeBoundingSphere();
    blocks.name = 'a1-blocks';
    // Ground beyond the blocks: paving far past the last road, into the fog (no edge from any allowed view).
    const ground = new Mesh(
      new PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2).translate(0, -0.01, 0),
      createFarGroundMaterial(rt.uniforms, district),
    );
    ground.receiveShadow = true;
    ground.name = 'a1-ground';
    for (const o of [road, blocks, ground]) o.raycast = () => {};
    return { road, blocks, ground };
  }, [rt, district]);
  useEffect(
    () => () => {
      for (const o of [road, blocks, ground]) {
        o.geometry.dispose();
        (o.material as Material).dispose();
      }
    },
    [road, blocks, ground],
  );

  const furniture = useMemo(() => planFurniture(layout, district), [layout, district]);
  const land = useMemo(() => planLandscape(district), [district]);
  const trees = useMemo(() => [...furniture.trees, ...land.trees], [furniture, land]);

  return (
    <group name="a1-streets">
      <primitive object={ground} />
      <primitive object={road} />
      <primitive object={blocks} />
      <StreetParts lamps={furniture.lamps} signals={furniture.signals} extra={land.parts} />
      <SignalHeads signals={furniture.signals} shared={rt.uniforms} />
      <Trees items={trees} shared={rt.uniforms} castShadow={budget.shadows} />
      {land.fountains.map(f => (
        <Fountain key={`${f.x},${f.z}`} x={f.x} z={f.z} r={f.r} shared={rt.uniforms} />
      ))}
      <Flags flags={land.flags} shared={rt.uniforms} />
      <Ponds ponds={land.ponds} shared={rt.uniforms} />
    </group>
  );
}

/** Lamp posts, signal poles and housings, benches, beds, embankment and railing: instanced per shape and material. */
function StreetParts({
  lamps,
  signals,
  extra,
}: {
  lamps: { x: number; z: number; ry: number }[];
  signals: { x: number; z: number; sx: 1 | -1; sz: 1 | -1 }[];
  extra: Part[];
}) {
  const rt = useEnvRuntime();
  const mats = useMemo(
    () => ({
      pole: new MeshStandardMaterial({ color: '#30363c', roughness: 0.45, metalness: 0.7 }),
      lampHead: new MeshStandardMaterial({
        color: '#e6e1d6',
        emissive: '#ffd9a6',
        emissiveIntensity: 0,
        roughness: 0.4,
      }),
      housing: new MeshStandardMaterial({ color: '#2a2f33', roughness: 0.6, metalness: 0.3 }),
      wood: new MeshStandardMaterial({ color: '#a27650', roughness: 0.7 }),
      iron: new MeshStandardMaterial({ color: '#2a2e33', roughness: 0.45, metalness: 0.6 }),
      granite: new MeshStandardMaterial({ color: '#c9c5bc', roughness: 0.6 }),
      lawn: new MeshStandardMaterial({ color: '#4f8a3c', roughness: 0.95 }),
      stone: new MeshStandardMaterial({ color: '#b8b0a2', roughness: 0.8 }),
      paving: new MeshStandardMaterial({ color: '#cfc6b6', roughness: 0.85 }),
      coping: new MeshStandardMaterial({ color: '#dcd8cf', roughness: 0.5 }),
      soil: new MeshStandardMaterial({ color: '#4a3a2c', roughness: 1 }),
      hedge: new MeshStandardMaterial({ color: '#3d6e33', roughness: 0.95 }),
      shrub: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
      flower: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }),
      kioskGlass: new MeshStandardMaterial({
        color: '#41586a',
        roughness: 0.05,
        metalness: 0.4,
        emissive: '#ffcf94',
        emissiveIntensity: 0.35,
      }),
      canvas: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
      rubber: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }),
      paint: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0.2 }),
      line: new MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.8 }),
      net: new MeshStandardMaterial({ color: '#1d2125', roughness: 0.8, transparent: true, opacity: 0.6 }),
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
    const parts: Part[] = [...extra];
    for (const l of lamps) {
      const c = Math.cos(l.ry);
      const s = Math.sin(l.ry);
      // Local +x (the arm) rotated by ry about y: (cos, -sin).
      const ax = (d: number): [number, number] => [l.x + d * c, l.z - d * s];
      parts.push({ shape: 'cyl', mat: 'pole', x: l.x, y: CURB_H + 1.55, z: l.z, sx: 0.08, sy: 3.1, sz: 0.08 });
      const [mx, mz] = ax(0.6);
      parts.push({ shape: 'box', mat: 'pole', x: mx, y: CURB_H + 3.08, z: mz, sx: 1.2, sy: 0.04, sz: 0.04, ry: l.ry });
      const [hx, hz] = ax(1.25);
      parts.push({
        shape: 'box',
        mat: 'lampHead',
        x: hx,
        y: CURB_H + 3.02,
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
    const g = buildParts(parts, mats, {
      noShadow: new Set(['lampHead', 'paving', 'stone', 'line', 'rubber', 'soil', 'flower']),
    });
    g.traverse(o => {
      o.raycast = () => {};
    });
    return g;
  }, [lamps, signals, extra, mats]);
  useEffect(() => () => disposeParts(group), [group]);
  useFrame(() => {
    mats.lampHead.emissiveIntensity = 0.05 + rt.state.nightFactor * 3.2;
    mats.kioskGlass.emissiveIntensity = 0.3 + rt.state.nightFactor * 1.5;
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

/** Park ponds: discs of the bay's water material. */
function Ponds({ ponds, shared }: { ponds: { x: number; z: number; r: number }[]; shared: SharedUniforms }) {
  const mesh = useMemo(() => {
    const geos = ponds.map(p => new CircleGeometry(p.r, 40).rotateX(-Math.PI / 2).translate(p.x, CURB_H + 0.085, p.z));
    const m = new Mesh(geos.length ? mergeGeometries(geos) : new CircleGeometry(0.01), createWaterMaterial(shared));
    m.receiveShadow = true;
    m.raycast = () => {};
    return m;
  }, [ponds, shared]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}
