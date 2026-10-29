'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BoxGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { useCity, useCityContext } from '../../context.tsx';
import { useEnvironmentLight, useEnvRuntime } from '../../environment/palette.ts';
import { QUALITY } from '../../quality/quality.ts';
import { cityRoads, heroClearance, type Rect } from '../../streets/extent.ts';
import { CURB_H } from '../../streets/grid.ts';
import { awningMesh, beaconMesh, capMesh, facadeMesh, roofMeshes, spireMesh, standingBox } from './instances.ts';
import { createSurroundMaterials } from './materials.ts';
import { planSurround, type SurroundOptions } from './plan.ts';

export interface SurroundProps {
  /** World seed for the generated city (default: a fixed seed, so every visit shows the same city). */
  seed?: number;
  /** Extra rectangles to keep clear, e.g. a camera corridor, on top of `heroClearance(layout)`. */
  avoid?: Rect[];
  /** Blocks left green (the park); the streets planner draws their lawns. */
  park?: Rect[];
  /** Ring sizes; see `SurroundOptions`. */
  ring1Blocks?: number;
  ring2Reach?: number;
  ring3Reach?: number;
}

/** How far beyond the district anything is built, per decor detail: the fog hides the rest, so low stops sooner. */
export const MAX_REACH = { minimal: 700, reduced: 900, full: 1e9 } as const;
const DETAIL = { minimal: 0, reduced: 1, full: 2 } as const;

/**
 * The generated city around the district: a Midtown-style fabric of street walls, stepped towers, crowns and
 * spires out to the far banks of the rivers (see plan.ts). Everything is instanced on shared materials: 13 draw calls
 * in all, whatever the size of the city. Quality: low builds less far out and with fewer tiers; windows in every
 * ring light up with the environment's night factor and the aircraft lights blink.
 */
export function Surround({ seed, avoid, park, ring1Blocks, ring2Reach, ring3Reach }: SurroundProps) {
  const { layout } = useCityContext();
  const detail = useCity(s => QUALITY[s.quality].decorBuildingDetail);
  const light = useEnvironmentLight();
  const rt = useEnvRuntime();
  const materials = useMemo(() => createSurroundMaterials(rt.uniforms.uFogColor), [rt]);
  useEffect(() => () => materials.dispose(), [materials]);

  const plan = useMemo(() => {
    const options: SurroundOptions = {
      seed,
      avoid,
      park,
      ring1Blocks,
      ring2Reach,
      ring3Reach,
      maxReach: MAX_REACH[detail],
      detail: DETAIL[detail],
    };
    for (const k of Object.keys(options) as (keyof SurroundOptions)[]) if (options[k] === undefined) delete options[k];
    return planSurround(cityRoads(layout), heroClearance(layout), options);
  }, [layout, seed, avoid, park, ring1Blocks, ring2Reach, ring3Reach, detail]);

  const meshes = useMemo(() => {
    const m = materials;
    const near = [plan.ring1, plan.backs];
    const list: InstancedMesh[] = [
      facadeMesh(standingBox(), m.facade, near, 'surround-ring1', true, CURB_H),
      capMesh(near, m.cap, CURB_H),
      awningMesh(plan.awnings, m.awning, CURB_H),
      ...roofMeshes(plan.roofs, m.props, CURB_H),
      facadeMesh(standingBox(), m.facade, [plan.ring2], 'surround-ring2', false),
      capMesh([plan.ring2], m.cap, 0),
      facadeMesh(standingBox(), m.far, [plan.ring3, plan.ring4], 'surround-ring3', false),
      spireMesh(plan.spires, m.spire, 0),
      beaconMesh(plan.beacons, m.beacon, 0),
    ];
    return list;
  }, [plan, materials]);
  useEffect(
    () => () => {
      for (const m of meshes) {
        m.geometry.dispose();
        m.dispose();
      }
    },
    [meshes],
  );

  // The camera keeps out of the tall towers (it reads an instanced mesh called 'a1-skyline'): invisible, no draw.
  const skyline = useMemo(() => {
    const mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      new MeshBasicMaterial(),
      Math.max(1, plan.blockers.length),
    );
    const m4 = new Matrix4();
    plan.blockers.forEach((b, i) =>
      mesh.setMatrixAt(i, m4.compose(new Vector3(b.x, 0, b.z), new Quaternion(), new Vector3(b.w, b.top - 3, b.d))),
    );
    mesh.count = plan.blockers.length;
    mesh.visible = false;
    mesh.name = 'a1-skyline';
    mesh.raycast = () => {};
    return mesh;
  }, [plan]);
  useEffect(
    () => () => {
      skyline.geometry.dispose();
      (skyline.material as MeshBasicMaterial).dispose();
      skyline.dispose();
    },
    [skyline],
  );

  useFrame(state => {
    materials.uniforms.uSNight.value = light.nightFactor;
    materials.spire.emissiveIntensity = 0.1 + 0.9 * light.nightFactor;
    // The aircraft lights blink slowly, together, like the real thing.
    const on = Math.sin(state.clock.elapsedTime * 2.4) > -0.2;
    materials.beacon.color.setRGB(on ? 1 : 0.25, on ? 0.2 : 0.05, on ? 0.2 : 0.05);
  });

  return (
    <group name="surround">
      {meshes.map(mesh => (
        <primitive key={mesh.name + mesh.id} object={mesh} />
      ))}
      <primitive object={skyline} />
    </group>
  );
}
