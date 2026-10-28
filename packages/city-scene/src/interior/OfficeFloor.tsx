'use client';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useContext, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useSceneLabel } from '../camera/labels.ts';
import { METRES_PER_UNIT, floorBase } from '../camera/shots.ts';
import { useCityContext } from '../context.tsx';
import type { LayoutBuilding, LayoutFloor } from '../types.ts';
import {
  Armchair,
  Chair,
  CoffeeTable,
  FloorLamp,
  GlassWall,
  MeetingTable,
  Plant,
  Rug,
  screenMaterial,
  ShowroomCar,
  Sofa,
} from './furniture.tsx';
import { StaticBatch } from './batch.tsx';
import { OfficeAgent } from './agent.tsx';
import type { Activity } from './figure.tsx';
import { createKit, KitContext, useKit } from './kit.ts';
import type { DeskOccupant } from './occupants.ts';
import { OfficeOccupantsContext, statusColor, statusLabel } from './occupants.ts';
import { Box, Cyl, Plane, Sphere } from './parts.tsx';
import { deskLabel, DESK_HEIGHT } from './placement.ts';
import { type OfficePlan, officeSize, planOffice, type Rect, variantFor, type Workstation } from './plan.ts';
import { DeskScreen, drawRoster } from './screens.ts';
import { signTexture } from './textures.ts';
import { asMat } from './r3f.ts';

export interface OfficeFloorProps {
  building: LayoutBuilding;
  floor: LayoutFloor;
  occupants: DeskOccupant[];
  /** 'full' inside the office (labels, animated screens); 'preview' for the floor cutaway seen from outside. */
  detail: 'full' | 'preview';
  selected: number | null;
  onSelectDesk?: (slot: number) => void;
  /** 0 at day, 1 at night: interior lights glow brighter as it gets dark. */
  night: number;
  animate: boolean;
}

/**
 * One office floor, modelled in metres and placed (scaled) at its real position in the building, so the city stays
 * visible through floor-to-ceiling glass. Variants: contemporary office, dealership showroom office, training
 * classroom.
 */
export function OfficeFloor(props: OfficeFloorProps) {
  const { building: b, floor } = props;
  const { width, depth } = officeSize(b);
  const kit = useMemo(() => createKit(width, depth, b.accent, b.color), [width, depth, b.accent, b.color]);
  useEffect(() => () => kit.dispose(), [kit]);
  const plan = useMemo(
    () => planOffice(width, depth, props.occupants.length, variantFor(b.kind)),
    [width, depth, props.occupants.length, b.kind],
  );
  const batchVersion = `${b.key}:${floor.level}:${plan.variant}:${props.detail}:${props.occupants
    .map(o => `${o.kind}${o.status}`)
    .join(',')}`;
  return (
    <KitContext.Provider value={kit}>
      <group
        position={[b.x, floorBase(floor.level), b.z]}
        scale={1 / METRES_PER_UNIT}
        userData={{ interior: true, building: b.key, level: floor.level }}
      >
        <StaticBatch version={batchVersion}>
          <Shell plan={plan} night={props.night} />
          <Core plan={plan} building={b} floor={floor} />
          <Reception plan={plan} />
          {plan.variant === 'showroom' ? <Showroom rect={plan.lounge} /> : <Lounge rect={plan.lounge} />}
          <MeetingRoom rect={plan.meeting} plan={plan} building={b} floor={floor} occupants={props.occupants} />
          {plan.variant === 'classroom' && <ClassroomFront plan={plan} building={b} floor={floor} />}
          <Desks plan={plan} {...props} />
          {plan.variant !== 'classroom' && plan.workstations.length > 0 && <CoffeeBar plan={plan} />}
          {plan.variant !== 'classroom' && plan.workstations.length > 0 && <FocusBooths plan={plan} />}
          {plan.plants.map((p, i) => (
            <Plant key={i} position={[p.x, 0, p.z]} size={p.size} seed={i + 1} />
          ))}
        </StaticBatch>
        <InteriorLights plan={plan} night={props.night} />
      </group>
    </KitContext.Provider>
  );
}

