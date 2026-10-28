'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useCityContext } from '../context.tsx';
import type { CityState, QualityLevel, TimeOfDay, Weather } from '../types.ts';

/**
 * Development only (never rendered in production builds): lets screenshots and manual checks set the scene from the
 * URL — `?tod=night&weather=light-rain&q=ultra&cam=x,y,z,tx,ty,tz` — and exposes the store and renderer stats on
 * `window.__city`.
 */
export function DebugParams() {
  const { store } = useCityContext();
  const camera = useThree(s => s.camera);
  const gl = useThree(s => s.gl);
  const scene = useThree(s => s.scene);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const patch: Partial<CityState> = {};
    const tod = q.get('tod');
    if (tod) patch.timeOfDay = tod as TimeOfDay;
    const weather = q.get('weather');
    if (weather) patch.weather = weather as Weather;
    const quality = q.get('q');
    if (quality) Object.assign(patch, { quality: quality as QualityLevel, qualityAuto: false });
    if (q.get('hover')) patch.hovered = q.get('hover');
    if (q.get('highlight')) patch.highlight = q.get('highlight');
    // Apply time/weather instantly (as with reduced motion), then restore the requested motion setting.
    const wantRm = q.get('rm') === '1' || store.get().reducedMotion;
    if (Object.keys(patch).length) store.set({ ...patch, reducedMotion: true });
    const restore = setTimeout(() => store.set({ reducedMotion: wantRm }), 300);
    const cam = q.get('cam')?.split(',').map(Number);
    if (cam && cam.length === 6 && cam.every(Number.isFinite)) {
      // Applied right before every render, after the camera rig has run, so screenshots can pin a view.
      scene.onBeforeRender = () => {
        camera.position.set(cam[0]!, cam[1]!, cam[2]!);
        camera.lookAt(cam[3]!, cam[4]!, cam[5]!);
        camera.updateMatrixWorld();
      };
    }
    if (q.get('explode')) store.set({ explode: true, mode: { kind: 'building', building: q.get('explode')! } });
    (window as unknown as { __city: unknown }).__city = { store, gl, camera, scene };
    return () => clearTimeout(restore);
  }, [store, camera, gl, scene]);
  // Per-frame renderer totals (shadow, main and postprocessing passes together) for performance notes.
  useFrame(() => {
    const info = gl.info;
    info.autoReset = false;
    (window as unknown as { __cityFrame: unknown }).__cityFrame = {
      calls: info.render.calls,
      triangles: info.render.triangles,
    };
    info.reset();
  }, -1000);
  return null;
}
