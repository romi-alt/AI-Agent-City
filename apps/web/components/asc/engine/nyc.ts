// @ts-nocheck
// Shared New York recipes for the demo city: the street grid and shorelines (one source of truth for the street-level
// city, the dealer billboards and the big city), muted brick / limestone / glass palettes, tiled window facades for
// instanced towers, and small merged-geometry helpers. Everything is generated in code: no model or image downloads.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const N3 = (() => {
  const STREET_Y = -6; // street level (the HQ office floor is y = 0)
  const CW = 3.2; // one window module, wide
  const FH = 3.6; // one floor, high
  const TILE = 8; // modules per facade texture tile, both ways

  /* ------------------------------------------------------------------ the grid */
  // Avenues run along z (north is -z); cross streets along x. The two streets and the two avenues around the HQ are the
  // street-level city's own roads; everything else is laid out from these lists by the big city.
  const AVENUES = [-310, -214, -118, -22, 22, 118, 214, 310];
  const STREETS = (() => {
    const s = [-19, 18];
    for (let j = 1; j <= 40; j++) s.unshift(-19 - 40 * j);
    for (let j = 1; j <= 12; j++) s.push(18 + 40 * j);
    return s;
  })();
  const ROAD_HALF = 4;

  // Manhattan's shores: the Hudson on the west, the East River on the east, the harbour round the southern tip.
  const shoreW = z => -342 + 10 * Math.sin(z / 170) + 5 * Math.sin(z / 57);
  const shoreE = z => 344 + 9 * Math.sin(z / 190 + 1) + 4 * Math.sin(z / 61);
  const farW = z => shoreW(z) - 120 - 14 * Math.sin(z / 260); // the New Jersey bank
  const farE = z => shoreE(z) + 80 + 10 * Math.sin(z / 210 + 2); // the Queens bank
  const TIP_Z = 380;
  const TIP_R = 150;
  const tipHalf = z => 345 * Math.sqrt(Math.max(0, 1 - ((z - TIP_Z) / TIP_R) ** 2));
  const SOUTH_SHORE = 900; // far bank of the harbour
  const onIsland = (x, z, pad = 8) =>
    z < TIP_Z ? x > shoreW(z) + pad && x < shoreE(z) - pad : Math.abs(x) < tipHalf(z) - pad;
  const WATER_Y = STREET_Y - 2.4;
  const LAND_Y = STREET_Y - 0.12;

  /** Times-Square-style junction: four tall corner towers carry the big lit screens. */
  const SQUARE = { x: 118, z: -59 };
  const SQ_LOT = 19.2;
  const SQ_FLOORS = 16;
  const SQ_H = SQ_FLOORS * FH + 1;
  const squareLots = () => {
    const o = ROAD_HALF + 2.5;
    return [
      { sx: 1, sz: -1 },
      { sx: -1, sz: -1 },
      { sx: 1, sz: 1 },
      { sx: -1, sz: 1 },
    ].map(({ sx, sz }) => {
      const cx = SQUARE.x + sx * (o + SQ_LOT / 2),
        cz = SQUARE.z + sz * (o + SQ_LOT / 2);
      return { cx, cz, w: SQ_LOT, d: SQ_LOT, h: SQ_H, sx, sz };
    });
  };
  /** Screens fixed to the two faces of each corner tower that look at the junction. */
  const squareScreens = () => {
    const out = [];
    squareLots().forEach(({ cx, cz, sx, sz }, i) => {
      const faceX = cx - sx * (SQ_LOT / 2) - sx * 0.5; // proud of the face that looks along the street
      out.push({ x: faceX, z: cz, yaw: sx > 0 ? -Math.PI / 2 : Math.PI / 2, w: 17, h: 15, y: 30, ad: i * 2 });
      const faceZ = cz - sz * (SQ_LOT / 2) - sz * 0.5;
      out.push({ x: cx, z: faceZ, yaw: sz > 0 ? Math.PI : 0, w: 17, h: 10, y: 16, ad: i * 2 + 1 });
    });
    return out;
  };

  /* ------------------------------------------------------------------ palettes */
  const BRICKS = ['#8c4b39', '#7d4435', '#9a5a42', '#6f3f33', '#a46a50', '#84503f'];
  const STONES = ['#cfc7b4', '#bdb49f', '#d6cfbf', '#b0a792', '#c4bba6'];
  const BROWNSTONES = ['#6e4a3c', '#7b5444', '#5f4136', '#73503f'];
  const GLASSES = ['#5d7487', '#4f6678', '#6b8396', '#7f8f9c', '#3f4d5a', '#58708a'];
  const CONCRETES = ['#b5b0a6', '#9c9a94', '#c5c0b4', '#a8a69e'];
  const TOWER_TONES = ['#8c9aaa', '#a3adb8', '#7b8998', '#b5bcc4', '#95a0ab', '#c2b8a6'];
  const AWNINGS = ['#1f3b2d', '#5a1f1f', '#1d2f4d', '#2b2b2b', '#6b5a2e', '#7a2e2e', '#2d4a5a', '#c9a24a'];
  const SHOPS = [
    'DELI',
    'BODEGA',
    'PIZZA',
    'BAGELS',
    'PHARMACY',
    'NEWSSTAND',
    'BANK',
    'FLORIST',
    'DINER',
    'LAUNDRY',
    'BARBER',
    'SUSHI',
    'COFFEE',
    'BOOKS',
    'CHEESE',
    'TAILOR',
    'OPTICAL',
    'HARDWARE',
    'NOODLES',
    'DONUTS',
    'TACOS',
    'WINE',
  ];
  /** Invented ads for the big screens. No real brands; the demo dealerships and AutoSalesCity are ours. */
  const ADS = [
    {
      bg: '#f5b83d',
      fg: '#141414',
      big: 'ANSWER EVERY LEAD IN 60 SECONDS',
      small: 'AutoSalesCity · the AI sales floor for dealerships',
    },
    {
      bg: '#141a2e',
      fg: '#ffffff',
      big: 'BOOK TEST DRIVES WHILE YOU SLEEP',
      small: 'Your AI BDC works nights, weekends and holidays',
      accent: '#3ccf8e',
    },
    { bg: '#2f7cf6', fg: '#ffffff', big: 'AURORA MOTORS · TRADE-IN WEEK', small: 'Get your appraisal in 10 minutes' },
    {
      bg: '#1c2230',
      fg: '#f5b83d',
      big: 'FAST SALES TRAINING CENTER',
      small: 'Train your next F&I manager · Enroll today',
      accent: '#f5b83d',
    },
    { bg: '#18b67a', fg: '#ffffff', big: 'VOLTA EV · CHARGE INTO SPRING', small: 'Book a quiet test drive in 2 taps' },
    { bg: '#e5484d', fg: '#ffffff', big: 'NO LEAD LEFT BEHIND', small: 'Follow-ups that never forget · AutoSalesCity' },
    {
      bg: '#0d0d14',
      fg: '#ff4fa3',
      big: 'BROADWAY LIVE · TONIGHT 8 PM',
      small: 'Tickets in the lobby',
      accent: '#38e1ff',
    },
    { bg: '#fff3d6', fg: '#7a2e12', big: 'MERIDIAN COFFEE', small: 'Open all night', accent: '#e0852b' },
    {
      bg: '#0f3b57',
      fg: '#ffffff',
      big: 'NORTHLINE AIR · NEW SHUTTLE',
      small: 'Fly the harbor line',
      accent: '#7fd3ff',
    },
    { bg: '#6a2cd1', fg: '#ffffff', big: 'PULSE FITNESS', small: 'First month free', accent: '#ffd23f' },
    { bg: '#101010', fg: '#f2b705', big: 'METRO CAB · HAIL IT. RIDE IT.', small: 'Yellow, always', accent: '#f2b705' },
    { bg: '#1b5e20', fg: '#ffffff', big: 'HARBOR BANK', small: 'Banking that keeps moving', accent: '#c6ff00' },
  ];

  /* ------------------------------------------------------------------ small helpers */
  const rngOf = seed => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')];
  };
  /** Paint a geometry one flat colour (as a vertex colour) so several parts can merge into one draw call. */
  const colorize = (geo, hex) => {
    const c = new THREE.Color(hex),
      n = geo.attributes.position.count,
      a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  };
  const part = (geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    g.translate(x, y, z);
    return colorize(g, hex);
  };
  const merge = parts => mergeGeometries(parts.map(p => (p.index ? p.toNonIndexed() : p)));
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);

  /* ------------------------------------------------------------------ tiled window facades */
  const QUALITY = { mobile: false };
  const TEX = {};
  /** One facade tile per kind: colour, wall mask (white = takes the building's tint), night-lit windows. */
  const kindTextures = kind => {
    if (TEX[kind]) return TEX[kind];
    const S = 256,
      c = S / TILE;
    const [cm, gm] = canvas(S, S),
      [ck, gk] = canvas(S, S),
      [ce, ge] = canvas(S, S);
    const r = rngOf(kind.length * 977 + kind.charCodeAt(0));
    const lit = { brick: 0.36, lime: 0.42, glass: 0.5, deco: 0.4, dark: 0.3 }[kind];
    const wall = { brick: '#f2e9e2', lime: '#f4efe4', glass: '#ffffff', deco: '#f0e8d8', dark: '#e9e4dc' }[kind];
    gm.fillStyle = wall;
    gm.fillRect(0, 0, S, S);
    gk.fillStyle = '#fff';
    gk.fillRect(0, 0, S, S);
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, S, S);
    if (kind === 'brick') {
      gm.fillStyle = 'rgba(0,0,0,.09)';
      for (let y = 0; y < S; y += 4) gm.fillRect(0, y, S, 1);
      for (let y = 0; y < S; y += 8) for (let x = (y / 8) % 2 ? 0 : 6; x < S; x += 12) gm.fillRect(x, y, 1, 4);
    }
    if (kind === 'lime') {
      gm.fillStyle = 'rgba(0,0,0,.07)';
      for (let x = 0; x < S; x += c) gm.fillRect(x, 0, 1, S);
      for (let y = 0; y < S; y += c) gm.fillRect(0, y + c - 2, S, 1);
    }
    const lights = ['#ffd88a', '#ffe7b0', '#ffc66b', '#cfe6ff'];
    const win = (x, y, w, h, glass, trim) => {
      // trim and glass do not take the wall tint
      if (trim) {
        gm.fillStyle = trim;
        gm.fillRect(x - 2, y - 2, w + 4, h + 5);
        gk.fillStyle = '#000';
        gk.fillRect(x - 2, y - 2, w + 4, h + 5);
      }
      const gg = gm.createLinearGradient(0, y, 0, y + h);
      gg.addColorStop(0, glass[0]);
      gg.addColorStop(1, glass[1]);
      gm.fillStyle = gg;
      gm.fillRect(x, y, w, h);
      gk.fillStyle = '#000';
      gk.fillRect(x, y, w, h);
      if (r() < lit) {
        ge.fillStyle = lights[Math.floor(r() * lights.length)];
        ge.fillRect(x, y, w, h);
      }
    };
    for (let cy = 0; cy < TILE; cy++)
      for (let cx = 0; cx < TILE; cx++) {
        const x0 = cx * c,
          y0 = cy * c;
        if (kind === 'brick') {
          win(x0 + 9, y0 + 7, 14, 19, ['#3d5a73', '#233548'], '#e8dcc8');
          gm.fillStyle = '#cfc6b4';
          gm.fillRect(x0 + 15.5, y0 + 7, 1, 19);
          gm.fillRect(x0 + 9, y0 + 15, 14, 1);
          gm.fillStyle = '#e8dcc8';
          gm.fillRect(x0 + 6, y0 + 26, 20, 3);
          gk.fillStyle = '#000';
          gk.fillRect(x0 + 6, y0 + 26, 20, 3);
        } else if (kind === 'lime') {
          win(x0 + 5, y0 + 8, 8, 17, ['#4a6078', '#27384a'], '#fbf7ee');
          win(x0 + 19, y0 + 8, 8, 17, ['#4a6078', '#27384a'], '#fbf7ee');
        } else if (kind === 'glass') {
          const g2 = gm.createLinearGradient(x0, y0, x0 + c, y0 + c);
          g2.addColorStop(0, '#9ec3da');
          g2.addColorStop(1, '#4f7897');
          gm.fillStyle = g2;
          gm.fillRect(x0, y0, c, c - 8);
          gk.fillStyle = '#000';
          gk.fillRect(x0, y0, c, c - 8);
          gm.fillStyle = '#6d8aa0';
          gm.fillRect(x0, y0 + c - 8, c, 8); // spandrel: takes the tint
          gm.fillStyle = '#2f4254';
          gm.fillRect(x0, y0, 1, c);
          gm.fillRect(x0, y0 + c - 9, c, 1);
          gm.fillStyle = 'rgba(255,255,255,.14)';
          gm.beginPath();
          gm.moveTo(x0 + 3, y0 + c - 9);
          gm.lineTo(x0 + 20, y0);
          gm.lineTo(x0 + 28, y0);
          gm.lineTo(x0 + 11, y0 + c - 9);
          gm.fill();
          if (r() < lit) {
            ge.fillStyle = lights[Math.floor(r() * lights.length)];
            ge.fillRect(x0 + 1, y0 + 1, c - 1, c - 10);
          }
        } else if (kind === 'deco') {
          win(x0 + 8, y0 + 5, 16, 22, ['#34495f', '#1e2d3d'], null);
          gm.fillStyle = '#8a7a5a';
          gm.fillRect(x0 + 8, y0 + 22, 16, 5); // metal spandrel
          gk.fillStyle = '#000';
          gk.fillRect(x0 + 8, y0 + 22, 16, 5);
          gm.fillStyle = '#ffffff';
          gm.fillRect(x0 + 2, y0, 4, c); // lit piers
          gm.fillRect(x0 + 26, y0, 4, c);
        } else {
          win(x0 + 11, y0 + 9, 10, 13, ['#2f4358', '#1e2b3a'], '#d6cdb9');
        }
      }
    const mk = (cv, srgb) => {
      const t = new THREE.CanvasTexture(cv);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = QUALITY.mobile ? 2 : 4;
      return t;
    };
    return (TEX[kind] = { map: mk(cm, true), em: mk(ce, true), mask: mk(ck, false) });
  };

  const MATS = {};
  /**
   * One material per facade kind for a whole InstancedMesh of towers. The window grid keeps its real size whatever the
   * building's footprint and height are (UVs come from the instance scale), every instance has its own tint, a stone
   * cornice and a flat roof, and the ground floor can be a lit shopfront band.
   */
  const facadeMaterial = kind => {
    if (MATS[kind]) return MATS[kind];
    const T = kindTextures(kind);
    const m = new THREE.MeshStandardMaterial({
      map: T.map,
      emissiveMap: T.em,
      emissive: '#ffffff',
      emissiveIntensity: 0,
      roughness: kind === 'glass' ? 0.32 : 0.88,
      metalness: kind === 'glass' ? 0.3 : 0,
    });
    m.onBeforeCompile = sh => {
      sh.uniforms.maskMap = { value: T.mask };
      sh.uniforms.uTile = { value: new THREE.Vector2(CW * TILE, FH * TILE) };
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aTint; attribute vec2 aInfo;
          varying vec4 vTint; varying vec2 vInfo; varying float vTopD; varying float vBotD; varying float vUp;
          uniform vec2 uTile;`,
        )
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
          {
            vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
            vec3 an = abs(normal);
            vec2 ext = an.x > .5 ? vec2(isc.z, isc.y) : (an.z > .5 ? vec2(isc.x, isc.y) : vec2(isc.x, isc.z));
            vec2 off = floor(fract(vec2(aTint.w * 13.37, aTint.w * 7.91)) * 8.) / 8.;
            vec2 suv = uv * ext / uTile + off;
            vMapUv = suv; vEmissiveMapUv = suv;
            vTint = aTint; vInfo = aInfo;
            vTopD = (1. - position.y) * isc.y; vBotD = position.y * isc.y; vUp = step(.5, normal.y);
          }`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D maskMap;
          varying vec4 vTint; varying vec2 vInfo; varying float vTopD; varying float vBotD; varying float vUp;`,
        )
        .replace(
          '#include <map_fragment>',
          `vec4 tx = texture2D(map, vMapUv);
          float wm = texture2D(maskMap, vMapUv).r;
          vec3 col = mix(tx.rgb, tx.rgb * vTint.rgb, wm);
          float cornice = (1. - vUp) * step(vTopD, 1.0);
          float lip = step(vTopD, .38);
          col = mix(col, vTint.rgb * 0.8, cornice);
          col = mix(col, vTint.rgb * 1.2, cornice * lip);
          float shop = (1. - vUp) * vInfo.x * step(vBotD, 4.2) * (1. - cornice);
          col = mix(col, vTint.rgb * vec3(.55, .5, .46), shop);
          col = mix(col, vTint.rgb * .7, vUp);
          diffuseColor.rgb *= col;
          float emK = (1. - vUp) * (1. - cornice) * (1. - shop);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#ifdef USE_EMISSIVEMAP
            vec4 emitColor = texture2D(emissiveMap, vEmissiveMapUv);
            totalEmissiveRadiance *= emitColor.rgb * emK + vec3(1., .78, .5) * shop * .55;
          #endif`,
        );
    };
    m.customProgramCacheKey = () => 'nyc-facade';
    return (MATS[kind] = m);
  };

  /**
   * Collects towers per facade kind, then builds one InstancedMesh each. A tier is a box of a whole number of window
   * modules wide and floors high (plus the cornice), so the windows never get cut.
   */
  class Batch {
    constructor() {
      this.items = {};
      this.spires = [];
      this.crowns = [];
      this.beacons = [];
      this.tanks = [];
      this.baseY = 0;
    }
    q(w) {
      return Math.max(CW, Math.round(w / CW) * CW);
    }
    /** floors -> height including the cornice. */
    hOf(floors) {
      return Math.max(1, Math.round(floors)) * FH + 1;
    }
    tier(kind, cx, cz, w, d, y0, floors, tint, seed, o = {}) {
      const W = this.q(w),
        D = this.q(d),
        H = this.hOf(floors);
      (this.items[kind] ||= []).push({
        x: cx,
        y: y0,
        z: cz,
        w: W,
        d: D,
        h: H,
        yaw: o.yaw || 0,
        tint,
        seed,
        ground: y0 === 0 && !o.noShop ? 1 : 0,
      });
      return { top: y0 + H, w: W, d: D };
    }
    get count() {
      return Object.values(this.items).reduce((s, l) => s + l.length, 0);
    }
    build(root, { bloomSafe = false } = {}) {
      const dmy = new THREE.Object3D(),
        col = new THREE.Color();
      const meshes = [];
      for (const [kind, list] of Object.entries(this.items)) {
        if (!list.length) continue;
        const geo = new THREE.BoxGeometry(1, 1, 1);
        geo.translate(0, 0.5, 0);
        const tint = new Float32Array(list.length * 4),
          info = new Float32Array(list.length * 2);
        const im = new THREE.InstancedMesh(geo, facadeMaterial(kind), list.length);
        list.forEach((b, i) => {
          dmy.position.set(b.x, b.y + this.baseY, b.z);
          dmy.rotation.set(0, b.yaw, 0);
          dmy.scale.set(b.w, b.h, b.d);
          dmy.updateMatrix();
          im.setMatrixAt(i, dmy.matrix);
          col.set(b.tint);
          tint.set([col.r, col.g, col.b, b.seed], i * 4);
          info.set([b.ground, 0], i * 2);
        });
        geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 4));
        geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 2));
        im.frustumCulled = false;
        root.add(im);
        meshes.push(im);
      }
      this.meshes = meshes;
      // spires and crowns (stainless steel / copper), beacons on the tallest towers
      const metal = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.7, roughness: 0.3 });
      const place = (list, geo, mat, fn) => {
        if (!list.length) return null;
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((s, i) => {
          fn(dmy, s);
          dmy.position.y += this.baseY;
          dmy.updateMatrix();
          im.setMatrixAt(i, dmy.matrix);
        });
        im.frustumCulled = false;
        root.add(im);
        return im;
      };
      const mast = cyl(0.12, 0.9, 1, 6);
      mast.translate(0, 0.5, 0);
      place(this.spires, mast, metal, (d, s) => {
        d.position.set(s.x, s.y, s.z);
        d.rotation.set(0, 0, 0);
        d.scale.set(s.r, s.h, s.r);
      });
      const crown = new THREE.ConeGeometry(0.5, 1, 4);
      crown.rotateY(Math.PI / 4);
      crown.translate(0, 0.5, 0);
      place(this.crowns, crown, metal, (d, s) => {
        d.position.set(s.x, s.y, s.z);
        d.rotation.set(0, 0, 0);
        d.scale.set(s.w, s.h, s.w);
      });
      if (this.beacons.length) {
        const red = new THREE.MeshBasicMaterial({ color: '#ff3b3b', fog: false });
        this.beaconMesh = place(this.beacons, new THREE.SphereGeometry(0.7, 8, 6), red, (d, s) => {
          d.position.set(s.x, s.y, s.z);
          d.rotation.set(0, 0, 0);
          d.scale.setScalar(s.s || 1);
        });
      }
      if (this.tanks.length) {
        const tank = waterTowerGeo();
        this.tankMesh = place(
          this.tanks,
          tank,
          new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
          (d, s) => {
            d.position.set(s.x, s.y, s.z);
            d.rotation.set(0, s.yaw, 0);
            d.scale.setScalar(s.s);
          },
        );
      }
      return this;
    }
  }

  /** A wooden rooftop water tank on a steel frame, the New York signature. One merged geometry, vertex coloured. */
  function waterTowerGeo() {
    const wood = '#7a5a3f',
      roof = '#4a3a30',
      steel = '#3a3f46';
    const ps = [
      part(cyl(1.15, 1.15, 2.4, 10), wood, 0, 2.9, 0),
      part(new THREE.ConeGeometry(1.35, 0.9, 10), roof, 0, 4.55, 0),
      part(cyl(1.19, 1.19, 0.1, 10), steel, 0, 2.2, 0),
      part(cyl(1.19, 1.19, 0.1, 10), steel, 0, 3.6, 0),
    ];
    for (const [sx, sz] of [
      [-0.9, -0.9],
      [0.9, -0.9],
      [-0.9, 0.9],
      [0.9, 0.9],
    ])
      ps.push(part(box(0.12, 1.8, 0.12), steel, sx, 0.9, sz));
    ps.push(part(box(2.2, 0.1, 2.2), steel, 0, 1.75, 0));
    return merge(ps);
  }

  /* ------------------------------------------------------------------ tower archetypes */
  /** Lay out a setback tower: a base block, then shafts that step in. Returns the roof height and footprint. */
  function setback(b, kind, cx, cz, w, d, floors, tint, seed, steps = 3, rng = Math.random) {
    let y = 0,
      W = b.q(w),
      D = b.q(d);
    const base = Math.max(3, Math.round(floors * (0.28 + rng() * 0.12)));
    let t = b.tier(kind, cx, cz, W, D, y, base, tint, seed);
    y = t.top;
    let left = floors - base;
    for (let s = 0; s < steps && left > 3; s++) {
      W = Math.max(CW * 2, W - CW * (1 + Math.floor(rng() * 2)));
      D = Math.max(CW * 2, D - CW * (1 + Math.floor(rng() * 2)));
      const fl = s === steps - 1 ? left : Math.max(2, Math.round(left * (0.4 + rng() * 0.25)));
      t = b.tier(kind, cx, cz, W, D, y, fl, tint, seed + 0.0001 * s, { noShop: true });
      y = t.top;
      left -= fl;
    }
    return { top: y, w: W, d: D };
  }

  return {
    STREET_Y,
    WATER_Y,
    LAND_Y,
    CW,
    FH,
    AVENUES,
    STREETS,
    ROAD_HALF,
    shoreW,
    shoreE,
    farW,
    farE,
    TIP_Z,
    TIP_R,
    tipHalf,
    SOUTH_SHORE,
    onIsland,
    SQUARE,
    SQ_LOT,
    SQ_H,
    squareLots,
    squareScreens,
    BRICKS,
    STONES,
    BROWNSTONES,
    GLASSES,
    CONCRETES,
    TOWER_TONES,
    AWNINGS,
    SHOPS,
    ADS,
    rngOf,
    canvas,
    colorize,
    part,
    merge,
    box,
    cyl,
    QUALITY,
    kindTextures,
    facadeMaterial,
    Batch,
    waterTowerGeo,
    setback,
  };
})();