function Shell({ plan, night }: { plan: OfficePlan; night: number }) {
  const { m } = useKit();
  const W = plan.width;
  const D = plan.depth;
  const H = plan.ceiling;
  // Oak throughout (the showroom's display car stands on its own stone plinth); carpet marks the team area.
  const floorMat = m.wood;
  const sides: { from: [number, number]; to: [number, number] }[] = [
    { from: [-W / 2, -D / 2], to: [W / 2, -D / 2] },
    { from: [W / 2, -D / 2], to: [W / 2, D / 2] },
    { from: [W / 2, D / 2], to: [-W / 2, D / 2] },
    { from: [-W / 2, D / 2], to: [-W / 2, -D / 2] },
  ];
  (m.lightPanel as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + night * 1.6;
  return (
    <group>
      <Box mat={m.concrete} position={[0, -0.16, 0]} scale={[W, 0.3, D]} receiveShadow />
      <Plane mat={floorMat} position={[0, 0.002, 0]} rotation-x={-Math.PI / 2} scale={[W, D, 1]} receiveShadow />
      {plan.workstations.length > 0 && <TeamCarpet plan={plan} />}
      {/* Floor-to-ceiling glass with slim mullions; a dark spandrel band hides the slab and services above. */}
      {sides.map((s, i) => {
        const len = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
        const rot = -Math.atan2(s.to[1] - s.from[1], s.to[0] - s.from[0]);
        const n = Math.max(2, Math.round(len / 1.55));
        return (
          <group key={i} position={[(s.from[0] + s.to[0]) / 2, 0, (s.from[1] + s.to[1]) / 2]} rotation-y={rot}>
            <Box mat={m.glass} position={[0, H / 2, 0]} scale={[len, H, 0.03]} />
            {Array.from({ length: n + 1 }, (_, k) => (
              <Box key={k} mat={m.mullion} position={[-len / 2 + (len * k) / n, H / 2, 0]} scale={[0.045, H, 0.1]} />
            ))}
            <Box mat={m.mullion} position={[0, 0.04, 0]} scale={[len, 0.08, 0.16]} />
            <Box mat={m.spandrel} position={[0, (H + plan.storey) / 2, 0]} scale={[len, plan.storey - H, 0.12]} />
          </group>
        );
      })}
      {/* Ceiling: faces down only, so from above (the cutaway) it is invisible and the floor plan shows. */}
      <Plane mat={m.ceiling} position={[0, H, 0]} rotation-x={Math.PI / 2} scale={[W, D, 1]} castShadow />
      <CeilingLights plan={plan} />
    </group>
  );
}

/** Carpet under the desk pods only, so the oak floor frames the team area. */
function TeamCarpet({ plan }: { plan: OfficePlan }) {
  const { m } = useKit();
  const xs = plan.workstations.map(w => w.x);
  const zs = plan.workstations.map(w => w.z);
  const x0 = Math.min(...xs) - 1.9;
  const x1 = Math.max(...xs) + 1.9;
  const z0 = Math.min(...zs) - 2.2;
  const z1 = Math.max(...zs) + 2.2;
  return <Rug x={(x0 + x1) / 2} z={(z0 + z1) / 2} w={x1 - x0} d={z1 - z0} mat={m.carpet} />;
}

/** A coffee point beside the team: counter, machine, stools. */
function CoffeeBar({ plan }: { plan: OfficePlan }) {
  const { m } = useKit();
  const xs = plan.workstations.map(w => w.x);
  const right = Math.max(...xs) + 4.2;
  if (right + 1.6 > plan.work.x + plan.work.w / 2 + 1.5) return null;
  const z = plan.work.z;
  return (
    <group position={[right, 0, z]}>
      <Box mat={m.walnut} position={[0, 0.46, 0]} scale={[1.0, 0.92, 3.2]} />
      <Box mat={m.counter} position={[0, 0.94, 0]} scale={[1.15, 0.05, 3.4]} />
      <Box mat={m.metalDark} position={[0.1, 1.18, -1.1]} scale={[0.4, 0.45, 0.38]} />
      <Box mat={m.white} position={[0.05, 1.0, 0.6]} scale={[0.3, 0.08, 0.3]} />
      {[-0.9, 0, 0.9].map(zz => (
        <group key={zz} position={[-0.9, 0, zz]}>
          <Cyl mat={m.metalDark} position={[0, 0.33, 0]} scale={[0.04, 0.66, 0.04]} />
          <Cyl mat={m.fabricCoral} position={[0, 0.68, 0]} scale={[0.38, 0.06, 0.38]} />
          <Cyl mat={m.metalDark} position={[0, 0.01, 0]} scale={[0.36, 0.02, 0.36]} />
        </group>
      ))}
      <Plant position={[0.1, 0.97, 1.3]} size={0.3} seed={77} />
    </group>
  );
}

/** Two glass phone booths on the other side of the team. */
function FocusBooths({ plan }: { plan: OfficePlan }) {
  const { m } = useKit();
  const xs = plan.workstations.map(w => w.x);
  const left = Math.min(...xs) - 4.0;
  if (left - 1.2 < plan.work.x - plan.work.w / 2 - 1.5) return null;
  return (
    <group position={[left, 0, plan.work.z]}>
      {[-1.3, 1.3].map(z => (
        <group key={z} position={[0, 0, z]}>
          <Box mat={m.felt} position={[0, 1.15, -0.55]} scale={[1.2, 2.3, 0.06]} />
          <Box mat={m.felt} position={[-0.6, 1.15, 0]} scale={[0.06, 2.3, 1.1]} />
          <Box mat={m.glass} position={[0.6, 1.15, 0]} scale={[0.03, 2.3, 1.1]} />
          <Box mat={m.felt} position={[0, 2.3, 0]} scale={[1.2, 0.06, 1.1]} />
          <Box mat={m.oak} position={[0, 0.74, -0.35]} scale={[0.9, 0.03, 0.35]} />
          <Cyl mat={m.fabricNavy} position={[0, 0.45, 0.1]} scale={[0.4, 0.08, 0.4]} />
        </group>
      ))}
    </group>
  );
}

function CeilingLights({ plan }: { plan: OfficePlan }) {
  const { m } = useKit();
  const rows = useMemo(() => {
    const out: { x: number; z: number; w: number }[] = [];
    const zs = [...new Set(plan.workstations.map(w => Math.round(w.z * 2) / 2))];
    for (const z of zs) out.push({ x: plan.work.x, z, w: Math.min(plan.work.w - 2, 14) });
    return out;
  }, [plan]);
  const y = plan.ceiling - 0.01;
  return (
    <group>
      {rows.map((r, i) => (
        <Plane key={i} mat={m.lightPanel} position={[r.x, y, r.z]} rotation-x={Math.PI / 2} scale={[r.w, 0.12, 1]} />
      ))}
      {[plan.lounge, plan.meeting].flatMap((r, j) =>
        [-1, 1].flatMap(sx =>
          [-1, 1].map(sz => (
            <mesh
              key={`${j}${sx}${sz}`}
              position={[r.x + sx * r.w * 0.25, y, r.z + sz * r.d * 0.25]}
              rotation-x={Math.PI / 2}
              material={asMat(m.lightPanel)}
            >
              <circleGeometry args={[0.16, 20]} />
            </mesh>
          )),
        ),
      )}
    </group>
  );
}

function InteriorLights({ plan, night }: { plan: OfficePlan; night: number }) {
  // Few lights (each one costs every material in the scene): a warm key over the team, one each for lounge and
  // meeting room. Distances are world units (lights ignore the office's scale).
  const intensity = 1.2 + night * 3.5;
  return (
    <group>
      <pointLight
        position={[plan.work.x, plan.ceiling - 0.3, plan.work.z]}
        intensity={intensity}
        distance={9}
        decay={2}
        color="#fff1dc"
      />
      <pointLight
        position={[plan.lounge.x, plan.ceiling - 0.3, plan.lounge.z]}
        intensity={intensity * 0.6}
        distance={6}
        decay={2}
        color="#ffd9a8"
      />
      <pointLight
        position={[plan.meeting.x, plan.ceiling - 0.3, plan.meeting.z]}
        intensity={intensity * 0.6}
        distance={6}
        decay={2}
        color="#fff6ea"
      />
    </group>
  );
}

function Core({ plan, building, floor }: { plan: OfficePlan; building: LayoutBuilding; floor: LayoutFloor }) {
  const { m } = useKit();
  const c = plan.core;
  const sign = useMemo(
    () =>
      signTexture([
        { text: building.shortName, size: 92, color: '#f6f3ec', weight: '700' },
        { text: `Floor ${floor.level} · ${floor.name}`, size: 44, color: '#f5b335', weight: '500' },
      ]),
    [building.shortName, floor.level, floor.name],
  );
  useEffect(() => () => sign.dispose(), [sign]);
  const signMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: sign, transparent: true, toneMapped: false }),
    [sign],
  );
  useEffect(() => () => signMat.dispose(), [signMat]);
  const mats = useMemo(() => [m.walnut, m.walnut, m.coreCap, m.walnut, m.walnut, m.walnut], [m]);
  return (
    <group position={[c.x, 0, c.z]}>
      <mesh material={asMat(mats)} position={[0, plan.ceiling / 2, 0]} scale={[c.w, plan.ceiling, c.d]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      {/* Lit reveal and the building's name on the reception wall. */}
      <Box mat={m.warmLight} position={[0, plan.ceiling - 0.25, c.d / 2 + 0.01]} scale={[c.w * 0.92, 0.04, 0.02]} />
      <mesh material={asMat(signMat)} position={[0, 2.05, c.d / 2 + 0.02]}>
        <planeGeometry args={[Math.min(c.w * 0.7, 4.8), Math.min(c.w * 0.7, 4.8) * 0.375]} />
      </mesh>
      {/* Lift doors on the far side. */}
      {[-1, 1].map(s => (
        <group key={s} position={[s * c.w * 0.22, 0, -c.d / 2 - 0.01]}>
          <Box mat={m.metalLight} position={[0, 1.15, 0]} scale={[1.2, 2.3, 0.04]} />
          <Box mat={m.metalDark} position={[0, 1.15, -0.005]} scale={[0.02, 2.3, 0.05]} />
          <Box mat={m.warmLight} position={[0, 2.5, 0]} scale={[0.3, 0.06, 0.03]} />
        </group>
      ))}
    </group>
  );
}

