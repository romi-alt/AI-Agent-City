'use client';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Box, Cyl, Plane } from '../parts.tsx';
import { asGeo, asMat } from '../r3f.ts';
import type { Rect } from '../plan.ts';
import { seeded } from '../textures.ts';
import { type RoomLayout, RUG_BORDER } from './layout.ts';
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
              <Box key={k} mat={m.post} position={[-s.len / 2 + (s.len * k) / posts, H / 2, 0]} scale={[0.07, H, 0.08]} />
            ))}
          </group>
        );
      })}
    </group>
  );
}

/** A flat rug: coloured border band with a cream field, a little raised so it reads as a toy rug. */
function Rug({ rect, border }: { rect: Rect; border: THREE.Material }) {
  const { m } = useRoomKit();
  return (
    <group position={[rect.x, 0, rect.z]}>
      <Box mat={border} position={[0, 0.012, 0]} scale={[rect.w, 0.02, rect.d]} />
      <Box mat={m.cream} position={[0, 0.018, 0]} scale={[rect.w - RUG_BORDER * 2, 0.02, rect.d - RUG_BORDER * 2]} />
    </group>
  );
}

export function Rugs({ room }: { room: RoomLayout }) {
  const { m, g } = useRoomKit();
  const t = room.meeting;
  return (
    <group>
      <Rug rect={room.leadRug} border={m.peach} />
      <Rug rect={room.teamRug} border={m.peach} />
      <Rug rect={room.loungeRug} border={m.coral} />
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
 * The back wall's centrepiece: vertical timber slats in two tones, a large dark task board and a round clock above
 * it. The board's material is drawn by the caller (it shows the floor's people).
 */
export function FeatureWall({ room, board }: { room: RoomLayout; board: THREE.Material }) {
  const { m, g } = useRoomKit();
  const f = room.featureWall;
  const slat = 0.2;
  const n = Math.floor(f.w / slat);
  const boardW = f.w * 0.78;
  const boardH = Math.min(f.h * 0.5, boardW * 0.43);
  const boardY = 0.95 + boardH / 2;
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
      <Box mat={m.metal} position={[0, 0.75, 0.12]} scale={[boardW * 0.6, 0.05, 0.22]} />
      {/* Clock above the board: a dark rim, white face, two hands. */}
      <group position={[0, boardY + boardH / 2 + 0.45, 0.05]}>
        <Shape geo={g.disc} mat={m.clockRim} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.6, 0.06, 0.6]} />
        <Shape geo={g.disc} mat={m.clockFace} position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]} scale={[0.5, 0.05, 0.5]} />
        <Box mat={m.clockRim} position={[0, 0.08, 0.06]} scale={[0.025, 0.17, 0.01]} />
        <Box mat={m.clockRim} position={[0.06, 0, 0.06]} rotation-z={-1.1} scale={[0.025, 0.13, 0.01]} />
      </group>
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

/** Low-poly potted plant: a tapered terracotta (or cream) pot and a crown of faceted round leaves. */
export function Plant({ position, size = 1, seed = 1 }: { position: V3; size?: number; seed?: number }) {
  const { m, g } = useRoomKit();
  const leaves = useMemo(() => {
    const rnd = seeded(seed * 31 + 7);
    return Array.from({ length: 4 }, (_, i) => ({
      p: [(rnd() - 0.5) * 0.5, 1.15 + i * 0.22 + rnd() * 0.15, (rnd() - 0.5) * 0.5] as V3,
      s: 0.75 + rnd() * 0.35 - i * 0.08,
      dark: i % 2 === 1,
    }));
  }, [seed]);
  return (
    <group position={position} scale={size}>
      <Shape geo={g.pot} mat={seed % 2 ? m.pot : m.potLight} position={[0, 0.35, 0]} scale={[0.8, 0.7, 0.8]} />
      <Cyl mat={m.trunk} position={[0, 0.85, 0]} scale={[0.07, 0.6, 0.07]} />
      {leaves.map((l, i) => (
        <Shape key={i} geo={g.ico} mat={l.dark ? m.leafDark : m.leaf} position={l.p} scale={l.s} />
      ))}
    </group>
  );
}

