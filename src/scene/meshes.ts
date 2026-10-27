import * as THREE from 'three';
import { facadeTexture, windowGlowTexture } from './textures';

export const FLOOR_H = 1.4;

const glowMats: THREE.MeshStandardMaterial[] = [];
/** All facade materials register here so day/night can turn window glow on and off. */
export function setNightGlow(on: boolean) {
  for (const m of glowMats) m.emissiveIntensity = on ? 1.1 : 0;
}

export function facadeMaterial(wall: string, widthUnits: number, variant: number) {
  const map = facadeTexture(wall).clone();
  const glow = windowGlowTexture(variant).clone();
  const reps = Math.max(1, Math.round(widthUnits / 2.4));
  map.repeat.set(reps, 1);
  glow.repeat.set(reps, 1);
  map.needsUpdate = glow.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: new THREE.Color('#ffcf80'), emissiveIntensity: 0, roughness: 0.85 });
  glowMats.push(m);
  return m;
}

const roofMats = new Map<string, THREE.MeshStandardMaterial>();
export function flat(color: string, opts: THREE.MeshStandardMaterialParameters = {}) {
  const key = color + JSON.stringify(opts);
  let m = roofMats.get(key);
  if (!m) roofMats.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts })));
  return m;
}

/** A plain decorative mid-rise: stacked facade box + roof cap. Used for background blocks. */
export function decorBuilding(w: number, d: number, floors: number, wall: string, roof: string, seed: number) {
  const g = new THREE.Group();
  const h = floors * FLOOR_H;
  const side = facadeMaterial(wall, Math.max(w, d), 1 + (seed % 3));
  side.map!.repeat.y = floors;
  side.emissiveMap!.repeat.y = floors;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, flat(roof), flat(roof), side, side]);
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3), flat(roof));
  cap.position.y = h + 0.17;
  g.add(cap);
  if (seed % 2) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12), flat('#8a6a4a'));
    tank.position.set(w / 4, h + 0.9, -d / 4);
    g.add(tank);
  }
  return g;
}

export function tree(scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.9, 6), flat('#7a5434'));
  trunk.position.y = 0.45;
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), flat('#6fbf5f', { flatShading: true }));
  crown.position.y = 1.4;
  crown.castShadow = true;
  g.add(trunk, crown);
  g.scale.setScalar(scale);
  return g;
}

export function car(color: string) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.9), flat(color));
  body.position.y = 0.4;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 0.8), flat('#dfe9f2'));
  top.position.set(-0.1, 0.85, 0);
  g.add(body, top);
  return g;
}
