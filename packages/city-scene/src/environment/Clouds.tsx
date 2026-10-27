'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { GLSL_NOISE } from './glsl.ts';
import type { EnvRuntime } from './palette.ts';

const PER_LAYER = 16;
const SPAN = 2000;

/**
 * Layered drifting clouds: camera-facing soft billboards shaded with value noise, so a few dozen quads read as
 * volumetric cumulus at partly-cloudy and merge into a grey deck when overcast. One draw call.
 */
export function Clouds({ layers, rt }: { layers: number; rt: EnvRuntime }) {
  const { mesh, material } = useMemo(() => {
    const count = Math.max(1, layers) * PER_LAYER;
    const geo = new PlaneGeometry(1, 1);
    const data = new Float32Array(count * 4);
    const seed = new Float32Array(count * 4);
    let s = 11;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < count; i++) {
      const layer = Math.floor(i / PER_LAYER);
      data.set(
        [(rnd() - 0.5) * SPAN, 170 + layer * 70 + rnd() * 30, (rnd() - 0.5) * SPAN * 0.9, 260 + rnd() * 320],
        i * 4,
      );
      seed.set([rnd() * 100, 2 + rnd() * 3 + layer * 1.5, rnd(), layer], i * 4);
    }
    geo.setAttribute('aCloud', new InstancedBufferAttribute(data, 4));
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4));
    const material = new ShaderMaterial({
      uniforms: {
        uTime: rt.uniforms.uTime,
        uCover: { value: 0.3 },
        uLit: { value: new Color() },
        uShade: { value: new Color() },
        uSunDir: rt.uniforms.uSunDir,
        uFog: rt.uniforms.uFogColor,
      },
      vertexShader: /* glsl */ `
        attribute vec4 aCloud;
        attribute vec4 aSeed;
        uniform float uTime;
        varying vec2 vUv;
        varying vec4 vSeed;
        varying float vFade;
        varying vec3 vWorld;
        void main() {
          vec3 c = aCloud.xyz;
          c.x = mod(c.x + uTime * aSeed.y + ${SPAN / 2}.0, ${SPAN}.0) - ${SPAN / 2}.0;
          vec4 mv = viewMatrix * vec4(c, 1.0);
          mv.xy += position.xy * vec2(aCloud.w, aCloud.w * 0.42);
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vSeed = aSeed;
          vWorld = c;
          float edge = 1.0 - smoothstep(${SPAN * 0.32}.0, ${SPAN * 0.5}.0, max(abs(c.x), abs(c.z)));
          vFade = edge;
        }
      `,
      fragmentShader: /* glsl */ `
        ${GLSL_NOISE}
        uniform float uCover, uTime;
        uniform vec3 uLit, uShade, uSunDir, uFog;
        varying vec2 vUv;
        varying vec4 vSeed;
        varying float vFade;
        varying vec3 vWorld;
        void main() {
          vec2 p = (vUv - 0.5) * vec2(2.0, 2.0);
          float n = a1fbm(vUv * vec2(4.0, 2.2) + vSeed.x + vec2(uTime * 0.004, 0.0));
          float shape = 1.0 - length(p * vec2(1.0, 1.15 - 0.3 * vUv.y));
          float cover = clamp(uCover, 0.0, 1.0);
          float dens = smoothstep(0.22, 0.62, shape + (n - 0.5) * 1.6 + cover * 0.32 - 0.12);
          float keep = step(vSeed.z, 0.12 + cover * 0.9);
          float a = dens * keep * vFade * mix(0.7, 0.95, cover);
          if (a < 0.01) discard;
          float lit = clamp(vUv.y * 0.8 + n * 0.5 - 0.15, 0.0, 1.0);
          vec3 col = mix(uShade, uLit, lit);
          float toward = max(dot(normalize(vWorld - cameraPosition), uSunDir), 0.0);
          col += uLit * pow(toward, 6.0) * 0.25 * (1.0 - cover);
          float far = smoothstep(500.0, 1100.0, length(vWorld.xz - cameraPosition.xz));
          col = mix(col, uFog, far * 0.7);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    });
    const mesh = new InstancedMesh(geo, material, count);
    const id = new Matrix4();
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, id);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    return { mesh, material };
  }, [layers, rt]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      material.dispose();
    },
    [mesh, material],
  );

  useFrame(() => {
    const s = rt.state;
    material.uniforms.uCover!.value = s.cloudCover;
    (material.uniforms.uLit!.value as Color).setRGB(...s.cloudLit);
    (material.uniforms.uShade!.value as Color).setRGB(...s.cloudShade);
  });

  return <primitive object={mesh} />;
}
