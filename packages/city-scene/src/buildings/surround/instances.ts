/**
 * Turns the surround plan into instanced meshes: one draw per ring for the facades, one for all cornice caps, one
 * for all awnings and one per roof item kind, all on shared materials. No mesh casts shadows (the sun's shadow camera
 * covers the district only); Ring 1 receives them where it is inside that camera.
 */
import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  SphereGeometry,
  Color,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { SINK } from './facade.ts';
import { type Awning, mixHex, ROOF_ITEMS, type RoofItem, type RoofSpot, type Spire, type SurroundBox } from './plan.ts';
import { ROOF_GEOMETRY } from './props.ts';

/** Cornice cap on Ring 1 roofs. */
const CAP_H = 0.3;
const CAP_OVERHANG = 0.12;

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const p = new Vector3();
const s = new Vector3();
const c = new Color();

function compose(
  mesh: InstancedMesh,
  i: number,
  at: [number, number, number],
  yaw: number,
  size: [number, number, number],
  tilt = 0,
) {
  q.setFromEuler(e.set(tilt, yaw, 0, 'YXZ'));
  mesh.setMatrixAt(i, m4.compose(p.set(...at), q, s.set(...size)));
}

function finish(mesh: InstancedMesh, name: string, receiveShadow: boolean): InstancedMesh {
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = receiveShadow;
  mesh.matrixAutoUpdate = false;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
  return mesh;
}

/** Unit box standing on y = 0: what the facade shader expects. */
export function standingBox(): BufferGeometry {
  return new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
}

/** The buildings of one ring as a single instanced draw with the facade material. */
export function facadeMesh(
  geo: BufferGeometry,
  material: Material,
  lists: SurroundBox[][],
  name: string,
  receiveShadow: boolean,
  baseY = 0,
): InstancedMesh {
  const all = lists.flat();
  const mesh = new InstancedMesh(geo, material, Math.max(1, all.length));
  mesh.count = all.length;
  const facade = new Float32Array(Math.max(1, all.length) * 4);
  all.forEach((b, i) => {
    compose(mesh, i, [b.x, baseY + b.y0 - SINK, b.z], b.yaw, [b.w, b.h + SINK, b.d]);
    mesh.setColorAt(i, c.set(b.color));
    facade.set([b.style, b.shop ? 1 : b.flood ? 2 : 0, b.seed, b.lit], i * 4);
  });
  // Geometry is per ring, so the per-instance attribute can live on it.
  geo.setAttribute('aFacade', new InstancedBufferAttribute(facade, 4));
  return finish(mesh, name, receiveShadow);
}

/** Cornices: a slightly wider slab on top of every box that carries one. */
export function capMesh(lists: SurroundBox[][], material: Material, baseY: number): InstancedMesh {
  const list = lists.flat().filter(b => b.cap);
  const mesh = new InstancedMesh(standingBox(), material, Math.max(1, list.length));
  mesh.count = list.length;
  list.forEach((b, i) => {
    compose(mesh, i, [b.x, baseY + b.y0 + b.h - 0.04, b.z], b.yaw, [
      b.w + CAP_OVERHANG * 2,
      CAP_H,
      b.d + CAP_OVERHANG * 2,
    ]);
    mesh.setColorAt(i, c.set(mixHex(b.color, '#4a403a', 0.3)));
  });
  return finish(mesh, 'surround-caps', true);
}

/** Awnings over the shopfronts (and over the side street of corner lots). */
export function awningMesh(list: Awning[], material: Material, baseY: number): InstancedMesh {
  const geo = new BoxGeometry(1, 1, 1);
  const stripes = new Float32Array(Math.max(1, list.length));
  const mesh = new InstancedMesh(geo, material, Math.max(1, list.length));
  mesh.count = list.length;
  const depth = 0.85;
  list.forEach((a, i) => {
    const sin = Math.sin(a.yaw);
    const cos = Math.cos(a.yaw);
    compose(mesh, i, [a.x + (depth / 2) * sin, baseY + a.y, a.z + (depth / 2) * cos], a.yaw, [a.w, 0.08, depth], 0.32);
    mesh.setColorAt(i, c.set(a.color));
    stripes[i] = a.stripes ? 1 : 0;
  });
  geo.setAttribute('aStripe', new InstancedBufferAttribute(stripes, 1));
  return finish(mesh, 'surround-awnings', true);
}

/** One instanced mesh per roof item kind (water tank, AC units, bulkhead, antenna). */
export function roofMeshes(list: RoofSpot[], material: Material, baseY: number): InstancedMesh[] {
  return ROOF_ITEMS.map((kind: RoofItem) => {
    const mine = list.filter(b => b.kind === kind);
    const mesh = new InstancedMesh(ROOF_GEOMETRY[kind](), material, Math.max(1, mine.length));
    mesh.count = mine.length;
    mine.forEach((b, i) => compose(mesh, i, [b.x, baseY + b.y, b.z], b.yaw, [b.scale, b.scale, b.scale]));
    return finish(mesh, `surround-roof-${kind}`, false);
  });
}

/** Needles and masts: one tapered cylinder per spire, standing on its crown. */
export function spireMesh(list: Spire[], material: Material, baseY: number): InstancedMesh {
  const geo = new CylinderGeometry(0.12, 1, 1, 6).translate(0, 0.5, 0);
  const mesh = new InstancedMesh(geo, material, Math.max(1, list.length));
  mesh.count = list.length;
  list.forEach((sp, i) => compose(mesh, i, [sp.x, baseY + sp.y, sp.z], 0, [sp.r, sp.h, sp.r]));
  return finish(mesh, 'surround-spires', false);
}

/** Red aircraft lights on the tallest towers: one instanced draw, blinked by the material. */
export function beaconMesh(
  list: { x: number; y: number; z: number }[],
  material: Material,
  baseY: number,
): InstancedMesh {
  const mesh = new InstancedMesh(new SphereGeometry(0.34, 5, 3), material, Math.max(1, list.length));
  mesh.count = list.length;
  list.forEach((b, i) => compose(mesh, i, [b.x, baseY + b.y, b.z], 0, [1, 1, 1]));
  return finish(mesh, 'surround-beacons', false);
}
