'use client';
// Loaded only on demand (see CityPreview): this module pulls in the 3D city, so it must never be imported
// statically by the landing page.
import { CityScene, createCityStore } from '@agentcity/city-scene';
import { useEffect, useState } from 'react';

/** The same framing as the poster (skyline against the sky), so the live scene fades in without a jump. */
const HERO_POSE = { pos: [96, 58, 150], target: [-4, 42, -40] } as {
  pos: [number, number, number];
  target: [number, number, number];
};

/** The public city at low quality, golden hour: no tenant data, simulated activity, not interactive here. */
export default function CityPreviewCanvas({ paused }: { paused: boolean }) {
  // Created once; later changes go through store.set below.
  const [store] = useState(() =>
    createCityStore({
      quality: 'low',
      qualityAuto: false,
      reducedMotion: false,
      timeOfDay: 'golden',
      weather: 'partly-cloudy',
      mode: { kind: 'explore' },
      paused,
    }),
  );
  useEffect(() => {
    store.set({ paused });
  }, [store, paused]);
  return (
    <CityScene
      store={store}
      homePose={HERO_POSE}
      className="mk-preview-canvas"
      label="Live preview of the public AgentCity map: office towers, streets and simulated activity"
    />
  );
}
