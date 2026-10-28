'use client';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useContext, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useSceneLabel } from '../camera/labels.ts';
import { useCityContext } from '../context.tsx';
import { ToyAgent } from './figure.tsx';
import { REF_DESK, RefChair, RefDeskTop, refMat, screenMaterial } from './furniture.tsx';
import { type DeskOccupant, OfficeOccupantsContext, refStatusColor, statusLabel } from './occupants.ts';
import { deskLabel } from './placement.ts';
import type { RefDesk, ReferencePlan } from './plan.ts';
import { DeskScreen } from './screens.ts';

export interface ReferenceDesksProps {
  plan: ReferencePlan;
  occupants: readonly DeskOccupant[];
  /** The selected desk's slot. */
  selected: number | null;
  onSelectDesk?: (slot: number) => void;
  /** Name pills over the desks (off where another view draws its own). */
  showLabels: boolean;
  animate: boolean;
}

/**
 * The Office view's desks (the reference look): one desk per occupant on the team or leadership rug, each with its
 * chair, a seated low-poly agent, a thin status ring under the chair and a name pill. Drawn in legacy units scaled
 * by the plan, in office-local metres (the same space as the rest of the floor).
 */
export function ReferenceDesks({ plan, occupants, selected, onSelectDesk, showLabels, animate }: ReferenceDesksProps) {
  const screens = useDeskScreens(plan, occupants, animate);
  return (
    <group>
      {plan.desks.map((d, i) => (
        <ReferenceDesk
          key={d.slot}
          desk={d}
          scale={plan.scale}
          index={i}
          occupant={occupants[d.slot] ?? null}
          screen={screens[i]!}
          selected={selected === d.slot}
          showLabel={showLabels}
          onSelect={onSelectDesk}
          animate={animate}
        />
      ))}
    </group>
  );
}

/** One canvas screen per desk: drawn once, then refreshed slowly (staggered) while animating. */
function useDeskScreens(plan: ReferencePlan, occupants: readonly DeskOccupant[], animate: boolean) {
  const screens = useMemo(() => plan.desks.map((_, i) => new DeskScreen(i + 1)), [plan.desks]);
  const mats = useMemo(() => screens.map(s => screenMaterial(s.texture)), [screens]);
  useEffect(
    () => () => {
      for (const s of screens) s.dispose();
      for (const m of mats) m.dispose();
    },
    [screens, mats],
  );
  useEffect(() => {
    screens.forEach((s, i) => s.draw(occupants[plan.desks[i]!.slot] ?? null, i * 0.37));
  }, [screens, occupants, plan.desks]);
  const next = useRef<number[]>([]);
  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    plan.desks.forEach((d, i) => {
      const o = occupants[d.slot];
      if (!o || (next.current[i] ?? 0) > t) return;
      screens[i]!.draw(o, t);
      next.current[i] = t + 0.9 + ((i * 0.37) % 0.6);
    });
  });
  return mats;
}

function ReferenceDesk({
  desk,
  scale,
  index,
  occupant,
  screen,
  selected,
  showLabel,
  onSelect,
  animate,
}: {
  desk: RefDesk;
  scale: number;
  index: number;
  occupant: DeskOccupant | null;
  screen: THREE.Material;
  selected: boolean;
  showLabel: boolean;
  onSelect?: (slot: number) => void;
  animate: boolean;
}) {
  const { store } = useCityContext();
  const testIdFor = useContext(OfficeOccupantsContext)?.deskTestId;
  const anchor = useRef<THREE.Group>(null);
  const select = occupant && onSelect ? () => onSelect(desk.slot) : undefined;
  const click = select
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        select();
      }
    : undefined;
  // Text only: the name and role reach the DOM as text nodes (rented floors' agent names are typed by people).
  useSceneLabel(
    store,
    occupant && showLabel
      ? {
          id: `desk:${desk.slot}`,
          kind: 'agent',
          tone: occupant.kind,
          text: occupant.name ?? (occupant.kind === 'human' ? 'Team member' : 'AI agent'),
          sub: occupant.role,
          status: occupant.status,
          selected,
          ariaLabel: `${deskLabel(occupant)}, ${statusLabel(occupant.status)}. Show this desk`,
          ...(testIdFor ? { testId: testIdFor(occupant.id) } : {}),
          ...(select ? { onSelect: select } : {}),
        }
      : null,
    anchor,
    [-0.2, 2.6, 0.4],
  );
  return (
    <group
      ref={anchor as never}
      position={[desk.x, 0, desk.z]}
      scale={scale}
      onClick={click}
      onPointerOver={select ? () => (document.body.style.cursor = 'pointer') : undefined}
      onPointerOut={select ? () => (document.body.style.cursor = '') : undefined}
    >
      <RefDeskTop screen={occupant ? screen : refMat(REF_DESK.monitor)} />
      <RefChair />
      {occupant && (
        <>
          <ToyAgent kind={occupant.kind} seed={index} status={occupant.status} animate={animate} />
          <StatusRing status={occupant.status} selected={selected} animate={animate} />
          {/* Generous invisible hit area so a desk is easy to click or tap. */}
          <mesh position={[0, 1.2, 0.5]} visible={false} userData={{ interior: true, dynamic: true }}>
            <boxGeometry args={[2.8, 2.4, 3]} />
          </mesh>
        </>
      )}
    </group>
  );
}

const ringGeo = new THREE.RingGeometry(0.86, 1.0, 40);
const selectGeo = new THREE.RingGeometry(1.08, 1.2, 40);
const ringMats = new Map<string, THREE.MeshBasicMaterial>();
function ringMat(color: string) {
  let m = ringMats.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false });
    ringMats.set(color, m);
  }
  return m;
}

/** A thin ring on the floor under the chair in the status colour (pulsing gently when they need the visitor). */
function StatusRing({ status, selected, animate }: { status: string; selected: boolean; animate: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const pulse = animate && status === 'needs-you' ? 1 + Math.sin(clock.elapsedTime * 5) * 0.06 : 1;
    ring.current.scale.setScalar(pulse);
  });
  return (
    <group position={[-0.2, 0.05, 1.0]} rotation-x={-Math.PI / 2} userData={{ dynamic: true }}>
      <mesh ref={ring as never} geometry={ringGeo as never} material={ringMat(refStatusColor(status)) as never} />
      {selected && <mesh geometry={selectGeo as never} material={ringMat('#f5b335') as never} />}
    </group>
  );
}
