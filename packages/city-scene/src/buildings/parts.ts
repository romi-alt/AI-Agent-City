import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
  Euler,
} from 'three';

/** Simple shapes placed by centre and size; instanced per (shape, material) so hundreds of details cost a few draws. */
export type Shape = 'box' | 'cyl' | 'cone' | 'pyramid' | 'sphere' | 'octa' | 'wedge';

export interface Part {
  shape: Shape;
  /** Key into the material table. */
  mat: string;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** Rotation about y (radians). */
  ry?: number;
  /** Rotation about x/z (radians), e.g. tilted awnings. */
  rx?: number;
  rz?: number;
  /** Per-instance colour (sRGB hex) for materials that use instance colours. */
  color?: string;
}

const UNIT: Record<Shape, () => BufferGeometry> = {
  box: () => new BoxGeometry(1, 1, 1),
  cyl: () => new CylinderGeometry(0.5, 0.5, 1, 10),
  cone: () => new ConeGeometry(0.5, 1, 16),
  pyramid: () => new ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
  sphere: () => new SphereGeometry(0.5, 12, 8),
  octa: () => new CylinderGeometry(0.5, 0.5, 1, 8),
  wedge: () => {
    // A box whose top slopes down to nothing along -x: the slanted crown of a tower.
    const g = new BoxGeometry(1, 1, 1).toNonIndexed();
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0 && p.getX(i) < 0) p.setY(i, -0.5);
    g.computeVertexNormals();
    return g;
  },
};

export interface PartsOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Materials whose meshes cast no shadow (glows, glass). */
  noShadow?: Set<string>;
}

/** One InstancedMesh per (shape, material) used by `parts`. */
export function buildParts(parts: Part[], materials: Record<string, Material>, opts: PartsOptions = {}): Group {
  const groups = new Map<string, Part[]>();
  for (const p of parts) {
    const k = `${p.shape}|${p.mat}`;
    const list = groups.get(k);
    if (list) list.push(p);
    else groups.set(k, [p]);
  }
  const out = new Group();
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const pos = new Vector3();
  const scl = new Vector3();
  const c = new Color();
  for (const [key, list] of groups) {
    const [shape, matKey] = key.split('|') as [Shape, string];
    const material = materials[matKey];
    if (!material) throw new Error(`No material "${matKey}" for city parts.`);
    const mesh = new InstancedMesh(UNIT[shape](), material, list.length);
    list.forEach((p, i) => {
      q.setFromEuler(e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0));
      mesh.setMatrixAt(i, m.compose(pos.set(p.x, p.y, p.z), q, scl.set(p.sx, p.sy, p.sz)));
      if (p.color) mesh.setColorAt(i, c.set(p.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const shadowless = opts.noShadow?.has(matKey);
    mesh.castShadow = !shadowless && (opts.castShadow ?? true);
    mesh.receiveShadow = opts.receiveShadow ?? true;
    mesh.computeBoundingSphere();
    mesh.name = key;
    out.add(mesh);
  }
  return out;
}

/** Disposes geometries of a parts group (materials are shared and owned by the caller). */
export function disposeParts(g: Group) {
  g.traverse(o => {
    if (o instanceof InstancedMesh) o.geometry.dispose();
  });
}
