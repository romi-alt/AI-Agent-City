// @ts-nocheck
// Four dealerships, billboards, planes and the blimp.
// Ported unchanged from the AutoSalesCity design file (three r160 code, runs on the app's three). Everything is
// generated in code: no model, texture or image downloads.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { C3 } from './city';
import { P3 } from './people';
import { N3 } from './nyc';

export const W3 = (() => {
  const { makePerson, SKIN, HAIR } = P3,
    { STREET_Y } = C3;
  // AutoSalesCity demo: dealerships, billboards, airplanes and a blimp around the Fast Sales office.
  // All brands, people and numbers here are fictional demo content.

  const DEALERS = [
    {
      id: 'aurora',
      name: 'AURORA MOTORS',
      short: 'Aurora Motors',
      tag: 'New & certified pre-owned',
      color: '#2f7cf6',
      accent: '#9cc4ff',
      pos: [42, 0],
      rot: -Math.PI / 2,
      cars: ['#e8eef7', '#1f2a44', '#c0392b', '#9aa3b2', '#2f7cf6'],
    },
    {
      id: 'vanta',
      name: 'VANTA AUTO',
      short: 'Vanta Auto',
      tag: 'Performance & luxury',
      color: '#e5484d',
      accent: '#ffb3b5',
      pos: [-42, 0],
      rot: Math.PI / 2,
      cars: ['#111317', '#e5484d', '#f2f2f2', '#3a3f4b', '#c7a76c'],
    },
    {
      id: 'summit',
      name: 'SUMMIT TRUCKS',
      short: 'Summit Trucks',
      tag: 'Trucks, SUVs & work vans',
      color: '#f08a24',
      accent: '#ffd0a1',
      pos: [72, 36],
      rot: Math.PI,
      cars: ['#f08a24', '#2d3142', '#e6e1d6', '#4f6b4a', '#8b2f2f'],
      trucks: true,
    },
    {
      id: 'volta',
      name: 'VOLTA EV',
      short: 'Volta EV',
      tag: 'All-electric showroom',
      color: '#18b67a',
      accent: '#a8f0d1',
      pos: [-72, 36],
      rot: Math.PI,
      cars: ['#f5f7fa', '#18b67a', '#5aa6e0', '#2b2f38', '#d8dde6'],
    },
  ];
  const FIRST = [
    'Daniel',
    'Priya',
    'Marcus',
    'Sofia',
    'James',
    'Lena',
    'Carlos',
    'Grace',
    'Omar',
    'Mia',
    'Ethan',
    'Nora',
    'Leo',
    'Ava',
    'Ray',
    'Zoe',
  ];
  const LASTI = ['K.', 'S.', 'T.', 'M.', 'O.', 'V.', 'D.', 'W.', 'H.', 'R.', 'B.', 'P.'];
  const MODELS = {
    aurora: ['Aurora Lumen SE', 'Aurora Vista AWD', 'Aurora Crest', 'Aurora Lumen Hybrid'],
    vanta: ['Vanta GT-R8', 'Vanta S6 Coupe', 'Vanta Noir', 'Vanta X5 Sport'],
    summit: ['Summit Ridge 2500', 'Summit Trail 4x4', 'Summit Haul Van', 'Summit Peak SUV'],
    volta: ['Volta One', 'Volta Arc', 'Volta Pulse LR', 'Volta Glide'],
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const buyer = () => pick(FIRST) + ' ' + pick(LASTI);

  function canvasTex(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { c, g: c.getContext('2d'), t };
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h);
  }
  const M = new Map();
  const mat = (color, o = {}) => {
    const k = color + JSON.stringify(o);
    if (!M.has(k)) M.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o }));
    return M.get(k);
  };

  /* ------------------------------------------------------------------ cars */
  const G = {};
  function makeCar(color, { truck = false, detail = true } = {}) {
    const g = new THREE.Group();
    const paint = mat(color, { roughness: 0.28, metalness: 0.55 });
    const glass = mat('#1b2433', { roughness: 0.08, metalness: 0.8 });
    const dark = mat('#15171c', { roughness: 0.8 });
    const L = truck ? 5.2 : 4.4,
      Wd = truck ? 2.0 : 1.86;
    const body = new THREE.Mesh(
      (G['b' + truck] ||= new RoundedBoxGeometry(L, truck ? 1.05 : 0.82, Wd, 3, 0.26)),
      paint,
    );
    body.position.y = truck ? 0.95 : 0.78;
    g.add(body);
    if (truck) {
      const cab = new THREE.Mesh((G.tcab ||= new RoundedBoxGeometry(2.1, 1.0, 1.9, 3, 0.22)), glass);
      cab.position.set(0.85, 1.9, 0);
      g.add(cab);
      const roof = new THREE.Mesh((G.troof ||= new RoundedBoxGeometry(2.0, 0.12, 1.86, 2, 0.05)), paint);
      roof.position.set(0.85, 2.42, 0);
      g.add(roof);
      const bed = new THREE.Mesh((G.bed ||= new THREE.BoxGeometry(2.3, 0.5, 1.8)), dark);
      bed.position.set(-1.35, 1.55, 0);
      g.add(bed);
    } else {
      const cab = new THREE.Mesh((G.cab ||= new RoundedBoxGeometry(2.3, 0.7, 1.66, 3, 0.3)), glass);
      cab.position.set(-0.15, 1.48, 0);
      g.add(cab);
      const roof = new THREE.Mesh((G.roof ||= new RoundedBoxGeometry(1.7, 0.1, 1.5, 2, 0.05)), paint);
      roof.position.set(-0.2, 1.84, 0);
      g.add(roof);
    }
    const wheelG = (G['w' + truck] ||= new THREE.CylinderGeometry(
      truck ? 0.48 : 0.4,
      truck ? 0.48 : 0.4,
      0.32,
      detail ? 18 : 10,
    ));
    const rimG = (G['r' + truck] ||= new THREE.CylinderGeometry(truck ? 0.26 : 0.22, truck ? 0.26 : 0.22, 0.34, 12));
    const rim = mat('#c9ced6', { metalness: 0.9, roughness: 0.25 });
    const wx = truck ? 1.65 : 1.42,
      wy = truck ? 0.48 : 0.4;
    [
      [wx, Wd / 2],
      [wx, -Wd / 2],
      [-wx, Wd / 2],
      [-wx, -Wd / 2],
    ].forEach(([x, z]) => {
      const w = new THREE.Mesh(wheelG, dark);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, wy, z);
      g.add(w);
      if (detail) {
        const r = new THREE.Mesh(rimG, rim);
        r.rotation.x = Math.PI / 2;
        r.position.set(x, wy, z);
        g.add(r);
      }
    });
    const head = mat('#fff7e0', { emissive: '#fff2c4', emissiveIntensity: 0.6 });
    const tail = mat('#ff3b30', { emissive: '#ff2a1f', emissiveIntensity: 0.6 });
    [-1, 1].forEach(s => {
      const h = new THREE.Mesh((G.hl ||= new THREE.BoxGeometry(0.08, 0.16, 0.42)), head);
      h.position.set(L / 2 + 0.01, truck ? 1.1 : 0.9, s * (Wd / 2 - 0.35));
      g.add(h);
      const t = new THREE.Mesh((G.tl ||= new THREE.BoxGeometry(0.08, 0.14, 0.46)), tail);
      t.position.set(-L / 2 - 0.01, truck ? 1.1 : 0.92, s * (Wd / 2 - 0.32));
      g.add(t);
    });
    const grille = new THREE.Mesh((G.gr ||= new THREE.BoxGeometry(0.06, 0.22, 1.0)), dark);
    grille.position.set(L / 2 + 0.02, truck ? 0.95 : 0.7, 0);
    g.add(grille);
    g.traverse(o => {
      if (o.isMesh) {
        o.castShadow = detail;
        o.receiveShadow = false;
      }
    });
    return g;
  }

  /* ------------------------------------------------------------------ the world */
  class DemoWorld {
    constructor(office, { mobile = false } = {}) {
      this.office = office;
      this.scene = office.scene;
      this.mobile = mobile;
      this.root = new THREE.Group();
      this.scene.add(this.root);
      this.lit = [];
      this.dealers = {};
      this.billboards = [];
      this.planes = [];
      this.screens = {};
      this.spin = [];
      this.tod = 'day';
      this.onEvent = () => {};
      this.glowTex = (() => {
        const { c, g, t } = canvasTex(64, 64);
        const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        r.addColorStop(0, '#fff');
        r.addColorStop(0.3, 'rgba(255,255,255,.5)');
        r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 64, 64);
        t.needsUpdate = true;
        return t;
      })();
      DEALERS.forEach(d => this._dealer(d));
      this._billboards();
      this._sky();
      this._timer = 0;
    }

    /* -------------------- helpers -------------------- */
    _lit(m, day, evening, night) {
      this.lit.push({ m, day, evening, night });
      return m;
    }
    local(d, p) {
      return this.dealers[d].g.localToWorld(new THREE.Vector3(...p)).toArray();
    }
    view(id, which) {
      const L = p => this.local(id, p);
      const V = {
        outside: [
          [11, 11, 23],
          [-1, 2.5, -3],
        ],
        showroom: [
          [6, 6.2, 9.5],
          [-1.5, 1.4, -5.5],
        ],
        board: [
          [-3, 4.2, -3.2],
          [-3, 4.2, -11.8],
        ],
        laptop: [
          [3.3, 2.8, -6.3],
          [4.4, 1.45, -9.05],
        ],
        bdc: [
          [7.5, 4.4, -5.5],
          [7.5, 4.4, -11.8],
        ],
      }[which] || [
        [11, 11, 23],
        [-1, 2.5, -3],
      ];
      return [L(V[0]), L(V[1])];
    }

    /* -------------------- a dealership -------------------- */
    _dealer(D) {
      const g = new THREE.Group();
      g.position.set(D.pos[0], STREET_Y + 0.26, D.pos[1]);
      g.rotation.y = D.rot;
      this.root.add(g);
      g.updateMatrixWorld(true);
      const S = {
        D,
        g,
        roofMats: [],
        roofA: 1,
        people: [],
        turntable: null,
        kpi: {
          leads: 26 + Math.floor(Math.random() * 14),
          replied: 0,
          appts: 9 + Math.floor(Math.random() * 6),
          shows: 0,
          sold: 3 + Math.floor(Math.random() * 4),
          avg: 38 + Math.floor(Math.random() * 12),
        },
        chat: [],
      };
      S.kpi.replied = S.kpi.leads;
      S.kpi.shows = Math.max(1, S.kpi.appts - 4);
      S.reps = ['Alex Moreno', 'Jordan Lee', 'Sam Patel', 'Taylor Brooks'].map(n => ({
        n,
        sold: Math.floor(Math.random() * 4),
        appts: 1 + Math.floor(Math.random() * 5),
      }));
      this.dealers[D.id] = S;
      const add = (m, x, y, z) => {
        m.position.set(x, y, z);
        g.add(m);
        return m;
      };

      // lot asphalt with stall lines + showroom floor
      const lot = canvasTex(512, 256);
      {
        const c = lot.g;
        c.fillStyle = '#4c515c';
        c.fillRect(0, 0, 512, 256);
        c.strokeStyle = 'rgba(255,255,255,.85)';
        c.lineWidth = 3;
        for (let x = 16; x < 512; x += 62) {
          c.beginPath();
          c.moveTo(x, 20);
          c.lineTo(x, 100);
          c.moveTo(x, 150);
          c.lineTo(x, 236);
          c.stroke();
        }
        lot.t.needsUpdate = true;
      }
      const lotM = new THREE.Mesh(
        new THREE.PlaneGeometry(28, 12),
        new THREE.MeshStandardMaterial({ map: lot.t, roughness: 0.95 }),
      );
      lotM.rotation.x = -Math.PI / 2;
      add(lotM, 0, 0.01, 7);
      const tile = canvasTex(512, 256);
      {
        const c = tile.g;
        c.fillStyle = '#eef1f5';
        c.fillRect(0, 0, 512, 256);
        c.strokeStyle = 'rgba(140,150,170,.35)';
        c.lineWidth = 2;
        for (let x = 0; x <= 512; x += 42) {
          c.beginPath();
          c.moveTo(x, 0);
          c.lineTo(x, 256);
          c.stroke();
        }
        for (let y = 0; y <= 256; y += 42) {
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(512, y);
          c.stroke();
        }
        tile.t.needsUpdate = true;
      }
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(24, 13),
        new THREE.MeshStandardMaterial({ map: tile.t, roughness: 0.12, metalness: 0.15 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      add(floor, 0, 0.03, -5.5);

      // building shell: back wall (brand colour), glass sides + front, roof (fades when you come close)
      const H = 7.4;
      const wallM = mat('#22262f', { roughness: 0.8 });
      add(new THREE.Mesh(new THREE.BoxGeometry(24, H, 0.4), wallM), 0, H / 2, -12.2);
      const brandM = mat(D.color, { roughness: 0.5 });
      add(new THREE.Mesh(new THREE.BoxGeometry(24.2, 0.5, 0.44), brandM), 0, H - 0.25, -12.18);
      const glassM = new THREE.MeshStandardMaterial({
        color: '#cfe8f5',
        transparent: true,
        opacity: 0.16,
        roughness: 0.05,
        metalness: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const fr = mat('#d9dde3', { metalness: 0.6, roughness: 0.3 });
      // front glass with an entrance gap
      [
        [-7.2, 9.6],
        [7.2, 9.6],
      ].forEach(([x, w]) => {
        add(new THREE.Mesh(new THREE.PlaneGeometry(w, H - 0.3), glassM), x, H / 2, 1);
      });
      for (let x = -12; x <= 12.01; x += 2.4)
        if (Math.abs(x) > 2.3) add(new THREE.Mesh((G.mul ||= new THREE.BoxGeometry(0.12, H, 0.14)), fr), x, H / 2, 1);
      add(new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 0.2), fr), 0, 3.3, 1);
      [-1, 1].forEach(s => {
        const side = add(new THREE.Mesh(new THREE.PlaneGeometry(13, H - 0.3), glassM), s * 12, H / 2, -5.5);
        side.rotation.y = Math.PI / 2;
        for (let z = -12; z <= 1.01; z += 2.6)
          add(new THREE.Mesh((G.mul2 ||= new THREE.BoxGeometry(0.14, H, 0.12)), fr), s * 12, H / 2, z);
      });
      // roof + interior ceiling lights
      const roofM = new THREE.MeshStandardMaterial({ color: '#e6e8ec', roughness: 0.7, transparent: true });
      const roof = add(new THREE.Mesh(new THREE.BoxGeometry(24.6, 0.5, 13.8), roofM), 0, H + 0.25, -5.5);
      S.roofMats.push(roofM);
      S.roof = roof;
      // fascia with the brand name (always visible)
      const sign = canvasTex(1024, 96);
      {
        const c = sign.g;
        c.fillStyle = '#16181d';
        c.fillRect(0, 0, 1024, 96);
        c.fillStyle = D.color;
        c.fillRect(0, 86, 1024, 10);
        c.fillStyle = '#ffffff';
        c.font = '800 58px "Space Grotesk", Inter, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(D.name, 512, 44);
        sign.t.needsUpdate = true;
      }
      const signM = this._lit(
        new THREE.MeshStandardMaterial({
          map: sign.t,
          emissiveMap: sign.t,
          emissive: '#ffffff',
          emissiveIntensity: 0.25,
          roughness: 0.5,
        }),
        0.25,
        1.1,
        1.4,
      );
      add(
        new THREE.Mesh(new THREE.BoxGeometry(24.8, 1.6, 0.3), [
          mat('#16181d'),
          mat('#16181d'),
          mat('#16181d'),
          mat('#16181d'),
          signM,
          mat('#16181d'),
        ]),
        0,
        H + 1.2,
        1.15,
      );
      const ceilM = this._lit(
        new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e6', emissiveIntensity: 0.4 }),
        0.4,
        1.6,
        2.2,
      );
      for (let x = -8; x <= 8; x += 8)
        for (let z = -9; z <= -2; z += 3.5)
          add(new THREE.Mesh((G.ceil ||= new THREE.BoxGeometry(3.6, 0.08, 0.5)), ceilM), x, H - 0.1, z);
      const glow = new THREE.PointLight('#fff1d6', 0, 26, 1.6);
      add(glow, 0, H - 1, -5.5);
      S.glow = glow;

      // pylon sign at the lot corner
      const py = canvasTex(256, 512);
      {
        const c = py.g;
        c.fillStyle = '#16181d';
        c.fillRect(0, 0, 256, 512);
        c.fillStyle = D.color;
        rr(c, 18, 18, 220, 220, 30);
        c.fill();
        c.fillStyle = '#fff';
        c.font = '800 120px "Space Grotesk", Inter, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(D.name[0], 128, 132);
        c.font = '700 30px "Space Grotesk", Inter, sans-serif';
        D.name.split(' ').forEach((w, i) => c.fillText(w, 128, 300 + i * 42));
        c.fillStyle = D.accent;
        c.font = '600 18px Inter, sans-serif';
        c.fillText(D.tag.slice(0, 22), 128, 430);
        py.t.needsUpdate = true;
      }
      const pyM = this._lit(
        new THREE.MeshStandardMaterial({ map: py.t, emissiveMap: py.t, emissive: '#ffffff', emissiveIntensity: 0.2 }),
        0.2,
        1.0,
        1.3,
      );
      add(
        new THREE.Mesh(new THREE.BoxGeometry(2.6, 5.2, 0.5), [
          mat('#16181d'),
          mat('#16181d'),
          mat('#16181d'),
          mat('#16181d'),
          pyM,
          pyM,
        ]),
        12.2,
        6.4,
        12.2,
      );
      add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.8, 0.4), mat('#3a3f4b', { metalness: 0.5 })), 12.2, 1.9, 12.2);

      // display cars inside (one on a turntable) + lot rows
      const tt = add(
        new THREE.Mesh(
          new THREE.CylinderGeometry(3.1, 3.2, 0.18, 40),
          mat('#d4d9e1', { metalness: 0.7, roughness: 0.2 }),
        ),
        -5.5,
        0.09,
        -4.6,
      );
      const tCar = makeCar(D.cars[1], { truck: !!D.trucks });
      tCar.position.set(0, 0.18, 0);
      tt.add(tCar);
      S.turntable = tt;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.15, 0.05, 8, 48),
        this._lit(
          new THREE.MeshStandardMaterial({ color: D.color, emissive: D.color, emissiveIntensity: 0.8 }),
          0.8,
          1.6,
          2,
        ),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(-5.5, 0.2, -4.6);
      g.add(ring);
      const c2 = makeCar(D.cars[2], { truck: !!D.trucks });
      add(c2, 2.5, 0.03, -6.6).rotation.y = 0.5;
      const c3 = makeCar(D.cars[0], { truck: !!D.trucks });
      add(c3, 6.5, 0.03, -2.2).rotation.y = -0.35;
      const nLot = this.mobile ? 3 : 4;
      for (let r = 0; r < 2; r++)
        for (let i = 0; i < nLot; i++) {
          const car = makeCar(D.cars[(i + r * 2) % D.cars.length], {
            truck: !!D.trucks && (i + r) % 2 === 0,
            detail: false,
          });
          car.rotation.y = -Math.PI / 2;
          add(car, -10.6 + i * 6.2, 0.02, r ? 10.8 : 3.8);
          const tag = new THREE.Mesh(
            (G.tag ||= new THREE.PlaneGeometry(0.7, 0.32)),
            mat('#ffd84d', { emissive: '#ffd84d', emissiveIntensity: 0.25 }),
          );
          tag.rotation.x = -Math.PI / 2;
          tag.position.set(0, D.trucks ? 2.5 : 1.92, -0.2);
          car.add(tag);
        }
      // pennant strings and light poles
      const pen = [D.color, '#ffffff', '#f6c445', D.accent];
      [
        [-12, 1, -12, 13.4],
        [12, 1, 12, 13.4],
        [-12, 13.4, 12, 13.4],
      ].forEach(([x1, z1, x2, z2]) => {
        const n = 14;
        for (let i = 0; i <= n; i++) {
          const k = i / n,
            x = x1 + (x2 - x1) * k,
            z = z1 + (z2 - z1) * k,
            y = 5 - Math.sin(k * Math.PI) * 0.7;
          const f = new THREE.Mesh(
            (G.pen ||= new THREE.ConeGeometry(0.22, 0.5, 3)),
            mat(pen[i % pen.length], { side: THREE.DoubleSide }),
          );
          f.position.set(x, y - 0.3, z);
          f.rotation.x = Math.PI;
          g.add(f);
        }
      });
      const poleM = mat('#3a3f4b', { metalness: 0.5, roughness: 0.4 });
      const lampM = this._lit(
        new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffd58a', emissiveIntensity: 0.2 }),
        0.2,
        2.4,
        3.2,
      );
      [
        [-12, 13.4],
        [12, 13.4],
      ].forEach(([x, z]) => {
        add(new THREE.Mesh((G.pole ||= new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8)), poleM), x, 2.7, z);
        add(new THREE.Mesh((G.lamp ||= new THREE.BoxGeometry(0.9, 0.22, 0.5)), lampM), x, 5.4, z);
      });

      // the sales floor: desks + laptops + reception + big screens
      const deskM = mat('#c58d5b', { roughness: 0.5 }),
        whiteM = mat('#f4eee6');
      const desk = (x, z) => {
        const top = add(
          new THREE.Mesh((G.desk ||= new RoundedBoxGeometry(2.4, 0.08, 1.1, 2, 0.03)), deskM),
          x,
          0.78,
          z,
        );
        add(new THREE.Mesh((G.dcab ||= new THREE.BoxGeometry(0.5, 0.74, 1)), whiteM), x + 0.85, 0.37, z);
        add(new THREE.Mesh((G.dleg ||= new THREE.BoxGeometry(0.06, 0.76, 0.9)), mat('#2b2f38')), x - 1.12, 0.38, z);
        return top;
      };
      const laptops = [];
      [
        [3.6, -8.9],
        [8.4, -8.9],
      ].forEach(([x, z], i) => {
        desk(x, z);
        const scr = canvasTex(512, 320);
        const lap = new THREE.Group();
        const base = new THREE.Mesh(
          (G.lb ||= new RoundedBoxGeometry(0.62, 0.03, 0.42, 2, 0.01)),
          mat('#c9ced6', { metalness: 0.6, roughness: 0.3 }),
        );
        lap.add(base);
        const lid = new THREE.Group();
        lid.position.set(0, 0.02, -0.2);
        lid.rotation.x = -0.35;
        lap.add(lid);
        const back = new THREE.Mesh(
          (G.lback ||= new RoundedBoxGeometry(0.62, 0.4, 0.02, 2, 0.01)),
          mat('#c9ced6', { metalness: 0.6, roughness: 0.3 }),
        );
        back.position.y = 0.2;
        lid.add(back);
        const face = new THREE.Mesh(
          (G.lface ||= new THREE.PlaneGeometry(0.58, 0.36)),
          new THREE.MeshBasicMaterial({ map: scr.t, toneMapped: false }),
        );
        face.position.set(0, 0.2, 0.012);
        lid.add(face);
        lap.position.set(x - 0.2, 0.83, z + 0.1);
        lap.rotation.y = Math.PI;
        g.add(lap);
        // a second, customer-facing monitor on the desk so the screen reads from the floor
        const mon = new THREE.Mesh(
          (G.mon ||= new THREE.PlaneGeometry(1.1, 0.66)),
          new THREE.MeshBasicMaterial({ map: scr.t, toneMapped: false }),
        );
        const monF = new THREE.Mesh(
          (G.monf ||= new RoundedBoxGeometry(1.18, 0.74, 0.05, 2, 0.02)),
          mat('#1c2028', { metalness: 0.4 }),
        );
        monF.position.set(x + 0.82, 1.45, z - 0.2);
        mon.position.set(x + 0.82, 1.45, z - 0.17);
        monF.rotation.y = mon.rotation.y = -0.5;
        g.add(monF);
        g.add(mon);
        const st = new THREE.Mesh((G.mst ||= new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8)), mat('#2b2f38'));
        st.position.set(x + 0.82, 1.0, z - 0.25);
        g.add(st);
        const seat = new THREE.Mesh(
          (G.seat ||= new RoundedBoxGeometry(0.6, 0.12, 0.58, 2, 0.04)),
          mat(D.color, { roughness: 0.7 }),
        );
        seat.position.set(x, 0.5, z - 1.05);
        g.add(seat);
        const sback = new THREE.Mesh(
          (G.sback ||= new RoundedBoxGeometry(0.58, 0.62, 0.1, 2, 0.04)),
          mat(D.color, { roughness: 0.7 }),
        );
        sback.position.set(x, 0.88, z - 1.36);
        g.add(sback);
        const sst = new THREE.Mesh((G.sst ||= new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8)), mat('#2b2f38'));
        sst.position.set(x, 0.24, z - 1.05);
        g.add(sst);
        mon.userData.demo = `laptop:${D.id}:${i}`;
        this.office.clickables.push(mon);
        laptops.push(scr);
      });
      S.laptops = laptops;
      // reception counter
      add(new THREE.Mesh(new RoundedBoxGeometry(3.4, 1.1, 1, 2, 0.1), whiteM), -9, 0.55, -0.8);
      add(new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.06, 1.1), brandM), -9, 1.12, -0.8);
      // big sales board (back wall) + AI BDC screen
      const board = canvasTex(1280, 600);
      const bm = new THREE.Mesh(
        new THREE.PlaneGeometry(8.6, 4.03),
        new THREE.MeshBasicMaterial({ map: board.t, toneMapped: false }),
      );
      add(bm, -3, 4.1, -11.86);
      add(
        new THREE.Mesh(new RoundedBoxGeometry(8.85, 4.28, 0.12, 2, 0.05), mat('#1c2028', { metalness: 0.5 })),
        -3,
        4.1,
        -11.96,
      );
      bm.userData.demo = `board:${D.id}`;
      this.office.clickables.push(bm);
      const bdc = canvasTex(720, 420);
      const bdcM = new THREE.Mesh(
        new THREE.PlaneGeometry(4.6, 2.68),
        new THREE.MeshBasicMaterial({ map: bdc.t, toneMapped: false }),
      );
      add(bdcM, 7.5, 4.4, -11.86);
      add(
        new THREE.Mesh(new RoundedBoxGeometry(4.8, 2.88, 0.1, 2, 0.04), mat('#1c2028', { metalness: 0.5 })),
        7.5,
        4.4,
        -11.96,
      );
      bdcM.userData.demo = `bdc:${D.id}`;
      this.office.clickables.push(bdcM);
      S.board = board;
      S.bdc = bdc;
      // plants
      const pot = mat('#c96f4a'),
        leaf = mat('#3f9a5c', { flatShading: true });
      [
        [-11, -11.2],
        [11, -11.2],
        [-11, 0.2],
      ].forEach(([x, z]) => {
        add(new THREE.Mesh((G.pot ||= new THREE.CylinderGeometry(0.35, 0.28, 0.7, 14)), pot), x, 0.35, z);
        add(new THREE.Mesh((G.bush ||= new THREE.IcosahedronGeometry(0.7, 1)), leaf), x, 1.3, z);
      });

      // people: two salespeople at desks, one receptionist, a salesperson with a couple at the turntable
      const staff = (x, z, ry, f, sit, top) => {
        const p = makePerson({
          gender: f ? 'f' : 'm',
          skin: pick(SKIN),
          hair: pick(HAIR),
          hairStyle: f ? pick(['bob', 'bun', 'pony', 'long']) : pick(['side', 'quiff', 'buzz']),
          top,
          accent: '#ffffff',
          jacket: f ? null : '#22283a',
          tie: f ? null : D.color,
          bottom: '#22283a',
          detail: !this.mobile,
        });
        p.g.position.set(x, 0, z);
        p.g.rotation.y = ry;
        if (sit) p.pose('sit');
        g.add(p.g);
        return p;
      };
      S.people.push({ p: staff(3.6, -9.95, 0, false, true, '#22283a'), mode: 'type', k: 1 });
      S.people.push({ p: staff(8.4, -9.95, 0, true, true, D.color), mode: 'type', k: 2 });
      S.people.push({ p: staff(-9, -1.8, 0, true, false, '#ffffff'), mode: 'idle', k: 3 });
      const sp = staff(-1.2, -2.4, -2.2, false, false, '#22283a');
      S.people.push({ p: sp, mode: 'talk', k: 4 });
      const cust = (x, z, ry) => {
        const f = Math.random() < 0.5;
        const p = makePerson({
          gender: f ? 'f' : 'm',
          skin: pick(SKIN),
          hair: pick(HAIR),
          hairStyle: f ? pick(['long', 'bob', 'pony']) : pick(['side', 'quiff', 'buzz']),
          top: pick(['#e86a5a', '#3fb6a8', '#f6c445', '#5aa6e0', '#9b7fd1', '#ffffff']),
          bottom: pick(['#2b2f3a', '#3a4a6b', '#6b5a48']),
          detail: false,
        });
        p.g.position.set(x, 0, z);
        p.g.rotation.y = ry;
        g.add(p.g);
        return p;
      };
      S.people.push({ p: cust(-2.2, -1.2, -2.6), mode: 'idle', k: 5 });
      S.people.push({ p: cust(-0.6, -0.9, -2.9), mode: 'talk', k: 6 });
      S.people.push({ p: cust(3.6, -7.6, Math.PI), mode: 'idle', k: 7 }); // customer at a desk
      S.people.push({
        p: cust(6, 7.0, 0.4),
        mode: 'walk-lot',
        k: 8,
        path: [
          [6, 7.0],
          [-8, 7.0],
          [-8, 7.7],
          [6, 7.7],
        ],
        seg: 0,
      });

      // first draw of every screen
      this._drawBoard(S);
      this._drawBdc(S);
      S.laptops.forEach((l, i) => this._drawLaptop(S, i));
    }

    /* -------------------- screens -------------------- */
    _drawBoard(S, flash = 0) {
      const { g, t, c } = S.board,
        D = S.D,
        k = S.kpi,
        W = c.width,
        H = c.height;
      g.fillStyle = '#0a0f17';
      g.fillRect(0, 0, W, H);
      g.fillStyle = D.color;
      g.fillRect(0, 0, W, 10);
      g.fillStyle = '#fff';
      g.font = '700 40px "Space Grotesk", Inter, sans-serif';
      g.fillText(`${D.name} · SALES BOARD`, 36, 66);
      g.fillStyle = '#8792a3';
      g.font = '500 22px "JetBrains Mono", monospace';
      g.textAlign = 'right';
      g.fillText('TODAY · LIVE', W - 36, 62);
      g.textAlign = 'left';
      const tiles = [
        ['NEW LEADS', k.leads, '#e8ecf2'],
        ['ANSWERED < 60 s', Math.round((100 * k.replied) / Math.max(1, k.leads)) + '%', '#3ccf8e'],
        ['APPOINTMENTS', k.appts, '#f5b83d'],
        ['SHOWED UP', k.shows, '#e8ecf2'],
        ['SOLD', k.sold, D.accent],
      ];
      const tw = (W - 72 - 4 * 16) / 5;
      tiles.forEach(([l, v, col], i) => {
        const x = 36 + i * (tw + 16),
          y = 96;
        g.fillStyle = flash && i === 0 ? 'rgba(60,207,142,.18)' : '#121a26';
        rr(g, x, y, tw, 150, 16);
        g.fill();
        g.fillStyle = '#8792a3';
        g.font = '600 18px "JetBrains Mono", monospace';
        g.fillText(l, x + 18, y + 38);
        g.fillStyle = col;
        g.font = '700 70px "Space Grotesk", Inter, sans-serif';
        g.fillText(String(v), x + 18, y + 118);
      });
      g.fillStyle = '#8792a3';
      g.font = '600 18px "JetBrains Mono", monospace';
      g.fillText('LEADERBOARD · UNITS / APPOINTMENTS', 36, 300);
      const max = Math.max(4, ...S.reps.map(r => r.sold));
      S.reps
        .slice()
        .sort((a, b) => b.sold - a.sold || b.appts - a.appts)
        .forEach((r, i) => {
          const y = 326 + i * 56;
          g.fillStyle = '#e8ecf2';
          g.font = '600 24px Inter, sans-serif';
          g.fillText(`${i + 1}. ${r.n}`, 36, y + 26);
          g.fillStyle = '#141c28';
          rr(g, 330, y + 8, 560, 24, 12);
          g.fill();
          g.fillStyle = i === 0 ? D.color : '#4a5670';
          rr(g, 330, y + 8, Math.max(24, (560 * r.sold) / max), 24, 12);
          g.fill();
          g.fillStyle = '#e8ecf2';
          g.font = '700 24px "Space Grotesk", sans-serif';
          g.fillText(`${r.sold} sold · ${r.appts} appts`, 910, y + 28);
        });
      g.fillStyle = '#121a26';
      rr(g, 36, H - 62, W - 72, 40, 12);
      g.fill();
      g.fillStyle = '#3ccf8e';
      g.beginPath();
      g.arc(60, H - 42, 7, 0, 7);
      g.fill();
      g.fillStyle = '#c9d2df';
      g.font = '500 20px Inter, sans-serif';
      g.fillText(
        `AI BDC: Vera answered ${k.replied} of ${k.leads} leads today · average first reply ${k.avg} s · no lead waited`,
        78,
        H - 35,
      );
      t.needsUpdate = true;
    }
    _drawBdc(S) {
      const { g, t, c } = S.bdc,
        D = S.D,
        W = c.width,
        H = c.height;
      g.fillStyle = '#0a0f17';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff6b5e';
      g.beginPath();
      g.arc(34, 38, 9, 0, 7);
      g.fill();
      g.fillStyle = '#fff';
      g.font = '700 28px "Space Grotesk", Inter, sans-serif';
      g.fillText('AI BDC · LIVE CONVERSATIONS', 56, 48);
      const lines = S.chat.length
        ? S.chat
        : [{ who: 'Vera', txt: 'Watching for new internet leads…', col: '#ff6b5e', at: '' }];
      lines.slice(0, 6).forEach((m, i) => {
        const y = 84 + i * 54;
        g.fillStyle = '#121a26';
        rr(g, 24, y, W - 48, 46, 10);
        g.fill();
        g.fillStyle = m.col;
        g.font = '700 18px "JetBrains Mono", monospace';
        g.fillText(m.who.toUpperCase(), 40, y + 29);
        g.fillStyle = '#d6dde8';
        g.font = '500 19px Inter, sans-serif';
        g.fillText(m.txt.slice(0, 50), 150, y + 29);
        g.fillStyle = '#8792a3';
        g.font = '500 15px "JetBrains Mono", monospace';
        g.textAlign = 'right';
        g.fillText(m.at, W - 40, y + 29);
        g.textAlign = 'left';
      });
      t.needsUpdate = true;
    }
    _drawLaptop(S, i) {
      const { g, t, c } = S.laptops[i],
        D = S.D,
        W = c.width,
        H = c.height;
      const lead = S.lastLead || { name: buyer(), model: pick(MODELS[D.id]), when: 'Sat 10:30 AM', secs: 41 };
      g.fillStyle = '#f6f7fb';
      g.fillRect(0, 0, W, H);
      g.fillStyle = D.color;
      g.fillRect(0, 0, W, 34);
      g.fillStyle = '#fff';
      g.font = '700 16px Inter, sans-serif';
      g.fillText(i ? 'CRM · LEAD CARD' : "CRM · TODAY'S APPOINTMENTS", 14, 23);
      if (i === 0) {
        const appts =
          S.appts ||
          (S.appts = Array.from({ length: 5 }, (_, k) => ({
            t: ['9:30', '10:30', '11:45', '1:15', '3:00'][k],
            n: buyer(),
            m: pick(MODELS[D.id]),
          })));
        appts.slice(0, 5).forEach((a, k) => {
          const y = 52 + k * 52;
          g.fillStyle = '#fff';
          rr(g, 12, y, W - 24, 44, 8);
          g.fill();
          g.strokeStyle = '#e3e7ef';
          g.stroke();
          g.fillStyle = D.color;
          g.font = '700 16px "JetBrains Mono", monospace';
          g.fillText(a.t, 24, y + 28);
          g.fillStyle = '#1c2230';
          g.font = '600 16px Inter, sans-serif';
          g.fillText(a.n, 104, y + 20);
          g.fillStyle = '#6b7385';
          g.font = '500 13px Inter, sans-serif';
          g.fillText('Test drive · ' + a.m, 104, y + 37);
          g.fillStyle = '#18b67a';
          g.font = '700 12px Inter, sans-serif';
          g.textAlign = 'right';
          g.fillText('BOOKED BY AI ✓', W - 24, y + 28);
          g.textAlign = 'left';
        });
      } else {
        g.fillStyle = '#1c2230';
        g.font = '700 24px Inter, sans-serif';
        g.fillText(lead.name, 16, 72);
        g.fillStyle = '#6b7385';
        g.font = '500 15px Inter, sans-serif';
        g.fillText(`Interested in: ${lead.model}`, 16, 98);
        const msgs = [
          ['in', 'Hi, is the ' + lead.model.split(' ').slice(-2).join(' ') + ' still available?'],
          ['out', `Yes! It's on the lot. Want a test drive ${lead.when}?`],
          ['in', 'Perfect, see you then'],
          ['out', `Booked ✓ ${lead.when}. Bring your trade-in!`],
        ];
        msgs.forEach(([d, m], k) => {
          const y = 118 + k * 46,
            out = d === 'out',
            w = Math.min(W - 80, g.measureText(m).width + 30);
          g.fillStyle = out ? D.color : '#e8ebf2';
          rr(g, out ? W - 16 - w : 16, y, w, 36, 14);
          g.fill();
          g.fillStyle = out ? '#fff' : '#1c2230';
          g.font = '500 15px Inter, sans-serif';
          g.fillText(m, (out ? W - 16 - w : 16) + 14, y + 23);
        });
        g.fillStyle = '#6b7385';
        g.font = '600 12px "JetBrains Mono", monospace';
        g.fillText(`FIRST REPLY BY VERA (AI) IN ${lead.secs}s`, 16, H - 12);
      }
      t.needsUpdate = true;
    }

    /** One simulated sales event in a dealership; returns a feed line. */
    event(id) {
      const S = this.dealers[id || pick(Object.keys(this.dealers))],
        D = S.D,
        k = S.kpi;
      const r = Math.random(),
        secs = 24 + Math.floor(Math.random() * 30),
        name = buyer(),
        model = pick(MODELS[D.id]);
      const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      let line;
      if (r < 0.55) {
        k.leads++;
        k.replied++;
        k.avg = Math.round((k.avg * 9 + secs) / 10);
        S.chat.unshift({ who: 'Vera', txt: `Replied to ${name} · ${model} · ${secs}s`, col: '#ff6b5e', at: now });
        S.lastLead = { name, model, when: pick(['today 5:30 PM', 'tomorrow 10 AM', 'Sat 11:15 AM', 'Mon 6 PM']), secs };
        line = { who: 'Vera', txt: `answered ${name} about a ${model} in ${secs}s`, where: D.short, col: '#ff6b5e' };
        this._drawBoard(S, 1);
        setTimeout(() => this._drawBoard(S), 900);
        this._drawLaptop(S, 1);
      } else if (r < 0.8) {
        k.appts++;
        const rep = pick(S.reps);
        rep.appts++;
        (S.appts ||= []).unshift({ t: pick(['4:15', '5:30', '6:00', '10:00']), n: name, m: model });
        S.appts.length = Math.min(S.appts.length, 6);
        S.chat.unshift({ who: 'Vera', txt: `Booked test drive · ${name}`, col: '#3ccf8e', at: now });
        line = {
          who: 'Test drive booked',
          txt: `${name} · ${model} · with ${rep.n.split(' ')[0]}`,
          where: D.short,
          col: '#3ccf8e',
        };
        this._drawBoard(S);
        this._drawLaptop(S, 0);
      } else if (r < 0.92) {
        k.sold++;
        k.shows = Math.min(k.appts, k.shows + 1);
        const rep = pick(S.reps);
        rep.sold++;
        S.chat.unshift({ who: 'Iris', txt: `Thank-you + review request to ${name}`, col: '#2dd4bf', at: now });
        line = { who: 'Sold', txt: `${model} to ${name} · ${rep.n}`, where: D.short, col: D.color };
        this._drawBoard(S);
      } else {
        S.chat.unshift({ who: 'Nico', txt: `Revived 90-day-old lead ${name}`, col: '#818cf8', at: now });
        line = { who: 'Nico', txt: `brought back an aged lead, ${name}`, where: D.short, col: '#818cf8' };
      }
      S.chat.length = Math.min(S.chat.length, 8);
      this._drawBdc(S);
      return line;
    }

    /* -------------------- billboards -------------------- */
    _billboards() {
      const ADS = N3.ADS;
      const make = (x, z, ry, w, h, baseY, start, onWall = false) => {
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        g.rotation.y = ry;
        this.root.add(g);
        const cv = canvasTex(1024, Math.round((1024 * h) / w));
        const face = this._lit(
          new THREE.MeshStandardMaterial({
            map: cv.t,
            emissiveMap: cv.t,
            emissive: '#ffffff',
            emissiveIntensity: 0.15,
            roughness: 0.6,
          }),
          0.15,
          0.9,
          1.15,
        );
        const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), [
          mat('#2b2f38'),
          mat('#2b2f38'),
          mat('#2b2f38'),
          mat('#2b2f38'),
          face,
          mat('#2b2f38'),
        ]);
        panel.position.y = baseY + h / 2;
        g.add(panel);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, h + 0.6, 0.3), mat('#3a3f4b', { metalness: 0.6 }));
        frame.position.set(0, baseY + h / 2, -0.2);
        g.add(frame);
        const postM = mat('#4a505c', { metalness: 0.6, roughness: 0.4 });
        const top = baseY - STREET_Y;
        // screens on a Times Square tower hang on the wall: no posts, walkway or spotlights
        if (!onWall) {
          [-w / 3, w / 3].forEach(px => {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, top, 10), postM);
            p.position.set(px, STREET_Y + top / 2, -0.4);
            g.add(p);
          });
          const walk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 1.2), postM);
          walk.position.set(0, baseY - 0.3, 0.5);
          g.add(walk);
          const spotM = this._lit(
            new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffe6b0', emissiveIntensity: 0.1 }),
            0.1,
            2.5,
            3,
          );
          for (let i = 0; i < 4; i++) {
            const s = new THREE.Mesh((G.spot ||= new THREE.BoxGeometry(0.5, 0.3, 0.4)), spotM);
            s.position.set(-w / 2 + w / 8 + (i * w) / 4, baseY - 0.2, 1.1);
            g.add(s);
          }
        }
        const bb = { cv, w, h, i: start, t0: onWall ? Math.random() * 6 : 0, wipe: 1, ads: ADS };
        this._drawAd(bb, 1);
        this.billboards.push(bb);
      };
      make(0, -46, 0, 30, 12, STREET_Y + 27, 0);
      make(52, -36, -0.45, 20, 8.5, STREET_Y + 25, 1);
      make(-52, -36, 0.45, 20, 8.5, STREET_Y + 25, 3);
      make(104, 20, -Math.PI / 2 + 0.3, 18, 7.5, STREET_Y + 13, 2);
      make(-104, 20, Math.PI / 2 - 0.3, 18, 7.5, STREET_Y + 13, 4);
      // Times Square: big lit screens on the four corner towers of one junction
      N3.squareScreens()
        .slice(0, this.mobile ? 4 : 8)
        .forEach((sc, i) => make(sc.x, sc.z, sc.yaw, sc.w, sc.h, STREET_Y + sc.y, sc.ad + 5, true));
    }
    _drawAd(bb, k) {
      const { g, c, t } = bb.cv,
        W = c.width,
        H = c.height;
      const cur = bb.ads[bb.i % bb.ads.length],
        prev = bb.ads[(bb.i + bb.ads.length - 1) % bb.ads.length];
      const paint = (ad, x0) => {
        g.save();
        g.translate(x0, 0);
        g.fillStyle = ad.bg;
        g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,.08)';
        for (let i = -H; i < W; i += 60) {
          g.beginPath();
          g.moveTo(i, H);
          g.lineTo(i + H, 0);
          g.lineTo(i + H + 22, 0);
          g.lineTo(i + 22, H);
          g.fill();
        }
        if (ad.accent) {
          g.fillStyle = ad.accent;
          g.fillRect(48, H * 0.22, 14, H * 0.56);
        }
        g.fillStyle = ad.fg;
        g.textBaseline = 'middle';
        let fs = 74;
        g.font = `800 ${fs}px "Space Grotesk", Inter, sans-serif`;
        while (g.measureText(ad.big).width > W - 150 && fs > 30) {
          fs -= 2;
          g.font = `800 ${fs}px "Space Grotesk", Inter, sans-serif`;
        }
        g.fillText(ad.big, 84, H * 0.42);
        g.globalAlpha = 0.85;
        g.font = `500 ${Math.round(fs * 0.42)}px Inter, sans-serif`;
        g.fillText(ad.small, 86, H * 0.42 + fs * 0.9);
        g.globalAlpha = 1;
        g.restore();
      };
      const e = 1 - Math.pow(1 - k, 3);
      paint(prev, -W * e);
      paint(cur, W * (1 - e));
      t.needsUpdate = true;
    }

    /* -------------------- sky: airplanes + blimp -------------------- */
    _sky() {
      const body = mat('#f4f6fa', { metalness: 0.3, roughness: 0.4 }),
        stripe = mat('#2f7cf6'),
        dark = mat('#2b2f38');
      const plane = () => {
        const g = new THREE.Group();
        const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 9, 6, 12), body);
        f.rotation.z = Math.PI / 2;
        g.add(f);
        const s = new THREE.Mesh(new THREE.BoxGeometry(8, 0.16, 1.62), stripe);
        s.position.y = -0.1;
        g.add(s);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 12), body);
        wing.position.set(0.2, -0.2, 0);
        g.add(wing);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.14), stripe);
        tail.position.set(-4.6, 1.2, 0);
        g.add(tail);
        const stab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 4), body);
        stab.position.set(-4.6, 0.3, 0);
        g.add(stab);
        [-2.6, 2.6].forEach(z => {
          const e = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.4, 12), dark);
          e.rotation.z = Math.PI / 2;
          e.position.set(0.8, -0.6, z);
          g.add(e);
        });
        const light = (col, x, y, z) => {
          const sp = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: this.glowTex,
              color: col,
              transparent: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            }),
          );
          sp.position.set(x, y, z);
          sp.scale.setScalar(2.4);
          g.add(sp);
          return sp;
        };
        const lights = [
          light('#ff3333', 0.2, -0.2, -6.1),
          light('#33ff66', 0.2, -0.2, 6.1),
          light('#ffffff', -5.2, 2.4, 0),
        ];
        this.root.add(g);
        return { g, lights };
      };
      const paths = [
        { y: 95, a: 0.35, v: 16, off: 0 },
        { y: 120, a: 2.4, v: 20, off: 140 },
      ];
      if (!this.mobile) paths.push({ y: 75, a: -1.2, v: 14, off: 260 });
      paths.forEach(p => {
        const pl = plane();
        this.planes.push({ ...pl, ...p, s: -220 + p.off });
      });
      // blimp with the AutoSalesCity name
      const bl = new THREE.Group();
      const cv = canvasTex(1024, 256);
      {
        const c = cv.g;
        c.fillStyle = '#e9edf3';
        c.fillRect(0, 0, 1024, 256);
        c.fillStyle = '#f5b83d';
        c.fillRect(0, 200, 1024, 22);
        c.fillStyle = '#1c2230';
        c.font = '800 92px "Space Grotesk", Inter, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('AutoSalesCity', 512, 108);
        cv.t.needsUpdate = true;
      }
      const bm = this._lit(
        new THREE.MeshStandardMaterial({
          map: cv.t,
          emissiveMap: cv.t,
          emissive: '#ffffff',
          emissiveIntensity: 0.05,
          roughness: 0.5,
        }),
        0.05,
        0.5,
        0.7,
      );
      const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), bm);
      hull.scale.set(15, 4.2, 4.2);
      bl.add(hull);
      const gon = new THREE.Mesh(new RoundedBoxGeometry(3.4, 1, 1.4, 2, 0.3), dark);
      gon.position.y = -4.4;
      bl.add(gon);
      [
        [-1, 1],
        [-1, -1],
      ].forEach(([, s]) => {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 3), mat('#f5b83d'));
        fin.position.set(-13, 0, s * 1.6);
        bl.add(fin);
      });
      const vfin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3, 0.16), mat('#f5b83d'));
      vfin.position.set(-13, 1.6, 0);
      bl.add(vfin);
      this.root.add(bl);
      this.blimp = bl;
    }

    /* -------------------- per frame -------------------- */
    update(dt, t, camera) {
      // planes cross the sky, lights blink
      for (const p of this.planes) {
        p.s += p.v * dt;
        if (p.s > 240) p.s = -240;
        const dx = Math.cos(p.a),
          dz = Math.sin(p.a);
        p.g.position.set(dx * p.s - dz * 30, p.y, dz * p.s + dx * 30 - 40);
        p.g.rotation.y = -p.a;
        const on = (t * 1.3 + p.off) % 1 < 0.12;
        p.lights[2].material.opacity = on ? 1 : 0;
        p.lights[0].material.opacity = p.lights[1].material.opacity = 0.65 + Math.sin(t * 3) * 0.3;
      }
      if (this.blimp) {
        const a = t * 0.045;
        this.blimp.position.set(Math.cos(a) * 110, 58 + Math.sin(t * 0.4) * 1.5, Math.sin(a) * 110 - 30);
        this.blimp.rotation.y = -a - Math.PI / 2;
      }
      // billboards rotate their ads every 7 s with a slide
      for (const b of this.billboards) {
        b.t0 += dt;
        if (b.t0 > 7) {
          b.t0 = 0;
          b.i++;
          b.wipe = 0;
        }
        if (b.wipe < 1) {
          b.wipe = Math.min(1, b.wipe + dt * 1.6);
          this._drawAd(b, b.wipe);
        }
      }
      // dealerships: turntables, people, roof fade when the camera comes close
      for (const S of Object.values(this.dealers)) {
        S.turntable.rotation.y += dt * 0.25;
        const near = camera.position.distanceTo(S.g.position) < 22 && camera.position.y < STREET_Y + 14;
        const want = near ? 0 : 1;
        if (Math.abs(want - S.roofA) > 0.001) {
          S.roofA += Math.sign(want - S.roofA) * Math.min(Math.abs(want - S.roofA), dt * 2.5);
          S.roofMats.forEach(m => {
            m.opacity = S.roofA;
            m.depthWrite = S.roofA > 0.99;
          });
          S.roof.visible = S.roofA > 0.02;
        }
        for (const q of S.people) {
          if (q.mode === 'walk-lot') {
            const [a, b] = [q.path[q.seg], q.path[(q.seg + 1) % q.path.length]];
            const p = q.p.g.position,
              dx = b[0] - p.x,
              dz = b[1] - p.z,
              d = Math.hypot(dx, dz);
            if (d < 0.1) q.seg = (q.seg + 1) % q.path.length;
            else {
              const s = Math.min(d, dt * 1.1);
              p.x += (dx / d) * s;
              p.z += (dz / d) * s;
              q.p.g.rotation.y = Math.atan2(dx, dz);
            }
            q.p.animate(t, 'walk', q.k);
          } else q.p.animate(t, q.mode, q.k);
        }
      }
    }

    setTimeOfDay(tod) {
      this.tod = tod;
      this.lit.forEach(x => {
        x.m.emissiveIntensity = x[tod] ?? x.day;
      });
      Object.values(this.dealers).forEach(S => {
        S.glow.intensity = tod === 'day' ? 0 : tod === 'evening' ? 30 : 45;
      });
    }
  }

  return { DemoWorld, DEALERS };
})();
