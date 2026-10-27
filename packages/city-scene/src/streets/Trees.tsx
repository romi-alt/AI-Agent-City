'use client';
import { useEffect, useMemo } from 'react';
import {
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SharedUniforms } from '../environment/palette.ts';
import { hex } from '../environment/presets.ts';
import { rng } from './grid.ts';

const GREENS = ['#5fa04e', '#6cae55', '#4f8f44', '#78b35c', '#5a9a4a', '#64a852'];

/** A lumpy crown of three blobs, so a tree reads as foliage rather than a ball. */
function crownGeometry(): BufferGeometry {
  const blobs: BufferGeometry[] = [];
  const r = rng(5);
  for (const [x, y, z, s, detail] of [
    [0, 1.75, 0, 0.8, 1],
    [0.35, 1.5, 0.15, 0.6, 0],
    [-0.3, 1.55, -0.2, 0.62, 0],
  ] as const) {
    const ico = new IcosahedronGeometry(s, detail);
    ico.deleteAttribute('normal');
    ico.deleteAttribute('uv');
    // Welded so the crown shades smoothly instead of faceted.
    const g = mergeVertices(ico);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const k = 0.88 + r() * 0.24;
      p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k * 0.9 + y, p.getZ(i) * k + z);
    }
    g.computeVertexNormals();
    blobs.push(g.toNonIndexed());
  }
  return mergeGeometries(blobs);
}

/** Wind sway in the vertex shader: amplitude grows with height; each tree has its own phase. */
function swayMaterial(color: string, shared: SharedUniforms, flat = false) {
  const m = new MeshStandardMaterial({ color, roughness: 0.9, flatShading: flat });
  m.onBeforeCompile = shader => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uMotion = shared.uMotion;
    shader.uniforms.uNight = shared.uNight;
    // At night the crowns catch a little warm light from the street lamps instead of going black.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.85, 0.65) * uNight * 0.35;',
      );
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uMotion;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        {
          vec3 ip = instanceMatrix[3].xyz;
          float ph = ip.x * 0.37 + ip.z * 0.23;
          float h = max(transformed.y - 0.4, 0.0);
          float gust = 0.6 + 0.4 * sin(uTime * 0.31 + ph * 0.5);
          transformed.x += sin(uTime * 1.3 + ph) * 0.045 * h * gust * uMotion;
          transformed.z += cos(uTime * 1.05 + ph * 1.7) * 0.03 * h * gust * uMotion;
        }`,
      );
  };
  m.customProgramCacheKey = () => `a1-sway-${flat}`;
  return m;
}

/** Instanced trees (trunk + crown): items are [x, y, z, scale]. Two draw calls however many trees. */
export function Trees({
  items,
  shared,
  castShadow = true,
}: {
  items: [number, number, number, number][];
  shared: SharedUniforms;
  castShadow?: boolean;
}) {
  const { trunk, crown } = useMemo(() => {
    const n = Math.max(1, items.length);
    const trunkGeo = new CylinderGeometry(0.07, 0.11, 1.3, 6).translate(0, 0.65, 0);
    const trunk = new InstancedMesh(trunkGeo, swayMaterial('#5a4634', shared), n);
    const crown = new InstancedMesh(crownGeometry(), swayMaterial('#ffffff', shared), n);
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    const c = new Color();
    const r = rng(items.length + 3);
    items.forEach(([x, y, z, k], i) => {
      q.setFromAxisAngle(new Vector3(0, 1, 0), r() * Math.PI * 2);
      m.compose(p.set(x, y, z), q, s.set(k, k * (0.9 + r() * 0.25), k));
      trunk.setMatrixAt(i, m);
      crown.setMatrixAt(i, m);
      const g = hex(GREENS[Math.floor(r() * GREENS.length)]!);
      crown.setColorAt(i, c.setRGB(g[0], g[1], g[2]));
    });
    trunk.count = crown.count = items.length;
    for (const mesh of [trunk, crown]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
    }
    return { trunk, crown };
  }, [items, shared, castShadow]);
  useEffect(
    () => () => {
      for (const m of [trunk, crown]) {
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
      }
    },
    [trunk, crown],
  );
  return (
    <>
      <primitive object={trunk} />
      <primitive object={crown} />
    </>
  );
}
