'use client';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { Character, type CharacterClip, characterLook, useCharacterAsset } from '../life/characters/index.ts';
import { type Activity, Figure } from './figure.tsx';
import { useKit } from './kit.ts';
import { asMat } from './r3f.ts';
import { seeded } from './textures.ts';

/**
 * An office agent at a desk: A2's skinned character (typing, talking, sitting, standing up, walking to the coffee
 * point and back), or the articulated stand-in figure until the character model has loaded. Desk-local metres,
 * facing +z (the desk). AI agents wear the brand teal and a soft halo; people wear their own clothes.
 */
export function OfficeAgent(props: {
  kind: 'ai' | 'human';
  seed: number;
  activity: Activity;
  seat: [number, number];
  route?: [number, number][];
  animate: boolean;
  pinned: boolean;
}) {
  const asset = useCharacterAsset();
  if (!asset) return <Figure {...props} />;
  return <SkinnedAgent {...props} />;
}

/** One cycle of an idle agent with a route (seconds): sit, stand up, walk out, pause, walk back, sit down. */
const CYCLE = 36;
const SIT_UNTIL = 14;
const STAND = 1.6;
const PAUSE = 4;
const SPEED = 1.15;
/** How far towards the desk the seated model sits from the chair's seat point (metres). */
const SIT_IN = 0.1;

function SkinnedAgent({
  kind,
  seed,
  activity,
  seat,
  route,
  animate,
  pinned,
}: {
  kind: 'ai' | 'human';
  seed: number;
  activity: Activity;
  seat: [number, number];
  route?: [number, number][];
  animate: boolean;
  pinned: boolean;
}) {
  const { m } = useKit();
  const { body, hair, look } = useMemo(() => {
    const l = characterLook(seeded(seed * 131 + 17));
    // AI agents in the brand teal; people keep their own colours.
    return kind === 'ai' ? { ...l, look: { ...l.look, top: '#2b8f9c', shirt: undefined } } : l;
  }, [seed, kind]);
  // At the desk: typing when working (and always when picked out for the close-up, hands on the keyboard and
  // eyes on the screen), talking it through when they need the visitor, sitting back when idle.
  const seatedClip: CharacterClip =
    activity === 'working' || pinned ? 'type' : activity === 'needs-you' ? 'sitTalk' : 'sit';
  const [clip, setClip] = useState<CharacterClip>(seatedClip);
  const mover = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const offset = (seed * 7.31) % CYCLE;
  const walks = !!route && route.length >= 2 && activity === 'idle';
  const path = useMemo(() => (walks ? polyline([seat, ...route!]) : null), [walks, seat, route]);

  useFrame(({ clock }) => {
    const g = mover.current;
    if (!g) return;
    let next: CharacterClip = seatedClip;
    // Seated, the model sits a hand's width further in than the stand-in, so its hands rest on the keyboard.
    let x = seat[0];
    let z = seat[1] + SIT_IN;
    let yaw = 0;
    let standing = false;
    if (path && animate && !pinned) {
      const c = (clock.elapsedTime + offset) % CYCLE;
      const walkT = path.total / SPEED;
      const out0 = SIT_UNTIL + STAND;
      const out1 = out0 + walkT;
      const back0 = out1 + PAUSE;
      const back1 = back0 + walkT;
      if (c >= SIT_UNTIL && c < out0) next = 'standUp';
      else if (c >= out0 && c < back1) {
        const along = c < out1 ? (c - out0) * SPEED : c < back0 ? path.total : path.total - (c - back0) * SPEED;
        const p = path.at(along);
        x = p.x;
        z = p.z;
        yaw = c < out1 ? p.yaw : c < back0 ? p.yaw + Math.PI / 2 : p.yaw + Math.PI;
        next = c < out1 || c >= back0 ? 'walk' : 'phone';
        standing = true;
      } else if (c >= back1 && c < back1 + STAND) next = 'sitDown';
    }
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    if (halo.current) halo.current.position.y = standing ? 2.02 : 1.42;
    if (next !== clip) setClip(next);
  });

  return (
    <group ref={mover as never} position={[seat[0], 0, seat[1] + SIT_IN]}>
      <Character body={body} hair={hair} look={look} clip={clip} scale={1} offset={seed * 0.77} castShadow={false} />
      {kind === 'ai' && (
        <mesh ref={halo as never} position={[0, 1.42, 0.05]} rotation-x={Math.PI / 2} material={asMat(m.halo)}>
          <torusGeometry args={[0.12, 0.012, 8, 32]} />
        </mesh>
      )}
    </group>
  );
}

/** A walkable polyline: total length and position/heading at a distance along it. */
function polyline(points: [number, number][]) {
  const segs = points.slice(1).map((b, i) => {
    const a = points[i]!;
    return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  });
  const total = segs.reduce((n, s) => n + s.len, 0);
  return {
    total,
    at(d: number) {
      let rest = Math.max(0, Math.min(total, d));
      for (const s of segs) {
        if (rest <= s.len || s === segs[segs.length - 1]) {
          const k = s.len > 0 ? rest / s.len : 1;
          return {
            x: s.a[0] + (s.b[0] - s.a[0]) * k,
            z: s.a[1] + (s.b[1] - s.a[1]) * k,
            yaw: Math.atan2(s.b[0] - s.a[0], s.b[1] - s.a[1]),
          };
        }
        rest -= s.len;
      }
      return { x: points[0]![0], z: points[0]![1], yaw: 0 };
    },
  };
}
