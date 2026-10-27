'use client';
import { forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { useKit } from './kit.ts';
import { Box, Capsule, Cyl, Plane, Sphere } from './parts.tsx';
import { seeded } from './textures.ts';
import { asGeo, asMat } from './r3f.ts';

/** Ergonomic task chair: five-star base on casters, gas lift, contoured seat, curved mesh back, armrests. */
export function Chair({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const { m, g } = useKit();
  return (
    <group position={position} rotation-y={rotation}>
      {[0, 1, 2, 3, 4].map(i => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <group key={i} rotation-y={a}>
            <Box mat={m.metalDark} position={[0, 0.07, 0.16]} scale={[0.04, 0.03, 0.32]} />
            <Sphere mat={m.rubber} position={[0, 0.03, 0.31]} scale={0.055} />
          </group>
        );
      })}
      <Cyl mat={m.metalLight} position={[0, 0.25, 0]} scale={[0.045, 0.34, 0.045]} />
      <Box mat={m.fabricNavy} position={[0, 0.46, 0.02]} scale={[0.5, 0.07, 0.48]} />
      <mesh
        geometry={asGeo(g.chairBack)}
        material={asMat(m.fabricNavy)}
        position={[0, 0.8, 0.1]}
        rotation-y={Math.PI}
      />
      <Box mat={m.metalDark} position={[0, 0.6, -0.22]} scale={[0.05, 0.3, 0.03]} />
      {[-1, 1].map(s => (
        <group key={s}>
          <Box mat={m.metalDark} position={[s * 0.26, 0.56, 0.02]} scale={[0.03, 0.2, 0.03]} />
          <Box mat={m.rubber} position={[s * 0.26, 0.66, 0.05]} scale={[0.06, 0.03, 0.24]} />
        </group>
      ))}
    </group>
  );
}

/** A seated, stylised person. AI agents wear teal and a soft light halo; people wear warm tones. */
export const Person = forwardRef<
  THREE.Group,
  { kind: 'ai' | 'human'; seed: number; position: [number, number, number] }
>(function Person({ kind, seed, position }, ref) {
  const { m } = useKit();
  const skin = [m.skin1, m.skin2, m.skin3][seed % 3]!;
  const shirt = kind === 'ai' ? m.shirtAi : m.shirtHuman;
  return (
    <group position={position}>
      {/* legs: thighs forward, shins down */}
      {[-1, 1].map(s => (
        <group key={s}>
          <Capsule
            mat={m.trousers}
            position={[s * 0.1, 0.52, 0.2]}
            rotation-x={Math.PI / 2}
            scale={[0.075, 0.28, 0.075]}
          />
          <Capsule mat={m.trousers} position={[s * 0.1, 0.27, 0.42]} scale={[0.065, 0.3, 0.065]} />
          <Box mat={m.rubber} position={[s * 0.1, 0.04, 0.47]} scale={[0.09, 0.06, 0.2]} />
        </group>
      ))}
      <group ref={ref}>
        <Capsule mat={shirt} position={[0, 0.86, -0.02]} scale={[0.17, 0.3, 0.13]} />
        {/* arms reaching to the keyboard */}
        {[-1, 1].map(s => (
          <group key={s}>
            <Capsule mat={shirt} position={[s * 0.2, 0.86, 0.06]} rotation-x={0.7} scale={[0.055, 0.2, 0.055]} />
            <Capsule mat={skin} position={[s * 0.17, 0.74, 0.27]} rotation-x={1.45} scale={[0.045, 0.18, 0.045]} />
          </group>
        ))}
        <Sphere mat={skin} position={[0, 1.27, 0.0]} scale={[0.2, 0.23, 0.21]} />
        <Sphere mat={m.hair} position={[0, 1.33, -0.02]} scale={[0.21, 0.17, 0.21]} />
        {kind === 'ai' && (
          <mesh position={[0, 1.47, 0]} rotation-x={Math.PI / 2} material={asMat(m.halo)}>
            <torusGeometry args={[0.11, 0.012, 8, 32]} />
          </mesh>
        )}
      </group>
    </group>
  );
});

