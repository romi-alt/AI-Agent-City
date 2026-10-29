'use client';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Box, Cyl } from '../parts.tsx';
import { asGeo, asMat } from '../r3f.ts';
import { drawClock, drawContentWeek, drawCrmWall } from './art.ts';
import {
  type DetailLayout,
  detailLayout,
  type PlantSpot,
  type WallArt,
  type WallPanel,
  featureBoard,
  PANEL_DEPTH,
  shelfBooks,
} from './detail.ts';
import { type DetailKit, useDetailKit } from './detailKit.ts';
import { useRoomKit } from './kit.ts';
import { type RoomLayout } from './layout.ts';
import { GREENS, leafShape, plantLeaves } from './plants.ts';
import { useCanvasMaterial } from './Room.tsx';

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
  scale?: V3 | number;
}) {
  return <mesh geometry={asGeo(g)} material={asMat(m)} position={position} rotation={rotation} scale={scale} />;
}

/** A rounded box of the given size (centred), cached in the kit. */
function RB({
  d,
  size,
  r = 0.05,
  m,
  position,
  rotation,
}: {
  d: DetailKit;
  size: V3;
  r?: number;
  m: THREE.Material;
  position: V3;
  rotation?: V3;
}) {
  return (
    <P
      g={d.rbox(size[0], size[1], size[2], Math.min(r, size[0] / 2, size[1] / 2, size[2] / 2))}
      m={m}
      position={position}
      rotation={rotation}
    />
  );
}

const BOOK_COLOURS = ['#e8604c', '#3fb6a8', '#f5b83d', '#6aa8ff', '#b78be6', '#f2a2b8', '#26324d', '#7cc36b'];

/** The room's detail layout, computed once per room. */
export function useDetailLayout(room: RoomLayout): DetailLayout {
  return useMemo(() => detailLayout(room), [room]);
}

// ── Walls ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Wainscot, skirting and transoms on the three glass walls: a solid peach panelled band under the timber rail with
 * a cream skirting board, and a slim transom bar across the glass above head height, as in the legacy room.
 */
export function WallTrim({ room }: { room: RoomLayout }) {
  const d = useDetailKit();
  const { m: rm } = useRoomKit();
  const s = room.scale;
  const wain = d.mat('#e8b98a');
  const inset = d.mat('#efc79c');
  const skirting = d.mat('#f4eee6');
  const wh = room.railHeight - 0.05;
  const sides: { x: number; z: number; len: number; yaw: number }[] = [
    { x: 0, z: -room.depth / 2, len: room.width, yaw: 0 },
    { x: -room.width / 2, z: 0, len: room.depth, yaw: Math.PI / 2 },
    { x: room.width / 2, z: 0, len: room.depth, yaw: -Math.PI / 2 },
  ];
  return (
    <group>
      {sides.map((side, i) => {
        const n = Math.max(2, Math.round(side.len / (1.7 * s)));
        return (
          <group key={i} position={[side.x, 0, side.z]} rotation-y={side.yaw}>
            <Box mat={wain} position={[0, wh / 2, 0.075]} scale={[side.len, wh, 0.1]} />
            <Box mat={skirting} position={[0, 0.09 * s, 0.14]} scale={[side.len, 0.18 * s, 0.04]} />
            {d.level !== 'low' &&
              Array.from({ length: n }, (_, k) => (
                <Box
                  key={k}
                  mat={inset}
                  position={[-side.len / 2 + ((k + 0.5) * side.len) / n, wh * 0.56, 0.13]}
                  scale={[(side.len / n) * 0.72, wh * 0.52, 0.02]}
                />
              ))}
            {/* Transom: a bar across the glass with a short mullion above it every few bays. */}
            <Box mat={rm.post} position={[0, room.glassHeight * 0.8, 0.0]} scale={[side.len, 0.07, 0.09]} />
          </group>
        );
      })}
    </group>
  );
}

// ── Back-wall panels, screens, pictures ───────────────────────────────────────────────────────────────────────

/** A framed print on a panel. */
function Picture({ art, d }: { art: WallArt; d: DetailKit }) {
  const frame = d.mat(art.art === 'abstract' ? '#2b2f38' : '#b97e4e', { roughness: 0.6 });
  return (
    <group position={[art.x, art.y, art.z]}>
      <RB d={d} size={[art.w + 0.14, art.h + 0.14, 0.05]} r={0.015} m={frame} position={[0, 0, 0]} />
      <mesh material={asMat(d.art(art.art, art.w, art.h))} position={[0, 0, 0.03]}>
        <planeGeometry args={[art.w, art.h]} />
      </mesh>
    </group>
  );
}

