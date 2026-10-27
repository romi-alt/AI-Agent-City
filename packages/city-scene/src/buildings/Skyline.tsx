'use client';
import { useEffect, useMemo } from 'react';
import type { Material } from 'three';
import { useCityContext } from '../context.tsx';
import type { SharedUniforms } from '../environment/palette.ts';
import type { QualityBudget } from '../quality/quality.ts';
import { Trees } from '../streets/Trees.tsx';
import { buildFacadeMesh, createFacadeMaterial } from './facade.ts';
import { buildParts, disposeParts } from './parts.ts';
import { planSkyline } from './skyline.ts';

/** The non-interactive background city: one instanced facade draw plus a few instanced detail draws. */
export function Skyline({
  detail,
  shared,
  mats,
}: {
  detail: QualityBudget['decorBuildingDetail'];
  shared: SharedUniforms;
  mats: Record<string, Material>;
}) {
  const { layout } = useCityContext();
  const plan = useMemo(() => planSkyline(layout.streets, detail), [layout, detail]);
  const facade = useMemo(() => {
    const material = createFacadeMaterial(shared);
    const mesh = buildFacadeMesh(plan.masses, material);
    mesh.name = 'a1-skyline';
    mesh.raycast = () => {};
    return mesh;
  }, [plan, shared]);
  const parts = useMemo(() => {
    const g = buildParts(plan.parts, mats, { noShadow: new Set(['beacon', 'awning', 'hvac']) });
    g.traverse(o => {
      o.raycast = () => {};
    });
    return g;
  }, [plan, mats]);
  useEffect(
    () => () => {
      facade.geometry.dispose();
      (facade.material as Material).dispose();
    },
    [facade],
  );
  useEffect(() => () => disposeParts(parts), [parts]);
  return (
    <>
      <primitive object={facade} />
      <primitive object={parts} />
      {plan.trees.length > 0 && <Trees items={plan.trees} shared={shared} castShadow={false} />}
    </>
  );
}
