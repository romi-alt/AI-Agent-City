// @ts-nocheck
// The living city around the office, dressed as Midtown Manhattan: avenues and cross streets, brick and limestone shop
// fronts with fire escapes and rooftop water towers, taxis and buses, subway entrances, steam, hot-dog carts, hydrants,
// pedestrians, sky. The design file's illustrated look (canvas awnings and signs, rounded cars, soft colours) is kept;
// the palette is New York. Everything is generated in code: no model, texture or image downloads.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { P3 } from './people';
import { N3 } from './nyc';

export const C3 = (() => {
  const { makePerson, SKIN, HAIR } = P3;
  const { STREET_Y } = N3;

  const PALETTE = [...N3.BRICKS, ...N3.STONES, ...N3.BROWNSTONES, '#a89c86', '#8d6e5a', '#b9a58a'];
  const SHOPS = N3.SHOPS;
  // New York traffic is mostly yellow cabs
  const CAB = '#f2b807';
  const CAR_COLORS = ['#1c1f26', '#f3f1ec', '#8b919b', '#2c4a6e', '#8a2b2b', '#4a4f57', '#d9dde3', '#2d3b34'];
  const TOPS = [
    '#1f2430',
    '#3a3f4b',
    '#e8e2d4',
    '#2c3e66',
    '#8a6a4a',
    '#b5483a',
    '#5a6b7a',
    '#ffffff',
    '#4a5a40',
    '#d9a441',
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

  const GROUND = { day: '#bdb8ae', evening: '#8f8480', night: '#3a3d48' };

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
      this.steam = [];
      this.tod = 'day';
      seed = 20101;
      this.X = { cornice: [], awn: [], ac: [], tank: [], fe: [], stoop: [] };
      this._ground();
      this._streets();
      this._officeBuilding();
      this._blocks();
      this._flushRoofs();
      if (!demo) this._skyline();
      this._lamps();
      this._props();
      this._trees();
      this._traffic();
      this._people();
      this._sky();
    }

    inst(geo, mat, list, colors) {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const d = new THREE.Object3D(),
        c = new THREE.Color();
      list.forEach((o, i) => {
        d.position.set(o.x, o.y, o.z);
        d.rotation.set(o.rx || 0, o.ry || 0, 0);
        d.scale.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
        if (colors) im.setColorAt(i, c.set(o.c));
      });
      im.frustumCulled = false;
      this.root.add(im);
      return im;
    }

    /* ---------------- ground, roads, sidewalks ---------------- */
    _ground() {
      const g = new THREE.Mesh(
        new THREE.PlaneGeometry(330, 330),
        new THREE.MeshStandardMaterial({ color: GROUND.day, roughness: 1 }),
      );
      g.rotation.x = -Math.PI / 2;
      g.position.y = STREET_Y - 0.05;
      this.root.add(g);
      this.groundMat = g.material;
    }
    _road(x0, x1, z0, z1, axis) {
      const [c, g] = canvas(256, 256);
      g.fillStyle = '#4a4f5a';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 500; i++) {
        g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`;
        g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
      }
      for (let i = 0; i < 6; i++) {
        g.fillStyle = 'rgba(0,0,0,.12)'; // patched asphalt
        g.fillRect(rnd() * 220, rnd() * 240, 30 + rnd() * 20, 10 + rnd() * 10);
      }
      g.fillStyle = '#e9bf3c';
      g.fillRect(0, 124, 256, 4);
      g.fillRect(0, 130, 256, 4); // double yellow centre line
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillRect(0, 6, 256, 3);
      g.fillRect(0, 247, 256, 3);
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
      g.fillStyle = '#cfcac0';
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(90,86,80,.35)';
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
        new THREE.MeshStandardMaterial({ color: '#a9a398', roughness: 1 }),
      );
      curb.position.copy(m.position);
      curb.position.y -= 0.01;
      this.root.add(curb);
    }
    _streets() {
      const L = 160;
      // the street behind the office and the one in front (both cross streets), and the two avenues beside it
      this._road(-L, L, -23, -15, 'x');
      this._road(-L, L, 14.5, 21.5, 'x');
      this._road(-24.5, -19.5, -L, L, 'z');
      this._road(19.5, 24.5, -L, L, 'z');
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
      // crosswalks: New York's "ladder" bars
      const zebra = new THREE.MeshStandardMaterial({ color: '#f1eee6', roughness: 0.9 });
      const bar = new THREE.PlaneGeometry(0.5, 4.4);
      const bars = [];
      const stripes = (x, z, along) => {
        for (let i = -3; i <= 3; i++)
          bars.push({
            x: x + (along === 'x' ? i * 0.9 : 0),
            y: STREET_Y + 0.02,
            z: z + (along === 'z' ? i * 0.9 : 0),
            ry: along === 'x' ? 0 : Math.PI / 2,
          });
      };
      [-22, 22].forEach(x => stripes(x, -13.5, 'z'));
      [
        [-22, -19],
        [22, -19],
        [-22, 18],
        [22, 18],
      ].forEach(([x, z]) => stripes(x + (x < 0 ? 4 : -4), z, 'x'));
      const zi = this.inst(bar, zebra, bars);
      if (zi) {
        // lay the bars flat
        const d = new THREE.Object3D();
        bars.forEach((b, i) => {
          d.position.set(b.x, b.y, b.z);
          d.rotation.set(-Math.PI / 2, 0, b.ry);
          d.updateMatrix();
          zi.setMatrixAt(i, d.matrix);
        });
      }
      // a red bus lane along the north cross street
      const lane = new THREE.Mesh(
        new THREE.PlaneGeometry(2 * L, 2.1),
        new THREE.MeshStandardMaterial({ color: '#8f3b36', roughness: 0.95 }),
      );
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(0, STREET_Y + 0.012, -16.8);
      this.root.add(lane);
    }

    /* ---------------- buildings ---------------- */
    _facade(w, h, base, shop, isOffice = false) {
      const PX = this.q === 'low' ? 22 : 30,
        W = Math.min(1024, Math.round(w * PX)),
        H = Math.min(1024, Math.round(h * PX));
      const sx = W / w,
        sy = H / h;
      const [c, g] = canvas(W, H),
        [ce, ge] = canvas(W, H);
      ge.fillStyle = '#000';
      ge.fillRect(0, 0, W, H);
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, shade(base, 0.05));
      grd.addColorStop(1, shade(base, -0.07));
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      // brick courses
      g.fillStyle = 'rgba(0,0,0,.06)';
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
      const glass = isOffice ? '#a9d8ee' : pick(['#5d7487', '#4f6678', '#6b8396', '#7f8f9c']);
      const trim = shade(base, 0.28);
      for (let fy = groundH; fy < h - 1; fy += floorH) {
        const y = H - (fy + floorH - 0.6) * sy;
        for (let i = 0; i < cols; i++) {
          const x = (i * cw + cw * 0.22) * sx,
            ww = cw * 0.56 * sx,
            wh = 1.7 * sy;
          g.fillStyle = trim;
          g.fillRect(x - 3, y - 4, ww + 6, wh + 7); // frame and lintel
          const gg = g.createLinearGradient(0, y, 0, y + wh);
          gg.addColorStop(0, shade(glass, 0.1));
          gg.addColorStop(1, shade(glass, -0.12));
          g.fillStyle = gg;
          g.fillRect(x, y, ww, wh);
          g.fillStyle = 'rgba(255,255,255,.3)';
          g.beginPath();
          g.moveTo(x + ww * 0.15, y + wh);
          g.lineTo(x + ww * 0.45, y);
          g.lineTo(x + ww * 0.6, y);
          g.lineTo(x + ww * 0.3, y + wh);
          g.fill();
          if (rnd() < 0.3) {
            g.fillStyle = pick(['#e8e2d4', '#d9c9a8', '#c9a89c']);
            g.fillRect(x, y, ww * 0.28, wh);
            g.fillRect(x + ww * 0.72, y, ww * 0.28, wh);
          }
          g.fillStyle = trim;
          g.fillRect(x - 5, y + wh + 2, ww + 10, 0.12 * sy); // sill
          if (rnd() < 0.12) {
            g.fillStyle = '#4f7a4a';
            for (let k = 0; k < 5; k++) {
              g.beginPath();
              g.arc(x + rnd() * ww, y + wh - 2, 4 + rnd() * 4, 0, 7);
              g.fill();
            }
          }
          g.fillStyle = '#2f3138';
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
      const awn = isOffice ? '#f5b83d' : pick(N3.AWNINGS);
      const swg = g.createLinearGradient(0, gy + 1.1 * sy, 0, H);
      swg.addColorStop(0, '#b9d2dc');
      swg.addColorStop(1, '#7f9fb0');
      g.fillStyle = swg;
      g.fillRect(0.4 * sx, gy + 1.3 * sy, W - 0.8 * sx, groundH * sy - 1.3 * sy);
      ge.fillStyle = '#ffdca0';
      ge.fillRect(0.4 * sx, gy + 1.3 * sy, W - 0.8 * sx, groundH * sy - 1.3 * sy);
      g.fillStyle = 'rgba(30,30,38,.55)';
      for (let x = 0.4 * sx; x < W; x += 2.2 * sx) g.fillRect(x, gy + 1.3 * sy, 3, groundH * sy);
      // awning stripes
      for (let x = 0; x < W; x += 0.5 * sx) {
        g.fillStyle = Math.round(x / (0.5 * sx)) % 2 ? awn : '#efe9da';
        g.fillRect(x, gy + 0.55 * sy, 0.5 * sx + 1, 0.6 * sy);
      }
      g.fillStyle = shade(awn, -0.2);
      g.fillRect(0, gy + 1.12 * sy, W, 4);
      // sign board
      const label = isOffice ? 'FAST SALES TRAINING CENTER' : shop;
      g.fillStyle = isOffice ? '#1c2230' : '#26313d';
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
      const roof = new THREE.MeshStandardMaterial({ color: shade(base, -0.3), roughness: 1 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
      m.position.set(x, STREET_Y + h / 2, z);
      this.root.add(m);
      this.lit.push({ m: side, day: 0, evening: 0.55, night: 1.0 });
      if (!opts.office) {
        const X = this.X;
        X.cornice.push({ x, y: STREET_Y + h - 0.1, z, sx: w + 0.9, sy: 0.7, sz: d + 0.9, c: shade(base, 0.12) });
        if (rnd() < 0.55 && h > 8)
          X.tank.push({
            x: x + (rnd() - 0.5) * (w - 3),
            y: STREET_Y + h,
            z: z + (rnd() - 0.5) * (d - 3),
            ry: rnd() * 6,
            s: 1,
          });
        else
          X.ac.push({
            x: x + (rnd() - 0.5) * (w - 2),
            y: STREET_Y + h + 0.4,
            z: z + (rnd() - 0.5) * (d - 2),
            c: '#cfd3d8',
          });
        if (opts.facing) {
          const zf = z + opts.facing * (d / 2);
          // shop awning over the entrance
          X.awn.push({
            x,
            y: STREET_Y + 2.7,
            z: zf + opts.facing * 0.6,
            rx: opts.facing * 0.25,
            sx: w * 0.92,
            c: pick(N3.AWNINGS),
          });
          // a fire escape on most of the tall fronts, a stoop on the low brownstones
          if (h > 11 && rnd() < 0.7) {
            const cols = Math.max(2, Math.floor(w / 2.4)),
              cw = w / cols,
              ci = Math.floor(rnd() * cols);
            const fx = x - w / 2 + (ci + 0.5) * cw;
            for (let fy = 3.4 + 3.0 - 0.9; fy < h - 3; fy += 3.0)
              X.fe.push({ x: fx, y: STREET_Y + fy, z: zf + opts.facing * 0.5, ry: opts.facing > 0 ? 0 : Math.PI });
          } else if (h <= 11) {
            X.stoop.push({
              x: x + (rnd() - 0.5) * (w - 3),
              y: STREET_Y + 0.6,
              z: zf + opts.facing * 1.0,
              ry: opts.facing > 0 ? 0 : Math.PI,
            });
          }
        }
      }
      return m;
    }

    // shared rooftop and facade extras, one draw call each
    _flushRoofs() {
      const X = this.X;
      const flat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
      const bx = new THREE.BoxGeometry(1, 1, 1);
      this.inst(bx, flat, X.cornice, true);
      const acG = new THREE.BoxGeometry(1.4, 0.8, 1);
      this.inst(acG, new THREE.MeshStandardMaterial({ roughness: 0.6 }), X.ac, true);
      const awG = new THREE.BoxGeometry(1, 0.08, 1.3);
      this.inst(awG, new THREE.MeshStandardMaterial({ roughness: 0.8 }), X.awn, true);
      this.inst(N3.waterTowerGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), X.tank);
      // fire escape: platform, rails and a stair, one floor of it
      const steel = '#23262d';
      const fe = N3.merge([
        N3.part(N3.box(1.9, 0.08, 0.95), steel, 0, 0, 0),
        N3.part(N3.box(1.9, 0.06, 0.04), steel, 0, 0.7, 0.46),
        N3.part(N3.box(0.04, 0.7, 0.95), steel, -0.93, 0.35, 0),
        N3.part(N3.box(0.04, 0.7, 0.95), steel, 0.93, 0.35, 0),
        N3.part(N3.box(1.9, 0.04, 0.04), steel, 0, 0.35, 0.46),
        N3.part(N3.box(0.5, 0.05, 3.3), steel, 0.5, 1.5, 0.15, 0.95, 0, 0),
        N3.part(N3.box(0.04, 1.3, 0.04), steel, -0.9, 0.7, 0.45),
        N3.part(N3.box(0.04, 1.3, 0.04), steel, 0.9, 0.7, 0.45),
      ]);
      this.inst(fe, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }), X.fe);
      // brownstone stoop: a few steps up to the door
      const stoop = N3.merge([
        N3.part(N3.box(1.7, 0.4, 2.2), '#8f8576', 0, -0.4, 0),
        N3.part(N3.box(1.7, 0.4, 1.5), '#8f8576', 0, -0.1, -0.35),
        N3.part(N3.box(1.7, 0.4, 0.8), '#8f8576', 0, 0.3, -0.7),
        N3.part(N3.box(0.08, 0.8, 2.0), '#23262d', -0.86, 0, 0),
        N3.part(N3.box(0.08, 0.8, 2.0), '#23262d', 0.86, 0, 0),
      ]);
      this.inst(stoop, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), X.stoop);
    }

    _officeBuilding() {
      // the building the office sits in: shop floor + facade under the office floor
      const h = -STREET_Y - 0.25;
      this._building(0, 0, 34, 24, h, { office: true, color: '#e3d6bd', shop: 'FAST SALES' });
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
        const w = 6.5 + rnd() * 6,
          d = Math.abs(z1 - z0);
        if (x + w > x1) break;
        // keep the avenues open: they run straight out to the far city
        const band = [
          [-27, -17],
          [17, 27],
        ].find(([a, b]) => x + w > a && x < b);
        if (band) {
          x = band[1];
          continue;
        }
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
      const far = this.q === 'low' ? 66 : 90;
      this._row(-52, -26, -far, far, 1, 10, 22); // the block behind the main street (seen through the windows)
      this._row(24, 31, -far, far, -1, 6, 9); // low brownstone shops in front (keeps the camera view open)
      // side blocks (next to the office building)
      if (!this.demo)
        [
          [-37, -27, 1],
          [27, 37, -1],
        ].forEach(([a, b, f]) => {
          let z = -12;
          while (z < 12) {
            const d = 6 + rnd() * 4;
            this._building((a + b) / 2, z + d / 2, b - a, d - 0.2, 8 + rnd() * 10, {});
            z += d;
          }
        });
    }

    // a ring of setback towers when the city is used on its own (the demo builds the big city instead)
    _skyline() {
      const b = new N3.Batch(),
        r = N3.rngOf(77);
      const n = this.q === 'low' ? 14 : 30;
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI * 0.95 + (i / n) * Math.PI * 0.9,
          rad = 110 + r() * 40;
        const kind = ['deco', 'lime', 'glass'][i % 3];
        const t = N3.setback(
          b,
          kind,
          Math.cos(ang) * rad * 1.3,
          Math.sin(ang) * rad - 20,
          12 + r() * 10,
          12 + r() * 8,
          14 + r() * 24,
          pick(N3.TOWER_TONES),
          r(),
          3,
          r,
        );
        if (r() < 0.4)
          b.spires.push({ x: Math.cos(ang) * rad * 1.3, y: t.top, z: Math.sin(ang) * rad - 20, h: 14, r: 1 });
      }
      b.baseY = STREET_Y;
      b.build(this.root);
      const mats = Object.values(b.items).length ? Object.keys(b.items).map(k => N3.facadeMaterial(k)) : [];
      mats.forEach(m => this.lit.push({ m, day: 0, evening: 0.6, night: 1.1 }));
    }

    /* ---------------- street furniture ---------------- */
    _lamps() {
      const post = new THREE.MeshStandardMaterial({ color: '#2f343c', roughness: 0.5, metalness: 0.4 });
      const bulb = new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffd58a', emissiveIntensity: 0.2 });
      this.lit.push({ m: bulb, day: 0.2, evening: 2.2, night: 3.2 });
      // New York "cobra head": a tall post with an arm that reaches over the road
      const postG = N3.merge([
        N3.part(N3.cyl(0.08, 0.13, 6.2, 8), '#fff', 0, 3.1, 0),
        N3.part(N3.box(1.7, 0.1, 0.1), '#fff', 0.8, 6.15, 0),
      ]);
      const headG = new THREE.CapsuleGeometry(0.2, 0.7, 4, 8);
      headG.rotateZ(Math.PI / 2);
      const lampsP = [],
        headsP = [];
      const lamp = (x, z, toward) => {
        // the arm points toward the road (toward = +1 / -1 along the facing axis)
        lampsP.push({ x, y: STREET_Y, z, ry: toward.ry });
        const a = toward.ry;
        headsP.push({ x: x + Math.cos(a) * 1.5, y: STREET_Y + 6.05, z: z - Math.sin(a) * 1.5, ry: a });
      };
      for (let x = -150; x <= 150; x += 14) {
        lamp(x, -14.6, { ry: Math.PI / 2 }); // arms reach over the road
        lamp(x + 7, -24.4, { ry: -Math.PI / 2 });
        lamp(x, 14.1, { ry: -Math.PI / 2 });
      }
      for (let z = -150; z <= 150; z += 16) {
        if (Math.abs(z) < 14) continue;
        lamp(-19.1, z, { ry: Math.PI });
        lamp(19.1, z, { ry: 0 });
      }
      this.inst(postG, post, lampsP);
      this.inst(headG, bulb, headsP);
    }
    _props() {
      const C = (name, geo, mat, list, colors) => this.inst(geo, mat, list, colors);
      const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
      // hydrants at the corners
      const hyd = N3.merge([
        N3.part(N3.cyl(0.17, 0.2, 0.7, 8), '#c0392b', 0, 0.35, 0),
        N3.part(new THREE.SphereGeometry(0.19, 8, 6), '#c0392b', 0, 0.75, 0),
        N3.part(N3.cyl(0.07, 0.07, 0.5, 6), '#e6c64a', 0, 0.45, 0, 0, 0, Math.PI / 2),
      ]);
      const hydP = [];
      for (let x = -140; x <= 140; x += 28) {
        hydP.push({ x: x + 3, y: STREET_Y + 0.24, z: -14.2 });
        hydP.push({ x: x - 5, y: STREET_Y + 0.24, z: 13.2 });
      }
      C('hyd', hyd, vc, hydP);
      // trash cans
      const can = N3.merge([
        N3.part(N3.cyl(0.28, 0.24, 0.8, 8), '#2c3a33', 0, 0.4, 0),
        N3.part(N3.cyl(0.3, 0.3, 0.06, 8), '#1d2622', 0, 0.82, 0),
      ]);
      const canP = [];
      for (let x = -120; x <= 120; x += 18) canP.push({ x: x + 6, y: STREET_Y + 0.24, z: 23.0 });
      C('can', can, vc, canP);
      // subway entrances with green globe lamps
      const stairs = N3.merge([
        N3.part(N3.box(2.6, 0.5, 3.4), '#7d7f84', 0, 0.25, 0),
        N3.part(N3.box(0.08, 1.1, 3.4), '#25402f', -1.3, 0.75, 0),
        N3.part(N3.box(0.08, 1.1, 3.4), '#25402f', 1.3, 0.75, 0),
        N3.part(N3.box(2.6, 0.9, 0.5), '#3a3c40', 0, 0.45, -1.5),
        N3.part(N3.cyl(0.05, 0.05, 2.1, 6), '#25402f', -1.3, 1.5, 1.6),
        N3.part(N3.cyl(0.05, 0.05, 2.1, 6), '#25402f', 1.3, 1.5, 1.6),
      ]);
      const subs = [
        [-27, -6.2, 0],
        [27, 6.2, 0],
        [-72, 13.0, Math.PI / 2],
        [72, -13.2, -Math.PI / 2],
        [-27, 40, 0],
        [27, -40, 0],
      ].map(([x, z, ry]) => ({ x, y: STREET_Y + 0.24, z, ry }));
      subs.forEach(s => {
        s.x = Math.max(-150, Math.min(150, s.x));
      });
      // keep them on the sidewalk strips beside the avenues
      subs[0].x = -26;
      subs[0].z = -8;
      subs[1].x = 26;
      subs[1].z = 8;
      subs[4].x = -26;
      subs[4].z = 40;
      subs[5].x = 26;
      subs[5].z = -40;
      subs[2].x = -72;
      subs[2].z = 13.3;
      subs[3].x = 72;
      subs[3].z = -13.4;
      C('stairs', stairs, vc, subs);
      const globe = new THREE.MeshStandardMaterial({ color: '#7fe09a', emissive: '#3fe070', emissiveIntensity: 0.6 });
      this.lit.push({ m: globe, day: 0.5, evening: 2.2, night: 3 });
      const gl = [];
      subs.forEach(s => {
        const c = Math.cos(s.ry),
          sn = Math.sin(s.ry);
        [-1.3, 1.3].forEach(dx =>
          gl.push({ x: s.x + c * dx + sn * 1.6, y: STREET_Y + 0.24 + 2.6, z: s.z - sn * dx + c * 1.6 }),
        );
      });
      C('globe', new THREE.SphereGeometry(0.22, 10, 8), globe, gl);
      // hot-dog carts: a steel cart with a striped umbrella
      const cart = N3.merge([
        N3.part(N3.box(1.6, 0.9, 0.8), '#c9ccd2', 0, 0.8, 0),
        N3.part(N3.box(1.7, 0.1, 0.9), '#8b9099', 0, 1.3, 0),
        N3.part(N3.cyl(0.04, 0.04, 2.3, 6), '#555', 0.6, 1.9, 0.2),
        N3.part(new THREE.ConeGeometry(1.5, 0.5, 8), '#e8b523', 0.6, 3.1, 0.2),
        N3.part(new THREE.ConeGeometry(1.0, 0.45, 8), '#d6402f', 0.6, 3.15, 0.2),
        N3.part(N3.cyl(0.3, 0.3, 0.1, 10), '#222', -0.6, 0.3, 0.45, Math.PI / 2, 0, 0),
        N3.part(N3.cyl(0.3, 0.3, 0.1, 10), '#222', -0.6, 0.3, -0.45, Math.PI / 2, 0, 0),
      ]);
      C('cart', cart, vc, [
        { x: -30, y: STREET_Y + 0.24, z: -13.2, ry: 0.3 },
        { x: 31, y: STREET_Y + 0.24, z: 13.2, ry: -0.2 },
        { x: -75, y: STREET_Y + 0.24, z: 13.2, ry: 0.1 },
        { x: 68, y: STREET_Y + 0.24, z: -13.0, ry: 0.4 },
        { x: 6, y: STREET_Y + 0.24, z: 22.6, ry: 0.0 },
      ]);
      // newsstands
      const news = N3.merge([
        N3.part(N3.box(2.2, 2.2, 1.4), '#2f4b3a', 0, 1.1, 0),
        N3.part(N3.box(2.5, 0.12, 1.7), '#1f3326', 0, 2.3, 0),
        N3.part(N3.box(1.8, 0.5, 0.06), '#e8c07a', 0, 1.3, 0.72),
      ]);
      C('news', news, vc, [
        { x: -40, y: STREET_Y + 0.24, z: 23.0, ry: Math.PI },
        { x: 50, y: STREET_Y + 0.24, z: -24.8, ry: 0 },
        { x: -12, y: STREET_Y + 0.24, z: -13.4, ry: 0 },
      ]);
      // bus shelters
      const shelter = N3.merge([
        N3.part(N3.box(3.2, 0.1, 1.3), '#2b2f36', 0, 2.5, 0),
        N3.part(N3.box(0.08, 2.5, 1.2), '#2b2f36', -1.55, 1.25, 0),
        N3.part(N3.box(3.0, 1.9, 0.04), '#9fc3d6', 0, 1.4, -0.6),
        N3.part(N3.box(2.2, 0.08, 0.5), '#6b4a2f', 0, 0.55, -0.3),
      ]);
      C('shelter', shelter, vc, [
        { x: -10, y: STREET_Y + 0.24, z: -13.4, ry: 0 },
        { x: 14, y: STREET_Y + 0.24, z: 13.4, ry: Math.PI },
      ]);
      // traffic lights on mast arms at the four crossings
      const tl = N3.merge([
        N3.part(N3.cyl(0.1, 0.12, 5.5, 8), '#2f343c', 0, 2.75, 0),
        N3.part(N3.box(3.4, 0.1, 0.1), '#2f343c', 1.7, 5.4, 0),
        N3.part(N3.box(0.4, 1.1, 0.35), '#1d2026', 3.1, 5.0, 0),
      ]);
      const tlP = [];
      [-1, 1].forEach(sx =>
        [
          [-12.2, 1],
          [12.2, -1],
        ].forEach(([z, f]) =>
          tlP.push({ x: sx * 18.5, y: STREET_Y + 0.24, z: z + (z < 0 ? 0.2 : -0.2), ry: sx > 0 ? Math.PI : 0 }),
        ),
      );
      C('tl', tl, vc, tlP);
      const green = new THREE.MeshStandardMaterial({ color: '#58ff9a', emissive: '#29e070', emissiveIntensity: 0.8 });
      this.lit.push({ m: green, day: 0.8, evening: 2.5, night: 3 });
      C(
        'tlg',
        new THREE.SphereGeometry(0.12, 8, 6),
        green,
        tlP.map(p => ({
          x: p.x + Math.cos(p.ry) * 3.1,
          y: STREET_Y + 0.24 + 4.7,
          z: p.z - Math.sin(p.ry) * 3.1 + 0.2,
        })),
      );
      // steam vents: striped stack and a rising plume
      const vent = N3.merge([
        N3.part(new THREE.ConeGeometry(0.28, 1.5, 10), '#e56a1a', 0, 0.75, 0),
        N3.part(N3.cyl(0.22, 0.3, 0.3, 10), '#f0ece4', 0, 0.9, 0),
      ]);
      const vents = [
        [-24, -2],
        [24, 3],
        [-60, -18.4],
        [40, 18.4],
        [-95, -18.4],
        [20, -18.4],
      ];
      C(
        'vent',
        vent,
        vc,
        vents.map(([x, z]) => ({ x, y: STREET_Y + 0.02, z })),
      );
      const puff = (() => {
        const [c, g] = canvas(64, 64);
        const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        r.addColorStop(0, 'rgba(255,255,255,.9)');
        r.addColorStop(0.5, 'rgba(255,255,255,.35)');
        r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 64, 64);
        return tex(c);
      })();
      this.steamMat = new THREE.SpriteMaterial({
        map: puff,
        transparent: true,
        depthWrite: false,
        opacity: 0.6,
        color: '#ffffff',
      });
      const per = this.q === 'low' ? 2 : 4;
      vents.forEach(([x, z]) => {
        for (let k = 0; k < per; k++) {
          const sp = new THREE.Sprite(this.steamMat.clone());
          sp.position.set(x, STREET_Y + 1.6, z);
          this.root.add(sp);
          this.steam.push({ sp, x, z, k: k / per, y0: STREET_Y + 1.5 });
        }
      });
    }
    _trees() {
      const trunk = new THREE.MeshStandardMaterial({ color: '#6b5a48', roughness: 1 });
      const leaf = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
      const tG = new THREE.CylinderGeometry(0.15, 0.24, 2.6, 7),
        cG = new THREE.IcosahedronGeometry(1.35, 1);
      const cols = ['#5f8f52', '#527f4c', '#6b9a58', '#4a7a50', '#7b9a4c'];
      const T = [],
        Cr = [];
      const tree = (x, z) => {
        T.push({ x, y: STREET_Y + 1.4, z });
        Cr.push({ x, y: STREET_Y + 3.6, z, sx: 1, sy: 1.1, sz: 1, c: pick(cols) });
        Cr.push({ x: x + 0.5, y: STREET_Y + 3.0, z: z + 0.3, s: 0.65, c: pick(cols) });
      };
      for (let x = -147; x <= 147; x += 14) {
        tree(x, -24.6);
        tree(x + 4, 22.8);
        if (Math.abs(x) > 22) tree(x + 6, -13.4);
      }
      for (let z = -150; z <= 150; z += 14) {
        if (Math.abs(z) < 14) continue;
        tree(-26, z);
        tree(26, z);
      }
      this.inst(tG, trunk, T);
      this.inst(cG, leaf, Cr, true);
      // benches by the office entrance
      const bench = new THREE.MeshStandardMaterial({ color: '#7a5a3f', roughness: 0.8 });
      [-8, 8].forEach(x => {
        const b = new THREE.Mesh(new RoundedBoxGeometry(2, 0.12, 0.6, 2, 0.04), bench);
        b.position.set(x, STREET_Y + 0.75, 13.6);
        this.root.add(b);
      });
    }

    /* ---------------- moving things: instanced traffic ---------------- */
    _vehicleKits() {
      const dark = '#16181d',
        glass = '#2b3a4f';
      const wheels = (xs, wz, r, y) =>
        xs.flatMap(x => [wz, -wz].map(z => N3.part(N3.cyl(r, r, 0.3, 12), dark, x, y, z, Math.PI / 2, 0, 0)));
      const bodyGeo = (L, W, H, y) => new RoundedBoxGeometry(L, H, W, 2, 0.18).translate(0, y, 0);
      const mk = {};
      // sedan / cab
      mk.car = {
        len: 4.4,
        body: N3.merge([
          N3.part(bodyGeo(4.4, 1.9, 0.7, 0.55), '#fff'),
          N3.part(new RoundedBoxGeometry(1.1, 0.1, 0.9, 2, 0.04).translate(-0.15, 1.28, 0), '#fff'),
        ]),
        trim: N3.merge([
          N3.part(new RoundedBoxGeometry(2.3, 0.55, 1.75, 2, 0.2).translate(-0.2, 1.0, 0), glass),
          ...wheels([-1.4, 1.4], 0.9, 0.38, 0.38),
        ]),
      };
      mk.van = {
        len: 5.6,
        body: N3.merge([N3.part(bodyGeo(5.6, 2.0, 1.9, 1.15), '#fff')]),
        trim: N3.merge([N3.part(N3.box(0.1, 0.7, 1.7), glass, 2.5, 1.45, 0), ...wheels([-1.8, 1.8], 1.0, 0.42, 0.42)]),
      };
      mk.bus = {
        len: 11.5,
        body: N3.merge([
          N3.part(bodyGeo(11.5, 2.6, 3.0, 1.85), '#fff'),
          N3.part(N3.box(11.4, 0.5, 2.62), '#fff', 0, 0.55, 0),
        ]),
        trim: N3.merge([
          N3.part(N3.box(10.2, 0.95, 2.66), glass, -0.2, 2.4, 0),
          N3.part(N3.box(0.1, 1.2, 2.2), glass, 5.7, 2.3, 0),
          ...wheels([-3.6, 3.4], 1.2, 0.5, 0.5),
        ]),
      };
      return mk;
    }
    _traffic() {
      const lowQ = this.q === 'low';
      const mk = this._vehicleKits();
      const lanes = [
        { axis: 'x', c: -16.8, dir: 1, min: -150, max: 150, n: lowQ ? 5 : 9 },
        { axis: 'x', c: -21.2, dir: -1, min: -150, max: 150, n: lowQ ? 5 : 9 },
        { axis: 'x', c: 16.3, dir: -1, min: -150, max: 150, n: lowQ ? 5 : 9 },
        { axis: 'x', c: 19.7, dir: 1, min: -150, max: 150, n: lowQ ? 5 : 9 },
        { axis: 'z', c: -21, dir: 1, min: -150, max: 150, n: lowQ ? 3 : 6 },
        { axis: 'z', c: -23, dir: -1, min: -150, max: 150, n: lowQ ? 3 : 6 },
        { axis: 'z', c: 21, dir: -1, min: -150, max: 150, n: lowQ ? 3 : 6 },
        { axis: 'z', c: 23, dir: 1, min: -150, max: 150, n: lowQ ? 3 : 6 },
      ];
      const plan = [];
      lanes.forEach((ln, li) => {
        ln.list = [];
        for (let i = 0; i < ln.n; i++) {
          const r = rnd();
          const cls = r < 0.06 ? 'bus' : r < 0.16 ? 'van' : 'car';
          const color =
            cls === 'car'
              ? rnd() < 0.62
                ? CAB
                : pick(CAR_COLORS)
              : cls === 'van'
                ? pick(['#f3f1ec', '#6b4a2f', '#d9dde3'])
                : '#2f5f8f';
          const span = ln.max - ln.min,
            s = ln.min + (i / ln.n) * span + rnd() * (span / ln.n) * 0.5;
          const v = { cls, color, ln, s, v: 5 + rnd() * 4, vmax: 5 + rnd() * 4, len: mk[cls].len, taxi: color === CAB };
          if (li === 0 && i === 0) {
            v.cls = 'bus';
            v.color = '#2f5f8f';
            v.len = mk.bus.len;
            v.stop = true; // stops in front of the office, like the tram did
            v.vmax = 4.5;
            v.v = 4.5;
            v.taxi = false;
            this.bus = v;
          }
          ln.list.push(v);
          plan.push(v);
        }
      });
      this.cars = plan;
      this.lanes = lanes;
      const body = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 });
      const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.4 });
      this.fleet = {};
      for (const cls of ['car', 'van', 'bus']) {
        const list = plan.filter(p => p.cls === cls);
        if (!list.length) continue;
        const b = new THREE.InstancedMesh(mk[cls].body, body, list.length),
          t = new THREE.InstancedMesh(mk[cls].trim, trim, list.length);
        const col = new THREE.Color();
        list.forEach((p, i) => {
          p.i = i;
          b.setColorAt(i, col.set(p.color));
        });
        b.frustumCulled = t.frustumCulled = false;
        this.root.add(b, t);
        this.fleet[cls] = { b, t, list };
      }
      // taxi roof lights, headlights, tail lights
      this.taxis = plan.filter(p => p.taxi);
      const topM = new THREE.MeshStandardMaterial({ color: '#fff4c4', emissive: '#ffe08a', emissiveIntensity: 0.5 });
      this.lit.push({ m: topM, day: 0.4, evening: 2, night: 3 });
      this.taxiTop = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.7, 0.2, 0.3),
        topM,
        Math.max(1, this.taxis.length),
      );
      const headM = new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff2c4', emissiveIntensity: 0.3 });
      const tailM = new THREE.MeshStandardMaterial({ color: '#ff5a4a', emissive: '#ff3322', emissiveIntensity: 0.3 });
      this.lit.push({ m: headM, day: 0.3, evening: 3, night: 4 });
      this.lit.push({ m: tailM, day: 0.3, evening: 2, night: 2.5 });
      const lg = new THREE.BoxGeometry(0.06, 0.14, 0.9);
      this.heads = new THREE.InstancedMesh(lg, headM, plan.length);
      this.tails = new THREE.InstancedMesh(lg, tailM, plan.length);
      [this.taxiTop, this.heads, this.tails].forEach(m => {
        m.frustumCulled = false;
        this.root.add(m);
      });
      this.taxiTop.count = this.taxis.length;
      this._dmy = new THREE.Object3D();
    }
    _placeVehicles() {
      const d = this._dmy;
      const L = [0, 0, 0];
      this.cars.forEach((c, gi) => {
        const ln = c.ln;
        const ry = ln.axis === 'x' ? (ln.dir > 0 ? 0 : Math.PI) : ln.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        const px = ln.axis === 'x' ? c.s : ln.c,
          pz = ln.axis === 'x' ? ln.c : c.s;
        d.position.set(px, STREET_Y, pz);
        d.rotation.set(0, ry, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        const f = this.fleet[c.cls];
        f.b.setMatrixAt(c.i, d.matrix);
        f.t.setMatrixAt(c.i, d.matrix);
        const cos = Math.cos(ry),
          sin = Math.sin(ry);
        const at = (x, y, z) => {
          d.position.set(px + x * cos + z * sin, STREET_Y + y, pz - x * sin + z * cos);
          d.rotation.set(0, ry, 0);
          d.updateMatrix();
        };
        const h = c.cls === 'car' ? 0.62 : c.cls === 'van' ? 0.9 : 0.9;
        at(c.len / 2 + 0.01, h, 0);
        this.heads.setMatrixAt(gi, d.matrix);
        at(-c.len / 2 - 0.01, h, 0);
        this.tails.setMatrixAt(gi, d.matrix);
        if (c.taxi) {
          const ti = this.taxis.indexOf(c);
          at(-0.15, 1.5, 0);
          this.taxiTop.setMatrixAt(ti, d.matrix);
        }
      });
      for (const k of Object.values(this.fleet)) {
        k.b.instanceMatrix.needsUpdate = true;
        k.t.instanceMatrix.needsUpdate = true;
      }
      this.heads.instanceMatrix.needsUpdate =
        this.tails.instanceMatrix.needsUpdate =
        this.taxiTop.instanceMatrix.needsUpdate =
          true;
      return L;
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
      for (let i = 0; i < n; i++) {
        const f = rnd() < 0.5;
        const p = makePerson({
          gender: f ? 'f' : 'm',
          skin: pick(SKIN),
          hair: pick(HAIR),
          hairStyle: f ? pick(['long', 'bob', 'bun', 'pony']) : pick(['side', 'quiff', 'buzz']),
          top: pick(TOPS),
          bottom: pick(['#1f2430', '#2b2f3a', '#3a4a6b', '#4a4238', '#6b6f78']),
          skirt: f && rnd() < 0.3,
          detail: false,
          sleeves: rnd() < 0.3 ? 'short' : '',
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
          (this._shM ||= new THREE.MeshBasicMaterial({
            color: '#000',
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
          })),
        );
        sh.rotation.x = -Math.PI / 2;
        sh.position.y = 0.01;
        p.g.add(sh);
        this.root.add(p.g);
        this.walkers.push({ p, path, dir, s, v: 1.1 + rnd() * 0.6, standing, k: rnd() * 10 });
      }
      this._placeVehicles();
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
        g.position.set(-120 + rnd() * 240, 60 + rnd() * 30, -110 + rnd() * 80);
        g.scale.setScalar(2);
        this.root.add(g);
        this.clouds.push({ g, v: 0.6 + rnd() * 0.8 });
      }
      // pigeons
      const birdM = new THREE.MeshBasicMaterial({ color: '#4a4f58', side: THREE.DoubleSide });
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
      this.groundMat.color.set(GROUND[tod]);
      this.cloudM.color.set(tod === 'day' ? '#ffffff' : tod === 'evening' ? '#ffc9b0' : '#4a5470');
      this.cloudM.emissive.set(tod === 'day' ? '#ffffff' : tod === 'evening' ? '#ff9e80' : '#1e2436');
      this.cloudM.emissiveIntensity = tod === 'night' ? 0.4 : 0.35;
      this.birds.forEach(b => {
        b.g.visible = tod !== 'night';
      });
      this.steam.forEach(s =>
        s.sp.material.color.set(tod === 'night' ? '#aab4d0' : tod === 'evening' ? '#ffd9c4' : '#ffffff'),
      );
    }

    /* ---------------- animation ---------------- */
    update(dt, t) {
      dt = Math.min(dt, 0.1);
      // cars keep their distance from the car ahead; the bus waits at its stop in front of the office
      for (const ln of this.lanes) {
        const span = ln.max - ln.min;
        for (const c of ln.list) {
          let ahead = 1e9;
          for (const o of ln.list) {
            if (o === c) continue;
            let d = (o.s - c.s) * ln.dir;
            if (d < 0) d += span;
            d -= (o.len + c.len) / 2 - 2.2;
            if (d < ahead) ahead = d;
          }
          let target = ahead < 3 ? 0 : ahead < 7 ? c.vmax * 0.4 : c.vmax;
          if (c.stop) {
            if (c.waitUntil > t) target = 0;
          }
          c.v += (target - c.v) * Math.min(1, dt * 2.5);
          c.prev = c.s;
          c.s += c.v * ln.dir * dt;
          if (c.stop && c.prev < -6 && c.s >= -6) c.waitUntil = t + 4;
          if (c.s > ln.max) c.s = ln.min;
          if (c.s < ln.min) c.s = ln.max;
        }
      }
      this._placeVehicles();
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
      for (const s of this.steam) {
        s.k = (s.k + dt * 0.18) % 1;
        const k = s.k;
        s.sp.position.set(s.x + Math.sin(t * 0.7 + s.z) * k * 1.2, s.y0 + k * 9, s.z);
        s.sp.scale.setScalar(1.2 + k * 5);
        s.sp.material.opacity = (1 - k) * Math.min(1, k * 6) * 0.55;
      }
      for (const c of this.clouds) {
        c.g.position.x += c.v * dt;
        if (c.g.position.x > 200) c.g.position.x = -200;
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
