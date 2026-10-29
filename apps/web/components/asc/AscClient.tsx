'use client';

import { useEffect } from 'react';
import { CLIENTS } from './data';
import { initLanding, pick, prefersReducedMotion } from './landing';

/** Wires up the front page: the nav, scroll effects, counters and the simulated hero feed. Renders nothing itself. */
export function AscClient() {
  useEffect(() => {
    const landing = initLanding();
    // The hero's city feed: one simulated sales event every few seconds (slower for reduced motion).
    const feed = window.setInterval(() => landing.hud.cityEvent(pick(CLIENTS)), prefersReducedMotion() ? 4000 : 2600);
    return () => {
      window.clearInterval(feed);
      landing.dispose();
    };
  }, []);
  return null;
}
