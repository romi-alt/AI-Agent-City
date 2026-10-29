// @ts-nocheck
// The Florida waterfront: river, bridges, boats, towers, beach.
// Ported unchanged from the AutoSalesCity design file (three r160 code, runs on the app's three). Everything is
// generated in code: no model, texture or image downloads.
import * as THREE from 'three';
import { C3 } from './city';

export const F3 = (() => {
  const { STREET_Y } = C3;
  // AutoSalesCity demo: the big Florida waterfront city around the core blocks.
  // A palm-lined river with boats and bridges, a tower skyline across the water,
  // pastel districts in every direction, and a beach with the ocean and a cruise ship.
  // Everything heavy is instanced so the city stays smooth.

  const Y = STREET_Y;
  let seed = 7331;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];

  /** River centre line (world z for a given x). */
  const riverZ = x => 105 + 14 * Math.sin(x / 70) + 6 * Math.sin(x / 23);
  const riverDZ = x => (14 / 70) * Math.cos(x / 70) + (6 / 23) * Math.cos(x / 23);
  const RIVER = { half: 17, west: -620, east: 432 };
  const OCEAN_X = 440;

  function canvasTex(w, h, draw, rep) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (rep) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(...rep);
    }
    return t;
  }

  class Florida {
    constructor(office, { mobile = false } = {}) {
      this.office = office;
      this.scene = office.scene;
      this.mobile = mobile;
      this.root = new THREE.Group();
      this.scene.add(this.root);
      this.lit = [];
      this.boats = [];
      this.bridgeCars = [];
      this.water = [];
      seed = 7331;
      // a much bigger world: see further, keep stars outside the city
      office.camera.far = 3000;
      office.camera.updateProjectionMatrix();
      office.controls.maxDistance = Math.max(office.controls.maxDistance, 900);
      if (office.starPts) office.starPts.scale.setScalar(6);
      this._ground();
      this._river();
      this._ocean();
      this._districts();
      this._palms();
      this._bridges();
      this._boats();
      this._cruise();
    }

    /* ---------------- ground with a road grid ---------------- */
    _ground() {
      const tex = canvasTex(
        256,
        256,
        (g, w) => {
          g.fillStyle = '#d3c9b4';
          g.fillRect(0, 0, w, w);
          g.fillStyle = '#5b6170';
          g.fillRect(0, 0, w, 34);
          g.fillRect(0, 0, 34, w);
          g.fillStyle = '#e8dfcc';
          g.fillRect(34, 34, w - 34, 10);
          g.fillRect(34, 34, 10, w - 34);
          g.fillStyle = '#f3d36b';
          for (let i = 40; i < w; i += 26) {
            g.fillRect(i, 16, 14, 2);
            g.fillRect(16, i, 2, 14);
          }
          g.fillStyle = 'rgba(95,160,90,.35)';
          g.fillRect(70, 70, 150, 150);
        },
        [60, 60],
      );
      this.groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
      const g = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), this.groundMat);
      g.rotation.x = -Math.PI / 2;
      g.position.set(0, Y - 0.3, 0);
      this.root.add(g);
    }

    /* ---------------- river, seawalls, riverwalk ---------------- */
    _ribbon(o0, o1, y, mat, x0 = RIVER.west, x1 = RIVER.east, step = 4) {
      const pos = [],
        uv = [],
        idx = [];
      let i = 0;
      for (let x = x0; x <= x1 + 0.01; x += step) {
        const z = riverZ(x),
          dz = riverDZ(x),
          L = Math.hypot(1, dz),
          nx = -dz / L,
          nz = 1 / L;
        pos.push(x + nx * o0, y, z + nz * o0, x + nx * o1, y, z + nz * o1);
        uv.push(x / 20, 0, x / 20, (o1 - o0) / 20);
        if (i) {
          const a = (i - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        i++;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.material.side = THREE.DoubleSide;
      this.root.add(m);
      return m;
    }
    _waterMat(color, rep) {
      const ripple = canvasTex(
        256,
        256,
        (g, w) => {
          g.fillStyle = color;
          g.fillRect(0, 0, w, w);
          for (let i = 0; i < 220; i++) {
            g.strokeStyle = `rgba(255,255,255,${0.05 + rnd() * 0.14})`;
            g.lineWidth = 1 + rnd() * 1.5;
            const x = rnd() * w,
              y = rnd() * w,
              l = 6 + rnd() * 22;
            g.beginPath();
            g.moveTo(x, y);
            g.quadraticCurveTo(x + l / 2, y - 2, x + l, y);
            g.stroke();
          }
        },
        rep,
      );
      const m = new THREE.MeshStandardMaterial({ map: ripple, color: '#ffffff', roughness: 0.12, metalness: 0.35 });
      this.water.push(m);
      return m;
    }
    _river() {
      const H = RIVER.half;
      this.riverMat = this._waterMat('#1d9cc0', [1, 1]);
      this._ribbon(-H, H, Y + 0.05, this.riverMat);
      const wall = new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.9 });
      const walk = new THREE.MeshStandardMaterial({
        map: canvasTex(
          64,
          64,
          g => {
            g.fillStyle = '#e3d3b8';
            g.fillRect(0, 0, 64, 64);
            g.strokeStyle = 'rgba(150,120,80,.35)';
            g.strokeRect(0, 0, 32, 32);
            g.strokeRect(32, 32, 32, 32);
          },
          [1, 1],
        ),
        roughness: 1,
      });
      const grass = new THREE.MeshStandardMaterial({ color: '#6fbf63', roughness: 1 });
      [-1, 1].forEach(s => {
        this._ribbon(s * H, s * (H + 1.2), Y + 0.55, wall); // seawall cap
        this._ribbon(s * (H + 1.2), s * (H + 7), Y + 0.35, walk); // riverwalk promenade
        this._ribbon(s * (H + 7), s * (H + 14), Y + 0.2, grass); // park strip
      });
      // promenade lamps (lit at night), instanced
      const n = Math.floor((RIVER.east - RIVER.west) / 24) * 2;
      const post = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6),
        new THREE.MeshStandardMaterial({ color: '#2b2f38' }),
        n,
      );
      const headM = new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffd58a', emissiveIntensity: 0.2 });
      this.lit.push({ m: headM, day: 0.2, evening: 2.6, night: 3.4 });
      const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 10, 8), headM, n);
      const d = new THREE.Object3D();
      let k = 0;
      for (let x = RIVER.west + 10; x < RIVER.east - 6 && k < n; x += 24)
        for (const s of [-1, 1]) {
          const z = riverZ(x),
            dz = riverDZ(x),
            L = Math.hypot(1, dz),
            off = s * (H + 6.4);
          const px = x - (dz / L) * off,
            pz = z + off / L;
          d.position.set(px, Y + 2.4, pz);
          d.updateMatrix();
          post.setMatrixAt(k, d.matrix);
          d.position.set(px, Y + 4.6, pz);
          d.updateMatrix();
          head.setMatrixAt(k, d.matrix);
          k++;
        }
      post.count = head.count = k;
      this.root.add(post, head);
    }

    /* ---------------- beach + ocean ---------------- */
    _ocean() {
      this.oceanMat = this._waterMat('#17a2c4', [40, 40]);
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 2400), this.oceanMat);
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(OCEAN_X + 700, Y + 0.04, 0);
      this.root.add(sea);
      const shallow = new THREE.Mesh(
        new THREE.PlaneGeometry(26, 2400),
        new THREE.MeshStandardMaterial({ color: '#5fd3d6', roughness: 0.2, transparent: true, opacity: 0.85 }),
      );
      shallow.rotation.x = -Math.PI / 2;
      shallow.position.set(OCEAN_X + 10, Y + 0.06, 0);
      this.root.add(shallow);
      const sand = new THREE.Mesh(
        new THREE.PlaneGeometry(46, 2400),
        new THREE.MeshStandardMaterial({ color: '#f2e2b8', roughness: 1 }),
      );
      sand.rotation.x = -Math.PI / 2;
      sand.position.set(OCEAN_X - 20, Y + 0.08, 0);
      this.root.add(sand);
      // umbrellas + towels on the sand
      const cols = ['#e8604c', '#f6c445', '#3fb6a8', '#5aa6e0', '#e98aa8', '#ffffff'];
      const n = this.mobile ? 30 : 70;
      const pole = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5),
        new THREE.MeshStandardMaterial({ color: '#d9d4c8' }),
        n,
      );
      const top = new THREE.InstancedMesh(
        new THREE.ConeGeometry(1.6, 0.7, 10),
        new THREE.MeshStandardMaterial({ roughness: 0.8 }),
        n,
      );
      const towel = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 0.05, 2.2),
        new THREE.MeshStandardMaterial({ roughness: 1 }),
        n,
      );
      const d = new THREE.Object3D(),
        col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const z = -360 + i * (720 / n) + (rnd() - 0.5) * 6,
          x = OCEAN_X - 24 + rnd() * 18;
        if (Math.abs(z - riverZ(x)) < 26) {
          pole.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
          top.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
          towel.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
          continue;
        }
        d.rotation.set(0, 0, 0);
        d.scale.set(1, 1, 1);
        d.position.set(x, Y + 1.4, z);
        d.updateMatrix();
        pole.setMatrixAt(i, d.matrix);
        d.position.set(x, Y + 2.8, z);
        d.updateMatrix();
        top.setMatrixAt(i, d.matrix);
        top.setColorAt(i, col.set(pick(cols)));
        d.position.set(x + 1.6, Y + 0.12, z + 0.4);
        d.rotation.y = rnd();
        d.updateMatrix();
        towel.setColorAt(i, col.set(pick(cols)));
        towel.setMatrixAt(i, d.matrix);
      }
      this.root.add(pole, top, towel);
      // a wooden pier
      const wood = new THREE.MeshStandardMaterial({ color: '#9b6b43', roughness: 0.9 });
      const pier = new THREE.Mesh(new THREE.BoxGeometry(70, 0.5, 5), wood);
      pier.position.set(OCEAN_X + 32, Y + 1.4, -60);
      this.root.add(pier);
      for (let x = 0; x < 70; x += 7)
        [-2, 2].forEach(z => {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3, 6), wood);
          p.position.set(OCEAN_X + 0 + x, Y + 0.2, -60 + z);
          this.root.add(p);
        });
      // lifeguard tower
      const lg = new THREE.Group();
      lg.position.set(OCEAN_X - 6, Y, 30);
      this.root.add(lg);
      const hut = new THREE.Mesh(
        new THREE.BoxGeometry(3, 2.2, 3),
        new THREE.MeshStandardMaterial({ color: '#f29c38' }),
      );
      hut.position.y = 3.6;
      lg.add(hut);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(2.6, 1.2, 4),
        new THREE.MeshStandardMaterial({ color: '#3fb6a8' }),
      );
      roof.position.y = 5.3;
      roof.rotation.y = Math.PI / 4;
      lg.add(roof);
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].forEach(([a, b]) => {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 5), wood);
        l.position.set(a, 1.3, b);
        lg.add(l);
      });
    }

    /* ---------------- districts all around (instanced) ---------------- */
    _districts() {
      const facade = (glass, rows) =>
        canvasTex(64, 256, (g, w, h) => {
          g.fillStyle = '#ffffff';
          g.fillRect(0, 0, w, h);
          const rh = h / rows;
          for (let r = 0; r < rows; r++)
            for (let c = 0; c < 4; c++) {
              g.fillStyle = glass;
              g.fillRect(4 + c * 15, r * rh + rh * 0.2, 11, rh * 0.6);
            }
        });
      const lit = rows =>
        canvasTex(64, 256, (g, w, h) => {
          g.fillStyle = '#000';
          g.fillRect(0, 0, w, h);
          const rh = h / rows;
          for (let r = 0; r < rows; r++)
            for (let c = 0; c < 4; c++)
              if (rnd() < 0.42) {
                g.fillStyle = rnd() < 0.8 ? '#ffd88a' : '#cfe6ff';
                g.fillRect(4 + c * 15, r * rh + rh * 0.2, 11, rh * 0.6);
              }
        });
      // [name, rows, glass colour, palette]
      const KINDS = {
        deco: {
          rows: 8,
          glass: '#6fb7cf',
          pal: ['#f7c6c7', '#bfe6dc', '#fde3a7', '#f9d7b5', '#cfe3f5', '#f2f0e8', '#d9c7ef'],
        },
        mid: { rows: 18, glass: '#5c8fae', pal: ['#f3e2c0', '#e9d8bf', '#cfd8e3', '#f7f3ea', '#e6c9a8', '#bcd7d1'] },
        tower: { rows: 40, glass: '#4a86b5', pal: ['#dbe9f4', '#c9dcea', '#e8eef3', '#b9d0e3', '#f2f5f8', '#a9c6dc'] },
      };
      const items = { deco: [], mid: [], tower: [] };
      const CORE = (x, z) => Math.abs(x) < 132 && z > -160 && z < 60;
      const B = 40;
      for (let bx = -440; bx < OCEAN_X - 50; bx += B)
        for (let bz = -460; bz < 420; bz += B) {
          const cx = bx + B / 2,
            cz = bz + B / 2;
          if (CORE(cx, cz)) continue;
          const rz = riverZ(cx);
          if (Math.abs(cz - rz) < RIVER.half + 30) continue; // river + riverwalk + park
          if (Math.abs(cx) < 34 && cz > 60) continue; // boulevard south of the core
          if (this.mobile && rnd() < 0.45) continue;
          const south = cz > rz,
            d = Math.hypot(cx, cz - 140);
          const n = 1 + Math.floor(rnd() * 3);
          for (let k = 0; k < n; k++) {
            const w = 8 + rnd() * 10,
              dd = 8 + rnd() * 10;
            const ox = (rnd() - 0.5) * (B - 14 - w),
              oz = (rnd() - 0.5) * (B - 14 - dd);
            let kind, h;
            if (south && cz < rz + 140 && rnd() < 0.7) {
              kind = 'tower';
              h = 45 + rnd() * 95 * Math.max(0.35, 1 - d / 420);
            } else if (cx > OCEAN_X - 130) {
              kind = 'deco';
              h = 6 + rnd() * 12;
            } else if (rnd() < 0.45) {
              kind = 'deco';
              h = 7 + rnd() * 12;
            } else {
              kind = 'mid';
              h = 14 + rnd() * 30;
            }
            items[kind].push({ x: cx + ox, z: cz + oz, w, d: dd, h });
          }
        }
      const geo = new THREE.BoxGeometry(1, 1, 1);
      geo.translate(0, 0.5, 0);
      const dmy = new THREE.Object3D(),
        col = new THREE.Color();
      for (const [name, K] of Object.entries(KINDS)) {
        const list = items[name];
        if (!list.length) continue;
        const m = new THREE.MeshStandardMaterial({
          map: facade(K.glass, K.rows),
          emissiveMap: lit(K.rows),
          emissive: '#ffffff',
          emissiveIntensity: 0,
          roughness: name === 'tower' ? 0.35 : 0.8,
          metalness: name === 'tower' ? 0.35 : 0,
        });
        this.lit.push({ m, day: 0, evening: 0.7, night: 1.05 });
        const im = new THREE.InstancedMesh(geo, m, list.length);
        list.forEach((b, i) => {
          dmy.position.set(b.x, Y, b.z);
          dmy.scale.set(b.w, b.h, b.d);
          dmy.updateMatrix();
          im.setMatrixAt(i, dmy.matrix);
          im.setColorAt(i, col.set(pick(K.pal)));
        });
        this.root.add(im);
        // roofs: a slab on every building, plus a red aircraft light on towers
        const roof = new THREE.InstancedMesh(
          geo,
          new THREE.MeshStandardMaterial({ color: name === 'deco' ? '#f4efe6' : '#8c96a3', roughness: 0.9 }),
          list.length,
        );
        list.forEach((b, i) => {
          dmy.position.set(b.x, Y + b.h, b.z);
          dmy.scale.set(b.w * 0.8, name === 'tower' ? 2.4 : 0.8, b.d * 0.8);
          dmy.updateMatrix();
          roof.setMatrixAt(i, dmy.matrix);
        });
        this.root.add(roof);
        if (name === 'tower') {
          const red = new THREE.MeshBasicMaterial({ color: '#ff3b3b' });
          const beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), red, list.length);
          list.forEach((b, i) => {
            dmy.position.set(b.x, Y + b.h + 3.2, b.z);
            dmy.scale.setScalar(1);
            dmy.updateMatrix();
            beacons.setMatrixAt(i, dmy.matrix);
          });
          this.root.add(beacons);
          this.beacons = beacons;
        }
      }
      this.towerCount = items.tower.length;
    }

    /* ---------------- palms ---------------- */
    _palms() {
      const spots = [];
      const H = RIVER.half;
      for (let x = RIVER.west + 6; x < RIVER.east - 4; x += this.mobile ? 22 : 13)
        for (const s of [-1, 1]) {
          const z = riverZ(x),
            dz = riverDZ(x),
            L = Math.hypot(1, dz),
            off = s * (H + 10 + rnd() * 3);
          spots.push([x - (dz / L) * off, z + off / L]);
        }
      for (let z = -400; z < 400; z += this.mobile ? 18 : 10)
        if (Math.abs(z - riverZ(OCEAN_X - 30)) > 30) spots.push([OCEAN_X - 40 + rnd() * 6, z]);
      for (let z = 64; z < 420; z += 16)
        [-30, 30].forEach(x => {
          if (Math.abs(z - riverZ(x)) > 26) spots.push([x, z]);
        }); // boulevard
      for (let x = -120; x <= 120; x += 16) spots.push([x, 58]);
      const n = spots.length;
      const trunkG = new THREE.CylinderGeometry(0.3, 0.5, 10, 6);
      trunkG.translate(0, 5, 0);
      const trunk = new THREE.InstancedMesh(
        trunkG,
        new THREE.MeshStandardMaterial({ color: '#9a7752', roughness: 1 }),
        n,
      );
      // fronds: 9 arching leaves that rise, then droop (one shared geometry, instanced)
      const frond = (leaves, L, lift, droop, wid, tilt0) => {
        const pos = [];
        const seg = 6;
        for (let k = 0; k < leaves; k++) {
          const a = (k / leaves) * Math.PI * 2 + tilt0,
            ca = Math.cos(a),
            sa = Math.sin(a),
            px = -sa,
            pz = ca;
          const P = t => {
            const r = L * t,
              y = lift * t - droop * t * t,
              w = wid * Math.sin(Math.PI * Math.min(1, t * 1.15));
            return [ca * r, y, sa * r, w];
          };
          for (let i = 0; i < seg; i++) {
            const [x0, y0, z0, w0] = P(i / seg),
              [x1, y1, z1, w1] = P((i + 1) / seg);
            const A = [x0 + px * w0, y0, z0 + pz * w0],
              B = [x0 - px * w0, y0 - w0 * 0.25, z0 - pz * w0],
              C = [x1 + px * w1, y1, z1 + pz * w1],
              D = [x1 - px * w1, y1 - w1 * 0.25, z1 - pz * w1];
            pos.push(...A, ...B, ...C, ...B, ...D, ...C);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.computeVertexNormals();
        return g;
      };
      const crownM = new THREE.MeshStandardMaterial({
        color: '#3f9a4f',
        roughness: 0.85,
        side: THREE.DoubleSide,
        flatShading: true,
      });
      const crown = new THREE.InstancedMesh(frond(9, 5.2, 1.6, 4.4, 0.75, 0), crownM, n);
      const crown2 = new THREE.InstancedMesh(
        frond(6, 3.4, 1.9, 2.6, 0.55, 0.35),
        new THREE.MeshStandardMaterial({
          color: '#63b95a',
          roughness: 0.85,
          side: THREE.DoubleSide,
          flatShading: true,
        }),
        n,
      );
      const d = new THREE.Object3D();
      spots.forEach(([x, z], i) => {
        const lean = (rnd() - 0.5) * 0.22,
          ry = rnd() * 6.28,
          s = 0.85 + rnd() * 0.45;
        d.position.set(x, Y, z);
        d.rotation.set(lean, ry, lean * 0.6);
        d.scale.setScalar(s);
        d.updateMatrix();
        trunk.setMatrixAt(i, d.matrix);
        const top = new THREE.Vector3(0, 10 * s, 0).applyEuler(d.rotation).add(d.position);
        d.position.copy(top);
        d.rotation.set(0, ry, 0);
        d.updateMatrix();
        crown.setMatrixAt(i, d.matrix);
        d.position.y += 0.25;
        d.rotation.y = ry + 0.35;
        d.updateMatrix();
        crown2.setMatrixAt(i, d.matrix);
      });
      this.root.add(trunk, crown, crown2);
    }

    /* ---------------- bridges ---------------- */
    _bridges() {
      const deckM = new THREE.MeshStandardMaterial({ color: '#d9dde3', roughness: 0.7 });
      const roadM = new THREE.MeshStandardMaterial({ color: '#4c515c', roughness: 0.95 });
      const lightM = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#7fd3ff', emissiveIntensity: 0.1 });
      this.lit.push({ m: lightM, day: 0.1, evening: 2.2, night: 3 });
      const bridge = (x, wide, kind) => {
        const z = riverZ(x),
          len = RIVER.half * 2 + 30,
          g = new THREE.Group();
        g.position.set(x, Y, z);
        this.root.add(g);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(wide, 1, len), deckM);
        deck.position.y = 2.2;
        g.add(deck);
        const road = new THREE.Mesh(new THREE.BoxGeometry(wide - 1.2, 0.05, len), roadM);
        road.position.y = 2.73;
        g.add(road);
        [-1, 1].forEach(s => {
          const r = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, len), deckM);
          r.position.set(s * (wide / 2 - 0.15), 3.1, 0);
          g.add(r);
          const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, len), lightM);
          strip.position.set(s * (wide / 2 + 0.05), 2.2, 0);
          g.add(strip);
        });
        [-1, 1].forEach(s => {
          const p = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.6, 2.4, 2.4), deckM);
          p.position.set(0, 0.9, s * (RIVER.half - 3));
          g.add(p);
        });
        if (kind === 'cable') {
          const pyM = new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.5 });
          const py = new THREE.Mesh(new THREE.BoxGeometry(1.6, 34, 1.6), pyM);
          py.position.set(0, 17 + 2.7, 0);
          py.rotation.z = 0.12;
          g.add(py);
          const top = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), lightM);
          top.position.set(-2.1, 37, 0);
          g.add(top);
          const cableM = new THREE.LineBasicMaterial({ color: '#f4f6f8' });
          const pts = [];
          for (let i = 1; i <= 9; i++)
            for (const s of [-1, 1]) {
              pts.push(new THREE.Vector3(-1.4, 34 - i * 0.9, 0), new THREE.Vector3(0, 2.8, s * i * (len / 20)));
            }
          g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), cableM));
        } else if (kind === 'arch') {
          const archM = new THREE.MeshStandardMaterial({ color: '#e8604c', roughness: 0.5 });
          [-1, 1].forEach(s => {
            const a = new THREE.Mesh(new THREE.TorusGeometry(len / 2.1, 0.45, 8, 40, Math.PI), archM);
            a.rotation.y = Math.PI / 2;
            a.position.set(s * (wide / 2 - 0.4), 2.7, 0);
            a.scale.set(1, 0.42, 1);
            g.add(a);
          });
          for (let k = -4; k <= 4; k++)
            [-1, 1].forEach(s => {
              const zz = (k * len) / 10,
                h = Math.sqrt(Math.max(0, (len / 2.1) ** 2 - zz * zz)) * 0.42;
              if (h < 0.5) return;
              const v = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), archM);
              v.position.set(s * (wide / 2 - 0.4), 2.7 + h / 2, zz);
              g.add(v);
            });
        }
        return { x, z, len, wide };
      };
      this.bridges = [
        bridge(-22, 7, 'plain'),
        bridge(22, 7, 'plain'),
        bridge(-170, 12, 'cable'),
        bridge(170, 12, 'arch'),
        bridge(-330, 10, 'plain'),
        bridge(320, 10, 'plain'),
      ];
      // a few cars crossing the big bridges
      const cols = ['#e8604c', '#f6c445', '#3fb6a8', '#5aa6e0', '#f2f2f2', '#2d3142', '#9b7fd1'];
      const carG = new THREE.BoxGeometry(1.7, 1.1, 3.6);
      carG.translate(0, 0.55, 0);
      this.bridges.forEach(b => {
        for (let i = 0; i < (this.mobile ? 2 : 4); i++) {
          const m = new THREE.Mesh(
            carG,
            new THREE.MeshStandardMaterial({ color: pick(cols), roughness: 0.35, metalness: 0.5 }),
          );
          const lane = i % 2 ? 1 : -1;
          m.position.set(b.x + (lane * b.wide) / 4, Y + 2.75, 0);
          this.root.add(m);
          this.bridgeCars.push({ m, b, lane, s: (rnd() - 0.5) * b.len, v: 9 + rnd() * 5 });
        }
      });
    }

    /* ---------------- boats on the river ---------------- */
    _boat(kind) {
      const g = new THREE.Group();
      const white = new THREE.MeshStandardMaterial({ color: '#f7f8fa', roughness: 0.35 });
      const accent = new THREE.MeshStandardMaterial({
        color: kind === 'taxi' ? '#f6c445' : kind === 'speed' ? '#e8604c' : '#1f3b63',
        roughness: 0.4,
      });
      const glass = new THREE.MeshStandardMaterial({ color: '#1b2433', roughness: 0.1, metalness: 0.7 });
      const L = kind === 'yacht' ? 16 : kind === 'taxi' ? 10 : 6;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(L, 1.2, L * 0.3), white);
      hull.position.y = 0.5;
      g.add(hull);
      const bow = new THREE.Mesh(new THREE.ConeGeometry(L * 0.15, L * 0.3, 4), white);
      bow.rotation.z = -Math.PI / 2;
      bow.rotation.x = Math.PI / 4;
      bow.position.set(L / 2 + L * 0.14, 0.5, 0);
      g.add(bow);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(L + 0.02, 0.25, L * 0.3 + 0.02), accent);
      stripe.position.y = 0.35;
      g.add(stripe);
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(L * 0.45, kind === 'speed' ? 0.6 : 1.4, L * 0.24),
        kind === 'taxi' ? accent : glass,
      );
      cab.position.set(-L * 0.05, 1.6, 0);
      g.add(cab);
      if (kind === 'yacht') {
        const up = new THREE.Mesh(new THREE.BoxGeometry(L * 0.3, 1, L * 0.2), white);
        up.position.set(-L * 0.1, 2.7, 0);
        g.add(up);
      }
      const wake = new THREE.Mesh(
        new THREE.PlaneGeometry(L * 2.4, L * 0.5),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false }),
      );
      wake.rotation.x = -Math.PI / 2;
      wake.position.set(-L * 1.6, 0.06, 0);
      g.add(wake);
      this.root.add(g);
      return g;
    }
    _boats() {
      const kinds = ['speed', 'yacht', 'taxi', 'speed', 'yacht', 'speed', 'taxi', 'speed'];
      const n = this.mobile ? 5 : kinds.length;
      for (let i = 0; i < n; i++) {
        const dir = i % 2 ? 1 : -1;
        this.boats.push({
          g: this._boat(kinds[i]),
          x: RIVER.west + rnd() * (RIVER.east - RIVER.west),
          dir,
          lane: dir * (4 + rnd() * 6),
          v: kinds[i] === 'speed' ? 12 + rnd() * 6 : 5 + rnd() * 3,
          bob: rnd() * 6,
        });
      }
    }
    _cruise() {
      const g = new THREE.Group();
      const white = new THREE.MeshStandardMaterial({ color: '#f7f8fa', roughness: 0.4 });
      const navy = new THREE.MeshStandardMaterial({ color: '#1f3b63', roughness: 0.5 });
      const winM = new THREE.MeshStandardMaterial({ color: '#2b3a4f', emissive: '#ffd88a', emissiveIntensity: 0.1 });
      this.lit.push({ m: winM, day: 0.1, evening: 1.2, night: 1.6 });
      const hull = new THREE.Mesh(new THREE.BoxGeometry(90, 8, 16), navy);
      hull.position.y = 3;
      g.add(hull);
      for (let k = 0; k < 4; k++) {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(78 - k * 9, 3, 15 - k * 1.2), white);
        deck.position.set(-4 + k * 2, 8.5 + k * 3, 0);
        g.add(deck);
        const w = new THREE.Mesh(new THREE.BoxGeometry(76 - k * 9, 0.8, 15.3 - k * 1.2), winM);
        w.position.set(-4 + k * 2, 8.6 + k * 3, 0);
        g.add(w);
      }
      const funnel = new THREE.Mesh(
        new THREE.CylinderGeometry(2.4, 3, 7, 12),
        new THREE.MeshStandardMaterial({ color: '#e8604c' }),
      );
      funnel.position.set(-18, 23, 0);
      g.add(funnel);
      const bow = new THREE.Mesh(new THREE.ConeGeometry(8, 14, 4), navy);
      bow.rotation.z = -Math.PI / 2;
      bow.rotation.x = Math.PI / 4;
      bow.position.set(51, 3, 0);
      g.add(bow);
      g.rotation.y = Math.PI / 2;
      this.root.add(g);
      this.cruise = { g, z: -500 };
    }

    /* ---------------- per frame ---------------- */
    update(dt, t) {
      for (const m of this.water) {
        m.map.offset.x += dt * 0.012;
        m.map.offset.y += dt * 0.006;
      }
      for (const b of this.boats) {
        b.x += b.v * b.dir * dt;
        if (b.x > RIVER.east - 8) b.x = RIVER.west + 4;
        if (b.x < RIVER.west + 4) b.x = RIVER.east - 8;
        const dz = riverDZ(b.x),
          L = Math.hypot(1, dz);
        b.g.position.set(b.x - (dz / L) * b.lane, Y + 0.15 + Math.sin(t * 2 + b.bob) * 0.08, riverZ(b.x) + b.lane / L);
        b.g.rotation.y = -Math.atan2(dz, 1) + (b.dir < 0 ? Math.PI : 0);
      }
      for (const c of this.bridgeCars) {
        c.s += c.v * c.lane * dt;
        const h = c.b.len / 2 - 2;
        if (c.s > h) c.s = -h;
        if (c.s < -h) c.s = h;
        c.m.position.z = c.b.z + c.s;
      }
      if (this.cruise) {
        this.cruise.z += dt * 3.2;
        if (this.cruise.z > 600) this.cruise.z = -600;
        this.cruise.g.position.set(OCEAN_X + 150, Y, this.cruise.z);
      }
      if (this.beacons) this.beacons.visible = Math.sin(t * 2.4) > -0.2;
    }

    setTimeOfDay(tod) {
      this.lit.forEach(x => {
        x.m.emissiveIntensity = x[tod] ?? x.day;
      });
      this.groundMat.color.set(tod === 'day' ? '#ffffff' : tod === 'evening' ? '#b8a8a2' : '#4a4e5c');
      const water = tod === 'day' ? '#ffffff' : tod === 'evening' ? '#c9a6b8' : '#3c4a6e';
      this.water.forEach(m => m.color.set(water));
      // see the whole city: push the fog far out
      const f = this.office.scene.fog;
      if (f) {
        f.near = tod === 'night' ? 160 : 260;
        f.far = tod === 'night' ? 1100 : 1500;
      }
    }

    /** Camera spots for the guided visits. */
    view(which) {
      const rz = riverZ(0);
      return {
        aerial: [
          [330, 250, 470],
          [0, -6, 60],
        ],
        walk: [
          [-70, 2.5, rz - 26],
          [10, -2, rz + 6],
        ],
        bridge: [
          [-200, 14, riverZ(-200) - 50],
          [-170, 6, riverZ(-170)],
        ],
        boats: [
          [60, 30, rz - 60],
          [130, -6, riverZ(130)],
        ],
        skyline: [
          [-30, 10, rz - 34],
          [40, 40, rz + 150],
        ],
        towers: [
          [80, 70, rz + 60],
          [-20, 30, rz + 170],
        ],
        beach: [
          [OCEAN_X - 70, 18, 40],
          [OCEAN_X + 30, -6, -40],
        ],
        ocean: [
          [OCEAN_X - 30, 40, -140],
          [OCEAN_X + 150, -2, -10],
        ],
      }[which];
    }
  }

  return { Florida };
})();