function Reception({ plan }: { plan: OfficePlan }) {
  const { m } = useKit();
  const r = plan.reception;
  return (
    <group position={[r.x, 0, r.z]}>
      <Box mat={m.counter} position={[0, 0.53, 0]} scale={[3.6, 1.06, 0.7]} />
      <Box mat={m.oak} position={[0, 1.08, 0.05]} scale={[3.8, 0.05, 0.85]} />
      <Box mat={m.warmLight} position={[0, 0.06, 0.36]} scale={[3.4, 0.03, 0.02]} />
      <Box mat={m.white} position={[0.6, 0.75, -0.25]} scale={[2.0, 0.04, 0.5]} />
      <Box mat={m.screenOff} position={[0.9, 0.97, -0.3]} scale={[0.5, 0.32, 0.03]} />
      <Chair position={[0.8, 0, -0.95]} rotation={0} />
      <Plant position={[-1.5, 1.1, -0.15]} size={0.35} seed={44} />
    </group>
  );
}

function Lounge({ rect }: { rect: Rect }) {
  const { m } = useKit();
  return (
    <group position={[rect.x, 0, rect.z]}>
      <Rug x={0} z={0} w={Math.min(rect.w - 1, 5.2)} d={Math.min(rect.d - 1.5, 4)} mat={m.fabricGrey} />
      <Sofa position={[-Math.min(rect.w / 2 - 1, 2.2), 0, 0]} rotation={Math.PI / 2} width={2.8} />
      <Armchair position={[1.5, 0, -1]} rotation={-Math.PI / 2 - 0.3} />
      <Armchair position={[1.5, 0, 1]} rotation={-Math.PI / 2 + 0.3} />
      <CoffeeTable position={[0, 0, 0]} />
      <FloorLamp position={[-Math.min(rect.w / 2 - 1, 2.2), 0, 1.9]} />
      {/* A low walnut credenza with books. */}
      <group position={[0, 0, -Math.min(rect.d / 2 - 0.6, 3)]}>
        <Box mat={m.walnut} position={[0, 0.35, 0]} scale={[3.2, 0.7, 0.45]} />
        {[-1.2, -1.05, -0.92, -0.8, 0.6, 0.72].map((x, i) => (
          <Box
            key={i}
            mat={i % 2 ? m.fabricCoral : m.accent}
            position={[x, 0.84, 0]}
            scale={[0.1, 0.28 - (i % 3) * 0.03, 0.3]}
          />
        ))}
        <Plant position={[1.25, 0.7, 0]} size={0.35} seed={9} />
      </group>
    </group>
  );
}

