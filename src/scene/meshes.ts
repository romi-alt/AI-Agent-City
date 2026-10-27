import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FACADE_STYLES, facadeTexture, windowGlowTexture, type FacadeStyle } from './textures';

export const FLOOR_H = 1.4;

const glowMats: THREE.MeshStandardMaterial[] = [];
const nightMats: THREE.MeshStandardMaterial[] = [];
/** All facade materials and vehicle lights register here so day/night can turn their glow on and off. */
export function setNightGlow(on: boolean) {
  for (const m of glowMats) m.emissiveIntensity = on ? 1.1 : 0;
  for (const m of nightMats) m.emissiveIntensity = on ? 2.2 : 0.15;
}

export function facadeMaterial(wall: string, widthUnits: number, variant: number, style: FacadeStyle = 'classic') {
  const map = facadeTexture(wall, style).clone();
  const glow = windowGlowTexture(variant, style).clone();
  const reps = Math.max(1, Math.round(widthUnits / 2.4));
  map.repeat.set(reps, 1);
  glow.repeat.set(reps, 1);
  map.needsUpdate = glow.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({
    map, emissiveMap: glow, emissive: new THREE.Color('#ffcf80'), emissiveIntensity: 0,
    roughness: style === 'glass' || style === 'showroom' ? 0.35 : 0.85, metalness: style === 'glass' ? 0.25 : 0,
  });
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

/** A lamp, tail-light or window that glows at night and is barely lit by day. */
function lightMat(color: string) {
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15 });
  nightMats.push(m);
  return m;
}
const HEAD = lightMat('#fff3c4');
const TAIL = lightMat('#ff3b3b');

const AWNINGS = ['#e74c3c', '#2e86de', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400'];

/**
 * A decorative building for the blocks around the city: a facade in one of several styles, a shop
 * front with an awning on the ground floor, and something on the roof (garden, water tank, AC units
 * or an antenna). `seed` picks the variations deterministically.
 */
export function decorBuilding(w: number, d: number, floors: number, wall: string, roof: string, seed: number, style?: FacadeStyle) {
  const g = new THREE.Group();
  const h = floors * FLOOR_H;
  const st = style ?? FACADE_STYLES[seed % FACADE_STYLES.length]!;
  const side = facadeMaterial(wall, Math.max(w, d), 1 + (seed % 7), st);
  side.map!.repeat.y = floors;
  side.emissiveMap!.repeat.y = floors;
  // One material on all faces: the roof cap hides the top, so this draws once instead of six times.
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), side);
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3), flat(roof));
  cap.position.y = h + 0.17;
  g.add(cap);

  // Ground-floor shop: a coloured awning on two faces.
  const awning = flat(AWNINGS[seed % AWNINGS.length]!);
  const front = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.12, 0.9), awning);
  front.position.set(0, FLOOR_H * 0.85, d / 2 + 0.45);
  front.rotation.x = 0.25;
  const sideAwn = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, d * 0.6), awning);
  sideAwn.position.set(w / 2 + 0.45, FLOOR_H * 0.85, 0);
  sideAwn.rotation.z = -0.25;
  g.add(front, sideAwn);

  // Rooftop.
  const kind = seed % 4;
  if (kind === 0) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12), flat('#8a6a4a'));
    tank.position.set(w / 4, h + 0.9, -d / 4);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), flat('#5c4a3a'));
    legs.position.set(w / 4, h + 0.35, -d / 4);
    g.add(tank, legs);
  } else if (kind === 1) {
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(w - 1, 0.2, d - 1), flat('#7cc36b'));
    lawn.position.y = h + 0.45;
    g.add(lawn);
    for (const [x, z] of [[-w / 4, -d / 4], [w / 4, d / 4]]) { const t = tree(0.55); t.position.set(x, h + 0.5, z); g.add(t); }
  } else if (kind === 2) {
    for (let i = 0; i < 3; i++) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), flat('#d7dbe0'));
      ac.position.set(-w / 4 + i * 1.1, h + 0.6, d / 5);
      g.add(ac);
    }
  } else {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3, 6), flat('#9aa1a9'));
    mast.position.set(-w / 5, h + 1.8, -d / 5);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), TAIL);
    tip.position.set(-w / 5, h + 3.3, -d / 5);
    g.add(mast, tip);
  }
  return g;
}

