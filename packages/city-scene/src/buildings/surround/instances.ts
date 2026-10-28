/**
 * Turns the surround plan into instanced meshes: one draw per ring for the facades, one for all cornice caps, one
 * for all awnings and one per roof item kind, all on shared materials. No mesh casts shadows (the sun's shadow camera
 * covers the district only); Ring 1 receives them where it is inside that camera.
 */
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { FLOOR_HEIGHT } from '../../types.ts';
import { SINK } from './facade.ts';
import { mixHex, ROOF_ITEMS, type Ring1Building, type RoofItem, type SurroundBox } from './plan.ts';
import { ROOF_GEOMETRY } from './props.ts';

/** Cornice cap on Ring 1 roofs. */
const CAP_H = 0.3;
const CAP_OVERHANG = 0.12;
/** Roof items at about legacy size relative to these narrower street-wall buildings. */
const ITEM_SCALE = 0.72;
/** Share of windows lit at night, per ring (Ring 3 brightest: it is the skyline). */
export const LIT = { ring1: 0.38, backs: 0.15, ring2: 0.32, ring3: 0.5 } as const;

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

/** A point in a building's local frame (x right, z toward its street) to world x/z. */
function local(b: SurroundBox, lx: number, lz: number): [number, number] {
  const cos = Math.cos(b.yaw);
  const sin = Math.sin(b.yaw);
  return [b.x + lx * cos + lz * sin, b.z - lx * sin + lz * cos];
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
  boxes: { list: SurroundBox[]; lit: number }[],
  baseY: number,
  name: string,
  receiveShadow: boolean,
): InstancedMesh {
  const all = boxes.flatMap(g => g.list.map(b => ({ b, lit: g.lit })));
  const mesh = new InstancedMesh(geo, material, Math.max(1, all.length));
  mesh.count = all.length;
  const facade = new Float32Array(Math.max(1, all.length) * 4);
  all.forEach(({ b, lit }, i) => {
    compose(mesh, i, [b.x, baseY - SINK, b.z], b.yaw, [b.w, b.h + SINK, b.d]);
    mesh.setColorAt(i, c.set(b.color));
    facade.set([b.style, b.shop ? 1 : 0, b.seed, lit], i * 4);
  });
  // Geometry is per ring, so the per-instance attribute can live on it.
  geo.setAttribute('aFacade', new InstancedBufferAttribute(facade, 4));
  return finish(mesh, name, receiveShadow);
}

export function capMesh(list: Ring1Building[], material: Material, baseY: number): InstancedMesh {
  const mesh = new InstancedMesh(standingBox(), material, Math.max(1, list.length));
  mesh.count = list.length;
  list.forEach((b, i) => {
    compose(mesh, i, [b.x, baseY + b.h, b.z], b.yaw, [b.w + CAP_OVERHANG * 2, CAP_H, b.d + CAP_OVERHANG * 2]);
    mesh.setColorAt(i, c.set(mixHex(b.color, '#4a403a', 0.32)));
  });
  return finish(mesh, 'surround-caps', true);
}

/** Awnings over the shopfronts: one on the front, a second on the side street for corner buildings. */
export function awningMesh(list: Ring1Building[], material: Material, baseY: number): InstancedMesh {
  const n = list.length + list.filter(b => b.sideAwning !== 0).length;
  const geo = new BoxGeometry(1, 1, 1);
  const stripes = new Float32Array(Math.max(1, n));
  const mesh = new InstancedMesh(geo, material, Math.max(1, n));
  mesh.count = n;
  const y = baseY + FLOOR_HEIGHT * 0.8;
  const depth = 0.85;
  let i = 0;
  for (const b of list) {
    const [fx, fz] = local(b, 0, b.d / 2 + depth / 2 - 0.05);
    compose(mesh, i, [fx, y, fz], b.yaw, [b.w * 0.86, 0.08, depth], 0.32);
    mesh.setColorAt(i, c.set(b.awning));
    stripes[i++] = b.stripes ? 1 : 0;
    if (b.sideAwning === 0) continue;
    const [sx, sz] = local(b, b.sideAwning * (b.w / 2 + depth / 2 - 0.05), 0);
    compose(mesh, i, [sx, y, sz], b.yaw + (b.sideAwning * Math.PI) / 2, [b.d * 0.62, 0.08, depth], 0.32);
    mesh.setColorAt(i, c.set(b.awning));
    stripes[i++] = b.stripes ? 1 : 0;
  }
  geo.setAttribute('aStripe', new InstancedBufferAttribute(stripes, 1));
  return finish(mesh, 'surround-awnings', true);
}

/** One instanced mesh per roof item kind, standing on the cornice caps. */
export function roofMeshes(list: Ring1Building[], material: Material, baseY: number): InstancedMesh[] {
  return ROOF_ITEMS.map((kind: RoofItem) => {
    const mine = list.filter(b => b.roof === kind);
    const mesh = new InstancedMesh(ROOF_GEOMETRY[kind](), material, Math.max(1, mine.length));
    mesh.count = mine.length;
    mine.forEach((b, i) => {
      const [x, z] = local(b, b.roofAt[0], b.roofAt[1]);
      const top = baseY + b.h + CAP_H;
      const size: [number, number, number] =
        kind === 'garden' ? [b.w - 0.9, 1, b.d - 0.9] : [ITEM_SCALE, ITEM_SCALE * (0.9 + b.seed * 0.25), ITEM_SCALE];
      compose(mesh, i, [x, top, z], b.yaw + (kind === 'garden' ? 0 : Math.floor(b.seed * 4) * (Math.PI / 2)), size);
    });
    return finish(mesh, `surround-roof-${kind}`, false);
  });
}
