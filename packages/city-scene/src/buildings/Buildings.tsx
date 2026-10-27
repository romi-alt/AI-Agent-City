'use client';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { AdditiveBlending, Color, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { useCity, useCityContext } from '../context.tsx';
import { type SharedUniforms, useEnvRuntime } from '../environment/palette.ts';
import { QUALITY } from '../quality/quality.ts';
import { CURB_H } from '../streets/grid.ts';
import { Trees } from '../streets/Trees.tsx';
import type { LayoutBuilding } from '../types.ts';
import { type BuildingDesign, designBuilding } from './designs.ts';
import { buildFacadeMesh, createFacadeMaterial, type RimUniforms } from './facade.ts';
import { usePartMaterials } from './materials.ts';
import { buildParts, disposeParts } from './parts.ts';
import { BuildingLabels } from './Labels.tsx';
import { buildSigns } from './signs.ts';
import { Skyline } from './Skyline.tsx';

const GOLD = new Color('#f5b335');
const SOFT = new Color('#fff1d6');

/**
 * Every layout building with its own design, the background skyline, signage and rooftop planting.
 * Buildings are pickable (`userData.buildingKey`): hover sets `hovered`, a click focuses the building. Owner: A1.
 */
export function Buildings() {
  const { layout } = useCityContext();
  const rt = useEnvRuntime();
  const quality = useCity(s => s.quality);
  const detail = QUALITY[quality].decorBuildingDetail;
  const mats = usePartMaterials();

  const designs = useMemo(() => {
    const count: Record<string, number> = {};
    return layout.buildings.map((b, i) => {
      const k = (count[b.kind] = (count[b.kind] ?? -1) + 1);
      return { building: b, design: designBuilding(b, k, 101 + i * 37) };
    });
  }, [layout]);

  const parts = useMemo(() => {
    const g = buildParts(
      designs.flatMap(d => d.design.parts),
      mats,
      { noShadow: new Set(['glow', 'beacon', 'hqBeacon']) },
    );
    // Details never steal the pointer from the building behind them.
    g.traverse(o => {
      o.raycast = () => {};
    });
    return g;
  }, [designs, mats]);
  useEffect(() => () => disposeParts(parts), [parts]);

  const signs = useMemo(() => buildSigns(designs.flatMap(d => d.design.signs)), [designs]);
  useEffect(
    () => () => {
      signs.mesh.geometry.dispose();
      signs.material.map?.dispose();
      signs.material.dispose();
    },
    [signs],
  );
  useFrame(() => {
    signs.material.emissiveIntensity = 0.08 + 0.9 * rt.state.nightFactor;
  });

  const trees = useMemo(() => designs.flatMap(d => d.design.trees), [designs]);
  const labels = useMemo(
    () => designs.map(({ building: b, design: d }) => ({ key: b.key, name: b.name, x: b.x, y: d.roof + 2.6, z: b.z })),
    [designs],
  );

  return (
    <group name="a1-buildings">
      <Skyline detail={detail} shared={rt.uniforms} mats={mats} />
      {designs.map(({ building, design }) => (
        <InteractiveBuilding key={building.key} building={building} design={design} shared={rt.uniforms} />
      ))}
      <primitive object={parts} />
      <primitive object={signs.mesh} />
      <Trees items={trees} shared={rt.uniforms} />
      <BuildingLabels items={labels} />
    </group>
  );
}

function InteractiveBuilding({
  building,
  design,
  shared,
}: {
  building: LayoutBuilding;
  design: BuildingDesign;
  shared: SharedUniforms;
}) {
  const { store } = useCityContext();
  const key = building.key;
  const hovered = useCity(s => s.hovered === key);
  const focused = useCity(s => s.mode.kind !== 'explore' && s.mode.kind !== 'arrival' && s.mode.building === key);
  const highlighted = useCity(s => s.highlight === key);
  const enterable = useCity(s => s.enterable.includes(key));

  const rim = useMemo<RimUniforms>(() => ({ uRim: { value: 0 }, uRimColor: { value: new Color() } }), []);
  const { mesh, material } = useMemo(() => {
    const material = createFacadeMaterial(shared, rim);
    const mesh = buildFacadeMesh(design.masses, material);
    mesh.userData.buildingKey = key;
    mesh.name = `building:${key}`;
    return { mesh, material };
  }, [design, shared, rim, key]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      material.dispose();
    },
    [mesh, material],
  );

  const haloMat = useMemo(
    () =>
      new MeshBasicMaterial({
        color: GOLD,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );
  const halo = useMemo(() => {
    const r = Math.hypot(building.w, building.d) / 2 + 1.1;
    const m = new Mesh(new RingGeometry(r, r + 0.22, 64).rotateX(-Math.PI / 2), haloMat);
    m.position.set(building.x, CURB_H + 0.03, building.z);
    m.visible = false;
    m.raycast = () => {};
    return m;
  }, [building.w, building.d, building.x, building.z, haloMat]);
  useEffect(
    () => () => {
      haloMat.dispose();
      halo.geometry.dispose();
    },
    [haloMat, halo],
  );

  useFrame((_, dt) => {
    const st = store.get();
    const t = shared.uTime.value;
    const breathe = st.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(t * 1.6);
    const target = focused ? 0.5 : hovered ? 0.38 : highlighted ? 0.3 * breathe : 0;
    rim.uRim.value += (target - rim.uRim.value) * Math.min(1, dt * 8);
    rim.uRimColor.value.copy(focused || highlighted || enterable ? GOLD : SOFT);
    const haloTarget = focused || highlighted ? 0.55 * breathe : 0;
    haloMat.opacity += (haloTarget - haloMat.opacity) * Math.min(1, dt * 6);
    halo.visible = haloMat.opacity > 0.01;
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (store.get().hovered !== key) store.set({ hovered: key });
    document.body.style.cursor = 'pointer';
  };
  const out = () => {
    if (store.get().hovered === key) store.set({ hovered: null });
    document.body.style.cursor = '';
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    // A drag that ends on a building is a camera move, not a selection.
    if (e.delta > 6) return;
    e.stopPropagation();
    store.set({ mode: { kind: 'building', building: key } });
  };

  return (
    <group name={`a1-building-${key}`}>
      <primitive object={mesh} onPointerOver={over} onPointerOut={out} onClick={click} />
      <primitive object={halo} />
    </group>
  );
}
