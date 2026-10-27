import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Sim } from '../core/sim';
import type { Building } from '../core/types';
import { label, type View } from './engine';
import { Batcher, car, decorBuilding, facadeMaterial, flat, FLOOR_H, tree } from './meshes';
import { Street } from './street';
import { FACADE_STYLES, roadTexture, type FacadeStyle } from './textures';

const ROADS_X = [-50, -30, -10, 10, 30, 50];
const ROADS_Z = [-30, -10, 10, 30];
/** Bright, varied walls for the blocks around the city. */
const DECOR_COLORS = ['#ff8a80', '#ffb74d', '#4fc3f7', '#81c784', '#ba68c8', '#ffd54f', '#4db6ac', '#f06292', '#7986cb', '#ff7043', '#aed581', '#90caf9', '#ce93d8', '#ffcc80'];
const TREE_GREENS = ['#6fbf5f', '#58a85a', '#8acb6a', '#4f9d63'];

export class CityView implements View {
  root = new THREE.Group();
  pickables: THREE.Object3D[] = [];
  private hoverBox: THREE.Mesh;
  private marker: THREE.Mesh;
  private street: Street;
  private clouds = new THREE.Group();
  private signs = new Map<string, HTMLElement>();
  private streetLamps: THREE.Mesh[] = [];
  /** The Training Center's crown, beacon and searchlight: the city's centrepiece. */
  private crownMat = new THREE.MeshStandardMaterial({ color: '#cfe8f7', roughness: 0.25, metalness: 0.35, emissive: new THREE.Color('#f5b335'), emissiveIntensity: 0 });
  private beacon?: THREE.Mesh;
  private beam?: THREE.Mesh;
  private time = 0;

  private sim: Sim;
  private onSelect: (buildingId: string) => void;