export function tree(scale = 1, color = '#6fbf5f') {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.9, 6), flat('#7a5434'));
  trunk.position.y = 0.45;
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), flat(color, { flatShading: true }));
  crown.position.y = 1.4;
  crown.castShadow = true;
  g.add(trunk, crown);
  g.scale.setScalar(scale);
  return g;
}

export type VehicleKind = 'sedan' | 'suv' | 'taxi' | 'van' | 'bus';
export const VEHICLE_LENGTH: Record<VehicleKind, number> = { sedan: 1.8, suv: 1.9, taxi: 1.8, van: 2.1, bus: 4.6 };

const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.14, 10);
wheelGeo.rotateX(Math.PI / 2);
const WHEEL = flat('#22262b');
const GLASS = flat('#a9c7dd', { roughness: 0.2, metalness: 0.3 });

/**
 * A street vehicle facing +x, with wheels (in userData.wheels, to spin), headlights and tail-lights.
 * Buses and vans are longer; a taxi is yellow with a roof sign.
 */
export function vehicle(kind: VehicleKind, color: string) {
  const g = new THREE.Group();
  const len = VEHICLE_LENGTH[kind];
  const tall = kind === 'bus' ? 1.3 : kind === 'van' ? 0.95 : kind === 'suv' ? 0.65 : 0.5;
  const paint = flat(kind === 'taxi' ? '#f6c90e' : color, { roughness: 0.45, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, tall, 0.92), paint);
  body.position.y = 0.25 + tall / 2;
  body.castShadow = true;
  g.add(body);
  if (kind === 'bus') {
    const band = new THREE.Mesh(new THREE.BoxGeometry(len * 0.92, 0.38, 0.94), GLASS);
    band.position.y = 0.25 + tall * 0.68;
    g.add(band);
  } else if (kind !== 'van') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(len * 0.55, 0.38, 0.84), GLASS);
    cab.position.set(-len * 0.06, 0.25 + tall + 0.19, 0);
    g.add(cab);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len * 0.5, 0.06, 0.82), paint);
    roof.position.set(-len * 0.06, 0.25 + tall + 0.41, 0);
    g.add(roof);
  } else {
    const wind = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.8), GLASS);
    wind.position.set(len / 2 + 0.01, 0.25 + tall * 0.75, 0);
    g.add(wind);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.2), flat('#222222'));
    sign.position.set(-0.1, 0.25 + tall + 0.52, 0);
    g.add(sign);
  }
  for (const z of [-0.32, 0.32]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.18), HEAD);
    hl.position.set(len / 2 + 0.01, 0.25 + tall * 0.45, z);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.18), TAIL);
    tl.position.set(-len / 2 - 0.01, 0.25 + tall * 0.45, z);
    g.add(hl, tl);
  }
  const wheels: THREE.Mesh[] = [];
  const axles = kind === 'bus' ? [-len / 2 + 0.7, len / 2 - 0.8] : [-len / 2 + 0.4, len / 2 - 0.4];
  for (const x of axles) for (const z of [-0.44, 0.44]) {
    const w = new THREE.Mesh(wheelGeo, WHEEL);
    w.position.set(x, 0.2, z);
    wheels.push(w);
    g.add(w);
  }
  g.userData.wheels = wheels;
  return g;
}

/**
 * Collects fixed scenery (crossings, poles, pads, park pieces…) and merges it into one mesh per material,
 * so hundreds of small objects cost a handful of draw calls.
 */
