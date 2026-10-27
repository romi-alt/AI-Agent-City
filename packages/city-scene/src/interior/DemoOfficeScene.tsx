'use client';
import { type ReactNode, useEffect, useMemo } from 'react';
import { CityScene } from '../CityScene.tsx';
import { createCityStore, type CityStore } from '../store.ts';
import { SceneLabels } from '../ui/SceneLabels.tsx';
import { HudStyles } from '../ui/styles.tsx';
import type { CityMode, CityState } from '../types.ts';
import { type DeskOccupant, type OfficeOccupants, OfficeOccupantsContext } from './occupants.ts';

/** A synthetic demo agent, as the demo API returns it (extra fields are ignored). */
export interface DemoAgent {
  id: string;
  name: string;
  role: string;
  /** 'working' | 'idle' | 'needs-you'; anything else shows as idle. */
  status: string;
  summary?: string | null;
  /** Demo teams are AI agents; a host may add an anonymous human desk. */
  kind?: 'ai' | 'human';
}

export interface DemoOfficeSceneProps {
  agents: DemoAgent[];
  /** Building key, e.g. "rental-2". */
  building: string;
  level: number;
  /** Controlled selection: the agent whose desk the camera shows (null for the whole office). */
  selectedAgentId?: string | null;
  /** The visitor clicked or chose an agent's desk. */
  onSelectAgent?: (id: string) => void;
  /** The visitor asked to leave the office (Esc / Back with no desk selected). The scene stays in the office. */
  onExit?: () => void;
  /** DOM overlay over the canvas (the host's panels). */
  overlay?: ReactNode;
  className?: string;
  label?: string;
  /** Initial time of day, weather, quality, reduced motion… (mode and access are set by this component). */
  initial?: Partial<CityState>;
  /** Supply a store to control time of day, weather or quality from the host. */
  store?: CityStore;
}

/**
 * The demo office for the demo frontend: the given synthetic agents sit at desks (name, role, status light) on
 * one floor of the city, with the city visible through the windows. Selecting a desk calls `onSelectAgent`.
 */
export function DemoOfficeScene(props: DemoOfficeSceneProps) {
  const { agents, building, level, selectedAgentId, onSelectAgent, onExit } = props;
  const officeMode = (desk: number | null): CityMode => ({ kind: 'office', building, level, desk });
  const store = useMemo(
    () =>
      props.store ??
      createCityStore({
        ...props.initial,
        mode: officeMode(null),
        enterable: [building],
        highlight: building,
      }),
    // The store lives as long as the scene; later prop changes are applied below.
    [props.store],
  );

  useEffect(() => {
    store.set({ enterable: [building], highlight: building });
    if (store.get().mode.kind !== 'office') store.set({ mode: officeMode(null) });
  }, [store, building, level]);

  // Stay in this office: leaving (Esc, Back) is reported to the host instead.
  useEffect(
    () =>
      store.subscribe(() => {
        const m = store.get().mode;
        if (m.kind === 'office' && m.building === building && m.level === level) return;
        store.set({ mode: officeMode(null) });
        onExit?.();
      }),
    [store, building, level, onExit],
  );

  useEffect(() => {
    const i = selectedAgentId ? agents.findIndex(a => a.id === selectedAgentId) : -1;
    const m = store.get().mode;
    const desk = i >= 0 ? i : null;
    if (m.kind === 'office' && m.desk !== desk) store.set({ mode: officeMode(desk) });
  }, [store, selectedAgentId, agents]);

  const occupants = useMemo<OfficeOccupants>(
    () => ({
      building,
      level,
      agents: agents.map<DeskOccupant>(a => ({
        id: a.id,
        name: a.name,
        role: a.role,
        kind: a.kind ?? 'ai',
        status: a.status,
        summary: a.summary ?? null,
      })),
      ...(onSelectAgent ? { onSelect: onSelectAgent } : {}),
    }),
    [agents, building, level, onSelectAgent],
  );

  return (
    <OfficeOccupantsContext.Provider value={occupants}>
      <CityScene
        store={store}
        overlay={
          <>
            <HudStyles />
            <div className="ac-hud" style={{ pointerEvents: 'none' }}>
              <SceneLabels />
            </div>
            {props.overlay}
          </>
        }
        className={props.className}
        label={props.label ?? `Your office on floor ${level}, with ${agents.length} AI agents at their desks`}
      />
    </OfficeOccupantsContext.Provider>
  );
}
