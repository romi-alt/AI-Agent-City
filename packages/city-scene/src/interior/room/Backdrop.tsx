'use client';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Box, Plane } from '../parts.tsx';
import { asGeo, asMat } from '../r3f.ts';
import { useRoomKit } from './kit.ts';
import type { RoomLayout } from './layout.ts';

/** One facade tile (two windows wide, one storey high), in metres. */
const TILE_W = 3.5;
const STOREY = 3.2;
/** Gap between the glass and the neighbours: close, so they fill the view like the legacy floor view. */
const GAP = 3;
const BLOCK_D = 8;
const GROUND_Y = -0.38;

interface Neighbour {
  x: number;
  z: number;
  /** Turn so the building's +z face (shop front, awning) looks at the room. */
  yaw: number;
  tiles: number;
  storeys: number;
  colour: number;
}

/** A row of neighbours along one side, centred on `along`, deterministic per position. */
function row(from: number, to: number, place: (c: number) => [number, number], yaw: number, seed: number) {
  const out: Neighbour[] = [];
  let at = from;
  let i = seed;
  while (at < to) {
    const tiles = [2, 3, 2, 3, 2][i % 5]!;
    const w = tiles * TILE_W;
    const [x, z] = place(at + w / 2);
    out.push({ x, z, yaw, tiles, storeys: 4 + ((i * 7) % 3), colour: i % 5 });
    at += w + 0.35;
    i++;
  }
  return out;
}

export function neighboursFor(room: RoomLayout): Neighbour[] {
  const W = room.width;
  const D = room.depth;
  const back = -D / 2 - GAP - BLOCK_D / 2;
  const side = W / 2 + GAP + BLOCK_D / 2;
  return [
    ...row(-W / 2 - 16, W / 2 + 16, c => [c, back], 0, 0),
    ...row(-D / 2 + 1, D / 2 - 2, c => [-side, c], Math.PI / 2, 2),
    ...row(-D / 2 + 1, D / 2 - 2, c => [side, c], -Math.PI / 2, 4),
  ];
}

/**
 * Box geometry whose UVs count facade tiles, so one shared window-grid texture per colour tiles evenly across
 * buildings of any size (the static batch merges them all into one mesh per colour).
 */
function facadeBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    const across = face < 2 ? d : w;
    uv.setXY(i, (uv.getX(i) * across) / TILE_W, (uv.getY(i) * h) / STOREY);
  }
  return geo;
}

function Building({ n }: { n: Neighbour }) {
  const kit = useRoomKit();
  const w = n.tiles * TILE_W;
  const h = n.storeys * STOREY;
  const geo = useMemo(() => facadeBox(w, h, BLOCK_D), [w, h]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group position={[n.x, GROUND_Y, n.z]} rotation-y={n.yaw}>
      <mesh geometry={asGeo(geo)} material={asMat(kit.facades[n.colour]!)} position={[0, h / 2, 0]} />
      <Box mat={kit.m.cornice} position={[0, h + 0.15, 0]} scale={[w + 0.3, 0.3, BLOCK_D + 0.3]} />
      <Box mat={kit.m.roof} position={[0, h + 0.35, 0]} scale={[w + 0.1, 0.12, BLOCK_D + 0.1]} />
      {/* Shop awning over the ground floor, tilted out towards the room. */}
      <Box
        mat={kit.awnings[(n.colour + 2) % kit.awnings.length]!}
        position={[0, 2.75, BLOCK_D / 2 + 0.5]}
        rotation-x={0.35}
        scale={[w * 0.72, 0.1, 1.1]}
      />
    </group>
  );
}

/** Pastel low-rise neighbours behind the glass and a pale plaza under them, so there is never an empty void. */
export function Backdrop({ room }: { room: RoomLayout }) {
  const { m } = useRoomKit();
  const list = useMemo(() => neighboursFor(room), [room]);
  return (
    <group>
      <Plane mat={m.ground} position={[0, GROUND_Y, 0]} rotation-x={-Math.PI / 2} scale={[600, 600, 1]} />
      {list.map((n, i) => (
        <Building key={i} n={n} />
      ))}
    </group>
  );
}