function Showroom({ rect }: { rect: Rect }) {
  return (
    <group position={[rect.x, 0, rect.z]}>
      <ShowroomCar position={[0, 0, 0.3]} />
      <Armchair position={[rect.w / 2 - 1, 0, -rect.d / 2 + 1.4]} rotation={-0.6} />
      <Armchair position={[rect.w / 2 - 2.2, 0, -rect.d / 2 + 1.2]} rotation={0.2} />
      <CoffeeTable position={[rect.w / 2 - 1.7, 0, -rect.d / 2 + 2.2]} radius={0.35} />
    </group>
  );
}

function useCanvasScreen(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [w, h]);
  useEffect(() => {
    draw((tex.image as HTMLCanvasElement).getContext('2d')!);
    tex.needsUpdate = true;
  }, [tex, ...deps]);
  const mat = useMemo(() => screenMaterial(tex), [tex]);
  useEffect(
    () => () => {
      tex.dispose();
      mat.dispose();
    },
    [tex, mat],
  );
  return mat;
}

function MeetingRoom({
  rect,
  plan,
  building,
  floor,
  occupants,
}: {
  rect: Rect;
  plan: OfficePlan;
  building: LayoutBuilding;
  floor: LayoutFloor;
  occupants: DeskOccupant[];
}) {
  const { m } = useKit();
  const x0 = rect.x - rect.w / 2;
  const x1 = rect.x + rect.w / 2;
  const z0 = rect.z - rect.d / 2;
  const z1 = rect.z + rect.d / 2;
  const H = plan.ceiling;
  const screen = useCanvasScreen(
    1024,
    576,
    g => drawRoster(g, 1024, 576, floor.name, `${building.shortName} · Floor ${floor.level}`, floor.info, occupants),
    [floor.name, floor.info, building.shortName, floor.level, occupants],
  );
  const tableLen = Math.min(rect.d - 2.6, 4.6);
  return (
    <group>
      <GlassWall from={[x0, z1]} to={[x1, z1]} height={H} door={rect.w / 2 - 1.2} />
      <GlassWall from={[x0, z0]} to={[x0, z1]} height={H} />
      <GlassWall from={[x1, z0]} to={[x1, z1]} height={H} />
      <GlassWall from={[x0, z0]} to={[x1, z0]} height={H} />
      <group position={[rect.x, 0, rect.z + 0.3]} rotation-y={Math.PI / 2}>
        <MeetingTable length={tableLen} seats={8} />
        {/* Linear pendant over the table. */}
        <Box mat={m.metalDark} position={[0, 2.35, 0]} scale={[tableLen * 0.8, 0.06, 0.14]} />
        <Box mat={m.warmLight} position={[0, 2.31, 0]} scale={[tableLen * 0.78, 0.015, 0.1]} />
        {[-1, 1].map(s => (
          <Box key={s} mat={m.metalDark} position={[s * tableLen * 0.35, 2.8, 0]} scale={[0.01, 0.9, 0.01]} />
        ))}
      </group>
      {/* Wall display on a walnut panel at the head of the table. */}
      <group position={[rect.x, 0, z0 + 0.12]}>
        <Box mat={m.walnut} position={[0, H / 2, 0]} scale={[Math.min(rect.w - 0.6, 3.6), H, 0.08]} />
        <Box mat={m.screenOff} position={[0, 1.55, 0.06]} scale={[2.3, 1.32, 0.04]} />
        <mesh material={asMat(screen)} position={[0, 1.55, 0.085]}>
          <planeGeometry args={[2.2, 1.24]} />
        </mesh>
      </group>
      <Plant position={[x1 - 0.6, 0, z1 - 0.6]} size={0.8} seed={31} />
    </group>
  );
}

