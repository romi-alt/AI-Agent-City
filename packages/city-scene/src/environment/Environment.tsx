'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { useCity, useCityContext } from '../context.tsx';
import { QUALITY } from '../quality/quality.ts';
import { Clouds } from './Clouds.tsx';
import { DebugParams } from './DebugParams.tsx';
import { envRuntime } from './palette.ts';
import { PostFX } from './PostFX.tsx';
import { presetFor, startTransition, stepTransition, sunVector, type Transition, transitionDone } from './presets.ts';
import { Rain } from './Rain.tsx';
import { createSkyMaterial, createSkyUniforms } from './sky.ts';

/** Half-size of the sun's shadow map: the district and its parkway, so shadows stay crisp. */
const SHADOW_HALF = 74;
/** Below this elevation the key light stops dropping, so dusk still has a direction. */
const MIN_LIGHT_ELEVATION = 7;

/**
 * Sky, sun/moon, hemisphere and directional light, haze, clouds, rain and (ultra) postprocessing. Time of day and
 * weather blend smoothly over a few seconds (instantly with reduced motion). Owner: A1.
 */
export function Environment() {
  const { store } = useCityContext();
  const rt = envRuntime(store);
  const timeOfDay = useCity(s => s.timeOfDay);
  const weather = useCity(s => s.weather);
  const quality = useCity(s => s.quality);
  const reducedMotion = useCity(s => s.reducedMotion);
  const budget = QUALITY[quality];
  // R3F is typed against an older @types/three (hoisted from apps/legacy); the runtime objects are the same.
  const gl = useThree(s => s.gl) as unknown as WebGLRenderer;
  const scene = useThree(s => s.scene) as unknown as Scene;

  const tr = useRef<Transition | null>(null);
  useEffect(() => {
    tr.current = startTransition(rt.state, presetFor(timeOfDay, weather), store.get().reducedMotion);
  }, [timeOfDay, weather, rt, store]);

  const skyUniforms = useMemo(() => createSkyUniforms(), []);
  const { sky, envScene, envSkyGround } = useMemo(() => {
    const sky = new Mesh(new SphereGeometry(1500, 48, 24), createSkyMaterial(skyUniforms));
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    // The reflection sky shares the uniforms but has its own darker "ground" below the horizon.
    const envUniforms = { ...skyUniforms, uGround: { value: new Color() } };
    const envScene = new Scene();
    envScene.add(new Mesh(new SphereGeometry(100, 32, 16), createSkyMaterial(envUniforms, true)));
    return { sky, envScene, envSkyGround: envUniforms.uGround.value };
  }, [skyUniforms]);

  const { hemi, sun, fog } = useMemo(() => {
    const hemi = new HemisphereLight();
    const sun = new DirectionalLight();
    sun.shadow.camera.left = sun.shadow.camera.bottom = -SHADOW_HALF;
    sun.shadow.camera.right = sun.shadow.camera.top = SHADOW_HALF;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 800;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.12;
    return { hemi, sun, fog: new FogExp2('#bfd3e2', 0.0026) };
  }, []);

  useEffect(() => {
    sun.castShadow = budget.shadows;
    if (sun.shadow.mapSize.x !== budget.shadowMapSize) {
      sun.shadow.mapSize.set(budget.shadowMapSize, budget.shadowMapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  }, [sun, budget.shadows, budget.shadowMapSize]);

  useEffect(() => {
    const prev = scene.fog;
    scene.fog = fog;
    return () => {
      scene.fog = prev;
    };
  }, [scene, fog]);

  // Image-based lighting: the sky rendered into a prefiltered environment map, refreshed while the sky changes.
  const pmrem = useMemo(() => new PMREMGenerator(gl), [gl]);
  const envTarget = useRef<WebGLRenderTarget | null>(null);
  const envAge = useRef(Infinity);
  const envDirty = useRef(true);
  useEffect(
    () => () => {
      envTarget.current?.dispose();
      envTarget.current = null;
      pmrem.dispose();
      scene.environment = null;
    },
    [pmrem, scene],
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const st = store.get();
    const u = rt.uniforms;
    if (tr.current) {
      const running = !transitionDone(tr.current);
      rt.state = stepTransition(tr.current, dt);
      if (running) envDirty.current = true;
    }
    const s = rt.state;
    if (!st.paused) u.uTime.value += dt;
    u.uMotion.value = st.reducedMotion ? 0 : 1;
    u.uNight.value = s.nightFactor;
    u.uWet.value = s.wetness;
    u.uCloud.value = s.cloudCover;

    const [sx, sy, sz] = sunVector(s.sunElevation, s.sunAzimuth);
    const [lx, ly, lz] = sunVector(Math.max(s.sunElevation, MIN_LIGHT_ELEVATION), s.sunAzimuth);
    u.uSunDir.value.set(lx, ly, lz);
    rt.light.sunDirection.set(lx, ly, lz);
    rt.light.sunColor.setRGB(...s.sunColor).multiplyScalar(s.sunIntensity);
    rt.light.ambient.setRGB(...s.hemiSky).multiplyScalar(s.hemiIntensity);
    rt.light.nightFactor = s.nightFactor;
    rt.light.wetness = s.wetness;

    // Low sun stretches shadow texels across the ground: widen the normal bias as it sets, against acne.
    sun.shadow.normalBias = Math.min(0.6, 0.1 / Math.max(ly, 0.15));
    sun.color.setRGB(...s.sunColor);
    sun.intensity = s.sunIntensity;
    sun.position.set(lx * 400, ly * 400, lz * 400);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();
    hemi.color.setRGB(...s.hemiSky);
    hemi.groundColor.setRGB(...s.hemiGround);
    hemi.intensity = s.hemiIntensity;

    fog.color.setRGB(...s.fogColor);
    fog.density = s.fogDensity;
    u.uFogColor.value.setRGB(...s.fogColor);

    skyUniforms.uZenith.value.setRGB(...s.zenith);
    skyUniforms.uHorizon.value.setRGB(...s.horizon);
    skyUniforms.uSunGlow.value.setRGB(...s.sunGlow);
    skyUniforms.uSunColor.value.setRGB(...s.sunColor);
    skyUniforms.uGround.value.setRGB(...s.fogColor);
    skyUniforms.uSunDir.value.set(sx, sy, sz);
    skyUniforms.uSunDisk.value = s.sunDisk * (1 - s.cloudCover * 0.8);
    skyUniforms.uMoon.value = s.moon * (1 - s.cloudCover * 0.7);
    skyUniforms.uStars.value = s.stars;
    skyUniforms.uCover.value = s.cloudCover;
    skyUniforms.uTime.value = u.uTime.value;
    // What glass sees below the horizon: the sunlit city and street, not a black void.
    envSkyGround
      .setRGB(...s.hemiGround)
      .lerp(u.uFogColor.value, 0.5)
      .multiplyScalar(0.75 * (1 - 0.5 * s.nightFactor));
    gl.toneMappingExposure = s.exposure;
    scene.environmentIntensity = s.envIntensity;

    // The sky dome travels with the camera so it is never clipped.
    sky.position.copy(state.camera.position);

    envAge.current += rawDt;
    if (envDirty.current && envAge.current > 0.35) {
      const next = pmrem.fromScene(envScene, 0, 0.1, 1000);
      envTarget.current?.dispose();
      envTarget.current = next;
      scene.environment = next.texture;
      envAge.current = 0;
      envDirty.current = !!tr.current && !transitionDone(tr.current);
    }
  });

  return (
    <>
      <primitive object={sky} />
      <primitive object={hemi} />
      <primitive object={sun} />
      <primitive object={sun.target} />
      <Clouds layers={budget.cloudLayers} rt={rt} />
      {!reducedMotion && <Rain drops={budget.rainDrops} rt={rt} />}
      {budget.postprocessing && <PostFX ultra={quality === 'ultra'} />}
      {process.env.NODE_ENV !== 'production' && <DebugParams />}
    </>
  );
}
