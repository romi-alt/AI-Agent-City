import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Builds a low-poly model as one geometry from simple parts. Each part carries a vertex colour plus integer tags
 * (`aSlot`, `aPart`) that the system's shader reads to pick paint, emissive lights or the limb a vertex moves with.
 */
export class PartBuilder {
  private parts: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private c = new THREE.Color();
  private readonly wheels: boolean;

  /** `wheels`: add the `aWheel` attribute (hub and radius; zero for non-wheel parts). */
  constructor(opts: { wheels?: boolean } = {}) {
    this.wheels = opts.wheels ?? false;
  }

  add(
    geo: THREE.BufferGeometry,
    opts: {
      at?: [number, number, number];
      rot?: [number, number, number];
      scale?: [number, number, number];
      color?: string;
      slot?: number;
      part?: number;
      /** Wheel hub centre and radius: the vertex shader spins these vertices about the hub's z axis. */
      wheel?: [number, number, number, number];
    },
  ) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()) as THREE.BufferGeometry;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const [sx, sy, sz] = opts.scale ?? [1, 1, 1];
    this.m.compose(
      new THREE.Vector3(...(opts.at ?? [0, 0, 0])),
      this.q.setFromEuler(this.e.set(...(opts.rot ?? [0, 0, 0]))),
      new THREE.Vector3(sx, sy, sz),
    );
    g.applyMatrix4(this.m);
    const n = g.getAttribute('position').count;
    this.c.set(opts.color ?? '#ffffff');
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([this.c.r, this.c.g, this.c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSlot', new THREE.BufferAttribute(new Float32Array(n).fill(opts.slot ?? 0), 1));
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(opts.part ?? 0), 1));
    if (this.wheels) {
      const w = new Float32Array(n * 4);
      if (opts.wheel) for (let i = 0; i < n; i++) w.set(opts.wheel, i * 4);
      g.setAttribute('aWheel', new THREE.BufferAttribute(w, 4));
    }
    this.parts.push(g);
    geo.dispose();
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts)!;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

/** A box whose top face is pulled in: windscreens, cabins and hoods. Insets are in world units. */
export function taperedBox(len: number, h: number, w: number, front: number, rear: number, side = 0) {
  const g = new THREE.BoxGeometry(len, h, w);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) <= 0) continue;
    const x = p.getX(i);
    p.setX(i, x > 0 ? x - front : x + rear);
    const z = p.getZ(i);
    p.setZ(i, z > 0 ? z - side : z + side);
  }
  g.computeVertexNormals();
  return g;
}

/** Dynamic per-instance attribute helper. */
export function instanceAttr(mesh: THREE.InstancedMesh, name: string, size: number) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * size), size);
  a.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute(name, a);
  return a;
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
export function hideInstance(mesh: THREE.InstancedMesh, i: number) {
  mesh.setMatrixAt(i, HIDDEN);
}

/** Composes a matrix from a ground position, a yaw (model faces +x) and optional bank/pitch and scale. */
export class Placer {
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  readonly m = new THREE.Matrix4();
  set(x: number, y: number, z: number, yaw: number, scale = 1, bank = 0, pitch = 0) {
    this.e.set(bank, yaw, pitch, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(scale, scale, scale));
    return this.m;
  }
}
