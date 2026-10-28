'use client';

// The 3D city for the lite demo: the visitor's own building is highlighted and enterable (everything else is
// look-only), and the demo team sits at the desks of their floor. The office view itself is the city scene's own,
// so a better-looking office lands here without changes. Browser only (WebGL).
import {
  CITY_LAYOUT,
  CityHud,
  CityScene,
  type CityStore,
  LoadingVeil,
  NoWebGL,
  type DeskOccupant,
  type OfficeOccupants,
  OfficeOccupantsContext,
  SceneErrorBoundary,
  detectWebGL,
} from '@agentcity/city-scene';
import { useMemo, useState } from 'react';
import type { LiteAgent, LiteMe } from '../../lib/api-client';
import { CONTACT_EMAIL } from '../../lib/preview';

export function occupantsOf(agents: LiteAgent[]): DeskOccupant[] {
  return agents.map(a => ({ id: a.id, name: a.name, role: a.role, kind: 'ai', status: a.status, summary: a.summary }));
}

export function LiteCityView({
  me,
  agents,
  store,
  onSelect,
}: {
  me: LiteMe;
  agents: LiteAgent[];
  store: CityStore;
  onSelect: (id: string) => void;
}) {
  const [view, setView] = useState<'webgl' | 'map' | 'failed'>(() => (detectWebGL() ? 'webgl' : 'map'));
  const occupants = useMemo<OfficeOccupants>(
    () => ({
      building: me.building.key,
      level: me.office.level,
      agents: occupantsOf(agents),
      onSelect,
      deskTestId: id => `office-desk-${id}`,
    }),
    [me.building.key, me.office.level, agents, onSelect],
  );
  const cta = {
    href: `mailto:${CONTACT_EMAIL}`,
    label: 'Talk to us',
    note: 'Want an office like this for your business?',
  };
  const panel = { officeCta: cta, entry: { building: me.building.key, level: me.office.level } };

  return (
    <OfficeOccupantsContext.Provider value={occupants}>
      {view === 'webgl' ? (
        <SceneErrorBoundary onShowMap={() => setView('failed')}>
          <CityScene
            store={store}
            label={`AgentCity, with your building ${me.building.name} highlighted. Use the panel to enter it and meet your AI team.`}
            overlay={
              <>
                <CityHud {...panel} brand={null} />
                <LoadingVeil />
              </>
            }
          />
        </SceneErrorBoundary>
      ) : (
        <div style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>
          <NoWebGL
            store={store}
            layout={CITY_LAYOUT}
            title="Your city"
            reason={view === 'failed' ? 'The 3D view stopped on this device, so here is the city map.' : undefined}
            {...panel}
          />
        </div>
      )}
    </OfficeOccupantsContext.Provider>
  );
}