/** Potted plant: a ceramic planter with a layered leaf crown (fiddle-leaf / rubber-plant silhouette). */
export function Plant({
  position,
  size = 1,
  seed = 1,
}: {
  position: [number, number, number];
  size?: number;
  seed?: number;
}) {
  const { m, g } = useKit();
  const leaves = useMemo(() => {
    const rnd = seeded(seed * 97 + 3);
    return Array.from({ length: 26 }, (_, i) => {
      const h = 0.55 + rnd() * 0.9;
      const a = rnd() * Math.PI * 2;
      const r = 0.08 + rnd() * 0.25 * (1 - h / 2);
      return {
        p: [Math.sin(a) * r, h, Math.cos(a) * r] as [number, number, number],
        rot: [-(0.4 + rnd() * 0.7), a, (rnd() - 0.5) * 0.4] as [number, number, number],
        s: 0.5 + rnd() * 0.4,
        dark: i % 3 === 0,
      };
    });
  }, [seed]);
  return (
    <group position={position} scale={size}>
      <Cyl mat={m.pot} position={[0, 0.24, 0]} scale={[0.42, 0.48, 0.42]} />
      <Cyl mat={m.soil} position={[0, 0.48, 0]} scale={[0.38, 0.01, 0.38]} />
      <Cyl mat={m.walnut} position={[0, 0.8, 0]} scale={[0.025, 0.7, 0.025]} />
      {leaves.map((l, i) => (
        <mesh
          key={i}
          geometry={asGeo(g.leaf)}
          material={asMat(l.dark ? m.leafDark : m.leaf)}
          position={l.p}
          rotation={l.rot}
          scale={l.s}
        />
      ))}
    </group>
  );
}

export function Rug({ x, z, w, d, mat }: { x: number; z: number; w: number; d: number; mat: THREE.Material }) {
  return <Plane mat={mat} position={[x, 0.006, z]} rotation-x={-Math.PI / 2} scale={[w, d, 1]} receiveShadow />;
}

export function Sofa({
  position,
  rotation = 0,
  width = 2.6,
}: {
  position: [number, number, number];
  rotation?: number;
  width?: number;
}) {
  const { m } = useKit();
  return (
    <group position={position} rotation-y={rotation}>
      <Box mat={m.metalDark} position={[0, 0.08, 0]} scale={[width - 0.1, 0.16, 0.85]} />
      <Box mat={m.fabricSand} position={[0, 0.3, 0.02]} scale={[width, 0.24, 0.9]} />
      <Box mat={m.fabricSand} position={[0, 0.6, -0.35]} scale={[width, 0.5, 0.22]} />
      {[-1, 1].map(s => (
        <Box key={s} mat={m.fabricSand} position={[s * (width / 2 - 0.1), 0.48, 0.02]} scale={[0.2, 0.36, 0.9]} />
      ))}
      {[-0.6, 0.6].map(x => (
        <Box
          key={x}
          mat={m.fabricCoral}
          position={[x * (width / 2.6), 0.55, -0.18]}
          scale={[0.42, 0.36, 0.12]}
          rotation-x={-0.2}
        />
      ))}
    </group>
  );
}

