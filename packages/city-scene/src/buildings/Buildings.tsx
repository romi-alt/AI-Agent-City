'use client';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from 'three';
import { useCity, useCityContext } from '../context.tsx';
import { useEnvRuntime } from '../environment/palette.ts';
import { QUALITY } from '../quality/quality.ts';
import { CURB_H } from '../streets/grid.ts';
import type { LayoutBuilding } from '../types.ts';
import { type BuildingDesign, designAll } from './designs.ts';
import { EXPLODE_GAP, easeExplode, explodeRuntime, floorOffset, lobbyLevels, stepExplode } from './explode.ts';
import { buildKitMeshes } from './kitmesh.ts';
import { BuildingLabels } from './Labels.tsx';
import { createKitMaterials, updateKitMaterials } from './materials.ts';
import { buildSigns } from './signs.ts';

const GOLD = new Color('#f5b335');
const SOFT = new Color('#fff1d6');

/**
 * The 15 designed buildings of the district (X02): facades, entrances, rooftops and signs from a shared,
 * instanced kit (a few dozen draw calls for everything), picking and hover/focus outlines, and exploded floors
 * for the focused building. Owner: A1.
 */
export function Buildings() {
  const { layout, store } = useCityContext();
  const rt = useEnvRuntime();
  const quality = useCity(s => s.quality);
  const detail = QUALITY[quality].decorBuildingDetail;
  const maxLod = detail === 'full' ? 2 : detail === 'reduced' ? 1 : 0;

  const designs = useMemo(() => designAll(layout), [layout]);
  const mats = useMemo(() => createKitMaterials(rt.uniforms), [rt]);
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) m.dispose();
    },
    [mats],
  );
  const kit = useMemo(
    () =>
      buildKitMeshes(
        designs.flatMap(d => d.design.parts),
        mats,
        maxLod,
      ),
    [designs, mats, maxLod],
  );
  useEffect(() => () => kit.dispose(), [kit]);

  const lobby = useMemo(
    () => designs.map(d => ({ key: d.building.key, lobby: lobbyLevels(d.building.kind) })),
    [designs],
  );
  const signs = useMemo(
    () =>
      buildSigns(
        designs.flatMap(d => d.design.signs),
        lobby,
      ),
    [designs, lobby],
  );
  useEffect(
    () => () => {
      signs.mesh.geometry.dispose();
      signs.material.map?.dispose();
      signs.material.dispose();
    },
    [signs],
  );

  const labels = useMemo(
    () =>
      designs.map(({ building: b, design: d }) => ({
        key: b.key,
        name: b.name,
        x: b.x,
        y: d.top + 1.4,
        z: b.z,
        floors: b.floors.length,
      })),
    [designs],
  );

  // Exploded floors: animate each building's progress toward its target, frame-rate independently.
  const ex = explodeRuntime(store);
  useEffect(() => {
    // A rebuilt kit starts at rest; re-apply any building that is (partly) open.
    for (const [key, p] of ex.progress) if (p > 0) kit.explode(key, lv => floorOffset(key, lv, p));
  }, [kit, ex]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const st = store.get();
    const target = st.explode && (st.mode.kind === 'building' || st.mode.kind === 'floor') ? st.mode.building : null;
    designs.forEach(({ building: b }, i) => {
      const key = b.key;
      const was = ex.progress.get(key) ?? 0;
      const open = key === target;
      if (!open && was === 0) return;
      const p = st.reducedMotion ? (open ? 1 : 0) : stepExplode(was, open, dt);
      if (p === was) return;
      if (p === 0) ex.progress.delete(key);
      else ex.progress.set(key, p);
      kit.explode(key, lv => floorOffset(key, lv, p));
      signs.explode.value[i] = EXPLODE_GAP * easeExplode(p);
    });
    updateKitMaterials(mats, rt.state, rt.uniforms.uTime.value, rt.uniforms.uMotion.value);
    signs.material.emissiveIntensity = 0.12 + 1.1 * rt.state.nightFactor;
  });

  return (
    <group name="a1-buildings">
      <primitive object={kit.group} />
      <primitive object={signs.mesh} />
      {designs.map(({ building, design }) => (
        <BuildingFrame key={building.key} building={building} design={design} />
      ))}
      <BuildingLabels items={labels} />
    </group>
  );
}

