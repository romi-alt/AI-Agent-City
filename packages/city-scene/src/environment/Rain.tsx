'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, ShaderMaterial } from 'three';
import type { EnvRuntime } from './palette.ts';

const BOX: [number, number, number] = [90, 70, 90];

/**
 * Light rain: thin streaks in a box that follows the camera, falling in the vertex shader (no per-frame CPU work).
 * `drops` comes from the quality budget; the streaks fade in and out with the weather.
 */
export function Rain({ drops, rt }: { drops: number; rt: EnvRuntime }) {
  const { mesh, material } = useMemo(() => {
    const geo = new PlaneGeometry(0.035, 1.3);
    const data = new Float32Array(drops * 4);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < drops; i++) data.set([rnd() * BOX[0], rnd() * BOX[1], rnd() * BOX[2], rnd()], i * 4);
    geo.setAttribute('aDrop', new InstancedBufferAttribute(data, 4));
    const material = new ShaderMaterial({
      uniforms: { uTime: rt.uniforms.uTime, uRain: { value: 0 }, uNight: rt.uniforms.uNight },
      vertexShader: /* glsl */ `
        attribute vec4 aDrop;
        uniform float uTime;
        varying float vAlpha;
        varying float vY;
        const vec3 B = vec3(${BOX[0]}.0, ${BOX[1]}.0, ${BOX[2]}.0);
        void main() {
          vec3 p = aDrop.xyz;
          p.y -= uTime * (24.0 + aDrop.w * 8.0);
          p.x += uTime * 2.0;
          vec3 origin = cameraPosition - B * 0.5;
          vec3 w = origin + mod(p - origin, B);
          vec3 toCam = normalize(cameraPosition - w);
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
          w += right * position.x + normalize(vec3(0.08, 1.0, 0.0)) * position.y;
          vY = w.y;
          vAlpha = (uv.y) * (0.35 + 0.65 * aDrop.w);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uRain, uNight;
        varying float vAlpha;
        varying float vY;
        void main() {
          if (vY < 0.05) discard;
          vec3 col = mix(vec3(0.78, 0.82, 0.88), vec3(0.55, 0.6, 0.72), uNight);
          gl_FragColor = vec4(col, vAlpha * uRain * 0.32);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const mesh = new InstancedMesh(geo, material, drops);
    const id = new Matrix4();
    for (let i = 0; i < drops; i++) mesh.setMatrixAt(i, id);
    mesh.frustumCulled = false;
    return { mesh, material };
  }, [drops, rt]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      material.dispose();
    },
    [mesh, material],
  );

  useFrame(() => {
    const r = rt.state.rain;
    material.uniforms.uRain!.value = r;
    mesh.visible = r > 0.01;
  });

  return <primitive object={mesh} />;
}
