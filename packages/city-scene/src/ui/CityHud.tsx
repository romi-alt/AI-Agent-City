'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sceneBus } from '../camera/bus.ts';
import { KEY_HELP } from '../camera/keyboard.ts';
import { breadcrumbs, findBuilding } from '../camera/modes.ts';
import { useNav } from '../camera/useNav.ts';
import { useCity, useCityContext } from '../context.tsx';
import {
  IconBuildings,
  IconClose,
  IconHome,
  IconKeyboard,
  IconMinus,
  IconPlus,
  IconReset,
  IconSettings,
  IconTurnLeft,
  IconTurnRight,
} from './icons.tsx';
import { NavPanel, type PanelOptions } from './panels.tsx';
import { ViewSettings } from './Settings.tsx';
import { SceneLabels } from './SceneLabels.tsx';
import { HudStyles } from './styles.tsx';
import { announce } from './text.ts';

export interface CityHudProps extends PanelOptions {
  /** Brand text in the top bar (links home). */
  brand?: { label: string; href: string } | null;
  /** Show the time/weather/quality/motion settings (default true). */
  settings?: boolean;
  /** Text under the arrival title. */
  arrivalSubtitle?: string;
}

/**
 * The city HUD: breadcrumb (City › Building › Floor › Office), the panel for the current view, view settings,
 * camera buttons, keyboard help, the arrival's "Skip intro", and a polite live region announcing each view.
 * Render it as <CityScene overlay={<CityHud />} />.
 */
