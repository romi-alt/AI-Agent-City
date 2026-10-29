/**
 * A tiny builder of vertex-coloured geometry: boxes, posts and struts placed by world position, merged into one
 * geometry that draws in one call. Used for bridges, piers and boats, which each need many parts but no instancing.
 */
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const color = new Color();

export class Kit {
  private parts: BufferGeometry[] = [];

  private add(g: BufferGeometry, hex: string): void {
    const n = g.getAttribute('position').count;
    color.set(hex);
    const rgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) rgb.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new Float32BufferAttribute(rgb, 3));
    g.deleteAttribute('uv');
    this.parts.push(g);
  }

  /** A box centred at (x, y, z) with size (sx, sy, sz), turned about y. */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: string, ry = 0): this {
    const g = new BoxGeometry(sx, sy, sz).toNonIndexed();
    q.setFromEuler(e.set(0, ry, 0));
    g.applyMatrix4(m4.compose(new Vector3(x, y, z), q, new Vector3(1, 1, 1)));
    this.add(g, hex);
    return this;
  }

  /** An upright cylinder from y0 to y1. */
  post(x: number, z: number, y0: number, y1: number, r: number, hex: string): this {
    const g = new CylinderGeometry(r, r, y1 - y0, 8, 1).toNonIndexed();
    g.translate(x, (y0 + y1) / 2, z);
    this.add(g, hex);
    return this;
  }

  /** A thin box from point a to point b (a cable, a rail, a rib segment). */
  strut(a: V3, b: V3, thick: number, hex: string): this {
    const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    if (len < 1e-6) return this;
    const g = new BoxGeometry(thick, thick, len).toNonIndexed();
    // +z of the box points along the strut.
    q.setFromUnitVectors(new Vector3(0, 0, 1), d.normalize());
    g.applyMatrix4(
      m4.compose(new Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new Vector3(1, 1, 1)),
    );
    this.add(g, hex);
    return this;
  }

  build(): BufferGeometry {
    const g = this.parts.length ? mergeGeometries(this.parts, false) : new BoxGeometry(0.001, 0.001, 0.001);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }
}
