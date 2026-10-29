'use client';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { REF_SHIRT } from './occupants.ts';
import { asGeo, asMat } from './r3f.ts';
import { type PersonLook, personLook } from './room/detail.ts';
import { type DetailKit, useDetailKit } from './room/detailKit.ts';

type V3 = [number, number, number];

/** A mesh from a kit geometry and material. */
function P({
  g,
  m,
  position,
  rotation,
  scale,
}: {
  g: THREE.BufferGeometry;
  m: THREE.Material;
  position?: V3;
  rotation?: V3;
  scale?: V3;
}) {
  return <mesh geometry={asGeo(g)} material={asMat(m)} position={position} rotation={rotation} scale={scale} />;
}

/** Darken or lighten a colour a little (for noses and ears). */
function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount)));
  return `#${c.getHexString()}`;
}

/** Hair: a cap on the skull plus a style (swept fringe, quiff, buzz cut, long, bob, bun, ponytail). */
function Hair({ look, d }: { look: PersonLook; d: DetailKit }) {
  const m = d.mat(look.hair, { roughness: 0.85, key: 'hair' });
  const seg = 14;
  const cap = d.geo('hcap', () => new THREE.SphereGeometry(0.182, seg + 4, seg, 0, Math.PI * 2, 0, Math.PI * 0.52));
  const ball = (r: number) => d.geo(`hball${r}`, () => new THREE.SphereGeometry(r, seg, seg - 2));
  const caps = (r: number, len: number) => d.geo(`hcaps${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 3, seg));
  if (!look.female) {
    const s = look.hairStyle;
    return (
      <group>
        <P g={cap} m={m} position={[0, 0.02, -0.005]} scale={[1, 1.05, 1.04]} rotation={[-0.12, 0, 0]} />
        {(s === 'side' || s === 'quiff') && (
          <P
            g={ball(0.1)}
            m={m}
            position={[s === 'side' ? -0.04 : 0, 0.14, 0.09]}
            scale={[s === 'side' ? 1.5 : 1.2, 0.55, 0.8]}
            rotation={[0.3, 0, s === 'side' ? 0.25 : 0]}
          />
        )}
        {[-1, 1].map(k => (
          <P
            key={k}
            g={d.geo('sideburn', () => new THREE.BoxGeometry(0.03, 0.08, 0.06))}
            m={m}
            position={[k * 0.16, 0.03, 0.03]}
          />
        ))}
      </group>
    );
  }
  return (
    <group>
      <P g={cap} m={m} position={[0, 0.025, -0.005]} scale={[1.04, 1.08, 1.08]} rotation={[-0.15, 0, 0]} />
      <P g={ball(0.11)} m={m} position={[0.03, 0.13, 0.1]} scale={[1.45, 0.45, 0.7]} rotation={[0.45, 0, -0.2]} />
      {look.hairStyle === 'long' && (
        <>
          <P g={caps(0.15, 0.24)} m={m} position={[0, -0.1, -0.06]} scale={[1.15, 1, 0.72]} />
          {[-1, 1].map(k => (
            <P key={k} g={caps(0.05, 0.22)} m={m} position={[k * 0.15, -0.08, 0.02]} />
          ))}
        </>
      )}
      {look.hairStyle === 'bob' && (
        <P
          g={d.geo('hbob', () => new THREE.SphereGeometry(0.2, seg + 2, seg))}
          m={m}
          position={[0, -0.02, -0.02]}
          scale={[1.02, 0.85, 1]}
        />
      )}
      {look.hairStyle === 'bun' && <P g={ball(0.075)} m={m} position={[0, 0.17, -0.12]} />}
      {look.hairStyle === 'pony' && (
        <P g={caps(0.055, 0.22)} m={m} position={[0, -0.03, -0.2]} rotation={[0.35, 0, 0]} />
      )}
    </group>
  );
}

/**
 * A seated office worker for the Office view, after the legacy room's people: a rounded torso with collar (and a
 * tie or jacket lapels on some), a head with a painted face (brows, eyes, blush, mouth, glasses), ears, nose, hair in
 * one of seven styles (and a beard on some), arms down to the keyboard, thighs on the seat and shoes on the floor.
 * Looks come from the seat number only. People wear the warm legend shirt, AI agents the cool one. The body is
 * static (so the static batch folds it into a few meshes); only the head moves: it bobs while typing and leans in
 * when someone needs the visitor. Legacy units; seated at the chair at the desk's +z side, facing the monitor.
 */
export function Person({
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
  const d = useDetailKit();
  const look = useMemo(() => personLook(seed), [seed]);
  const head = useRef<THREE.Group>(null);
  const phase = (seed * 1.37) % 6.28;
  const headY = useRef(0);
  useFrame(({ clock }) => {
    const h = head.current;
    if (!h || !animate) return;
    const t = clock.elapsedTime;
    h.position.y = headY.current + (status === 'working' ? Math.sin(t * 6 + phase) * 0.02 : 0);
    h.rotation.x = status === 'needs-you' ? -0.12 + Math.sin(t * 2 + phase) * 0.05 : 0;
  });
  const f = look.female;
  const top = d.mat(REF_SHIRT[kind], { roughness: 0.7, key: 'top' });
  const skin = d.mat(look.skin, { roughness: 0.6, key: 'skin' });
  const bottom = d.mat(look.bottom, { roughness: 0.8, key: 'bottom' });
  const shoes = d.mat(look.shoes, { roughness: 0.5, key: 'shoes' });
  const white = d.mat('#ffffff', { roughness: 0.6, key: 'collar' });
  const tw = f ? 0.4 : 0.48;
  const th = f ? 0.52 : 0.56;
  const td = f ? 0.24 : 0.27;
  const hipY = 0.6;
  const torsoY = hipY + th / 2 + 0.02;
  const neckY = torsoY + th / 2 + 0.03;
  headY.current = neckY + 0.17;
  const face = d.face(
    { skin: look.skin, glasses: look.glasses, female: f, lips: f ? '#b4485a' : '#8a4a40' },
    look.hair,
  );
  const seg = 14;
  const caps = (r: number, len: number) => d.geo(`pc${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 3, seg));
  const armR = f ? 0.048 : 0.058;
  return (
    <group position={[-0.2, 0, 0.9]} rotation-y={Math.PI} scale={1.22}>
      {/* Legs: thighs forward on the seat, shins down, shoes. */}
      {[-1, 1].map(k => (
        <group key={k} position={[k * (f ? 0.095 : 0.11), hipY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <P g={caps(f ? 0.075 : 0.085, 0.3)} m={look.skirt ? skin : bottom} position={[0, -0.22, 0]} />
          <group position={[0, -0.44, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <P g={caps(f ? 0.06 : 0.07, 0.3)} m={look.skirt ? skin : bottom} position={[0, -0.2, 0]} />
            <P g={d.rbox(f ? 0.1 : 0.12, 0.08, f ? 0.22 : 0.25, 0.035)} m={shoes} position={[0, -0.42, 0.05]} />
          </group>
        </group>
      ))}
      {look.skirt && (
        <P
          g={d.geo('skirt', () => new THREE.CylinderGeometry(0.2, 0.27, 0.3, seg, 1, true))}
          m={d.mat(look.bottom, { side: THREE.DoubleSide, key: 'skirt' })}
          position={[0, hipY + 0.05, 0.1]}
        />
      )}
      {/* Body: leans a little towards the screen. */}
      <group position={[0, hipY, 0]} rotation={[0.1, 0, 0]}>
        <group position={[0, -hipY, 0]}>
          <P g={d.rbox(tw, th, td, 0.1)} m={top} position={[0, torsoY, 0]} />
          {f && <P g={d.rbox(0.36, 0.14, 0.22, 0.06)} m={top} position={[0, hipY + 0.04, 0]} />}
          <P
            g={d.geo('vneck', () => new THREE.CircleGeometry(0.075, 3))}
            m={white}
            position={[0, torsoY + th / 2 - 0.08, td / 2 + 0.004]}
            rotation={[0, 0, Math.PI]}
            scale={[1, 1.6, 1]}
          />
          {look.tie && (
            <P
              g={d.geo('tie', () => new THREE.BoxGeometry(0.045, 0.24, 0.015))}
              m={d.mat(look.tie, { roughness: 0.5 })}
              position={[0, torsoY + 0.06, td / 2 + 0.012]}
            />
          )}
          {look.jacket &&
            [-1, 1].map(k => (
              <P
                key={k}
                g={d.geo('lapel', () => new THREE.BoxGeometry(0.11, 0.42, 0.02))}
                m={d.mat(look.jacket!, { roughness: 0.7, key: 'jacket' })}
                position={[k * 0.1, torsoY - 0.02, td / 2 + 0.008]}
                rotation={[0, 0, k * 0.18]}
              />
            ))}
          <P
            g={d.geo('neck', () => new THREE.CylinderGeometry(0.06, 0.07, 0.12, seg))}
            m={skin}
            position={[0, neckY, 0]}
          />
          {/* Arms: shoulder, elbow, hand on the keyboard. */}
          {[-1, 1].map(k => (
            <group key={k} position={[k * (tw / 2 + 0.035), torsoY + th / 2 - 0.07, 0]} rotation={[-1.0, 0, k * 0.1]}>
              <P g={caps(armR, 0.22)} m={top} position={[0, -0.14, 0]} />
              <group position={[0, -0.28, 0]} rotation={[-0.45, 0, 0]}>
                <P g={caps(f ? 0.042 : 0.05, 0.2)} m={top} position={[0, -0.13, 0]} />
                <P
                  g={d.geo('hand', () => new THREE.SphereGeometry(0.052, seg, seg - 2))}
                  m={skin}
                  position={[0, -0.29, 0]}
                  scale={[0.8, 1.1, 0.7]}
                />
              </group>
            </group>
          ))}
          {/* Head: the only moving part. */}
          <group ref={head as never} position={[0, neckY + 0.17, 0]} userData={{ dynamic: true }}>
            <P
              g={d.geo('skull', () => new THREE.SphereGeometry(0.17, 24, 18))}
              m={face}
              scale={[f ? 0.92 : 0.96, 1.08, 1]}
            />
            <Hair look={look} d={d} />
            <P
              g={d.geo('nose', () => new THREE.SphereGeometry(0.024, 8, 6))}
              m={d.mat(shade(look.skin, -0.08), { key: 'nose' })}
              position={[0, -0.012, 0.166]}
              scale={[0.8, 1, 0.9]}
            />
            {d.level === 'rich' &&
              [-1, 1].map(k => (
                <P
                  key={k}
                  g={d.geo('ear', () => new THREE.SphereGeometry(0.032, 8, 6))}
                  m={skin}
                  position={[k * 0.158, 0, 0]}
                  scale={[0.5, 1, 0.8]}
                />
              ))}
            {look.beard && (
              <P
                g={d.geo(
                  'beard',
                  () => new THREE.SphereGeometry(0.168, seg + 4, seg, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.35),
                )}
                m={d.mat(look.hair, { roughness: 0.85, key: 'hair' })}
                scale={[0.97, 1.08, 1.02]}
              />
            )}
          </group>
        </group>
      </group>
    </group>
  );
}
