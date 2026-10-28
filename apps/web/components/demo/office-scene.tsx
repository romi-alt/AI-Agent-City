'use client';

// The demo office scene: workstream A3's 3D <DemoOfficeScene> from @agentcity/city-scene, adapted to this page's
// props. Without WebGL on real graphics hardware the 2D floor plan stand-in is shown instead, with the same props.
// WebGL needs the browser, so the scene is never rendered on the server (ssr: false).
import dynamic from 'next/dynamic';
import { DemoOfficeStandIn, type DemoOfficeSceneProps as StandInProps } from './DemoOfficeStandIn';

export interface DemoOfficeSceneProps extends StandInProps {
  /** The agent selected in the roster: its desk is highlighted and the camera shows it. */
  selectedAgentId?: string | null;
}

/** The API's status words, in the scene's three states (working, needs you, idle). Same rules as describeAgentStatus. */
export function sceneStatus(status: string): 'working' | 'needs-you' | 'idle' {
  const s = status.toLowerCase();
  if (s.includes('approv') || s.includes('wait') || s.includes('review') || s.includes('needs')) return 'needs-you';
  if (s.includes('work') || s === 'busy' || s === 'active') return 'working';
  return 'idle';
}

/**
 * Whether to draw the office in 3D: WebGL on real graphics hardware. Software renderers (SwiftShader, llvmpipe)
 * draw the city at a frame or two per second and starve the page, so they get the 2D floor plan instead.
 * `?scene=3d` forces the 3D office (screenshots on machines without a GPU).
 */
function canDraw3D(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('scene') === '3d') return true;
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !/swiftshader|llvmpipe|softpipe|software/i.test(renderer);
  } catch {
    return false;
  }
}

export const DemoOfficeScene = dynamic(
  () =>
    import('@agentcity/city-scene').then(m => {
      const Scene = m.DemoOfficeScene;
      function DemoOffice3D({ agents, building, level, onSelectAgent, selectedAgentId }: DemoOfficeSceneProps) {
        if (!canDraw3D())
          return <DemoOfficeStandIn agents={agents} building={building} level={level} onSelectAgent={onSelectAgent} />;
        return (
          <div
            className="dm-scene-3d"
            data-testid="office-scene"
            data-building={building.key}
            data-level={level ?? ''}
            style={{ position: 'relative', height: 'clamp(420px, 62vh, 640px)' }}
          >
            <Scene
              agents={agents.map(a => ({ id: a.id, name: a.name, role: a.role, status: sceneStatus(a.status) }))}
              building={building.key}
              level={level ?? 1}
              selectedAgentId={selectedAgentId ?? null}
              onSelectAgent={onSelectAgent}
              deskTestId={id => `office-desk-${id}`}
              label={`Your office in ${building.name}${level !== null ? `, level ${level}` : ''}, with ${agents.length} AI agents at their desks`}
            />
          </div>
        );
      }
      return DemoOffice3D;
    }),
  {
    ssr: false,
    loading: () => (
      <p className="dm-status-line" style={{ padding: 24 }}>
        Opening your office…
      </p>
    ),
  },
);