/** A freestanding plaster panel in front of the back glass with a wainscot, a wood cap, a dark screen and prints. */
function Panel({ panel, d, screen, art }: { panel: WallPanel; d: DetailKit; screen: THREE.Material; art: WallArt[] }) {
  const plaster = d.mat('#f7e6cf');
  const wain = d.mat('#e8b98a');
  const wood = d.mat('#b97e4e', { roughness: 0.6 });
  const dark = d.gloss('#2b2f38');
  const wh = Math.min(1.1 * (panel.h / 4.5), 1.3);
  const sw = panel.screen.w;
  const sh = panel.screen.h;
  return (
    <group position={[panel.x, 0, panel.z]}>
      <Box mat={plaster} position={[0, panel.h / 2, 0]} scale={[panel.w, panel.h, PANEL_DEPTH]} />
      <Box mat={wain} position={[0, wh / 2, 0.02]} scale={[panel.w + 0.02, wh, PANEL_DEPTH + 0.02]} />
      <Box mat={wood} position={[0, wh, 0.03]} scale={[panel.w + 0.08, 0.06, PANEL_DEPTH + 0.1]} />
      <Box mat={wood} position={[0, panel.h + 0.03, 0.0]} scale={[panel.w + 0.1, 0.07, PANEL_DEPTH + 0.1]} />
      <RB
        d={d}
        size={[sw + 0.26, sh + 0.26, 0.1]}
        r={0.05}
        m={dark}
        position={[0, panel.screen.y, PANEL_DEPTH / 2 + 0.04]}
      />
      <mesh material={asMat(screen)} position={[0, panel.screen.y, PANEL_DEPTH / 2 + 0.095]}>
        <planeGeometry args={[sw, sh]} />
      </mesh>
      {art.map((a, i) => (
        <Picture key={i} art={{ ...a, x: a.x - panel.x, z: PANEL_DEPTH / 2 + 0.01 }} d={d} />
      ))}
    </group>
  );
}

/** The CRM pipeline wall and the content-week wall, each on its own panel beside the task board. */
export function BackPanels({ detail }: { detail: DetailLayout }) {
  const d = useDetailKit();
  const hi = d.level !== 'low';
  const crm = useCanvasMaterial(hi ? 1024 : 512, hi ? 576 : 288, g => drawCrmWall(g, hi ? 1024 : 512, hi ? 576 : 288), [
    hi,
  ]);
  const week = useCanvasMaterial(
    hi ? 1280 : 640,
    hi ? 512 : 256,
    g => drawContentWeek(g, hi ? 1280 : 640, hi ? 512 : 256),
    [hi],
  );
  return (
    <group>
      {detail.panels.map(p => (
        <Panel
          key={p.id}
          panel={p}
          d={d}
          screen={p.id === 'crm' ? crm : week}
          art={detail.art.filter(a => (p.id === 'crm' ? a.x < 0 : a.x > 0))}
        />
      ))}
    </group>
  );
}

// ── Feature wall extras: clock and ledge ──────────────────────────────────────────────────────────────────────

/** An analogue clock above the task board that shows the visitor's local time (redrawn twice a minute). */
function WallClock({ position, size }: { position: V3; size: number }) {
  const d = useDetailKit();
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }), [tex]);
  useEffect(() => {
    const draw = () => {
      const now = new Date();
      drawClock(tex.image.getContext('2d') as CanvasRenderingContext2D, 256, now.getHours(), now.getMinutes());
      tex.needsUpdate = true;
    };
    draw();
    const t = setInterval(draw, 30_000);
    return () => clearInterval(t);
  }, [tex]);
  useEffect(
    () => () => {
      tex.dispose();
      mat.dispose();
    },
    [tex, mat],
  );
  const rim = d.mat('#3a3a3a');
  return (
    <group position={position}>
      <Cyl mat={rim} position={[0, 0, 0]} rotation-x={Math.PI / 2} scale={[size * 1.04, 0.06, size * 1.04]} />
      <mesh material={asMat(mat)} position={[0, 0, 0.04]}>
        <circleGeometry args={[size / 2, 40]} />
      </mesh>
    </group>
  );
}

