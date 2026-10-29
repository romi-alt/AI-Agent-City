'use client';

import { useEffect } from 'react';
import { CLIENTS } from './data';
import { initDemo } from './demo-app';
import { initLanding, pick, prefersReducedMotion } from './landing';

/** Wires up the front page: the nav, scroll effects, counters, the simulated hero feed and the live demo. */
export function AscClient() {
  useEffect(() => {
    const landing = initLanding();
    const stopDemo = initDemo();
    // The hero's city feed: one simulated sales event every few seconds (slower for reduced motion).
    const feed = window.setInterval(() => landing.hud.cityEvent(pick(CLIENTS)), prefersReducedMotion() ? 4000 : 2600);
    return () => {
      window.clearInterval(feed);
      stopDemo();
      landing.dispose();
    };
  }, []);
  return null;
}
