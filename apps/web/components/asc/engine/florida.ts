// @ts-nocheck
// The big city: Midtown Manhattan to the horizon. An island of avenues and cross streets between the Hudson and the
// East River, art-deco and glass towers rising toward Midtown and Downtown, a Central-Park-style green block with plane
// trees, piers, ferries and tugboats, cable-stayed and arch bridges, a harbour in the south, and lower boroughs on the
// far banks, all in haze. Everything heavy is instanced or merged, so the whole city is a few dozen draw calls.
// (The class keeps the name the demo already uses: `Florida`.)
import * as THREE from 'three';
import { C3 } from './city';
import { N3 } from './nyc';

export const F3 = (() => {
  const { STREET_Y } = C3;
  const Y = STREET_Y;
  const { AVENUES, STREETS, ROAD_HALF, WATER_Y, LAND_Y, shoreW, shoreE, farW, farE, TIP_Z, TIP_R, SOUTH_SHORE } = N3;

  // the park: a green block between the two outer avenues, north of Midtown
  const PARK = { x0: -114, x1: 114, z0: -655, z1: -343 };
  const inPark = (x, z, pad = 0) => x > PARK.x0 - pad && x < PARK.x1 + pad && z > PARK.z0 - pad && z < PARK.z1 + pad;
  // legacy buildings and dealer lots the lot planner has to keep clear
  const KEEP = [
    [-91, 91, -53, -25], // the block behind the office (street-level city)
    [-91, 91, 23, 32], // the low shops in front of it
    [-20, 20, -14, 14], // the HQ
    [26, 60, -15, 15], // Aurora
    [-60, -26, -15, 15], // Vanta
    [54, 92, 22, 54], // Summit
    [-92, -54, 22, 54], // Volta
  ];

  function canvasTex(w, h, draw, rep, srgb = true) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (rep) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(...rep);
    }
    return t;
  }

  /** A triangle strip along a curve: x = fn(z) + offset, for z0..z1. */
  function strip(fnA, fnB, z0, z1, step, y, uvK = 8) {
    const pos = [],
      uv = [],
      idx = [];
    let i = 0;
    for (let z = z0; z <= z1 + 0.01; z += step) {
      pos.push(fnA(z), y, z, fnB(z), y, z);
      uv.push(z / uvK, 0, z / uvK, 1);
      if (i) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      i++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  /** Same, but vertical: a wall along a curve between two heights. */
  function wall(fn, z0, z1, step, ya, yb) {
    const pos = [],
      idx = [];
    let i = 0;
    for (let z = z0; z <= z1 + 0.01; z += step) {
      pos.push(fn(z), ya, z, fn(z), yb, z);
      if (i) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      i++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
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
      this.lanes = [];
      this.rnd = N3.rngOf(7331);
      N3.QUALITY.mobile = mobile;
      // a much bigger world: see further, keep stars outside the city
      office.camera.far = 3200;
      office.camera.updateProjectionMatrix();
      office.controls.maxDistance = Math.max(office.controls.maxDistance, 1100);
      if (office.starPts) office.starPts.scale.setScalar(8);
      this._lands();
      this._roads();
      this._city();
      this._park();
      this._waterfront();
      this._bridges();
      this._harbor();
      this._boats();
      this._traffic();
      this.setTimeOfDay(office.tod || 'day');
    }

    /* ---------------- water and land ---------------- */
    _waterMat(color, rep) {
      const ripple = canvasTex(
        256,
        256,
        (g, w) => {
          g.fillStyle = color;
          g.fillRect(0, 0, w, w);
          const r = N3.rngOf(5);
          for (let i = 0; i < 260; i++) {
            g.strokeStyle = `rgba(255,255,255,${0.04 + r() * 0.1})`;
            g.lineWidth = 1 + r() * 1.5;
            const x = r() * w,
              y = r() * w,
              l = 6 + r() * 22;
            g.beginPath();
            g.moveTo(x, y);
            g.quadraticCurveTo(x + l / 2, y - 2, x + l, y);
            g.stroke();
          }
        },
        rep,
      );
      const m = new THREE.MeshStandardMaterial({ map: ripple, color: '#ffffff', roughness: 0.18, metalness: 0.3 });
      this.water.push(m);
      return m;
    }
    _lands() {
      // one huge water plane; the land stands a little above it behind quay walls
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), this._waterMat('#3d7586', [750, 750]));
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, WATER_Y, 0);
      this.root.add(sea);
      this.landMat = new THREE.MeshStandardMaterial({ color: '#bdb8ae', roughness: 1 });
      this.bankMat = new THREE.MeshStandardMaterial({ color: '#8e8b80', roughness: 1 });
      const quayMat = new THREE.MeshStandardMaterial({ color: '#7d7b76', roughness: 0.95, side: THREE.DoubleSide });
      const Z0 = -2600;
      const add = (geo, mat) => {
        const m = new THREE.Mesh(geo, mat);
        this.root.add(m);
        return m;
      };
      // Manhattan: a strip between the two shores, then a rounded southern tip
      add(strip(shoreW, shoreE, Z0, TIP_Z, 10, LAND_Y), this.landMat);
      const cx = (shoreW(TIP_Z) + shoreE(TIP_Z)) / 2,
        hw = (shoreE(TIP_Z) - shoreW(TIP_Z)) / 2;
      const tip = [];
      const arc = [];
      for (let i = 0; i <= 40; i++) {
        const a = Math.PI - (i / 40) * Math.PI;
        arc.push([cx + hw * Math.cos(a), TIP_Z + TIP_R * Math.sin(a)]);
      }
      arc.forEach(([x, z], i) => {
        if (i) tip.push(cx, LAND_Y, TIP_Z, arc[i - 1][0], LAND_Y, arc[i - 1][1], x, LAND_Y, z);
      });
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(tip, 3));
      tg.computeVertexNormals();
      add(tg, new THREE.MeshStandardMaterial({ color: '#bdb8ae', roughness: 1, side: THREE.DoubleSide }));
      this.tipMat = tg;
      const tipWall = [];
      arc.forEach(([x, z], i) => {
        if (!i) return;
        const [px, pz] = arc[i - 1];
        tipWall.push(
          px,
          WATER_Y - 0.5,
          pz,
          px,
          LAND_Y,
          pz,
          x,
          WATER_Y - 0.5,
          z,
          px,
          LAND_Y,
          pz,
          x,
          LAND_Y,
          z,
          x,
          WATER_Y - 0.5,
          z,
        );
      });
      const twg = new THREE.BufferGeometry();
      twg.setAttribute('position', new THREE.Float32BufferAttribute(tipWall, 3));
      twg.computeVertexNormals();
      add(twg, quayMat);
      add(wall(shoreW, Z0, TIP_Z, 10, WATER_Y - 0.5, LAND_Y), quayMat);
      add(wall(shoreE, Z0, TIP_Z, 10, WATER_Y - 0.5, LAND_Y), quayMat);
      // the far banks (New Jersey, Queens) and the south shore of the harbour
      add(
        strip(() => -4200, farW, Z0, SOUTH_SHORE, 10, LAND_Y - 0.05),
        this.bankMat,
      );
      add(
        strip(farE, () => 4200, Z0, SOUTH_SHORE, 10, LAND_Y - 0.05),
        this.bankMat,
      );
      const south = new THREE.Mesh(new THREE.PlaneGeometry(8400, 3600), this.bankMat);
      south.rotation.x = -Math.PI / 2;
      south.position.set(0, LAND_Y - 0.05, SOUTH_SHORE + 1800);
      this.root.add(south);
      add(wall(farW, Z0, SOUTH_SHORE, 10, WATER_Y - 0.5, LAND_Y - 0.05), quayMat);
      add(wall(farE, Z0, SOUTH_SHORE, 10, WATER_Y - 0.5, LAND_Y - 0.05), quayMat);
    }

    /* ---------------- roads ---------------- */
    _roads() {
      const tex = canvasTex(
        64,
        64,
        (g, w) => {
          g.fillStyle = '#4a4f5a';
          g.fillRect(0, 0, w, w);
          g.fillStyle = 'rgba(255,255,255,.05)';
          for (let i = 0; i < 90; i++) g.fillRect(Math.random() * w, Math.random() * w, 2, 2);
          g.fillStyle = '#e9bf3c';
          g.fillRect(0, 30, w, 2);
          g.fillRect(0, 34, w, 2);
          g.fillStyle = 'rgba(255,255,255,.75)';
          g.fillRect(0, 2, w, 2);
          g.fillRect(0, 60, w, 2);
          g.fillStyle = 'rgba(255,255,255,.7)';
          g.fillRect(0, 16, w * 0.5, 2);
          g.fillRect(0, 46, w * 0.5, 2);
        },
        null,
      );
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const pos = [],
        uv = [],
        idx = [];
      const y = LAND_Y + 0.04;
      let n = 0;
      const quad = (x0, x1, z0, z1, axis) => {
        if (x1 - x0 < 1 || z1 - z0 < 1) return;
        pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
        if (axis === 'z') uv.push(z0 / 16, 0, z0 / 16, 1, z1 / 16, 1, z1 / 16, 0);
        else uv.push(x0 / 16, 0, x1 / 16, 0, x1 / 16, 1, x0 / 16, 1);
        idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
        n += 4;
      };
      const R = ROAD_HALF;
      const northEnd = -1650;
      AVENUES.forEach(a => {
        const south = Math.min(N3.TIP_Z + TIP_R * Math.sqrt(Math.max(0, 1 - (a / 345) ** 2)) - 12, 480);
        const cuts = [];
        if (Math.abs(a) === 22) cuts.push([-165, 165]);
        if (Math.abs(a) <= 118) cuts.push([PARK.z0 - 4, PARK.z1 + 4]);
        cuts.sort((p, q) => p[0] - q[0]);
        let z = northEnd;
        cuts.forEach(([c0, c1]) => {
          quad(a - R, a + R, z, c0, 'z');
          z = c1;
        });
        quad(a - R, a + R, z, south, 'z');
      });
      STREETS.forEach(s => {
        if (s > TIP_Z + 100) return;
        const edges = [shoreW(s) + 6, ...AVENUES.flatMap(a => [a - R, a + R]), shoreE(s) - 6];
        for (let i = 0; i < edges.length; i += 2) {
          let x0 = edges[i],
            x1 = edges[i + 1];
          if (s > TIP_Z) {
            const h = N3.tipHalf(s) - 8;
            x0 = Math.max(x0, -h);
            x1 = Math.min(x1, h);
          }
          const segs = [[x0, x1]];
          const cut = (a, b) => {
            for (let k = segs.length - 1; k >= 0; k--) {
              const [p, q] = segs[k];
              if (b <= p || a >= q) continue;
              segs.splice(k, 1);
              if (a > p) segs.push([p, a]);
              if (b < q) segs.push([b, q]);
            }
          };
          if (s === -19 || s === 18) cut(-165, 165);
          if (s > PARK.z0 - 4 && s < PARK.z1 + 4) cut(PARK.x0 - 4, PARK.x1 + 4);
          segs.forEach(([p, q]) => quad(p, q, s - R, s + R, 'x'));
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      this.roadMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.95,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      this.root.add(new THREE.Mesh(g, this.roadMat));
    }

    /* ---------------- the buildings ---------------- */
    _dens(x, z) {
      const mid = Math.exp(-(((z + 205) / 120) ** 2 + (x / 200) ** 2));
      const down = Math.exp(-(((z - 390) / 85) ** 2 + ((x - 20) / 100) ** 2));
      return Math.max(mid, down * 0.95) * 0.95 + 0.1;
    }
    _city() {
      const r = this.rnd;
      const b = (this.batch = new N3.Batch());
      b.baseY = Y;
      const mob = this.mobile;
      const taken = KEEP.slice();
      const hit = (x0, x1, z0, z1) => taken.some(k => x1 > k[0] && x0 < k[1] && z1 > k[2] && z0 < k[3]);
      const pickFrom = a => a[Math.floor(r() * a.length)];
      const tintOf = kind =>
        kind === 'brick'
          ? r() < 0.3
            ? pickFrom(N3.BROWNSTONES)
            : pickFrom(N3.BRICKS)
          : kind === 'glass'
            ? pickFrom(N3.GLASSES)
            : kind === 'dark'
              ? pickFrom(N3.CONCRETES)
              : r() < 0.6
                ? pickFrom(N3.STONES)
                : pickFrom(N3.TOWER_TONES);
      const finish = (cx, cz, t, floors, kind, tall) => {
        if (floors > 40) b.beacons.push({ x: cx, y: t.top + 2, z: cz, s: 1 });
        if (tall && r() < 0.35) b.crowns.push({ x: cx, y: t.top, z: cz, w: Math.min(t.w, t.d) * 0.7, h: 8 + r() * 12 });
        else if (tall && r() < 0.4) b.spires.push({ x: cx, y: t.top, z: cz, h: 10 + r() * 20, r: 0.8 });
        else if (floors > 5 && floors < 24 && r() < 0.35 && Math.hypot(cx, cz) < 800)
          b.tanks.push({
            x: cx + (r() - 0.5) * (t.w - 4),
            y: t.top,
            z: cz + (r() - 0.5) * (t.d - 4),
            yaw: r() * 6,
            s: 1,
          });
      };
      const stack = (kind, cx, cz, tiers, tint, seed) => {
        let y = 0,
          t;
        for (const [wm, dm, fl] of tiers) {
          t = b.tier(kind, cx, cz, wm * N3.CW, dm * N3.CW, y, fl, tint, seed, { noShop: y > 0 });
          y = t.top;
        }
        return t;
      };
      const landmark = (kind, cx, cz) => {
        const stone = '#cdc6b2',
          steel = '#b9bfc8';
        if (kind === 'empire') {
          const t = stack(
            'lime',
            cx,
            cz,
            [
              [14, 10, 5],
              [9, 7, 38],
              [7, 5, 12],
              [5, 4, 6],
              [3, 3, 5],
            ],
            stone,
            0.21,
          );
          b.crowns.push({ x: cx, y: t.top, z: cz, w: 6, h: 9 });
          b.spires.push({ x: cx, y: t.top + 8, z: cz, h: 46, r: 1.1 });
          b.beacons.push({ x: cx, y: t.top + 54, z: cz, s: 1.4 });
        } else if (kind === 'chrysler') {
          const t = stack(
            'deco',
            cx,
            cz,
            [
              [8, 8, 18],
              [7, 7, 26],
              [6, 6, 10],
            ],
            '#d8d3c6',
            0.44,
          );
          let y = t.top;
          [
            [19, 9],
            [15, 9],
            [11, 8],
            [8, 7],
            [5, 7],
          ].forEach(([w, h]) => {
            b.crowns.push({ x: cx, y, z: cz, w, h });
            y += h * 0.85;
          });
          b.spires.push({ x: cx, y, z: cz, h: 34, r: 0.9 });
          b.beacons.push({ x: cx, y: y + 34, z: cz, s: 1.3 });
        } else if (kind === 'taper') {
          const t = stack(
            'glass',
            cx,
            cz,
            [
              [8, 8, 20],
              [7, 7, 16],
              [6, 6, 14],
              [5, 5, 12],
              [4, 4, 8],
              [3, 3, 6],
            ],
            '#6b8396',
            0.7,
          );
          b.beacons.push({ x: cx, y: t.top + 2, z: cz, s: 1.2 });
        } else if (kind === 'freedom') {
          const t = stack(
            'glass',
            cx,
            cz,
            [
              [9, 9, 6],
              [7, 7, 62],
            ],
            '#7f8f9c',
            0.33,
          );
          b.spires.push({ x: cx, y: t.top, z: cz, h: 52, r: 1.4 });
          b.beacons.push({ x: cx, y: t.top + 52, z: cz, s: 1.4 });
        } else if (kind === 'obelisk') {
          const t = stack(
            'deco',
            cx,
            cz,
            [
              [6, 6, 40],
              [5, 5, 12],
              [4, 4, 10],
            ],
            steel,
            0.58,
          );
          b.crowns.push({ x: cx, y: t.top, z: cz, w: 10, h: 14 });
          b.beacons.push({ x: cx, y: t.top + 15, z: cz, s: 1.2 });
        }
      };
      // landmark cells: [gap index, lower street, kind]
      const LM = [
        [4, -219, 'empire'],
        [2, -299, 'chrysler'],
        [1, -179, 'taper'],
        [3, 338, 'freedom'],
        [4, 298, 'chrysler'],
        [2, 258, 'obelisk'],
        [5, -259, 'taper'],
        [0, -139, 'obelisk'],
      ];
      // Times Square: four tall corner towers carry the big screens
      N3.squareLots().forEach(L => {
        taken.push([L.cx - L.w / 2 - 0.5, L.cx + L.w / 2 + 0.5, L.cz - L.d / 2 - 0.5, L.cz + L.d / 2 + 0.5]);
        b.tier('glass', L.cx, L.cz, L.w, L.d, 0, 16, '#4f6678', 0.9 + L.sx * 0.01);
        b.tier('deco', L.cx, L.cz, L.w - N3.CW * 2, L.d - N3.CW * 2, N3.SQ_H, 4, '#bdb49f', 0.2, { noShop: true });
      });
      for (let gi = 0; gi < AVENUES.length - 1; gi++)
        for (let si = 0; si < STREETS.length - 1; si++) {
          const z0 = STREETS[si],
            z1 = STREETS[si + 1];
          if (z0 > 470) continue;
          const xa = AVENUES[gi] + ROAD_HALF + 2.5,
            xb = AVENUES[gi + 1] - ROAD_HALF - 2.5;
          let za = z0 + ROAD_HALF + 2.5,
            zb = z1 - ROAD_HALF - 2.5;
          const cx = (xa + xb) / 2,
            cz = (za + zb) / 2;
          if (inPark(cx, cz) && gi >= 2 && gi <= 4) continue;
          if (z0 === -19 && gi === 3) continue; // the HQ block
          if (z0 === 18) za = Math.max(za, 33);
          const dist = Math.hypot(cx, cz);
          if (mob && dist > 700 && r() < 0.4) continue;
          const lm = LM.find(l => l[0] === gi && l[1] === z0);
          if (lm) {
            landmark(lm[2], cx, cz);
            continue;
          }
          const d = this._dens(cx, cz);
          // New York's tallest rise toward Midtown and Downtown; the blocks round the street-level city stay low
          let cap = 999;
          if (dist < 240) cap = 8 + Math.max(0, dist - 60) * 0.3;
          const edge = Math.abs(cz - PARK.z1) < 50 || Math.abs(cz - PARK.z0) < 50 ? (inPark(cx, cz, 130) ? 10 : 0) : 0;
          const lotMin = d > 0.5 ? 16 : d > 0.25 ? 10 : 6.4;
          let x = xa;
          while (x < xb - 6) {
            const wLot = Math.min(xb - x, lotMin + r() * lotMin * (d > 0.5 ? 0.6 : 0.8));
            const wq = Math.max(6.4, Math.round(wLot / N3.CW) * N3.CW);
            const dep = Math.min(zb - za, d > 0.4 ? 25.6 : 22.4 + (r() < 0.5 ? 3.2 : 0));
            const lx = x + wq / 2,
              lz = (za + zb) / 2 + (r() - 0.5) * Math.max(0, zb - za - dep);
            x += wq + 0.5;
            if (x > xb + 2) break;
            if (hit(lx - wq / 2, lx + wq / 2, lz - dep / 2, lz + dep / 2)) continue;
            // the rounded southern tip: keep every corner of the lot on the island
            if (lz + dep / 2 > TIP_Z - 20 && ![-1, 1].every(sx => N3.onIsland(lx + (sx * wq) / 2, lz + dep / 2, 6)))
              continue;
            if (r() < 0.04) continue;
            if (inPark(lx, lz, 0)) continue;
            // floors by density, with a lot of variety
            const dd = d + (r() - 0.5) * 0.18;
            let floors =
              dd > 0.55
                ? 22 + (dd - 0.55) * 120 * (0.45 + r() * 0.75)
                : dd > 0.25
                  ? 8 + (dd - 0.25) * 60 * r()
                  : 4 + r() * 5;
            floors = Math.min(floors + edge, cap + r() * 4);
            floors = Math.max(3, floors);
            const kind =
              floors > 30
                ? pickFrom(['glass', 'deco', 'glass', 'lime'])
                : floors > 14
                  ? pickFrom(['lime', 'deco', 'brick', 'glass'])
                  : floors > 7
                    ? pickFrom(['brick', 'lime', 'dark'])
                    : pickFrom(['brick', 'brick', 'dark']);
            const tint = tintOf(kind);
            const seed = r();
            let t;
            if (floors > 16) t = N3.setback(b, kind, lx, lz, wq, dep, floors, tint, seed, floors > 40 ? 4 : 3, r);
            else t = b.tier(kind, lx, lz, wq, dep, 0, floors, tint, seed);
            finish(lx, lz, t, floors, kind, floors > 38);
          }
        }
      this._farCity(b, r, tintOf, pickFrom);
      b.build(this.root);
      // every facade material glows at night
      Object.keys(b.items).forEach(k => this.lit.push({ m: N3.facadeMaterial(k), day: 0, evening: 0.5, night: 0.75 }));
      this.beacons = b.beaconMesh;
      this.towerCount = b.count;
    }
    // the lower boroughs and the far shore, coarser blocks, all fading into the haze
    _farCity(b, r, tintOf, pickFrom) {
      const step = this.mobile ? 62 : 46;
      for (let x = -1350; x < 1350; x += step)
        for (let z = -1300; z < 1250; z += step) {
          const wx = x + (r() - 0.5) * 10,
            wz = z + (r() - 0.5) * 10;
          const land = wz > SOUTH_SHORE + 14 ? true : wx < farW(wz) - 16 || wx > farE(wz) + 16;
          if (!land) continue;
          if (wz > SOUTH_SHORE - 10 && wz < SOUTH_SHORE + 14) continue;
          if (Math.hypot(wx, wz - 100) > 1350) continue;
          if (this.mobile && r() < 0.35) continue;
          const queens = Math.exp(-(((wx - 540) / 110) ** 2 + ((wz + 90) / 130) ** 2));
          const jersey = Math.exp(-(((wx + 560) / 110) ** 2 + ((wz - 170) / 140) ** 2));
          const brook = Math.exp(-(((wx - 380) / 160) ** 2 + ((wz - 960) / 100) ** 2));
          const d = Math.max(queens, jersey, brook * 0.7);
          const w = 16 + r() * 16,
            dep = 16 + r() * 16;
          let floors = d > 0.35 ? 18 + d * 40 * (0.4 + r()) : 3 + r() * 7;
          if (r() < 0.07) continue;
          const kind = floors > 22 ? pickFrom(['glass', 'glass', 'deco']) : pickFrom(['brick', 'dark', 'dark', 'lime']);
          const tint = kind === 'dark' ? pickFrom(N3.CONCRETES) : tintOf(kind);
          const t =
            floors > 14
              ? N3.setback(b, kind, wx, wz, w, dep, floors, tint, r(), 2, r)
              : b.tier(kind, wx, wz, w, dep, 0, floors, tint, r());
          if (floors > 36) b.beacons.push({ x: wx, y: t.top + 2, z: wz, s: 1.2 });
          if (floors < 9 && floors > 4 && r() < 0.18 && Math.hypot(wx, wz) < 900)
            b.tanks.push({ x: wx, y: t.top, z: wz, yaw: r() * 6, s: 1 });
        }
    }

    /* ---------------- the green block ---------------- */
    _park() {
      const W = PARK.x1 - PARK.x0,
        H = PARK.z1 - PARK.z0;
      const rr = N3.rngOf(31);
      const ponds = [
        [-40, -470, 34, 18],
        [30, -560, 24, 16],
        [-70, -600, 18, 12],
        [60, -400, 22, 14],
      ];
      const tex = canvasTex(
        1024,
        Math.round((1024 * H) / W),
        (g, w, h) => {
          const sx = w / W,
            sz = h / H;
          const P = (x, z) => [(x - PARK.x0) * sx, (z - PARK.z0) * sz];
          g.fillStyle = '#6a8f55';
          g.fillRect(0, 0, w, h);
          for (let i = 0; i < 900; i++) {
            g.fillStyle = `rgba(${40 + rr() * 40},${90 + rr() * 50},${40 + rr() * 30},.18)`;
            g.beginPath();
            g.arc(rr() * w, rr() * h, 6 + rr() * 22, 0, 7);
            g.fill();
          }
          // the great lawn and ball fields
          g.fillStyle = '#7fa862';
          const [lx, lz] = P(-10, -440);
          g.fillRect(lx - 60 * sx, lz - 40 * sz, 120 * sx, 80 * sz);
          g.fillStyle = '#9a7a52';
          [
            [-6, -380],
            [24, -390],
            [-36, -390],
          ].forEach(([x, z]) => {
            const [px, pz] = P(x, z);
            g.beginPath();
            g.arc(px, pz, 6 * sx, 0, 7);
            g.fill();
          });
          // winding paths
          g.strokeStyle = '#d9cfba';
          g.lineWidth = 2.6 * sx;
          g.lineCap = 'round';
          for (let k = 0; k < 7; k++) {
            g.beginPath();
            let x = PARK.x0 + 6,
              z = PARK.z0 + 20 + k * 40;
            let [px, pz] = P(x, z);
            g.moveTo(px, pz);
            for (let s = 0; s < 14; s++) {
              x += 16 + rr() * 8;
              z += (rr() - 0.5) * 36;
              [px, pz] = P(Math.min(x, PARK.x1 - 4), Math.max(PARK.z0 + 4, Math.min(z, PARK.z1 - 4)));
              g.lineTo(px, pz);
            }
            g.stroke();
          }
          g.beginPath();
          const [ax, az] = P(0, -343 - 8);
          g.moveTo(ax, az);
          g.lineTo(P(0, -655)[0], P(0, -655)[1]);
          g.stroke();
          // ponds and the reservoir
          ponds.forEach(([x, z, rx, rz]) => {
            const [px, pz] = P(x, z);
            g.fillStyle = '#c9d6cf';
            g.beginPath();
            g.ellipse(px, pz, (rx + 1.6) * sx, (rz + 1.6) * sz, 0, 0, 7);
            g.fill();
            g.fillStyle = '#4f86a0';
            g.beginPath();
            g.ellipse(px, pz, rx * sx, rz * sz, 0, 0, 7);
            g.fill();
          });
        },
        null,
      );
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set((PARK.x0 + PARK.x1) / 2, LAND_Y + 0.1, (PARK.z0 + PARK.z1) / 2);
      this.root.add(m);
      this.parkMat = m.material;
      // plane trees: trunks and two blobs of leaves each, instanced
      const n = this.mobile ? 320 : 760;
      const trunk = [],
        crown = [];
      const cols = ['#5f8f52', '#527f4c', '#6b9a58', '#4a7a50', '#7b9a4c', '#8a9a4a', '#5b8a5a'];
      for (let i = 0; i < n; i++) {
        const x = PARK.x0 + 6 + rr() * (W - 12),
          z = PARK.z0 + 6 + rr() * (H - 12);
        if (ponds.some(([px, pz, rx, rz]) => ((x - px) / (rx + 4)) ** 2 + ((z - pz) / (rz + 4)) ** 2 < 1)) continue;
        if (Math.abs(x + 10) < 62 && Math.abs(z + 440) < 42) continue; // keep the great lawn open
        const s = 0.9 + rr() * 0.9;
        trunk.push({ x, y: Y + 1.5 * s, z, sx: s, sy: s, sz: s });
        crown.push({ x, y: Y + 4.6 * s, z, s: s * 1.25, c: cols[Math.floor(rr() * cols.length)] });
        crown.push({
          x: x + 1 * s,
          y: Y + 3.7 * s,
          z: z + 0.6 * s,
          s: s * 0.8,
          c: cols[Math.floor(rr() * cols.length)],
        });
      }
      const tG = new THREE.CylinderGeometry(0.2, 0.3, 3, 6);
      const cG = new THREE.IcosahedronGeometry(2.2, 0);
      this._inst(tG, new THREE.MeshStandardMaterial({ color: '#6b5a48', roughness: 1 }), trunk);
      this._inst(cG, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), crown, true);
      // boulders, the bare rock Manhattan's park is known for
      const rocks = [];
      for (let i = 0; i < 40; i++)
        rocks.push({
          x: PARK.x0 + 8 + rr() * (W - 16),
          y: LAND_Y + 0.4,
          z: PARK.z0 + 8 + rr() * (H - 16),
          sx: 1 + rr() * 2.4,
          sy: 0.7 + rr(),
          sz: 1 + rr() * 2,
          ry: rr() * 6,
        });
      this._inst(
        new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshStandardMaterial({ color: '#8a877e', roughness: 1, flatShading: true }),
        rocks,
      );
    }

    // generic instancing with per-instance colour
    _inst(geo, mat, list, colors) {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const d = new THREE.Object3D(),
        c = new THREE.Color();
      list.forEach((o, i) => {
        d.position.set(o.x, o.y, o.z);
        d.rotation.set(0, o.ry || 0, 0);
        d.scale.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
        if (colors) im.setColorAt(i, c.set(o.c));
      });
      im.frustumCulled = false;
      this.root.add(im);
      return im;
    }

    /* ---------------- riverwalks, piers, shore highways ---------------- */
    _waterfront() {
      const walk = new THREE.MeshStandardMaterial({
        map: canvasTex(
          64,
          64,
          g => {
            g.fillStyle = '#d3cdbf';
            g.fillRect(0, 0, 64, 64);
            g.strokeStyle = 'rgba(100,92,80,.35)';
            g.strokeRect(0, 0, 32, 32);
            g.strokeRect(32, 32, 32, 32);
          },
          [1, 1],
        ),
        roughness: 1,
      });
      walk.map.wrapS = walk.map.wrapT = THREE.RepeatWrapping;
      const grass = new THREE.MeshStandardMaterial({ color: '#7a9f62', roughness: 1 });
      this.grassMat = grass;
      const hwy = this.roadMat;
      const add = (g, m) => this.root.add(new THREE.Mesh(g, m));
      const Z0 = -1650,
        Z1 = TIP_Z - 4;
      // west (Hudson) and east (East River): promenade, park strip, shore highway
      const W = z => shoreW(z),
        E = z => shoreE(z);
      const y = LAND_Y;
      add(
        strip(
          z => W(z) + 0.5,
          z => W(z) + 10,
          Z0,
          Z1,
          10,
          y + 0.06,
          8,
        ),
        walk,
      );
      add(
        strip(
          z => W(z) + 10,
          z => W(z) + 22,
          Z0,
          Z1,
          10,
          y + 0.05,
          8,
        ),
        grass,
      );
      add(
        strip(
          z => W(z) + 24,
          z => W(z) + 32,
          Z0,
          Z1,
          10,
          y + 0.06,
          8,
        ),
        hwy,
      );
      add(
        strip(
          z => E(z) - 10,
          z => E(z) - 0.5,
          Z0,
          Z1,
          10,
          y + 0.06,
          8,
        ),
        walk,
      );
      add(
        strip(
          z => E(z) - 22,
          z => E(z) - 10,
          Z0,
          Z1,
          10,
          y + 0.05,
          8,
        ),
        grass,
      );
      add(
        strip(
          z => E(z) - 32,
          z => E(z) - 24,
          Z0,
          Z1,
          10,
          y + 0.06,
          8,
        ),
        hwy,
      );
      // lamps, benches and plane trees along both promenades
      const posts = [],
        heads = [],
        trunks = [],
        crowns = [];
      const cols = ['#5f8f52', '#527f4c', '#6b9a58', '#4a7a50'];
      const rr = N3.rngOf(9);
      const step = this.mobile ? 36 : 22;
      for (let z = Z0 + 10; z < Z1 - 6; z += step)
        [
          [W(z) + 6, 1],
          [E(z) - 6, -1],
        ].forEach(([x, s]) => {
          posts.push({ x, y: Y + 2.6, z });
          heads.push({ x, y: Y + 5.2, z });
          const tx = s > 0 ? W(z) + 14 : E(z) - 14;
          trunks.push({ x: tx, y: Y + 1.5, z: z + 8 });
          crowns.push({ x: tx, y: Y + 4.8, z: z + 8, s: 1.3, c: cols[Math.floor(rr() * 4)] });
        });
      this._inst(
        new THREE.CylinderGeometry(0.08, 0.11, 5.2, 6),
        new THREE.MeshStandardMaterial({ color: '#2f343c' }),
        posts,
      );
      const headM = new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffd58a', emissiveIntensity: 0.2 });
      this.lit.push({ m: headM, day: 0.2, evening: 2.6, night: 3.4 });
      this._inst(new THREE.SphereGeometry(0.34, 8, 6), headM, heads);
      this._inst(
        new THREE.CylinderGeometry(0.2, 0.3, 3, 6),
        new THREE.MeshStandardMaterial({ color: '#6b5a48' }),
        trunks,
      );
      this._inst(
        new THREE.IcosahedronGeometry(2.2, 0),
        new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
        crowns,
        true,
      );
      // street trees down every avenue sidewalk near the middle of the island
      const st = [],
        sc = [];
      AVENUES.forEach(a => {
        if (this.mobile && Math.abs(a) > 120) return;
        for (let z = -560; z < 380; z += 22) {
          if (inPark(a, z, 6)) continue;
          if (Math.abs(a) === 22 && Math.abs(z) < 170) continue;
          if (!N3.onIsland(a, z, 30)) continue;
          [-1, 1].forEach(s => {
            const x = a + s * 6.2,
              zz = z + (rr() - 0.5) * 6;
            if (KEEP.some(k => x > k[0] && x < k[1] && zz > k[2] && zz < k[3])) return;
            st.push({ x, y: Y + 1.3, z: zz });
            sc.push({ x, y: Y + 3.9, z: zz, s: 0.95, c: cols[Math.floor(rr() * 4)] });
          });
        }
      });
      this._inst(
        new THREE.CylinderGeometry(0.15, 0.24, 2.6, 6),
        new THREE.MeshStandardMaterial({ color: '#6b5a48' }),
        st,
      );
      this._inst(
        new THREE.IcosahedronGeometry(1.7, 0),
        new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
        sc,
        true,
      );
      // piers along the Hudson, with long arched sheds on some
      const parts = [];
      const concrete = '#8f8c84',
        shed = '#aeb4bb',
        roof = '#6e7782',
        dark = '#3a3d44';
      for (let z = -150; z <= 330; z += 34) {
        const len = 38 + (Math.abs(z * 7) % 22),
          wd = 12;
        const x0 = W(z) - len / 2 + 1;
        parts.push(N3.part(N3.box(len, 0.5, wd), concrete, x0, LAND_Y - 0.1, z));
        parts.push(
          N3.part(
            N3.box(len - 1, WATER_Y * -1 + LAND_Y - 0.5, wd - 1.5).translate(0, 0, 0),
            dark,
            x0,
            (LAND_Y + WATER_Y) / 2 - 0.4,
            z,
          ),
        );
        if (Math.round((z + 150) / 34) % 2 === 0) {
          parts.push(N3.part(N3.box(len * 0.75, 4.5, wd - 2), shed, x0 + 2, LAND_Y + 2.4, z));
          const c = N3.cyl((wd - 2) / 2, (wd - 2) / 2, len * 0.75, 10);
          const cg = c.index ? c.toNonIndexed() : c;
          parts.push(N3.part(cg, roof, x0 + 2, LAND_Y + 4.6, z, 0, 0, Math.PI / 2));
        } else {
          for (let k = 0; k < 4; k++)
            parts.push(N3.part(N3.cyl(0.3, 0.3, 1, 6), '#e6c64a', x0 - len / 2 + 6 + k * 12, LAND_Y + 0.7, z + 4));
        }
      }
      // east side: ferry slips and a heliport pad
      for (let z = -40; z <= 220; z += 52) {
        const x0 = E(z) + 14;
        parts.push(N3.part(N3.box(28, 0.5, 8), concrete, x0, LAND_Y - 0.1, z));
        parts.push(N3.part(N3.box(26, 0.7, 6.5), dark, x0, (LAND_Y + WATER_Y) / 2, z));
      }
      const pg = N3.merge(parts);
      this.root.add(new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
    }

    /* ---------------- bridges ---------------- */
    _deck(x0, x1, zc, halfW, hFn) {
      // a road deck whose height follows hFn(x): top, two sides and an underside, vertex coloured
      const pos = [],
        col = [];
      const asphalt = new THREE.Color('#4a4f5a'),
        concrete = new THREE.Color('#b8b4aa'),
        under = new THREE.Color('#6e6c66');
      const quadV = (a, b, c, d, color) => {
        [a, b, c, a, c, d].forEach(p => {
          pos.push(...p);
          col.push(color.r, color.g, color.b);
        });
      };
      const step = 4;
      for (let x = x0; x < x1; x += step) {
        const xn = Math.min(x + step, x1);
        const h0 = hFn(x),
          h1 = hFn(xn);
        const T = 1.2;
        quadV([x, h0, zc - halfW], [x, h0, zc + halfW], [xn, h1, zc + halfW], [xn, h1, zc - halfW], asphalt);
        quadV(
          [x, h0 - T, zc - halfW],
          [xn, h1 - T, zc - halfW],
          [xn, h1 - T, zc + halfW],
          [x, h0 - T, zc + halfW],
          under,
        );
        quadV([x, h0 - T, zc + halfW], [xn, h1 - T, zc + halfW], [xn, h1, zc + halfW], [x, h0, zc + halfW], concrete);
        quadV([x, h0, zc - halfW], [xn, h1, zc - halfW], [xn, h1 - T, zc - halfW], [x, h0 - T, zc - halfW], concrete);
        // parapets
        for (const s of [-1, 1]) {
          const zz = zc + s * (halfW - 0.2);
          quadV([x, h0, zz - 0.2], [xn, h1, zz - 0.2], [xn, h1 + 1, zz - 0.2], [x, h0 + 1, zz - 0.2], concrete);
          quadV([x, h0, zz + 0.2], [x, h0 + 1, zz + 0.2], [xn, h1 + 1, zz + 0.2], [xn, h1, zz + 0.2], concrete);
          quadV([x, h0 + 1, zz - 0.2], [xn, h1 + 1, zz - 0.2], [xn, h1 + 1, zz + 0.2], [x, h0 + 1, zz + 0.2], concrete);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    }
    _bridge(zb, kind, river, halfW = 8) {
      const near = river === 'east' ? shoreE(zb) : shoreW(zb);
      const far = river === 'east' ? farE(zb) : farW(zb);
      const dirx = far > near ? 1 : -1;
      const H = kind === 'plain' ? 9 : 17; // deck height over the street
      const ramp = 80;
      const xa = near - dirx * ramp,
        xb = far + dirx * ramp;
      const x0 = Math.min(xa, xb),
        x1 = Math.max(xa, xb);
      const hFn = x => {
        const t1 = Math.min(1, Math.abs(x - xa) / ramp),
          t2 = Math.min(1, Math.abs(x - xb) / ramp);
        return Y + 0.2 + H * Math.min(t1, t2, 1);
      };
      const parts = [];
      const g = this._deck(x0, x1, zb, halfW, hFn);
      parts.push(g);
      const mats = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
      const pierC = '#a9a59a';
      // piers every 26 along the deck
      const pp = [];
      for (let x = x0 + 13; x < x1; x += 26) {
        const h = hFn(x) - 1.2;
        const ground = x > Math.min(near, far) && x < Math.max(near, far) ? WATER_Y - 0.5 : LAND_Y;
        if (h - ground < 1.5) continue;
        pp.push(N3.part(N3.box(2.6, h - ground, halfW * 1.2), pierC, x, (h + ground) / 2, zb));
      }
      const mesh = new THREE.Mesh(g, mats);
      this.root.add(mesh);
      if (pp.length) this.root.add(new THREE.Mesh(N3.merge(pp), mats));
      const steel = kind === 'arch' ? '#b5483a' : '#eceae4';
      const lines = [];
      if (kind === 'cable') {
        const wx0 = Math.min(near, far),
          wx1 = Math.max(near, far);
        const px = [wx0 + (wx1 - wx0) * 0.22, wx1 - (wx1 - wx0) * 0.22];
        const top = Y + H + 54;
        const pyl = [];
        px.forEach(x => {
          [-1, 1].forEach(s => {
            pyl.push(
              N3.part(
                N3.box(2.2, top - (WATER_Y - 0.5), 2.2),
                steel,
                x,
                (top + WATER_Y - 0.5) / 2,
                zb + s * (halfW + 0.8),
              ),
            );
          });
          pyl.push(N3.part(N3.box(2, 2.4, halfW * 2 + 4), steel, x, top - 2, zb));
          pyl.push(N3.part(N3.box(2, 2.4, halfW * 2 + 4), steel, x, Y + H + 12, zb));
        });
        this.root.add(
          new THREE.Mesh(N3.merge(pyl), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })),
        );
        px.forEach(x => {
          for (let i = 1; i <= 10; i++)
            for (const sx of [-1, 1])
              for (const sz of [-1, 1]) {
                lines.push(
                  x,
                  top - 2 - i * 1.5,
                  zb + sz * (halfW + 0.8),
                  x + sx * i * 7.2,
                  hFn(x + sx * i * 7.2) + 1,
                  zb + sz * (halfW - 0.4),
                );
              }
        });
      } else if (kind === 'arch') {
        const wx0 = Math.min(near, far) - 6,
          wx1 = Math.max(near, far) + 6;
        const rise = 40;
        const pts = [];
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          pts.push(new THREE.Vector3(wx0 + (wx1 - wx0) * t, Y + H + rise * 4 * t * (1 - t), 0));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const parch = [];
        [-1, 1].forEach(s => {
          const tg = new THREE.TubeGeometry(curve, 40, 0.95, 6, false);
          tg.translate(0, 0, zb + s * (halfW - 0.5));
          parch.push(N3.part(tg, steel));
          for (let i = 1; i < 24; i++) {
            const p = pts[i];
            lines.push(p.x, p.y, zb + s * (halfW - 0.5), p.x, hFn(p.x) + 1, zb + s * (halfW - 0.5));
          }
        });
        this.root.add(
          new THREE.Mesh(N3.merge(parch), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })),
        );
      } else {
        // a plain steel truss: top chord rails
        const tr = [];
        const wx0 = Math.min(near, far),
          wx1 = Math.max(near, far);
        [-1, 1].forEach(s =>
          tr.push(N3.part(N3.box(wx1 - wx0, 1, 0.6), '#6f7b86', (wx0 + wx1) / 2, Y + H + 7, zb + s * (halfW - 0.5))),
        );
        for (let x = wx0; x <= wx1; x += 12)
          [-1, 1].forEach(s =>
            lines.push(
              x,
              hFn(x) + 0.5,
              zb + s * (halfW - 0.5),
              x + 6,
              Y + H + 7,
              zb + s * (halfW - 0.5),
              x + 6,
              Y + H + 7,
              zb + s * (halfW - 0.5),
              x + 12,
              hFn(x + 12) + 0.5,
              zb + s * (halfW - 0.5),
            ),
          );
        this.root.add(
          new THREE.Mesh(N3.merge(tr), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })),
        );
      }
      if (lines.length) {
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
        this.root.add(
          new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: kind === 'arch' ? '#c9b8a8' : '#f4f2ec' })),
        );
      }
      // lights along the deck
      const lightM = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffd9a0', emissiveIntensity: 0.1 });
      if (!this._bridgeLight) {
        this._bridgeLight = lightM;
        this.lit.push({ m: lightM, day: 0.1, evening: 2.2, night: 3 });
      }
      const lp = [];
      for (let x = x0 + 8; x < x1; x += 16)
        [-1, 1].forEach(s => lp.push({ x, y: hFn(x) + 1.6, z: zb + s * (halfW - 0.2) }));
      this._inst(new THREE.SphereGeometry(0.3, 6, 5), this._bridgeLight, lp);
      return { zb, near, far, hFn, x0, x1, halfW, river };
    }
    _bridges() {
      this.bridges = [
        this._bridge(-139, 'cable', 'east', 9),
        this._bridge(178, 'arch', 'east', 9),
        this._bridge(-459, 'plain', 'east', 8),
        this._bridge(-619, 'plain', 'west', 8),
        this._bridge(258, 'plain', 'west', 8),
      ];
    }

    /* ---------------- the harbour ---------------- */
    _harbor() {
      // an island with a fort, grass and a ferry dock
      const ix = 150,
        iz = 650;
      const grass = new THREE.Mesh(
        new THREE.CylinderGeometry(70, 76, 3.4, 28),
        new THREE.MeshStandardMaterial({ color: '#7a9f62', roughness: 1 }),
      );
      grass.scale.set(1.5, 1, 0.8);
      grass.position.set(ix, LAND_Y - 1.6, iz);
      this.root.add(grass);
      const fort = N3.merge([
        N3.part(N3.cyl(20, 22, 7, 20), '#a9826a', ix + 20, LAND_Y + 3.5 - 1, iz - 4),
        N3.part(N3.cyl(18, 18, 0.6, 20), '#7a9f62', ix + 20, LAND_Y + 7.1, iz - 4),
        N3.part(N3.box(14, 6, 10), '#c9b79c', ix - 40, LAND_Y + 3, iz + 6),
        N3.part(N3.box(15, 1, 11), '#7a5a3f', ix - 40, LAND_Y + 6.5, iz + 6),
        N3.part(N3.box(26, 0.6, 5), '#8b6f4c', ix - 70, LAND_Y - 0.3, iz + 30),
      ]);
      this.root.add(new THREE.Mesh(fort, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
      const rr = N3.rngOf(77);
      const tr = [],
        cr = [];
      for (let i = 0; i < 70; i++) {
        const a = rr() * 6.28,
          rad = Math.sqrt(rr()) * 60;
        const x = ix + Math.cos(a) * rad * 1.45,
          z = iz + Math.sin(a) * rad * 0.75;
        tr.push({ x, y: LAND_Y + 1.5, z });
        cr.push({ x, y: LAND_Y + 4.6, z, s: 1.1, c: ['#5f8f52', '#527f4c', '#6b9a58'][i % 3] });
      }
      this._inst(new THREE.CylinderGeometry(0.2, 0.3, 3, 6), new THREE.MeshStandardMaterial({ color: '#6b5a48' }), tr);
      this._inst(
        new THREE.IcosahedronGeometry(2.2, 0),
        new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
        cr,
        true,
      );
    }

    /* ---------------- boats ---------------- */
    _boatGeo(kind) {
      const p = [];
      const hullBox = (L, W, H, y, color) => p.push(N3.part(N3.box(L, H, W), color, 0, y, 0));
      const bow = (L, W, H, y, color) => {
        const c = new THREE.ConeGeometry(W / 2, W * 0.9, 4);
        p.push(N3.part(c, color, L / 2 + W * 0.3, y, 0, 0, Math.PI / 4, -Math.PI / 2));
      };
      if (kind === 'ferry') {
        const L = 28,
          W = 7.2;
        hullBox(L, W, 2.4, 0.6, '#f2f2ee');
        bow(L, W, 2.4, 0.6, '#f2f2ee');
        hullBox(L + 0.1, W + 0.1, 0.5, 0.2, '#e07a2d');
        hullBox(L * 0.8, W - 0.6, 2.1, 2.9, '#f2f2ee');
        hullBox(L * 0.8 + 0.1, W - 0.4, 0.8, 3.1, '#2b3a4f');
        hullBox(L * 0.55, W - 1.4, 2.0, 4.9, '#f2f2ee');
        hullBox(L * 0.55 + 0.1, W - 1.2, 0.7, 5.0, '#2b3a4f');
        p.push(N3.part(N3.cyl(0.9, 0.9, 2.4, 8), '#e07a2d', -3, 6.8, 0));
      } else if (kind === 'tug') {
        const L = 15,
          W = 5.6;
        hullBox(L, W, 2.4, 0.6, '#b2352c');
        bow(L, W, 2.4, 0.6, '#b2352c');
        hullBox(L + 0.3, W + 0.3, 0.5, 1.6, '#1d1f24');
        hullBox(L * 0.4, W - 1.4, 2.4, 2.9, '#f2f2ee');
        hullBox(L * 0.4 - 0.2, W - 1.2, 0.7, 3.2, '#2b3a4f');
        p.push(N3.part(N3.cyl(0.8, 0.9, 3, 8), '#1d1f24', -1.5, 4.7, 0));
        p.push(N3.part(N3.cyl(0.82, 0.82, 0.6, 8), '#b2352c', -1.5, 5.4, 0));
      } else if (kind === 'taxi') {
        const L = 11,
          W = 3.6;
        hullBox(L, W, 1.2, 0.5, '#f2b807');
        bow(L, W, 1.2, 0.5, '#f2b807');
        hullBox(L * 0.5, W - 0.8, 1.5, 1.7, '#f2f2ee');
        hullBox(L * 0.5 + 0.1, W - 0.6, 0.6, 1.8, '#2b3a4f');
      } else if (kind === 'barge') {
        const L = 46,
          W = 12;
        hullBox(L, W, 2.4, 0.5, '#6e3a2c');
        const cols = ['#b2352c', '#2f5f8f', '#d29a2c', '#3f7a52', '#8a8f99', '#e8e2d4'];
        for (let i = 0; i < 6; i++)
          for (let j = 0; j < 3; j++)
            if ((i * 3 + j) % 5 !== 0)
              p.push(N3.part(N3.box(6.6, 2.6, 3.7), cols[(i + j * 2) % 6], -L / 2 + 5 + i * 7.2, 3, (j - 1) * 3.9));
      } else if (kind === 'ship') {
        const L = 130,
          W = 22;
        hullBox(L, W, 7, 2.5, '#1e3350');
        bow(L, W, 7, 2.5, '#1e3350');
        hullBox(L, W + 0.1, 1.2, 6.4, '#b2352c');
        const cols = ['#b2352c', '#2f5f8f', '#d29a2c', '#3f7a52', '#8a8f99', '#e8e2d4', '#c0572a'];
        for (let i = 0; i < 14; i++)
          for (let j = 0; j < 5; j++)
            for (let k = 0; k < 2; k++)
              if (i < 11)
                p.push(
                  N3.part(
                    N3.box(7, 2.6, 3.8),
                    cols[(i + j * 3 + k) % 7],
                    -L / 2 + 8 + i * 7.3,
                    8.2 + k * 2.6,
                    (j - 2) * 4,
                  ),
                );
        p.push(N3.part(N3.box(12, 14, 18), '#f2f2ee', -L / 2 + 8, 11, 0));
        p.push(N3.part(N3.box(12.2, 2, 18.2), '#2b3a4f', -L / 2 + 8, 15.5, 0));
      } else {
        // sailboat
        hullBox(8, 2.2, 0.9, 0.4, '#f2f2ee');
        bow(8, 2.2, 0.9, 0.4, '#f2f2ee');
        const s = new THREE.BufferGeometry();
        s.setAttribute(
          'position',
          new THREE.Float32BufferAttribute([0, 0.9, 0, 0, 8.5, 0, -3.4, 0.9, 0, 0, 0.9, 0, -3.4, 0.9, 0, 0, 8.5, 0], 3),
        );
        s.computeVertexNormals();
        p.push(N3.colorize(s, '#f7f4ea'));
        p.push(N3.part(N3.cyl(0.07, 0.07, 8, 4), '#c9ced6', 0, 4.4, 0));
      }
      return N3.merge(p);
    }
    _boats() {
      const lane = (name, pos, len) => ({ name, pos, len });
      // water lanes: [x, z] for a distance s along them
      const hud = off => s => {
        const z = -1500 + s;
        return [(shoreW(z) + farW(z)) / 2 + off, z];
      };
      const eas = off => s => {
        const z = -1500 + s;
        return [(shoreE(z) + farE(z)) / 2 + off, z];
      };
      const harb = (cx, cz, rx, rz) => s => {
        const a = s / 400;
        return [cx + rx * Math.cos(a), cz + rz * Math.sin(a)];
      };
      const specs = [
        ['ferry', hud(-12), 1, 11, 2300],
        ['ferry', hud(10), -1, 9, 2100],
        ['ferry', hud(-30), 1, 10, 1500],
        ['tug', hud(26), -1, 6, 1900],
        ['barge', hud(26), -1, 6, 1900],
        ['tug', eas(-14), 1, 6, 2000],
        ['barge', eas(-14), 1, 6, 1994],
        ['taxi', eas(12), -1, 14, 2200],
        ['taxi', hud(-4), -1, 15, 1700],
        ['taxi', eas(0), 1, 13, 800],
        ['ferry', eas(-4), -1, 9, 700],
        ['ship', harb(-80, 740, 260, 90), 1, 5, 0],
        ['tug', harb(-80, 740, 240, 80), 1, 5, 400],
        ['sail', harb(60, 760, 120, 40), 1, 5, 0],
        ['sail', harb(110, 740, 160, 50), -1, 5, 300],
        ['sail', harb(-20, 780, 140, 60), 1, 6, 900],
        ['ferry', harb(30, 620, 140, 50), 1, 8, 200],
      ];
      const n = this.mobile ? 10 : specs.length;
      const geos = {};
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
      specs.slice(0, n).forEach(([kind, pos, dir, v, s0]) => {
        const g = (geos[kind] ||= this._boatGeo(kind));
        const m = new THREE.Mesh(g, mat);
        this.root.add(m);
        this.boats.push({ m, pos, dir, v, s: s0, kind, bob: Math.random() * 6 });
      });
      // a couple of ferries tied up at the piers
      [
        [-150, -1],
        [230, -1],
      ].forEach(([z]) => {
        const m = new THREE.Mesh((geos.ferry ||= this._boatGeo('ferry')), mat);
        m.position.set(shoreW(z) - 20, WATER_Y + 0.15, z + 14);
        m.rotation.y = Math.PI / 2;
        this.root.add(m);
      });
    }
    _placeBoat(b, t) {
      const [x, z] = b.pos(b.s),
        [x2, z2] = b.pos(b.s + 4);
      b.m.position.set(x, WATER_Y + 0.15 + Math.sin(t * 1.6 + b.bob) * 0.08, z);
      const dx = x2 - x,
        dz = z2 - z;
      b.m.rotation.y = Math.atan2(-dz, dx) + (b.dir < 0 ? Math.PI : 0);
    }

    /* ---------------- far traffic: instanced cabs on every avenue ---------------- */
    _traffic() {
      const rr = N3.rngOf(1234);
      const lanes = [];
      AVENUES.forEach(a => {
        [-1, 1].forEach(dir => {
          const cx = a + dir * 2;
          const z0 = Math.abs(a) === 22 ? 170 : -620,
            z1 = 440;
          const parts =
            Math.abs(a) === 22
              ? [
                  [170, 440],
                  [-330, -170],
                ]
              : Math.abs(a) < 118
                ? [[-330, 440]]
                : [[-620, 440]];
          parts.forEach(([p0, p1]) => {
            lanes.push({
              pos: s => [cx, s],
              len: p1 - p0,
              base: p0,
              axis: 'z',
              dir,
              n: Math.max(4, Math.round((p1 - p0) / (this.mobile ? 60 : 36))),
            });
          });
        });
      });
      // the shore highways
      [-1, 1].forEach(dir => {
        lanes.push({
          pos: s => [shoreW(s) + 28 + dir * 1.5, s],
          len: 1900,
          base: -1500,
          axis: 'z',
          dir,
          n: this.mobile ? 8 : 22,
        });
        lanes.push({
          pos: s => [shoreE(s) - 28 + dir * 1.5, s],
          len: 1900,
          base: -1500,
          axis: 'z',
          dir,
          n: this.mobile ? 8 : 22,
        });
      });
      // cross streets in the middle of the island
      STREETS.filter(s => s > -330 && s < 360 && s !== -19 && s !== 18 && (!this.mobile || s % 80 === 1)).forEach(s => {
        [-1, 1].forEach(dir =>
          lanes.push({ pos: x => [x, s + dir * 1.8], len: 640, base: -320, axis: 'x', dir, n: this.mobile ? 3 : 6 }),
        );
      });
      const cars = [];
      lanes.forEach(L => {
        for (let i = 0; i < L.n; i++)
          cars.push({
            L,
            s: L.base + (i / L.n) * L.len + rr() * 12,
            v: 8 + rr() * 5,
            c: rr() < 0.62 ? '#f2b807' : ['#1c1f26', '#f3f1ec', '#8b919b', '#2c4a6e', '#8a2b2b'][Math.floor(rr() * 5)],
          });
      });
      // cars crossing the bridges too
      this.bridges.forEach(b => {
        for (let i = 0; i < (this.mobile ? 3 : 6); i++) {
          const dir = i % 2 ? 1 : -1;
          const L = { bridge: b, axis: 'bridge', dir, base: b.x0 + 4, len: b.x1 - b.x0 - 8 };
          cars.push({
            L,
            s: b.x0 + 4 + rr() * (b.x1 - b.x0 - 8),
            v: 9 + rr() * 5,
            c: rr() < 0.6 ? '#f2b807' : '#2c4a6e',
            dirx: dir,
          });
        }
      });
      this.cabs = cars;
      const geo = N3.merge([
        N3.part(N3.box(4.2, 1.1, 1.8), '#fff', 0, 0.7, 0),
        N3.part(N3.box(2.2, 0.7, 1.6), '#fff', -0.3, 1.45, 0),
      ]);
      geo.deleteAttribute('color');
      const im = new THREE.InstancedMesh(
        geo,
        new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 }),
        cars.length,
      );
      const c = new THREE.Color();
      cars.forEach((k, i) => im.setColorAt(i, c.set(k.c)));
      im.frustumCulled = false;
      this.root.add(im);
      this.cabMesh = im;
      const hl = new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff2c4', emissiveIntensity: 0.3 });
      this.lit.push({ m: hl, day: 0.3, evening: 3, night: 4 });
      this.cabLights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.25, 1.4), hl, cars.length);
      this.cabLights.frustumCulled = false;
      this.root.add(this.cabLights);
      this._d = new THREE.Object3D();
    }
    _placeCabs(dt) {
      const d = this._d;
      this.cabs.forEach((k, i) => {
        const L = k.L;
        k.s += k.v * dt * L.dir;
        if (k.s > L.base + L.len) k.s = L.base;
        if (k.s < L.base) k.s = L.base + L.len;
        let x, y, z, yaw;
        if (L.axis === 'bridge') {
          x = k.s;
          z = L.bridge.zb + L.dir * 3.2;
          y = L.bridge.hFn(x) + 0.1;
          const dy = L.bridge.hFn(x + 2) - L.bridge.hFn(x);
          yaw = L.dir > 0 ? 0 : Math.PI;
          d.rotation.set(0, yaw, -Math.atan2(dy, 2) * L.dir);
        } else if (L.axis === 'z') {
          [x, z] = L.pos(k.s);
          y = Y;
          yaw = L.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
          d.rotation.set(0, yaw, 0);
        } else {
          [x, z] = L.pos(k.s);
          y = Y;
          yaw = L.dir > 0 ? 0 : Math.PI;
          d.rotation.set(0, yaw, 0);
        }
        d.position.set(x, y, z);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        this.cabMesh.setMatrixAt(i, d.matrix);
        const c = Math.cos(yaw),
          s = Math.sin(yaw);
        d.position.set(x + c * 2.1, y + 0.8, z - s * 2.1);
        d.updateMatrix();
        this.cabLights.setMatrixAt(i, d.matrix);
      });
      this.cabMesh.instanceMatrix.needsUpdate = true;
      this.cabLights.instanceMatrix.needsUpdate = true;
    }

    /* ---------------- per frame ---------------- */
    update(dt, t, camera) {
      dt = Math.min(dt, 0.1);
      for (const m of this.water) {
        m.map.offset.x += dt * 0.004;
        m.map.offset.y += dt * 0.002;
      }
      for (const b of this.boats) {
        b.s += b.v * dt * b.dir;
        this._placeBoat(b, t);
        if (b.kind !== 'ship' && b.kind !== 'sail' && b.m.position.z > SOUTH_SHORE - 60 && b.dir > 0) b.s -= 2300;
        if (b.kind !== 'ship' && b.kind !== 'sail' && b.m.position.z < -1480 && b.dir < 0) b.s += 2300;
      }
      this._placeCabs(dt);
      if (this.beacons) this.beacons.visible = Math.sin(t * 2.4) > -0.2;
      // a nearer clip plane when the camera is high keeps the far ground layers from flickering
      if (camera) {
        const near = camera.position.y > 60 ? 1.2 : 0.1;
        if (camera.near !== near) {
          camera.near = near;
          camera.updateProjectionMatrix();
        }
      }
    }

    setTimeOfDay(tod) {
      this.lit.forEach(x => {
        x.m.emissiveIntensity = x[tod] ?? x.day;
      });
      const ground = tod === 'day' ? '#bdb8ae' : tod === 'evening' ? '#8f8480' : '#3a3d48';
      this.landMat.color.set(ground);
      this.bankMat.color.set(tod === 'day' ? '#8e8b80' : tod === 'evening' ? '#6e6762' : '#2d3039');
      this.roadMat.color.set(tod === 'day' ? '#ffffff' : tod === 'evening' ? '#b8a8a2' : '#6a6e7c');
      this.parkMat.color.set(tod === 'day' ? '#ffffff' : tod === 'evening' ? '#b8a8a2' : '#5a6070');
      this.grassMat.color.set(tod === 'day' ? '#7a9f62' : tod === 'evening' ? '#5a6a50' : '#2a3a34');
      const water = tod === 'day' ? '#ffffff' : tod === 'evening' ? '#c9a6b8' : '#5a6c9a';
      this.water.forEach(m => m.color.set(water));
      // haze: the city fades out long before the edge of the world
      const f = this.office.scene.fog;
      if (f) {
        f.near = tod === 'night' ? 140 : 220;
        f.far = tod === 'night' ? 1350 : 1750;
        // a cool city haze by day, so the far ground does not read as sand against the blue sky
        if (tod === 'day') f.color.set('#dbe5ec');
      }
    }

    /** Camera spots for the guided visits. */
    view(which) {
      const wz = 60;
      return (
        {
          aerial: [
            [180, 300, 640],
            [0, -6, -40],
          ],
          walk: [
            [shoreW(120) + 8, 3.2, 120],
            [shoreW(40) - 40, 8, -40],
          ],
          bridge: [
            [shoreE(-139) - 40, 34, -139 + 120],
            [(shoreE(-139) + farE(-139)) / 2, 22, -139],
          ],
          boats: [
            [shoreW(160) + 36, 22, 168],
            [shoreW(160) - 70, -3, 110],
          ],
          skyline: [
            [shoreW(-60) - 70, 26, -20],
            [40, 70, -230],
          ],
          towers: [
            [-30, 85, -120],
            [60, 130, -240],
          ],
          green: [
            [0, 120, -300],
            [0, -6, -500],
          ],
          times: [
            [118, 36, -14],
            [118, 32, -70],
          ],
          beach: [
            [-70, 40, 470],
            [20, -3, 640],
          ],
          ocean: [
            [-230, 36, 520],
            [60, -3, 740],
          ],
        }[which] || [
          [420, 330, 560],
          [0, -6, -60],
        ]
      );
    }
  }

  return { Florida };
})();
