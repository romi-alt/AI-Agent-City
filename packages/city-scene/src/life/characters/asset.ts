'use client';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CLIPS, type CharacterBody, type CharacterClip } from './zones.ts';

/**
 * The character asset (Quaternius Universal Base Characters + Universal Animation Library, CC0; see ASSETS.md),
 * built by scripts/build-characters.ts and served by apps/web from public/.
 */
export const CHARACTER_URL = '/city/models/characters.glb';

export interface CharacterAsset {
  /** The loaded scene: groups `Male` and `Female`, each with an armature, body, eyes, brows, hairstyles and LODs. */
  scene: THREE.Group;
  /** Clips per body (the female set has its pelvis track moved to her rest height). */
  clips: Record<CharacterBody, Record<CharacterClip, THREE.AnimationClip>>;
}

const cache = new Map<string, Promise<CharacterAsset>>();

function pelvisRest(root: THREE.Object3D) {
  let p: THREE.Vector3 | null = null;
  root.traverse(o => {
    if (!p && o.name === 'pelvis') p = o.position.clone();
  });
  return p ?? new THREE.Vector3();
}

function shiftPelvis(clip: THREE.AnimationClip, delta: THREE.Vector3) {
  const c = clip.clone();
  for (const t of c.tracks)
    if (t.name === 'pelvis.position')
      for (let i = 0; i < t.values.length; i += 3) {
        t.values[i] = t.values[i]! + delta.x;
        t.values[i + 1] = t.values[i + 1]! + delta.y;
        t.values[i + 2] = t.values[i + 2]! + delta.z;
      }
  return c;
}

/**
 * glTF node names must be unique, so the loader renames the second skeleton's bones (`pelvis_1`, …). Clips target
 * the plain names: give the female armature the same bone names as the male one (identical hierarchy).
 */
function canonicalBoneNames(male: THREE.Object3D, female: THREE.Object3D) {
  const bones = (root: THREE.Object3D) => {
    const out: THREE.Bone[] = [];
    root.traverse(o => {
      if ((o as THREE.Bone).isBone) out.push(o as THREE.Bone);
    });
    return out;
  };
  const a = bones(male);
  const b = bones(female);
  if (a.length !== b.length) throw new Error('characters.glb: the two skeletons differ');
  b.forEach((bone, i) => (bone.name = a[i]!.name));
}

/** Load (once per URL) and prepare the character asset. */
export function loadCharacterAsset(url = CHARACTER_URL): Promise<CharacterAsset> {
  let p = cache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then(gltf => {
      const male = gltf.scene.getObjectByName('Male')!;
      const female = gltf.scene.getObjectByName('Female')!;
      canonicalBoneNames(male, female);
      const delta = pelvisRest(female).sub(pelvisRest(male));
      const byName = (n: string) => {
        const c = gltf.animations.find(a => a.name === n);
        if (!c) throw new Error(`characters.glb: clip ${n} missing`);
        return c;
      };
      const maleClips = {} as Record<CharacterClip, THREE.AnimationClip>;
      const femaleClips = {} as Record<CharacterClip, THREE.AnimationClip>;
      for (const [k, n] of Object.entries(CLIPS) as [CharacterClip, string][]) {
        maleClips[k] = byName(n);
        femaleClips[k] = shiftPelvis(byName(n), delta);
      }
      return { scene: gltf.scene, clips: { male: maleClips, female: femaleClips } };
    });
    // A failed load should be retryable (e.g. offline); callers fall back to the procedural crowd.
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/** The character asset once loaded (null while loading or if it failed). Never suspends. */
export function useCharacterAsset(url = CHARACTER_URL): CharacterAsset | null {
  const [asset, setAsset] = useState<CharacterAsset | null>(null);
  useEffect(() => {
    let live = true;
    loadCharacterAsset(url).then(
      a => live && setAsset(a),
      err => console.warn('City characters could not be loaded; using simple figures.', err),
    );
    return () => {
      live = false;
    };
  }, [url]);
  return asset;
}