/** Lounge: a yellow sofa and a small round table on the coral rug. */
export function Lounge({ room }: { room: RoomLayout }) {
  const { m, g } = useRoomKit();
  const r = room.loungeRug;
  const sofaW = Math.min(3.2, r.w * 0.6);
  return (
    <group position={[r.x, 0, r.z]}>
      <group position={[0, 0, -r.d / 2 + 1.1]}>
        <Box mat={m.sofa} position={[0, 0.25, 0]} scale={[sofaW, 0.4, 0.95]} />
        <Box mat={m.sofa} position={[0, 0.6, -0.38]} scale={[sofaW, 0.75, 0.22]} />
        {[-1, 1].map(s => (
          <Box key={s} mat={m.sofa} position={[(s * (sofaW - 0.22)) / 2, 0.42, 0]} scale={[0.22, 0.45, 0.95]} />
        ))}
        {[-1, 1].map(s => (
          <Box key={s} mat={m.sofaCushion} position={[(s * sofaW) / 4.4, 0.5, 0.08]} scale={[sofaW / 2.4, 0.12, 0.7]} />
        ))}
      </group>
      <group position={[0.2, 0, 0.6]}>
        <Shape geo={g.disc} mat={m.tableWood} position={[0, 0.45, 0]} scale={[1.0, 0.06, 1.0]} />
        <Cyl mat={m.metal} position={[0, 0.22, 0]} scale={[0.06, 0.44, 0.06]} />
        <Shape geo={g.disc} mat={m.metal} position={[0, 0.02, 0]} scale={[0.5, 0.04, 0.5]} />
      </group>
      <Plant position={[r.w / 2 - 0.7, 0, -r.d / 2 + 0.7]} size={0.8} seed={5} />
    </group>
  );
}

/** A simple low-poly chair facing `yaw` (forward is +z before turning). */
function MeetingChair({ position, yaw, mat }: { position: V3; yaw: number; mat: THREE.Material }) {
  const { m } = useRoomKit();
  return (
    <group position={position} rotation-y={yaw}>
      <Box mat={mat} position={[0, 0.46, 0]} scale={[0.5, 0.08, 0.5]} />
      <Box mat={mat} position={[0, 0.78, -0.23]} scale={[0.5, 0.55, 0.07]} />
      <Cyl mat={m.metal} position={[0, 0.22, 0]} scale={[0.05, 0.44, 0.05]} />
      <Box mat={m.metal} position={[0, 0.02, 0]} scale={[0.5, 0.04, 0.08]} />
      <Box mat={m.metal} position={[0, 0.02, 0]} scale={[0.08, 0.04, 0.5]} />
    </group>
  );
}

/** Round wooden meeting table with chairs, inside the teal ring. */
export function MeetingCorner({ room }: { room: RoomLayout }) {
  const { m, g } = useRoomKit();
  const t = room.meeting;
  const tableR = t.radius * 0.45;
  const seats = 5;
  return (
    <group position={[t.x, 0, t.z]}>
      <Shape geo={g.disc} mat={m.tableWood} position={[0, 0.74, 0]} scale={[tableR * 2, 0.08, tableR * 2]} />
      <Cyl mat={m.metal} position={[0, 0.37, 0]} scale={[0.12, 0.74, 0.12]} />
      <Shape geo={g.disc} mat={m.metal} position={[0, 0.02, 0]} scale={[0.9, 0.04, 0.9]} />
      {Array.from({ length: seats }, (_, i) => {
        const a = (i / seats) * Math.PI * 2 + 0.4;
        const r = tableR + 0.55;
        return (
          <MeetingChair
            key={i}
            position={[Math.sin(a) * r, 0, Math.cos(a) * r]}
            yaw={a + Math.PI}
            mat={i % 2 ? m.white : m.chairTeal}
          />
        );
      })}
      <Box mat={m.white} position={[0.3, 0.8, 0.1]} scale={[0.32, 0.02, 0.24]} />
    </group>
  );
}