/**
 * The feature wall's finishing touches: the wall clock and a white ledge with a wood top under the task board,
 * holding a row of books (the plants that stand on it come from the layout's plant list).
 */
export function FeatureDetail({ room, detail }: { room: RoomLayout; detail: DetailLayout }) {
  const d = useDetailKit();
  const s = room.scale;
  const f = room.featureWall;
  const board = featureBoard(f, s);
  const ledge = detail.ledge;
  const white = d.mat('#f4eee6', { roughness: 0.6 });
  const wood = d.mat('#b97e4e', { roughness: 0.6 });
  const top = 0.84 * s;
  return (
    <group>
      <WallClock position={[f.x, board.y + board.h / 2 + 0.6 * s, f.z + 0.1]} size={0.9 * s} />
      <group position={[ledge.x, 0, ledge.z]}>
        <RB d={d} size={[ledge.w, top - 0.04, 0.55 * s]} r={0.05} m={white} position={[0, (top - 0.04) / 2, 0]} />
        <Box mat={wood} position={[0, top, 0]} scale={[ledge.w + 0.1, 0.05, 0.6 * s]} />
        {Array.from({ length: 7 }, (_, i) => (
          <Box
            key={i}
            mat={d.mat(BOOK_COLOURS[(i * 3 + 1) % BOOK_COLOURS.length]!)}
            position={[ledge.w * 0.05 + i * 0.085 * s, top + (0.3 + (i % 3) * 0.04) * s * 0.5, 0]}
            scale={[0.07 * s, (0.3 + (i % 3) * 0.04) * s, 0.26 * s]}
          />
        ))}
        {d.level === 'rich' && (
          <group position={[-ledge.w * 0.12, top, 0.05]} scale={s}>
            <Cyl mat={d.gloss('#e9ecef')} position={[0, 0.17, 0]} scale={[0.2, 0.34, 0.2]} />
            <Cyl mat={d.mat('#f5b83d')} position={[0, 0.36, 0]} scale={[0.26, 0.04, 0.26]} />
          </group>
        )}
      </group>
    </group>
  );
}

// ── Coffee corner ─────────────────────────────────────────────────────────────────────────────────────────────

/** Counter with a wood top, a coffee machine, mugs and a fruit bowl, against the back glass at the left corner. */
export function CoffeeCorner({ room, detail }: { room: RoomLayout; detail: DetailLayout }) {
  const d = useDetailKit();
  const s = room.scale;
  const c = detail.coffee;
  const white = d.mat('#f4eee6', { roughness: 0.6 });
  const wood = d.mat('#b97e4e', { roughness: 0.6 });
  const metal = d.gloss('#2b2f38');
  const rich = d.level === 'rich';
  const mugColours = ['#e8604c', '#3fb6a8', '#e8604c'];
  return (
    <group position={[c.x, 0, c.z]} scale={s}>
      <RB d={d} size={[3.0, 0.95, 0.75]} r={0.05} m={white} position={[0, 0.475, 0]} />
      <Box mat={wood} position={[0, 0.98, 0]} scale={[3.1, 0.06, 0.8]} />
      {/* Cupboard doors and pulls on the counter's front. */}
      {[-0.95, 0, 0.95].map(x => (
        <group key={x}>
          <Box mat={d.mat('#e9e1d4')} position={[x, 0.46, 0.385]} scale={[0.9, 0.78, 0.02]} />
          <Box mat={metal} position={[x, 0.78, 0.41]} scale={[0.22, 0.025, 0.03]} />
        </group>
      ))}
      {/* Espresso machine: body, drip tray, group head, a green ready light. */}
      <group position={[-0.95, 0, -0.05]}>
        <RB d={d} size={[0.5, 0.6, 0.4]} r={0.06} m={metal} position={[0, 1.31, 0]} />
        <Box mat={d.gloss('#8d949c')} position={[0, 1.04, 0.1]} scale={[0.4, 0.04, 0.2]} />
        <Box mat={d.gloss('#8d949c')} position={[0, 1.2, 0.17]} scale={[0.12, 0.1, 0.1]} />
        <Box
          mat={d.mat('#7cf0a8', { emissive: '#3ccf8e', emissiveIntensity: 0.8, key: 'ready' })}
          position={[0.15, 1.5, 0.205]}
          scale={[0.05, 0.03, 0.01]}
        />
      </group>
      {mugColours.map((col, i) => (
        <Cyl key={i} mat={d.mat(col)} position={[-0.3 + i * 0.5, 1.075, 0.2]} scale={[0.115, 0.13, 0.115]} />
      ))}
      <group position={[1.0, 1.01, 0]}>
        <P
          g={d.geo('bowl', () => new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2))}
          m={d.mat('#f6c445', { side: THREE.DoubleSide, key: 'bowl' })}
          position={[0, 0.2, 0]}
        />
        {['#e8604c', '#7cc36b', '#f29c38'].map((col, i) => (
          <P
            key={i}
            g={d.geo('fruit', () => new THREE.SphereGeometry(0.08, 10, 8))}
            m={d.mat(col)}
            position={[-0.09 + i * 0.09, 0.13, (i - 1) * 0.05]}
          />
        ))}
      </group>
      {rich && (
        <group>
          <Box mat={d.mat('#ffffff')} position={[0.35, 1.02, -0.2]} scale={[0.34, 0.04, 0.22]} />
          <Cyl mat={d.mat('#e9ecef')} position={[0.35, 1.2, -0.2]} scale={[0.16, 0.3, 0.16]} />
          <Cyl mat={d.mat('#26324d')} position={[0.35, 1.37, -0.2]} scale={[0.06, 0.04, 0.06]} />
        </group>
      )}
    </group>
  );
}

