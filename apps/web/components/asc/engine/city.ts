// @ts-nocheck
// The living city around the office: streets, shops, traffic, tram, pedestrians, sky.
// Ported unchanged from the AutoSalesCity design file (three r160 code, runs on the app's three). Everything is
// generated in code: no model, texture or image downloads.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { P3 } from './people';

export const C3 = (() => {
  const { makePerson, SKIN, HAIR } = P3;
  // Fast Sales virtual office: the living city around the office (cars, tram, people, shops, lights).
  // Everything is generated in code (no downloads): colourful illustrated style, day / evening / night.

  const STREET_Y = -6; // street level (office floor is y = 0)
  const PALETTE = [
    '#f29c38',
    '#e8604c',
    '#7cc36b',
    '#3fb6a8',
    '#f6c445',
    '#e98aa8',
    '#5aa6e0',
    '#f3e2c0',
    '#9b7fd1',
    '#c8553d',
    '#ef8f6b',
    '#63c1d8',
  ];
  const SHOPS = [
    'BOOKS',
    'CAFE',
    'BAKERY',
    'FLOWERS',
    'PIZZA',
    'DINER',
    'MARKET',
    'GYM',
    'BANK',
    'PHARMACY',
    'SHOES',
    'TACOS',
    'BARBER',
    'DELI',
    'ICE CREAM',
    'MUSIC',
    'SUSHI',
    'TOYS',
  ];
  const CAR_COLORS = [
    '#e8604c',
    '#f6c445',
    '#3fb6a8',
    '#5aa6e0',
    '#ffffff',
    '#2d3142',
    '#9b7fd1',
    '#7cc36b',
    '#ef8f6b',
    '#d9dde3',
  ];

  let seed = 20101;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')];
  }
  function tex(c, rep) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (rep) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(...rep);
    }
    return t;
  }
  function shade(hex, amt) {
    const c = new THREE.Color(hex);
    const h = {};
    c.getHSL(h);
    c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + amt)));
    return '#' + c.getHexString();
  }

  class City {
    constructor(scene, { quality = 'high', demo = false } = {}) {
      this.scene = scene;
      this.q = quality;
      this.demo = demo;
      this.root = new THREE.Group();
      scene.add(this.root);
      this.lit = []; // materials that glow at night: { m, day, evening, night }
      this.cars = [];
      this.walkers = [];
      this.birds = [];
      this.clouds = [];
      this.tod = 'day';
      seed = 20101;
      this._ground();
      this._streets();
      this._officeBuilding();
      this._blocks();
      this._skyline();
      this._lamps();
      this._trees();
      this._traffic();
      this._tram();
      this._people();
      this._sky();
    }

    /* ---------------- ground, roads, sidewalks ---------------- */
    _ground() {
      const g = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400),
        new THREE.MeshStandardMaterial({ color: '#cfc6b4', roughness: 1 }),
      );
      g.rotation.x = -Math.PI / 2;
      g.position.y = STREET_Y - 0.05;
      this.root.add(g);
      this.groundMat = g.material;
    }
    _road(x0, x1, z0, z1, axis) {
      const [c, g] = canvas(256, 256);
      g.fillStyle = '#5b6170';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 400; i++) {
        g.fillStyle = `rgba(255,255,255,${rnd() * 0.04})`;
        g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
      }
      g.fillStyle = '#f3d36b';
      g.fillRect(0, 124, 256, 4);
      g.fillRect(0, 130, 256, 4); // double yellow centre line
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.fillRect(0, 6, 256, 4);
      g.fillRect(0, 246, 256, 4);
      const w = x1 - x0,
        d = z1 - z0;
      const t = tex(c, axis === 'x' ? [w / 8, 1] : [d / 8, 1]);
      if (axis === 'z') t.rotation = Math.PI / 2;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, STREET_Y, (z0 + z1) / 2);
      this.root.add(m);
      return m;
    }
    _walk(x0, x1, z0, z1) {
      const [c, g] = canvas(128, 128);
      g.fillStyle = '#e7dccb';
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(150,130,100,.35)';
      g.lineWidth = 2;
      for (let i = 0; i <= 128; i += 32) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, 128);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i);
        g.lineTo(128, i);
        g.stroke();
      }
      const w = x1 - x0,
        d = z1 - z0;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.24, d),
        new THREE.MeshStandardMaterial({ map: tex(c, [w / 3, d / 3]), roughness: 1 }),
      );
      m.position.set((x0 + x1) / 2, STREET_Y + 0.12, (z0 + z1) / 2);
      this.root.add(m);
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.1, 0.26, d + 0.1),
        new THREE.MeshStandardMaterial({ color: '#bfb3a0', roughness: 1 }),
      );
      curb.position.copy(m.position);
      curb.position.y -= 0.01;
      curb.scale.set(1, 1, 1);
      this.root.add(curb);
    }
    _streets() {
      const L = 160;
      // main street behind the office (tram line) and the street in front
      this._road(-L, L, -23, -15, 'x');
      this._road(-L, L, 14.5, 21.5, 'x');
      // side streets
      this._road(-24.5, -19.5, -L, L, 'z');
      this._road(19.5, 24.5, -L, L, 'z');
      // sidewalks
      this._walk(-L, L, -15, -12);
      this._walk(-L, L, -26, -23);
      this._walk(-L, L, 12, 14.5);
      this._walk(-L, L, 21.5, 24);
      [
        [-19.5, -17],
        [-27, -24.5],
        [17, 19.5],
        [24.5, 27],
      ].forEach(([a, b]) => {
        this._walk(a, b, -12, 12);
        this._walk(a, b, 24, 60);
        this._walk(a, b, -60, -26);
      });
      // crosswalks
      const zebra = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9 });
      const stripes = (x, z, along) => {
        for (let i = -3; i <= 3; i++) {
          const s = new THREE.Mesh(
            new THREE.PlaneGeometry(along === 'x' ? 0.5 : 4.4, along === 'x' ? 4.4 : 0.5),
            zebra,
          );
          s.rotation.x = -Math.PI / 2;
          s.position.set(x + (along === 'x' ? i * 0.9 : 0), STREET_Y + 0.01, z + (along === 'z' ? i * 0.9 : 0));
          this.root.add(s);
        }
      };
      [-22, 22].forEach(x => {
        stripes(x, -13.5 + 0, 'z');
      }); // small hint at corners
      [
        [-22, -19],
        [22, -19],
        [-22, 18],
        [22, 18],
      ].forEach(([x, z]) => {
        stripes(x + (x < 0 ? 4 : -4), z, 'x');
      });
      // tram tracks
      const rail = new THREE.MeshStandardMaterial({ color: '#9aa1ab', metalness: 0.7, roughness: 0.3 });
      [-19.6, -18.4].forEach(z => {
        const r = new THREE.Mesh(new THREE.BoxGeometry(2 * L, 0.06, 0.08), rail);
        r.position.set(0, STREET_Y + 0.03, z);
        this.root.add(r);
      });
    }

    /* ---------------- buildings ---------------- */
    _facade(w, h, base, shop, isOffice = false) {
      const PX = 30,
        W = Math.min(1024, Math.round(w * PX)),
        H = Math.min(1024, Math.round(h * PX));
      const sx = W / w,
        sy = H / h;
      const [c, g] = canvas(W, H),
        [ce, ge] = canvas(W, H);
      ge.fillStyle = '#000';
      ge.fillRect(0, 0, W, H);
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, shade(base, 0.06));
      grd.addColorStop(1, shade(base, -0.06));
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      // brick / plaster texture
      g.fillStyle = 'rgba(0,0,0,.035)';
      for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? 0 : 8; x < W; x += 16) g.fillRect(x, y, 14, 1);
      // cornice
      g.fillStyle = shade(base, -0.18);
      g.fillRect(0, 0, W, 0.5 * sy);
      g.fillStyle = shade(base, 0.15);
      g.fillRect(0, 0.5 * sy, W, 0.12 * sy);
      const groundH = 3.4,
        floorH = 3.0;
      const cols = Math.max(2, Math.floor(w / 2.4)),
        cw = w / cols;
      const glass = isOffice ? '#a9d8ee' : pick(['#7fc7d9', '#8fd0c6', '#9cc7e8', '#86b7d6']);
      for (let fy = groundH; fy < h - 1; fy += floorH) {
        const y = H - (fy + floorH - 0.6) * sy;
        for (let i = 0; i < cols; i++) {
          const x = (i * cw + cw * 0.22) * sx,
            ww = cw * 0.56 * sx,
            wh = 1.7 * sy;
          g.fillStyle = '#f7f1e3';
          g.fillRect(x - 3, y - 3, ww + 6, wh + 6); // frame
          const gg = g.createLinearGradient(0, y, 0, y + wh);
          gg.addColorStop(0, shade(glass, 0.12));
          gg.addColorStop(1, shade(glass, -0.1));
          g.fillStyle = gg;
          g.fillRect(x, y, ww, wh);
          g.fillStyle = 'rgba(255,255,255,.45)';
          g.beginPath();
          g.moveTo(x + ww * 0.15, y + wh);
          g.lineTo(x + ww * 0.45, y);
          g.lineTo(x + ww * 0.6, y);
          g.lineTo(x + ww * 0.3, y + wh);
          g.fill();
          if (rnd() < 0.35) {
            g.fillStyle = pick(['#ffffff', '#f6e0b5', '#f4c6c0']);
            g.fillRect(x, y, ww * 0.28, wh);
            g.fillRect(x + ww * 0.72, y, ww * 0.28, wh);
          }
          g.fillStyle = '#ffffff';
          g.fillRect(x - 5, y + wh + 2, ww + 10, 0.12 * sy); // sill
          if (rnd() < 0.15) {
            g.fillStyle = '#4f9d5a';
            for (let k = 0; k < 5; k++) {
              g.beginPath();
              g.arc(x + rnd() * ww, y + wh - 2, 4 + rnd() * 4, 0, 7);
              g.fill();
            }
          }
          g.fillStyle = '#3d3d48';
          g.fillRect(x + ww / 2 - 1, y, 2, wh); // mullion
          if (rnd() < (isOffice ? 0.9 : 0.55)) {
            ge.fillStyle = pick(['#ffd88a', '#ffe7b0', '#ffc66b', '#cfe6ff']);
            ge.fillRect(x, y, ww, wh);
          }
        }
      }
      // ground floor shop
      const gy = H - groundH * sy;
      g.fillStyle = shade(base, -0.25);
      g.fillRect(0, gy, W, groundH * sy);
      const awn = isOffice ? '#f5b83d' : pick(['#e8604c', '#3fb6a8', '#f6c445', '#5aa6e0', '#2f7a55', '#c8553d']);
      const swg = g.createLinearGradient(0, gy + 1.1 * sy, 0, H);
      swg.addColorStop(0, '#bfe4f2');
      swg.addColorStop(1, '#8fc0d6');
      g.fillStyle = swg;
      g.fillRect(0.4 * sx, gy + 1.3 * sy, W - 0.8 * sx, groundH * sy - 1.3 * sy);
      ge.fillStyle = '#ffdca0';
      ge.fillRect(0.4 * sx, gy + 1.3 * sy, W - 0.8 * sx, groundH * sy - 1.3 * sy);
      g.fillStyle = 'rgba(40,40,50,.55)';
      for (let x = 0.4 * sx; x < W; x += 2.2 * sx) g.fillRect(x, gy + 1.3 * sy, 3, groundH * sy);
      // awning stripes
      for (let x = 0; x < W; x += 0.5 * sx) {
        g.fillStyle = Math.round(x / (0.5 * sx)) % 2 ? awn : '#ffffff';
        g.fillRect(x, gy + 0.55 * sy, 0.5 * sx + 1, 0.6 * sy);
      }
      g.fillStyle = shade(awn, -0.2);
      g.fillRect(0, gy + 1.12 * sy, W, 4);
      // sign board
      const label = isOffice ? 'FAST SALES TRAINING CENTER' : shop;
      g.fillStyle = isOffice ? '#1c2230' : '#2c3a4a';
      const sw = Math.min(W * 0.8, label.length * 0.42 * sx + 1 * sx);
      g.fillRect((W - sw) / 2, gy + 0.05 * sy, sw, 0.45 * sy);
      g.fillStyle = isOffice ? '#f5b83d' : '#ffe6a6';
      g.font = `700 ${Math.round(0.34 * sy)}px "Space Grotesk", Inter, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, W / 2, gy + 0.28 * sy, sw - 10);
      ge.fillStyle = isOffice ? '#f5b83d' : '#ffe6a6';
      ge.font = g.font;
      ge.textAlign = 'center';
      ge.textBaseline = 'middle';
      ge.fillText(label, W / 2, gy + 0.28 * sy, sw - 10);
      return { map: tex(c), emissiveMap: tex(ce) };
    }

    _building(x, z, w, d, h, opts = {}) {
      const base = opts.color || pick(PALETTE);
      const f = this._facade(w, h, base, opts.shop || pick(SHOPS), opts.office);
      const side = new THREE.MeshStandardMaterial({
        map: f.map,
        emissiveMap: f.emissiveMap,
        emissive: '#ffffff',
        emissiveIntensity: 0,
        roughness: 0.85,
      });
      const roof = new THREE.MeshStandardMaterial({ color: shade(base, -0.28), roughness: 1 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
      m.position.set(x, STREET_Y + h / 2, z);
      this.root.add(m);
      this.lit.push({ m: side, day: 0, evening: 0.55, night: 1.0 });
      if (!opts.office) {
        // roof details: parapet, water tank / AC units
        const par = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.3, 0.5, d + 0.3),
          new THREE.MeshStandardMaterial({ color: shade(base, -0.12), roughness: 1 }),
        );
        par.position.set(x, STREET_Y + h + 0.05, z);
        this.root.add(par);
        const inner = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.52, d - 0.4), roof);
        inner.position.set(x, STREET_Y + h + 0.07, z);
        this.root.add(inner);
        if (rnd() < 0.5) {
          const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 0.8, 1.4, 12),
            new THREE.MeshStandardMaterial({ color: '#8b6a4f', roughness: 0.9 }),
          );
          tank.position.set(x + (rnd() - 0.5) * (w - 2), STREET_Y + h + 1.4, z + (rnd() - 0.5) * (d - 2));
          this.root.add(tank);
        } else {
          const ac = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 0.8, 1),
            new THREE.MeshStandardMaterial({ color: '#d7dbe0', roughness: 0.6 }),
          );
          ac.position.set(x + (rnd() - 0.5) * (w - 2), STREET_Y + h + 0.7, z + (rnd() - 0.5) * (d - 2));
          this.root.add(ac);
        }
        // 3D awning in front of the shop
        if (opts.facing) {
          const aw = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.92, 0.08, 1.3),
            new THREE.MeshStandardMaterial({
              color: pick(['#e8604c', '#3fb6a8', '#f6c445', '#5aa6e0']),
              roughness: 0.8,
            }),
          );
          aw.position.set(x, STREET_Y + 2.7, z + opts.facing * (d / 2 + 0.6));
          aw.rotation.x = opts.facing * 0.25;
          this.root.add(aw);
        }
      }
      return m;
    }

    _officeBuilding() {
      // the building the office sits in: shop floor + facade under the office floor
      const h = -STREET_Y - 0.25;
      this._building(0, 0, 34, 24, h, { office: true, color: '#e9d8bf', shop: 'FAST SALES' });
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(34.4, 0.3, 24.4),
        new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.8 }),
      );
      slab.position.y = -0.18;
      this.root.add(slab);
    }

    _row(z0, z1, x0, x1, facing, hmin, hmax) {
      let x = x0;
      while (x < x1) {
        const w = 7 + rnd() * 6,
          d = Math.abs(z1 - z0);
        if (x + w > -20 && x < 20 && Math.abs(z0) < 13) {
          x += w;
          continue;
        }
        if (this.demo && z0 > 0 && (this.demo.skipFront || []).some(([a, b]) => x + w > a && x < b)) {
          x += w;
          continue;
        }
        this._building(x + w / 2, (z0 + z1) / 2, w - 0.2, d, hmin + rnd() * (hmax - hmin), { facing });
        x += w;
      }
    }
    _blocks() {
      const far = this.q === 'low' ? 70 : 110;
      this._row(-36, -26, -far, far, 1, 9, 24); // behind the main street (seen through the windows)
      this._row(24, 31, -far, far, -1, 6, 9); // low shops in front (keeps the camera view open)
      // side blocks (next to the office building)
      if (!this.demo)
        [
          [-37, -27, 1],
          [27, 37, -1],
        ].forEach(([a, b, f]) => {
          let z = -12;
          while (z < 12) {
            const d = 6 + rnd() * 4;
            this._buildingSide((a + b) / 2, z + d / 2, b - a, d - 0.2, 8 + rnd() * 10, f);
            z += d;
          }
        });
    }
    _buildingSide(x, z, w, d, h, f) {
      return this._building(x, z, w, d, h, {});
    }

    _skyline() {
      const [c, g] = canvas(128, 256);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 128, 256);
      g.fillStyle = 'rgba(70,90,120,.35)';
      for (let y = 8; y < 256; y += 12) for (let x = 6; x < 128; x += 14) g.fillRect(x, y, 8, 7);
      const [ce, ge] = canvas(128, 256);
      ge.fillStyle = '#000';
      ge.fillRect(0, 0, 128, 256);
      for (let y = 8; y < 256; y += 12)
        for (let x = 6; x < 128; x += 14)
          if (rnd() < 0.4) {
            ge.fillStyle = rnd() < 0.8 ? '#ffd88a' : '#bcdcff';
            ge.fillRect(x, y, 8, 7);
          }
      const map = tex(c, [1, 1]),
        em = tex(ce, [1, 1]);
      const n = this.q === 'low' ? 18 : 34;
      for (let i = 0; i < n; i++) {
        const w = 6 + rnd() * 10,
          h = 22 + rnd() * 50;
        const ang = -Math.PI * 0.95 + (i / n) * Math.PI * 0.9,
          r = 85 + rnd() * 40;
        const x = Math.cos(ang) * r * 1.3,
          z = Math.sin(ang) * r - 20;
        const col = pick(['#b9c8e6', '#c9b8e6', '#a8d4e0', '#d9c6b3', '#c2d6c0']);
        const m = new THREE.MeshStandardMaterial({
          color: col,
          map,
          emissiveMap: em,
          emissive: '#ffffff',
          emissiveIntensity: 0,
          roughness: 0.9,
        });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), m);
        b.position.set(x, STREET_Y + h / 2, z);
        this.root.add(b);
        this.lit.push({ m, day: 0, evening: 0.6, night: 1.1 });
        if (rnd() < 0.25) {
          // spire
          const sp = new THREE.Mesh(new THREE.ConeGeometry(w * 0.3, 8, 8), m);
          sp.position.set(x, STREET_Y + h + 4, z);
          this.root.add(sp);
        }
      }
    }

    /* ---------------- street furniture ---------------- */
    _lamps() {
      const post = new THREE.MeshStandardMaterial({ color: '#3c4452', roughness: 0.5, metalness: 0.4 });
      const bulb = new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffd58a', emissiveIntensity: 0.2 });
      this.lit.push({ m: bulb, day: 0.2, evening: 2.2, night: 3.2 });
      const postG = new THREE.CylinderGeometry(0.08, 0.12, 4.2, 8),
        headG = new THREE.SphereGeometry(0.28, 12, 10),
        capG = new THREE.ConeGeometry(0.34, 0.3, 10);
      const lamp = (x, z) => {
        const p = new THREE.Mesh(postG, post);
        p.position.set(x, STREET_Y + 2.1, z);
        this.root.add(p);
        const h = new THREE.Mesh(headG, bulb);
        h.position.set(x, STREET_Y + 4.35, z);
        this.root.add(h);
        const c = new THREE.Mesh(capG, post);
        c.position.set(x, STREET_Y + 4.65, z);
        this.root.add(c);
      };
      for (let x = -70; x <= 70; x += 14) {
        lamp(x, -14.6);
        lamp(x + 7, -23.4);
        lamp(x, 14.1);
      }
      for (let z = -8; z <= 8; z += 8) {
        lamp(-19.1, z);
        lamp(19.1, z);
      }
    }
    _trees() {
      const trunk = new THREE.MeshStandardMaterial({ color: '#8a5a3b', roughness: 1 });
      const leaves = ['#5fb760', '#4ea457', '#7cc36b', '#3f9a5c'].map(
        c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }),
      );
      const tG = new THREE.CylinderGeometry(0.15, 0.22, 2.2, 7),
        cG = new THREE.IcosahedronGeometry(1.2, 1);
      const tree = (x, z) => {
        const t = new THREE.Mesh(tG, trunk);
        t.position.set(x, STREET_Y + 1.2, z);
        this.root.add(t);
        const c = new THREE.Mesh(cG, pick(leaves));
        c.position.set(x, STREET_Y + 3.1, z);
        c.scale.set(1, 1.15, 1);
        this.root.add(c);
        const c2 = new THREE.Mesh(cG, pick(leaves));
        c2.position.set(x + 0.5, STREET_Y + 2.6, z + 0.3);
        c2.scale.setScalar(0.65);
        this.root.add(c2);
      };
      for (let x = -63; x <= 63; x += 14) {
        tree(x, -24.6);
        tree(x + 4, 22.8);
        if (Math.abs(x) > 22) tree(x + 6, -13.4);
      }
      [
        [-26, -6],
        [-26, 6],
        [26, -6],
        [26, 6],
      ].forEach(([x, z]) => tree(x, z));
      // benches & planters near the office entrance
      const bench = new THREE.MeshStandardMaterial({ color: '#9b6b43', roughness: 0.8 });
      [-8, 8].forEach(x => {
        const b = new THREE.Mesh(new RoundedBoxGeometry(2, 0.12, 0.6, 2, 0.04), bench);
        b.position.set(x, STREET_Y + 0.75, 13.6);
        this.root.add(b);
      });
    }

    /* ---------------- moving things ---------------- */
    _car(color) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        (this._carG ||= new RoundedBoxGeometry(2.2, 0.62, 1.05, 3, 0.2)),
        new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.25 }),
      );
      body.position.y = 0.55;
      g.add(body);
      const cab = new THREE.Mesh(
        (this._cabG ||= new RoundedBoxGeometry(1.2, 0.5, 0.95, 3, 0.18)),
        (this._cabM ||= new THREE.MeshStandardMaterial({ color: '#2b3a4f', roughness: 0.15, metalness: 0.5 })),
      );
      cab.position.set(-0.12, 1.02, 0);
      g.add(cab);
      const roof = new THREE.Mesh((this._roofG ||= new RoundedBoxGeometry(1.0, 0.08, 0.86, 2, 0.04)), body.material);
      roof.position.set(-0.12, 1.29, 0);
      g.add(roof);
      const wheelG = (this._wheelG ||= new THREE.CylinderGeometry(0.27, 0.27, 1.12, 14));
      const wheelM = (this._wheelM ||= new THREE.MeshStandardMaterial({ color: '#16181d', roughness: 0.8 }));
      [-0.68, 0.68].forEach(x => {
        const w = new THREE.Mesh(wheelG, wheelM);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.28, 0);
        g.add(w);
      });
      const head = new THREE.Mesh(
        (this._lightG ||= new THREE.BoxGeometry(0.06, 0.12, 0.85)),
        (this._headM ||= new THREE.MeshStandardMaterial({
          color: '#fffbe8',
          emissive: '#fff2c4',
          emissiveIntensity: 0.3,
        })),
      );
      head.position.set(1.1, 0.62, 0);
      g.add(head);
      const tail = new THREE.Mesh(
        this._lightG,
        (this._tailM ||= new THREE.MeshStandardMaterial({
          color: '#ff5a4a',
          emissive: '#ff3322',
          emissiveIntensity: 0.3,
        })),
      );
      tail.position.set(-1.1, 0.62, 0);
      g.add(tail);
      if (!this._carLit) {
        this._carLit = true;
        this.lit.push({ m: this._headM, day: 0.3, evening: 3, night: 4 });
        this.lit.push({ m: this._tailM, day: 0.3, evening: 2, night: 2.5 });
      }
      const shadow = new THREE.Mesh(
        (this._shG ||= new THREE.PlaneGeometry(2.4, 1.3)),
        (this._shM ||= new THREE.MeshBasicMaterial({
          color: '#000',
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        })),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.02;
      g.add(shadow);
      return g;
    }
    _traffic() {
      const per = this.q === 'low' ? 3 : 6;
      const lanes = [
        { axis: 'x', c: -16.8, dir: 1, min: -90, max: 90 },
        { axis: 'x', c: -21.2, dir: -1, min: -90, max: 90 },
        { axis: 'x', c: 16.3, dir: -1, min: -90, max: 90 },
        { axis: 'x', c: 19.7, dir: 1, min: -90, max: 90 },
        { axis: 'z', c: -21, dir: 1, min: -70, max: 60 },
        { axis: 'z', c: -23, dir: -1, min: -70, max: 60 },
        { axis: 'z', c: 21, dir: -1, min: -70, max: 60 },
        { axis: 'z', c: 23, dir: 1, min: -70, max: 60 },
      ];
      lanes.forEach((ln, li) => {
        const n = ln.axis === 'x' ? per : Math.max(2, Math.round(per / 2));
        for (let i = 0; i < n; i++) {
          const car = this._car(pick(CAR_COLORS));
          const span = ln.max - ln.min,
            s = ln.min + (i / n) * span + rnd() * (span / n) * 0.5;
          car.rotation.y = ln.axis === 'x' ? (ln.dir > 0 ? 0 : Math.PI) : ln.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
          this.root.add(car);
          this.cars.push({ g: car, ln, s, v: 5 + rnd() * 4, vmax: 5 + rnd() * 4 });
        }
      });
    }
    _tram() {
      const g = new THREE.Group();
      const cream = new THREE.MeshStandardMaterial({ color: '#f3dca0', roughness: 0.6 });
      const orange = new THREE.MeshStandardMaterial({ color: '#e8862f', roughness: 0.6 });
      const [c, x] = canvas(512, 64);
      x.fillStyle = '#f3dca0';
      x.fillRect(0, 0, 512, 64);
      for (let i = 0; i < 8; i++) {
        x.fillStyle = '#7cc1d6';
        x.fillRect(14 + i * 62, 8, 50, 46);
        x.fillStyle = 'rgba(255,255,255,.4)';
        x.fillRect(18 + i * 62, 10, 12, 42);
      }
      const [ce, xe] = canvas(512, 64);
      xe.fillStyle = '#000';
      xe.fillRect(0, 0, 512, 64);
      for (let i = 0; i < 8; i++) {
        xe.fillStyle = '#ffe0a0';
        xe.fillRect(14 + i * 62, 8, 50, 46);
      }
      const winM = new THREE.MeshStandardMaterial({
        map: tex(c),
        emissiveMap: tex(ce),
        emissive: '#ffffff',
        emissiveIntensity: 0,
        roughness: 0.4,
      });
      this.lit.push({ m: winM, day: 0, evening: 0.9, night: 1.2 });
      const lower = new THREE.Mesh(new RoundedBoxGeometry(10, 1.1, 2.3, 3, 0.25), orange);
      lower.position.y = 0.95;
      g.add(lower);
      const upper = new THREE.Mesh(new RoundedBoxGeometry(10, 1.4, 2.25, 3, 0.3), [
        cream,
        cream,
        cream,
        cream,
        winM,
        winM,
      ]);
      upper.position.y = 2.15;
      g.add(upper);
      const sideWin = new THREE.Mesh(new THREE.BoxGeometry(9.6, 1.0, 2.28), [cream, cream, cream, cream, winM, winM]);
      sideWin.rotation.y = Math.PI / 2;
      sideWin.visible = false;
      const winPlane = zs => {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 1.0), winM);
        p.position.set(0, 2.2, zs * 1.14);
        if (zs < 0) p.rotation.y = Math.PI;
        g.add(p);
      };
      winPlane(1);
      winPlane(-1);
      const roof = new THREE.Mesh(new RoundedBoxGeometry(10.2, 0.25, 2.4, 2, 0.1), orange);
      roof.position.y = 2.95;
      g.add(roof);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6),
        new THREE.MeshStandardMaterial({ color: '#333' }),
      );
      pole.position.set(0, 4, 0);
      pole.rotation.z = 0.5;
      g.add(pole);
      const wire = new THREE.Mesh(
        new THREE.BoxGeometry(320, 0.03, 0.03),
        new THREE.MeshStandardMaterial({ color: '#2b2b2b' }),
      );
      wire.position.set(0, STREET_Y + 4.95, -19);
      this.root.add(wire);
      g.position.set(-60, STREET_Y, -19);
      this.root.add(g);
      this.tram = { g, x: -60, v: 4.5, stopUntil: 0 };
    }
    _people() {
      const n = this.q === 'low' ? 16 : 44;
      const paths = [
        { axis: 'x', c: -13.4, min: -80, max: 80 },
        { axis: 'x', c: -24.6, min: -80, max: 80 },
        { axis: 'x', c: 13.3, min: -80, max: 80 },
        { axis: 'x', c: 22.8, min: -80, max: 80 },
        { axis: 'z', c: -18.2, min: -10, max: 10 },
        { axis: 'z', c: 18.2, min: -10, max: 10 },
        { axis: 'z', c: -25.8, min: -50, max: 50 },
        { axis: 'z', c: 25.8, min: -50, max: 50 },
      ];
      const tops = [
        '#e8604c',
        '#3fb6a8',
        '#f6c445',
        '#5aa6e0',
        '#9b7fd1',
        '#ffffff',
        '#2c3e66',
        '#7cc36b',
        '#ef8f6b',
        '#e98aa8',
      ];
      for (let i = 0; i < n; i++) {
        const f = rnd() < 0.5;
        const p = makePerson({
          gender: f ? 'f' : 'm',
          skin: pick(SKIN),
          hair: pick(HAIR),
          hairStyle: f ? pick(['long', 'bob', 'bun', 'pony']) : pick(['side', 'quiff', 'buzz']),
          top: pick(tops),
          bottom: pick(['#2b2f3a', '#3a4a6b', '#6b5a48', '#1f2430', '#8a8f99']),
          skirt: f && rnd() < 0.3,
          detail: false,
          sleeves: rnd() < 0.4 ? 'short' : '',
        });
        const path = paths[i % paths.length];
        const dir = rnd() < 0.5 ? 1 : -1;
        const standing = rnd() < 0.18;
        p.g.rotation.y = path.axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
        const s = path.min + rnd() * (path.max - path.min);
        p.g.position.set(
          path.axis === 'x' ? s : path.c + (rnd() - 0.5) * 0.8,
          STREET_Y + 0.24,
          path.axis === 'x' ? path.c + (rnd() - 0.5) * 0.8 : s,
        );
        if (standing) p.g.rotation.y += Math.PI / 2;
        const sh = new THREE.Mesh(
          (this._pshG ||= new THREE.CircleGeometry(0.35, 12)),
          this._shM ||
            new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18, depthWrite: false }),
        );
        sh.rotation.x = -Math.PI / 2;
        sh.position.y = 0.01;
        p.g.add(sh);
        this.root.add(p.g);
        this.walkers.push({ p, path, dir, s, v: 1.1 + rnd() * 0.6, standing, k: rnd() * 10 });
      }
    }
    _sky() {
      const cloudM = (this.cloudM = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 1,
        emissive: '#ffffff',
        emissiveIntensity: 0.35,
      }));
      const ball = new THREE.SphereGeometry(1, 12, 10);
      const n = this.q === 'low' ? 6 : 12;
      for (let i = 0; i < n; i++) {
        const g = new THREE.Group();
        const k = 3 + Math.floor(rnd() * 4);
        for (let j = 0; j < k; j++) {
          const b = new THREE.Mesh(ball, cloudM);
          b.position.set(j * 2.4 - k, rnd() * 1.2, rnd() * 2);
          b.scale.set(2.4 + rnd() * 1.5, 1.4 + rnd(), 1.8 + rnd());
          g.add(b);
        }
        g.position.set(-120 + rnd() * 240, 34 + rnd() * 16, -110 + rnd() * 80);
        this.root.add(g);
        this.clouds.push({ g, v: 0.6 + rnd() * 0.8 });
      }
      const birdM = new THREE.MeshBasicMaterial({ color: '#2d3142', side: THREE.DoubleSide });
      const wing = new THREE.PlaneGeometry(0.9, 0.25);
      for (let i = 0; i < 7; i++) {
        const g = new THREE.Group();
        const l = new THREE.Mesh(wing, birdM),
          r = new THREE.Mesh(wing, birdM);
        l.position.x = -0.45;
        r.position.x = 0.45;
        g.add(l);
        g.add(r);
        g.position.set(-60 + i * 3, 22 + Math.sin(i) * 2, -40 + i * 1.5);
        this.root.add(g);
        this.birds.push({ g, l, r, k: i * 0.7 });
      }
    }

    /* ---------------- time of day ---------------- */
    setTimeOfDay(tod) {
      this.tod = tod;
      this.lit.forEach(x => {
        x.m.emissiveIntensity = x[tod] ?? 0;
      });
      this.groundMat.color.set(tod === 'day' ? '#cfc6b4' : tod === 'evening' ? '#9d8e88' : '#3a3d48');
      this.cloudM.color.set(tod === 'day' ? '#ffffff' : tod === 'evening' ? '#ffc9b0' : '#4a5470');
      this.cloudM.emissive.set(tod === 'day' ? '#ffffff' : tod === 'evening' ? '#ff9e80' : '#1e2436');
      this.cloudM.emissiveIntensity = tod === 'night' ? 0.4 : 0.35;
      this.birds.forEach(b => {
        b.g.visible = tod !== 'night';
      });
    }

    /* ---------------- animation ---------------- */
    update(dt, t) {
      dt = Math.min(dt, 0.1);
      // cars: keep distance from the car ahead, stop for the tram crossing a side street
      for (const c of this.cars) {
        const ahead = this.cars
          .filter(o => o !== c && o.ln === c.ln)
          .reduce((best, o) => {
            let d = (o.s - c.s) * c.ln.dir;
            if (d < 0) d += c.ln.max - c.ln.min;
            return Math.min(best, d);
          }, 1e9);
        const target = ahead < 4.5 ? 0 : ahead < 8 ? c.vmax * 0.4 : c.vmax;
        c.v += (target - c.v) * Math.min(1, dt * 2.5);
        c.s += c.v * c.ln.dir * dt;
        if (c.s > c.ln.max) c.s = c.ln.min;
        if (c.s < c.ln.min) c.s = c.ln.max;
        if (c.ln.axis === 'x') c.g.position.set(c.s, STREET_Y, c.ln.c);
        else c.g.position.set(c.ln.c, STREET_Y, c.s);
      }
      // tram with a stop in front of the office
      const tr = this.tram;
      if (tr) {
        const now = t;
        if (tr.stopUntil > now) {
          /* waiting at the stop */
        } else {
          const prev = tr.x;
          tr.x += tr.v * dt;
          if (prev < -6 && tr.x >= -6) tr.stopUntil = now + 4;
          if (tr.x > 95) tr.x = -95;
        }
        tr.g.position.x = tr.x;
      }
      // pedestrians
      for (const w of this.walkers) {
        if (w.standing) {
          w.p.animate(t, 'talk', w.k);
          continue;
        }
        w.s += w.v * w.dir * dt;
        if (w.s > w.path.max) w.s = w.path.min;
        if (w.s < w.path.min) w.s = w.path.max;
        if (w.path.axis === 'x') w.p.g.position.x = w.s;
        else w.p.g.position.z = w.s;
        w.p.animate(t * (0.85 + w.v * 0.1), 'walk', w.k);
      }
      for (const c of this.clouds) {
        c.g.position.x += c.v * dt;
        if (c.g.position.x > 140) c.g.position.x = -140;
      }
      for (const b of this.birds) {
        b.g.position.x += 6 * dt;
        b.g.position.y += Math.sin(t + b.k) * 0.01;
        if (b.g.position.x > 120) b.g.position.x = -120;
        const f = Math.sin(t * 10 + b.k) * 0.6;
        b.l.rotation.z = f;
        b.r.rotation.z = -f;
      }
    }
  }

  return { City, STREET_Y };
})();
