'use client';

import { useEffect } from 'react';
import { initDemo } from './demo-app';
import { initLanding } from './landing';

// The hero's scene is written for three r128 and loaded from our own host as a global, the way the design has it.
// Loaded once; a second effect run (React development) reuses the same promise.
let r128: Promise<void> | null = null;
function loadThreeR128(): Promise<void> {
  const w = window as unknown as { THREE?: unknown };
  if (w.THREE) return Promise.resolve();
  r128 ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/asc/three.r128.min.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      r128 = null;
      reject(new Error('three r128 did not load'));
    };
    document.head.appendChild(s);
  });
  return r128;
}

/** Wires up the front page: scroll effects and counters, the hero city and the live demo. Renders nothing itself. */
export function AscClient() {
  useEffect(() => {
    const landing = initLanding();
    const stopDemo = initDemo();
    let stopHero = () => {};
    let gone = false;
    // The hero is decoration: a failure to load the 3D library leaves the skyline drawing and the simulated feed.
    loadThreeR128()
      .catch(() => undefined)
      .then(async () => {
        if (gone) return;
        const { initHeroCity } = await import('./hero-city');
        if (gone) return;
        stopHero = initHeroCity(landing.hud);
      });
    return () => {
      gone = true;
      stopHero();
      stopDemo();
      landing.dispose();
    };
  }, []);
  return null;
}