function ClassroomFront({ plan, building, floor }: { plan: OfficePlan; building: LayoutBuilding; floor: LayoutFloor }) {
  const { m } = useKit();
  const screen = useCanvasScreen(
    1024,
    576,
    g => drawRoster(g, 1024, 576, 'Training session', `${building.shortName} · Floor ${floor.level}`, floor.info, []),
    [building.shortName, floor.level, floor.info],
  );
  const z = plan.work.z - plan.work.d / 2 + 0.6;
  return (
    <group position={[plan.work.x, 0, z]}>
      <Box mat={m.metalDark} position={[0, 0.9, 0]} scale={[0.1, 1.8, 0.1]} />
      <Box mat={m.screenOff} position={[0, 2.0, 0]} scale={[3.4, 1.95, 0.06]} />
      <mesh material={asMat(screen)} position={[0, 2.0, 0.035]}>
        <planeGeometry args={[3.3, 1.86]} />
      </mesh>
      <Box mat={m.oak} position={[2.6, 0.55, 0.6]} scale={[0.6, 1.1, 0.45]} />
    </group>
  );
}

function activityOf(status: string): Activity {
  return status === 'working' ? 'working' : status === 'needs-you' ? 'needs-you' : 'idle';
}

/**
 * Walking routes for agents in the front row (seated on the room side of their desk): out to the aisle in front of
 * the team, along it to the coffee point, and back. Desk-local coordinates, so each figure can follow its own.
 */
