'use client';
import { useFrame } from '@react-three/fiber';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { sceneBus } from '../camera/bus.ts';
import { findBuilding } from '../camera/modes.ts';
import { floorBase } from '../camera/shots.ts';
import { navigate } from '../camera/useNav.ts';
import { explodeState, floorLift } from '../camera/explode.ts';
import { FloorLabels } from './FloorLabels.tsx';
import { useCity, useCityContext } from '../context.tsx';
import { useEnvironmentLight } from '../environment/palette.ts';
import { FLOOR_HEIGHT } from '../types.ts';
import { useBuildingCut } from './cutaway.ts';
import { OfficeOccupantsContext } from './occupants.ts';
import { OfficeFloor } from './OfficeFloor.tsx';
import { occupantsFromLayout } from './placement.ts';
import { asMat } from './r3f.ts';

/**
 * The interior layer: the office floor in the floor and office modes (with the building cut open above it), and a
 * highlight band on the building for the floor the visitor points at in the floor list.
 */
export function Interior() {
  const { store, layout } = useCityContext();
  const mode = useCity(s => s.mode);
  const env = useEnvironmentLight();
  // A1's live night factor changes every frame; the office re-lights only when it has moved noticeably.
  const [night, setNight] = useState(() => env.nightFactor);
  useFrame(() => {
    if (Math.abs(env.nightFactor - night) > 0.04) setNight(env.nightFactor);
  });
  const reduced = useCity(s => s.reducedMotion);
  const paused = useCity(s => s.paused);
  const host = useContext(OfficeOccupantsContext);

  const open = mode.kind === 'floor' || mode.kind === 'office' ? mode : null;
  const b = open ? findBuilding(layout, open.building) : null;
  const floor = b && open ? (b.floors.find(f => f.level === open.level) ?? null) : null;
  const occupants = useMemo(() => {
    if (!b || !floor) return [];
    if (host && host.building === b.key && host.level === floor.level) return host.agents;
    return occupantsFromLayout(floor.desks, { building: b.key, level: floor.level });
  }, [b, floor, host]);
  const selectedAgent = useCity(s => s.selectedAgent);

  useBuildingCut(layout, b?.key ?? null, floor ? floorBase(floor.level) - 0.02 : null, reduced, floor?.level ?? 1);

  // Agents can be chosen in the floor cut-away (look only) and inside the office; the camera follows the choice.
  const selectedSlot =
    mode.kind === 'office' && mode.desk !== null
      ? mode.desk
      : selectedAgent
        ? occupants.findIndex(o => o.id === selectedAgent)
        : -1;
  const selectDesk = (slot: number) => {
    if (mode.kind !== 'office' && mode.kind !== 'floor') return;
    const o = occupants[slot];
    if (!o) return;
    const same = selectedSlot === slot;
    navigate(store, layout, { type: 'select-agent', id: same ? null : o.id, desk: same ? null : slot });
    if (!same) host?.onSelect?.(o.id);
  };
  const lift = useRef<THREE.Group>(null);
  const level = floor?.level ?? 1;
  useFrame(() => {
    if (lift.current) lift.current.position.y = floorLift(level, explodeState(store).t);
  });

  return (
    <>
      {b && floor && (
        <group ref={lift as never}>
          <OfficeFloor
            building={b}
            floor={floor}
            occupants={occupants}
            detail="full"
            selected={selectedSlot >= 0 ? selectedSlot : null}
            onSelectDesk={selectDesk}
            night={night}
            animate={!reduced && !paused}
          />
        </group>
      )}
      <FloorPreviewBand />
      <FloorLabels />
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
      position={[b.x, floorBase(level) + floorLift(level, explodeState(store).t) + FLOOR_HEIGHT / 2, b.z]}
      scale={[b.w + 0.35, FLOOR_HEIGHT * 0.92, b.d + 0.35]}
      raycast={() => null}
    >
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}
