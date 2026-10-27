'use client';
import dynamic from 'next/dynamic';
import { Component, type ReactNode, useEffect, useRef, useState } from 'react';

// The 3D scene is code-split and never rendered on the server. Until it is ready (and forever, when it can't run)
// the static skyline underneath is what people see.
const HeroCityCanvas = dynamic(() => import('./HeroCityCanvas'), { ssr: false, loading: () => null });

type Mode = 'static' | 'live';

/** True when this browser can create a WebGL context at all. */
function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** A failed scene (lost context, shader error) falls back to the illustration instead of breaking the page. */
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

/**
 * The hero's live city preview. It loads only when:
 *  - the browser has WebGL,
 *  - the visitor has not asked for reduced motion,
 *  - the hero is on screen, and the page has finished its first paint (the headline is the LCP, not the canvas).
 * It pauses while scrolled away or while the tab is hidden, and the visitor can pause it at any time.
 */
export function HeroCity() {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('static');
  const [visible, setVisible] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches || !hasWebGL()) return;
    // Wait for the browser to be idle after load so the scene never competes with the first paint.
    const start = () => setMode('live');
    // Safari has no requestIdleCallback: fall back to a short timer.
    const useIdle = 'requestIdleCallback' in window;
    const handle = useIdle ? window.requestIdleCallback(start, { timeout: 2500 }) : window.setTimeout(start, 1200);
    const onMotion = () => motion.matches && setMode('static');
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
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { threshold: 0.05 });
    io.observe(el);
    const onVis = () => setTabHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    if (mode !== 'live') {
      setShown(false);
      return;
    }
    // Fade the canvas in a moment after it mounts, once the first frames have been drawn.
    const t = window.setTimeout(() => setShown(true), 400);
    return () => window.clearTimeout(t);
  }, [mode]);

  const live = mode === 'live';
  const paused = !visible || tabHidden || userPaused;

  return (
    <div ref={ref} className="mk-hero-live" data-mode={mode} data-testid="hero-city">
      {live && (
        <div className="mk-hero-canvas-wrap" data-shown={shown} aria-hidden={!shown}>
          <SceneBoundary onError={() => setMode('static')}>
            <HeroCityCanvas paused={paused} />
          </SceneBoundary>
        </div>
      )}
      <div className="mk-hero-caption">
        <span className="mk-hero-caption-dot" data-live={live && !userPaused} aria-hidden="true" />
        <span>{live ? 'Public city preview · simulated activity' : 'Illustration of the city at golden hour'}</span>
        {live && (
          <button
            type="button"
            className="mk-hero-pause"
            aria-pressed={userPaused}
            onClick={() => setUserPaused(p => !p)}
            data-testid="hero-pause"
          >
            {userPaused ? 'Play' : 'Pause'}
            <span className="sr-only"> the city preview</span>
          </button>
        )}
      </div>
    </div>
  );
}
