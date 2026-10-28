'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useCity } from '../../context.tsx';
import { useLifeEnv } from '../env-adapter.ts';
import { useCharacterAsset } from './asset.ts';
import { characterMaterial, lookUniforms, setLook } from './material.ts';
import {
  CITY_SCALE,
  HAIR_MESH,
  HAIRS,
  ONE_SHOT,
  type CharacterBody,
  type CharacterClip,
  type CharacterHair,
  type CharacterLook,
} from './zones.ts';

export interface CharacterProps {
  body?: CharacterBody;
  hair?: CharacterHair;
  look?: Partial<CharacterLook>;
  /** What the character is doing; changes cross-fade over `fade` seconds. */
  clip: CharacterClip;
  fade?: number;
  /** Start offset into the clip (s), so neighbours are not in step. */
  offset?: number;
  /** Playback speed (1 = authored). */
  speed?: number;
  position?: [number, number, number];
  /** Yaw in radians; the character faces +z at 0 (three.js convention for glTF characters). */
  rotationY?: number;
  /** World units per metre (default: the city's CITY_SCALE). Interiors may use their own. */
  scale?: number;
  castShadow?: boolean;
  /** Called when a one-shot clip (sitDown, standUp, interact) finishes. */
  onClipEnd?: (clip: CharacterClip) => void;
}

const DEFAULT_LOOK: CharacterLook = {
  skin: '#d9a77f',
  top: '#2f3238',
  bottom: '#1c212b',
  shoes: '#17181a',
  hair: '#2e2219',
};

/**
 * One fully skinned, animated character (three.js SkinnedMesh + AnimationMixer). Use it for close-ups and offices;
 * the street crowd uses the instanced `CrowdMesh`. Renders nothing until the asset has loaded. Stops animating when
 * the city is paused, and holds a still pose with reduced motion.
 */
export function Character({
  body = 'male',
  hair,
  look,
  clip,
  fade = 0.35,
  offset = 0,
  speed = 1,
  position,
  rotationY = 0,
  scale = CITY_SCALE,
  castShadow = true,
  onClipEnd,
}: CharacterProps) {
  const asset = useCharacterAsset();
  const paused = useCity(s => s.paused);
  const reduced = useCity(s => s.reducedMotion);
  const env = useLifeEnv();
  const style = hair ?? HAIRS[body][0]!;
  const [uniforms] = useState(() => lookUniforms({ ...DEFAULT_LOOK, ...look }));
  useEffect(() => setLook(uniforms, { ...DEFAULT_LOOK, ...look }), [uniforms, look]);

  const rig = useMemo(() => {
    if (!asset) return null;
    const src = asset.scene.getObjectByName(body === 'male' ? 'Male' : 'Female')!;
    const root = cloneSkinned(src) as THREE.Group;
    const material = characterMaterial(uniforms);
    const keep = HAIR_MESH[body][style];
    root.traverse(o => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      const isHair = /_Hair_/.test(m.name);
      m.visible = !m.name.endsWith('_LOD') && (!isHair || m.name === keep);
      m.material = material;
      m.castShadow = castShadow;
      m.frustumCulled = false;
    });
    const mixer = new THREE.AnimationMixer(root);
    return { root, mixer, material, clips: asset.clips[body] };
  }, [asset, body, style, uniforms, castShadow]);

  const current = useRef<{ clip: CharacterClip; action: THREE.AnimationAction } | null>(null);
  useEffect(() => {
    if (!rig) return;
    const action = rig.mixer.clipAction(rig.clips[clip]);
    const once = ONE_SHOT.includes(clip);
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.timeScale = speed;
    action.reset();
    if (!current.current) action.time = offset % rig.clips[clip].duration;
    action.play();
    if (current.current && current.current.action !== action) current.current.action.crossFadeTo(action, fade, false);
    current.current = { clip, action };
    // Pose the first frame immediately (also the held pose under reduced motion).
    rig.mixer.update(0);
    const done = (e: { action: THREE.AnimationAction }) => {
      if (e.action === action) onClipEnd?.(clip);
    };
    rig.mixer.addEventListener('finished', done);
    return () => rig.mixer.removeEventListener('finished', done);
  }, [rig, clip, fade, speed, offset, onClipEnd]);

  useEffect(
    () => () => {
      rig?.mixer.stopAllAction();
      rig?.material.dispose();
    },
    [rig],
  );

  useFrame((_, dt) => {
    if (!rig) return;
    uniforms.uNight.value = env.nightFactor;
    if (paused || reduced) return;
    rig.mixer.update(Math.min(dt, 0.1));
  });

  if (!rig) return null;
  return <primitive object={rig.root} position={position} rotation-y={rotationY} scale={scale} />;
}
