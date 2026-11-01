'use client';
// Loaded only on demand (see HeroCity): this module pulls in the 3D city, so the page must never import it statically.
import { CityScene, createCityStore } from '@agentcity/city-scene';
import { useEffect, useState } from 'react';

/** The public AgentCity map behind the hero: low quality, golden hour, a slow orbit, nothing to click. */
export default function HeroCityCanvas({ paused }: { paused: boolean }) {
  const [store] = useState(() =>
    createCityStore({
      quality: 'low',
      qualityAuto: false,
      reducedMotion: false,
      timeOfDay: 'golden',
      weather: 'partly-cloudy',
      mode: { kind: 'explore' },
      view: 'orbit',
      enterable: [],
      paused,
    }),
  );
  useEffect(() => {
    store.set({ paused });
  }, [store, paused]);
  return (
    <CityScene
      store={store}
      label="Live view of the public AgentCity map: office towers, dealerships, streets and simulated activity"
    />
  );
}
