'use client';

// A stand-in for workstream A3's <DemoOfficeScene> (packages/city-scene interior/), with the same documented props, so
// the office page can be built and tested before the 3D interior lands. It draws the floor as a 2D plan: one desk per
// agent, each a button. It is swapped out in one place: components/demo/office-scene.tsx.
import { describeAgentStatus } from './demo-api';
import './demo.css';

export interface DemoOfficeSceneAgent {
  id: string;
  name: string;
  role: string;
  status: string;
}

export interface DemoOfficeSceneProps {
  agents: DemoOfficeSceneAgent[];
  building: { key: string; name: string };
  level: number | null;
  onSelectAgent: (agentId: string) => void;
}

export function DemoOfficeStandIn({ agents, building, level, onSelectAgent }: DemoOfficeSceneProps) {
  return (
    <div className="dm-floor" data-testid="office-scene" data-building={building.key} data-level={level ?? ''}>
      <div className="dm-floor-label">
        <span>
          <strong>{building.name}</strong>
          {level !== null ? ` · Level ${level}` : ''}
        </span>
        <span>Floor plan</span>
      </div>
      <div className="dm-desks" role="group" aria-label="Desks in your office">
        {agents.map(a => {
          const state = describeAgentStatus(a.status);
          return (
            <button
              key={a.id}
              type="button"
              className="dm-desk"
              aria-label={`${a.name}, ${a.role}: ${state}. Show details`}
              onClick={() => onSelectAgent(a.id)}
              data-testid={`office-desk-${a.id}`}
            >
              <span className="dm-monitor" aria-hidden="true" />
              <span className="dm-desk-top" aria-hidden="true" />
              <span className="dm-desk-name">{a.name}</span>
              <span className="dm-desk-role">{a.role}</span>
              <span className="dm-state" data-state={state}>
                {state}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
