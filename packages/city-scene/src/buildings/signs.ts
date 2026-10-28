import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
} from 'three';
import type { SignSpec } from './designs.ts';

const ROW = 96;
const WIDTH = 1024;

/**
 * Every building sign drawn as text into one canvas atlas (text set with fillText, never parsed as markup) and
 * merged into a single mesh: one texture, one draw call. Signs glow softly at night via the emissive map.
 */
export interface SignMesh {
  mesh: Mesh;
  material: MeshStandardMaterial;
  /** Per building (by index): eased explode gap, set each frame; and its lobby level. */
  explode: { value: number[] };
}

export function buildSigns(signs: SignSpec[], buildings: { key: string; lobby: number }[]): SignMesh {
  const bIndex = new Map(buildings.map((b, i) => [b.key, i]));
  const rows = Math.max(1, signs.length);
  const height = 2 ** Math.ceil(Math.log2(rows * ROW));
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const bld: number[] = [];
  const lvl: number[] = [];
  signs.forEach((s, i) => {
    const cellW = Math.min(WIDTH, Math.round((ROW * s.w) / s.h));
    const y0 = i * ROW;
    g.fillStyle = s.bg;
    g.fillRect(0, y0, cellW, ROW);
    g.fillStyle = s.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = ROW * 0.62;
    const font = (px: number) => `600 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    g.font = font(size);
    const spaced = s.text.split('').join(' ');
    while (g.measureText(spaced).width > cellW * 0.88 && size > 10) g.font = font((size -= 2));
    g.fillText(spaced, cellW / 2, y0 + ROW / 2 + 2);

    // Quad facing the sign's direction.
    const u0 = 0;
    const u1 = cellW / WIDTH;
    const v1 = 1 - y0 / height;
    const v0 = 1 - (y0 + ROW) / height;
    const hw = s.w / 2;
    const hh = s.h / 2;
    const [ax, az, nx, nz] =
      s.face === '+z'
        ? [1, 0, 0, 1]
        : s.face === '-z'
          ? [-1, 0, 0, -1]
          : s.face === '+x'
            ? [0, -1, 1, 0]
            : [0, 1, -1, 0];
    const base = pos.length / 3;
    for (const [sx, sy, u, v] of [
      [-1, -1, u0, v0],
      [1, -1, u1, v0],
      [1, 1, u1, v1],
      [-1, 1, u0, v1],
    ] as const) {
      pos.push(s.x + ax * hw * sx, s.y + hh * sy, s.z + az * hw * sx);
      uv.push(u, v);
      nor.push(nx, 0, nz);
      bld.push(bIndex.get(s.b ?? '') ?? 0);
      lvl.push(s.lv);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.setAttribute('aBld', new Float32BufferAttribute(bld, 1));
  geo.setAttribute('aLv', new Float32BufferAttribute(lvl, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = LinearMipmapLinearFilter;
  const material = new MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: '#ffffff',
    emissiveIntensity: 0.1,
    roughness: 0.5,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new Mesh(geo, material);
  mesh.receiveShadow = true;
  // Exploded floors: each sign rises with its floor (same rule as floorOffset).
  const n = Math.max(1, buildings.length);
  const explode = { value: new Array<number>(n).fill(0) };
  const lobby = { value: buildings.map(b => b.lobby) };
  material.onBeforeCompile = shader => {
    shader.uniforms.uExplode = explode;
    shader.uniforms.uLobby = lobby;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aBld;
        attribute float aLv;
        uniform float uExplode[${n}];
        uniform float uLobby[${n}];`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          int bi = int(aBld + 0.5);
          transformed.y += max(aLv - uLobby[bi], 0.0) * uExplode[bi];
        }`,
      );
  };
  material.customProgramCacheKey = () => `a1-signs-${n}`;
  return { mesh, material, explode };
}
