'use client';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { useKit } from './kit.ts';
import { Box, Capsule, Sphere } from './parts.tsx';
import { refMat } from './furniture.tsx';
import { REF_SHIRT } from './occupants.ts';
import { asMat } from './r3f.ts';

/**
 * An articulated, stylised office worker (until A2's rigged characters replace it): hips, torso, head, arms with
 * elbows, legs with knees, animated by a small activity script — typing and glancing at the screen while working,
 * a raised hand when they need you, leaning back, standing to stretch, and a walk to the coffee point and back for
 * idle agents with a clear path. Faces +z (towards the desk); `route` is in the same desk-local space.
 */
export type Activity = 'working' | 'needs-you' | 'idle';

export interface FigureProps {
  kind: 'ai' | 'human';
  seed: number;
  activity: Activity;
  /** Seat position (desk-local, metres). */
  seat: [number, number];
  /** Optional walk: seat → … → coffee point (desk-local x/z). */
  route?: [number, number][];
  animate: boolean;
  /** A selected agent stays at the desk, at work. */
  pinned: boolean;
}

type Ref = React.RefObject<THREE.Group | null>;

export function Figure({ kind, seed, activity, seat, route, animate, pinned }: FigureProps) {
  const { m } = useKit();
  const skin = [m.skin1, m.skin2, m.skin3][seed % 3]!;
  const shirt = kind === 'ai' ? m.shirtAi : m.shirtHuman;
  const j = {
    root: useRef<THREE.Group>(null),
    hips: useRef<THREE.Group>(null),
    torso: useRef<THREE.Group>(null),
    head: useRef<THREE.Group>(null),
    armL: useRef<THREE.Group>(null),
    armR: useRef<THREE.Group>(null),
    foreL: useRef<THREE.Group>(null),
    foreR: useRef<THREE.Group>(null),
    thighL: useRef<THREE.Group>(null),
    thighR: useRef<THREE.Group>(null),
    shinL: useRef<THREE.Group>(null),
    shinR: useRef<THREE.Group>(null),
  };
  const offset = (seed * 7.31) % 30;

  useFrame(({ clock }) => {
    const t = animate ? clock.elapsedTime + offset : offset;
    const pose = poseAt(t, activity, route && !pinned ? route : null, seat, animate);
    apply(j, pose);
  });

  const limb = (mat: THREE.Material, len: number, r: number) => (
    <Capsule mat={mat} position={[0, -len / 2, 0]} scale={[r, len / 2, r]} />
  );
  return (
    <group ref={j.root as never} position={[seat[0], 0, seat[1]]}>
      <group ref={j.hips as never} position={[0, 0.5, 0]}>
        {/* legs: hip → knee → foot */}
        {(['L', 'R'] as const).map(side => (
          <group
            key={side}
            ref={(side === 'L' ? j.thighL : j.thighR) as never}
            position={[side === 'L' ? -0.1 : 0.1, 0, 0]}
          >
            {limb(m.trousers, 0.44, 0.075)}
            <group ref={(side === 'L' ? j.shinL : j.shinR) as never} position={[0, -0.44, 0]}>
              {limb(m.trousers, 0.44, 0.065)}
              <Box mat={m.rubber} position={[0, -0.46, 0.06]} scale={[0.09, 0.06, 0.22]} />
            </group>
          </group>
        ))}
        <group ref={j.torso as never}>
          <Capsule mat={shirt} position={[0, 0.3, 0]} scale={[0.17, 0.28, 0.12]} />
          {(['L', 'R'] as const).map(side => (
            <group
              key={side}
              ref={(side === 'L' ? j.armL : j.armR) as never}
              position={[side === 'L' ? -0.21 : 0.21, 0.52, 0]}
            >
              {limb(shirt, 0.28, 0.055)}
              <group ref={(side === 'L' ? j.foreL : j.foreR) as never} position={[0, -0.28, 0]}>
                {limb(skin, 0.26, 0.045)}
              </group>
            </group>
          ))}
          <group ref={j.head as never} position={[0, 0.66, 0]}>
            <Sphere mat={skin} position={[0, 0.1, 0]} scale={[0.2, 0.23, 0.21]} />
            <Sphere mat={m.hair} position={[0, 0.16, -0.02]} scale={[0.21, 0.17, 0.21]} />
            {kind === 'ai' && (
              <mesh position={[0, 0.3, 0]} rotation-x={Math.PI / 2} material={asMat(m.halo)}>
                <torusGeometry args={[0.11, 0.012, 8, 32]} />
              </mesh>
            )}
          </group>
        </group>
      </group>
    </group>
  );
}

