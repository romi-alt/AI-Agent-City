'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useCityContext } from '../context.tsx';
import { pickInitialQuality, SAMPLE_FRAMES, SETTLE_SECONDS, SlowFrameMonitor, stepDown } from './auto.ts';

/**
 * Owner: A1. Measures frame time once the scene has settled and picks the initial quality (unless the user chose
 * one: `qualityAuto: false` is never overridden), steps down on sustained slow frames, pauses non-essential
 * animation and rendering while the tab is hidden or the canvas is off-screen, and follows prefers-reduced-motion.
 */
export function QualityManager() {
  const { store } = useCityContext();
  const setFrameloop = useThree(s => s.setFrameloop);
  const canvas = useThree(s => s.gl.domElement);

  // prefers-reduced-motion: applied on load and whenever the system setting changes.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    if (mq.matches && !store.get().reducedMotion) store.set({ reducedMotion: true });
    const onChange = () => store.set({ reducedMotion: mq.matches });
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [store]);

  // Paused while the tab is hidden or the scene is scrolled out of view.
  useEffect(() => {
    let visible = true;
    const update = () => {
      const paused = document.hidden || !visible;
      if (store.get().paused !== paused) store.set({ paused });
      setFrameloop(paused ? 'demand' : 'always');
    };
    document.addEventListener('visibilitychange', update);
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(entries => {
        visible = entries.some(e => e.isIntersecting);
        update();
      });
      io.observe(canvas);
    }
    update();
    return () => {
      document.removeEventListener('visibilitychange', update);
      io?.disconnect();
    };
  }, [store, setFrameloop, canvas]);

  const settle = useRef(SETTLE_SECONDS);
  const samples = useRef<number[]>([]);
  const picked = useRef(false);
  const monitor = useRef(new SlowFrameMonitor());
  const lastQuality = useRef(store.get().quality);

  useFrame((_, dt) => {
    const st = store.get();
    if (st.paused || !st.qualityAuto) return;
    // A quality change recompiles shaders and resizes buffers: let it settle before judging again.
    if (st.quality !== lastQuality.current) {
      lastQuality.current = st.quality;
      settle.current = SETTLE_SECONDS;
      monitor.current.reset();
    }
    if (settle.current > 0) {
      settle.current -= dt;
      return;
    }
    const ms = dt * 1000;
    if (!picked.current) {
      samples.current.push(ms);
      if (samples.current.length >= SAMPLE_FRAMES) {
        picked.current = true;
        const q = pickInitialQuality(samples.current);
        samples.current = [];
        if (q !== st.quality) store.set({ quality: q, qualityAuto: true });
      }
      return;
    }
    if (monitor.current.push(ms) && st.quality !== 'low')
      store.set({ quality: stepDown(st.quality), qualityAuto: true });
  });

  return null;
}