  constructor(sim: Sim, onSelect: (buildingId: string) => void) {
    this.sim = sim;
    this.onSelect = onSelect;
    this.ground();
    sim.buildings.forEach((b, i) => this.building(b, i));
    this.neighbours();
    this.decor();
    this.street = new Street({ roadsX: ROADS_X, roadsZ: ROADS_Z, reach: 78, walkX: 56, walkZ: 36 });
    this.root.add(this.street.root);
    this.sky();

    this.hoverBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.45, depthWrite: false }));
    this.hoverBox.visible = false;
    this.marker = new THREE.Mesh(new THREE.RingGeometry(7.5, 8.3, 48), new THREE.MeshBasicMaterial({ color: '#f5b335', side: THREE.DoubleSide }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.08;
    this.marker.visible = false;
    this.root.add(this.hoverBox, this.marker);
  }

  home(cam: THREE.PerspectiveCamera, controls: OrbitControls) {
    // Look down on the Training Center from high enough that no neighbour hides it. A client, who can't
    // see the Training Center, looks at its own first building instead.
    const at = this.sim.buildings.some(b => b.id === 'fast-sales') ? { x: 0, z: 0 } : this.sim.buildings[0] ?? { x: 0, z: 0 };
    controls.target.set(at.x, 8, at.z);
    cam.position.set(at.x + 46, 84, at.z + 72);
    controls.minDistance = 15;
    controls.maxDistance = 190;
  }

  focus(buildingId: string | undefined, cam?: THREE.PerspectiveCamera, controls?: OrbitControls) {
    const b = buildingId ? this.sim.building(buildingId) : undefined;
    this.marker.visible = !!b;
    if (!b) return;
    this.marker.position.set(b.x, 0.08, b.z);
    this.marker.scale.setScalar(Math.max(b.w, b.d) / 9);
    if (cam && controls) {
      controls.target.set(b.x, b.floors.length * FLOOR_H * 0.45, b.z);
      cam.position.set(b.x + 18, b.floors.length * FLOOR_H + 34, b.z + 42);
    }
  }

  /** Refresh building signs (agent counts / needs-you badges). */
  refresh() {
    for (const b of this.sim.buildings) {
      const el = this.signs.get(b.id);
      if (!el) continue;
      const agents = b.floors.flatMap(f => f.agents);
      const needs = agents.filter(a => a.status === 'needs-you').length;
      const free = b.floors.filter(f => f.vacant).length;
      el.querySelector('.sub')!.textContent = b.kind === 'rental'
        ? `${free} floors for rent`
        : `${agents.filter(a => a.status === 'working').length}/${agents.length} working`;
      const badge = el.querySelector<HTMLElement>('.badge')!;
      badge.textContent = String(needs);
      badge.style.display = needs ? '' : 'none';
    }
  }

  hover(obj?: THREE.Object3D) {
    const d = obj?.userData;
    if (!d?.buildingId || d.level == null) { this.hoverBox.visible = false; return; }
    const b = this.sim.building(d.buildingId);
    this.hoverBox.visible = true;
    this.hoverBox.scale.set(b.w + 0.3, FLOOR_H + 0.05, b.d + 0.3);
    this.hoverBox.position.set(b.x, (d.level - 0.5) * FLOOR_H, b.z);
  }

  setNight(night: boolean) {
    for (const l of this.streetLamps) (l.material as THREE.MeshStandardMaterial).emissiveIntensity = night ? 2 : 0;
    this.crownMat.emissiveIntensity = night ? 0.55 : 0;
    if (this.beam) this.beam.visible = night;
    this.clouds.visible = !night;
  }

  update(dt: number) {
    this.time += dt;
    if (this.beacon) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.4);
      (this.beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + pulse * 1.6;
      this.beacon.scale.setScalar(1 + pulse * 0.15);
    }
    if (this.beam) this.beam.rotation.y += dt * 0.4;
    this.street.update(dt, this.time);
    for (const c of this.clouds.children) {
      c.position.x += dt * (1.2 + (c.userData.speed as number));
      if (c.position.x > 140) c.position.x = -140;
    }
  }

  private ground() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), flat('#a9cf8e'));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);

    const road = (len: number, horizontal: boolean, at: number) => {
      const tex = roadTexture().clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, len / 4);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, len), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
      m.rotation.x = -Math.PI / 2;
      if (horizontal) m.rotation.z = Math.PI / 2;
      m.position.set(horizontal ? 0 : at, 0.03, horizontal ? at : 0);
      m.receiveShadow = true;
      this.root.add(m);
    };
    for (const x of ROADS_X) road(160, false, x);
    for (const z of ROADS_Z) road(160, true, z);

    // Street lamps halfway along each block, on both sides of the road.
    const lampGeo = new THREE.SphereGeometry(0.22, 8, 8);
    const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 0 });
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.07, 3);
    const posts = new Batcher();
    const heads = new Batcher();
    const addLamp = (x: number, z: number) => {
      posts.add(poleGeo, flat('#3a3f45'), [x, 1.5, z]);
      heads.add(lampGeo, lampMat, [x, 3.1, z]);
    };
    const mids = (roads: number[]) => roads.slice(1).map((r, i) => (r + roads[i]!) / 2);
    for (const z of ROADS_Z) for (const x of mids(ROADS_X)) for (const side of [-1, 1]) addLamp(x, z + side * 3.5);
    for (const x of ROADS_X) for (const z of mids(ROADS_Z)) for (const side of [-1, 1]) addLamp(x + side * 3.5, z);
    const lit = heads.build(false);
    this.streetLamps.push(...(lit.children as THREE.Mesh[]));
    this.root.add(posts.build(false), lit);
  }

  private building(b: Building, index: number) {
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);

    // Lot: sidewalk slab, lawn, trees and a few cars on display.
    const centre = b.kind === 'training';
    const lot = new THREE.Mesh(new THREE.BoxGeometry(16, 0.15, 16), flat(centre ? '#f1ead8' : '#e9e4da'));
    lot.position.y = 0.07;
    lot.receiveShadow = true;
    g.add(lot);
    for (const [tx, tz] of [[-6.5, 6.5], [6.5, 6.5], [-6.5, -6.5], [6.5, -6.5]]) {
      const t = tree(0.9 + ((index + tx) % 3) * 0.1, TREE_GREENS[(index + Math.abs(tx + tz)) % TREE_GREENS.length]);
      t.position.set(tx, 0.15, tz);
      g.add(t);
    }
    if (b.kind === 'dealership') {
      [-3, 0, 3].forEach((cx, i) => {
        const c = car([b.accent, '#ffffff', '#2d3436'][i]);
        c.position.set(cx, 0.15, 5.9);
        c.rotation.y = Math.PI / 2;
        g.add(c);
      });
    }

    const variant = 1 + (index % 6);
    // Each kind of building gets its own look: dealerships a glass showroom at street level.
    const style: FacadeStyle = b.kind === 'associates' ? 'ribbon' : b.kind === 'rental' ? (index % 2 ? 'brick' : 'glass') : b.kind === 'training' ? 'classic' : (['classic', 'glass', 'brick'] as const)[index % 3]!;
    b.floors.forEach(f => {
      const isTop = f.level === b.floors.length;
      const wall = b.kind === 'training' && isTop ? '#cfe8f7' : b.color;
      const floorStyle: FacadeStyle = b.kind === 'dealership' && f.level === 1 ? 'showroom' : style;
      const mat = facadeMaterial(wall, b.w, f.vacant ? 0 : variant, floorStyle);
      // One material on all faces: floors stack and the parapet caps the top, so this draws once, not six times.
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, FLOOR_H, b.d), mat);
      m.position.y = (f.level - 0.5) * FLOOR_H + 0.15;
      m.castShadow = m.receiveShadow = true;
      m.userData = { pick: true, buildingId: b.id, level: f.level };
      this.pickables.push(m);
      g.add(m);
    });

    const h = b.floors.length * FLOOR_H + 0.15;
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.4, 0.5, b.d + 0.4), flat(b.accent));
    parapet.position.y = h + 0.25;
    g.add(parapet);
    // Ground-floor entrance canopy in the brand accent.
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.6, 0.2, 1.6), flat(b.accent));
    canopy.position.set(0, FLOOR_H + 0.3, b.d / 2 + 0.8);
    g.add(canopy);

    if (centre) {
      this.landmark(g, b, h);
    } else {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 14), flat('#8a6a4a'));
      tank.position.set(b.w / 4, h + 1.3, -b.d / 4);
      g.add(tank);
    }

    const icon = b.kind === 'training' ? '🎓' : b.kind === 'rental' ? '🏢' : b.kind === 'associates' ? '👥' : '🚗';
    const sign = label(
      [{ tag: 'span', cls: 'badge', hidden: true }, { tag: 'b', text: `${icon} ${b.short}` }, { tag: 'span', cls: 'sub' }],
      `bsign kind-${b.kind}`, () => this.onSelect(b.id));
    sign.position.set(0, centre ? h + 18 : h + 3, 0);
    sign.element.style.setProperty('--b', b.accent === '#ffffff' ? b.color : b.accent);
    this.signs.set(b.id, sign.element);
    g.add(sign);
    this.root.add(g);
  }

  /**
   * Makes the Training Center the centrepiece: gold-edged plaza, gold corner columns, a rooftop terrace,
   * a stepped glass crown and a spire with a pulsing beacon that tops every other building, and a
   * searchlight at night.
   */
  private landmark(g: THREE.Group, b: Building, h: number) {
    const gold = flat('#d9a028', { metalness: 0.45, roughness: 0.35 });

    // Plaza: gold inlay along the edge of the lot and lamp posts at the corners.
    for (const [w, d, x, z] of [[16, 0.5, 0, 7.75], [16, 0.5, 0, -7.75], [0.5, 16, 7.75, 0], [0.5, 16, -7.75, 0]]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), gold);
      strip.position.set(x, 0.17, z);
      g.add(strip);
    }
    for (const [x, z] of [[-7.4, 7.4], [7.4, 7.4], [-7.4, -7.4], [7.4, -7.4]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 8), flat('#3a3f45'));
      post.position.set(x, 1.45, z);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 0 }));
      lamp.position.set(x, 2.85, z);
      this.streetLamps.push(lamp);
      g.add(post, lamp);
    }

    // Gold columns up every corner of the tower.
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.45, h + 0.3, 0.45), gold);
      col.position.set(x * (b.w / 2 + 0.05), (h + 0.3) / 2, z * (b.d / 2 + 0.05));
      col.castShadow = true;
      g.add(col);
    }

    // Rooftop terrace with planters along the front edge.
    for (let i = 0; i < 5; i++) {
      const t = tree(0.7);
      t.position.set(-5 + i * 2.5, h + 0.5, b.d / 2 - 1.2);
      g.add(t);
    }

    // Stepped glass crown.
    let top = h + 0.5;
    for (const [sx, sz, th] of [[0.62, 0.55, 2.4], [0.4, 0.36, 2.2]]) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(b.w * sx, th, b.d * sz), this.crownMat);
      tier.position.set(0, top + th / 2, -0.8);
      tier.castShadow = true;
      g.add(tier);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(b.w * sx + 0.3, 0.25, b.d * sz + 0.3), gold);
      rim.position.set(0, top + th + 0.12, -0.8);
      g.add(rim);
      top += th + 0.25;
    }

    // Spire and beacon: the highest point in the city.
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.45, 9, 12), gold);
    spire.position.set(0, top + 4.5, -0.8);
    spire.castShadow = true;
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#f5b335', emissiveIntensity: 1 }));
    this.beacon.position.set(0, top + 9.2, -0.8);
    g.add(spire, this.beacon);

    // Night searchlight sweeping up from the crown.
    const beamGeo = new THREE.ConeGeometry(4, 40, 24, 1, true);
    beamGeo.rotateX(Math.PI); // narrow end at the roof, wide end in the sky
    beamGeo.translate(0, 20, 0);
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.beam.position.set(0, top, -0.8);
    this.beam.rotation.z = 0.18;
    this.beam.visible = false;
    g.add(this.beam);
  }

  /** Other clients' buildings: plain grey shapes with no name, label or click target. */
  private neighbours() {
    for (const n of this.sim.neighbours) {
      const lot = new THREE.Mesh(new THREE.BoxGeometry(16, 0.15, 16), flat('#e1e3e6'));
      lot.position.set(n.x, 0.07, n.z);
      const shape = decorBuilding(n.w, n.d, n.floors, '#c4c9cf', '#9aa1a9', 0);
      shape.position.set(n.x, 0.15, n.z);
      this.root.add(lot, shape);
    }
  }

  private decor() {
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const ROOFS = ['#7d6b5d', '#5d6d7e', '#8d6e63', '#607d8b'];
    const scenery = new Batcher();
    const padGeo = new THREE.BoxGeometry(9, 0.12, 9);
    for (let x = -70; x <= 70; x += 10) for (let z = -50; z <= 50; z += 10) {
      if (Math.abs(x) <= 50 && Math.abs(z) <= 30) continue;
      if (ROADS_X.includes(x) || ROADS_Z.includes(z)) continue;
      const r = rnd();
      // Concrete pad under every plot.
      scenery.add(padGeo, flat('#e4e0d8'), [x, 0.06, z]);
      if (r < 0.16) { scenery.addObject(this.park(x, z, Math.floor(rnd() * 100))); continue; }
      const c = DECOR_COLORS[Math.floor(rnd() * DECOR_COLORS.length)]!;
      const style: FacadeStyle = FACADE_STYLES[Math.floor(rnd() * FACADE_STYLES.length)]!;
      const tall = style === 'glass' ? 6 + Math.floor(rnd() * 8) : 3 + Math.floor(rnd() * 7);
      const d = decorBuilding(7, 7, tall, c, ROOFS[Math.floor(rnd() * ROOFS.length)]!, Math.floor(rnd() * 100), style);
      d.position.set(x, 0.12, z);
      d.rotation.y = Math.floor(rnd() * 4) * (Math.PI / 2);
      this.root.add(d);
    }
    this.root.add(scenery.build());
  }

  /** A small park: lawn, trees, a fountain and benches (returned for batching, not added). */
  private park(x: number, z: number, seed: number) {
    const g = new THREE.Group();
    g.position.set(x, 0.12, z);
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.1, 8.4), flat('#7cc36b'));
    lawn.position.y = 0.05;
    lawn.receiveShadow = true;
    g.add(lawn);
    const path = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.11, 1.2), flat('#e8dcc4'));
    path.position.y = 0.06;
    const path2 = path.clone();
    path2.rotation.y = Math.PI / 2;
    g.add(path, path2);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.4, 20), flat('#cfd8dc'));
    basin.position.y = 0.3;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.1, 20), flat('#4fc3f7', { roughness: 0.15, metalness: 0.1 }));
    water.position.y = 0.48;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.9, 8), flat('#cfd8dc'));
    spout.position.y = 0.8;
    g.add(basin, water, spout);
    for (const [tx, tz] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [-3.3, 0.2], [3.3, -0.2]]) {
      const t = tree(0.85 + ((seed + tx) % 3) * 0.15, TREE_GREENS[(seed + Math.abs(tx * 3 + tz)) % TREE_GREENS.length]);
      t.position.set(tx, 0.1, tz);
      g.add(t);
    }
    for (const [bx, bz, ry] of [[0, 2.2, 0], [0, -2.2, Math.PI]]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.4), flat('#8d6e63'));
      bench.position.set(bx + 1.6, 0.4, bz);
      bench.rotation.y = ry;
      g.add(bench);
    }
    return g;
  }

  /** Soft low-poly clouds drifting across the sky (hidden at night). */
  private sky() {
    const puff = flat('#ffffff', { roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 + ((i + k) % 3) * 0.8, 0), puff);
        ball.position.set(k * 2.6 - 4, ((i + k) % 2) * 0.9, ((k * 7) % 3) - 1);
        c.add(ball);
      }
      c.position.set(-140 + i * 32, 58 + (i % 3) * 8, -60 + ((i * 37) % 120));
      c.userData.speed = (i % 4) * 0.4;
      this.clouds.add(c);
    }
    this.root.add(this.clouds);
  }
}
