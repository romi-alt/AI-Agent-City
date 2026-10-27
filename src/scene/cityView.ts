import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Sim } from '../core/sim';
import type { Building } from '../core/types';
import { label, type View } from './engine';
import { car, decorBuilding, facadeMaterial, flat, FLOOR_H, tree } from './meshes';
import { roadTexture } from './textures';

const ROADS_X = [-50, -30, -10, 10, 30, 50];
const ROADS_Z = [-30, -10, 10, 30];
const DECOR_COLORS = ['#f4a6a6', '#f7c873', '#a6d3f4', '#b8e0a6', '#d9b8f0', '#f6e3a1', '#9fd8cf', '#f2b8d0', '#c9d2dc', '#ef8f6b'];

export class CityView implements View {
  root = new THREE.Group();
  pickables: THREE.Object3D[] = [];
  private hoverBox: THREE.Mesh;
  private marker: THREE.Mesh;
  private cars: { obj: THREE.Object3D; axis: 'x' | 'z'; speed: number }[] = [];
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
    this.decor();
    this.traffic();

    this.hoverBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.45, depthWrite: false }));
    this.hoverBox.visible = false;
    this.marker = new THREE.Mesh(new THREE.RingGeometry(7.5, 8.3, 48), new THREE.MeshBasicMaterial({ color: '#f5b335', side: THREE.DoubleSide }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.08;
    this.marker.visible = false;
    this.root.add(this.hoverBox, this.marker);
  }

  home(cam: THREE.PerspectiveCamera, controls: OrbitControls) {
    // Look down on the Training Center from high enough that no neighbour hides it.
    controls.target.set(0, 8, 0);
    cam.position.set(46, 84, 72);
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
  }

  update(dt: number) {
    this.time += dt;
    if (this.beacon) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.4);
      (this.beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + pulse * 1.6;
      this.beacon.scale.setScalar(1 + pulse * 0.15);
    }
    if (this.beam) this.beam.rotation.y += dt * 0.4;
    for (const c of this.cars) {
      const p = c.obj.position;
      p[c.axis] += c.speed * dt;
      const lim = c.axis === 'x' ? 75 : 55;
      if (p[c.axis] > lim) p[c.axis] = -lim;
      if (p[c.axis] < -lim) p[c.axis] = lim;
    }
  }

  private ground() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), flat('#cfd3d6'));
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

    const lampGeo = new THREE.SphereGeometry(0.25, 8, 8);
    for (const x of ROADS_X) for (const z of ROADS_Z) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3), flat('#3a3f45'));
      pole.position.set(x + 2.6, 1.5, z + 2.6);
      const lamp = new THREE.Mesh(lampGeo, new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 0 }));
      lamp.position.set(x + 2.6, 3.1, z + 2.6);
      this.streetLamps.push(lamp);
      this.root.add(pole, lamp);
    }
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
      const t = tree(0.9 + ((index + tx) % 3) * 0.1);
      t.position.set(tx, 0.15, tz);
      g.add(t);
    }
    if (b.kind === 'dealership') {
      [-3, 0, 3].forEach((cx, i) => {
        const c = car([b.accent, '#ffffff', '#2d3436'][i]);
        c.position.set(cx, 0.15, 6.8);
        c.rotation.y = Math.PI / 2;
        g.add(c);
      });
    }

    const variant = 1 + (index % 3);
    b.floors.forEach(f => {
      const isTop = f.level === b.floors.length;
      const wall = b.kind === 'training' && isTop ? '#cfe8f7' : b.color;
      const mat = facadeMaterial(wall, b.w, f.vacant ? 0 : variant);
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, FLOOR_H, b.d), [mat, mat, flat(b.accent), flat(b.accent), mat, mat]);
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
      `<span class="badge" style="display:none"></span><b>${icon} ${b.short}</b><span class="sub"></span>`,
      `bsign kind-${b.kind}`, () => this.onSelect(b.id));
    sign.position.set(0, centre ? h + 18 : h + 3, 0);
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

  private decor() {
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let x = -70; x <= 70; x += 10) for (let z = -50; z <= 50; z += 10) {
      if (Math.abs(x) <= 50 && Math.abs(z) <= 30) continue;
      if (ROADS_X.includes(x) || ROADS_Z.includes(z)) continue;
      const c = DECOR_COLORS[Math.floor(rnd() * DECOR_COLORS.length)];
      const d = decorBuilding(7, 7, 3 + Math.floor(rnd() * 7), c, '#7d6b5d', Math.floor(rnd() * 10));
      d.position.set(x, 0, z);
      this.root.add(d);
    }
  }

  private traffic() {
    const colors = ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#2c3e50', '#27ae60'];
    for (let i = 0; i < 18; i++) {
      const horizontal = i % 2 === 0;
      const c = car(colors[i % colors.length]);
      const dir = i % 4 < 2 ? 1 : -1;
      if (horizontal) {
        c.position.set(-75 + i * 9, 0, ROADS_Z[i % ROADS_Z.length] + dir * 1);
        c.rotation.y = dir > 0 ? 0 : Math.PI;
      } else {
        c.position.set(ROADS_X[i % ROADS_X.length] - dir * 1, 0, -55 + i * 6);
        c.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      this.cars.push({ obj: c, axis: horizontal ? 'x' : 'z', speed: dir * (5 + (i % 5)) });
      this.root.add(c);
    }
  }
}
