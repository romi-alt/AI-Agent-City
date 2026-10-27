import * as THREE from 'three';
import { crosswalkTexture } from './textures';
import { bakedVehicle, Batcher, flat, PERSON, personColors, VEHICLE_LENGTH, type VehicleKind } from './meshes';

/**
 * Street life for the city view: traffic lights on a fixed cycle, cars that drive on the right, keep
 * their distance and stop at red lights, and pedestrians who walk the sidewalks and wait at the curb
 * for their walk signal. Roads run along x (at each `roadsZ`) and along z (at each `roadsX`).
 */

export interface StreetGrid { roadsX: number[]; roadsZ: number[]; reach: number; walkX: number; walkZ: number }

type Light = 'g' | 'y' | 'r';
const CYCLE = 16;
/** Cars driving along x get green first, then cars driving along z. */
function lights(t: number): { x: Light; z: Light } {
  const p = t % CYCLE;
  if (p < 6.5) return { x: 'g', z: 'r' };
  if (p < 8) return { x: 'y', z: 'r' };
  if (p < 14.5) return { x: 'r', z: 'g' };
  return { x: 'r', z: 'y' };
}

const ROAD_HALF = 2;
const LANE = 1;
const SIDEWALK = 2.7;
/** Where a car's front stops: behind the crosswalk that sits just outside the junction. */
const STOP_FRONT = SIDEWALK + 0.7;

interface Mover { axis: 'x' | 'z'; dir: 1 | -1; s: number; v: number; v0: number }
interface Car extends Mover { obj: THREE.Group; len: number; lane: number }
/** A pedestrian: `at` is the sidewalk line, `off` a small sideways offset so people don't overlap. */
interface Walker extends Mover { phase: number; at: number; off: number }

/** Pedestrians are drawn as one instanced batch per body part. */
const PARTS = ['legL', 'legR', 'armL', 'armR', 'torso', 'head', 'hair'] as const;
type Part = (typeof PARTS)[number];

const UP = new THREE.Vector3(0, 1, 0);
const LAMP_OFF = new THREE.MeshStandardMaterial({ color: '#222' });
/** Pedestrians are a touch larger than life so they read from the default camera height. */
const SCALE = new THREE.Vector3(1.05, 1.05, 1.05);
const PAINT = ['#e74c3c', '#2e86de', '#ecf0f1', '#2d3436', '#27ae60', '#8e44ad', '#e67e22', '#c0392b', '#16a085', '#7f8c8d', '#0abde3', '#ff6b81'];
const KINDS: VehicleKind[] = ['sedan', 'sedan', 'suv', 'taxi', 'sedan', 'van', 'suv', 'taxi', 'bus'];

export class Street {
  root = new THREE.Group();
  private cars: Car[] = [];
  private lanes: Car[][] = [];
  private walkers: Walker[] = [];
  private crowd = {} as Record<Part, THREE.InstancedMesh>;
  private lamps: { mat: THREE.MeshStandardMaterial; axis: 'x' | 'z'; color: Light }[] = [];
  private grid: StreetGrid;

  constructor(grid: StreetGrid) {
    this.grid = grid;
    this.junctions();
    this.traffic();
    this.people();
  }

