'use client';
import { useEffect, useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { useCity, useCityContext } from '../context.tsx';
import { useEnvRuntime } from '../environment/palette.ts';
import { QUALITY } from '../quality/quality.ts';
import { districtPlan } from '../streets/grid.ts';
import { planDecor } from './decor.ts';
import { buildDecorMesh, createDecorMaterial } from './decor-material.ts';
import { buildParts, disposeParts } from './parts.ts';

/**
 * The pastel street walls that fill the district's non-client blocks (X04), so the client towers rise out of a
 * dense base. Kept outside the `a1-buildings` group: they are scenery, never picked or measured as a client lot.
 */
export function DistrictDecor() {
  const { layout } = useCityContext();
  const rt = useEnvRuntime();
  const quality = useCity(s => s.quality);
  const shadows = QUALITY[quality].shadows;
  const plan = useMemo(() => {
    const cells = districtPlan(layout.streets).cells.filter(c => c.kind === 'decor');
    return planDecor(cells);
  }, [layout]);
  const mat = useMemo(() => createDecorMaterial(rt.uniforms), [rt]);
  const mesh = useMemo(() => buildDecorMesh(plan.boxes, mat, shadows), [plan, mat, shadows]);
  const parts = useMemo(() => {
    const std = (p: ConstructorParameters<typeof MeshStandardMaterial>[0]) => new MeshStandardMaterial(p);
    const mats = {
      awning: std({ color: '#ffffff', roughness: 0.85 }),
      cornice: std({ color: '#ffffff', roughness: 0.7 }),
      steel: std({ color: '#5a6066', roughness: 0.5, metalness: 0.6 }),
      tank: std({ color: '#ffffff', roughness: 0.9 }),
      tankRoof: std({ color: '#3f3a36', roughness: 0.8 }),
      hvac: std({ color: '#c3c7cb', roughness: 0.6, metalness: 0.3 }),
      garden: std({ color: '#5f9a4c', roughness: 0.95 }),
      shrub: std({ color: '#ffffff', roughness: 0.9 }),
    };
    const g = buildParts(plan.parts, mats, { noShadow: new Set(['awning']) });
    g.name = 'a1-district-decor-parts';
    g.traverse(o => {
      o.raycast = () => {};
    });
    return { g, mats };
  }, [plan]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
    },
    [mesh],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(
    () => () => {
      disposeParts(parts.g);
      for (const m of Object.values(parts.mats)) m.dispose();
    },
    [parts],
  );
  return (
    <group name="a1-district-decor-group">
      <primitive object={mesh} />
      <primitive object={parts.g} />
    </group>
  );
}
