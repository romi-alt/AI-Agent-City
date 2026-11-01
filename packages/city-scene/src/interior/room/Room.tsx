'use client';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Box, Cyl, Plane } from '../parts.tsx';
import { asGeo, asMat } from '../r3f.ts';
import type { Rect } from '../plan.ts';
import { featureBoard } from './detail.ts';
import type { RugKind } from './art.ts';
import { useDetailKit } from './detailKit.ts';
import { type RoomLayout } from './layout.ts';
import { useRoomKit } from './kit.ts';

type V3 = [number, number, number];

/** A mesh using one of the room kit's own shapes (icosahedron leaves, tapered pots, rings, discs). */
function Shape({
  geo,
  mat,
  position,
  rotation,
  scale,
}: {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  position: V3;
  rotation?: V3;
  scale?: V3 | number;
}) {
  return <mesh geometry={asGeo(geo)} material={asMat(mat)} position={position} rotation={rotation} scale={scale} />;
}

/** Floor slab, warm plank floor and the glass on three sides with a timber handrail. */
export function RoomShell({ room }: { room: RoomLayout }) {
  const { m } = useRoomKit();
  const W = room.width;
  const D = room.depth;
  const H = room.glassHeight;
  const sides: { x: number; z: number; len: number; yaw: number }[] = [
    { x: 0, z: -D / 2, len: W, yaw: 0 },
    { x: -W / 2, z: 0, len: D, yaw: Math.PI / 2 },
    { x: W / 2, z: 0, len: D, yaw: Math.PI / 2 },
  ];
  return (
    <group>
      <Box mat={m.slab} position={[0, -0.2, 0]} scale={[W + 0.3, 0.4, D + 0.3]} />
      <Plane mat={m.floor} position={[0, 0.002, 0]} rotation-x={-Math.PI / 2} scale={[W, D, 1]} />
      {sides.map((s, i) => {
        const posts = Math.max(2, Math.round(s.len / 3.2));
        return (
          <group key={i} position={[s.x, 0, s.z]} rotation-y={s.yaw}>
            <Box mat={m.glass} position={[0, H / 2, 0]} scale={[s.len, H, 0.05]} />
            <Box mat={m.rail} position={[0, room.railHeight, 0.06]} scale={[s.len, 0.1, 0.2]} />
            <Box mat={m.rail} position={[0, 0.06, 0]} scale={[s.len, 0.12, 0.14]} />
            <Box mat={m.post} position={[0, H, 0]} scale={[s.len + 0.1, 0.08, 0.1]} />
            {Array.from({ length: posts + 1 }, (_, k) => (
              <Box
                key={k}
                mat={m.post}
                position={[-s.len / 2 + (s.len * k) / posts, H / 2, 0]}
                scale={[0.07, H, 0.08]}
              />
            ))}
          </group>
        );
      })}
    </group>
  );
}

/** A flat patterned rug (border, inner rule and a woven motif per zone), a little raised off the floor. */
function Rug({ rect, kind, y }: { rect: Rect; kind: RugKind; y: number }) {
  const d = useDetailKit();
  return (
    <mesh
      material={asMat(d.rug(kind, rect.w / rect.d))}
      position={[rect.x, y, rect.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[rect.w, rect.d, 1]}
    >
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

export function Rugs({ room }: { room: RoomLayout }) {
  const { m, g } = useRoomKit();
  const t = room.meeting;
  return (
    <group>
      <Rug rect={room.leadRug} kind="lead" y={0.014} />
      <Rug rect={room.teamRug} kind="team" y={0.014} />
      <Rug rect={room.loungeRug} kind="lounge" y={0.014} />
      <Shape
        geo={g.ring}
        mat={m.teal}
        position={[t.x, 0.02, t.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[t.radius, t.radius, 1]}
      />
    </group>
  );
}

/** A canvas texture redrawn when `deps` change, on a screen material that ignores scene lighting. */
export function useCanvasMaterial(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [w, h]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [tex]);
  useEffect(() => {
    draw((tex.image as HTMLCanvasElement).getContext('2d')!);
    tex.needsUpdate = true;
  }, [tex, ...deps]);
  useEffect(
    () => () => {
      tex.dispose();
      mat.dispose();
    },
    [tex, mat],
  );
  return mat;
}

/**
 * The back wall's centrepiece: vertical timber slats in two tones and a large dark task board. The board's material
 * is drawn by the caller (it shows the floor's people); the clock and ledge come from the room's detail.
 */
export function FeatureWall({ room, board }: { room: RoomLayout; board: THREE.Material }) {
  const { m } = useRoomKit();
  const f = room.featureWall;
  const slat = 0.2;
  const n = Math.floor(f.w / slat);
  const { w: boardW, h: boardH, y: boardY } = featureBoard(f, room.scale);
  return (
    <group position={[f.x, 0, f.z]}>
      <Box mat={m.slatBack} position={[0, f.h / 2, -0.12]} scale={[f.w, f.h, 0.12]} />
      {Array.from({ length: n }, (_, i) => (
        <Box
          key={i}
          mat={i % 2 ? m.slatLight : m.slatDark}
          position={[-f.w / 2 + slat / 2 + i * slat, f.h / 2, -0.02]}
          scale={[slat * 0.82, f.h, 0.1]}
        />
      ))}
      <Box mat={m.rail} position={[0, f.h + 0.04, -0.05]} scale={[f.w + 0.12, 0.08, 0.3]} />
      <Box mat={m.board} position={[0, boardY, 0.06]} scale={[boardW + 0.16, boardH + 0.16, 0.08]} />
      <mesh material={asMat(board)} position={[0, boardY, 0.105]}>
        <planeGeometry args={[boardW, boardH]} />
      </mesh>
    </group>
  );
}

/** A freestanding dark monitor on a stand, turned towards the room. */
export function LiveScreen({ room, screen }: { room: RoomLayout; screen: THREE.Material }) {
  const { m, g } = useRoomKit();
  const s = room.liveScreen;
  return (
    <group position={[s.x, 0, s.z]} rotation-y={s.yaw}>
      <Shape geo={g.disc} mat={m.board} position={[0, 0.04, 0]} scale={[1.1, 0.08, 1.1]} />
      <Cyl mat={m.board} position={[0, 0.6, 0]} scale={[0.12, 1.2, 0.12]} />
      <Box mat={m.board} position={[0, 1.95, 0]} scale={[1.9, 2.35, 0.12]} />
      <mesh material={asMat(screen)} position={[0, 1.95, 0.065]}>
        <planeGeometry args={[1.76, 2.2]} />
      </mesh>
    </group>
  );
}
