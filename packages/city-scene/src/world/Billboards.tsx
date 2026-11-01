'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { useCity } from '../context.tsx';
import { useEnvRuntime } from '../environment/palette.ts';
import { QUALITY } from '../quality/quality.ts';
import { Kit } from './kitbash.ts';
import { AD_SECONDS, ADS, planBillboards } from './billboards.ts';
import { CURB_H } from '../streets/grid.ts';
import { Mesh } from 'three';

const COLS = 2;
const ROWS = ADS.length / COLS;
const TILE_W = 512;
const TILE_H = 256;

/** All twelve ads on one canvas atlas, drawn once (no downloaded images). */
function atlas(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = TILE_W * COLS;
  c.height = TILE_H * ROWS;
  const g = c.getContext('2d')!;
  ADS.forEach((ad, i) => {
    const x0 = (i % COLS) * TILE_W;
    const y0 = Math.floor(i / COLS) * TILE_H;
    g.save();
    g.beginPath();
    g.rect(x0, y0, TILE_W, TILE_H);
    g.clip();
    g.translate(x0, y0);
    g.fillStyle = ad.bg;
    g.fillRect(0, 0, TILE_W, TILE_H);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let k = -TILE_H; k < TILE_W; k += 40) {
      g.beginPath();
      g.moveTo(k, TILE_H);
      g.lineTo(k + TILE_H, 0);
      g.lineTo(k + TILE_H + 16, 0);
      g.lineTo(k + 16, TILE_H);
      g.fill();
    }
    g.fillStyle = ad.accent;
    g.fillRect(24, TILE_H * 0.2, 8, TILE_H * 0.5);
    g.fillStyle = ad.fg;
    g.textBaseline = 'middle';
    let fs = 64;
    g.font = `800 ${fs}px "Space Grotesk", Inter, Arial, sans-serif`;
    while (g.measureText(ad.big).width > TILE_W - 80 && fs > 24) {
      fs -= 2;
      g.font = `800 ${fs}px "Space Grotesk", Inter, Arial, sans-serif`;
    }
    g.fillText(ad.big, 48, TILE_H * 0.4);
    g.globalAlpha = 0.85;
    g.font = `500 ${Math.round(fs * 0.42)}px Inter, Arial, sans-serif`;
    g.fillText(ad.small, 50, TILE_H * 0.4 + fs * 0.85);
    g.restore();
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

/**
 * The Times Square-style cluster: four corner masts at one junction carrying lit screens that change ad every few
 * seconds. All screens are one instanced draw (the ad shown is picked in the vertex shader from a tick), the masts
 * and frames another. Screens glow at every hour, brighter at night.
 */
export function Billboards() {
  const rt = useEnvRuntime();
  const quality = useCity(s => s.quality);
  const count = QUALITY[quality].billboards;
  const built = useMemo(() => {
    const { masts, panels } = planBillboards(count);
    const tex = atlas();
    const tick = { value: 0 };
    const mat = new MeshBasicMaterial({ map: tex, toneMapped: false });
    mat.onBeforeCompile = shader => {
      shader.uniforms.uTick = tick;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAd;\nuniform float uTick;')
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
          {
            float ad = mod(aAd + uTick, ${ADS.length}.0);
            float col = mod(ad, ${COLS}.0);
            float row = floor(ad / ${COLS}.0);
            vMapUv = (uv + vec2(col, ${ROWS}.0 - 1.0 - row)) / vec2(${COLS}.0, ${ROWS}.0);
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'times-square-screens';
    const geo = new PlaneGeometry(1, 1);
    geo.setAttribute('aAd', new InstancedBufferAttribute(new Float32Array(panels.map(p => p.ad)), 1));
    const screens = new InstancedMesh(geo, mat, Math.max(1, panels.length));
    screens.count = panels.length;
    const frames = new InstancedMesh(
      new PlaneGeometry(1, 1).translate(0, 0, -0.12),
      new MeshStandardMaterial({ color: '#23262d', roughness: 0.5, metalness: 0.6 }),
      Math.max(1, panels.length),
    );
    frames.count = panels.length;
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    panels.forEach((p, i) => {
      q.setFromAxisAngle(up, p.yaw);
      screens.setMatrixAt(i, m.compose(new Vector3(p.x, CURB_H + p.y, p.z), q, new Vector3(p.w, p.h, 1)));
      frames.setMatrixAt(i, m.compose(new Vector3(p.x, CURB_H + p.y, p.z), q, new Vector3(p.w + 0.5, p.h + 0.5, 1)));
    });
    // Two-sided frames so the back of a screen is a dark slab, not a hole.
    (frames.material as MeshStandardMaterial).side = 2;
    for (const o of [screens, frames]) {
      o.raycast = () => {};
      o.frustumCulled = false;
    }
    const kit = new Kit();
    for (const mast of masts) {
      kit.post(mast.x, mast.z, CURB_H, CURB_H + mast.height, 0.28, '#3a3f47');
      kit.box(mast.x, CURB_H + 0.3, mast.z, 1.0, 0.6, 1.0, '#2a2d33');
    }
    const poles = new Mesh(
      kit.build(),
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 }),
    );
    poles.raycast = () => {};
    return { screens, frames, poles, tick, mat, tex };
  }, [count]);
  useEffect(
    () => () => {
      for (const o of [built.screens, built.frames, built.poles]) {
        o.geometry.dispose();
        (o.material as MeshStandardMaterial).dispose();
      }
      built.tex.dispose();
    },
    [built],
  );
  useFrame(() => {
    const t = rt.uniforms.uTime.value;
    // The ads change in step across the cluster, with a short fade-free cut (cheap and readable).
    built.tick.value = Math.floor((t * rt.uniforms.uMotion.value) / AD_SECONDS);
    const k = 0.82 + 0.3 * rt.state.nightFactor;
    built.mat.color.setRGB(k, k, k);
  });
  return (
    <group name="times-square">
      <primitive object={built.screens} />
      <primitive object={built.frames} />
      <primitive object={built.poles} />
    </group>
  );
}
