'use client';
import dynamic from 'next/dynamic';
import { Component, type ReactNode, useEffect, useRef, useState } from 'react';

// The hero's city is the existing AgentCity scene. A rendered frame of it is the first paint and stays when there is
// no WebGL or the visitor prefers reduced motion; otherwise the live scene loads once the page is idle and fades in
// over it. It pauses when scrolled away, when the tab is hidden and while the live demo is open.
const HeroCityCanvas = dynamic(() => import('./HeroCityCanvas'), { ssr: false, loading: () => null });

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** A failed scene (lost context, shader error) falls back to the rendered frame instead of breaking the page. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function HeroCity() {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [shown, setShown] = useState(false);
  const [visible, setVisible] = useState(true);
  const [tabHidden, setTabHidden] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches || !hasWebGL()) return;
    const start = () => setLive(true);
    const useIdle = 'requestIdleCallback' in window;
    const handle = useIdle ? window.requestIdleCallback(start, { timeout: 2500 }) : window.setTimeout(start, 1200);
    const onMotion = () => motion.matches && setLive(false);
    motion.addEventListener('change', onMotion);
    return () => {
      motion.removeEventListener('change', onMotion);
      if (useIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0.05 });
    io.observe(el);
    const onVis = () => setTabHidden(document.visibilityState === 'hidden');
    const onDemo = (e: Event) => setDemoOpen(Boolean((e as CustomEvent<{ open: boolean }>).detail?.open));
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('asc:demo', onDemo);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('asc:demo', onDemo);
    };
  }, []);

  useEffect(() => {
    if (!live) {
      setShown(false);
      return;
    }
    const t = window.setTimeout(() => setShown(true), 400);
    return () => window.clearTimeout(t);
  }, [live]);

  return (
    <div className="hero-city" ref={ref} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- a static, pre-sized frame; no image optimiser in the preview build */}
      <img
        className="hero-city-poster"
        src="/city/poster-golden-1920.webp"
        srcSet="/city/poster-golden-960.webp 960w, /city/poster-golden-1920.webp 1920w"
        sizes="100vw"
        alt=""
        width={1920}
        height={1200}
        fetchPriority="high"
      />
      {live && (
        <div className={`hero-city-live${shown ? ' is-shown' : ''}`}>
          <SceneBoundary onError={() => setLive(false)}>
            <HeroCityCanvas paused={!visible || tabHidden || demoOpen} />
          </SceneBoundary>
        </div>
      )}
    </div>
  );
}