function walkRoutes(plan: OfficePlan): Map<number, [number, number][]> {
  const out = new Map<number, [number, number][]>();
  if (plan.variant === 'classroom' || !plan.workstations.length) return out;
  const xs = plan.workstations.map(w => w.x);
  const coffeeX = Math.max(...xs) + 4.2;
  if (coffeeX + 1.6 > plan.work.x + plan.work.w / 2 + 1.5) return out;
  const frontZ = Math.max(...plan.workstations.map(w => w.z)) + 1.9;
  for (const w of plan.workstations) {
    if (Math.abs(w.facing - Math.PI) > 0.01) continue;
    if (w.z < frontZ - 2.5) continue; // only the front row has a clear way out
    const toLocal = ([x, z]: [number, number]): [number, number] => {
      const dx = x - w.x;
      const dz = z - w.z;
      const c = Math.cos(w.facing);
      const sn = Math.sin(w.facing);
      return [dx * c - dz * sn, dx * sn + dz * c];
    };
    const seatX = w.x;
    const seatZ = w.z + 0.78;
    out.set(
      w.slot,
      [
        [seatX, frontZ],
        [coffeeX - 1.3, frontZ],
        [coffeeX - 1.3, plan.work.z + 0.4],
      ]
        .map(p => toLocal(p as [number, number]))
        .map(([x, z]) => [x, z] as [number, number]),
    );
    void seatZ;
  }
  return out;
}

