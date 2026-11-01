'use client';
import { createContext, useContext } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  artTexture,
  faceTexture,
  plateTexture,
  type FaceLook,
  lightPoolTexture,
  rugTexture,
  type RugKind,
} from './art.ts';
import type { ArtKind, DetailLevel } from './detail.ts';

/**
 * Shared materials, geometries and textures for the office's detail, created lazily and disposed together with the
 * office. Everything is cached by key, so a hundred mugs or books share one material and one geometry and the static
 * batch folds them into a handful of draw calls.
 */
export interface DetailKit {
  level: DetailLevel;
  /** A matte material for a flat colour (the toy-diorama look), shared by colour and options. */
  mat(color: string, opts?: THREE.MeshStandardMaterialParameters & { key?: string }): THREE.MeshStandardMaterial;
  /** A glossier material (metal fittings, glass, ceramics). */
  gloss(color: string): THREE.MeshStandardMaterial;
  /** A box with rounded edges, cached by size. */
  rbox(w: number, h: number, d: number, r: number): THREE.BufferGeometry;
  /** Any geometry, built once per key. */
  geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry;
  rug(kind: RugKind, aspect: number): THREE.Material;
  art(kind: ArtKind, w: number, h: number): THREE.Material;
  /** A name plate material with the given text drawn on it. */
  plate(text: string): THREE.Material;
  /** The skin material of a head with its face painted on. */
  face(look: FaceLook, brow: string): THREE.Material;
  /** Additive light pool for under lamps. */
  pool: THREE.Material;
  /** Register something made outside the kit that should be disposed with it. */
  own<T extends { dispose(): void }>(thing: T): T;
  dispose(): void;
}

export function createDetailKit(level: DetailLevel): DetailKit {
  const mats = new Map<string, THREE.Material>();
  const geos = new Map<string, THREE.BufferGeometry>();
  const texs: THREE.Texture[] = [];
  const owned: { dispose(): void }[] = [];
  const remember = <T extends THREE.Material>(key: string, make: () => T): T => {
    let m = mats.get(key) as T | undefined;
    if (!m) mats.set(key, (m = make()));
    return m;
  };
  const geo = (key: string, make: () => THREE.BufferGeometry) => {
    let g = geos.get(key);
    if (!g) geos.set(key, (g = make()));
    return g;
  };
  let pool: THREE.Material | null = null;
  const kit: DetailKit = {
    level,
    mat(color, opts = {}) {
      // One material per colour and structural option (side, transparency, glow), whatever the call site's roughness:
      // fewer materials means fewer draw calls once the static batch folds each material into one mesh.
      const { key: _key, ...rest } = opts;
      const id = `m:${color}:${rest.side ?? ''}:${rest.transparent ?? ''}:${rest.emissiveIntensity ?? ''}`;
      return remember(id, () => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...rest }));
    },
    gloss(color) {
      return remember(`g:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 }));
    },
    rbox(w, h, d, r) {
      const seg = level === 'low' ? 1 : 2;
      const k = (n: number) => Math.round(n * 1000);
      return geo(`rb:${k(w)}:${k(h)}:${k(d)}:${k(r)}`, () => new RoundedBoxGeometry(w, h, d, seg, r));
    },
    geo,
    rug(kind, aspect) {
      return remember(`rug:${kind}:${aspect.toFixed(2)}`, () => {
        const t = rugTexture(kind, aspect);
        texs.push(t);
        return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 1, metalness: 0 });
      });
    },
    art(kind, w, h) {
      return remember(`art:${kind}`, () => {
        const t = artTexture(kind, w, h);
        texs.push(t);
        return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, metalness: 0 });
      });
    },
    plate(text) {
      return remember(`plate:${text}`, () => {
        const t = plateTexture(text);
        texs.push(t);
        return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0 });
      });
    },
    face(look, brow) {
      return remember(`face:${look.skin}:${look.glasses}:${look.female}:${brow}`, () => {
        const t = faceTexture(look, brow);
        texs.push(t);
        return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0 });
      });
    },
    get pool() {
      if (!pool) {
        const t = lightPoolTexture();
        texs.push(t);
        pool = new THREE.MeshBasicMaterial({
          map: t,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.55,
          toneMapped: false,
        });
        mats.set('pool', pool);
      }
      return pool;
    },
    own(thing) {
      owned.push(thing);
      return thing;
    },
    dispose() {
      for (const m of mats.values()) m.dispose();
      for (const g of geos.values()) g.dispose();
      for (const t of texs) t.dispose();
      for (const o of owned) o.dispose();
      mats.clear();
      geos.clear();
      texs.length = 0;
      owned.length = 0;
      pool = null;
    },
  };
  return kit;
}

export const DetailKitContext = createContext<DetailKit | null>(null);
export function useDetailKit(): DetailKit {
  const k = useContext(DetailKitContext);
  if (!k) throw new Error('Detail parts must be rendered inside the reference-look office.');
  return k;
}
