'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { GLSL_NOISE } from '../environment/glsl.ts';
import type { SharedUniforms } from '../environment/palette.ts';
import { CURB_H } from './grid.ts';

/**
 * The plaza's fountain and flags (X02): a stone basin with a moulded coping, a pool whose surface ripples out
 * from the jets, a two-tier bowl with a falling water veil, a ring of arcing jets and a central plume (streams are
 * animated in the shader, so the water visibly flows), and flags of cloth that billow and ripple with shading.
 */
export function Fountain({ x, z, r, shared }: { x: number; z: number; r: number; shared: SharedUniforms }) {
  const built = useMemo(() => {
    const group = new Group();
    group.position.set(x, CURB_H, z);
    const stone = new MeshStandardMaterial({ color: '#d4cdc0', roughness: 0.55 });
    const darkStone = new MeshStandardMaterial({ color: '#8f8a80', roughness: 0.7 });
    // Basin: wall, moulded coping (lathe profile), inner floor.
    const wall = new Mesh(new CylinderGeometry(r + 0.05, r + 0.15, 0.5, 64, 1, true), stone);
    wall.position.y = 0.25;
    const coping = new Mesh(
      new LatheGeometry(
        [
          new Vector2(r - 0.3, 0.46),
          new Vector2(r - 0.3, 0.56),
          new Vector2(r + 0.12, 0.6),
          new Vector2(r + 0.22, 0.55),
          new Vector2(r + 0.2, 0.46),
        ],
        64,
      ),
      stone,
    );
    const floor = new Mesh(new CircleGeometry(r - 0.25, 48).rotateX(-Math.PI / 2), darkStone);
    floor.position.y = 0.05;
    // Pool water: ripples spreading from the jets, fresnel sky reflection, caustic shimmer.
    const water = new MeshStandardMaterial({
      color: '#3d7f8e',
      roughness: 0.03,
      metalness: 0.2,
      transparent: true,
      opacity: 0.86,
    });
    water.onBeforeCompile = shader => {
      shader.uniforms.uTime = shared.uTime;
      shader.uniforms.uMotion = shared.uMotion;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPool;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPool = position.xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\n${GLSL_NOISE}\nuniform float uTime;\nuniform float uMotion;\nvarying vec2 vPool;`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            float t = uTime * uMotion;
            float d = length(vPool);
            float ring = sin(d * 9.0 - t * 4.0) * exp(-d * 0.35);
            float ring2 = sin(length(vPool - vec2(0.0, ${(r * 0.62).toFixed(2)})) * 11.0 - t * 5.0) * 0.4;
            vec2 n2 = normalize(vPool + 1e-4) * (ring + ring2) * 0.12;
            n2 += vec2(a1noise(vPool * 3.0 + t * 0.6) - 0.5, a1noise(vPool * 3.0 - t * 0.5 + 7.0) - 0.5) * 0.18;
            normal = normalize(normal + (viewMatrix * vec4(n2.x, 0.0, n2.y, 0.0)).xyz);
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float t = uTime * uMotion;
            float c = a1noise(vPool * 4.0 + vec2(t * 0.7, -t * 0.4)) * a1noise(vPool * 5.0 - vec2(t * 0.5, t * 0.6));
            totalEmissiveRadiance += vec3(0.35, 0.55, 0.6) * smoothstep(0.25, 0.45, c) * 0.25;
          }`,
        );
    };
    water.customProgramCacheKey = () => 'a1-pool';
    const pool = new Mesh(new CircleGeometry(r - 0.22, 64).rotateX(-Math.PI / 2), water);
    pool.position.y = 0.4;
    // Two-tier bowls on a pedestal.
    const pedestal = new Mesh(new CylinderGeometry(0.18, 0.28, 1.0, 20), stone);
    pedestal.position.y = 0.9;
    const bowl1 = new Mesh(
      new LatheGeometry(
        [new Vector2(0.05, 0), new Vector2(0.9, 0.08), new Vector2(1.0, 0.22), new Vector2(0.92, 0.24)],
        40,
      ),
      stone,
    );
    bowl1.position.y = 1.32;
    const bowl2 = new Mesh(
      new LatheGeometry(
        [new Vector2(0.04, 0), new Vector2(0.45, 0.06), new Vector2(0.5, 0.16), new Vector2(0.45, 0.17)],
        32,
      ),
      stone,
    );
    bowl2.position.y = 1.95;
    const stem2 = new Mesh(new CylinderGeometry(0.08, 0.12, 0.65, 12), stone);
    stem2.position.y = 1.62;
    for (const o of [wall, coping, floor, pedestal, bowl1, bowl2, stem2]) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.raycast = () => {};
    }
    group.add(wall, coping, floor, pool, pedestal, bowl1, bowl2, stem2);

    // Moving water: a falling veil from each bowl, jets arcing in from the rim, and the central plume.
    const flow = new ShaderMaterial({
      uniforms: { uTime: shared.uTime, uMotion: shared.uMotion, uSun: shared.uSunDir },
      vertexShader: /* glsl */ `
        attribute float aJet;
        varying vec2 vUv;
        varying float vJet;
        void main() {
          vUv = uv;
          vJet = aJet;
          vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * p;
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_NOISE}
        uniform float uTime;
        uniform float uMotion;
        varying vec2 vUv;
        varying float vJet;
        void main() {
          float t = uTime * uMotion;
          // Streaks travel along the stream (v), broken by noise: reads as flowing, sparkling water.
          float s = a1noise(vec2(vUv.x * 14.0 + vJet * 3.0, vUv.y * 9.0 - t * 3.2));
          float s2 = a1noise(vec2(vUv.x * 30.0, vUv.y * 22.0 - t * 5.0));
          float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
          float a = (0.28 + 0.5 * s * s2) * edge;
          vec3 col = mix(vec3(0.72, 0.86, 0.92), vec3(1.0), s2);
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    // Veils: open cylinders from bowl lip to the water below.
    const veil1 = new Mesh(new CylinderGeometry(0.95, 1.08, 0.92, 48, 1, true), flow);
    veil1.position.y = 1.08;
    const veil2 = new Mesh(new CylinderGeometry(0.47, 0.6, 0.55, 32, 1, true), flow);
    veil2.position.y = 1.85;
    // Central plume.
    const plume = new Mesh(new CylinderGeometry(0.03, 0.09, 1.1, 12, 1, true).translate(0, 0.55, 0), flow);
    plume.position.y = 2.1;
    // Arcing jets: a bent ribbon instanced around the rim, each aimed at the centre.
    const arcGeo = new PlaneGeometry(0.08, 1, 1, 16);
    const ap = arcGeo.getAttribute('position');
    const span = r - 1.2;
    for (let i = 0; i < ap.count; i++) {
      const v = ap.getY(i) + 0.5; // 0..1 along the jet
      const h = 4 * v * (1 - v) * 1.15;
      ap.setXYZ(i, ap.getX(i), 0.42 + h, -v * span);
    }
    arcGeo.computeVertexNormals();
    const jets = 12;
    const arcs = new InstancedMesh(arcGeo, flow, jets);
    const seeds = new Float32Array(jets);
    const m = new Matrix4();
    for (let i = 0; i < jets; i++) {
      const a = (i / jets) * Math.PI * 2;
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -a + Math.PI / 2);
      m.compose(new Vector3(Math.cos(a) * (r - 0.3), 0, Math.sin(a) * (r - 0.3)), q, new Vector3(1, 1, 1));
      arcs.setMatrixAt(i, m);
      seeds[i] = i;
    }
    arcGeo.setAttribute('aJet', new InstancedBufferAttribute(seeds, 1));
    for (const g of [veil1.geometry, veil2.geometry, plume.geometry])
      g.setAttribute('aJet', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
    // Splash rings where the jets land.
    const splash = new MeshStandardMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      roughness: 0.2,
    });
    const splashRing = new Mesh(new TorusGeometry(1.25, 0.06, 6, 48).rotateX(Math.PI / 2), splash);
    splashRing.position.y = 0.41;
    for (const o of [veil1, veil2, plume, arcs, splashRing]) o.raycast = () => {};
    group.add(veil1, veil2, plume, arcs, splashRing);
    return { group, plume, splashRing, splash, mats: [stone, darkStone, water, flow, splash] };
  }, [x, z, r, shared]);
  useEffect(
    () => () => {
      built.group.traverse(o => (o as Mesh).geometry?.dispose());
      for (const mm of built.mats) mm.dispose();
    },
    [built],
  );
  useFrame(() => {
    const t = shared.uTime.value * shared.uMotion.value;
    built.plume.scale.y = 1 + 0.25 * Math.sin(t * 1.7) + 0.1 * Math.sin(t * 4.3);
    built.splash.opacity = 0.3 + 0.15 * Math.sin(t * 6.0);
    built.splashRing.scale.setScalar(1 + 0.03 * Math.sin(t * 5.0));
  });
  return <primitive object={built.group} />;
}

/** Flags of cloth: travelling waves along the fly with real shading (normals follow the waves). */
export function Flags({
  flags,
  shared,
}: {
  flags: { x: number; z: number; h: number; color: string }[];
  shared: SharedUniforms;
}) {
  const built = useMemo(() => {
    const poleMat = new MeshStandardMaterial({ color: '#d5d8dc', roughness: 0.3, metalness: 0.9 });
    const capMat = new MeshStandardMaterial({ color: '#d9b35a', roughness: 0.3, metalness: 1 });
    const clothMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: DoubleSide });
    clothMat.onBeforeCompile = shader => {
      shader.uniforms.uTime = shared.uTime;
      shader.uniforms.uMotion = shared.uMotion;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nuniform float uMotion;\nattribute float aPhase;',
        )
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
          float fu = clamp(position.x / 1.8, 0.0, 1.0);
          float ft = uTime * (0.4 + 0.6 * uMotion);
          float k1 = 3.4;
          float k2 = 6.3;
          float w1 = sin(position.x * k1 - ft * 5.2 + aPhase + position.y * 0.8);
          float w2 = sin(position.x * k2 - ft * 7.9 + aPhase * 2.0 - position.y * 1.3);
          float amp = 0.34 * fu + 0.03;
          float dzdx = amp * (k1 * cos(position.x * k1 - ft * 5.2 + aPhase + position.y * 0.8) + 0.35 * k2 * cos(position.x * k2 - ft * 7.9 + aPhase * 2.0 - position.y * 1.3)) + 0.34 / 1.8 * (w1 + 0.35 * w2);
          objectNormal = normalize(vec3(-dzdx, 0.0, 1.0));`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.z += amp * (w1 + 0.35 * w2);
          transformed.y -= fu * fu * 0.07 * (1.0 + 0.5 * sin(ft * 1.3 + aPhase));
          transformed.x -= fu * 0.05 * (1.0 + w1 * 0.3);`,
        );
    };
    clothMat.customProgramCacheKey = () => 'a1-flag-v2';
    const n = Math.max(1, flags.length);
    const poles = new InstancedMesh(new CylinderGeometry(0.035, 0.06, 1, 10).translate(0, 0.5, 0), poleMat, n);
    const caps = new InstancedMesh(new CylinderGeometry(0.08, 0.08, 0.12, 12), capMat, n);
    const clothGeo = new PlaneGeometry(1.8, 1.15, 24, 10).translate(0.9, -0.575, 0);
    clothGeo.setAttribute('aPhase', new InstancedBufferAttribute(new Float32Array(flags.map((_, i) => i * 1.9)), 1));
    const cloth = new InstancedMesh(clothGeo, clothMat, n);
    const m = new Matrix4();
    const c = new Color();
    flags.forEach((f, i) => {
      poles.setMatrixAt(i, m.compose(new Vector3(f.x, CURB_H, f.z), new Quaternion(), new Vector3(1, f.h, 1)));
      caps.setMatrixAt(
        i,
        m.compose(new Vector3(f.x, CURB_H + f.h + 0.06, f.z), new Quaternion(), new Vector3(1, 1, 1)),
      );
      cloth.setMatrixAt(
        i,
        m.compose(new Vector3(f.x + 0.06, CURB_H + f.h - 0.15, f.z), new Quaternion(), new Vector3(1, 1, 1)),
      );
      cloth.setColorAt(i, c.set(f.color));
    });
    for (const mesh of [poles, caps, cloth]) {
      mesh.count = flags.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.computeBoundingSphere();
      mesh.raycast = () => {};
    }
    return { meshes: [poles, caps, cloth], mats: [poleMat, capMat, clothMat] };
  }, [flags, shared]);
  useEffect(
    () => () => {
      for (const mm of built.meshes) mm.geometry.dispose();
      for (const mm of built.mats) mm.dispose();
    },
    [built],
  );
  return (
    <>
      {built.meshes.map(mm => (
        <primitive key={mm.uuid} object={mm} />
      ))}
    </>
  );
}