export function Armchair({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const { m } = useKit();
  return (
    <group position={position} rotation-y={rotation}>
      <Box mat={m.fabricCoral} position={[0, 0.3, 0]} scale={[0.8, 0.22, 0.8]} />
      <Box mat={m.fabricCoral} position={[0, 0.62, -0.33]} scale={[0.8, 0.5, 0.16]} rotation-x={-0.12} />
      {[-1, 1].map(s => (
        <Box key={s} mat={m.fabricCoral} position={[s * 0.37, 0.48, 0]} scale={[0.1, 0.2, 0.75]} />
      ))}
      {[-1, 1].map(sx =>
        [-1, 1].map(sz => (
          <Cyl key={`${sx}${sz}`} mat={m.walnut} position={[sx * 0.32, 0.1, sz * 0.32]} scale={[0.04, 0.2, 0.04]} />
        )),
      )}
    </group>
  );
}

export function CoffeeTable({ position, radius = 0.55 }: { position: [number, number, number]; radius?: number }) {
  const { m } = useKit();
  return (
    <group position={position}>
      <Cyl mat={m.counter} position={[0, 0.4, 0]} scale={[radius * 2, 0.04, radius * 2]} />
      <Cyl mat={m.metalDark} position={[0, 0.2, 0]} scale={[0.08, 0.4, 0.08]} />
      <Cyl mat={m.metalDark} position={[0, 0.01, 0]} scale={[radius, 0.02, radius]} />
      <Box mat={m.oak} position={[0.12, 0.44, -0.05]} scale={[0.28, 0.03, 0.2]} rotation-y={0.3} />
    </group>
  );
}

export function FloorLamp({ position }: { position: [number, number, number] }) {
  const { m } = useKit();
  return (
    <group position={position}>
      <Cyl mat={m.metalDark} position={[0, 0.015, 0]} scale={[0.3, 0.03, 0.3]} />
      <Cyl mat={m.metalDark} position={[0, 0.8, 0]} scale={[0.025, 1.6, 0.025]} />
      <Cyl mat={m.warmLight} position={[0, 1.62, 0]} scale={[0.36, 0.3, 0.36]} />
    </group>
  );
}

/** Long meeting table with chairs either side. */
export function MeetingTable({ length, seats }: { length: number; seats: number }) {
  const { m } = useKit();
  const perSide = Math.max(2, Math.floor(seats / 2));
  return (
    <group>
      <Box mat={m.walnut} position={[0, 0.74, 0]} scale={[length, 0.05, 1.2]} />
      {[-1, 1].map(s => (
        <Box key={s} mat={m.metalDark} position={[s * (length / 2 - 0.4), 0.36, 0]} scale={[0.08, 0.72, 0.9]} />
      ))}
      {Array.from({ length: perSide }, (_, i) => {
        const x = -length / 2 + (length / perSide) * (i + 0.5);
        return (
          <group key={i}>
            <Chair position={[x, 0, -0.95]} rotation={0} />
            <Chair position={[x, 0, 0.95]} rotation={Math.PI} />
          </group>
        );
      })}
    </group>
  );
}

/** A stylised car on a turntable podium (the dealership showroom floors). */
export function ShowroomCar({ position, rotation = 0.6 }: { position: [number, number, number]; rotation?: number }) {
  const { m } = useKit();
  return (
    <group position={position}>
      <Cyl mat={m.counter} position={[0, 0.08, 0]} scale={[5.6, 0.16, 5.6]} />
      <mesh position={[0, 0.165, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[2.6, 2.72, 72]} />
        <meshBasicMaterial color="#f5b335" />
      </mesh>
      <group rotation-y={rotation} position={[0, 0.16, 0]}>
        <Box mat={m.paint} position={[0, 0.55, 0]} scale={[4.4, 0.55, 1.85]} />
        <Box mat={m.paint} position={[0.2, 0.42, 0]} scale={[4.6, 0.28, 1.8]} />
        <Box mat={m.glassTint} position={[-0.15, 1.02, 0]} scale={[2.3, 0.45, 1.6]} />
        <Box mat={m.paint} position={[-0.15, 1.25, 0]} scale={[1.9, 0.06, 1.55]} />
        {[-1, 1].map(sx =>
          [-1, 1].map(sz => (
            <group key={`${sx}${sz}`} position={[sx * 1.4, 0.36, sz * 0.88]} rotation-x={Math.PI / 2}>
              <Cyl mat={m.rubber} scale={[0.72, 0.26, 0.72]} />
              <Cyl mat={m.metalLight} scale={[0.46, 0.28, 0.46]} />
            </group>
          )),
        )}
        {[-1, 1].map(sz => (
          <Box key={sz} mat={m.warmLight} position={[2.21, 0.62, sz * 0.62]} scale={[0.02, 0.08, 0.38]} />
        ))}
      </group>
    </group>
  );
}

/** Thin-framed glass partition between two points on the floor (metres). */
export function GlassWall({
  from,
  to,
  height,
  door,
}: {
  from: [number, number];
  to: [number, number];
  height: number;
  door?: number;
}) {
  const { m } = useKit();
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const rot = -Math.atan2(dz, dx);
  const cx = (from[0] + to[0]) / 2;
  const cz = (from[1] + to[1]) / 2;
  const segs: [number, number][] = door
    ? [
        [-len / 2, door - 0.5],
        [door + 0.5, len / 2],
      ]
    : [[-len / 2, len / 2]];
  return (
    <group position={[cx, 0, cz]} rotation-y={rot}>
      {segs.map(([a, b]) => (
        <group key={a}>
          <Box mat={m.glass} position={[(a + b) / 2, height / 2, 0]} scale={[b - a, height, 0.02]} />
          {Array.from({ length: Math.max(1, Math.round((b - a) / 1.2)) + 1 }, (_, i) => (
            <Box
              key={i}
              mat={m.mullion}
              position={[a + ((b - a) * i) / Math.max(1, Math.round((b - a) / 1.2)), height / 2, 0]}
              scale={[0.035, height, 0.05]}
            />
          ))}
        </group>
      ))}
      <Box mat={m.mullion} position={[0, height - 0.02, 0]} scale={[len, 0.04, 0.06]} />
      <Box mat={m.mullion} position={[0, 0.02, 0]} scale={[len, 0.04, 0.06]} />
      {/* frosted manifestation band at eye level, so the glass reads as glass */}
      {segs.map(([a, b]) => (
        <Box key={`band${a}`} mat={m.white} position={[(a + b) / 2, 1.3, 0]} scale={[b - a, 0.08, 0.025]} />
      ))}
    </group>
  );
}

/** The material for a canvas screen. */
export function screenMaterial(tex: THREE.Texture) {
  return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
}
