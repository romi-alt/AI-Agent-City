'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import type { InstancedMesh } from 'three';
import { useCity, useCityContext } from '../../context.tsx';
import { useEnvironmentLight, useEnvRuntime } from '../../environment/palette.ts';
import { QUALITY } from '../../quality/quality.ts';
import { cityRoads, heroClearance, type Rect } from '../../streets/extent.ts';
import { CURB_H } from '../../streets/grid.ts';
import { awningMesh, capMesh, facadeMesh, LIT, roofMeshes, standingBox } from './instances.ts';
import { createSurroundMaterials } from './materials.ts';
import { planSurround, type SurroundOptions } from './plan.ts';

export interface SurroundProps {
  /** World seed for the generated city (default: a fixed seed, so every visit shows the same city). */
  seed?: number;
  /** Extra rectangles to keep clear, e.g. a camera corridor, on top of `heroClearance(layout)`. */
  avoid?: Rect[];
  /** Ring sizes; see `SurroundOptions`. */
  ring1Blocks?: number;
  ring2Reach?: number;
  ring3Density?: number;
}

interface Built {
  ring1: InstancedMesh[];
  ring2: InstancedMesh;
  ring3: InstancedMesh;
}

function dispose(b: Built) {
  for (const m of [...b.ring1, b.ring2, b.ring3]) {
    m.geometry.dispose();
    m.dispose();
  }
}

/**
 * The generated city around the district, in three rings (see plan.ts). Everything is instanced on shared
 * materials: 9 draw calls in all. Quality: Ring 2 is the first thing cut (hidden on `minimal` decor detail), Ring 1
 * and the far skyline stay. Windows in every ring light up with the environment's night factor.
 */
export function Surround({ seed, avoid, ring1Blocks, ring2Reach, ring3Density }: SurroundProps) {
  const { layout } = useCityContext();
  const detail = useCity(s => QUALITY[s.quality].decorBuildingDetail);
  const light = useEnvironmentLight();
  const fog = useEnvRuntime().uniforms.uFogColor;
  const materials = useMemo(() => createSurroundMaterials(fog), [fog]);
  useEffect(() => () => materials.dispose(), [materials]);

  const plan = useMemo(() => {
    const options: SurroundOptions = { seed, avoid, ring1Blocks, ring2Reach, ring3Density };
    for (const k of Object.keys(options) as (keyof SurroundOptions)[]) if (options[k] === undefined) delete options[k];
    return planSurround(cityRoads(layout), heroClearance(layout), options);
  }, [layout, seed, avoid, ring1Blocks, ring2Reach, ring3Density]);

  const built = useMemo<Built>(() => {
    const m = materials;
    const ring1 = [
      facadeMesh(
        standingBox(),
        m.facade,
        [
          { list: plan.ring1, lit: LIT.ring1 },
          { list: plan.backs, lit: LIT.backs },
        ],
        CURB_H,
        'surround-ring1',
        true,
      ),
      capMesh(plan.ring1, m.cap, CURB_H),
      awningMesh(plan.ring1, m.awning, CURB_H),
      ...roofMeshes(plan.ring1, m.props, CURB_H),
    ];
    const ring2 = facadeMesh(
      standingBox(),
      m.facade,
      [{ list: plan.ring2, lit: LIT.ring2 }],
      0,
      'surround-ring2',
      false,
    );
    const ring3 = facadeMesh(standingBox(), m.far, [{ list: plan.ring3, lit: LIT.ring3 }], 0, 'surround-ring3', false);
    return { ring1, ring2, ring3 };
  }, [plan, materials]);
  useEffect(() => () => dispose(built), [built]);

  useFrame(() => {
    materials.uniforms.uSNight.value = light.nightFactor;
  });

  return (
    <group name="surround">
      {built.ring1.map(mesh => (
        <primitive key={mesh.name} object={mesh} />
      ))}
      <primitive object={built.ring2} visible={detail !== 'minimal'} />
      <primitive object={built.ring3} />
    </group>
  );
}
