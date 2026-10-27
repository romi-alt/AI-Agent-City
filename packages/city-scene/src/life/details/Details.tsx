'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CityLayout } from '../../types.ts';
import type { LifeClock } from '../clock.ts';
import type { LifeEnv } from '../env-adapter.ts';
import { LightPoints } from '../light-points.ts';
import { PartBuilder, Placer } from '../mesh-utils.ts';
import { BILLBOARD_LINES, detailPlan } from './placement.ts';

interface Props {
  layout: CityLayout;
  clock: LifeClock;
  env: LifeEnv;
  /** Reduced motion: fans stop, screens hold still, beacons stay steadily lit. */
  still: boolean;
}

function textAtlas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  BILLBOARD_LINES.forEach((line, i) => {
    const big = line === 'AgentCity';
    g.font = `${big ? 700 : 600} ${big ? 96 : 60}px "Helvetica Neue", Arial, sans-serif`;
    g.fillText(line, 512 + (big && i === 3 ? 30 : 0), i * 256 + 128);
    if (big && i === 3) {
      // A small diamond mark before the wordmark.
      g.fillStyle = '#f5b335';
      g.beginPath();
      const cy = 3 * 256 + 128;
      g.moveTo(268, cy - 30);
      g.lineTo(298, cy);
      g.lineTo(268, cy + 30);
      g.lineTo(238, cy);
      g.fill();
      g.fillStyle = '#ffffff';
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function screenMaterial(
  atlas: THREE.Texture,
  aspect: number,
  uTime: THREE.IUniform<number>,
  uNight: THREE.IUniform<number>,
) {
  const uniforms: Record<string, THREE.IUniform> = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  uniforms.uAtlas = { value: atlas };
  uniforms.uAspect = { value: aspect };
  uniforms.uTime = uTime;
  uniforms.uNight = uNight;
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute float aBoard;
      varying vec2 vUv;
      varying float vBoard;
      void main() {
        vUv = uv;
        vBoard = aBoard;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform sampler2D uAtlas;
      uniform float uTime;
      uniform float uNight;
      uniform float uAspect;
      varying vec2 vUv;
      varying float vBoard;
      vec3 palette(float k) {
        vec3 navy = vec3(0.06, 0.106, 0.176);
        vec3 teal = vec3(0.122, 0.541, 0.541);
        vec3 gold = vec3(0.961, 0.702, 0.208);
        vec3 sky = vec3(0.435, 0.718, 0.91);
        k = fract(k);
        return k < 0.33 ? mix(navy, teal, k * 3.0) : k < 0.66 ? mix(teal, sky, (k - 0.33) * 3.0) : mix(sky, gold, (k - 0.66) * 3.0) * 0.85;
      }
      void main() {
        float t = uTime * 0.05 + vBoard * 0.37;
        float band = sin(vUv.x * 2.4 + vUv.y * 1.3 + uTime * 0.18 + vBoard) * 0.5 + 0.5;
        vec3 col = mix(vec3(0.06, 0.106, 0.176), palette(t + band * 0.25), 0.3 + 0.3 * band);
        // Content changes every 14 s with a slow cross-fade; one in four slots is colour only.
        float slot = uTime / 14.0 + vBoard * 1.7;
        float i0 = mod(floor(slot), 5.0);
        float i1 = mod(i0 + 1.0, 5.0);
        float f = smoothstep(0.88, 1.0, fract(slot));
        // The atlas is flipped on upload: row i (from the top of the canvas) spans v in [(3 - i) / 4, (4 - i) / 4].
        // Rows are 4:1; show the middle of the row at the board's own aspect so text is not squeezed.
        float x = 0.5 + (vUv.x - 0.5) * uAspect / 4.0;
        float a0 = i0 < 4.0 ? texture2D(uAtlas, vec2(x, (3.0 - i0 + vUv.y) / 4.0)).a : 0.0;
        float a1 = i1 < 4.0 ? texture2D(uAtlas, vec2(x, (3.0 - i1 + vUv.y) / 4.0)).a : 0.0;
        vec3 ink = vec3(0.97, 0.96, 0.93);
        // Fade the old message out, then the new one in, so two texts never overlap.
        col = mix(col, ink, f < 0.5 ? a0 * (1.0 - 2.0 * f) : a1 * (2.0 * f - 1.0));
        // Screens are self-lit: a little brighter at night.
        col *= 0.85 + uNight * 0.3;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

/** Rooftop fans, aircraft-warning beacons and digital billboards. Four draw calls in all. */
export function Details({ layout, clock, env, still }: Props) {
  const built = useMemo(() => {
    const plan = detailPlan(layout);
    // Static parts: fan housings, beacon masts, billboard frames and legs, merged into one mesh.
    const b = new PartBuilder();
    for (const f of plan.fans) {
      b.add(new THREE.CylinderGeometry(0.55, 0.6, 0.38, 14, 1, true), { at: [f.x, f.y + 0.19, f.z], color: '#b9bfc5' });
      b.add(new THREE.CylinderGeometry(0.58, 0.58, 0.05, 14), { at: [f.x, f.y + 0.02, f.z], color: '#8e959c' });
      b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 6), { at: [f.x, f.y + 0.17, f.z], color: '#5d6369' });
    }
    for (const bc of plan.beacons) {
      b.add(new THREE.CylinderGeometry(0.035, 0.05, 1.3, 5), { at: [bc.x, bc.y - 0.65, bc.z], color: '#7d848b' });
      b.add(new THREE.SphereGeometry(0.08, 8, 6), { at: [bc.x, bc.y, bc.z], color: '#7a1a1a' });
    }
    for (const bb of plan.billboards) {
      b.add(new THREE.BoxGeometry(bb.w + 0.24, bb.h + 0.24, 0.18), {
        at: [bb.x, bb.y + bb.h / 2, bb.z - 0.1],
        color: '#1d2228',
      });
      for (const s of [-1, 1]) {
        b.add(new THREE.BoxGeometry(0.12, 1.0, 0.12), {
          at: [bb.x + s * bb.w * 0.35, bb.y - 0.5, bb.z - 0.1],
          color: '#3a4047',
        });
        b.add(new THREE.BoxGeometry(0.1, 0.1, 1.2), {
          at: [bb.x + s * bb.w * 0.35, bb.y - 0.95, bb.z - 0.5],
          color: '#3a4047',
        });
      }
    }
    const staticMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.3,
      side: THREE.DoubleSide,
    });
    const staticMesh = new THREE.Mesh(b.build(), staticMat);
    staticMesh.name = 'life-details-static';
    staticMesh.castShadow = true;
    // Fan blades: five per fan, instanced and spun.
    const blades = new PartBuilder();
    for (let k = 0; k < 5; k++)
      blades.add(new THREE.BoxGeometry(0.46, 0.02, 0.14), {
        at: [Math.cos((k / 5) * 6.283) * 0.27, 0, -Math.sin((k / 5) * 6.283) * 0.27],
        rot: [0.35, (k / 5) * 6.283, 0],
        color: '#40464c',
      });
    const bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 });
    const fanMesh = new THREE.InstancedMesh(blades.build(), bladeMat, Math.max(1, plan.fans.length));
    fanMesh.name = 'life-fan-blades';
    fanMesh.frustumCulled = false;
    // Billboard screens: one merged geometry with the board index per vertex.
    const atlas = textAtlas();
    const uTime = { value: 0 };
    const uNight = { value: 0 };
    const first = plan.billboards[0];
    const screenMat = screenMaterial(atlas, first ? first.w / first.h : 2, uTime, uNight);
    const screens: THREE.BufferGeometry[] = [];
    for (const bb of plan.billboards) {
      const g = new THREE.PlaneGeometry(bb.w, bb.h);
      g.translate(bb.x, bb.y + bb.h / 2, bb.z + 0.001);
      g.setAttribute(
        'aBoard',
        new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(bb.board), 1),
      );
      screens.push(g);
    }
    const screenGeo = new THREE.BufferGeometry();
    if (screens.length) {
      const pos: number[] = [];
      const uv: number[] = [];
      const board: number[] = [];
      for (const g of screens) {
        const idx = g.index!;
        for (let i = 0; i < idx.count; i++) {
          const v = idx.getX(i);
          pos.push(
            g.getAttribute('position').getX(v),
            g.getAttribute('position').getY(v),
            g.getAttribute('position').getZ(v),
          );
          uv.push(g.getAttribute('uv').getX(v), g.getAttribute('uv').getY(v));
          board.push(g.getAttribute('aBoard').getX(v));
        }
        g.dispose();
      }
      screenGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      screenGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      screenGeo.setAttribute('aBoard', new THREE.Float32BufferAttribute(board, 1));
    }
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.name = 'life-billboards';
    const beacons = new LightPoints(plan.beacons.length, 1);
    return { plan, staticMesh, staticMat, fanMesh, bladeMat, screenMesh, screenMat, atlas, uTime, uNight, beacons };
  }, [layout]);

  useEffect(
    () => () => {
      built.staticMesh.geometry.dispose();
      built.staticMat.dispose();
      built.fanMesh.geometry.dispose();
      built.bladeMat.dispose();
      built.screenMesh.geometry.dispose();
      built.screenMat.dispose();
      built.atlas.dispose();
      built.beacons.dispose();
    },
    [built],
  );

  const placer = useMemo(() => new Placer(), []);
  useFrame(state => {
    const t = clock.t;
    built.uTime.value = t;
    built.uNight.value = env.nightFactor;
    built.plan.fans.forEach((f, i) =>
      built.fanMesh.setMatrixAt(i, placer.set(f.x, f.y + 0.3, f.z, f.phase + t * f.speed)),
    );
    built.fanMesh.instanceMatrix.needsUpdate = true;
    (built.beacons.points.material as THREE.ShaderMaterial).uniforms.uPixelRatio!.value = state.viewport.dpr;
    built.beacons.begin();
    for (const bc of built.plan.beacons) {
      // Slow red flashes (about 40 a minute), steady when motion is reduced. Faint by day.
      const on = still ? 1 : (state.clock.elapsedTime + bc.phase) % 1.5 < 0.55 ? 1 : 0.08;
      built.beacons.push(bc.x, bc.y, bc.z, '#ff2a1f', on * (0.2 + env.nightFactor * 0.8), 9);
    }
    built.beacons.end();
  });

  return (
    <group name="life-details">
      <primitive object={built.staticMesh} />
      {built.plan.fans.length > 0 && <primitive object={built.fanMesh} />}
      {built.plan.billboards.length > 0 && <primitive object={built.screenMesh} />}
      <primitive object={built.beacons.points} />
    </group>
  );
}