  /** Junction squares (so lane markings don't cross), zebra crossings and traffic lights, merged into a few meshes. */
  private junctions() {
    const { roadsX, roadsZ } = this.grid;
    const batch = new Batcher();
    const plain = flat('#4c5157', { roughness: 0.95 });
    const zebra = new THREE.MeshStandardMaterial({ map: crosswalkTexture(), transparent: true, roughness: 0.9, depthWrite: false });
    const pole = flat('#2f3439');
    const housing = flat('#1d2124');
    const square = new THREE.PlaneGeometry(ROAD_HALF * 2, ROAD_HALF * 2);
    const stripe = new THREE.PlaneGeometry(ROAD_HALF * 2, 1.1);
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6);
    const boxGeo = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    const lampGeo = new THREE.SphereGeometry(0.09, 8, 8);
    // One batch per (direction, colour), each with its own material so the whole set lights up together.
    const lampBatch = new Map<string, Batcher>();
    const flatDown: [number, number, number] = [-Math.PI / 2, 0, 0];
    for (const x of roadsX) for (const z of roadsZ) {
      batch.add(square, plain, [x, 0.035, z], flatDown);
      // Four crossings around the junction.
      for (const side of [-1, 1]) {
        batch.add(stripe, zebra, [x, 0.04, z + side * SIDEWALK], flatDown);
        batch.add(stripe, zebra, [x + side * SIDEWALK, 0.04, z], [-Math.PI / 2, 0, Math.PI / 2]);
      }
      // Two signal posts on opposite corners: one shows the x-traffic light, the other the z-traffic light.
      for (const [cx, cz, axis] of [[x + 3.3, z + 3.3, 'x'], [x - 3.3, z - 3.3, 'z']] as const) {
        batch.add(poleGeo, pole, [cx, 1.3, cz]);
        batch.add(boxGeo, housing, [cx, 2.75, cz]);
        (['r', 'y', 'g'] as Light[]).forEach((c, i) => {
          const key = axis + c;
          if (!lampBatch.has(key)) lampBatch.set(key, new Batcher());
          lampBatch.get(key)!.add(lampGeo, LAMP_OFF, [cx + (axis === 'z' ? 0.16 : 0), 3.0 - i * 0.24, cz + (axis === 'x' ? 0.16 : 0)]);
        });
      }
    }
    this.root.add(batch.build());
    for (const [key, b] of lampBatch) {
      const c = key[1] as Light;
      const mat = new THREE.MeshStandardMaterial({ color: '#222', emissive: c === 'r' ? '#ff3030' : c === 'y' ? '#ffc400' : '#2bff6a', emissiveIntensity: 0 });
      const group = b.build(false);
      for (const m of group.children as THREE.Mesh[]) m.material = mat;
      this.root.add(group);
      this.lamps.push({ mat, axis: key[0] as 'x' | 'z', color: c });
    }
  }

  /** Three or four vehicles per lane, both directions, on every road. */
  private traffic() {
    const { roadsX, roadsZ, reach } = this.grid;
    let n = 0;
    const lane = (axis: 'x' | 'z', at: number, dir: 1 | -1) => {
      const cars: Car[] = [];
      const count = 3 + (n % 2);
      for (let i = 0; i < count; i++, n++) {
        const kind = KINDS[n % KINDS.length]!;
        const obj = bakedVehicle(kind, PAINT[(n * 5) % PAINT.length]!);
        const v0 = kind === 'bus' ? 4.5 : 6 + ((n * 7) % 5) * 0.7;
        const c: Car = { obj, axis, dir, s: -reach + ((i + (n % 3) * 0.3) / count) * reach * 2, v: v0, v0, len: VEHICLE_LENGTH[kind], lane: at };
        obj.rotation.y = axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        cars.push(c);
        this.cars.push(c);
        this.root.add(obj);
      }
      this.lanes.push(cars);
    };
    // Drive on the right: along +x the right-hand side is +z; along +z it is -x.
    for (const z of roadsZ) { lane('x', z + LANE, 1); lane('x', z - LANE, -1); }
    for (const x of roadsX) { lane('z', x - LANE, 1); lane('z', x + LANE, -1); }
  }

  /** Pedestrians on both sidewalks of every road, drawn as instanced body parts. */
  private people() {
    const { roadsX, roadsZ, walkX, walkZ } = this.grid;
    let n = 0;
    const line = (axis: 'x' | 'z', at: number, reach: number, count: number) => {
      for (let i = 0; i < count; i++, n++) {
        const dir: 1 | -1 = (n * 7) % 2 ? 1 : -1;
        const v0 = 0.9 + ((n * 13) % 7) * 0.12;
        this.walkers.push({ axis, dir, s: -reach + ((i + ((n * 3) % 5) / 5) / count) * reach * 2, v: v0, v0, phase: n, at, off: (((n * 11) % 5) - 2) * 0.12 });
      }
    };
    for (const z of roadsZ) for (const side of [-1, 1]) line('x', z + side * SIDEWALK, walkX, 9);
    for (const x of roadsX) for (const side of [-1, 1]) line('z', x + side * SIDEWALK, walkZ, 6);

    const total = this.walkers.length;
    const geo: Record<Part, THREE.BufferGeometry> = { legL: PERSON.leg, legR: PERSON.leg, armL: PERSON.arm, armR: PERSON.arm, torso: PERSON.torso, head: PERSON.head, hair: PERSON.hair };
    const colour: Record<Part, 'pants' | 'shirt' | 'skin' | 'hair'> = { legL: 'pants', legR: 'pants', armL: 'shirt', armR: 'shirt', torso: 'shirt', head: 'skin', hair: 'hair' };
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const c = new THREE.Color();
    for (const part of PARTS) {
      const m = new THREE.InstancedMesh(geo[part], mat, total);
      m.frustumCulled = false;
      this.walkers.forEach((_, i) => m.setColorAt(i, c.set(personColors(i)[colour[part]])));
      this.crowd[part] = m;
      this.root.add(m);
    }
  }

  update(dt: number, t: number) {
    const L = lights(t);
    for (const { mat, axis, color } of this.lamps) mat.emissiveIntensity = L[axis] === color ? 2.4 : 0;
    this.drive(dt, L);
    this.walk(dt, t, L);
    this.flushCrowd();
  }

  private drive(dt: number, L: { x: Light; z: Light }) {
    const { roadsX, roadsZ, reach } = this.grid;
    for (const lane of this.lanes) {
      // Order cars front to back so each one can look at the car ahead.
      lane.sort((a, b) => (b.s - a.s) * b.dir);
      lane.forEach((c, i) => {
        let target = c.v0;
        const ahead = i > 0 ? lane[i - 1]! : lane[lane.length - 1]!;
        if (ahead !== c) {
          let gap = (ahead.s - c.s) * c.dir;
          if (gap < 0) gap += reach * 2;
          gap -= (ahead.len + c.len) / 2;
          if (gap < 1.2) target = 0;
          else if (gap < 6) target = Math.min(target, ahead.v + (gap - 1.2) * 1.2);
        }
        // Nearest junction ahead: stop at its line unless the light is green (or amber and too close to stop).
        const light = L[c.axis];
        if (light !== 'g') {
          const crossings = c.axis === 'x' ? roadsX : roadsZ;
          for (const j of crossings) {
            const stopAt = j - c.dir * (STOP_FRONT + c.len / 2);
            const d = (stopAt - c.s) * c.dir;
            if (d < -0.05 || d > 9) continue;
            if (light === 'y' && d < 1.5) continue;
            target = Math.min(target, Math.max(0, d - 0.1) * 1.4);
          }
        }
        const dv = target - c.v;
        c.v = Math.max(0, c.v + Math.max(-14 * dt, Math.min(5 * dt, dv)));
        c.s += c.v * c.dir * dt;
        if (c.s > reach) c.s -= reach * 2;
        if (c.s < -reach) c.s += reach * 2;
        if (c.axis === 'x') c.obj.position.set(c.s, 0.03, c.lane);
        else c.obj.position.set(c.lane, 0.03, c.s);
      });
    }
  }

  private walk(dt: number, t: number, L: { x: Light; z: Light }) {
    const { roadsX, roadsZ, walkX, walkZ } = this.grid;
    for (let i = 0; i < this.walkers.length; i++) {
      const w = this.walkers[i]!;
      // People walking along x cross the z-roads, which is safe while x-traffic has green.
      const canCross = L[w.axis] === 'g';
      let target = w.v0;
      if (!canCross) {
        for (const j of w.axis === 'x' ? roadsX : roadsZ) {
          const curb = j - w.dir * (ROAD_HALF + 0.35);
          const d = (curb - w.s) * w.dir;
          if (d >= 0 && d < 0.6) target = 0;
        }
      }
      w.v += Math.max(-6 * dt, Math.min(3 * dt, target - w.v));
      w.s += w.v * w.dir * dt;
      const reach = w.axis === 'x' ? walkX : walkZ;
      if (w.s > reach) w.s -= reach * 2;
      if (w.s < -reach) w.s += reach * 2;
      // Swing arms and legs in step with speed; stand still while waiting.
      const k = w.v / w.v0;
      const step = t * 7 * w.v0 + w.phase;
      const swing = Math.sin(step) * 0.6 * k;
      const bob = Math.abs(Math.sin(step)) * 0.04 * k;
      const yaw = w.axis === 'x' ? (w.dir > 0 ? 0 : Math.PI) : (w.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      if (w.axis === 'x') this.pos.set(w.s, 0.15 + bob, w.at + w.off); else this.pos.set(w.at + w.off, 0.15 + bob, w.s);
      this.base.compose(this.pos, this.q.setFromAxisAngle(UP, yaw), SCALE);
      this.place('legL', i, PERSON.hip, -PERSON.legGap, swing);
      this.place('legR', i, PERSON.hip, PERSON.legGap, -swing);
      this.place('armL', i, PERSON.shoulder, -PERSON.armGap, -swing * 0.8);
      this.place('armR', i, PERSON.shoulder, PERSON.armGap, swing * 0.8);
      this.place('torso', i, PERSON.chest, 0, 0);
      this.place('head', i, PERSON.neck, 0, 0);
      this.place('hair', i, PERSON.crown, 0, 0);
    }
  }

  private pos = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private base = new THREE.Matrix4();
  private local = new THREE.Matrix4();
  private part = new THREE.Matrix4();

  /** One body part of pedestrian `i`: offset from the feet, then a swing about the hip or shoulder. */
  private place(p: Part, i: number, y: number, z: number, swing: number) {
    this.local.makeRotationZ(swing).setPosition(0, y, z);
    this.part.multiplyMatrices(this.base, this.local);
    this.crowd[p].setMatrixAt(i, this.part);
  }

  /** Call after every frame's walk() so the batches pick up the new positions. */
  private flushCrowd() {
    for (const p of PARTS) this.crowd[p].instanceMatrix.needsUpdate = true;
  }
}
