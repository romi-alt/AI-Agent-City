'use client';
import { useEffect, useMemo } from 'react';
import { CityContext, type CityContextValue, useCity, useCityContext } from '../context.tsx';
import { useNav } from '../camera/useNav.ts';
import type { CityStore } from '../store.ts';
import type { CityLayout } from '../types.ts';
import { NavPanel, type PanelOptions } from './panels.tsx';
import { HudStyles } from './styles.tsx';
import { announce } from './text.ts';

export interface NoWebGLProps extends PanelOptions {
  store: CityStore;
  layout: CityLayout;
  title?: string;
  /** Why the 2D view is shown (no WebGL, or the 3D scene failed). */
  reason?: string;
}

/**
 * The city without WebGL: a 2D map of the districts and a list with the same choices as the 3D view
 * (districts → buildings → floors → office), driven by the same store and navigation rules.
 */
export function NoWebGL({ store, layout, title = 'AgentCity', reason, ...panel }: NoWebGLProps) {
  const ctx = useMemo<CityContextValue>(() => ({ store, layout }), [store, layout]);
  return (
    <CityContext.Provider value={ctx}>
      <HudStyles />
      <Map2D title={title} reason={reason} panel={panel} />
    </CityContext.Provider>
  );
}

function Map2D({ title, reason, panel }: { title: string; reason?: string; panel: PanelOptions }) {
  const { layout } = useCityContext();
  const mode = useCity(s => s.mode);
  const nav = useNav();
  const current = 'building' in mode ? mode.building : null;
  // There is no flight to watch on the map: the arrival ends at once.
  useEffect(() => {
    if (mode.kind === 'arrival') nav({ type: 'arrival-done' });
  }, [mode.kind, nav]);
  const e = layout.streets.extent;
  const minX = Math.min(...layout.buildings.map(b => b.x - b.w / 2)) - 12;
  const maxX = Math.max(...layout.buildings.map(b => b.x + b.w / 2)) + 12;
  const minZ = Math.min(...layout.buildings.map(b => b.z - b.d / 2)) - 12;
  const maxZ = Math.max(...layout.buildings.map(b => b.z + b.d / 2)) + 12;
  return (
    <div className="ac-map2d">
      <header>
        <h1>{title}</h1>
        <p>
          {reason ??
            'This device cannot show the 3D city, so here is the map. Everything you can do in 3D works here too.'}
        </p>
        <p className="ac-live" aria-live="polite">
          {announce(mode, layout)}
        </p>
      </header>
      <div>
        {/* The map is a picture you can click; the list beside it offers the same choices to keyboards and screen readers. */}
        <svg
          className="ac-map-svg"
          viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`}
          aria-hidden="true"
          focusable="false"
        >
          {layout.streets.roadsX.map(x => (
            <rect key={`x${x}`} x={x - 2} y={-e} width={4} height={e * 2} fill="#22344d" />
          ))}
          {layout.streets.roadsZ.map(z => (
            <rect key={`z${z}`} x={-e} y={z - 2} width={e * 2} height={4} fill="#22344d" />
          ))}
          {layout.buildings.map(b => (
            <g
              key={b.key}
              className="ac-map-lot"
              aria-current={current === b.key ? 'true' : undefined}
              onClick={() => nav({ type: 'select-building', building: b.key })}
            >
              <rect
                x={b.x - b.w / 2}
                y={b.z - b.d / 2}
                width={b.w}
                height={b.d}
                rx={0.8}
                fill={b.color}
                stroke="#0f1b2d"
                strokeWidth={0.4}
              />
              <text
                x={b.x}
                y={b.z + b.d / 2 + 2.6}
                textAnchor="middle"
                fontSize={2}
                fill="#f6f3ec"
                style={{ pointerEvents: 'none' }}
              >
                {b.shortName.length > 16 ? `${b.shortName.slice(0, 15)}…` : b.shortName}
              </text>
              <text
                x={b.x}
                y={b.z + 0.7}
                textAnchor="middle"
                fontSize={2.2}
                fontWeight={700}
                fill="#0f1b2d"
                style={{ pointerEvents: 'none' }}
              >
                {b.floors.length}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <NavPanel {...panel} directory measure={false} />
    </div>
  );
}