export class Batcher {
  private byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  /** Add a shape placed at `pos` with optional rotation (radians) and scale. */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale = 1) {
    this.m.compose(new THREE.Vector3(...pos), this.q.setFromEuler(this.e.set(...rot)), new THREE.Vector3(scale, scale, scale));
    const g = geo.clone().applyMatrix4(this.m);
    const list = this.byMat.get(mat) ?? [];
    list.push(g);
    this.byMat.set(mat, list);
  }

  /** Add every mesh inside an object (e.g. a tree group) at its current world placement. */
  addObject(o: THREE.Object3D) {
    o.updateMatrixWorld(true);
    o.traverse(c => {
      if (!(c instanceof THREE.Mesh) || Array.isArray(c.material)) return;
      const g = (c.geometry as THREE.BufferGeometry).clone().applyMatrix4(c.matrixWorld);
      const list = this.byMat.get(c.material) ?? [];
      list.push(g);
      this.byMat.set(c.material, list);
    });
  }

  build(receiveShadow = true) {
    const out = new THREE.Group();
    for (const [mat, geos] of this.byMat) {
      const plain = geos.map(g => (g.index ? g.toNonIndexed() : g));
      for (const g of plain) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      const mesh = new THREE.Mesh(mergeGeometries(plain), mat);
      mesh.receiveShadow = receiveShadow;
      out.add(mesh);
    }
    return out;
  }
}

const baked = new Map<string, THREE.Group>();
const PAINTED = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 });

/**
 * The same vehicle merged into three meshes (body, headlights, tail-lights) instead of a dozen, so a
 * street full of traffic stays cheap to draw. Shapes are cached per kind and colour.
 */
export function bakedVehicle(kind: VehicleKind, color: string) {
  const key = `${kind}|${color}`;
  let src = baked.get(key);
  if (!src) {
    const g = vehicle(kind, color);
    g.updateMatrixWorld(true);
    const parts: Record<'paint' | 'head' | 'tail', THREE.BufferGeometry[]> = { paint: [], head: [], tail: [] };
    g.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const geo = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
      const bucket = o.material === HEAD ? 'head' : o.material === TAIL ? 'tail' : 'paint';
      if (bucket === 'paint') {
        const c = (o.material as THREE.MeshStandardMaterial).color;
        const n = geo.getAttribute('position').count;
        geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]!), 3));
      }
      parts[bucket].push(geo);
    });
    src = new THREE.Group();
    const body = new THREE.Mesh(mergeGeometries(parts.paint), PAINTED);
    body.castShadow = true;
    src.add(body, new THREE.Mesh(mergeGeometries(parts.head), HEAD), new THREE.Mesh(mergeGeometries(parts.tail), TAIL));
    baked.set(key, src);
  }
  const out = new THREE.Group();
  for (const m of src.children as THREE.Mesh[]) { const c = new THREE.Mesh(m.geometry, m.material); c.castShadow = m.castShadow; out.add(c); }
  return out;
}

/** Kept for parked cars on dealership lots. */
export function car(color: string) {
  return vehicle('sedan', color);
}

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673c'];
const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1', '#34495e', '#ff6b9d', '#00b894', '#fd79a8'];
const PANTS = ['#2c3e50', '#34495e', '#5d6d7e', '#1f3a5f', '#6e4b3a', '#2d2d2d', '#3d5a80'];
const HAIR = ['#2b1d14', '#5a3a22', '#111111', '#c9a26b', '#7a4a2a', '#9e9e9e'];

/** Body-part shapes for a pedestrian facing +x; limbs pivot at the hip and shoulder. Drawn as instanced batches. */
export const PERSON = (() => {
  const leg = new THREE.BoxGeometry(0.14, 0.5, 0.14); leg.translate(0, -0.25, 0);
  const arm = new THREE.BoxGeometry(0.1, 0.42, 0.1); arm.translate(0, -0.21, 0);
  const torso = new THREE.BoxGeometry(0.24, 0.5, 0.4);
  const head = new THREE.SphereGeometry(0.15, 10, 8);
  const hair = new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  return { leg, arm, torso, head, hair, hip: 0.52, shoulder: 1.0, chest: 0.77, neck: 1.18, crown: 1.2, legGap: 0.09, armGap: 0.26 };
})();

/** Deterministic clothes, skin and hair colours for pedestrian `seed`. */
export function personColors(seed: number) {
  const pick = (xs: string[], k: number) => xs[(seed * k + k) % xs.length]!;
  return { pants: pick(PANTS, 3), shirt: pick(SHIRTS, 7), skin: pick(SKIN, 5), hair: pick(HAIR, 11) };
}
