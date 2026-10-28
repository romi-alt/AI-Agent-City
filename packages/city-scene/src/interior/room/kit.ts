'use client';
import { createContext, useContext } from 'react';
import * as THREE from 'three';
import { pictureTexture, plankFloorTexture, windowGridTexture } from '../textures.ts';

/** Pastel neighbours behind the glass: brick red, salmon, mint, candy pink, sky blue. */
export const NEIGHBOUR_COLOURS = ['#c8503f', '#e98a6b', '#8fd3a6', '#f2a2b8', '#7baad6'] as const;
const AWNING_COLOURS = ['#e9806b', '#3bb8a8', '#f2c14e', '#7baad6', '#e3a868'] as const;
const BOOK_COLOURS = ['#e9806b', '#3bb8a8', '#f2c14e', '#7baad6', '#f2a2b8'] as const;

type RoomMat =
  | 'floor'
  | 'slab'
  | 'ground'
  | 'peach'
  | 'cream'
  | 'coral'
  | 'teal'
  | 'glass'
  | 'rail'
  | 'post'
  | 'slatDark'
  | 'slatLight'
  | 'slatBack'
  | 'board'
  | 'clockFace'
  | 'clockRim'
  | 'sofa'
  | 'sofaCushion'
  | 'tableWood'
  | 'metal'
  | 'white'
  | 'chairTeal'
  | 'pot'
  | 'potLight'
  | 'leaf'
  | 'leafDark'
  | 'trunk'
  | 'shelf'
  | 'frame'
  | 'water'
  | 'cabinet'
  | 'cabinetLine'
  | 'roof'
  | 'cornice';

/** Materials, textures and geometries of the reference-look room, created once per office and disposed with it. */
export interface RoomKit {
  m: Record<RoomMat, THREE.Material>;
  facades: THREE.Material[];
  awnings: THREE.Material[];
  books: THREE.Material[];
  pictures: THREE.Material[];
  g: Record<'ico' | 'pot' | 'ring' | 'disc', THREE.BufferGeometry>;
  dispose(): void;
}

/** Matte, flat-coloured material: the toy-like diorama look (no gloss, no metal). */
function matte(color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
}

export function createRoomKit(widthM: number, depthM: number): RoomKit {
  const plank = plankFloorTexture([widthM / 7, depthM / 7]);
  const grids = NEIGHBOUR_COLOURS.map(c => windowGridTexture(c));
  const prints = [1, 2].map(pictureTexture);
  const m: RoomKit['m'] = {
    floor: matte('#ffffff', { map: plank }),
    slab: matte('#e8dccb'),
    ground: matte('#ece6db'),
    peach: matte('#e3a868'),
    cream: matte('#f3ede2'),
    coral: matte('#e9806b'),
    teal: matte('#3bb8a8', { side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({
      color: '#d8eefa',
      roughness: 0.1,
      metalness: 0,
      transparent: true,
      opacity: 0.17,
      depthWrite: false,
    }),
    rail: matte('#c9a27a'),
    post: matte('#efe7da'),
    slatDark: matte('#b9824f'),
    slatLight: matte('#d2a06c'),
    slatBack: matte('#8f6038'),
    board: matte('#121a24', { roughness: 0.6 }),
    clockFace: matte('#fbf8f2'),
    clockRim: matte('#3a3a3a'),
    sofa: matte('#f2c14e'),
    sofaCushion: matte('#f6cf6b'),
    tableWood: matte('#d9a86c'),
    metal: matte('#5b6168', { roughness: 0.6 }),
    white: matte('#f6f3ee'),
    chairTeal: matte('#3bb8a8'),
    pot: matte('#c0623b'),
    potLight: matte('#efe6d8'),
    leaf: matte('#5fae58', { flatShading: true }),
    leafDark: matte('#4c9a4f', { flatShading: true }),
    trunk: matte('#7a5434'),
    shelf: matte('#d2a06c'),
    frame: matte('#4a3a2e'),
    water: matte('#9ccbe9', { roughness: 0.4 }),
    cabinet: matte('#d5dadf'),
    cabinetLine: matte('#9aa3ab'),
    roof: matte('#8a7767'),
    cornice: matte('#f7f1e6'),
  };
  const facades = grids.map(t => matte('#ffffff', { map: t }));
  const awnings = AWNING_COLOURS.map(c => matte(c));
  const books = BOOK_COLOURS.map(c => matte(c));
  const pictures = prints.map(t => matte('#ffffff', { map: t }));
  const g: RoomKit['g'] = {
    ico: new THREE.IcosahedronGeometry(0.5, 0),
    pot: new THREE.CylinderGeometry(0.5, 0.38, 1, 10),
    ring: new THREE.RingGeometry(0.88, 1, 56),
    disc: new THREE.CylinderGeometry(0.5, 0.5, 1, 28),
  };
  return {
    m,
    facades,
    awnings,
    books,
    pictures,
    g,
    dispose() {
      for (const t of [plank, ...grids, ...prints]) t.dispose();
      for (const mat of [...Object.values(m), ...facades, ...awnings, ...books, ...pictures]) mat.dispose();
      for (const geo of Object.values(g)) geo.dispose();
    },
  };
}

export const RoomKitContext = createContext<RoomKit | null>(null);
export function useRoomKit(): RoomKit {
  const k = useContext(RoomKitContext);
  if (!k) throw new Error('Room parts must be rendered inside the reference-look office.');
  return k;
}