function Desks(props: OfficeFloorProps & { plan: OfficePlan }) {
  const { plan, occupants, detail, selected, onSelectDesk, animate } = props;
  const screens = useMemo(() => plan.workstations.map((_, i) => new DeskScreen(i + 1)), [plan.workstations]);
  const screenMats = useMemo(() => screens.map(s => screenMaterial(s.texture)), [screens]);
  useEffect(
    () => () => {
      for (const s of screens) s.dispose();
      for (const mm of screenMats) mm.dispose();
    },
    [screens, screenMats],
  );
  const routes = useMemo(() => walkRoutes(plan), [plan]);
  const nextDraw = useRef<number[]>([]);
  // First paint of every screen, then a slow, staggered refresh while animating.
  useEffect(() => {
    screens.forEach((s, i) => s.draw(occupants[plan.workstations[i]!.slot] ?? null, i * 0.37));
  }, [screens, occupants, plan.workstations]);
  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    plan.workstations.forEach((w, i) => {
      const o = occupants[w.slot];
      if (!o) return;
      if (detail === 'full' && (nextDraw.current[i] ?? 0) <= t) {
        screens[i]!.draw(o, t);
        nextDraw.current[i] = t + 0.9 + ((i * 0.37) % 0.6);
      }
    });
  });
  return (
    <group>
      {plan.workstations.map((w, i) => (
        <Desk
          key={w.slot}
          ws={w}
          index={i}
          occupant={occupants[w.slot] ?? null}
          screen={screenMats[i]!}
          selected={selected === w.slot}
          classroom={plan.variant === 'classroom'}
          showLabel={detail === 'full'}
          onSelect={onSelectDesk}
          route={routes.get(w.slot)}
          animate={animate}
        />
      ))}
    </group>
  );
}