// ── Plants ────────────────────────────────────────────────────────────────────────────────────────────────────

/** A potted plant of one of four kinds (bush, snake plant, monstera, palm) in a terracotta pot. */
function PottedPlant({ spot, seed, d }: { spot: PlantSpot; seed: number; d: DetailKit }) {
  const leaves = useMemo(() => plantLeaves(spot.type, seed, d.level), [spot.type, seed, d.level]);
  const leaf = d.geo('leaf', () => new THREE.ShapeGeometry(leafShape(), 8));
  const greens = GREENS.slice(0, d.level === 'low' ? 2 : 4).map(c =>
    d.mat(c, { roughness: 0.7, side: THREE.DoubleSide, key: 'leaf' }),
  );
  const pot = d.geo('pot2', () => new THREE.CylinderGeometry(0.32, 0.24, 0.6, d.level === 'low' ? 10 : 20));
  const rim = d.geo('potrim', () => new THREE.CylinderGeometry(0.345, 0.32, 0.07, d.level === 'low' ? 10 : 20));
  const soil = d.geo('soil', () => new THREE.CircleGeometry(0.3, 12));
  return (
    <group position={[spot.x, spot.y, spot.z]} scale={spot.size}>
      <P g={pot} m={d.mat('#c96f4a')} position={[0, 0.3, 0]} />
      <P g={rim} m={d.mat('#d9835c')} position={[0, 0.595, 0]} />
      <P g={soil} m={d.mat('#4a3324')} position={[0, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      {spot.type === 'palm' && (
        <Cyl mat={d.mat('#b97e4e', { roughness: 0.6 })} position={[0, 0.95, 0]} scale={[0.1, 0.9, 0.1]} />
      )}
      {leaves.map((l, i) => (
        <P
          key={i}
          g={leaf}
          m={greens[l.green % greens.length]!}
          position={l.position}
          rotation={l.rotation}
          scale={l.scale}
        />
      ))}
    </group>
  );
}

/** All the room's plants (the legacy room's four kinds, at the spots the layout gives). */
export function DetailPlants({ detail }: { detail: DetailLayout }) {
  const d = useDetailKit();
  return (
    <group>
      {detail.plants.map((p, i) => (
        <PottedPlant key={i} spot={p} seed={i + 1} d={d} />
      ))}
    </group>
  );
}

// ── Reception ─────────────────────────────────────────────────────────────────────────────────────────────────

/** A floor lamp: dark base and pole, a warm lit shade, and a soft pool of light on the floor under it. */
function FloorLamp({ x, z, scale, d }: { x: number; z: number; scale: number; d: DetailKit }) {
  const metal = d.gloss('#2b2f38');
  const shade = d.mat('#f7e0b8', {
    roughness: 0.8,
    side: THREE.DoubleSide,
    emissive: '#ffc070',
    emissiveIntensity: 0.55,
    key: 'shade',
  });
  const bulb = d.mat('#fff4d6', { emissive: '#ffe2a8', emissiveIntensity: 1, key: 'bulb' });
  return (
    <group position={[x, 0, z]} scale={scale}>
      <Cyl mat={metal} position={[0, 0.025, 0]} scale={[0.5, 0.05, 0.5]} />
      <Cyl mat={metal} position={[0, 0.9, 0]} scale={[0.05, 1.8, 0.05]} />
      <P
        g={d.geo('shade', () => new THREE.CylinderGeometry(0.22, 0.38, 0.42, 24, 1, true))}
        m={shade}
        position={[0, 1.95, 0]}
      />
      <P g={d.geo('bulb', () => new THREE.SphereGeometry(0.1, 10, 8))} m={bulb} position={[0, 1.85, 0]} />
      {d.level !== 'low' && (
        <mesh material={asMat(d.pool)} position={[0, 0.035, 0.2]} rotation={[-Math.PI / 2, 0, 0]} scale={[2.6, 2.6, 1]}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      )}
    </group>
  );
}

/** Reception: a mustard sofa with two cushions, a round wood coffee table with books and a mug, a floor lamp. */
export function Reception({ room, detail }: { room: RoomLayout; detail: DetailLayout }) {
  const d = useDetailKit();
  const s = room.scale;
  const r = room.loungeRug;
  const sofa = d.mat('#e2a63b', { roughness: 0.9 });
  const wood = d.mat('#b97e4e', { roughness: 0.6 });
  const dark = d.gloss('#2b2f38');
  const rich = d.level === 'rich';
  const sofaW = Math.min(3.6, (r.w / s) * 0.62);
  const half = sofaW / 2;
  return (
    <group>
      <group position={[r.x, 0, r.z]} scale={s}>
        {/* The sofa stands at the back of the rug facing the room: seat, back, two arms, seat cushions. */}
        <group position={[0, 0, -r.d / s / 2 + 1.0]}>
          <RB d={d} size={[sofaW, 0.5, 1.1]} r={0.15} m={sofa} position={[0, 0.35, 0.05]} />
          <RB d={d} size={[sofaW, 0.9, 0.32]} r={0.14} m={sofa} position={[0, 0.85, -0.45]} />
          {[-1, 1].map(k => (
            <RB key={k} d={d} size={[0.32, 0.75, 1.1]} r={0.12} m={sofa} position={[k * (half - 0.16), 0.5, 0.05]} />
          ))}
          {[-1, 1].map(k => (
            <RB
              key={k}
              d={d}
              size={[half - 0.3, 0.16, 0.85]}
              r={0.07}
              m={d.mat('#eab04a', { roughness: 0.9, key: 'seat' })}
              position={[(k * (half - 0.3)) / 2 - 0.0, 0.66, 0.1]}
            />
          ))}
          <RB
            d={d}
            size={[0.6, 0.5, 0.18]}
            r={0.08}
            m={d.mat('#3fb6a8', { roughness: 0.9 })}
            position={[-half * 0.5, 0.92, -0.2]}
            rotation={[-0.25, 0, 0.06]}
          />
          <RB
            d={d}
            size={[0.6, 0.5, 0.18]}
            r={0.08}
            m={d.mat('#e8604c', { roughness: 0.9 })}
            position={[half * 0.5, 0.92, -0.2]}
            rotation={[-0.25, 0, -0.08]}
          />
          {rich && (
            <RB
              d={d}
              size={[0.7, 0.04, 0.5]}
              r={0.02}
              m={d.mat('#26324d')}
              position={[half * 0.75, 0.77, 0.15]}
              rotation={[0, 0.3, 0]}
            />
          )}
        </group>
        {/* Coffee table in front of the sofa. */}
        <group position={[0.1, 0, 0.5]}>
          <Cyl mat={wood} position={[0, 0.45, 0]} scale={[1.5, 0.06, 1.5]} />
          <P
            g={d.geo('tleg', () => new THREE.CylinderGeometry(0.08, 0.2, 0.42, 12))}
            m={dark}
            position={[0, 0.21, 0]}
          />
          {[0, 1, 2].map(i => (
            <Box
              key={i}
              mat={d.mat(BOOK_COLOURS[(i * 3 + 1) % BOOK_COLOURS.length]!)}
              position={[-0.1, 0.505 + i * 0.07, 0]}
              rotation-y={(i - 1) * 0.25}
              scale={[0.5, 0.07, 0.36]}
            />
          ))}
          <Cyl mat={d.mat('#e8604c')} position={[0.38, 0.52, 0.2]} scale={[0.12, 0.13, 0.12]} />
        </group>
      </group>
      <FloorLamp x={detail.lamps[0]!.x} z={detail.lamps[0]!.z} scale={s} d={d} />
      <FloorLamp x={detail.lamps[1]!.x} z={detail.lamps[1]!.z} scale={s} d={d} />
    </group>
  );
}

// ── Meeting corner ────────────────────────────────────────────────────────────────────────────────────────────

/** A task chair for the meeting table: rounded seat and back, a post and a star base. */
function RoundChair({ d, colour }: { d: DetailKit; colour: string }) {
  const seat = d.mat(colour, { roughness: 0.7 });
  const dark = d.gloss('#2b2f38');
  const legs = d.level === 'low' ? 3 : 5;
  return (
    <group>
      <RB d={d} size={[0.62, 0.12, 0.6]} r={0.05} m={seat} position={[0, 0.5, 0]} />
      <RB d={d} size={[0.6, 0.66, 0.1]} r={0.05} m={seat} position={[0, 0.92, 0.3]} rotation={[-0.1, 0, 0]} />
      <Cyl mat={dark} position={[0, 0.26, 0]} scale={[0.07, 0.42, 0.07]} />
      {Array.from({ length: legs }, (_, i) => {
        const a = (i / legs) * Math.PI * 2;
        return (
          <Box
            key={i}
            mat={dark}
            position={[Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15]}
            rotation-y={a}
            scale={[0.05, 0.035, 0.3]}
          />
        );
      })}
    </group>
  );
}

/** An open laptop (aluminium base and lid with a dark screen) for the meeting table. */
function Laptop({ d, rotation, position }: { d: DetailKit; rotation: number; position: V3 }) {
  const alu = d.gloss('#d7dbe0');
  return (
    <group position={position} rotation-y={rotation}>
      <RB d={d} size={[0.46, 0.025, 0.32]} r={0.01} m={alu} position={[0, 0.012, 0]} />
      <group position={[0, 0.025, 0.15]} rotation-x={0.28}>
        <RB d={d} size={[0.46, 0.3, 0.018]} r={0.008} m={alu} position={[0, 0.15, 0]} />
        <mesh
          position={[0, 0.15, -0.011]}
          rotation-y={Math.PI}
          material={asMat(d.mat('#1b2533', { emissive: '#2a4a78', emissiveIntensity: 0.45, key: 'lap' }))}
        >
          <planeGeometry args={[0.42, 0.26]} />
        </mesh>
      </group>
    </group>
  );
}

/** The round meeting table: wood top with a beveled rim, a pedestal, teal chairs, a laptop, mugs and a small plant. */
export function MeetingDetail({ room }: { room: RoomLayout }) {
  const d = useDetailKit();
  const s = room.scale;
  const t = room.meeting;
  const wood = d.mat('#d9a86c', { roughness: 0.6 });
  const dark = d.gloss('#2b2f38');
  const r = t.table / s;
  const seats = 5;
  const rich = d.level === 'rich';
  const green = d.mat('#4ea457', { roughness: 0.7, key: 'meetplant' });
  return (
    <group position={[t.x, 0, t.z]} scale={s}>
      <mesh
        material={asMat(d.rug('meeting', 1))}
        position={[0, 0.016, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[(t.radius / s) * 2 - 0.15, (t.radius / s) * 2 - 0.15, 1]}
      >
        <planeGeometry args={[1, 1]} />
      </mesh>
      <Cyl mat={wood} position={[0, 0.78, 0]} scale={[r * 2, 0.08, r * 2]} />
      <Cyl mat={d.mat('#c4905a')} position={[0, 0.745, 0]} scale={[r * 1.9, 0.03, r * 1.9]} />
      <P
        g={d.geo('pedestal', () => new THREE.CylinderGeometry(0.1, 0.35, 0.78, 16))}
        m={dark}
        position={[0, 0.39, 0]}
      />
      {Array.from({ length: seats }, (_, i) => {
        const a = (i / seats) * Math.PI * 2 + 0.4;
        const rr = r + 0.62;
        return (
          <group key={i} position={[Math.sin(a) * rr, 0, Math.cos(a) * rr]} rotation-y={a}>
            <RoundChair d={d} colour={i % 2 ? '#f6f3ee' : '#3fb6a8'} />
          </group>
        );
      })}
      <Laptop d={d} rotation={0.6} position={[-0.35, 0.82, 0.3]} />
      <Box mat={d.mat('#ffffff')} position={[0.4, 0.83, 0.1]} rotation-y={-0.3} scale={[0.34, 0.025, 0.24]} />
      <Box mat={d.mat('#26324d')} position={[0.4, 0.85, 0.1]} rotation-y={-0.3} scale={[0.3, 0.02, 0.2]} />
      {rich && (
        <group>
          <Cyl mat={d.mat('#e8604c')} position={[0.05, 0.89, -0.45]} scale={[0.11, 0.12, 0.11]} />
          <Cyl mat={d.mat('#f5b83d')} position={[-0.6, 0.89, -0.2]} scale={[0.11, 0.12, 0.11]} />
        </group>
      )}
      <group position={[0.05, 0.82, 0.55]} scale={0.3}>
        <Cyl mat={d.mat('#c96f4a')} position={[0, 0.3, 0]} scale={[0.55, 0.6, 0.55]} />
        {[0, 1, 2, 3, 4].map(i => (
          <P
            key={i}
            g={d.geo('ico', () => new THREE.IcosahedronGeometry(0.5, 0))}
            m={green}
            position={[Math.sin(i * 1.3) * 0.3, 0.75 + (i % 3) * 0.15, Math.cos(i * 1.3) * 0.3]}
            scale={0.7}
          />
        ))}
      </group>
    </group>
  );
}

// ── Library ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The bookshelf wall on the west glass: timber frame and panel, four rows of books (varied heights, gaps, a few
 * leaning), small objects between them (a globe, a framed photo, a basket), a plant on top, and two framed prints.
 */
export function LibraryDetail({ room }: { room: RoomLayout }) {
  const d = useDetailKit();
  const { m: rm, pictures } = useRoomKit();
  const L = room.library;
  const s = room.scale;
  const rows = 4;
  const rowH = 0.55 * s;
  const H = rows * rowH + 0.1;
  const books = useMemo(() => shelfBooks(17, L.w, rows, rowH, BOOK_COLOURS.length), [L.w, rowH]);
  const rich = d.level === 'rich';
  const dark = d.gloss('#2b2f38');
  return (
    <group position={[L.x, 0, L.z]} rotation-y={Math.PI / 2}>
      <Box mat={rm.shelf} position={[0, 1.6 * s, -0.18]} scale={[L.w + 0.6, 3.2 * s, 0.08]} />
      <group position={[0, 0, 0.1]}>
        <Box mat={rm.slatDark} position={[0, H / 2, -0.17]} scale={[L.w, H, 0.04]} />
        {[-1, 1].map(k => (
          <Box key={k} mat={rm.shelf} position={[(k * L.w) / 2, H / 2, 0]} scale={[0.06, H, 0.38]} />
        ))}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <Box key={i} mat={rm.shelf} position={[0, 0.05 + i * rowH, 0]} scale={[L.w, 0.05, 0.38]} />
        ))}
        <Box mat={rm.shelf} position={[0, H + 0.03, 0]} scale={[L.w + 0.12, 0.06, 0.42]} />
        <group position={[-L.w / 2, 0, 0]}>
          {books.map((b, i) => (
            <Box
              key={i}
              mat={d.mat(BOOK_COLOURS[b.colour % (d.level === 'low' ? 3 : BOOK_COLOURS.length)]!)}
              position={[b.x, 0.075 + b.row * rowH + b.h / 2, 0.02]}
              rotation-z={b.lean}
              scale={[b.w, b.h, b.d]}
            />
          ))}
        </group>
        {rich && (
          <group>
            <group position={[L.w * 0.3, 0.075 + 2 * rowH, 0.02]}>
              <P
                g={d.geo('globe', () => new THREE.SphereGeometry(0.13, 16, 12))}
                m={d.mat('#6aa8ff')}
                position={[0, 0.2, 0]}
              />
              <Cyl mat={dark} position={[0, 0.04, 0]} scale={[0.14, 0.06, 0.14]} />
            </group>
            <group position={[-L.w * 0.25, 0.075 + 3 * rowH, 0.04]}>
              <Box mat={d.mat('#4a3a2e')} position={[0, 0.13, 0]} scale={[0.28, 0.24, 0.03]} rotation-y={0.15} />
              <Box mat={d.mat('#f6e3c4')} position={[0, 0.13, 0.02]} scale={[0.22, 0.18, 0.01]} rotation-y={0.15} />
            </group>
            <Cyl mat={d.mat('#c9a27a')} position={[L.w * 0.12, 0.075 + rowH + 0.12, 0.04]} scale={[0.34, 0.2, 0.3]} />
          </group>
        )}
      </group>
      {pictures.map((p, i) => (
        <group key={i} position={[(i ? 1 : -1) * L.w * 0.24, H + 0.65 * s, -0.1]}>
          <Box mat={rm.frame} position={[0, 0, 0]} scale={[0.82, 0.98, 0.04]} />
          <mesh material={asMat(p)} position={[0, 0, 0.025]}>
            <planeGeometry args={[0.7, 0.86]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Printer on a stand, water cooler and a filing cabinet along the east glass. */
export function OfficeUtilities({ room, detail }: { room: RoomLayout; detail: DetailLayout }) {
  const d = useDetailKit();
  const s = room.scale;
  const white = d.mat('#f4eee6', { roughness: 0.6 });
  const light = d.mat('#e9ecef', { roughness: 0.5 });
  const dark = d.gloss('#2b2f38');
  const rich = d.level === 'rich';
  const jug = d.mat('#7fc7e9', { transparent: true, opacity: 0.7, roughness: 0.1, key: 'jug', depthWrite: false });
  const { printer, cooler, cabinet } = detail;
  return (
    <group>
      <group position={[printer.x, 0, printer.z]} rotation-y={printer.yaw} scale={s}>
        <RB d={d} size={[1.0, 0.7, 0.8]} r={0.04} m={white} position={[0, 0.35, 0]} />
        <RB d={d} size={[0.9, 0.5, 0.7]} r={0.06} m={light} position={[0, 0.95, 0]} />
        <Box mat={dark} position={[0, 1.12, 0.2]} scale={[0.5, 0.04, 0.2]} />
        <Box mat={d.mat('#ffffff')} position={[0, 1.22, -0.1]} rotation-x={-0.4} scale={[0.5, 0.02, 0.32]} />
        <Box
          mat={d.mat('#3ccf8e', { emissive: '#3ccf8e', emissiveIntensity: 0.7, key: 'ok' })}
          position={[0.3, 1.08, 0.355]}
          scale={[0.05, 0.03, 0.01]}
        />
        {rich && <Box mat={d.mat('#ffffff')} position={[0, 0.75, 0.3]} scale={[0.5, 0.02, 0.2]} />}
      </group>
      <group position={[cooler.x, 0, cooler.z]} rotation-y={cooler.yaw} scale={s}>
        <RB d={d} size={[0.5, 1.0, 0.5]} r={0.06} m={d.mat('#f4f4f4', { roughness: 0.5 })} position={[0, 0.5, 0]} />
        <P g={d.geo('jug', () => new THREE.CylinderGeometry(0.2, 0.2, 0.5, 16))} m={jug} position={[0, 1.25, 0]} />
        <Box mat={d.mat('#3b8fd9')} position={[-0.1, 0.82, 0.255]} scale={[0.07, 0.07, 0.04]} />
        <Box mat={d.mat('#e8604c')} position={[0.1, 0.82, 0.255]} scale={[0.07, 0.07, 0.04]} />
        <Box mat={dark} position={[0, 0.62, 0.2]} scale={[0.3, 0.03, 0.18]} />
      </group>
      <group position={[cabinet.x, 0, cabinet.z]} rotation-y={cabinet.yaw} scale={s}>
        <RB d={d} size={[0.6, 1.2, 0.55]} r={0.03} m={d.mat('#d5dadf', { roughness: 0.5 })} position={[0, 0.6, 0]} />
        {[0.28, 0.6, 0.92].map(y => (
          <Box key={y} mat={d.mat('#9aa3ab')} position={[0, y, 0.285]} scale={[0.22, 0.035, 0.02]} />
        ))}
      </group>
    </group>
  );
}

/** Every piece of the room's detail, in one group (the room shell, rugs and desks are drawn elsewhere). */
export function RoomDetail({ room, detail }: { room: RoomLayout; detail: DetailLayout }) {
  return (
    <group>
      <WallTrim room={room} />
      <BackPanels detail={detail} />
      <FeatureDetail room={room} detail={detail} />
      <CoffeeCorner room={room} detail={detail} />
      <Reception room={room} detail={detail} />
      <MeetingDetail room={room} />
      <LibraryDetail room={room} />
      <OfficeUtilities room={room} detail={detail} />
      <DetailPlants detail={detail} />
    </group>
  );
}
