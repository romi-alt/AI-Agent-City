// Dev-only test harness for workstream A3. Stand-in boxes from the layout's footprints and a plain light rig take
// the place of A1's architecture and environment, which are not on this branch. Never shipped.
import { Canvas, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { CameraRig } from '../../src/camera/CameraRig.tsx';
import { CityContext, type CityContextValue } from '../../src/context.tsx';
import layoutJson from '../../src/data/city-layout.json';
import { DemoOfficeScene } from '../../src/interior/DemoOfficeScene.tsx';
import { Interior } from '../../src/interior/Interior.tsx';
import { OfficeOccupantsContext, type OfficeOccupants } from '../../src/interior/occupants.ts';
import { createCityStore } from '../../src/store.ts';
import { FLOOR_HEIGHT, type CityLayout, type CityMode } from '../../src/types.ts';
import { CityHud } from '../../src/ui/CityHud.tsx';
import { LoadingVeil } from '../../src/ui/LoadingVeil.tsx';
import { NoWebGL } from '../../src/ui/NoWebGL.tsx';
import { detectWebGL } from '../../src/ui/webgl.ts';
import { shouldPlayArrival } from '../../src/camera/arrival.ts';

const layout = layoutJson as CityLayout;
const params = new URLSearchParams(location.search);

const AGENTS = [
  { id: 'a1', name: 'Nova', role: 'Lead follow-up', status: 'working', summary: 'Following up with 4 sample leads.' },
  { id: 'a2', name: 'Atlas', role: 'Appointments', status: 'needs-you', summary: 'A sample booking needs your OK.' },
  { id: 'a3', name: 'Iris', role: 'Social media', status: 'working', summary: 'Drafting next week’s posts.' },
  { id: 'a4', name: 'Orion', role: 'Reporting', status: 'idle', summary: 'Waiting for the next task.' },
];

function Expose() {
  const three = useThree();
  (window as unknown as { three: unknown }).three = three;
  return null;
}

function StandIns() {
  return (
    <group>
      <hemisphereLight args={['#dfeeff', '#8a7f6f', 1.4]} />
      <directionalLight position={[60, 90, 40]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-90, 90, 90, -90, 1, 300]} />
      </directionalLight>
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, -0.01, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#8c9a84" />
      </mesh>
      {layout.streets.roadsX.map(x => (
        <mesh key={`x${x}`} rotation-x={-Math.PI / 2} position={[x, 0.01, 0]} receiveShadow>
          <planeGeometry args={[4, layout.streets.extent * 2]} />
          <meshStandardMaterial color="#3a3f47" />
        </mesh>
      ))}
      {layout.streets.roadsZ.map(z => (
        <mesh key={`z${z}`} rotation-x={-Math.PI / 2} position={[0, 0.012, z]} receiveShadow>
          <planeGeometry args={[layout.streets.extent * 2, 4]} />
          <meshStandardMaterial color="#3a3f47" />
        </mesh>
      ))}
      {layout.buildings.map(b => {
        const h = b.floors.length * FLOOR_HEIGHT;
        return (
          <group key={b.key} userData={{ buildingKey: b.key }}>
            <mesh position={[b.x, h / 2, b.z]} castShadow receiveShadow>
              <boxGeometry args={[b.w, h, b.d]} />
              <meshStandardMaterial color={b.color} roughness={0.6} />
            </mesh>
            {b.floors.map(f => (
              <mesh key={f.level} position={[b.x, (f.level - 1) * FLOOR_HEIGHT + 0.05, b.z]}>
                <boxGeometry args={[b.w + 0.08, 0.1, b.d + 0.08]} />
                <meshStandardMaterial color="#e8e2d6" />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function Harness() {
  const demo = params.get('demo') === '1';
  const enterable = (params.get('enter') ?? '').split(',').filter(Boolean);
  const highlight = params.get('highlight');
  const start = params.get('mode');
  const reduced = params.get('reduced') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const initialMode: CityMode =
    start === 'office'
      ? { kind: 'office', building: params.get('b') ?? 'rental-2', level: Number(params.get('l') ?? 3), desk: null }
      : start === 'building'
        ? { kind: 'building', building: params.get('b') ?? 'rental-2' }
        : start === 'floor'
          ? { kind: 'floor', building: params.get('b') ?? 'rental-2', level: Number(params.get('l') ?? 3) }
          : params.get('noarrival') !== '1' && shouldPlayArrival(sessionStorage, params.get('tour') === '1')
            ? { kind: 'arrival' }
            : { kind: 'explore' };
  const store = useMemo(
    () =>
      createCityStore({
        mode: initialMode,
        enterable,
        highlight,
        reducedMotion: reduced,
        timeOfDay: (params.get('time') as never) ?? 'day',
      }),
    [],
  );
  (window as unknown as { cityStore: unknown }).cityStore = store;
  const ctx = useMemo<CityContextValue>(() => ({ store, layout }), [store]);
  const occupants = useMemo<OfficeOccupants | null>(
    () =>
      demo
        ? {
            building: 'rental-2',
            level: 3,
            agents: AGENTS.map(a => ({ ...a, kind: 'ai' as const })),
            onSelect: id => ((window as unknown as { selected: string }).selected = id),
          }
        : null,
    [demo],
  );
  if (params.get('real') === '1') {
    // The shipped DemoOfficeScene as D will use it (no stand-ins: only what A3 renders).
    return (
      <div style={{ position: 'fixed', inset: 0 }}>
        <DemoOfficeScene
          agents={AGENTS}
          building="rental-2"
          level={3}
          onSelectAgent={id => ((window as unknown as { selected: string }).selected = id)}
        />
      </div>
    );
  }
  if (!detectWebGL() || params.get('nowebgl') === '1') {
    return <NoWebGL store={store} layout={layout} title="Explore AgentCity" />;
  }
  return (
    <OfficeOccupantsContext.Provider value={occupants}>
      <CityContext.Provider value={ctx}>
        <div style={{ position: 'fixed', inset: 0 }}>
          <Canvas
            shadows
            dpr={1}
            camera={{ position: [70, 55, 90], fov: 42, near: 0.5, far: 2500 }}
            gl={{ antialias: true }}
          >
            <CityContext.Provider value={ctx}>
              <color attach="background" args={['#b9d3ea']} />
              <fog attach="fog" args={['#b9d3ea', 160, 420]} />
              <StandIns />
              <Expose />
              <Interior />
              <CameraRig />
            </CityContext.Provider>
          </Canvas>
          <CityHud entry={demo ? { building: 'rental-2', level: 3 } : undefined} />
          <LoadingVeil />
        </div>
      </CityContext.Provider>
    </OfficeOccupantsContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
