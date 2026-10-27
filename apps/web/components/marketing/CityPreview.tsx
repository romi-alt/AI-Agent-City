'use client';
import dynamic from 'next/dynamic';
import { Component, type ReactNode, useEffect, useRef, useState } from 'react';
import { Icon } from './Primitives';

// INTEGRATION SLOT for the live city. The poster (a rendered golden-hour frame of the public city) is the first
// paint and stays when there is no WebGL or the visitor prefers reduced motion. Otherwise the R3F CityScene loads
// after the page is idle and fades in over it; it pauses when scrolled away, when the tab is hidden, or on request.
const CityPreviewCanvas = dynamic(() => import('./CityPreviewCanvas'), { ssr: false, loading: () => null });

type Mode = 'poster' | 'live';

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** A failed scene (lost context, shader error) falls back to the poster instead of breaking the page. */
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

export function CityPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('poster');
  const [visible, setVisible] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches || !hasWebGL()) return;
    const start = () => setMode('live');
    // Safari has no requestIdleCallback: fall back to a short timer.
    const useIdle = 'requestIdleCallback' in window;
    const handle = useIdle ? window.requestIdleCallback(start, { timeout: 2500 }) : window.setTimeout(start, 1200);
    const onMotion = () => motion.matches && setMode('poster');
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
    const t = window.setTimeout(() => setShown(true), 400);
    return () => window.clearTimeout(t);
  }, [mode]);

  const live = mode === 'live';
  return (
    <div ref={ref} className="mk-preview" data-mode={mode} data-testid="city-preview">
      <div className="mk-window-bar">
        <span className="mk-window-title">
          <span className="mk-window-dot" data-live={live && !userPaused} aria-hidden="true" />
          AgentCity · public city
        </span>
        <span className="mk-window-meta">
          <span className="mk-window-label" data-testid="city-preview-label">
            {live ? 'Simulated activity' : 'Rendered frame · simulated city'}
          </span>
          {live && (
            <button
              type="button"
              className="mk-window-btn"
              aria-pressed={userPaused}
              onClick={() => setUserPaused(p => !p)}
              data-testid="preview-pause"
            >
              <Icon name={userPaused ? 'play' : 'pause'} />
              <span className="sr-only">{userPaused ? 'Play' : 'Pause'} the city preview</span>
            </button>
          )}
        </span>
      </div>
      <div className="mk-window-view">
        <img
          className="mk-poster"
          data-testid="city-poster"
          src="/city/poster-golden-1920.webp"
          srcSet="/city/poster-golden-960.webp 960w, /city/poster-golden-1920.webp 1920w"
          sizes="(min-width: 1240px) 1160px, 100vw"
          width={1920}
          height={1200}
          alt="A frame of the AgentCity 3D city at golden hour: dealership towers, brick and glass offices, rooftop gardens and a skyline of spires"
          fetchPriority="high"
          decoding="async"
        />
        {live && (
          <div className="mk-preview-live" data-shown={shown} aria-hidden={!shown}>
            <SceneBoundary onError={() => setMode('poster')}>
              <CityPreviewCanvas paused={!visible || tabHidden || userPaused} />
            </SceneBoundary>
          </div>
        )}
      </div>
    </div>
  );
}