/** Bookshelf with coloured books against the west glass, on a timber panel with two framed prints above. */
export function Library({ room }: { room: RoomLayout }) {
  const { m, books, pictures } = useRoomKit();
  const L = room.library;
  const shelves = 4;
  const rows = useMemo(() => {
    const rnd = seeded(17);
    const out: { z: number; y: number; h: number; w: number; c: number; lean: number }[] = [];
    for (let s = 0; s < shelves; s++) {
      let z = -L.w / 2 + 0.25;
      while (z < L.w / 2 - 0.3) {
        const w = 0.07 + rnd() * 0.06;
        if (rnd() < 0.12) z += 0.25;
        out.push({ z, y: 0.12 + s * 0.48, h: 0.26 + rnd() * 0.12, w, c: Math.floor(rnd() * 5), lean: 0 });
        z += w + 0.01;
      }
    }
    return out;
  }, [L.w]);
  return (
    <group position={[L.x, 0, L.z]} rotation-y={Math.PI / 2}>
      <Box mat={m.shelf} position={[0, 1.6, -0.18]} scale={[L.w + 0.6, 3.2, 0.08]} />
      <group position={[0, 0, 0.1]}>
        <Box mat={m.slatDark} position={[0, 1.0, -0.17]} scale={[L.w, 2.0, 0.04]} />
        {[-1, 1].map(s => (
          <Box key={s} mat={m.shelf} position={[(s * L.w) / 2, 1.0, 0]} scale={[0.06, 2.0, 0.38]} />
        ))}
        {Array.from({ length: shelves + 1 }, (_, i) => (
          <Box key={i} mat={m.shelf} position={[0, 0.08 + i * 0.48, 0]} scale={[L.w, 0.05, 0.38]} />
        ))}
        {rows.map((b, i) => (
          <Box key={i} mat={books[b.c]!} position={[b.z, b.y + b.h / 2, 0.02]} scale={[b.w, b.h, 0.26]} />
        ))}
      </group>
      {pictures.map((p, i) => (
        <group key={i} position={[(i ? 1 : -1) * L.w * 0.24, 2.55, -0.1]}>
          <Box mat={m.frame} position={[0, 0, 0]} scale={[0.82, 0.98, 0.04]} />
          <mesh material={asMat(p)} position={[0, 0, 0.025]}>
            <planeGeometry args={[0.7, 0.86]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** A water cooler and a filing cabinet against the back glass. */
export function Utilities({ room }: { room: RoomLayout }) {
  const { m } = useRoomKit();
  const x = room.leadRug.x + room.leadRug.w / 2 - 0.6;
  const z = -room.depth / 2 + 0.55;
  return (
    <group position={[x, 0, z]}>
      <group>
        <Box mat={m.white} position={[0, 0.55, 0]} scale={[0.45, 1.1, 0.42]} />
        <Cyl mat={m.water} position={[0, 1.33, 0]} scale={[0.3, 0.46, 0.3]} />
        <Box mat={m.cabinetLine} position={[0, 0.85, 0.215]} scale={[0.2, 0.05, 0.02]} />
      </group>
      <group position={[-0.95, 0, 0]}>
        <Box mat={m.cabinet} position={[0, 0.66, 0]} scale={[0.6, 1.32, 0.55]} />
        {[0.32, 0.74, 1.12].map(y => (
          <Box key={y} mat={m.cabinetLine} position={[0, y, 0.28]} scale={[0.2, 0.035, 0.02]} />
        ))}
        <Plant position={[0, 1.32, 0]} size={0.35} seed={8} />
      </group>
    </group>
  );
}

export function Plants({ room }: { room: RoomLayout }) {
  return (
    <group>
      {room.plants.map((p, i) => (
        <Plant key={i} position={[p.x, 0, p.z]} size={p.size} seed={i + 1} />
      ))}
    </group>
  );
}
