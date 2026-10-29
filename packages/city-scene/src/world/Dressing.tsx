'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, ShaderMaterial } from 'three';
import { useCity, useCityContext } from '../context.tsx';
import { useEnvRuntime } from '../environment/palette.ts';
import { QUALITY } from '../quality/quality.ts';
import { cityRoads } from '../streets/extent.ts';
import { CURB_H } from '../streets/grid.ts';
import { planDressing } from './dressing.ts';
import { Kit } from './kitbash.ts';

const PUFFS = 5;

/** Soft rising puffs of steam from the vents: one mesh, animated entirely in the vertex shader. */
function steamGeometry(vents: { x: number; z: number }[]): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const base: number[] = [];
  const phase: number[] = [];
  const idx: number[] = [];
  let v = 0;
  vents.forEach((vent, i) => {
    for (let k = 0; k < PUFFS; k++) {
      const ph = (k + ((i * 0.37) % 1)) / PUFFS;
      for (const [cx, cy] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ] as const) {
        pos.push(cx, cy, 0);
        uv.push(cx + 0.5, cy + 0.5);
        base.push(vent.x, 0.1, vent.z);
        phase.push(ph);
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aBase', new Float32BufferAttribute(base, 3));
  g.setAttribute('aPhase', new Float32BufferAttribute(phase, 1));
  g.setIndex(idx);
  return g;
}

/**
 * Steam from street vents, subway entrances with green lamps, hydrants and hot-dog carts around the middle of the
 * city: the small things that make the streets read as New York. A handful of draws; low quality thins them.
 */
export function Dressing() {
  const { layout } = useCityContext();
  const rt = useEnvRuntime();
  const quality = useCity(s => s.quality);
  const scale = quality === 'low' ? 0.5 : quality === 'balanced' ? 0.8 : 1;
  const radius = QUALITY[quality].decorBuildingDetail === 'minimal' ? 90 : 150;
  const built = useMemo(() => {
    const roads = cityRoads(layout);
    const d = planDressing(roads.roadsX, roads.roadsZ, radius, scale);
    const steam = new Mesh(
      steamGeometry(d.vents),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: rt.uniforms.uTime, uMotion: rt.uniforms.uMotion, uNight: rt.uniforms.uNight },
        vertexShader: /* glsl */ `
          attribute vec3 aBase; attribute float aPhase;
          uniform float uTime; uniform float uMotion;
          varying vec2 vUv; varying float vA;
          void main() {
            float t = fract(uTime * 0.11 * uMotion + aPhase);
            vec3 p = aBase + vec3(sin(aPhase * 40.0 + t * 3.0) * 0.5 * t, t * 7.5, cos(aPhase * 31.0 + t * 2.0) * 0.5 * t);
            vec4 mv = viewMatrix * vec4(p, 1.0);
            mv.xy += position.xy * mix(0.7, 3.4, t);
            vA = (1.0 - t) * smoothstep(0.0, 0.08, t) * 0.55 * (1.0 - smoothstep(70.0, 220.0, -mv.z));
            vUv = uv;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uNight; varying vec2 vUv; varying float vA;
          void main() {
            float a = vA * smoothstep(0.5, 0.12, length(vUv - 0.5));
            vec3 col = mix(vec3(0.92, 0.92, 0.93), vec3(0.62, 0.58, 0.55), uNight);
            gl_FragColor = vec4(col, a);
          }`,
      }),
    );
    steam.frustumCulled = false;
    steam.raycast = () => {};
    // Hydrants, carts, subway rails (static, vertex-coloured) and the green globes (emissive).
    const kit = new Kit();
    const globes = new Kit();
    for (const h of d.hydrants) {
      kit
        .post(h.x, h.z, CURB_H, CURB_H + 0.42, 0.11, '#b3262a')
        .post(h.x, h.z, CURB_H + 0.42, CURB_H + 0.52, 0.14, '#8e1e22');
    }
    for (const c of d.carts) {
      kit
        .box(c.x, CURB_H + 0.6, c.z, 1.1, 0.5, 0.6, '#9aa0a6', c.ry)
        .box(c.x, CURB_H + 0.9, c.z, 1.0, 0.1, 0.55, c.color, c.ry);
      kit.post(c.x, c.z, CURB_H + 0.9, CURB_H + 2.0, 0.03, '#555b61');
      kit.box(c.x, CURB_H + 2.0, c.z, 1.5, 0.08, 1.5, c.color, c.ry + 0.3);
    }
    for (const k of d.kiosks) {
      const c = Math.cos(k.ry);
      const s = Math.sin(k.ry);
      // A railed stairwell 2.2 long and 1.1 wide, with a lamp post at each end of the road side.
      kit.box(k.x, CURB_H + 0.25, k.z, 2.2, 0.5, 1.1, '#2b2f33', k.ry);
      kit.box(k.x, CURB_H + 0.46, k.z, 2.0, 0.06, 0.9, '#0d0e10', k.ry);
      for (const e of [-1, 1]) {
        const x = k.x + e * 1.05 * c;
        const z = k.z - e * 1.05 * s;
        kit.post(x, z, CURB_H, CURB_H + 1.5, 0.05, '#3b4046');
        globes.post(x, z, CURB_H + 1.5, CURB_H + 1.75, 0.13, '#2fae4f');
      }
    }
    const kitMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
    const globeMat = new MeshStandardMaterial({ vertexColors: true, emissive: '#2fae4f', emissiveIntensity: 0.4 });
    const kitMesh = new Mesh(kit.build(), kitMat);
    const globeMesh = new Mesh(globes.build(), globeMat);
    for (const m of [kitMesh, globeMesh]) m.raycast = () => {};
    return { steam, kitMesh, globeMesh, kitMat, globeMat };
  }, [layout, rt, scale, radius]);
  useEffect(
    () => () => {
      for (const m of [built.steam, built.kitMesh, built.globeMesh]) {
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
      }
    },
    [built],
  );
  useFrame(() => {
    built.globeMat.emissiveIntensity = 0.5 + 2.5 * rt.state.nightFactor;
  });
  return (
    <group name="street-dressing">
      <primitive object={built.steam} />
      <primitive object={built.kitMesh} />
      <primitive object={built.globeMesh} />
    </group>
  );
}
