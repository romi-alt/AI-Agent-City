'use client';
import { type CityStore, HudStyles, useCity } from '@agentcity/city-scene';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PRESENT_STEPS, stepBuilding, stepIndex } from './present';
import './present.css';

const AUTO_MS = 8000;

/** Moves the city's camera to a step: the overview, a building, or one of its floors. */
function showStep(store: CityStore, i: number) {
  const step = PRESENT_STEPS[stepIndex(i)]!;
  store.set({ mode: step.view, highlight: stepBuilding(step), selectedAgent: null, explode: false });
}

function toggleFullScreen() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
  // Refused (no click, an iframe, an old browser): the city already fills the window, so nothing is lost.
  else document.documentElement.requestFullscreen?.().catch(() => undefined);
}

/**
 * The "Present" button over the 3D explorer (rendered inside the scene, which provides the city context), shown only
 * on the overview so it never covers a building's panel or the arrival caption.
 */
export function PresentButton({ onStart }: { onStart: () => void }) {
  const exploring = useCity(s => s.mode.kind === 'explore');
  if (!exploring) return null;
  return (
    <button type="button" className="ac-present-start" onClick={onStart} data-testid="present-start">
      ▶ Present the city
    </button>
  );
}

/**
 * Present mode: the city fills the screen and a caption card walks through the pitch. Next and back with the arrow
 * keys, Space, PageDown/PageUp (so a presentation clicker works) or a tap on either half of a touch screen.
 */
export function PresentMode({ store, onExit }: { store: CityStore; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(false);
  const [awake, setAwake] = useState(true);
  const wakeTimer = useRef<number | undefined>(undefined);
  const step = PRESENT_STEPS[stepIndex(i)]!;

  const go = useCallback((d: number) => setI(n => stepIndex(n + d)), []);
  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    store.set({ mode: { kind: 'explore' }, highlight: null });
    onExit();
  }, [store, onExit]);

  useEffect(() => showStep(store, i), [store, i]);

  // Auto-play restarts its timer whenever the step changes, so a manual step never gets skipped straight away.
  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => go(1), AUTO_MS);
    return () => window.clearTimeout(t);
  }, [auto, i, go]);

  // The controls fade after a few seconds without the pointer moving, and come back on the next move.
  const wake = useCallback(() => {
    setAwake(true);
    window.clearTimeout(wakeTimer.current);
    wakeTimer.current = window.setTimeout(() => setAwake(false), 2500);
  }, []);
  useEffect(() => {
    wake();
    window.addEventListener('pointermove', wake);
    return () => {
      window.removeEventListener('pointermove', wake);
      window.clearTimeout(wakeTimer.current);
    };
  }, [wake]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const d = ({ ArrowRight: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, PageUp: -1 } as Record<string, number>)[e.key];
      if (d) {
        e.preventDefault();
        e.stopPropagation();
        go(d);
      } else if (e.key === 'p' || e.key === 'P') setAuto(a => !a);
      else if (e.key === 'f' || e.key === 'F') toggleFullScreen();
      else if (e.key === 'Escape' && !document.fullscreenElement) exit();
    };
    // Capture phase: the explorer's own arrow-key camera controls must not also move while presenting.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, exit]);

  // Esc in full screen is taken by the browser, so leaving full screen during the pitch ends it.
  useEffect(() => {
    let wasFull = Boolean(document.fullscreenElement);
    const onChange = () => {
      const full = Boolean(document.fullscreenElement);
      if (wasFull && !full) exit();
      wasFull = full;
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [exit]);

  // Touch: a quick tap on the right half moves on, on the left half goes back. Drags still turn the camera.
  useEffect(() => {
    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => {
      const onControls = e.target instanceof Element && e.target.closest('.ac-present-card, .ac-present-ctrl');
      down = e.pointerType === 'touch' && !onControls ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    };
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && performance.now() - down.t < 350) {
        go(e.clientX > window.innerWidth / 2 ? 1 : -1);
      }
      down = null;
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [go]);

  const last = stepIndex(i) === PRESENT_STEPS.length - 1;
  return (
    <div className="ac-present" data-awake={awake} data-testid="present-mode">
      {/* The page layout (.ac-city-page) ships with the HUD's styles; Present mode replaces the HUD, so it brings them. */}
      <HudStyles />
      <div className="ac-present-ctrl" role="toolbar" aria-label="Presentation">
        <button type="button" onClick={() => go(-1)} aria-label="Previous stop">
          ‹
        </button>
        <button type="button" onClick={() => setAuto(a => !a)} aria-pressed={auto}>
          {auto ? '❚❚ Auto' : '▶ Auto'}
        </button>
        <button type="button" onClick={() => go(1)} aria-label="Next stop">
          ›
        </button>
        <button type="button" onClick={toggleFullScreen} aria-label="Full screen">
          ⛶
        </button>
        <button type="button" onClick={exit} aria-label="End the presentation">
          ✕
        </button>
      </div>
      <section className="ac-present-card" aria-live="polite" aria-label="Presentation caption">
        <p className="ac-present-tag">{step.tag}</p>
        <h2 key={`t${i}`}>{step.title}</h2>
        <p key={`l${i}`} className="ac-present-line">
          {step.line}
        </p>
        {last && (
          <a className="ac-present-cta" href="/#get-demo">
            Get My Free Demo Office →
          </a>
        )}
        <div className="ac-present-foot">
          <span className="ac-present-dots" aria-hidden="true">
            {PRESENT_STEPS.map((s, k) => (
              <i key={s.title} data-on={k === stepIndex(i)} data-done={k < stepIndex(i)} />
            ))}
          </span>
          <span className="ac-present-count">
            {stepIndex(i) + 1} / {PRESENT_STEPS.length}
          </span>
          <span className="ac-present-keys">← → move · P auto-play · F full screen · Esc exit</span>
        </div>
      </section>
    </div>
  );
}