interface Pose {
  x: number;
  z: number;
  yaw: number;
  hipY: number;
  lean: number;
  headYaw: number;
  headPitch: number;
  thigh: [number, number];
  shin: [number, number];
  arm: [number, number];
  fore: [number, number];
}

const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** Seated at the keyboard. */
function seated(t: number, activity: Activity, animate: boolean): Pose {
  const typing = activity === 'working' && animate;
  const tap = typing ? Math.sin(t * 9) * 0.06 : 0;
  // Glance at the neighbour or out of the window now and then; otherwise eyes on the screen.
  const glance = animate ? smooth(0, 0.6, (t % 9) - 6.2) * (1 - smooth(0, 0.6, (t % 9) - 7.6)) : 0;
  const idleLean = activity === 'idle' ? 0.16 : 0;
  const hand =
    activity === 'needs-you' && animate ? smooth(0, 0.5, (t % 7) - 4) * (1 - smooth(0, 0.5, (t % 7) - 5.6)) : 0;
  return {
    x: 0,
    z: 0,
    yaw: 0,
    hipY: 0.5,
    lean: -idleLean + (typing ? 0.06 : 0),
    headYaw: glance * (activity === 'idle' ? 0.9 : 0.45) * (Math.sin(t * 0.1) > 0 ? 1 : -1),
    headPitch: typing ? -0.12 + Math.sin(t * 1.3) * 0.02 : activity === 'idle' ? 0.1 : -0.05,
    thigh: [-Math.PI / 2 + 0.05, -Math.PI / 2 - 0.05],
    shin: [Math.PI / 2, Math.PI / 2],
    // Upper arms forward and down to the keyboard; a raised right hand when they need you.
    arm: [activity === 'idle' ? -0.3 : -0.85 + tap, mix(activity === 'idle' ? -0.3 : -0.85 - tap, -2.9, hand)],
    fore: [activity === 'idle' ? -0.9 : -0.75, mix(activity === 'idle' ? -0.9 : -0.75, -0.2, hand)],
  };
}

function standing(walkPhase: number | null): Pose {
  const w = walkPhase ?? 0;
  const s = walkPhase === null ? 0 : Math.sin(w);
  return {
    x: 0,
    z: 0,
    yaw: 0,
    hipY: 0.92,
    lean: walkPhase === null ? 0 : 0.05,
    headYaw: 0,
    headPitch: 0,
    thigh: [s * 0.45, -s * 0.45],
    shin: [Math.max(0, -s) * 0.6, Math.max(0, s) * 0.6],
    arm: [-s * 0.4, s * 0.4],
    fore: [-0.25, -0.25],
  };
}

/** The activity script: idle agents with a route stand, walk to the coffee point, pause, walk back, sit. */
function poseAt(
  t: number,
  activity: Activity,
  route: [number, number][] | null,
  seat: [number, number],
  animate: boolean,
): Pose {
  if (!animate || activity !== 'idle') return seated(t, activity, animate);
  const T = 34;
  const c = t % T;
  if (c < 13) return seated(t, activity, animate);
  if (!route || route.length < 2) {
    // No clear path: stand up beside the chair, stretch, sit back down.
    if (c > 18) return seated(t, activity, animate);
    const k = smooth(13, 14, c) * (1 - smooth(17, 18, c));
    return blend(seated(t, activity, animate), { ...standing(null), arm: [-2.6, -2.6], fore: [-0.3, -0.3] }, k);
  }
  // Walk out along the route, wait, walk back.
  const pts: [number, number][] = [[0, 0], ...route.map(([x, z]) => [x - seat[0], z - seat[1]] as [number, number])];
  const lengths = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  const speed = 1.1; // m/s
  const walkT = total / speed;
  const up = 13;
  const out0 = up + 1;
  const out1 = out0 + walkT;
  const back0 = out1 + 4;
  const back1 = back0 + walkT;
  if (c < out0) return blend(seated(t, activity, animate), standing(null), smooth(up, out0, c));
  if (c > back1 + 1) return seated(t, activity, animate);
  if (c > back1) return blend(standing(null), seated(t, activity, animate), smooth(back1, back1 + 1, c));
  const along = c < out1 ? ((c - out0) / walkT) * total : c < back0 ? total : total - ((c - back0) / walkT) * total;
  // Position and heading along the polyline.
  let d = along;
  let i = 0;
  while (i < lengths.length - 1 && d > lengths[i]!) d -= lengths[i++]!;
  const a = pts[i]!;
  const b = pts[i + 1]!;
  const k = lengths[i]! > 0 ? Math.min(1, d / lengths[i]!) : 1;
  const forward = c < out1 || c >= back0 ? (c < out1 ? 1 : -1) : 0;
  const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]) + (forward < 0 ? Math.PI : 0);
  const p = standing(forward === 0 ? null : t * 7.5);
  return {
    ...p,
    x: a[0] + (b[0] - a[0]) * k,
    z: a[1] + (b[1] - a[1]) * k,
    yaw: forward === 0 ? yaw + Math.PI / 2 : yaw,
  };
}

