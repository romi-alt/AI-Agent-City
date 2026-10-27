'use client';
import { createContext, useContext } from 'react';
import * as THREE from 'three';
import { carpetTexture, grainTexture, stoneTexture, woodFloorTexture } from './textures.ts';

/** Shared materials and geometries for one office, created once and disposed with it. */
export interface OfficeKit {
  m: Record<
    | 'wood'
    | 'stone'
    | 'carpet'
    | 'oak'
    | 'walnut'
    | 'white'
    | 'ceiling'
    | 'concrete'
    | 'coreCap'
    | 'metalDark'
    | 'metalLight'
    | 'mullion'
    | 'spandrel'
    | 'glass'
    | 'glassTint'
    | 'felt'
    | 'fabricSand'
    | 'fabricCoral'
    | 'fabricNavy'
    | 'fabricGrey'
    | 'leaf'
    | 'leafDark'
    | 'pot'
    | 'soil'
    | 'screenOff'
    | 'lightPanel'
    | 'warmLight'
    | 'counter'
    | 'paint'
    | 'rubber'
    | 'skin1'
    | 'skin2'
    | 'skin3'
    | 'hair'
    | 'shirtAi'
    | 'shirtHuman'
    | 'trousers'
    | 'halo'
    | 'accent',
    THREE.Material
  >;
  g: Record<'box' | 'cyl' | 'sphere' | 'plane' | 'capsule' | 'chairBack' | 'leaf', THREE.BufferGeometry>;
  dispose(): void;
}

export function createKit(widthM: number, depthM: number, accent: string, carColor: string): OfficeKit {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
  const textures = [
    woodFloorTexture([widthM / 6, depthM / 6]),
    stoneTexture([widthM / 4.8, depthM / 4.8]),
    carpetTexture([widthM / 2.4, depthM / 2.4]),
    grainTexture('#d9bd93', [1, 1], 'rgba(120,80,40,0.12)'),
    grainTexture('#6a4430', [2, 1]),
    stoneTexture([1, 1], '#f1ede6', 0),
  ];
  const [wood, stone, carpet, oak, walnut, counter] = textures;
  const m: OfficeKit['m'] = {
    wood: std({ map: wood!, roughness: 0.48, metalness: 0 }),
    stone: std({ map: stone!, roughness: 0.18, metalness: 0.02 }),
    carpet: std({ map: carpet!, roughness: 0.95 }),
    oak: std({ map: oak!, roughness: 0.5 }),
    walnut: std({ map: walnut!, roughness: 0.55 }),
    white: std({ color: '#f4f2ee', roughness: 0.75 }),
    ceiling: std({ color: '#f7f6f3', roughness: 0.9, side: THREE.FrontSide }),
    concrete: std({ color: '#8d8a86', roughness: 0.9 }),
    coreCap: std({ color: '#3a3f47', roughness: 0.8 }),
    metalDark: std({ color: '#2b2f35', roughness: 0.38, metalness: 0.7 }),
    metalLight: std({ color: '#c8ccd2', roughness: 0.28, metalness: 0.85 }),
    mullion: std({ color: '#4a5059', roughness: 0.35, metalness: 0.6 }),
    spandrel: std({ color: '#6b7380', roughness: 0.45, metalness: 0.4 }),
    glass: std({
      color: '#cfe8f3',
      roughness: 0.04,
      metalness: 0.1,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    glassTint: std({ color: '#1a2330', roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.85 }),
    felt: std({ color: '#2f6f6a', roughness: 1 }),
    fabricSand: std({ color: '#d9ccb6', roughness: 0.95 }),
    fabricCoral: std({ color: '#e9785a', roughness: 0.9 }),
    fabricNavy: std({ color: '#26334a', roughness: 0.85 }),
    fabricGrey: std({ color: '#5e6670', roughness: 0.9 }),
    leaf: std({ color: '#5b9a5b', roughness: 0.7, flatShading: true }),
    leafDark: std({ color: '#3d7444', roughness: 0.75, flatShading: true }),
    pot: std({ color: '#c9c3b8', roughness: 0.85 }),
    soil: std({ color: '#3a2c22', roughness: 1 }),
    screenOff: std({ color: '#0e1218', roughness: 0.15, metalness: 0.4 }),
    lightPanel: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4dc', emissiveIntensity: 1.6 }),
    warmLight: new THREE.MeshStandardMaterial({ color: '#ffe7b8', emissive: '#ffd27a', emissiveIntensity: 2.2 }),
    counter: std({ map: counter!, roughness: 0.22 }),
    paint: std({ color: carColor, roughness: 0.22, metalness: 0.65 }),
    rubber: std({ color: '#16181b', roughness: 0.9 }),
    skin1: std({ color: '#e2b593', roughness: 0.7 }),
    skin2: std({ color: '#b98262', roughness: 0.7 }),
    skin3: std({ color: '#7d5440', roughness: 0.7 }),
    hair: std({ color: '#2d2420', roughness: 0.8 }),
    shirtAi: std({ color: '#2b8f9c', roughness: 0.7 }),
    shirtHuman: std({ color: '#e9b04a', roughness: 0.75 }),
    trousers: std({ color: '#2a3140', roughness: 0.85 }),
    halo: new THREE.MeshBasicMaterial({ color: '#7fe3ec', transparent: true, opacity: 0.85 }),
    accent: std({ color: accent, roughness: 0.6 }),
  };
  // Unit shapes, scaled per mesh: one geometry each for every box, cylinder, sphere and plane in the office.
  const back = new THREE.CylinderGeometry(0.34, 0.34, 0.5, 18, 1, true, -0.75, 1.5);
  const leaf = new THREE.SphereGeometry(0.5, 7, 5);
  leaf.scale(0.35, 0.06, 1);
  const g: OfficeKit['g'] = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
    sphere: new THREE.SphereGeometry(0.5, 18, 14),
    plane: new THREE.PlaneGeometry(1, 1),
    capsule: new THREE.CapsuleGeometry(0.5, 1, 4, 12),
    chairBack: back,
    leaf,
  };
  return {
    m,
    g,
    dispose() {
      for (const t of textures) t.dispose();
      for (const mat of Object.values(m)) mat.dispose();
      for (const geo of Object.values(g)) geo.dispose();
    },
  };
}

export const KitContext = createContext<OfficeKit | null>(null);
export function useKit(): OfficeKit {
  const k = useContext(KitContext);
  if (!k) throw new Error('Office furniture must be rendered inside an office.');
  return k;
}