/** Picking volume, hover/focus outline and the ground halo of one building. */
function BuildingFrame({ building, design }: { building: LayoutBuilding; design: BuildingDesign }) {
  const { store } = useCityContext();
  const key = building.key;
  const ex = explodeRuntime(store);

  const { pick, outline, outlineMat, halo, haloMat } = useMemo(() => {
    // Picking: one invisible box over the whole building (still raycast while invisible).
    const h = design.top - CURB_H;
    const pick = new Mesh(new BoxGeometry(building.w, h, building.d), new MeshBasicMaterial());
    pick.position.set(building.x, CURB_H + h / 2, building.z);
    pick.visible = false;
    pick.userData.buildingKey = key;
    pick.name = `building:${key}`;
    // Outline: the edges of every volume, drawn soft gold on hover/focus.
    const segs: number[] = [];
    for (const o of design.outline) {
      const e = new EdgesGeometry(new BoxGeometry(o.w + 0.08, o.y1 - o.y0 + 0.04, o.d + 0.08));
      const p = e.getAttribute('position');
      for (let i = 0; i < p.count; i++) segs.push(p.getX(i) + o.x, p.getY(i) + (o.y0 + o.y1) / 2, p.getZ(i) + o.z);
      e.dispose();
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(segs, 3));
    const outlineMat = new LineBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const outline = new LineSegments(g, outlineMat);
    outline.visible = false;
    outline.raycast = () => {};
    const haloMat = new MeshBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    const r = Math.hypot(building.w, building.d) / 2 + 1.1;
    const halo = new Mesh(new RingGeometry(r, r + 0.22, 64).rotateX(-Math.PI / 2), haloMat);
    halo.position.set(building.x, CURB_H + 0.03, building.z);
    halo.visible = false;
    halo.raycast = () => {};
    // Not part of the building volume: the camera's scene measurement skips it.
    halo.userData.interior = true;
    return { pick, outline, outlineMat, halo, haloMat };
  }, [building, design, key]);
  useEffect(
    () => () => {
      for (const o of [pick, outline, halo]) o.geometry.dispose();
      for (const m of [pick.material as MeshBasicMaterial, outlineMat, haloMat]) m.dispose();
    },
    [pick, outline, outlineMat, halo, haloMat],
  );

  const rest = design.top - CURB_H;
  useFrame((state, dt) => {
    const st = store.get();
    const focused = st.mode.kind !== 'explore' && st.mode.kind !== 'arrival' && st.mode.building === key;
    const hovered = st.hovered === key;
    const highlighted = st.highlight === key;
    const t = state.clock.elapsedTime;
    const breathe = st.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(t * 1.6);
    const p = ex.progress.get(key) ?? 0;
    // While exploded, the floors speak for themselves: no outline; the pick box grows with the stack.
    const target = p > 0 ? 0 : focused ? 0.85 : hovered ? 0.6 : highlighted ? 0.5 * breathe : 0;
    outlineMat.opacity += (target - outlineMat.opacity) * Math.min(1, dt * 8);
    outlineMat.color.copy(focused || highlighted || st.enterable.includes(key) ? GOLD : SOFT);
    outline.visible = outlineMat.opacity > 0.01;
    const haloTarget = focused || highlighted ? 0.55 * breathe : 0;
    haloMat.opacity += (haloTarget - haloMat.opacity) * Math.min(1, dt * 6);
    halo.visible = haloMat.opacity > 0.01;
    const lift = floorOffset(key, building.floors.length, p);
    pick.scale.y = (rest + lift) / rest;
    pick.position.y = CURB_H + (rest + lift) / 2;
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
      <primitive object={pick} onPointerOver={over} onPointerOut={out} onClick={click} />
      <primitive object={outline} />
      <primitive object={halo} />
    </group>
  );
}