function Desk({
  ws,
  index,
  occupant,
  screen,
  selected,
  classroom,
  showLabel,
  onSelect,
  route,
  animate,
}: {
  ws: Workstation;
  index: number;
  occupant: DeskOccupant | null;
  screen: THREE.Material;
  selected: boolean;
  classroom: boolean;
  showLabel: boolean;
  onSelect?: (slot: number) => void;
  route: [number, number][] | undefined;
  animate: boolean;
}) {
  const { m } = useKit();
  const { store } = useCityContext();
  const testIdFor = useContext(OfficeOccupantsContext)?.deskTestId;
  const anchor = useRef<THREE.Group>(null);
  const top = DESK_HEIGHT;
  const w = classroom ? 1.3 : 1.6;
  const d = classroom ? 0.6 : 0.8;
  const select = occupant && onSelect ? () => onSelect(ws.slot) : undefined;
  const click = select
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        select();
      }
    : undefined;
  useSceneLabel(
    store,
    occupant && showLabel
      ? {
          id: `desk:${ws.slot}`,
          kind: 'desk',
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
    [0, 1.5, -0.74],
  );
  return (
    <group
      ref={anchor as never}
      position={[ws.x, 0, ws.z]}
      rotation-y={ws.facing}
      onClick={click}
      onPointerOver={select ? () => (document.body.style.cursor = 'pointer') : undefined}
      onPointerOut={select ? () => (document.body.style.cursor = '') : undefined}
    >
      <Box mat={m.oak} position={[0, top - 0.015, 0]} scale={[w, 0.03, d]} />
      {[-1, 1].map(s => (
        <Box
          key={s}
          mat={m.metalDark}
          position={[s * (w / 2 - 0.05), (top - 0.03) / 2, 0]}
          scale={[0.04, top - 0.03, d - 0.1]}
        />
      ))}
      {!classroom && <Box mat={m.felt} position={[0, top + 0.2, d / 2 + 0.015]} scale={[w, 0.42, 0.025]} />}
      {classroom ? (
        <group position={[0, top, 0.02]}>
          <Box mat={m.metalLight} position={[0, 0.008, 0.02]} scale={[0.34, 0.015, 0.24]} />
          <group position={[0, 0.015, 0.14]} rotation-x={-0.25}>
            <Box mat={m.metalLight} position={[0, 0.12, 0]} scale={[0.34, 0.23, 0.01]} />
            <mesh material={asMat(screen)} position={[0, 0.12, -0.006]} rotation-y={Math.PI}>
              <planeGeometry args={[0.31, 0.2]} />
            </mesh>
          </group>
        </group>
      ) : (
        <group position={[0, top, 0.2]}>
          <Box mat={m.metalDark} position={[0, 0.005, 0]} scale={[0.22, 0.01, 0.16]} />
          <Box mat={m.metalDark} position={[0, 0.13, 0.02]} scale={[0.04, 0.26, 0.03]} />
          <Box mat={m.metalDark} position={[0, 0.33, 0]} scale={[0.64, 0.39, 0.025]} />
          <mesh material={asMat(occupant ? screen : m.screenOff)} position={[0, 0.33, -0.014]} rotation-y={Math.PI}>
            <planeGeometry args={[0.61, 0.36]} />
          </mesh>
        </group>
      )}
      <Box mat={m.white} position={[0, top + 0.01, -0.23]} scale={[0.42, 0.015, 0.13]} />
      <Box mat={m.white} position={[0.3, top + 0.012, -0.22]} scale={[0.06, 0.02, 0.1]} />
      {index % 3 === 1 && <Cyl mat={m.fabricCoral} position={[-0.55, top + 0.05, 0.05]} scale={[0.08, 0.1, 0.08]} />}
      {index % 4 === 2 && <Plant position={[-0.6, top, 0.18]} size={0.25} seed={index + 50} />}
      <Chair position={[0, 0, occupant ? -0.72 : -0.5]} rotation={occupant ? 0 : 0.25 * ((index % 3) - 1)} />
      {occupant && (
        <>
          <group userData={{ dynamic: true }}>
            <OfficeAgent
              kind={occupant.kind}
              seed={index}
              activity={activityOf(occupant.status)}
              seat={[0, -0.74]}
              route={route}
              animate={animate}
              pinned={selected}
            />
          </group>
          {/* Status light on the desk, and a soft ring on the floor when selected. */}
          <Sphere
            mat={statusMat(m, occupant.status)}
            position={[w / 2 - 0.12, top + 0.04, -d / 2 + 0.1]}
            scale={0.06}
          />
          <mesh position={[0, 0.012, -0.45]} rotation-x={-Math.PI / 2} visible={selected} userData={{ dynamic: true }}>
            <ringGeometry args={[0.95, 1.08, 48]} />
            <meshBasicMaterial color="#f5b335" transparent opacity={0.9} depthWrite={false} />
          </mesh>
          {/* Generous invisible hit area so a desk is easy to click or tap. */}
          <mesh position={[0, 0.8, -0.3]} visible={false} userData={{ interior: true, dynamic: true }}>
            <boxGeometry args={[w + 0.3, 1.6, d + 1.4]} />
          </mesh>
        </>
      )}
    </group>
  );
}

const statusMats = new WeakMap<object, Map<string, THREE.Material>>();
function statusMat(m: object, status: string): THREE.Material {
  let cache = statusMats.get(m);
  if (!cache) statusMats.set(m, (cache = new Map()));
  let mat = cache.get(status);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: statusColor(status), toneMapped: false });
    cache.set(status, mat);
  }
  return mat;
}