function blend(a: Pose, b: Pose, k: number): Pose {
  const pair = (x: [number, number], y: [number, number]): [number, number] => [mix(x[0], y[0], k), mix(x[1], y[1], k)];
  return {
    x: mix(a.x, b.x, k),
    z: mix(a.z, b.z, k),
    yaw: mix(a.yaw, b.yaw, k),
    hipY: mix(a.hipY, b.hipY, k),
    lean: mix(a.lean, b.lean, k),
    headYaw: mix(a.headYaw, b.headYaw, k),
    headPitch: mix(a.headPitch, b.headPitch, k),
    thigh: pair(a.thigh, b.thigh),
    shin: pair(a.shin, b.shin),
    arm: pair(a.arm, b.arm),
    fore: pair(a.fore, b.fore),
  };
}

function apply(
  j: Record<
    'root' | 'hips' | 'torso' | 'head' | 'armL' | 'armR' | 'foreL' | 'foreR' | 'thighL' | 'thighR' | 'shinL' | 'shinR',
    Ref
  >,
  p: Pose,
) {
  const root = j.root.current;
  if (!root) return;
  root.userData.seat ??= root.position.clone();
  root.position.set(root.userData.seat.x + p.x, 0, root.userData.seat.z + p.z);
  root.rotation.y = p.yaw;
  j.hips.current!.position.y = p.hipY;
  j.torso.current!.rotation.x = p.lean;
  j.head.current!.rotation.set(p.headPitch, p.headYaw, 0);
  j.armL.current!.rotation.x = p.arm[0];
  j.armR.current!.rotation.x = p.arm[1];
  j.foreL.current!.rotation.x = p.fore[0];
  j.foreR.current!.rotation.x = p.fore[1];
  j.thighL.current!.rotation.x = p.thigh[0];
  j.thighR.current!.rotation.x = p.thigh[1];
  j.shinL.current!.rotation.x = p.shin[0];
  j.shinR.current!.rotation.x = p.shin[1];
}

// ── Reference office: the simplified seated agent ──────────────────────────────────────────────────────────────

const TOY_SKIN = ['#e0b48f', '#c99a6e', '#f0c8a0', '#a87452'];
const TOY_HAIR = { human: '#3b2a20', ai: '#1e3a5f' } as const;

/**
 * A low-poly seated agent for the Office view (legacy units, seated on the chair at the desk's +z side, facing
 * the monitor): capsule body, sphere head, a hair cap. People wear the warm legend shirt, AI agents the cool one.
 * Working agents bob their heads as they type; agents who need the visitor lean in a little.
 */
export function ToyAgent({
  kind,
  seed,
  status,
  animate,
}: {
  kind: 'ai' | 'human';
  seed: number;
  status: string;
  animate: boolean;
}) {
  const head = useRef<THREE.Group>(null);
  const phase = (seed * 1.37) % 6.28;
  useFrame(({ clock }) => {
    const h = head.current;
    if (!h || !animate) return;
    const t = clock.elapsedTime;
    h.position.y = status === 'working' ? Math.sin(t * 6 + phase) * 0.03 : 0;
    h.rotation.x = status === 'needs-you' ? -0.12 + Math.sin(t * 2 + phase) * 0.05 : 0;
  });
  const shirt = refMat(REF_SHIRT[kind]);
  return (
    <group position={[-0.2, 0, 1.0]} userData={{ dynamic: true }}>
      <Capsule mat={shirt} position={[0, 1.05, 0]} scale={[0.6, 0.55, 0.6]} castShadow />
      <group ref={head as never}>
        <Sphere mat={refMat(TOY_SKIN[seed % TOY_SKIN.length]!)} position={[0, 1.7, 0]} scale={0.48} castShadow />
        <mesh position={[0, 1.73, 0]} rotation-x={0.3} material={asMat(refMat(TOY_HAIR[kind]))}>
          <sphereGeometry args={[0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      </group>
    </group>
  );
}
