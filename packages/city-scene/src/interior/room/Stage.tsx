'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { METRES_PER_UNIT } from '../../camera/shots.ts';
import { asAny } from '../r3f.ts';
import { skyGradientTexture } from '../textures.ts';

/** Office-mode daylight, from the legacy floor view's engine (apps/legacy/src/scene/engine.ts). */
export const OFFICE_LIGHT = {
  skyTop: '#5aa9e6',
  horizon: '#d6ecfa',
  hemiSky: '#ffffff',
  hemiGround: '#b5a48a',
  hemiIntensity: 1.6,
  sun: '#fff4e0',
  sunIntensity: 2.2,
} as const;

/** Names of the city's top-level groups (A1 architecture and streets, A2 life) that the office view hides. */
const CITY_GROUPS = /^(a1-|life)/;
/** A3's fade curtain must keep drawing over the scene during transitions. */
const KEEP = new Set(['a3-fade-curtain']);

/**
 * Is this top-level scene object part of the city outside (architecture, streets, life, or A1's sky, clouds, rain
 * and lights)? Those are hidden while the office is shown, so the room stands in its own bright little street.
 */
function isCityOutside(o: THREE.Object3D): boolean {
  if (o.userData.officeStage || KEEP.has(o.name)) return false;
  if (CITY_GROUPS.test(o.name)) return true;
  if ((o as THREE.Light).isLight) return true;
  const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
  return !!mat && !Array.isArray(mat) && (mat as THREE.ShaderMaterial).isShaderMaterial === true;
}

/**
 * Office-mode lighting and surroundings: a warm hemisphere light and one soft-shadowed sun over the room, a light
 * sky gradient with matching fog, and the city outside switched off. Everything is restored when the office closes
 * (unmount). Works from the interior side, without changing A1's environment: A1 keeps animating its own lights and
 * sky, they are just not drawn while this is mounted.
 *
 * `centre` is the room's centre in world units, `size` its larger side in metres.
 */
export function OfficeStage({ centre, size }: { centre: [number, number, number]; size: number }) {
  const scene = useThree(s => s.scene) as unknown as THREE.Scene;
  const gl = useThree(s => s.gl) as unknown as THREE.WebGLRenderer;
  const { hemi, sun, sky, fog } = useMemo(() => {
    const hemi = new THREE.HemisphereLight(OFFICE_LIGHT.hemiSky, OFFICE_LIGHT.hemiGround, OFFICE_LIGHT.hemiIntensity);
    const sun = new THREE.DirectionalLight(OFFICE_LIGHT.sun, OFFICE_LIGHT.sunIntensity);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    hemi.userData.officeStage = sun.userData.officeStage = true;
    const sky = skyGradientTexture(OFFICE_LIGHT.skyTop, OFFICE_LIGHT.horizon);
    return { hemi, sun, sky, fog: new THREE.Fog(OFFICE_LIGHT.horizon, 40, 140) };
  }, []);

  // Sun from the south-east and high, like the legacy view, with a shadow box just around the room and its street.
  useEffect(() => {
    const half = (size / 2 + 10) / METRES_PER_UNIT;
    const dir = new THREE.Vector3(40, 70, 30).normalize();
    sun.position.set(centre[0] + dir.x * 40, centre[1] + dir.y * 40, centre[2] + dir.z * 40);
    sun.target.position.set(...centre);
    sun.target.updateMatrixWorld();
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 100 });
    sun.shadow.camera.updateProjectionMatrix();
  }, [sun, centre[0], centre[1], centre[2], size]);

  useEffect(() => {
    const prev = { background: scene.background, fog: scene.fog, toneMapping: gl.toneMapping };
    scene.background = sky;
    scene.fog = fog;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    return () => {
      scene.background = prev.background;
      scene.fog = prev.fog;
      gl.toneMapping = prev.toneMapping;
    };
  }, [scene, gl, sky, fog]);

  // Hidden objects are remembered so exactly those come back. Checked every frame: A1 re-mounts parts on quality
  // changes, and its rain sets its own visibility each frame.
  const hidden = useMemo(() => new Set<THREE.Object3D>(), []);
  useFrame(() => {
    for (const o of scene.children) {
      if (o.visible && isCityOutside(o)) {
        o.visible = false;
        hidden.add(o);
      }
    }
    // A1 sets exposure and image-light strength every frame; the office keeps its own, steady daylight.
    gl.toneMappingExposure = 1;
    scene.environmentIntensity = 0.35;
  });
  useEffect(
    () => () => {
      for (const o of hidden) o.visible = true;
      hidden.clear();
      sky.dispose();
    },
    [hidden, sky],
  );

  return (
    <group userData={{ officeStage: true }}>
      <primitive object={asAny(hemi)} />
      <primitive object={asAny(sun)} />
      <primitive object={asAny(sun.target)} />
    </group>
  );
}