export function CityHud({
  brand = { label: 'AgentCity', href: '/' },
  settings = true,
  arrivalSubtitle,
  ...panel
}: CityHudProps) {
  const { store, layout } = useCityContext();
  const mode = useCity(s => s.mode);
  const nav = useNav();
  const bus = useMemo(() => sceneBus(store), [store]);
  const [pop, setPop] = useState<'settings' | 'keys' | null>(null);
  const [directory, setDirectory] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const popButton = useRef<HTMLButtonElement | null>(null);
  const arriving = mode.kind === 'arrival';
  const crumbs = breadcrumbs(mode, layout);
  const sheetOpen = mode.kind !== 'explore' && mode.kind !== 'arrival' ? true : directory;

  useEffect(() => {
    if (mode.kind !== 'explore') setDirectory(false);
  }, [mode.kind]);

  // Popovers: focus inside on open; Esc or a click outside closes and returns focus to their button.
  useEffect(() => {
    if (!pop) return;
    requestAnimationFrame(() => popRef.current?.querySelector<HTMLElement>('h2, input, button')?.focus());
    const onDown = (e: PointerEvent) => {
      if (popRef.current?.contains(e.target as Node) || popButton.current?.contains(e.target as Node)) return;
      setPop(null);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [pop]);
  const closePop = () => {
    setPop(null);
    popButton.current?.focus();
  };
  const toggle = (which: 'settings' | 'keys', e: React.MouseEvent<HTMLButtonElement>) => {
    popButton.current = e.currentTarget;
    setPop(p => (p === which ? null : which));
  };

  const live = announce(mode, layout);

  return (
    <div className="ac-hud" data-mode={mode.kind} data-sheet={sheetOpen ? 'open' : 'closed'}>
      <HudStyles />
      <SceneLabels />
      <div
        className="ac-scene-focus"
        tabIndex={0}
        data-city-focus=""
        role="application"
        aria-roledescription="3D city"
        aria-label="City view. Arrow keys or W A S D move, Q and E turn, plus and minus zoom, R resets the view, H returns to the overview, Escape goes back."
      />
      <p className="ac-live" aria-live="polite">
        {live}
      </p>

      {arriving ? (
        <Arrival
          subtitle={arrivalSubtitle}
          highlight={findBuilding(layout, store.get().highlight)?.name ?? null}
          onSkip={() => bus.emit({ type: 'skip' })}
          bus={bus}
        />
      ) : (
        <>
          <div className="ac-top">
            <nav className="ac-brandbar ac-glass" aria-label="Where you are">
              {brand && (
                <a className="ac-brand" href={brand.href}>
                  {brand.label}
                </a>
              )}
              <ol className="ac-crumbs">
                {crumbs.map((c, i) => (
                  <li key={i}>
                    {c.mode ? (
                      <button type="button" onClick={() => store.set({ mode: c.mode! })}>
                        {c.label}
                      </button>
                    ) : (
                      <span aria-current="page">{c.label}</span>
                    )}
                  </li>
                ))}
              </ol>
              {mode.kind === 'explore' && (
                <button
                  type="button"
                  className="ac-icon-btn"
                  aria-expanded={directory}
                  aria-label={directory ? 'Hide the list of buildings' : 'Show a list of buildings'}
                  title="Buildings"
                  onClick={() => setDirectory(d => !d)}
                >
                  <IconBuildings />
                </button>
              )}
            </nav>
            <div style={{ position: 'relative' }}>
              <div className="ac-tools ac-glass" role="toolbar" aria-label="View">
                {settings && (
                  <button
                    type="button"
                    className="ac-icon-btn"
                    aria-expanded={pop === 'settings'}
                    aria-controls="ac-pop-settings"
                    aria-label="View settings: time of day, weather, quality, motion"
                    title="View settings"
                    onClick={e => toggle('settings', e)}
                  >
                    <IconSettings />
                  </button>
                )}
                <button
                  type="button"
                  className="ac-icon-btn"
                  aria-expanded={pop === 'keys'}
                  aria-controls="ac-pop-keys"
                  aria-label="Keyboard shortcuts"
                  title="Keyboard shortcuts"
                  onClick={e => toggle('keys', e)}
                >
                  <IconKeyboard />
                </button>
              </div>
              {pop && (
                <div
                  ref={popRef}
                  id={pop === 'settings' ? 'ac-pop-settings' : 'ac-pop-keys'}
                  className="ac-pop ac-glass"
                  role="dialog"
                  aria-label={pop === 'settings' ? 'View settings' : 'Keyboard shortcuts'}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      closePop();
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 tabIndex={-1}>{pop === 'settings' ? 'View settings' : 'Keyboard shortcuts'}</h2>
                    <button type="button" className="ac-icon-btn" aria-label="Close" onClick={closePop}>
                      <IconClose />
                    </button>
                  </div>
                  {pop === 'settings' ? (
                    <ViewSettings />
                  ) : (
                    <dl className="ac-keys">
                      {KEY_HELP.map(([k, v]) => (
                        <div key={k} style={{ display: 'contents' }}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="ac-cam ac-glass" role="toolbar" aria-label="Camera">
            <button
              type="button"
              className="ac-icon-btn"
              aria-label="Turn left"
              title="Turn left (Q)"
              onClick={() => bus.emit({ type: 'rotate', dir: -1 })}
            >
              <IconTurnLeft />
            </button>
            <button
              type="button"
              className="ac-icon-btn"
              aria-label="Zoom in"
              title="Zoom in (+)"
              onClick={() => bus.emit({ type: 'zoom', dir: 1 })}
            >
              <IconPlus />
            </button>
            <button
              type="button"
              className="ac-icon-btn"
              aria-label="Turn right"
              title="Turn right (E)"
              onClick={() => bus.emit({ type: 'rotate', dir: 1 })}
            >
              <IconTurnRight />
            </button>
            <button
              type="button"
              className="ac-icon-btn"
              aria-label="Reset this view"
              title="Reset this view (R)"
              onClick={() => bus.emit({ type: 'reset' })}
            >
              <IconReset />
            </button>
            <button
              type="button"
              className="ac-icon-btn"
              aria-label="Zoom out"
              title="Zoom out (−)"
              onClick={() => bus.emit({ type: 'zoom', dir: -1 })}
            >
              <IconMinus />
            </button>
            <button
              type="button"
              className="ac-icon-btn"
              aria-label="City overview"
              title="City overview (H)"
              onClick={() => {
                if (!nav({ type: 'home' })) bus.emit({ type: 'reset' });
              }}
            >
              <IconHome />
            </button>
          </div>

          <NavPanel {...panel} directory={directory} onCloseDirectory={() => setDirectory(false)} />
        </>
      )}
    </div>
  );
}

function Arrival({
  subtitle,
  highlight,
  onSkip,
  bus,
}: {
  subtitle?: string;
  highlight: string | null;
  onSkip: () => void;
  bus: ReturnType<typeof sceneBus>;
}) {
  const [progress, setProgress] = useState(0);
  useEffect(() => bus.on(e => e.type === 'arrival-progress' && setProgress(e.value)), [bus]);
  return (
    <div className="ac-arrival ac-glass">
      <p className="ac-arrival-title">Welcome to AgentCity</p>
      <p className="ac-arrival-sub">
        {subtitle ?? (highlight ? `Taking you to ${highlight}.` : 'A city where AI agents work alongside your team.')}
      </p>
      <div className="ac-progress" aria-hidden="true">
        <i style={{ transform: `scaleX(${progress})` }} />
      </div>
      <button type="button" className="ac-btn" onClick={onSkip}>
        Skip intro
      </button>
    </div>
  );
}
