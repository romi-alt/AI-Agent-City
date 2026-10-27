// @ts-nocheck -- dev-only harness, never shipped or typechecked: its JSX scenery resolves @react-three/fiber against a second copy of @types/three.
// Dev-only visual harness for city life (A2). Not shipped: it stands in for A1's ground, roads and buildings and
// A3's camera so the life systems can be screenshotted. URL: ?view=street|corner|skyline|top&time=day|night
// &quality=ultra|balanced|low&reduced=1&wait=<seconds>
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { CityContext } from '../../src/context.tsx';
import layoutJson from '../../src/data/city-layout.json';
import { Life } from '../../src/life/Life.tsx';
import { signalPhase } from '../../src/life/signals.ts';
import { vehicleGeometry } from '../../src/life/traffic/vehicles.ts';
import { createCityStore } from '../../src/store.ts';
import { FLOOR_HEIGHT, type CityLayout, type QualityLevel, type TimeOfDay } from '../../src/types.ts';

const layout = layoutJson as CityLayout;
const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'street';
const time = (q.get('time') ?? 'day') as TimeOfDay;
const quality = (q.get('quality') ?? 'ultra') as QualityLevel;
const reduced = q.get('reduced') === '1';
const withLife = q.get('life') !== '0';
const night = time === 'night' || time === 'evening';

const VIEWS: Record<string, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
  street: { pos: [17.5, 2.2, 15.5], look: [6, 1.2, 10.5], fov: 50 },
  corner: { pos: [17, 4.2, 18], look: [10, 0.4, 10], fov: 45 },
  avenue: { pos: [30.5, 2.4, 22], look: [30.5, 0.8, 0], fov: 50 },
  people: { pos: [-17.2, 1.3, 6.6], look: [-20, 0.45, 5.2], fov: 40 },
  group: { pos: [-37.2, 1.0, -8.0], look: [-40, 0.4, -6.3], fov: 40 },
  models: { pos: [-1.5, 1.7, 85.5], look: [-2.8, 0.2, 78.5], fov: 45 },
  walk: { pos: [-24, 1.3, 10.6], look: [-30, 0.6, 12.4], fov: 40 },
  skyline: { pos: [70, 55, 90], look: [0, 10, 0], fov: 42 },
  roofs: { pos: [52, 27, 14], look: [40, 17, 1], fov: 45 },
  roofs2: { pos: [-28, 24, 38], look: [-40, 16, 20], fov: 45 },
  air: { pos: [60, 30, 120], look: [-80, 90, -260], fov: 50 },
  top: { pos: [0, 140, 0.1], look: [0, 0, 0], fov: 50 },
};

