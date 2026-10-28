'use client';
import { useEffect, useMemo } from 'react';
import {
  type BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SharedUniforms } from '../environment/palette.ts';
import { rng } from './grid.ts';

/**
 * Instanced trees in three species — a broad plane tree, a columnar hornbeam and a small round ornamental — each a
 * branching trunk plus a canopy of alpha-tested leaf cards (procedural leaf texture) around a dark inner core,
 * with normals bent outward from the canopy centre so it shades as a soft volume. Wind sway in the vertex shader,
 * per-tree hue variation, far trees use fewer cards (LOD by distance from the district). Two draws per species.
 */

type Species = 'plane' | 'column' | 'round';
export type TreeItem = [number, number, number, number];

/** A 512² atlas of overlapping leaves, drawn once with canvas (no downloaded texture). */
let leafTex: Texture | null = null;
function leafTexture(): Texture {
  if (leafTex) return leafTex;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 512);
  const r = rng(9);
  for (let i = 0; i < 900; i++) {
    // Leaves cluster toward the centre of the card so its silhouette is a soft, ragged clump.
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 220;
    const x = 256 + Math.cos(a) * d;
    const y = 256 + Math.sin(a) * d * 0.92;
    const l = 26 + r() * 12;
    const shade = 0.55 + r() * 0.45;
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI * 2);
    g.fillStyle = `rgb(${Math.round(225 * shade)}, ${Math.round(240 * shade)}, ${Math.round(205 * shade)})`;
    g.beginPath();
    g.ellipse(0, 0, l * 0.5, l * 0.22, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(90, 110, 80, 0.35)`;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-l * 0.45, 0);
    g.lineTo(l * 0.45, 0);
    g.stroke();
    g.restore();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 4;
  leafTex = t;
  return t;
}

/** Cards around a set of leaf-cluster centres; normals point away from the canopy centre. */
function canopy(
  clusters: [number, number, number, number][],
  cardsPer: number,
  centre: Vector3,
  seed: number,
): BufferGeometry {
  const r = rng(seed);
  const parts: BufferGeometry[] = [];
  const q = new Quaternion();
  const m = new Matrix4();
  const v = new Vector3();
  for (const [x, y, z, s] of clusters) {
    for (let i = 0; i < cardsPer; i++) {
      const g = new PlaneGeometry(s * 1.5, s * 1.5);
      q.setFromAxisAngle(v.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), r() * Math.PI);
      m.compose(
        new Vector3(x + (r() - 0.5) * s * 0.6, y + (r() - 0.5) * s * 0.5, z + (r() - 0.5) * s * 0.6),
        q,
        new Vector3(1, 1, 1),
      );
      g.applyMatrix4(m);
      // Spherical normals: the whole canopy shades like one soft volume (lit side, shaded side).
      const p = g.getAttribute('position');
      const nrm: number[] = [];
      for (let k = 0; k < p.count; k++) {
        v.set(p.getX(k), p.getY(k), p.getZ(k)).sub(centre).normalize();
        nrm.push(v.x, v.y, v.z);
      }
      g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

/** A dark inner volume so the canopy never reads see-through. */
function core(clusters: [number, number, number, number][], centre: Vector3): BufferGeometry {
  const parts = clusters.slice(0, 3).map(([x, y, z, s]) => {
    const g = new IcosahedronGeometry(s * 0.38, 1).translate(x, y, z);
    return g;
  });
  const g = mergeGeometries(parts);
  const p = g.getAttribute('position');
  const v = new Vector3();
  const nrm: number[] = [];
  for (let k = 0; k < p.count; k++) {
    v.set(p.getX(k), p.getY(k), p.getZ(k)).sub(centre).normalize();
    nrm.push(v.x, v.y, v.z);
  }
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  return g;
}

/** Trunk with a few limbs reaching into the canopy. */
function trunk(height: number, limbs: number, spread: number, seed: number): BufferGeometry {
  const r = rng(seed);
  const parts: BufferGeometry[] = [new CylinderGeometry(0.05, 0.085, height, 7).translate(0, height / 2, 0)];
  const q = new Quaternion();
  const m = new Matrix4();
  for (let i = 0; i < limbs; i++) {
    const len = spread * (0.7 + r() * 0.5);
    const g = new CylinderGeometry(0.018, 0.04, len, 5).translate(0, len / 2, 0);
    const a = (i / limbs) * Math.PI * 2 + r() * 0.6;
    q.setFromAxisAngle(new Vector3(Math.cos(a), 0, Math.sin(a)), 0.55 + r() * 0.35);
    m.compose(new Vector3(0, height * (0.75 + r() * 0.2), 0), q, new Vector3(1, 1, 1));
    parts.push(g.applyMatrix4(m));
  }
  const out = mergeGeometries(parts.map(p => p.toNonIndexed()));
  out.deleteAttribute('uv');
  return out;
}

interface SpeciesGeo {
  trunk: BufferGeometry;
  leaves: BufferGeometry;
  leavesFar: BufferGeometry;
  core: BufferGeometry;
}

function speciesGeometry(s: Species): SpeciesGeo {
  if (s === 'plane') {
    const c = new Vector3(0, 2.15, 0);
    const clusters: [number, number, number, number][] = [
      [0, 2.35, 0, 0.75],
      [0.6, 2.05, 0.2, 0.6],
      [-0.55, 2.1, -0.25, 0.62],
      [0.15, 1.95, 0.62, 0.55],
      [-0.2, 1.95, -0.6, 0.55],
      [0.35, 2.6, -0.35, 0.5],
      [-0.35, 2.62, 0.3, 0.5],
      [0.7, 2.45, -0.45, 0.42],
    ];
    return {
      trunk: trunk(1.8, 4, 0.8, 1),
      leaves: canopy(clusters, 6, c, 2),
      leavesFar: canopy(clusters, 2, c, 3),
      core: core(clusters, c),
    };
  }
  if (s === 'column') {
    const c = new Vector3(0, 2.2, 0);
    const clusters: [number, number, number, number][] = [];
    for (let i = 0; i < 7; i++) {
      const y = 1.2 + i * 0.32;
      const w = 0.42 * Math.sin(((i + 0.6) / 7.2) * Math.PI) + 0.12;
      clusters.push([((i * 37) % 5) * 0.04 - 0.08, y, ((i * 13) % 5) * 0.04 - 0.08, w]);
    }
    return {
      trunk: trunk(1.4, 2, 0.4, 4),
      leaves: canopy(clusters, 5, c, 5),
      leavesFar: canopy(clusters, 2, c, 6),
      core: core(clusters, c),
    };
  }
  const c = new Vector3(0, 1.55, 0);
  const clusters: [number, number, number, number][] = [
    [0, 1.65, 0, 0.55],
    [0.35, 1.45, 0.1, 0.42],
    [-0.32, 1.48, -0.12, 0.42],
    [0.05, 1.4, 0.38, 0.4],
    [-0.05, 1.86, -0.25, 0.38],
  ];
  return {
    trunk: trunk(1.1, 3, 0.5, 7),
    leaves: canopy(clusters, 6, c, 8),
    leavesFar: canopy(clusters, 2, c, 9),
    core: core(clusters, c),
  };
}

/** Wind sway (amplitude grows with height; own phase per tree) and warm night fill from street lamps. */
function treeMaterial(shared: SharedUniforms, kind: 'bark' | 'leaf' | 'core') {
  const leaf = kind === 'leaf';
  const m = new MeshStandardMaterial({
    color: kind === 'bark' ? '#5b4636' : kind === 'core' ? '#7f9a6c' : '#ffffff',
    roughness: leaf ? 0.75 : 0.9,
    map: leaf ? leafTexture() : null,
    alphaTest: leaf ? 0.5 : 0,
    side: leaf ? DoubleSide : undefined,
  });
  m.onBeforeCompile = shader => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uMotion = shared.uMotion;
    shader.uniforms.uNight = shared.uNight;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.85, 0.65) * uNight * 0.3;',
      );
    if (leaf)
      // Leaves let light through: the shaded side keeps some sun (translucency), so canopies never go flat black.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.12;',
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
          float t = uTime * uMotion;
          transformed.x += sin(t * 1.3 + ph) * 0.035 * h * gust * uMotion;
          transformed.z += cos(t * 1.05 + ph * 1.7) * 0.025 * h * gust * uMotion;
          ${leaf ? 'transformed += normal * sin(t * 3.1 + ph + position.y * 4.0) * 0.015 * uMotion;' : ''}
        }`,
      );
  };
  m.customProgramCacheKey = () => `a1-tree-${kind}`;
  return m;
}

