'use client';
import { useFrame } from '@react-three/fiber';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildingHeight } from '../camera/bounds.ts';
import { sceneBus } from '../camera/bus.ts';
import { findBuilding } from '../camera/modes.ts';
import { floorBase } from '../camera/shots.ts';
import { navigate } from '../camera/useNav.ts';
import { useCity, useCityContext } from '../context.tsx';
import { FLOOR_HEIGHT, type TimeOfDay } from '../types.ts';
import { useBuildingCut } from './cutaway.ts';
import { OfficeOccupantsContext } from './occupants.ts';
import { OfficeFloor } from './OfficeFloor.tsx';
import { occupantsFromLayout } from './placement.ts';
import { asMat } from './r3f.ts';

/**
 * How dark it is for interior lighting. A1 exports `useEnvironmentLight().nightFactor` (environment/palette.ts);
 * until the integrator wires it in, the interior derives the same 0..1 value from the time of day.
 */
export function nightFactorFor(t: TimeOfDay): number {
  return { day: 0, golden: 0.3, evening: 0.7, night: 1 }[t];
}

/**
 * The interior layer: the office floor in the floor and office modes (with the building cut open above it), and a
 * highlight band on the building for the floor the visitor points at in the floor list.
 */
export function Interior() {
  const { store, layout } = useCityContext();
  const mode = useCity(s => s.mode);
  const time = useCity(s => s.timeOfDay);
  const reduced = useCity(s => s.reducedMotion);
  const paused = useCity(s => s.paused);
  const host = useContext(OfficeOccupantsContext);

  const open = mode.kind === 'floor' || mode.kind === 'office' ? mode : null;
  const b = open ? findBuilding(layout, open.building) : null;
  const floor = b && open ? (b.floors.find(f => f.level === open.level) ?? null) : null;
  const occupants = useMemo(() => {
    if (!b || !floor) return [];
    if (host && host.building === b.key && host.level === floor.level) return host.agents;
    return occupantsFromLayout(floor.desks);
  }, [b, floor, host]);

  useBuildingCut(b?.key ?? null, floor ? floorBase(floor.level) - 0.02 : null, b ? buildingHeight(b) + 12 : 0, reduced);

  const selectDesk = (slot: number) => {
    if (mode.kind !== 'office') return;
    const next = mode.desk === slot ? null : slot;
    navigate(store, layout, { type: 'select-desk', desk: next });
    const o = occupants[slot];
    if (o && next !== null) host?.onSelect?.(o.id);
  };

  return (
    <>
      {b && floor && (
        <OfficeFloor
          building={b}
          floor={floor}
          occupants={occupants}
          detail={mode.kind === 'office' ? 'full' : 'preview'}
          selected={mode.kind === 'office' ? mode.desk : null}
          onSelectDesk={mode.kind === 'office' ? selectDesk : undefined}
          night={nightFactorFor(time)}
          animate={!reduced && !paused}
        />
      )}
      <FloorPreviewBand />
    </>
  );
}

/** A soft gold band around the floor the visitor is pointing at in the building panel. */
function FloorPreviewBand() {
  const { store, layout } = useCityContext();
  const mode = useCity(s => s.mode);
  const [level, setLevel] = useState<number | null>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#f5b335', transparent: true, opacity: 0.35, depthWrite: false }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => sceneBus(store).on(e => e.type === 'floor-preview' && setLevel(e.level)), [store]);
  useFrame(({ clock }) => {
    mat.opacity = 0.28 + Math.sin(clock.elapsedTime * 3) * 0.08;
  });
  if (mode.kind !== 'building' || level === null) return null;
  const b = findBuilding(layout, mode.building);
  if (!b) return null;
  return (
    <mesh
      ref={mesh}
      material={asMat(mat)}
      position={[b.x, floorBase(level) + FLOOR_HEIGHT / 2, b.z]}
      scale={[b.w + 0.35, FLOOR_HEIGHT * 0.92, b.d + 0.35]}
      raycast={() => null}
    >
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}