function Stage() {
  const { scene, camera } = useThree();
  const v = VIEWS[view] ?? VIEWS.street!;
  useEffect(() => {
    camera.position.set(...v.pos);
    (camera as THREE.PerspectiveCamera).fov = v.fov;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    camera.lookAt(...v.look);
    scene.background = new THREE.Color(night ? '#0b1322' : '#bcd3e6');
    scene.fog = new THREE.Fog(night ? '#0b1322' : '#c6d6e4', 140, 900);
  }, [scene, camera, v]);
  const { roadsX, roadsZ, extent } = layout.streets;
  const signals = useMemo(() => {
    const heads: { x: number; z: number; axis: 'ew' | 'ns' }[] = [];
    for (const x of roadsX)
      for (const z of roadsZ) {
        heads.push({ x: x + 3.3, z: z + 3.3, axis: 'ew' }, { x: x - 3.3, z: z - 3.3, axis: 'ns' });
      }
    return heads;
  }, [roadsX, roadsZ]);
  const lamps = useMemo(
    () => signals.map(() => new THREE.MeshStandardMaterial({ color: '#222', emissive: '#000' })),
    [signals],
  );
  useFrame(state => {
    const p = signalPhase(state.clock.elapsedTime);
    signals.forEach((s, i) => {
      const c = p[s.axis];
      lamps[i]!.emissive.set(c === 'green' ? '#20ff60' : c === 'amber' ? '#ffb000' : '#ff2020');
      lamps[i]!.emissiveIntensity = 2;
    });
  });
  return (
    <>
      <hemisphereLight args={[night ? '#5a6c98' : '#dfefff', night ? '#1a2028' : '#6b6255', night ? 0.75 : 1.1]} />
      <directionalLight
        position={[60, 90, 40]}
        intensity={night ? 0.15 : 2.4}
        color={night ? '#9fb4ff' : '#fff1dc'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
        <planeGeometry args={[extent * 2 + 400, extent * 2 + 400]} />
        <meshStandardMaterial color={night ? '#1a1f26' : '#9a9a90'} />
      </mesh>
      {roadsZ.map(z => (
        <mesh key={`rz${z}`} rotation-x={-Math.PI / 2} position={[0, 0.01, z]} receiveShadow>
          <planeGeometry args={[extent * 2, 4]} />
          <meshStandardMaterial color="#3c4046" />
        </mesh>
      ))}
      {roadsX.map(x => (
        <mesh key={`rx${x}`} rotation-x={-Math.PI / 2} position={[x, 0.011, 0]} receiveShadow>
          <planeGeometry args={[4, extent * 2]} />
          <meshStandardMaterial color="#3c4046" />
        </mesh>
      ))}
      {roadsZ.flatMap(z =>
        [-1, 1].map(s => (
          <mesh key={`sz${z}${s}`} position={[0, 0.06, z + s * 2.9]} receiveShadow>
            <boxGeometry args={[extent * 2, 0.12, 1.8]} />
            <meshStandardMaterial color="#c9c4b9" />
          </mesh>
        )),
      )}
      {roadsX.flatMap(x =>
        [-1, 1].map(s => (
          <mesh key={`sx${x}${s}`} position={[x + s * 2.9, 0.059, 0]} receiveShadow>
            <boxGeometry args={[1.8, 0.118, extent * 2]} />
            <meshStandardMaterial color="#c9c4b9" />
          </mesh>
        )),
      )}
      {roadsX.flatMap(x =>
        roadsZ.flatMap(z => [
          <mesh key={`j${x}${z}`} rotation-x={-Math.PI / 2} position={[x, 0.125, z]}>
            <planeGeometry args={[4, 4]} />
            <meshStandardMaterial color="#3c4046" />
          </mesh>,
          ...[-1, 1].flatMap(s => [
            <mesh key={`cw${x}${z}${s}a`} rotation-x={-Math.PI / 2} position={[x, 0.128, z + s * 2.7]}>
              <planeGeometry args={[4, 1.1]} />
              <meshStandardMaterial color="#d9d9d4" transparent opacity={0.55} />
            </mesh>,
            <mesh key={`cw${x}${z}${s}b`} rotation-x={-Math.PI / 2} position={[x + s * 2.7, 0.128, z]}>
              <planeGeometry args={[1.1, 4]} />
              <meshStandardMaterial color="#d9d9d4" transparent opacity={0.55} />
            </mesh>,
          ]),
        ]),
      )}
      {signals.map((s, i) => (
        <group key={`sig${i}`} position={[s.x, 0, s.z]}>
          <mesh position-y={1.3}>
            <cylinderGeometry args={[0.07, 0.07, 2.6, 6]} />
            <meshStandardMaterial color="#2f3439" />
          </mesh>
          <mesh position-y={2.75} material={lamps[i]}>
            <boxGeometry args={[0.3, 0.5, 0.3]} />
          </mesh>
        </group>
      ))}
      {layout.buildings.map(b => {
        const h = b.floors.length * FLOOR_HEIGHT;
        return (
          <group key={b.key}>
            <mesh position={[b.x, h / 2, b.z]} castShadow receiveShadow>
              <boxGeometry args={[b.w, h, b.d]} />
              <meshStandardMaterial color={b.color} emissive={night ? '#1b1a22' : '#000'} />
            </mesh>
            <mesh position={[b.x, h + 0.15, b.z]} receiveShadow>
              <boxGeometry args={[b.w + 0.2, 0.3, b.d + 0.2]} />
              <meshStandardMaterial color="#8d8a84" />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/** ?view=plane / ?view=heli: keep the first visible airliner or helicopter in frame (read from the life meshes). */
function Follow({ what }: { what: 'plane' | 'heli' }) {
  const camera = useThree(s => s.camera);
  const scene = useThree(s => s.scene);
  const hold = Number(q.get('dist') ?? (what === 'plane' ? 60 : 14));
  const m = useMemo(() => new THREE.Matrix4(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const mesh = scene.getObjectByName(what === 'plane' ? 'life-airliners' : 'life-helicopters') as
      THREE.InstancedMesh | undefined;
    if (!mesh) return;
    let found = false;
    for (let i = 0; i < mesh.count && !found; i++) {
      mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      found = p.lengthSq() > 1;
    }
    if (!found) return;
    const d = Math.hypot(p.x, p.z) || 1;
    if (q.get('from') === 'city') {
      // Stand on the far side of the city and look past the towers at the aircraft.
      camera.position.set((-p.x / d) * 75, 9, (-p.z / d) * 75);
      camera.lookAt(p.x * 0.2, 12 + (p.y - 12) * 0.2, p.z * 0.2);
    } else {
      camera.position.set(p.x - (p.x / d) * hold + 4, p.y + hold * 0.12, p.z - (p.z / d) * hold + 4);
      camera.lookAt(p.x, p.y, p.z);
    }
  });
  return null;
}

/** ?view=models: every vehicle kind side by side, in plain vertex colours (paint shows white). */
function Models() {
  const kinds = ['sedan', 'taxi', 'suv', 'van', 'emergency', 'bus'] as const;
  const geos = useMemo(() => kinds.map(k => vehicleGeometry(k)), []);
  return (
    <group position={[0, 0, 80]}>
      {geos.map((g, i) => (
        <mesh
          key={i}
          geometry={g}
          position={[-6 + (i % 3) * 3.2, 0, -Math.floor(i / 3) * 2.2]}
          rotation-y={0.5}
          castShadow
        >
          <meshStandardMaterial vertexColors roughness={0.35} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function Stats() {
  const gl = useThree(s => s.gl);
  const scene = useThree(s => s.scene);
  useEffect(() => {
    gl.info.autoReset = false;
    const w = window as unknown as Record<string, unknown>;
    w.__lifeStats = () => {
      const life = scene.getObjectByName('life');
      let meshes = 0;
      let instances = 0;
      life?.traverse(o => {
        const m = o as THREE.InstancedMesh;
        if ((m as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) {
          if (!o.visible) return;
          meshes++;
          instances += m.isInstancedMesh ? m.count : 1;
        }
      });
      return {
        lifeDrawables: meshes,
        lifeInstances: instances,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      };
    };
    w.__dbg = () => {
      const m = scene.getObjectByName('life-airliners') as THREE.InstancedMesh | undefined;
      const out: number[][] = [];
      if (m)
        for (let i = 0; i < m.count; i++) {
          const mm = new THREE.Matrix4();
          m.getMatrixAt(i, mm);
          out.push([mm.elements[12]!, mm.elements[13]!, mm.elements[14]!, mm.elements[0]!]);
        }
      const cam = (scene as unknown as { __cam?: THREE.Camera }).__cam;
      return { planes: out, cam: cam?.position.toArray(), parent: m?.parent?.name, visible: m?.visible };
    };
  }, [gl, scene]);
  useFrame(() => gl.info.reset(), -1);
  return null;
}

function App() {
  const store = useMemo(
    () => createCityStore({ quality, timeOfDay: time, reducedMotion: reduced, qualityAuto: false }),
    [],
  );
  const ctx = useMemo(() => ({ store, layout }), [store]);
  return (
    <CityContext.Provider value={ctx}>
      <Canvas shadows dpr={1} gl={{ antialias: true, preserveDrawingBuffer: true }} camera={{ near: 0.3, far: 2500 }}>
        <CityContext.Provider value={ctx}>
          <Stage />
          {withLife && <Life />}
          <Stats />
          {view === 'models' && <Models />}
          {(view === 'plane' || view === 'heli') && <Follow what={view} />}
        </CityContext.Provider>
      </Canvas>
    </CityContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