const LEAF_TINTS = ['#6fa04f', '#7aab55', '#5f9446', '#86b25e', '#6a9a49', '#79a24f', '#8fb768', '#5d8e43'];

/** items: [x, y, z, scale]. Species are picked per tree (deterministic); `nearRadius` sets the card LOD. */
export function Trees({
  items,
  shared,
  castShadow = true,
  nearRadius = 80,
  species,
}: {
  items: TreeItem[];
  shared: SharedUniforms;
  castShadow?: boolean;
  nearRadius?: number;
  /** Force one species for every item (e.g. columnar trees along a facade). */
  species?: Species;
}) {
  const meshes = useMemo(() => {
    const r = rng(items.length * 7 + 3);
    const groups: Record<Species, { item: TreeItem; far: boolean }[]> = { plane: [], column: [], round: [] };
    for (const it of items) {
      const k = r();
      const sp: Species = species ?? (it[3] < 0.8 ? 'round' : k < 0.58 ? 'plane' : k < 0.82 ? 'column' : 'round');
      groups[sp].push({ item: it, far: Math.max(Math.abs(it[0]), Math.abs(it[2])) > nearRadius });
    }
    const out: InstancedMesh[] = [];
    const mats = {
      bark: treeMaterial(shared, 'bark'),
      leaf: treeMaterial(shared, 'leaf'),
      core: treeMaterial(shared, 'core'),
    };
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    const c = new Color();
    for (const sp of ['plane', 'column', 'round'] as Species[]) {
      const list = groups[sp];
      if (!list.length) continue;
      const geo = speciesGeometry(sp);
      const near = list.filter(l => !l.far);
      const far = list.filter(l => l.far);
      const make = (g: BufferGeometry, mat: MeshStandardMaterial, set: typeof list, tint: boolean, shadow: boolean) => {
        if (!set.length) return;
        const mesh = new InstancedMesh(g, mat, set.length);
        set.forEach(({ item: [x, y, z, k] }, i) => {
          q.setFromAxisAngle(new Vector3(0, 1, 0), r() * Math.PI * 2);
          mesh.setMatrixAt(i, m.compose(p.set(x, y, z), q, s.set(k, k * (0.9 + r() * 0.25), k)));
          if (tint) mesh.setColorAt(i, c.set(LEAF_TINTS[Math.floor(r() * LEAF_TINTS.length)]!));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = castShadow && shadow;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        mesh.raycast = () => {};
        out.push(mesh);
      };
      make(geo.trunk, mats.bark, list, false, true);
      make(geo.core, mats.core, list, true, false);
      make(geo.leaves, mats.leaf, near, true, true);
      make(geo.leavesFar, mats.leaf, far, true, false);
    }
    return { out, mats };
  }, [items, shared, castShadow, nearRadius, species]);
  useEffect(
    () => () => {
      for (const mesh of meshes.out) mesh.geometry.dispose();
      for (const mat of Object.values(meshes.mats)) mat.dispose();
    },
    [meshes],
  );
  return (
    <>
      {meshes.out.map(mesh => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
}
