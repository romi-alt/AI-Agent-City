// @ts-nocheck
// Extra life for the Fast Sales floor: soft contact shadows under the furniture, dust drifting in the daylight,
// steam rising from the coffee, and a cool glow from the monitors on the desks once the light drops. Everything is
// generated in code (no downloads) and plugs into the office through its `extras` list.
import * as THREE from 'three';

const DESKS = [
  [-1.5, -4.2, 2.4],
  [3.6, -4.2, 2.4],
  [8.7, -4.2, 2.4],
  [-1.5, 1.0, 2.4],
  [3.6, 1.0, 2.4],
  [8.7, 1.0, 2.4],
  [-10.2, -3.2, 3.2],
  [-6.2, -7.4, 3.0],
];

function softTexture(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, col] of stops) r.addColorStop(at, col);
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FloorLife {
  isFloorLife = true;

  constructor(office, root) {
    this.office = office;
    this.mobile = office.mobile;
    this.group = new THREE.Group();
    root.add(this.group);
    this.tex = [];
    this._shadows();
    this._dust();
    this._steam();
    this._glow();
    this._sun();
  }

  _tex(size, stops) {
    const t = softTexture(size, stops);
    this.tex.push(t);
    return t;
  }

  /** Dark, soft ellipses on the floor: furniture stops looking like it floats. */
  _shadows() {
    const map = this._tex(128, [
      [0, 'rgba(34,24,16,0.8)'],
      [0.5, 'rgba(34,24,16,0.38)'],
      [1, 'rgba(40,30,22,0)'],
    ]);
    const mat = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    const spots = [
      ...DESKS.map(([x, z, w]) => [x, z, w * 1.5, 3.1]),
      ...DESKS.map(([x, z, w]) => [x, z + 1.25, 1.5, 1.4]), // the chair at each desk
      [11.4, 6.6, 4.8, 4.8], // meeting table
      [-5.4, 4.9, 4.6, 3.4], // huddle benches
      [-3.0, 8.4, 5.2, 2.4], // reception desk
    ];
    for (const [x, z, w, d] of spots) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.014, z);
      m.scale.set(w, d, 1);
      m.renderOrder = 1;
      this.group.add(m);
    }
    this.shadowMat = mat;
  }

  /** Specks of dust turning slowly in the room, lit by the day. */
  _dust() {
    const n = this.mobile ? 50 : 120;
    const pos = new Float32Array(n * 3);
    this.dustSeed = [];
    for (let i = 0; i < n; i++) {
      const s = {
        x: (Math.random() - 0.5) * 28,
        y: 0.6 + Math.random() * 3.8,
        z: (Math.random() - 0.5) * 18,
        p: Math.random() * 6.28,
      };
      this.dustSeed.push(s);
      pos.set([s.x, s.y, s.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMat = new THREE.PointsMaterial({
      map: this._tex(32, [
        [0, 'rgba(255,244,220,1)'],
        [0.4, 'rgba(255,238,200,0.5)'],
        [1, 'rgba(255,238,200,0)'],
      ]),
      size: 0.09,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(geo, this.dustMat);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  /** Wisps rising from the coffee machine and the mugs at the meeting table. */
  _steam() {
    const map = this._tex(64, [
      [0, 'rgba(255,255,255,0.9)'],
      [0.5, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    this.steam = [];
    const sources = [
      [-12.25, 1.2, -10.0],
      [-12.0, 1.2, -10.0],
      [11.0, 0.95, 6.3],
      [11.9, 0.95, 6.9],
    ];
    const per = this.mobile ? 2 : 4;
    for (const [x, y, z] of sources) {
      for (let k = 0; k < per; k++) {
        const mat = new THREE.SpriteMaterial({ map, transparent: true, opacity: 0, depthWrite: false });
        const s = new THREE.Sprite(mat);
        s.position.set(x, y, z);
        this.group.add(s);
        this.steam.push({ s, x, y, z, k: k / per, speed: 0.22 + Math.random() * 0.08, drift: Math.random() * 6.28 });
      }
    }
  }

  /** The monitors light the desks from above once the day is over. */
  _glow() {
    const map = this._tex(128, [
      [0, 'rgba(150,190,255,0.8)'],
      [0.6, 'rgba(120,160,255,0.25)'],
      [1, 'rgba(120,160,255,0)'],
    ]);
    this.glowMat = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    for (const [x, z, w] of DESKS) {
      const m = new THREE.Mesh(geo, this.glowMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.8, z - 0.05);
      m.scale.set(w * 0.8, 0.9, 1);
      m.renderOrder = 3;
      this.group.add(m);
    }
  }

  /** Daylight coming through the glass wall lands on the floor in long warm patches. */
  _sun() {
    const map = this._tex(128, [
      [0, 'rgba(255,236,190,0.95)'],
      [0.55, 'rgba(255,226,170,0.5)'],
      [1, 'rgba(255,220,160,0)'],
    ]);
    this.sunMat = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    this.sun = [];
    for (let i = 0; i < (this.mobile ? 4 : 7); i++) {
      const m = new THREE.Mesh(geo, this.sunMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = 0.38;
      m.position.set(-12 + i * 4.3, 0.018, -6.2 + (i % 2) * 0.8);
      m.scale.set(2.6, 6.2, 1);
      m.renderOrder = 2;
      this.group.add(m);
      this.sun.push(m);
    }
  }

  setTimeOfDay(tod) {
    this.tod = tod;
    const day = tod === 'day';
    this.shadowMat.opacity = day ? 0.9 : tod === 'evening' ? 0.75 : 0.6;
    this.dustMat.opacity = day ? 0.55 : tod === 'evening' ? 0.4 : 0.12;
    this.glowMat.opacity = day ? 0 : tod === 'evening' ? 0.18 : 0.34;
    this.sunMat.opacity = day ? 0.3 : tod === 'evening' ? 0.34 : 0;
    this.sunMat.color.set(tod === 'evening' ? '#ff9a5a' : '#ffffff');
  }

  update(dt, t) {
    // the patches shimmer very slightly, as clouds and leaves outside pass in front of the sun
    for (let i = 0; i < this.sun.length; i++) this.sun[i].scale.y = 6.2 + Math.sin(t * 0.2 + i * 1.7) * 0.25;
    const a = this.dust.geometry.attributes.position;
    for (let i = 0; i < this.dustSeed.length; i++) {
      const s = this.dustSeed[i];
      a.setXYZ(
        i,
        s.x + Math.sin(t * 0.07 + s.p) * 0.7,
        s.y + Math.sin(t * 0.11 + s.p * 2) * 0.25,
        s.z + Math.cos(t * 0.06 + s.p) * 0.6,
      );
    }
    a.needsUpdate = true;
    for (const w of this.steam) {
      const f = (t * w.speed + w.k) % 1;
      w.s.position.set(
        w.x + Math.sin(t * 0.9 + w.drift + f * 4) * 0.05 * f,
        w.y + f * 0.75,
        w.z + Math.cos(t * 0.7 + w.drift) * 0.04 * f,
      );
      w.s.scale.setScalar(0.12 + f * 0.34);
      w.s.material.opacity = Math.sin(f * Math.PI) * 0.3;
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse(o => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    this.tex.forEach(t => t.dispose());
  }
}
