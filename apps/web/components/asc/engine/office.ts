// @ts-nocheck
// The Fast Sales HQ floor and the scene that hosts everything (camera, light, time of day).
// Ported unchanged from the AutoSalesCity design file (three r160 code, runs on the app's three). Everything is
// generated in code: no model, texture or image downloads.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { C3 } from './city';
import { P3 } from './people';

export const O3 = (() => {
  const { makePerson, SKIN } = P3,
    { City } = C3;
  // Fast Sales virtual office: 3D scene (Three.js r160)
  // Warm illustrated office on the first floor of a living city (cars, tram, people outside the windows).

  const DESK_SLOTS = [
    // agent desks, two rows of three (x, z)
    [-1.5, -4.2],
    [3.6, -4.2],
    [8.7, -4.2],
    [-1.5, 1.0],
    [3.6, 1.0],
    [8.7, 1.0],
  ];
  const OWNER_DESK = { x: -10.2, z: -3.2 };
  const CEO_DESK = { x: -6.2, z: -7.4 };
  const W = 32,
    D = 22,
    WALL_H = 6;
  const PANEL = [-2.6, 7.9]; // solid wall section (content screen) in the glass back wall

  // Original characters (not based on any real person or existing character)
  const LOOKS = {
    max: {
      gender: 'm',
      hairStyle: 'slick',
      hair: '#2a2a2e',
      skin: SKIN[2],
      top: '#26324d',
      jacket: '#26324d',
      tie: '#f5b83d',
      accent: '#ffffff',
      bottom: '#26324d',
      shoes: '#2a1d14',
      shoeStyle: 'loafer',
      socks: '#f5b83d',
      watch: '#d9b45c',
      stubble: true,
      grin: true,
      eyes: '#3a2a20',
      build: 'broad',
      height: 1.04,
      outfit: 'dress',
    },
    vera: {
      gender: 'f',
      hairStyle: 'wavy',
      hair: '#3a2618',
      skin: SKIN[0],
      top: '#ff6b5e',
      accent: '#ffe2dc',
      bottom: '#2b2f3a',
      skirt: true,
      shoes: '#7a2b2b',
      shoeStyle: 'heel',
      earrings: true,
      necklace: true,
      lanyard: '#ff6b5e',
      headset: '#1f2330',
      lipColor: '#c4344f',
      eyes: '#4a7a5a',
      freckles: true,
      grin: true,
      sleeves: 'three',
    },
    nico: {
      gender: 'm',
      hairStyle: 'curly',
      hair: '#5b3a22',
      skin: SKIN[3],
      top: '#818cf8',
      accent: '#ffffff',
      bottom: '#3a4a6b',
      glasses: 'square',
      outfit: 'hoodie',
      shoeStyle: 'sneaker',
      earbuds: true,
      lanyard: '#818cf8',
      stubble: true,
      eyes: '#2a1d14',
    },
    luna: {
      gender: 'f',
      hairStyle: 'bob',
      hair: '#c99a5b',
      skin: SKIN[5],
      top: '#e879f9',
      accent: '#fff0fb',
      bottom: '#e9dfcf',
      shoes: '#c06a3e',
      shoeStyle: 'flat',
      outfit: 'cardigan',
      cardigan: '#f3e1ff',
      streak: '#e879f9',
      earrings: '#e879f9',
      bracelet: '#e879f9',
      lanyard: '#e879f9',
      eyes: '#6a4aa0',
      sleeves: 'three',
      grin: true,
    },
    teo: {
      gender: 'm',
      hairStyle: 'buzz',
      hair: '#1d1612',
      skin: SKIN[4],
      top: '#38bdf8',
      accent: '#e9f7ff',
      bottom: '#2b2f3a',
      beard: true,
      sleeves: 'short',
      watch: '#2b2f38',
      shoeStyle: 'sneaker',
      earbuds: true,
      lanyard: '#38bdf8',
      build: 'broad',
      height: 1.03,
      grin: true,
      outfit: 'polo',
    },
    iris: {
      gender: 'f',
      hairStyle: 'highbun',
      hair: '#1d1612',
      skin: SKIN[2],
      top: '#2dd4bf',
      accent: '#e6fffb',
      bottom: '#3a4a6b',
      glasses: 'gold',
      outfit: 'vest',
      vest: '#1f4b52',
      shoeStyle: 'flat',
      necklace: true,
      lanyard: '#2dd4bf',
      sleeves: 'rolled',
      eyes: '#3a2a20',
      grin: true,
    },
    dante: {
      gender: 'm',
      hairStyle: 'undercut',
      hair: '#8a5a2b',
      skin: SKIN[1],
      accent: '#ffffff',
      bottom: '#4a3b30',
      beard: true,
      sleeves: 'rolled',
      shoeStyle: 'boot',
      shoes: '#3a2a20',
      watch: '#8a5a2b',
      lanyard: '#fb923c',
      outfit: 'dress',
      height: 1.02,
      eyes: '#4a6a3a',
    },
    owner: {
      gender: 'm',
      hairStyle: 'side',
      hair: '#2a2a2e',
      skin: SKIN[1],
      top: '#1f2a44',
      jacket: '#1f2a44',
      tie: '#c0392b',
      accent: '#ffffff',
      bottom: '#1f2a44',
      shoes: '#1a120c',
      shoeStyle: 'loafer',
      glasses: 'tort',
      watch: '#c9a24b',
      stubble: true,
      eyes: '#3a2a20',
      outfit: 'dress',
    },
    receptionist: {
      gender: 'f',
      hairStyle: 'braids',
      hair: '#1d1612',
      skin: SKIN[4],
      top: '#26324d',
      accent: '#ffffff',
      bottom: '#2b2f3a',
      shoeStyle: 'flat',
      scarf: '#f5b83d',
      headset: '#2b2f38',
      lanyard: '#f5b83d',
      earrings: true,
      lipColor: '#9c2f4a',
      eyes: '#2a1d14',
      grin: true,
      sleeves: 'three',
    },
    visitor: {
      gender: 'm',
      hairStyle: 'afro',
      hair: '#1d1612',
      skin: SKIN[3],
      top: '#e8c070',
      jacket: '#b89a6a',
      accent: '#ffffff',
      bottom: '#3a4a6b',
      glasses: 'round',
      scarf: '#2f7a55',
      lanyard: '#e8604c',
      shoeStyle: 'boot',
      shoes: '#3a2a20',
      outfit: 'dress',
      eyes: '#2a1d14',
      grin: true,
    },
    jordan: {
      gender: 'f',
      hairStyle: 'pony',
      hair: '#6b2f1f',
      skin: SKIN[1],
      top: '#ef8f6b',
      accent: '#ffffff',
      bottom: '#3a4a6b',
      outfit: 'hoodie',
      shoeStyle: 'sneaker',
      earbuds: true,
      lanyard: '#ef8f6b',
      bracelet: '#f5b83d',
      freckles: true,
      eyes: '#3a5a7a',
    },
  };
  const DESK_PLANT = {
    max: ['bamboo', 'concrete'],
    vera: ['orchid', 'white'],
    nico: ['cactus', 'terra'],
    luna: ['succulent', 'teal'],
    teo: ['succulent', 'navy'],
    iris: ['orchid', 'white'],
    dante: ['cactus', 'concrete'],
  };
  const CHAT_PAIRS = [
    ['vera', 'nico'],
    ['nico', 'luna'],
    ['teo', 'iris'],
    ['iris', 'dante'],
  ];
  const FALLBACK = [
    { gender: 'f', hairStyle: 'pony', hair: '#6b2f1f', skin: SKIN[1] },
    { gender: 'm', hairStyle: 'quiff', hair: '#3a2618', skin: SKIN[3] },
  ];
  const BOOK_COLORS = [
    '#e8604c',
    '#f6c445',
    '#3fb6a8',
    '#5aa6e0',
    '#9b7fd1',
    '#ef8f6b',
    '#2f7a55',
    '#f3e2c0',
    '#c8553d',
    '#26324d',
    '#e98aa8',
  ];

  function canvasTex(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { c, ctx: c.getContext('2d'), t };
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  }
  function soften(hex, k = 0.22) {
    return '#' + new THREE.Color(hex).lerp(new THREE.Color('#f3e6d6'), k).getHexString();
  }
  let seed = 4242;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  /* ---------- baking: many small parts -> one mesh per material class (keeps draw calls low) ---------- */
  const PREP = g => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    return n;
  };
  const GC = {};
  const GEO = (k, mk) => (GC[k] ||= PREP(mk()));
  const UB = () => GEO('b', () => new THREE.BoxGeometry(1, 1, 1));
  const UC = s => GEO('c' + s, () => new THREE.CylinderGeometry(1, 1, 1, s));
  const UCO = (r, s) => GEO('co' + r + '_' + s, () => new THREE.CylinderGeometry(r, 1, 1, s));
  const US = s => GEO('s' + s, () => new THREE.SphereGeometry(1, s, Math.max(4, s - 2)));
  const UT = (tube, s, arc = Math.PI * 2) =>
    GEO('t' + tube + '_' + s + '_' + arc, () => new THREE.TorusGeometry(1, tube, 6, s, arc));
  const LEAF = () =>
    GEO('leaf', () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(0.25, 0.15, 0.22, 0.6, 0, 0.8);
      s.bezierCurveTo(-0.22, 0.6, -0.25, 0.15, 0, 0);
      return new THREE.ShapeGeometry(s, 6);
    });
  const BMATS = {};
  const bmat = bk =>
    (BMATS[bk] ||= new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: { matte: 0.82, satin: 0.5, metal: 0.32, leaf: 0.7 }[bk],
      metalness: bk === 'metal' ? 0.7 : 0,
      side: bk === 'leaf' ? THREE.DoubleSide : THREE.FrontSide,
    }));

  class Bake {
    constructor(lampMat) {
      this.lampMat = lampMat;
      this.parts = { matte: [], satin: [], metal: [], leaf: [], lamp: [] };
      this.m4 = new THREE.Matrix4();
      this.q = new THREE.Quaternion();
      this.e = new THREE.Euler();
      this.c = new THREE.Color();
      this.v = new THREE.Vector3();
      this.s = new THREE.Vector3();
    }
    put(geo, col, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, bk = 'matte') {
      const g = geo.clone();
      this.e.set(rx, ry, rz, 'YXZ');
      this.q.setFromEuler(this.e);
      this.m4.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
      g.applyMatrix4(this.m4);
      const n = g.attributes.position.count,
        a = new Float32Array(n * 3);
      this.c.set(col);
      for (let i = 0; i < n; i++) {
        a[i * 3] = this.c.r;
        a[i * 3 + 1] = this.c.g;
        a[i * 3 + 2] = this.c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      this.parts[bk].push(g);
    }
    box(w, h, d, col, x, y, z, ry = 0, bk = 'matte', rx = 0, rz = 0) {
      this.put(UB(), col, x, y, z, w, h, d, rx, ry, rz, bk);
    }
    cyl(r, h, col, x, y, z, bk = 'matte', seg = 10, rx = 0, rz = 0, ry = 0) {
      this.put(UC(seg), col, x, y, z, r, h, r, rx, ry, rz, bk);
    }
    cone(rb, rt, h, col, x, y, z, bk = 'matte', seg = 12, rx = 0, rz = 0) {
      this.put(UCO(+(rt / rb).toFixed(3), seg), col, x, y, z, rb, h, rb, rx, 0, rz, bk);
    }
    sph(r, col, x, y, z, sx = 1, sy = 1, sz = 1, bk = 'matte', seg = 10, rx = 0, ry = 0, rz = 0) {
      this.put(US(seg), col, x, y, z, r * sx, r * sy, r * sz, rx, ry, rz, bk);
    }
    tor(r, tube, col, x, y, z, rx = 0, ry = 0, rz = 0, bk = 'matte', seg = 16, arc = Math.PI * 2, sx = 1, sy = 1) {
      this.put(UT(tube, seg, arc), col, x, y, z, r * sx, r * sy, r, rx, ry, rz, bk);
    }
    leaf(col, x, y, z, sx, sy, rx, ry, rz = 0) {
      this.put(LEAF(), col, x, y, z, sx, sy, 1, rx, ry, rz, 'leaf');
    }
    rbox(w, h, d, r, col, x, y, z, ry = 0, bk = 'matte', rx = 0, rz = 0) {
      const g = GEO(`rb${w}_${h}_${d}_${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r));
      this.put(g, col, x, y, z, 1, 1, 1, rx, ry, rz, bk);
    }
    /** Merge everything into one mesh per material class and add them to `parent`. */
    flush(parent, shadow = true) {
      const out = [];
      for (const bk in this.parts) {
        const list = this.parts[bk];
        if (!list.length) continue;
        const m = new THREE.Mesh(mergeGeometries(list, false), bk === 'lamp' ? this.lampMat : bmat(bk));
        m.castShadow = shadow && bk !== 'lamp';
        m.receiveShadow = true;
        parent.add(m);
        out.push(m);
        list.forEach(g => g.dispose());
        this.parts[bk] = [];
      }
      return out;
    }
  }

  // palette for the NYC theme
  const NY = {
    brick: '#9c4b36',
    cab: '#f7c320',
    navy: '#1f2a44',
    steel: '#7f8996',
    dark: '#2b2f38',
    cream: '#f4eee6',
    wood: '#b97e4e',
    brass: '#d9b45c',
    teal: '#3fb6a8',
    red: '#e8604c',
  };
  const NYC_TEXT = {
    neon: ['NEW YORK', 'SALES FLOOR'],
    stations: [
      'Harbor',
      'Midtown Leads',
      'Quota Sq',
      'Pipeline',
      'Union Deal',
      'Closer Ave',
      'Prospect Pk',
      'Market St',
      'Fast Sales HQ',
    ],
    funnel: ['LEADS', 'REPLIED', 'BOOKED', 'ENROLLED'],
    notes: ['call back', 'send menu', 'quiet', 'ad test', 'review', 'plan', 'approve', 'partners'],
    vend: ['COLD BREW', 'PRETZEL', 'SELTZER', 'GRANOLA', 'COOKIE', 'NUTS', 'TEA', 'CHIPS'],
  };

  /* ---------- illustrated canvas art (all procedural) ---------- */
  const ART = {
    sky(g, W, H, stops) {
      const gr = g.createLinearGradient(0, 0, 0, H);
      stops.forEach(([o, c]) => gr.addColorStop(o, c));
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    },
    bridge(g, W, H) {
      ART.sky(g, W, H, [
        [0, '#f6a56b'],
        [0.5, '#f9d3a0'],
        [1, '#9cc7d8'],
      ]);
      g.fillStyle = '#f7e2b0';
      g.beginPath();
      g.arc(W * 0.74, H * 0.3, H * 0.1, 0, 7);
      g.fill();
      // skyline behind
      g.fillStyle = '#c98f7a';
      for (let i = 0; i < 14; i++)
        g.fillRect(W * 0.55 + i * W * 0.03, H * (0.5 - ((i * 7) % 5) * 0.04), W * 0.026, H * 0.2);
      // water
      g.fillStyle = '#5f9db3';
      g.fillRect(0, H * 0.68, W, H * 0.32);
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.moveTo(10 + i * 9, H * 0.74 + i * 8);
        g.lineTo(W - 10 - i * 7, H * 0.74 + i * 8);
        g.stroke();
      }
      // towers with pointed arches
      const tw = cx => {
        g.fillStyle = '#6d5646';
        g.fillRect(cx - W * 0.05, H * 0.18, W * 0.1, H * 0.54);
        g.fillStyle = '#f6a56b';
        [0.3, 0.52].forEach(f => {
          g.beginPath();
          g.moveTo(cx - W * 0.022, H * (f + 0.14));
          g.lineTo(cx - W * 0.022, H * (f + 0.06));
          g.quadraticCurveTo(cx, H * (f - 0.04), cx + W * 0.022, H * (f + 0.06));
          g.lineTo(cx + W * 0.022, H * (f + 0.14));
          g.fill();
        });
      };
      tw(W * 0.3);
      tw(W * 0.7);
      // deck + cables
      g.fillStyle = '#3b2f2a';
      g.fillRect(0, H * 0.66, W, H * 0.03);
      g.strokeStyle = '#3b2f2a';
      g.lineWidth = 3;
      const cable = (x0, y0, x1, y1, sag) => {
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo((x0 + x1) / 2, y1 + sag, x1, y0 + 0);
        g.stroke();
      };
      cable(W * 0.3, H * 0.2, W * 0.7, H * 0.2, H * 0.56);
      g.beginPath();
      g.moveTo(0, H * 0.58);
      g.quadraticCurveTo(W * 0.14, H * 0.44, W * 0.3, H * 0.2);
      g.moveTo(W, H * 0.58);
      g.quadraticCurveTo(W * 0.86, H * 0.44, W * 0.7, H * 0.2);
      g.stroke();
      g.lineWidth = 1;
      for (let x = W * 0.34; x < W * 0.68; x += W * 0.025) {
        const k = (x - W * 0.5) / (W * 0.2);
        g.beginPath();
        g.moveTo(x, H * 0.66);
        g.lineTo(x, H * (0.2 + 0.4 * (1 - k * k) * 0.78 + 0.0) + H * 0.0);
        g.stroke();
      }
      for (let i = 0; i < 18; i++) {
        g.beginPath();
        g.moveTo(W * 0.3 + (i * W * 0.4) / 18, H * 0.66);
        g.lineTo(W * 0.3 + (i * W * 0.4) / 18, H * 0.66 - H * (0.04 + 0.3 * (1 - Math.pow((i - 9) / 9, 2))));
        g.stroke();
      }
    },
    cab(g, W, H) {
      ART.sky(g, W, H, [
        [0, '#2b3a67'],
        [0.7, '#e08a5b'],
        [1, '#f3c27a'],
      ]);
      g.fillStyle = '#1a2038';
      for (let i = 0; i < 9; i++) {
        const h = H * (0.25 + ((i * 37) % 10) * 0.035);
        g.fillRect(i * (W / 9), H * 0.68 - h, W / 9 - 3, h);
        g.fillStyle = '#ffd86b';
        for (let r = 0; r < 5; r++) g.fillRect(i * (W / 9) + 6, H * 0.68 - h + 10 + r * 16, 6, 6);
        g.fillStyle = '#1a2038';
      }
      g.fillStyle = '#3a3f4d';
      g.fillRect(0, H * 0.68, W, H * 0.32);
      g.fillStyle = '#f3c27a';
      for (let i = 0; i < 8; i++) g.fillRect(i * (W / 8) + 8, H * 0.84, W / 16, 5);
      // the yellow cab
      const cx = W * 0.5,
        cy = H * 0.7;
      g.fillStyle = NY.cab;
      rr(g, cx - W * 0.3, cy - H * 0.1, W * 0.6, H * 0.12, 14);
      g.fill();
      rr(g, cx - W * 0.16, cy - H * 0.2, W * 0.34, H * 0.12, 12);
      g.fill();
      g.fillStyle = '#bfe3ff';
      rr(g, cx - W * 0.13, cy - H * 0.18, W * 0.12, H * 0.08, 6);
      g.fill();
      rr(g, cx + W * 0.02, cy - H * 0.18, W * 0.12, H * 0.08, 6);
      g.fill();
      g.fillStyle = '#1b1b22';
      g.fillRect(cx - W * 0.2, cy - H * 0.04, W * 0.4, 6);
      g.fillStyle = '#fff';
      g.fillRect(cx - W * 0.03, cy - H * 0.235, W * 0.08, H * 0.04);
      [-0.19, 0.19].forEach(k => {
        g.fillStyle = '#16181d';
        g.beginPath();
        g.arc(cx + W * k, cy + H * 0.02, H * 0.045, 0, 7);
        g.fill();
        g.fillStyle = '#9aa3b2';
        g.beginPath();
        g.arc(cx + W * k, cy + H * 0.02, H * 0.02, 0, 7);
        g.fill();
      });
      g.fillStyle = '#ffe9a8';
      g.beginPath();
      g.arc(cx + W * 0.29, cy - H * 0.05, 6, 0, 7);
      g.fill();
    },
    skyline(g, W, H) {
      ART.sky(g, W, H, [
        [0, '#2d1b4e'],
        [0.55, '#e0607e'],
        [1, '#ffb867'],
      ]);
      g.fillStyle = '#fff3c9';
      g.beginPath();
      g.arc(W * 0.78, H * 0.22, H * 0.08, 0, 7);
      g.fill();
      g.fillStyle = '#17142b';
      const tower = (x, w, h, steps) => {
        let cw = w,
          cy = H;
        const hh = h / (steps + 1);
        for (let s = 0; s < steps; s++) {
          g.fillRect(x + (w - cw) / 2, cy - hh, cw, hh + 1);
          cy -= hh;
          cw *= 0.72;
        }
        g.fillRect(x + w / 2 - 2, cy - hh * 0.9, 4, hh * 0.9 + 1);
      };
      tower(W * 0.04, W * 0.2, H * 0.55, 4);
      tower(W * 0.26, W * 0.16, H * 0.42, 3);
      tower(W * 0.42, W * 0.22, H * 0.78, 5);
      tower(W * 0.66, W * 0.15, H * 0.5, 3);
      tower(W * 0.8, W * 0.17, H * 0.62, 4);
      g.fillStyle = '#ffd86b';
      for (let i = 0; i < 40; i++)
        g.fillRect(W * 0.05 + ((i * 53) % 90) * W * 0.0102, H * 0.5 + ((i * 29) % 45) * H * 0.0105, 3, 5);
    },
    deco(g, W, H) {
      g.fillStyle = '#14213d';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = NY.brass;
      g.lineWidth = 2;
      for (let i = 0; i < 17; i++) {
        const a = (i / 16) * Math.PI;
        g.beginPath();
        g.moveTo(W / 2, H * 0.62);
        g.lineTo(W / 2 + Math.cos(Math.PI + a) * W, H * 0.62 + Math.sin(Math.PI + a) * W);
        g.stroke();
      }
      g.fillStyle = NY.brass;
      let w = W * 0.34,
        y = H * 0.9;
      for (let s = 0; s < 5; s++) {
        g.fillRect(W / 2 - w / 2, y - H * 0.13, w, H * 0.13 + 1);
        y -= H * 0.13;
        w *= 0.7;
      }
      g.fillRect(W / 2 - 3, y - H * 0.1, 6, H * 0.1);
      g.fillStyle = '#14213d';
      for (let s = 0; s < 5; s++) g.fillRect(W / 2 - 2, H * 0.9 - H * 0.12 - s * H * 0.13, 4, H * 0.1);
      g.fillStyle = NY.brass;
      g.textAlign = 'center';
      g.font = `700 ${H * 0.07}px "Space Grotesk", sans-serif`;
      g.fillText('NEW YORK', W / 2, H * 0.08);
      g.strokeRect(10, 10, W - 20, H - 20);
    },
    hustle(g, W, H) {
      g.fillStyle = '#f7e9cf';
      g.fillRect(0, 0, W, H);
      g.fillStyle = NY.red;
      g.beginPath();
      g.arc(W / 2, H * 0.42, W * 0.3, 0, 7);
      g.fill();
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.font = `800 ${W * 0.2}px "Space Grotesk", sans-serif`;
      g.fillText('NY', W / 2, H * 0.5);
      g.fillStyle = NY.navy;
      g.font = `700 ${W * 0.1}px "Space Grotesk", sans-serif`;
      g.fillText('HUSTLE', W / 2, H * 0.84);
      g.fillStyle = NY.cab;
      g.fillRect(W * 0.1, H * 0.9, W * 0.8, 6);
    },
    subway(g, W, H) {
      g.fillStyle = '#f4efe3';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#d7e6ea';
      g.fillRect(0, H * 0.78, W, H * 0.22); // water
      g.fillStyle = '#26324d';
      g.font = `800 ${H * 0.06}px "Space Grotesk", sans-serif`;
      g.fillText('FAST SALES · TRANSIT MAP', W * 0.04, H * 0.08);
      const lines = [
        [
          '#ee352e',
          [
            [0.1, 0.2],
            [0.3, 0.2],
            [0.42, 0.32],
            [0.42, 0.55],
            [0.6, 0.73],
            [0.92, 0.73],
          ],
        ],
        [
          '#00933c',
          [
            [0.06, 0.62],
            [0.28, 0.62],
            [0.42, 0.55],
            [0.58, 0.4],
            [0.88, 0.4],
          ],
        ],
        [
          '#0039a6',
          [
            [0.18, 0.12],
            [0.18, 0.45],
            [0.28, 0.62],
            [0.28, 0.82],
          ],
        ],
        [
          '#ff6319',
          [
            [0.5, 0.12],
            [0.5, 0.4],
            [0.58, 0.4],
            [0.7, 0.52],
            [0.7, 0.8],
          ],
        ],
        [
          '#fccc0a',
          [
            [0.9, 0.16],
            [0.72, 0.16],
            [0.6, 0.28],
            [0.42, 0.32],
          ],
        ],
        [
          '#996633',
          [
            [0.08, 0.4],
            [0.18, 0.45],
            [0.42, 0.55],
          ],
        ],
      ];
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const st = [];
      lines.forEach(([c, pts]) => {
        g.strokeStyle = c;
        g.lineWidth = H * 0.026;
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)));
        g.stroke();
        pts.forEach(([x, y]) => st.push([x * W, y * H]));
      });
      g.fillStyle = '#fff';
      g.strokeStyle = '#1b1b22';
      g.lineWidth = 2.5;
      st.forEach(([x, y], i) => {
        g.beginPath();
        g.arc(x, y, H * 0.016, 0, 7);
        g.fill();
        g.stroke();
        if (i % 3 === 0) {
          g.fillStyle = '#1b1b22';
          g.font = `600 ${H * 0.035}px Inter, sans-serif`;
          g.fillText(NYC_TEXT.stations[((i / 3) % NYC_TEXT.stations.length) | 0], x + 8, y - 8);
          g.fillStyle = '#fff';
        }
      });
    },
    nymap(g, W, H) {
      g.fillStyle = '#cfe3ea';
      g.fillRect(0, 0, W, H);
      // a long island with a tilted street grid and a green park
      g.save();
      g.translate(W * 0.5, H * 0.5);
      g.rotate(0.5);
      g.fillStyle = '#f1e8d2';
      rr(g, -W * 0.14, -H * 0.55, W * 0.28, H * 1.1, 26);
      g.fill();
      g.strokeStyle = '#d4c4a0';
      g.lineWidth = 1.5;
      for (let y = -H * 0.5; y < H * 0.5; y += 12) {
        g.beginPath();
        g.moveTo(-W * 0.14, y);
        g.lineTo(W * 0.14, y);
        g.stroke();
      }
      for (let x = -W * 0.12; x < W * 0.12; x += 30) {
        g.beginPath();
        g.moveTo(x, -H * 0.55);
        g.lineTo(x, H * 0.55);
        g.stroke();
      }
      g.fillStyle = '#9ccf94';
      g.fillRect(-W * 0.07, -H * 0.12, W * 0.14, H * 0.22);
      g.restore();
      g.fillStyle = NY.red;
      [
        [0.46, 0.3],
        [0.52, 0.55],
        [0.44, 0.7],
      ].forEach(([x, y]) => {
        g.beginPath();
        g.arc(x * W, y * H, 6, 0, 7);
        g.fill();
      });
      g.fillStyle = NY.navy;
      g.font = `700 ${H * 0.07}px "Space Grotesk", sans-serif`;
      g.fillText('THE ISLAND', W * 0.05, H * 0.1);
    },
    pennant(g, W, H) {
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#e8604c';
      g.beginPath();
      g.moveTo(0, 4);
      g.lineTo(W - 4, H / 2);
      g.lineTo(0, H - 4);
      g.closePath();
      g.fill();
      g.fillStyle = '#fff';
      g.font = `800 ${H * 0.28}px "Space Grotesk", sans-serif`;
      g.fillText('NEW YORK', W * 0.06, H * 0.46);
      g.font = `700 ${H * 0.16}px "Space Grotesk", sans-serif`;
      g.fillText('SALES', W * 0.06, H * 0.7);
    },
    neon(g, W, H) {
      g.clearRect(0, 0, W, H);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const line = (txt, y, col, size) => {
        g.font = `800 ${size}px "Space Grotesk", sans-serif`;
        g.shadowColor = col;
        g.shadowBlur = 26;
        g.strokeStyle = col;
        g.lineWidth = 7;
        g.strokeText(txt, W / 2, y);
        g.shadowBlur = 0;
        g.fillStyle = '#fff6f0';
        g.fillText(txt, W / 2, y);
      };
      line(NYC_TEXT.neon[0], H * 0.34, '#ff4fa3', H * 0.4);
      line(NYC_TEXT.neon[1], H * 0.76, '#4fe3ff', H * 0.3);
      g.shadowBlur = 0;
      g.strokeStyle = '#ff4fa3';
      g.lineWidth = 5;
      rr(g, 12, 12, W - 24, H - 24, 36);
      g.stroke();
    },
    funnel(g, W, H) {
      g.fillStyle = '#fbfaf6';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#26324d';
      g.font = `700 ${H * 0.07}px "Space Grotesk", sans-serif`;
      g.fillText('SALES FUNNEL', W * 0.04, H * 0.1);
      const cols = ['#6aa8ff', '#3fb6a8', '#f5b83d', '#3ccf8e'];
      NYC_TEXT.funnel.forEach((t, i) => {
        const y = H * (0.18 + i * 0.17),
          w0 = W * (0.52 - i * 0.09),
          x0 = W * 0.04 + (W * 0.52 - w0) / 2;
        g.fillStyle = cols[i];
        g.beginPath();
        g.moveTo(x0, y);
        g.lineTo(x0 + w0, y);
        g.lineTo(x0 + w0 - W * 0.04, y + H * 0.14);
        g.lineTo(x0 + W * 0.04, y + H * 0.14);
        g.closePath();
        g.fill();
        g.fillStyle = '#fff';
        g.font = `700 ${H * 0.06}px "Space Grotesk", sans-serif`;
        g.textAlign = 'center';
        g.fillText(t, x0 + w0 / 2, y + H * 0.095);
        g.textAlign = 'left';
      });
      g.strokeStyle = '#26324d';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(W * 0.62, H * 0.82);
      g.lineTo(W * 0.7, H * 0.62);
      g.lineTo(W * 0.78, H * 0.7);
      g.lineTo(W * 0.92, H * 0.3);
      g.stroke();
      // sticky notes
      const cs = ['#ffe36e', '#ff9ec4', '#9be3d0', '#a9c8ff'];
      NYC_TEXT.notes.forEach((t, i) => {
        const x = W * (0.62 + (i % 2) * 0.17),
          y = H * (0.1 + Math.floor(i / 2) * 0.09) + (i === 0 ? H * 0.0 : 0);
        if (y > H * 0.55) return;
        g.save();
        g.translate(x + 30, y + 22);
        g.rotate(((i * 37) % 9) / 40 - 0.1);
        g.fillStyle = cs[i % 4];
        g.fillRect(-30, -22, 62, 50);
        g.fillStyle = '#3a3f4d';
        g.font = `600 ${H * 0.04}px Inter, sans-serif`;
        g.textAlign = 'center';
        g.fillText(t.slice(0, 11), 0, 4);
        g.restore();
      });
      g.textAlign = 'left';
    },
    brick(g, W, H) {
      g.fillStyle = '#d9cdbf';
      g.fillRect(0, 0, W, H);
      const bh = H / 16,
        bw = W / 8;
      for (let r = 0; r < 16; r++)
        for (let c = -1; c < 9; c++) {
          const x = c * bw + (r % 2 ? bw / 2 : 0) + 2,
            l = 0.82 + ((r * 7 + c * 13) % 10) * 0.028;
          const white = (r * 3 + c * 5) % 17 === 0;
          g.fillStyle = white ? '#efe6da' : `rgb(${(176 * l) | 0},${(84 * l) | 0},${(60 * l) | 0})`;
          g.fillRect(x, r * bh + 2, bw - 4, bh - 4);
          if (!white) {
            g.fillStyle = 'rgba(0,0,0,.08)';
            g.fillRect(x, r * bh + bh - 6, bw - 4, 4);
            g.fillStyle = 'rgba(255,255,255,.07)';
            g.fillRect(x, r * bh + 2, bw - 4, 3);
          }
        }
    },
    checker(g, W, H) {
      const n = 10;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          g.fillStyle = (x + y) % 2 ? '#262a33' : '#f1ede4';
          g.fillRect((x * W) / n, (y * H) / n, W / n + 1, H / n + 1);
        }
      g.strokeStyle = NY.brass;
      g.lineWidth = 8;
      g.strokeRect(4, 4, W - 8, H - 8);
    },
    slats(g, W, H) {
      g.clearRect(0, 0, W, H);
      const n = 16;
      for (let i = 0; i < n; i++) {
        g.fillStyle = '#efe7da';
        g.fillRect(0, (i * H) / n, W, H / n - 2);
        g.fillStyle = 'rgba(0,0,0,.18)';
        g.fillRect(0, (i * H) / n + H / n - 3, W, 1);
      }
    },
    vending(g, W, H) {
      g.fillStyle = '#11151c';
      g.fillRect(0, 0, W, H);
      const cols = ['#e8604c', '#f5b83d', '#3fb6a8', '#5aa6e0', '#e879f9', '#f29c38', '#7cc36b', '#f3e2c0'];
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 2; c++) {
          const i = r * 2 + c;
          g.fillStyle = '#242c3a';
          g.fillRect(10 + c * (W / 2 - 4), 40 + r * 118, W / 2 - 22, 108);
          g.fillStyle = cols[i];
          rr(g, 22 + c * (W / 2 - 4), 56 + r * 118, W / 2 - 46, 52, 8);
          g.fill();
          g.fillStyle = '#e8ecf2';
          g.font = '700 14px "JetBrains Mono", monospace';
          g.fillText(NYC_TEXT.vend[i], 20 + c * (W / 2 - 4), 130 + r * 118);
        }
      g.fillStyle = '#f5b83d';
      g.font = '800 22px "Space Grotesk", sans-serif';
      g.fillText('SNACKS', 14, 28);
    },
  };
  // makes a texture, lets `fn` paint on it and returns the finished canvas texture
  function paint(w, h, fn, repeat) {
    const s = canvasTex(w, h);
    fn(s.ctx, w, h);
    if (repeat) {
      s.t.wrapS = s.t.wrapT = THREE.RepeatWrapping;
      s.t.repeat.set(...repeat);
    }
    s.t.needsUpdate = true;
    return s;
  }

  class Office3D {
    constructor(el, { agentsInfo, onSelect, reducedMotion = false, timeZone, cityOpts = {}, maxDistance = 90 } = {}) {
      this.el = el;
      this.info = agentsInfo;
      this.onSelect = onSelect || (() => {});
      this.reduced = reducedMotion;
      this.actors = {};
      this.clickables = [];
      this.clock = new THREE.Clock();
      this.camGoal = null;
      this.selected = null;
      this.tod = 'day';
      this.tz = timeZone;
      this.lampMats = [];
      this.glows = [];
      this.feed = [];
      this.mobile = window.innerWidth < 700 || matchMedia('(pointer: coarse)').matches;

      const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 2));
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      el.appendChild(r.domElement);
      r.domElement.__office = this; // lets tests and the stats overlay read renderer.info

      this.labels = new CSS2DRenderer();
      Object.assign(this.labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
      el.appendChild(this.labels.domElement);

      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.Fog('#f6e3c8', 90, 230);
      const pm = new THREE.PMREMGenerator(r);
      this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();

      this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
      this.camera.position.set(2, 17, 25);
      this.controls = new OrbitControls(this.camera, r.domElement);
      Object.assign(this.controls, {
        enableDamping: true,
        dampingFactor: 0.08,
        maxPolarAngle: 1.36,
        minDistance: 3.5,
        maxDistance,
        target: new THREE.Vector3(0, 0.6, -2),
      });
      this.controls.addEventListener('start', () => {
        this.camGoal = null;
        if (this.controls.autoRotate) {
          this.controls.autoRotate = false;
          this.onSpin?.(false);
        }
      });
      this.roofA = 0;
      this.cityMode = false;

      // the city around the building (built once; floors are swapped inside it)
      this.city = new City(this.scene, { quality: this.mobile ? 'low' : 'high', ...cityOpts });
      this.extras = []; // extra scene modules: { update(dt, t, camera), setTimeOfDay(tod) }
      this._stars();

      // soft bloom for lamps, neon and city lights (desktop only)
      if (!this.mobile) {
        this.composer = new EffectComposer(r);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 0.82);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());
      }

      this.ray = new THREE.Raycaster();
      this.ptr = new THREE.Vector2();
      r.domElement.addEventListener('pointerdown', e => {
        this._down = [e.clientX, e.clientY];
      });
      r.domElement.addEventListener('pointerup', e => this._click(e));
      r.domElement.addEventListener('pointermove', e => this._hover(e));

      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(el);
      this.resize();
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    resize() {
      const w = this.el.clientWidth || 1,
        h = this.el.clientHeight || 1;
      this.renderer.setSize(w, h);
      this.labels.setSize(w, h);
      if (this.composer) this.composer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.fov = w < 640 ? 52 : 40;
      this.camera.updateProjectionMatrix();
    }

    /* ---------- sky ---------- */
    _skyTex(tod) {
      this._skies = this._skies || {};
      if (this._skies[tod]) return this._skies[tod];
      const { ctx: g, t } = canvasTex(16, 512);
      const grd = g.createLinearGradient(0, 0, 0, 512);
      const stops = {
        day: [
          [0, '#6fb2ea'],
          [0.45, '#a9d4f3'],
          [0.75, '#fbe7c6'],
          [1, '#f6d7ae'],
        ],
        evening: [
          [0, '#2f2f66'],
          [0.35, '#7a4f86'],
          [0.62, '#f08a6a'],
          [0.82, '#ffc27a'],
          [1, '#ffe0a8'],
        ],
        night: [
          [0, '#060b1d'],
          [0.5, '#101a3a'],
          [0.85, '#24305c'],
          [1, '#3a3560'],
        ],
      }[tod];
      stops.forEach(([o, c]) => grd.addColorStop(o, c));
      g.fillStyle = grd;
      g.fillRect(0, 0, 16, 512);
      t.needsUpdate = true;
      return (this._skies[tod] = t);
    }
    _stars() {
      const n = 400,
        pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2,
          e = 0.15 + rnd() * 1.2,
          r = 260;
        pos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.starPts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: '#ffffff',
          size: 1.6,
          sizeAttenuation: false,
          fog: false,
          transparent: true,
          opacity: 0.85,
        }),
      );
      this.starPts.visible = false;
      this.scene.add(this.starPts);
    }

    /* ---------- time of day ---------- */
    setTimeOfDay(tod = 'day') {
      this.tod = tod;
      const P =
        {
          day: {
            fog: ['#f6dfc0', 90, 240],
            hemi: ['#ffffff', '#d9c3a0', 0.55],
            amb: 0.08,
            sun: ['#fff0d2', 2.6],
            warm: 1,
            lamp: 0.4,
            exp: 0.88,
            env: true,
            bloom: 0.18,
            glow: 1,
          },
          evening: {
            fog: ['#e79a78', 80, 210],
            hemi: ['#ffc59a', '#3a2a3a', 0.6],
            amb: 0.18,
            sun: ['#ff9e5e', 1.6],
            warm: 16,
            lamp: 2.6,
            exp: 1.05,
            env: false,
            bloom: 0.55,
            glow: 2.5,
          },
          night: {
            fog: ['#1a2242', 70, 200],
            hemi: ['#8ea2d6', '#2a2030', 0.45],
            amb: 0.12,
            sun: ['#a9bbff', 0.55],
            warm: 26,
            lamp: 3.6,
            exp: 1.08,
            env: false,
            bloom: 0.75,
            glow: 3.5,
          },
        }[tod] || {};
      this.scene.background = this._skyTex(tod);
      this.scene.environment = P.env ? this.envTex : null;
      this.scene.fog.color.set(P.fog[0]);
      this.scene.fog.near = P.fog[1];
      this.scene.fog.far = P.fog[2];
      this.renderer.toneMappingExposure = P.exp;
      if (this.L) {
        this.L.hemi.color.set(P.hemi[0]);
        this.L.hemi.groundColor.set(P.hemi[1]);
        this.L.hemi.intensity = P.hemi[2];
        this.L.amb.intensity = P.amb;
        this.L.sun.color.set(P.sun[0]);
        this.L.sun.intensity = P.sun[1];
        this.L.sun.position.set(tod === 'evening' ? -22 : -10, tod === 'evening' ? 9 : 22, tod === 'day' ? 6 : -14);
        this.L.warm.forEach(l => {
          l.intensity = P.warm;
        });
      }
      this.lampMats.forEach(m => {
        m.emissiveIntensity = P.lamp;
      });
      this.glows.forEach(g => {
        g.intensity = P.glow;
      });
      if (this.neonMat) this.neonMat.emissiveIntensity = this._neonBase = 0.7 + P.lamp * 0.5;
      if (this.bloom) this.bloom.strength = P.bloom;
      if (this.starPts) this.starPts.visible = tod === 'night';
      if (this.city) this.city.setTimeOfDay(tod);
      (this.extras || []).forEach(x => x.setTimeOfDay?.(tod));
      if (this.clockDraw) this.clockDraw();
    }

    /* ---------- build a floor ---------- */
    build({
      agents = [],
      human = { name: 'Elvis', role: 'Owner' },
      floorLabel = 'L4',
      showCeo = true,
      available = false,
    }) {
      if (this.root) {
        this.scene.remove(this.root);
        this.root.traverse(o => {
          if (o.isCSS2DObject) o.element.remove();
        });
      }
      this.actors = {};
      this.clickables = [];
      this.lampMats = [];
      this.glows = [];
      const root = (this.root = new THREE.Group());
      this.scene.add(root);
      this.available = available;
      this.trips = 0;
      seed = 4242;
      this.lampMat = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffcf7a', emissiveIntensity: 0.4 });
      this.lampMats.push(this.lampMat);

      this.S = new Bake(this.lampMat); // static furniture and props, merged per material when the floor is done
      this._lights(root);
      this._room(root, floorLabel);
      this._screens(root);
      this._decor(root);

      this._ownerDesk(root, human);
      if (showCeo && agents.includes('max')) this._agentAt(root, 'max', CEO_DESK.x, CEO_DESK.z, { big: true });
      const team = agents.filter(a => a !== 'max').slice(0, 6);
      team.forEach((a, i) => {
        const [x, z] = DESK_SLOTS[i];
        this._agentAt(root, a, x, z, {});
      });
      for (let i = team.length; i < 6; i++) {
        const [x, z] = DESK_SLOTS[i];
        this._desk(root, x, z, '#c9b79c', null, true);
      }
      this._ambient(root);
      if (available) this._availableSign(root);
      this._clock(root);
      this.S.flush(root, true);
      this._shell(root);
      this.setTimeOfDay(this.tod);
      this.view('overview', true);
    }

    _lights(root) {
      const hemi = new THREE.HemisphereLight('#ffffff', '#d9c3a0', 1.0),
        amb = new THREE.AmbientLight('#ffffff', 0.25);
      root.add(hemi);
      root.add(amb);
      const sun = new THREE.DirectionalLight('#fff0d2', 2.8);
      sun.position.set(-10, 22, 6);
      sun.castShadow = true;
      sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
      Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 16, bottom: -16, near: 1, far: 70 });
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.02;
      root.add(sun);
      // warm interior lights (they take over in the evening)
      const warm = [
        [-9, -3],
        [3.6, -5],
        [3.6, 2],
        [11, 6],
        [-9, 7],
      ].map(([x, z]) => {
        const l = new THREE.PointLight('#ffc98a', 2, 16, 2);
        l.position.set(x, 4.6, z);
        root.add(l);
        return l;
      });
      this.L = { hemi, amb, sun, warm };
    }

    _room(root, floorLabel) {
      // light oak plank floor
      const ft = canvasTex(1024, 704);
      const g = ft.ctx;
      g.fillStyle = '#e2c39a';
      g.fillRect(0, 0, 1024, 704);
      const plankH = 32;
      for (let y = 0; y < 704; y += plankH) {
        let x = -((y / plankH) % 4) * 60;
        while (x < 1024) {
          const len = 160 + rnd() * 140,
            l = 0.9 + rnd() * 0.16;
          g.fillStyle = `rgb(${(226 * l) | 0},${(193 * l) | 0},${(152 * l) | 0})`;
          g.fillRect(x, y, len, plankH);
          g.strokeStyle = 'rgba(150,100,55,.10)';
          g.lineWidth = 1;
          for (let k = 0; k < 3; k++) {
            g.beginPath();
            g.moveTo(x + 4, y + 6 + k * 9 + rnd() * 3);
            g.bezierCurveTo(x + len * 0.3, y + 4 + k * 9, x + len * 0.6, y + 10 + k * 9, x + len - 4, y + 6 + k * 9);
            g.stroke();
          }
          g.fillStyle = 'rgba(120,80,40,.28)';
          g.fillRect(x, y, 2, plankH);
          x += len;
        }
        g.fillStyle = 'rgba(120,80,40,.22)';
        g.fillRect(0, y, 1024, 2);
      }
      ft.t.wrapS = ft.t.wrapT = THREE.RepeatWrapping;
      ft.t.repeat.set(2, 2);
      ft.t.needsUpdate = true;
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(W, D),
        new THREE.MeshStandardMaterial({ map: ft.t, roughness: 0.78, metalness: 0 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      root.add(floor);

      const wallMat = new THREE.MeshStandardMaterial({ color: '#f7e6cf', roughness: 0.92 });
      const wood = (this.woodMat = new THREE.MeshStandardMaterial({ color: '#b97e4e', roughness: 0.6 }));
      const frameMat = new THREE.MeshStandardMaterial({ color: '#f4eee6', roughness: 0.5, metalness: 0.1 });

      // left wall: solid, peach wainscot + cream
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, WALL_H, D), wallMat);
      left.position.set(-W / 2, WALL_H / 2, 0);
      left.receiveShadow = true;
      root.add(left);
      const wains = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.1, D),
        new THREE.MeshStandardMaterial({ color: '#efb48a', roughness: 0.85 }),
      );
      wains.position.set(-W / 2 + 0.18, 0.55, 0);
      root.add(wains);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, D), wood);
      rail.position.set(-W / 2 + 0.2, 1.12, 0);
      root.add(rail);

      // back wall: floor-to-ceiling glass with a wooden feature panel in the middle (content screen)
      const zb = -D / 2;
      const st = canvasTex(512, 256);
      const sg = st.ctx; // vertical wood slats
      for (let x = 0; x < 512; x += 16) {
        const l = 0.88 + rnd() * 0.2;
        sg.fillStyle = `rgb(${(185 * l) | 0},${(126 * l) | 0},${(78 * l) | 0})`;
        sg.fillRect(x, 0, 13, 256);
        sg.fillStyle = '#4a3020';
        sg.fillRect(x + 13, 0, 3, 256);
      }
      st.t.needsUpdate = true;
      const pw = PANEL[1] - PANEL[0];
      const panel = new THREE.Mesh(new THREE.BoxGeometry(pw, WALL_H, 0.3), [
        wallMat,
        wallMat,
        wallMat,
        wallMat,
        new THREE.MeshStandardMaterial({ map: st.t, roughness: 0.7 }),
        wallMat,
      ]);
      panel.position.set((PANEL[0] + PANEL[1]) / 2, WALL_H / 2, zb);
      panel.receiveShadow = true;
      root.add(panel);
      const glassMat = new THREE.MeshStandardMaterial({
        color: '#cfe8f5',
        transparent: true,
        opacity: 0.1,
        roughness: 0.05,
        metalness: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const glassRun = (x0, x1, z, axis = 'x', h = WALL_H) => {
        const len = x1 - x0,
          n = Math.max(1, Math.round(len / 2.6));
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(len, h - 0.3), glassMat);
        if (axis === 'x') gl.position.set((x0 + x1) / 2, h / 2 + 0.1, z);
        else {
          gl.rotation.y = Math.PI / 2;
          gl.position.set(z, h / 2 + 0.1, (x0 + x1) / 2);
        }
        root.add(gl);
        const box = (sx, sy, sz, px, py, pz, m = frameMat) => {
          const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
          if (axis === 'x') b.position.set(px, py, pz);
          else {
            b.rotation.y = Math.PI / 2;
            b.position.set(pz, py, px);
          }
          b.castShadow = true;
          root.add(b);
          return b;
        };
        box(len, 0.22, 0.32, (x0 + x1) / 2, 0.11, z, wood); // sill
        box(len, 0.14, 0.2, (x0 + x1) / 2, h - 0.07, z); // head
        box(len, 0.06, 0.12, (x0 + x1) / 2, 1.0, z); // transom
        for (let i = 0; i <= n; i++) box(0.1, h, 0.16, x0 + (len / n) * i, h / 2, z);
      };
      glassRun(-W / 2, PANEL[0], zb);
      glassRun(PANEL[1], W / 2, zb);
      // right side: low glass balustrade with a wooden handrail
      glassRun(-D / 2, D / 2, W / 2, 'z', 1.15);
      // front edge strip
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(W, 0.05, 0.08),
        new THREE.MeshBasicMaterial({ color: '#f5b83d' }),
      );
      edge.position.set(0, 0.025, D / 2);
      root.add(edge);
      // sunlight patches on the floor under the windows (daytime)
      this.patches = [];
    }

    /* ---------- outside shell: roof, rooftop and front glass (shown from outside) ---------- */
    _shell(root) {
      const g = (this.shell = new THREE.Group());
      root.add(g);
      this.shellMats = [];
      const mat = o => {
        const m = new THREE.MeshStandardMaterial(o);
        m.userData.op = o.opacity ?? 1;
        this.shellMats.push(m);
        return m;
      };
      const add = (geo, m, x, y, z, ry = 0) => {
        const o = new THREE.Mesh(geo, m);
        o.position.set(x, y, z);
        o.rotation.y = ry;
        g.add(o);
        return o;
      };
      const roofM = mat({ color: '#e7dccb', roughness: 0.95 });
      const trim = mat({ color: '#c98f5a', roughness: 0.7 });
      const frame = mat({ color: '#f4eee6', roughness: 0.5 });
      const glass = mat({
        color: '#bfe1f2',
        roughness: 0.05,
        metalness: 0.3,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      // front glass facade + right side glass above the balustrade
      add(new THREE.PlaneGeometry(W, WALL_H - 0.3), glass, 0, WALL_H / 2, D / 2);
      const gs = add(new THREE.PlaneGeometry(D, WALL_H - 1.3), glass, W / 2, 1.15 + (WALL_H - 1.15) / 2, 0);
      gs.rotation.y = Math.PI / 2;
      for (let i = 0; i <= 12; i++)
        add((this._g1 ||= new THREE.BoxGeometry(0.12, WALL_H, 0.16)), frame, -W / 2 + (W / 12) * i, WALL_H / 2, D / 2);
      add(new THREE.BoxGeometry(W, 0.12, 0.16), frame, 0, 1.0, D / 2);
      for (let i = 0; i <= 8; i++)
        add(
          (this._g2 ||= new THREE.BoxGeometry(0.16, WALL_H - 1.15, 0.12)),
          frame,
          W / 2,
          1.15 + (WALL_H - 1.15) / 2,
          -D / 2 + (D / 8) * i,
        );
      // roof slab + parapet
      add(new THREE.BoxGeometry(W + 1.2, 0.4, D + 1.2), trim, 0, WALL_H + 0.2, 0);
      add(new THREE.BoxGeometry(W + 0.6, 0.08, D + 0.6), roofM, 0, WALL_H + 0.44, 0);
      [
        [0, D / 2 + 0.45, W + 1.2, 0.3],
        [0, -D / 2 - 0.45, W + 1.2, 0.3],
      ].forEach(([x, z, w, d]) => add(new THREE.BoxGeometry(w, 0.7, d), trim, x, WALL_H + 0.75, z));
      [[W / 2 + 0.45], [-W / 2 - 0.45]].forEach(([x]) =>
        add(new THREE.BoxGeometry(0.3, 0.7, D + 1.2), trim, x, WALL_H + 0.75, 0),
      );
      const top = WALL_H + 0.48;
      // solar panels
      const solar = mat({ color: '#28406b', roughness: 0.25, metalness: 0.6 });
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 5; c++) {
          const p = add(
            (this._g3 ||= new THREE.BoxGeometry(2.0, 0.08, 1.2)),
            solar,
            4 + c * 2.3,
            top + 0.45,
            -8 + r * 1.8,
          );
          p.rotation.x = -0.35;
        }
      // AC units + water tank
      const ac = mat({ color: '#d7dbe0', roughness: 0.5 });
      [
        [-12, -7],
        [-9.5, -7],
        [-12, -4.5],
      ].forEach(([x, z]) => add((this._g4 ||= new RoundedBoxGeometry(1.6, 0.9, 1.2, 2, 0.08)), ac, x, top + 0.45, z));
      const tank = add(
        new THREE.CylinderGeometry(1, 1, 1.8, 20),
        mat({ color: '#8b6a4f', roughness: 0.9 }),
        -4,
        top + 1.1,
        -7.5,
      );
      // rooftop garden terrace (front)
      const deck = add(new THREE.BoxGeometry(14, 0.1, 6), mat({ color: '#c08a5c', roughness: 0.8 }), -7, top + 0.05, 6);
      const green = mat({ color: '#5fb760', roughness: 0.9, flatShading: true });
      const box = mat({ color: '#f4eee6', roughness: 0.7 });
      [
        [-13, 4],
        [-13, 8],
        [-1, 4],
        [-1, 8],
      ].forEach(([x, z]) => {
        add(new RoundedBoxGeometry(1.4, 0.6, 1.4, 2, 0.08), box, x, top + 0.35, z);
        add((this._g5 ||= new THREE.IcosahedronGeometry(0.9, 1)), green, x, top + 1.35, z);
      });
      const umb = mat({ color: '#e8604c', roughness: 0.8 });
      [
        [-9.5, 6],
        [-4.5, 6],
      ].forEach(([x, z]) => {
        add(new THREE.ConeGeometry(1.4, 0.5, 12), umb, x, top + 2.3, z);
        add(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), frame, x, top + 1.15, z);
        add(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 20), trim, x, top + 0.8, z);
      });
      // rooftop sign (lights up at night)
      const s = canvasTex(1024, 160);
      const c = s.ctx;
      c.clearRect(0, 0, 1024, 160);
      c.fillStyle = '#f5b83d';
      c.font = '800 96px "Space Grotesk", Inter, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('FAST SALES', 512, 64);
      c.fillStyle = '#ffffff';
      c.font = '700 34px "Space Grotesk", Inter, sans-serif';
      c.fillText('TRAINING CENTER', 512, 134);
      s.t.needsUpdate = true;
      const signM = mat({
        map: s.t,
        emissiveMap: s.t,
        emissive: '#ffffff',
        emissiveIntensity: 0.4,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      signM.userData.alphaTex = true;
      this.lampMats.push(signM);
      add(new THREE.PlaneGeometry(13, 2.03), signM, 7.5, top + 2.4, D / 2 + 0.2);
      const signFrame = mat({ color: '#2b2f38', metalness: 0.5, roughness: 0.4 });
      [1.8, 13.2].forEach(x => add(new THREE.BoxGeometry(0.12, 2.6, 0.12), signFrame, x, top + 1.3, D / 2 + 0.1));
      g.traverse(o => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = true;
        }
      });
      g.visible = false;
      this._setShell(0);
    }
    _setShell(a) {
      this.roofA = a;
      if (!this.shell) return;
      this.shell.visible = a > 0.02;
      for (const m of this.shellMats) {
        const tr = a < 0.99 || m.userData.op < 1 || m.userData.alphaTex;
        if (m.transparent !== tr) {
          m.transparent = tr;
          m.needsUpdate = true;
        }
        m.opacity = m.userData.op * a;
        m.depthWrite = a > 0.99 && m.userData.op >= 1;
      }
      this.labels.domElement.style.opacity = String(Math.max(0, 1 - a * 1.6));
      this.labels.domElement.style.visibility = a > 0.6 ? 'hidden' : 'visible';
    }

    /* ---------- camera helpers for the on-screen navigation ---------- */
    _orbitGoal(dAz = 0, dPol = 0, kDist = 1) {
      const c = this.controls,
        base = this.camGoal ? this.camGoal.pos : this.camera.position,
        tgt = (this.camGoal ? this.camGoal.tgt : c.target).clone();
      const sp = new THREE.Spherical().setFromVector3(base.clone().sub(tgt));
      sp.theta += dAz;
      sp.phi = Math.min(c.maxPolarAngle, Math.max(0.15, sp.phi + dPol));
      sp.radius = Math.min(c.maxDistance, Math.max(c.minDistance, sp.radius * kDist));
      this.camGoal = { pos: new THREE.Vector3().setFromSpherical(sp).add(tgt), tgt };
    }
    /** Fly the camera to any point of the city. */
    flyTo(pos, tgt, instant = false) {
      this.cityMode = false;
      this.camGoal = { pos: new THREE.Vector3(...pos), tgt: new THREE.Vector3(...tgt) };
      if (instant || this.reduced) {
        this.camera.position.copy(this.camGoal.pos);
        this.controls.target.copy(this.camGoal.tgt);
        this.camGoal = null;
      }
    }
    zoom(dir) {
      this._orbitGoal(0, 0, dir > 0 ? 0.75 : 1.33);
    }
    rotate(dir) {
      this._orbitGoal((dir * Math.PI) / 6, 0);
    }
    tilt(dir) {
      this._orbitGoal(0, dir * 0.18);
    }
    spin(on) {
      this.controls.autoRotate = on ?? !this.controls.autoRotate;
      this.controls.autoRotateSpeed = this.cityMode ? 0.6 : 0.35;
      return this.controls.autoRotate;
    }
    reset() {
      this.view(this.cityMode ? 'city' : 'overview');
    }

    _screens(root) {
      // Content wall (back wall, centre)
      this.contentTex = canvasTex(1280, 512);
      const cw = new THREE.Mesh(
        new THREE.PlaneGeometry(8.6, 3.44),
        new THREE.MeshBasicMaterial({ map: this.contentTex.t, toneMapped: false }),
      );
      cw.position.set(2.65, 2.9, -10.82);
      root.add(cw);
      this._frame(root, cw, 8.6, 3.44);
      this.drawContent([]);
      cw.userData.view = 'content';
      this.clickables.push(cw);

      // CRM screen (left wall)
      this.crmTex = canvasTex(1024, 576);
      const crm = new THREE.Mesh(
        new THREE.PlaneGeometry(5.4, 3.04),
        new THREE.MeshBasicMaterial({ map: this.crmTex.t, toneMapped: false }),
      );
      crm.rotation.y = Math.PI / 2;
      crm.position.set(-15.78, 3.0, -2.4);
      root.add(crm);
      this._frame(root, crm, 5.4, 3.04);
      this.drawCRM(null);
      crm.userData.view = 'crm';
      this.clickables.push(crm);

      // Live dashboard kiosk (right side)
      this.dashTex = canvasTex(640, 800);
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(2.7, 3.375),
        new THREE.MeshBasicMaterial({ map: this.dashTex.t, toneMapped: false }),
      );
      dash.position.set(13.9, 2.25, -7.6);
      dash.rotation.y = -0.55;
      root.add(dash);
      const post = new THREE.Mesh(
        new RoundedBoxGeometry(2.95, 3.65, 0.18, 2, 0.06),
        new THREE.MeshStandardMaterial({ color: '#2b2f38', metalness: 0.5, roughness: 0.4 }),
      );
      post.position.copy(dash.position);
      post.rotation.y = dash.rotation.y;
      post.translateZ(-0.1);
      post.castShadow = true;
      root.add(post);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.12, 24), post.material);
      foot.position.set(dash.position.x + 0.05, 0.06, dash.position.z - 0.05);
      root.add(foot);
      this.drawDash(null);
      dash.userData.view = 'dash';
      this.clickables.push(dash);
    }

    _frame(root, mesh, w, h) {
      const f = new THREE.Mesh(
        new RoundedBoxGeometry(w + 0.22, h + 0.22, 0.1, 2, 0.04),
        new THREE.MeshStandardMaterial({ color: '#2b2f38', metalness: 0.5, roughness: 0.35 }),
      );
      f.position.copy(mesh.position);
      f.rotation.copy(mesh.rotation);
      f.translateZ(-0.06);
      root.add(f);
      const glow = new THREE.PointLight('#8fc0ff', 1, 6, 2);
      glow.position.copy(mesh.position);
      glow.rotation.copy(mesh.rotation);
      glow.translateZ(1);
      root.add(glow);
      this.glows.push(glow);
    }

    /* ---------- furniture & decor ---------- */
    // local (lx, ly, lz) of a thing standing at (x, z) and turned by ry -> world coordinates
    _loc(x, z, ry = 0) {
      const c = Math.cos(ry),
        s = Math.sin(ry);
      return (lx, ly, lz) => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
    }

    _plane(root, tex, w, h, x, y, z, ry = 0, o = {}) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, ...o }),
      );
      m.position.set(x, y, z);
      m.rotation.y = ry;
      root.add(m);
      return m;
    }

    /** A framed print on a wall (ry = which way the wall faces: 0 = +z, PI/2 = +x). */
    _framed(root, tex, w, h, x, y, z, ry, frame = '#b97e4e') {
      this.S.box(w + 0.12, h + 0.12, 0.05, frame, x, y, z, ry, 'satin');
      const sx = Math.sin(ry) * 0.028,
        sz = Math.cos(ry) * 0.028;
      return this._plane(root, tex, w, h, x + sx, y, z + sz, ry);
    }

    _art(kind, w, h, px = 320) {
      return paint(px, Math.round((px * h) / w), (g, W, H) => ART[kind](g, W, H)).t;
    }

    _rug(root, x, z, w, d, base, border, pattern = 'plain', round = false) {
      const s = canvasTex(256, Math.round((256 * d) / w));
      const g = s.ctx,
        H = s.c.height;
      g.fillStyle = border;
      if (round) {
        g.beginPath();
        g.arc(128, H / 2, 127, 0, 7);
        g.fill();
      } else {
        rr(g, 0, 0, 256, H, 18);
        g.fill();
      }
      g.fillStyle = base;
      if (round) {
        g.beginPath();
        g.arc(128, H / 2, 112, 0, 7);
        g.fill();
      } else {
        rr(g, 10, 10, 236, H - 20, 12);
        g.fill();
      }
      g.strokeStyle = border;
      g.globalAlpha = 0.35;
      g.lineWidth = 3;
      if (round) {
        g.beginPath();
        g.arc(128, H / 2, 90, 0, 7);
        g.stroke();
      } else {
        rr(g, 22, 22, 212, H - 44, 8);
        g.stroke();
      }
      g.globalAlpha = 0.5;
      g.fillStyle = border;
      g.lineWidth = 2;
      if (pattern === 'diamonds') {
        for (let y = 36; y < H - 30; y += 26)
          for (let xx = 36; xx < 226; xx += 26) {
            g.beginPath();
            g.moveTo(xx, y - 9);
            g.lineTo(xx + 9, y);
            g.lineTo(xx, y + 9);
            g.lineTo(xx - 9, y);
            g.closePath();
            (Math.round((xx + y) / 26) % 2 ? g.fill : g.stroke).call(g);
          }
      } else if (pattern === 'stripes') {
        for (let y = 30; y < H - 24; y += 22) g.fillRect(24, y, 208, 7);
      } else if (pattern === 'kilim') {
        for (let xx = 24; xx < 232; xx += 16) {
          g.beginPath();
          g.moveTo(xx, 26);
          g.lineTo(xx + 8, 38);
          g.lineTo(xx + 16, 26);
          g.fill();
          g.beginPath();
          g.moveTo(xx, H - 26);
          g.lineTo(xx + 8, H - 38);
          g.lineTo(xx + 16, H - 26);
          g.fill();
        }
        g.beginPath();
        g.moveTo(128, H / 2 - 36);
        g.lineTo(168, H / 2);
        g.lineTo(128, H / 2 + 36);
        g.lineTo(88, H / 2);
        g.closePath();
        g.stroke();
        g.beginPath();
        g.arc(128, H / 2, 14, 0, 7);
        g.fill();
      } else if (pattern === 'rings') {
        for (let r = 20; r < 100; r += 16) {
          g.beginPath();
          g.arc(128, H / 2, r, 0, 7);
          g.stroke();
        }
        for (let a = 0; a < 12; a++) {
          g.beginPath();
          g.arc(128 + Math.cos((a / 12) * 6.28) * 100, H / 2 + Math.sin((a / 12) * 6.28) * 100, 4, 0, 7);
          g.fill();
        }
      }
      g.globalAlpha = 1;
      s.t.needsUpdate = true;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshStandardMaterial({ map: s.t, transparent: true, roughness: 1 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.012, z);
      m.receiveShadow = true;
      root.add(m);
    }

    /* ---------- plants (baked): bush, monstera, palm, snake, fiddle, cactus, succulent, bamboo, olive, orchid, pothos ---------- */
    _plantB(B, kind, x, y, z, s = 1, pot = 'terra') {
      const potC = {
        terra: '#c96f4a',
        white: '#f1ece3',
        concrete: '#9aa0a6',
        basket: '#b58a5a',
        navy: '#2f3b5c',
        teal: '#3fb6a8',
      }[pot];
      const greens = ['#3f9a5c', '#4ea457', '#5fb760', '#2f7a55'];
      const P = (px, py, pz) => [x + px * s, y + py * s, z + pz * s];
      const big = kind === 'olive' || kind === 'fiddle' || kind === 'palm' || kind === 'monstera';
      if (pot === 'basket') {
        B.cyl(0.3 * s, 0.5 * s, potC, ...P(0, 0.25, 0), 'matte', 12);
        B.tor(0.3 * s, 0.012, '#8d6a42', ...P(0, 0.5, 0), Math.PI / 2, 0, 0, 'matte', 12);
      } else if (pot === 'terra') {
        B.cone(0.32 * s, 0.24 * s, 0.6 * s, potC, ...P(0, 0.3, 0), 'matte', 14);
        B.cyl(0.335 * s, 0.07 * s, potC, ...P(0, 0.58, 0), 'matte', 14);
      } else B.cone(0.3 * s, 0.24 * s, big ? 0.6 * s : 0.5 * s, potC, ...P(0, big ? 0.3 : 0.25, 0), 'satin', 14);
      const top = (pot === 'terra' ? 0.6 : big ? 0.6 : 0.5) * s;
      B.cyl(0.29 * s, 0.02 * s, '#4a3324', x, y + top - 0.01 * s, z, 'matte', 12);
      const n = { snake: 9, palm: 12, monstera: 11, bush: 14 }[kind] || 10;
      if (kind === 'bush' || kind === 'monstera' || kind === 'palm' || kind === 'snake') {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd() * 0.4,
            col = greens[i % 4];
          if (kind === 'snake')
            B.leaf(
              col,
              ...P(Math.cos(a) * 0.08, 0.55, Math.sin(a) * 0.08),
              0.35 * s,
              (1.3 + rnd() * 0.5) * s,
              0,
              a,
              (rnd() - 0.5) * 0.25,
            );
          else if (kind === 'palm') B.leaf(col, ...P(0, 0.9 + rnd() * 0.5, 0), 0.6 * s, 1.5 * s, -0.6 - rnd() * 0.5, a);
          else if (kind === 'monstera')
            B.leaf(col, ...P(0, 0.6 + rnd() * 0.5, 0), 1.3 * s, 1.1 * s, -0.35 - rnd() * 0.7, a);
          else B.leaf(col, ...P(0, 0.55 + rnd() * 0.2, 0), 0.7 * s, 0.7 * s, -0.2 - rnd(), a);
        }
        if (kind === 'palm') B.cyl(0.05 * s, 0.9 * s, '#8a5a36', ...P(0, 0.95, 0), 'matte', 8);
      } else if (kind === 'fiddle') {
        B.cyl(0.035 * s, 1.3 * s, '#7a5a3a', ...P(0, 1.2, 0), 'matte', 8);
        for (let i = 0; i < 9; i++) {
          const a = i * 2.4,
            h = 1.0 + i * 0.14;
          B.leaf(
            '#3f8a4e',
            ...P(Math.cos(a) * 0.05, h, Math.sin(a) * 0.05),
            0.95 * s,
            0.7 * s,
            -0.5 - (i % 3) * 0.2,
            a,
          );
        }
      } else if (kind === 'cactus') {
        B.cyl(0.11 * s, 0.6 * s, '#4f9a68', ...P(0, 0.85, 0), 'matte', 10);
        B.sph(0.11 * s, '#4f9a68', ...P(0, 1.15, 0), 1, 1, 1, 'matte', 10);
        B.cyl(0.055 * s, 0.22 * s, '#4f9a68', ...P(0.16, 0.9, 0), 'matte', 8);
        B.cyl(0.055 * s, 0.14 * s, '#4f9a68', ...P(0.1, 0.8, 0), 'matte', 8, 0, Math.PI / 2);
        B.sph(0.05 * s, '#4f9a68', ...P(0.16, 1.02, 0), 1, 1, 1, 'matte', 8);
        B.sph(0.035 * s, '#f06a9b', ...P(0, 1.25, 0), 1, 1, 1, 'matte', 6);
      } else if (kind === 'succulent') {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * 6.28,
            r = i < 6 ? 0.1 : 0.05;
          B.sph(
            0.07 * s,
            i % 2 ? '#7fb98c' : '#6aa97b',
            ...P(Math.cos(a) * r, 0.68 + (i < 6 ? 0 : 0.06), Math.sin(a) * r),
            0.8,
            1.3,
            0.8,
            'matte',
            6,
          );
        }
      } else if (kind === 'bamboo') {
        for (let i = 0; i < 6; i++) {
          const a = i * 1.1,
            h = 1.1 + (i % 3) * 0.4;
          B.cyl(0.018 * s, h * s, '#8cbf5a', ...P(Math.cos(a) * 0.09, 0.6 + h / 2, Math.sin(a) * 0.09), 'matte', 6);
          for (let k = 1; k < 4; k++)
            B.cyl(
              0.021 * s,
              0.012 * s,
              '#5f8a3a',
              ...P(Math.cos(a) * 0.09, 0.6 + (h * k) / 4, Math.sin(a) * 0.09),
              'matte',
              6,
            );
          B.leaf('#6fae48', ...P(Math.cos(a) * 0.09, 0.6 + h, Math.sin(a) * 0.09), 0.3 * s, 0.4 * s, -0.8, a);
        }
      } else if (kind === 'olive') {
        B.cyl(0.04 * s, 1.5 * s, '#6b5a48', ...P(0, 1.3, 0), 'matte', 7);
        for (let i = 0; i < 9; i++) {
          const a = i * 2.2;
          B.sph(
            0.3 * s,
            i % 2 ? '#8da17a' : '#7a926b',
            ...P(Math.cos(a) * 0.28, 1.65 + (i % 3) * 0.2, Math.sin(a) * 0.28),
            1,
            0.7,
            1,
            'leaf',
            8,
          );
        }
      } else if (kind === 'orchid') {
        for (let i = 0; i < 3; i++) B.leaf('#2f7a55', ...P(0, 0.62, 0), 0.5 * s, 0.35 * s, -0.9, i * 2.1);
        B.cyl(0.01 * s, 0.7 * s, '#6aa45a', ...P(0.05, 0.95, 0), 'matte', 5, 0, 0.2);
        for (let i = 0; i < 4; i++)
          B.sph(
            0.05 * s,
            i % 2 ? '#f5a3c8' : '#ffd0e4',
            ...P(0.1 + i * 0.03, 1.1 + i * 0.1, 0.03 * (i % 2)),
            1.2,
            0.5,
            1,
            'matte',
            6,
          );
      } else if (kind === 'pothos') {
        for (let i = 0; i < 4; i++) {
          const a = i * 1.6;
          for (let k = 0; k < 7; k++)
            B.leaf(
              k % 2 ? '#4ea457' : '#3f9a5c',
              ...P(Math.cos(a) * (0.18 + k * 0.03), 0.55 - k * 0.12, Math.sin(a) * (0.18 + k * 0.03)),
              0.22 * s,
              0.22 * s,
              -2 + k * 0.1,
              a + k,
            );
        }
        for (let i = 0; i < 6; i++)
          B.leaf('#5fb760', ...P(0, 0.62, 0), 0.4 * s, 0.4 * s, -0.5 - rnd() * 0.5, (i / 6) * 6.28);
      }
    }

    /* ---------- books and shelves (baked) ---------- */
    _bookRow(B, L, ry, x0, y0, x1, depth, hMax) {
      // a shelf row of upright books with leaning ones, magazines, binders and bookends
      let bx = x0;
      const row = [];
      while (bx < x1 - 0.12) {
        const r = rnd();
        if (r < 0.1) {
          bx += 0.18 + rnd() * 0.25;
          continue;
        }
        const bw = 0.04 + rnd() * 0.06,
          bh = Math.min(hMax, 0.22 + rnd() * 0.22),
          kind = r < 0.2 ? 'binder' : r < 0.28 ? 'mag' : 'book';
        const col =
          kind === 'binder'
            ? ['#26324d', '#2f7a55', '#8a3a3a', '#444b57'][(rnd() * 4) | 0]
            : BOOK_COLORS[(rnd() * BOOK_COLORS.length) | 0];
        const dd = depth * (kind === 'mag' ? 0.8 : 0.55 + rnd() * 0.3);
        const lean = rnd() < 0.07 ? 0.28 : 0;
        const w = kind === 'binder' ? bw + 0.03 : kind === 'mag' ? 0.02 + rnd() * 0.012 : bw;
        const h = kind === 'binder' ? Math.min(hMax, 0.34) : kind === 'mag' ? 0.3 : bh;
        B.box(w, h, dd, col, ...L(bx + w / 2, y0 + h / 2, 0.02), ry, 'matte', 0, lean);
        if (kind === 'binder') B.box(w * 0.5, 0.1, dd + 0.004, '#f6f1e6', ...L(bx + w / 2, y0 + h * 0.5, 0.02), ry);
        else if (rnd() < 0.5) B.box(w + 0.002, 0.012, dd + 0.004, '#f3e2c0', ...L(bx + w / 2, y0 + h * 0.7, 0.02), ry);
        row.push(bx);
        bx += w + 0.006 + (lean ? 0.09 : 0);
      }
      return bx;
    }

    _shelf(root, x, z, rotY, w = 2.6, h = 2.6) {
      const B = this.S,
        L = this._loc(x, z, rotY),
        dep = 0.42,
        t = 0.06,
        rows = 4,
        wood = '#b97e4e';
      const box = (sx, sy, sz, px, py, pz) => B.box(sx, sy, sz, wood, ...L(px, py, pz), rotY, 'satin');
      box(t, h, dep, -w / 2, h / 2, 0);
      box(t, h, dep, w / 2, h / 2, 0);
      box(w, t, dep, 0, h, 0);
      for (let i = 0; i < rows; i++) box(w, t, dep, 0, 0.1 + i * (h / rows), 0);
      box(w, h, 0.03, 0, h / 2, -dep / 2);
      box(w + 0.08, 0.04, dep + 0.04, 0, 0.02, 0.0);
      const hi = !this.mobile;
      for (let r = 0; r < rows; r++) {
        const y0 = 0.13 + r * (h / rows),
          rh = h / rows - 0.1;
        let end = this._bookRow(B, L, rotY, -w / 2 + 0.06, y0, w / 2 - (r % 2 ? 0.55 : 0.2), 0.34, rh);
        if (!hi) continue;
        // something other than books at the end of the row
        const ox = Math.min(end + 0.2, w / 2 - 0.2);
        if (r === 0) {
          B.box(0.3, 0.05, 0.22, '#e8604c', ...L(ox, y0 + 0.03, 0.02), rotY + 0.2);
          B.box(0.26, 0.04, 0.2, '#3fb6a8', ...L(ox, y0 + 0.075, 0.02), rotY - 0.15);
          B.box(0.22, 0.04, 0.18, '#f5b83d', ...L(ox, y0 + 0.115, 0.02), rotY + 0.1);
        } else if (r === 1) {
          const q = L(ox, y0 + 0.12, 0.02); // small globe
          B.cyl(0.05, 0.02, '#2b2f38', q[0], y0 + 0.01, q[2], 'metal', 10);
          B.sph(0.1, '#4a86b8', q[0], q[1] + 0.03, q[2], 1, 1, 1, 'satin', 12);
          B.sph(0.102, '#7fbf7a', q[0], q[1] + 0.05, q[2] + 0.01, 0.9, 0.5, 0.9, 'satin', 8);
        } else if (r === 2) {
          const q = L(ox, y0, 0.02); // framed photo + model car
          B.box(0.2, 0.26, 0.02, '#2b2f38', q[0], y0 + 0.13, q[2], rotY - 0.1);
          B.box(0.15, 0.2, 0.022, '#f3e2c0', q[0], y0 + 0.13, q[2], rotY - 0.1);
          const q2 = L(ox + 0.3, y0 + 0.04, 0.0);
          B.box(0.2, 0.06, 0.09, '#f7c320', q2[0], q2[1], q2[2], rotY, 'satin');
          B.box(0.1, 0.05, 0.08, '#bfe3ff', q2[0], q2[1] + 0.05, q2[2], rotY, 'satin');
        } else {
          const q = L(ox, y0, 0.02);
          this._plantB(B, 'succulent', q[0], y0 + 0.03, q[2], 0.3, 'white');
        }
      }
      // pothos trailing from the top, a plant on top
      const q = L(-w * 0.3, h + 0.03, 0.05);
      this._plantB(B, 'bush', q[0], q[1], q[2], 0.35, 'terra');
      if (hi) {
        const q2 = L(w * 0.25, h + 0.03, 0.05);
        this._plantB(B, 'pothos', q2[0], q2[1] + 0.05, q2[2], 0.45, 'white');
      }
    }

    /* ---------- chairs (one merged mesh each, so they can turn) ---------- */
    _chair(root, x, z, rotY, color = '#e8862f', o = {}) {
      const B = new Bake();
      const seatC = color,
        dark = '#2b2f38',
        mid = '#3d4350';
      B.rbox(0.62, 0.11, 0.6, 0.05, seatC, 0, 0.5, 0, 0, 'matte');
      B.rbox(0.56, 0.04, 0.54, 0.02, '#262a32', 0, 0.44, 0, 0, 'matte');
      B.rbox(0.6, 0.6, 0.09, 0.05, seatC, 0, 0.95, 0.3, 0, 'matte', -0.1);
      B.rbox(0.52, 0.14, 0.05, 0.02, mid, 0, 0.78, 0.26, 0, 'matte', -0.1);
      if (o.high) B.rbox(0.3, 0.16, 0.07, 0.03, seatC, 0, 1.4, 0.36, 0, 'matte', -0.1);
      [-1, 1].forEach(s => {
        B.cyl(0.018, 0.22, dark, s * 0.33, 0.62, 0.08, 'metal', 6);
        B.rbox(0.07, 0.035, 0.28, 0.015, dark, s * 0.33, 0.74, 0.04, 0, 'matte');
      });
      B.cyl(0.035, 0.38, dark, 0, 0.27, 0, 'metal', 8);
      B.cyl(0.06, 0.05, mid, 0, 0.39, 0, 'metal', 8);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        B.box(0.05, 0.035, 0.3, dark, Math.sin(a) * 0.15, 0.07, Math.cos(a) * 0.15, a, 'metal');
        B.cyl(0.032, 0.05, '#16181d', Math.sin(a) * 0.29, 0.035, Math.cos(a) * 0.29, 'matte', 6);
      }
      const g = new THREE.Group();
      B.flush(g);
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      root.add(g);
      return g;
    }

    _laptopB(B, x, y, z, ry, col = '#c9ced6') {
      // closed-edge laptop: base, keyboard deck, tilted lid (screen is dark here; the desk monitor carries the content)
      const c = Math.cos(ry),
        s = Math.sin(ry);
      const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
      B.box(0.46, 0.022, 0.32, col, x, y + 0.011, z, ry, 'metal');
      B.box(0.38, 0.004, 0.16, '#2a2f38', ...[P(0, -0.04)[0], y + 0.023, P(0, -0.04)[1]], ry);
      B.box(0.14, 0.004, 0.08, '#aab2be', ...[P(0, 0.11)[0], y + 0.023, P(0, 0.11)[1]], ry);
      const l = P(0, -0.15);
      B.box(0.46, 0.3, 0.014, col, l[0], y + 0.17, l[1], ry, 'metal', -0.3);
      B.box(0.42, 0.26, 0.004, '#1b2533', P(0, -0.138)[0], y + 0.172, P(0, -0.138)[1], ry, 'matte', -0.3);
    }

    _desk(root, x, z, accent = '#c9b79c', screenTex = null, empty = false, w = 2.4, o = {}) {
      const B = this.S,
        hi = !this.mobile,
        X = lx => x + lx,
        top = '#b97e4e',
        white = '#f4eee6',
        legC = '#2b2f38';
      B.rbox(w, 0.07, 1.15, 0.03, top, x, 0.78, z, 0, 'satin');
      B.box(w - 0.04, 0.012, 1.11, '#a56d41', x, 0.742, z); // under-edge shadow band
      // drawer unit on the right, slim legs on the left, a privacy panel on the camera side
      B.rbox(0.55, 0.72, 1.0, 0.03, white, X(w / 2 - 0.35), 0.37, z, 0, 'satin');
      for (let i = 0; i < 3; i++) {
        B.box(0.4, 0.004, 0.003, '#d8d0c3', X(w / 2 - 0.35), 0.69 - i * 0.22, z + 0.502);
        B.box(0.2, 0.025, 0.03, accent, X(w / 2 - 0.35), 0.6 - i * 0.22, z + 0.515, 0, 'metal');
      }
      [-0.5, 0.5].forEach(dz => B.cyl(0.03, 0.76, legC, X(-w / 2 + 0.12), 0.38, z + dz, 'metal', 8));
      B.box(0.04, 0.04, 1.0, legC, X(-w / 2 + 0.12), 0.1, z, 0, 'metal');
      B.box(w - 0.75, 0.42, 0.025, '#e7dfd1', X(-0.2), 0.52, z + 0.52, 0, 'satin');
      // monitor angled toward the front so the camera can see the agent's activity
      const mx = X(-w / 2 + 0.6),
        mz = z - 0.25,
        my = 1.42,
        mr = 0.5;
      B.rbox(1.1, 0.68, 0.05, 0.02, '#1c2028', mx, my, mz, mr, 'metal');
      B.cyl(0.03, 0.3, legC, mx, my - 0.45, mz, 'metal', 8);
      B.box(0.3, 0.02, 0.2, legC, mx, 0.82, mz, mr, 'metal');
      const scr = new THREE.Mesh(
        new THREE.PlaneGeometry(1.02, 0.6),
        new THREE.MeshBasicMaterial({
          color: empty ? '#141a22' : '#ffffff',
          map: screenTex || null,
          toneMapped: false,
        }),
      );
      scr.position.set(mx + Math.sin(mr) * 0.03, my, mz + Math.cos(mr) * 0.03);
      scr.rotation.y = mr;
      root.add(scr);
      // sticky notes on the bezel
      const onMon = (lx, ly, d = 0.032) => [
        mx + lx * Math.cos(mr) + Math.sin(mr) * d,
        my + ly,
        mz - lx * Math.sin(mr) + Math.cos(mr) * d,
      ];
      if (!empty && hi) {
        ['#ffe36e', '#ff9ec4', '#9be3d0'].forEach((c, i) =>
          B.box(0.075, 0.075, 0.004, c, ...onMon(0.52 + (i % 2) * 0.02, 0.1 - i * 0.1, 0.028), mr + (i - 1) * 0.08),
        );
      }
      // cables: monitor and laptop leads dropping to the floor
      if (hi) {
        B.cyl(0.008, 0.8, '#16181d', mx - 0.1, 0.41, z - 0.6, 'matte', 4);
        B.cyl(0.008, 0.8, '#16181d', mx + 0.15, 0.41, z - 0.6, 'matte', 4);
        B.box(0.34, 0.02, 0.05, '#2b2f38', x + 0.2, 0.012, z - 0.6, 0.2); // floor cable cover
        B.box(0.12, 0.05, 0.05, '#e9ecef', X(w / 2 - 0.15), 0.775, z - 0.42); // power strip under the lip
      }
      // desk lamp (the bulb glows at dusk)
      const lx = X(w / 2 - 0.3);
      B.cyl(0.1, 0.03, legC, lx, 0.83, z + 0.3, 'metal', 16);
      B.cyl(0.015, 0.46, legC, lx, 1.05, z + 0.3, 'metal', 6);
      B.cyl(0.015, 0.26, legC, lx, 1.26, z + 0.2, 'metal', 6, Math.PI / 2 - 0.3);
      B.put(
        GEO('shade', () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
        accent,
        lx,
        1.25,
        z + 0.08,
        0.11,
        0.11,
        0.11,
        0,
        0,
        0,
        'satin',
      );
      B.sph(0.05, '#fff4d6', lx, 1.24, z + 0.08, 1, 1, 1, 'lamp', 8);
      if (empty) {
        this._plantB(B, 'succulent', x + 0.2, 0.815, z, 0.5, 'white');
        B.box(0.4, 0.02, 0.14, '#d7dbe0', x - 0.1, 0.8, z - 0.3);
        return;
      }
      // keyboard + mouse + pad
      const kx = X(-0.2),
        kz = z - 0.4;
      B.box(0.44, 0.018, 0.15, '#e9ecef', kx, 0.82, kz, 0.04, 'satin');
      for (let r = 0; r < 3; r++) B.box(0.4, 0.006, 0.026, '#c9ced6', kx, 0.832, kz - 0.045 + r * 0.04, 0.04);
      B.box(0.2, 0.006, 0.02, '#c9ced6', kx, 0.832, kz + 0.05, 0.04);
      B.box(0.22, 0.006, 0.19, '#2b3445', X(0.28), 0.813, z - 0.36);
      B.rbox(0.06, 0.03, 0.1, 0.015, '#e9ecef', X(0.28), 0.832, z - 0.36, 0.1, 'satin');
      if (!o.dual) this._laptopB(B, X(0.05), 0.815, z - 0.02, 0, '#c9ced6');
      if (o.dual) {
        // second monitor, slightly angled in
        const m2x = mx + 1.12,
          m2z = z - 0.3;
        B.rbox(1.0, 0.62, 0.05, 0.02, '#1c2028', m2x, 1.4, m2z, 0.15, 'metal');
        B.cyl(0.03, 0.3, legC, m2x, 0.97, m2z, 'metal', 8);
        B.box(0.3, 0.02, 0.2, legC, m2x, 0.82, m2z, 0.15, 'metal');
        const s2 = new THREE.Mesh(
          new THREE.PlaneGeometry(0.93, 0.55),
          new THREE.MeshBasicMaterial({ map: this._chartTex(), toneMapped: false }),
        );
        s2.position.set(m2x + Math.sin(0.15) * 0.03, 1.4, m2z + Math.cos(0.15) * 0.03);
        s2.rotation.y = 0.15;
        root.add(s2);
      }
      // papers, notebook with a pen, a clipboard
      B.box(0.3, 0.012, 0.4, '#ffffff', X(-0.62), 0.806, z + 0.2, 0.2);
      B.box(0.29, 0.012, 0.39, '#fbfaf5', X(-0.62), 0.818, z + 0.2, 0.32);
      B.box(0.2, 0.02, 0.27, accent, X(0.55), 0.81, z + 0.12, -0.25, 'satin');
      B.cyl(0.006, 0.17, '#c0392b', X(0.62), 0.825, z + 0.12, 'matte', 5, 0, 0, 1.2);
      B.cyl(0.024, 0.07, '#2b3445', X(w / 2 - 0.62), 0.815, z + 0.1, 'matte', 10); // pen cup
      for (let i = 0; i < 3; i++)
        B.cyl(
          0.004,
          0.14,
          ['#e8604c', '#3fb6a8', '#26324d'][i],
          X(w / 2 - 0.62) + (i - 1) * 0.01,
          0.89,
          z + 0.1,
          'matte',
          4,
          0,
          (i - 1) * 0.15,
        );
      // a little plant of its own
      const pk = o.plant || 'succulent';
      this._plantB(B, pk, X(-w / 2 + 0.2), 0.815, z + 0.4, pk === 'orchid' ? 0.42 : 0.4, o.pot || 'white');
      this._deskExtras(B, o.key, x, z, w, accent, X);
      // the personal mug is its own mesh so it can leave the desk with its owner
      const mug = new THREE.Group();
      const cup = new THREE.Mesh(
        GEO('cupc', () => new THREE.CylinderGeometry(0.058, 0.046, 0.12, 14)),
        this._cupMat((this._mugs = (this._mugs || 0) + 1)),
      );
      mug.add(cup);
      const band = new THREE.Mesh(
        GEO('cupb', () => new THREE.CylinderGeometry(0.0595, 0.0535, 0.034, 14)),
        this._cupBand(),
      );
      band.position.y = 0.012;
      mug.add(band);
      mug.position.set(X(w / 2 - 0.9), 0.875, z - 0.28);
      mug.traverse(m => m.isMesh && (m.castShadow = true));
      root.add(mug);
      return { mug };
    }

    _cupMat() {
      return (this._cupM ||= new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.5 }));
    }
    _cupBand() {
      return (this._cupB ||= new THREE.MeshStandardMaterial({ color: '#2b6cb0', roughness: 0.5 }));
    }
    _chartTex() {
      return (this._chartT ||= paint(256, 150, (g, W, H) => {
        g.fillStyle = '#0f141c';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#38bdf8';
        g.fillRect(0, 0, W, 18);
        for (let i = 0; i < 9; i++) {
          const h = 20 + ((i * 47) % 70);
          g.fillStyle = i % 3 === 0 ? '#3ccf8e' : '#6aa8ff';
          g.fillRect(16 + i * 24, H - 14 - h, 16, h);
        }
        g.strokeStyle = '#f5b83d';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(10, 118);
        [30, 60, 52, 82, 76, 104, 96, 124].forEach((v, i) => g.lineTo(10 + i * 30, 130 - v * 0.8));
        g.stroke();
      }).t);
    }

    // one personal thing per agent, in their own colour
    _deskExtras(B, key, x, z, w, c, X) {
      const hi = !this.mobile;
      const gold = '#d9b45c';
      if (key === 'vera') {
        // headset on a stand + desk phone
        B.cyl(0.04, 0.02, '#2b2f38', X(0.9), 0.82, z - 0.15, 'metal', 10);
        B.cyl(0.01, 0.25, '#2b2f38', X(0.9), 0.95, z - 0.15, 'metal', 6);
        B.tor(0.09, 0.012, '#1f2330', X(0.9), 1.12, z - 0.15, 0, 0, 0, 'satin', 14, Math.PI);
        B.cyl(0.03, 0.03, '#1f2330', X(0.81), 1.06, z - 0.15, 'satin', 8, 0, Math.PI / 2);
        B.cyl(0.03, 0.03, '#1f2330', X(0.99), 1.06, z - 0.15, 'satin', 8, 0, Math.PI / 2);
        B.rbox(0.2, 0.06, 0.18, 0.02, '#2b2f38', X(0.55), 0.82, z + 0.38, -0.2, 'satin');
        B.rbox(0.18, 0.025, 0.04, 0.01, '#3d4350', X(0.55), 0.865, z + 0.38, -0.2);
      } else if (key === 'nico') {
        // flip calendar + hourglass
        B.box(0.2, 0.14, 0.05, '#f6f1e6', X(0.55), 0.89, z + 0.38, 0.1);
        B.box(0.2, 0.03, 0.052, c, X(0.55), 0.95, z + 0.38, 0.1);
        B.cone(0.05, 0.005, 0.1, '#e8d9b8', X(0.95), 0.9, z - 0.2, 'matte', 10);
        B.cone(0.005, 0.05, 0.1, '#e8d9b8', X(0.95), 0.99, z - 0.2, 'matte', 10);
        B.cyl(0.06, 0.012, '#6b4a2b', X(0.95), 0.955, z - 0.2, 'satin', 10);
      } else if (key === 'luna') {
        // ring light, camera and swatches
        B.cyl(0.012, 0.35, '#2b2f38', X(0.9), 1.0, z - 0.2, 'metal', 6);
        B.tor(0.12, 0.014, '#fffaf0', X(0.9), 1.24, z - 0.2, 0, 0.3, 0, 'satin', 18);
        B.box(0.12, 0.08, 0.07, '#2b2f38', X(0.6), 0.86, z + 0.35, 0.3, 'metal');
        B.cyl(0.03, 0.04, '#1b1b22', X(0.6), 0.88, z + 0.4, 'metal', 10, Math.PI / 2, 0, 0.3);
        ['#e879f9', '#f5b83d', '#38bdf8', '#3fb6a8', '#ff6b5e'].forEach((col, i) =>
          B.box(0.03, 0.2, 0.01, col, X(0.1 + i * 0.03), 0.84, z + 0.42, -0.5 + i * 0.25, 'satin', 0, 0),
        );
      } else if (key === 'teo') {
        // calculator, energy can, little bar chart block
        B.rbox(0.1, 0.02, 0.14, 0.01, '#2b2f38', X(0.55), 0.82, z + 0.36, 0.2);
        B.box(0.07, 0.004, 0.03, '#9be3d0', X(0.55), 0.832, z + 0.4, 0.2);
        B.cyl(0.03, 0.12, '#38bdf8', X(0.95), 0.87, z - 0.18, 'metal', 10);
        B.cyl(0.028, 0.01, '#d7dbe0', X(0.95), 0.93, z - 0.18, 'metal', 10);
        for (let i = 0; i < 4; i++)
          B.box(
            0.04,
            0.05 + i * 0.03,
            0.04,
            i === 3 ? '#3ccf8e' : '#6aa8ff',
            X(0.2 + i * 0.05),
            0.83 + (0.05 + i * 0.03) / 2 - 0.0,
            z + 0.42,
          );
      } else if (key === 'iris') {
        // tissue box, tea cup, a small plush heart
        B.box(0.22, 0.09, 0.12, '#f6e6f0', X(0.55), 0.85, z + 0.38, 0.1, 'satin');
        B.box(0.08, 0.05, 0.002, '#ffffff', X(0.55), 0.915, z + 0.38, 0.1);
        B.cyl(0.04, 0.05, '#e6fffb', X(0.95), 0.835, z - 0.18, 'satin', 10);
        B.cyl(0.07, 0.008, '#e6fffb', X(0.95), 0.81, z - 0.18, 'satin', 12);
        B.sph(0.04, '#ff6b8e', X(0.25), 0.85, z + 0.42, 1, 1, 0.7, 'matte', 8);
        B.sph(0.04, '#ff6b8e', X(0.32), 0.85, z + 0.42, 1, 1, 0.7, 'matte', 8);
        B.cone(0.075, 0.005, 0.1, '#ff6b8e', X(0.285), 0.82, z + 0.42, 'matte', 8, Math.PI);
      } else if (key === 'dante') {
        // model car (partnerships with dealers), small flag, card holder
        B.rbox(0.22, 0.05, 0.1, 0.02, '#fb923c', X(0.55), 0.84, z + 0.38, 0.4, 'satin');
        B.rbox(0.12, 0.045, 0.09, 0.02, '#bfe3ff', X(0.55), 0.885, z + 0.38, 0.4, 'satin');
        B.cyl(0.015, 0.2, '#d7dbe0', X(0.95), 0.92, z - 0.2, 'metal', 6);
        B.box(0.13, 0.08, 0.004, '#e8604c', X(1.0), 1.0, z - 0.2, 0, 'satin');
        B.box(0.1, 0.04, 0.05, '#2b2f38', X(0.25), 0.835, z + 0.42, 0.1, 'satin');
      } else if (key === 'max') {
        // desk globe, newton's cradle, small trophy
        B.cyl(0.07, 0.02, '#2b2f38', X(1.05), 0.82, z - 0.15, 'metal', 14);
        B.sph(0.12, '#3b7cc4', X(1.05), 0.97, z - 0.15, 1, 1, 1, 'satin', 16);
        B.sph(0.122, '#6fbf73', X(1.05), 0.99, z - 0.14, 0.92, 0.55, 0.92, 'satin', 10);
        B.tor(0.13, 0.008, gold, X(1.05), 0.97, z - 0.15, 0.4, 0, 0.3, 'metal', 20);
        B.box(0.3, 0.02, 0.14, '#2b2f38', X(0.6), 0.82, z + 0.4);
        for (let i = 0; i < 5; i++) {
          B.sph(0.022, '#d7dbe0', X(0.5 + i * 0.045), 0.86, z + 0.4, 1, 1, 1, 'metal', 8);
          B.cyl(0.002, 0.07, '#9aa3b2', X(0.5 + i * 0.045), 0.9, z + 0.4, 'metal', 4);
        }
        B.cyl(0.03, 0.01, gold, X(0.2), 0.82, z + 0.42, 'metal', 10);
        B.cone(0.04, 0.02, 0.07, gold, X(0.2), 0.86, z + 0.42, 'metal', 10, 0, 0);
        B.cone(0.045, 0.06, 0.04, gold, X(0.2), 0.915, z + 0.42, 'metal', 10);
      }
      if (hi && key === 'owner') {
        // framed photo, a taxi toy and the model tower
        B.box(0.16, 0.2, 0.015, '#2b2f38', X(0.35), 0.9, z + 0.4, 0.2);
        B.box(0.12, 0.16, 0.017, '#f3e2c0', X(0.35), 0.9, z + 0.4, 0.2);
        B.rbox(0.2, 0.05, 0.09, 0.02, NY.cab, X(0.0), 0.84, z + 0.42, 0.1, 'satin');
        B.rbox(0.1, 0.04, 0.08, 0.02, '#bfe3ff', X(0.0), 0.88, z + 0.42, 0.1, 'satin');
        this._tower(B, X(1.2), 0.815, z + 0.35, 0.3);
      }
    }

    /** A small art-deco skyscraper model: stepped setbacks, gold crown and spire. */
    _tower(B, x, y, z, s = 1, body = '#d8cfc0') {
      let w = 0.5 * s,
        yy = y;
      B.box(w * 1.3, 0.03 * s, w * 1.3, '#26324d', x, yy + 0.015 * s, z, 0, 'satin');
      yy += 0.03 * s;
      [0.5, 0.42, 0.34, 0.26, 0.2].forEach(h0 => {
        const h = h0 * 0.6;
        B.box(w, h * s, w, body, x, yy + (h * s) / 2, z, 0, 'satin');
        for (const k of [-0.3, 0, 0.3])
          B.box(w * 0.06, h * s * 0.9, 0.002, '#b8ad9a', x + k * w, yy + (h * s) / 2, z + w / 2 + 0.001);
        for (const k of [-0.4, 0.4])
          B.box(w * 0.06, h * s * 0.9, 0.002, '#b8ad9a', x + k * w, yy + (h * s) / 2, z - w / 2 - 0.001);
        yy += h * s;
        w *= 0.78;
      });
      B.cone(w * 0.6, w * 0.12, 0.14 * s, '#d9b45c', x, yy + 0.07 * s, z, 'metal', 4);
      B.cyl(0.006 * s, 0.2 * s, '#d9b45c', x, yy + 0.2 * s, z, 'metal', 5);
      B.sph(0.014 * s, '#fff4d6', x, yy + 0.31 * s, z, 1, 1, 1, 'lamp', 6);
    }

    _decor(root) {
      this._rug(root, 3.6, -1.6, 15.6, 9.6, '#efdcc0', '#d9a066', 'diamonds'); // team area
      this._rug(root, -8.2, -5.2, 7.2, 7.4, '#e7d2b4', '#c9845a', 'kilim'); // owner + CEO
      this._rug(root, 11.4, 6.6, 6.6, 6.6, '#cfe0d4', '#3fb6a8', 'rings', true); // meeting corner
      this._rug(root, -9.5, 7.6, 6.4, 4.2, '#f2cf9a', '#e8604c', 'stripes'); // sofa corner
      this._rug(root, -11.6, -9.0, 5.6, 1.1, '#e9e1d2', '#26324d', 'stripes'); // kitchenette runner
      this._rug(root, -5.4, 5.0, 3.6, 3.0, '#e4ecf0', '#26324d', 'diamonds'); // huddle booth
      this._brickWall(root);
      this._leftWall(root);
      this._backWall(root);
      this._kitchen(root);
      this._trophyCase(root);
      this._reception(root);
      this._meeting(root);
      this._huddle(root);
      this._boards(root);
      this._utility(root);
      this._corners(root);
      this._blinds(root);
      this._ceiling(root);
    }

    /* ---------- walls ---------- */
    _brickWall(root) {
      const S = this.S;
      // exposed brick accent on the whole left wall (above the peach wainscot)
      const bt = paint(1024, 512, ART.brick, [22 / 2.4, 4.3 / 1.2]);
      bt.t.anisotropy = 8;
      this._plane(root, bt.t, 22, 4.3, -15.84, 3.33, 0, Math.PI / 2, {
        roughness: 0.95,
        bumpMap: bt.t,
        bumpScale: 1.4,
      });
      S.box(0.12, 0.14, 22, '#2b2f38', -15.78, 5.5, 0, 0, 'satin'); // steel cornice
      S.box(0.05, 0.16, 22, '#26324d', -15.79, 0.08, 0, 0, 'satin'); // skirting
      S.box(0.1, 0.12, 22, '#26324d', 15.9, 0.06, 0, 0, 'satin');
      // conduit, junction boxes and a gooseneck light over the brick
      S.cyl(0.022, 22, '#7f8996', -15.74, 5.25, 0, 'metal', 8, Math.PI / 2);
      [-6.8, 3.9, 7.35].forEach(z => {
        S.cyl(0.022, 4.1, '#7f8996', -15.74, 3.2, z, 'metal', 8);
        S.box(0.08, 0.1, 0.1, '#7f8996', -15.74, 1.4, z, 0, 'metal');
      });
      for (let z = -10; z < 11; z += 2.2) S.box(0.04, 0.06, 0.1, '#5c6571', -15.75, 5.25, z, 0, 'metal');
      // wall sconces with emissive bulbs
      [
        [-3.7, 3.1],
        [7.0, 3.1],
      ].forEach(([z, y]) => {
        S.box(0.08, 0.2, 0.08, '#2b2f38', -15.72, y, z, 0, 'metal');
        S.cyl(0.015, 0.3, '#2b2f38', -15.62, y + 0.1, z, 'metal', 6, 0, Math.PI / 2);
        S.cone(0.12, 0.03, 0.12, '#2b2f38', -15.45, y + 0.12, z, 'metal', 12);
        S.sph(0.045, '#fff4d6', -15.45, y + 0.07, z, 1, 1, 1, 'lamp', 8);
      });
    }

    _leftWall(root) {
      const X = -15.8;
      this._framed(root, this._art('subway', 1.9, 1.4, 640), 1.9, 1.4, X, 3.6, -6.4, Math.PI / 2, '#2b2f38');
      this._framed(root, this._art('deco', 0.7, 1.0, 256), 0.7, 1.0, X, 3.4, -10.4, Math.PI / 2, '#d9b45c');
      this._framed(root, this._art('bridge', 2.0, 1.0, 640), 2.0, 1.0, X, 4.35, 5.6, Math.PI / 2, '#f4eee6');
      this._framed(root, this._art('cab', 0.9, 1.2, 360), 0.9, 1.2, X, 2.75, 8.85, Math.PI / 2, '#2b2f38');
      this._framed(root, this._art('skyline', 1.4, 0.9, 480), 1.4, 0.9, X, 2.6, 10.25, Math.PI / 2, '#b97e4e');
      this._pennant(root, X + 0.02, 4.95, -5.4, Math.PI / 2);
      this._pennant(root, X + 0.02, 4.85, -7.2, Math.PI / 2 + 0.08);
      // neon sign: invented text, lit like glass tubing
      const nt = paint(1024, 440, ART.neon).t;
      this.S.box(0.04, 1.6, 3.0, '#171b27', -15.82, 4.55, 9.4, 0, 'satin');
      const neon = this._plane(root, nt, 2.8, 1.2, X + 0.02, 4.55, 9.4, Math.PI / 2, {
        emissive: '#ffffff',
        emissiveMap: nt,
        emissiveIntensity: 0.9,
        transparent: true,
        depthWrite: false,
      });
      this.neon = neon;
      this.neonMat = neon.material;
      [-1, 1].forEach(k =>
        this.S.cyl(0.012, 0.25, '#2b2f38', -15.75, 4.55 + k * 0.6, 9.4 + k * 1.1, 'metal', 5, Math.PI / 2),
      );
      // wall TV with a live feed (drawn from what the agents are saying)
      this.tv = paint(640, 360, () => {});
      this._tvDraw();
      this.S.rbox(2.3, 1.34, 0.08, 0.03, '#171b22', X, 4.5, 2.2, Math.PI / 2, 'metal');
      const tvm = this._plane(root, this.tv.t, 2.2, 1.24, X + 0.045, 4.5, 2.2, Math.PI / 2, { map: this.tv.t });
      tvm.material = new THREE.MeshBasicMaterial({ map: this.tv.t, toneMapped: false });
      // plank of shelves for the TV soundbar
      this.S.box(0.12, 0.08, 1.4, '#2b2f38', -15.76, 3.78, 2.2, 0, 'metal');
      // ladder-back shelf leaning on the brick, with books and trailing plants
      this._ladderShelf(-15.45, 7.9);
    }

    _pennant(root, x, y, z, ry) {
      const t = paint(256, 128, ART.pennant).t;
      const m = this._plane(root, t, 0.9, 0.45, x, y, z, ry, {
        transparent: true,
        alphaTest: 0.3,
        side: THREE.DoubleSide,
      });
      return m;
    }

    _ladderShelf(x, z) {
      const S = this.S,
        w = 0.7,
        wood = '#c8a074',
        xr = y => x + 0.18 - (y - 1.1) * 0.224; // the rails lean back against the brick
      [-1, 1].forEach(s => S.box(0.04, 2.2, 0.04, wood, xr(1.1), 1.1, z + s * (w / 2), 0, 'satin', 0, 0.22));
      for (let i = 0; i < 5; i++) {
        const y = 0.35 + i * 0.42,
          d = 0.42 - i * 0.06,
          px = xr(y) - d / 2;
        S.box(d, 0.03, w, wood, px, y, z, 0, 'satin');
        if (this.mobile) continue;
        if (i % 2 === 0)
          this._plantB(
            S,
            i === 0 ? 'cactus' : i === 2 ? 'pothos' : 'succulent',
            px,
            y + 0.015,
            z,
            i === 2 ? 0.32 : 0.3,
            i === 0 ? 'terra' : 'white',
          );
        else this._bookRow(S, this._loc(px, z, Math.PI / 2), Math.PI / 2, -0.28, y + 0.015, 0.28, d * 0.8, 0.3);
      }
    }

    _backWall(root) {
      const S = this.S;
      // ledge below the content screen (kept from the design) with a skyscraper model, books and plants
      S.rbox(9.6, 0.8, 0.55, 0.05, '#f4eee6', 2.65, 0.4, -10.5, 0, 'satin');
      S.box(9.7, 0.05, 0.6, '#b97e4e', 2.65, 0.82, -10.5, 0, 'satin');
      for (let i = 0; i < 4; i++) S.box(0.04, 0.72, 0.01, '#d8d0c3', -0.4 + i * 3.0, 0.4, -10.22);
      this._plantB(S, 'bush', -1.6, 0.84, -10.45, 0.6);
      this._tower(S, 0.5, 0.85, -10.5, 0.7);
      this._bookRow(S, this._loc(0, -10.5, 0), 0, 1.6, 0.85, 3.2, 0.3, 0.34);
      S.box(0.5, 0.07, 0.36, '#3fb6a8', 3.8, 0.885, -10.5, 0.1);
      S.box(0.46, 0.07, 0.34, '#e8604c', 3.8, 0.955, -10.5, -0.12);
      S.box(0.4, 0.06, 0.3, '#f5b83d', 3.8, 1.02, -10.5, 0.2);
      for (let i = 0; i < 3; i++)
        S.cyl(0.05, 0.12, ['#fbfaf6', '#fbfaf6', '#2b6cb0'][i], 4.7 + i * 0.16, 0.9, -10.4, 'satin', 10);
      this._plantB(S, 'pothos', 5.5, 0.84, -10.45, 0.5, 'white');
      this._plantB(S, 'snake', 6.9, 0.84, -10.45, 0.6);
      this._plantB(S, 'orchid', 7.3, 0.84, -10.4, 0.5, 'white');
      // prints in the narrow wood strips either side of the screen + pennants
      this._framed(root, this._art('hustle', 0.62, 0.86, 256), 0.62, 0.86, -2.125, 3.35, -10.8, 0, '#2b2f38');
      this._framed(root, this._art('nymap', 0.62, 0.86, 256), 0.62, 0.86, 7.425, 3.35, -10.8, 0, '#d9b45c');
      this._pennant(root, -2.12, 5.0, -10.8, 0);
      this._pennant(root, 7.42, 5.0, -10.8, 0);
      // a floating wood shelf on the strip for a model cab
      S.box(0.7, 0.04, 0.2, '#b97e4e', -2.125, 2.4, -10.7, 0, 'satin');
      S.rbox(0.28, 0.07, 0.12, 0.03, NY.cab, -2.125, 2.46, -10.7, 0, 'satin');
      S.rbox(0.14, 0.06, 0.1, 0.03, '#bfe3ff', -2.125, 2.52, -10.7, 0, 'satin');
      S.box(0.5, 0.04, 0.2, '#b97e4e', 7.425, 2.4, -10.7, 0, 'satin');
      this._plantB(S, 'succulent', 7.425, 2.42, -10.7, 0.3, 'white');
      // frosted brand band on the glass + a high steel rail with a pendant track
      const dt = paint(1024, 96, (g, W, H) => {
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,.35)';
        for (let x = 0; x < W; x += 8) g.fillRect(x, 0, 2, H);
        g.fillStyle = '#26324d';
        g.font = '800 54px "Space Grotesk", sans-serif';
        g.textBaseline = 'middle';
        g.fillText('FAST SALES  ·  NEW YORK HQ', 40, H / 2 + 2);
        g.fillStyle = '#e8604c';
        g.beginPath();
        g.arc(W - 70, H / 2, 26, 0, 7);
        g.fill();
        g.fillStyle = '#fff';
        g.font = '800 26px "Space Grotesk", sans-serif';
        g.fillText('FS', W - 87, H / 2 + 2);
      }).t;
      this._plane(root, dt, 4.8, 0.45, -8.0, 1.4, -10.97, 0, {
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this._plane(root, dt, 4.8, 0.45, 12.4, 1.4, -10.97, 0, {
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      // balustrade decal on the right
      this._plane(root, dt, 4.8, 0.45, 15.96, 0.62, 7.0, -Math.PI / 2, {
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }

    _blinds(root) {
      const tex = (this._blindT ||= paint(64, 128, ART.slats, [1, 6]).t);
      // roller-and-slat blinds half lowered on a few bays of the glass back wall
      [
        [-13.32, -10.64, 2.4],
        [-7.96, -5.28, 1.6],
        [10.6, 13.3, 2.0],
        [-16 + 0.0, -13.32, 0.9],
      ].forEach(([x0, x1, drop]) => {
        const w = x1 - x0 - 0.16,
          cx = (x0 + x1) / 2;
        const m = this._plane(root, tex, w, drop, cx, 5.9 - drop / 2, -10.86, 0, {
          transparent: true,
          alphaTest: 0.4,
          side: THREE.DoubleSide,
          roughness: 0.6,
        });
        m.material.map = tex.clone();
        m.material.map.repeat.set(1, drop * 3);
        m.material.map.needsUpdate = true;
        this.S.box(w, 0.04, 0.06, '#d8d0c3', cx, 5.9 - drop, -10.86, 0, 'satin');
        this.S.box(w, 0.1, 0.08, '#efe7da', cx, 5.9, -10.86, 0, 'satin');
        this.S.cyl(0.008, 1.1, '#cfc7b8', cx + w / 2 - 0.1, 5.9 - drop - 0.45, -10.84, 'satin', 4);
      });
    }

    /* ---------- kitchenette: fridge, counter with espresso, sink, bins ---------- */
    _kitchen(root) {
      const S = this.S,
        hi = !this.mobile;
      S.rbox(0.9, 1.9, 0.8, 0.05, '#e9ecef', -15.3, 0.95, -10.45, 0, 'satin');
      S.box(0.88, 0.012, 0.01, '#9aa3b2', -15.3, 1.25, -10.04); // freezer split
      S.box(0.03, 0.55, 0.04, '#9aa3b2', -14.9, 1.55, -10.02, 0, 'metal');
      S.box(0.03, 0.8, 0.04, '#9aa3b2', -14.9, 0.7, -10.02, 0, 'metal');
      ['#e8604c', '#f5b83d', '#3fb6a8', '#5aa6e0'].forEach((c, i) =>
        S.box(0.05, 0.05, 0.012, c, -15.55 + (i % 2) * 0.1, 1.7 - Math.floor(i / 2) * 0.08, -10.034 + 0.0, 0.2 * i),
      );
      S.box(0.18, 0.24, 0.004, '#fbfaf6', -15.45, 1.5, -10.04, 0.05); // list on the door
      // counter + doors
      S.rbox(3.4, 0.95, 0.75, 0.05, '#f4eee6', -12.3, 0.475, -10.25, 0, 'satin');
      for (let i = 0; i < 4; i++) {
        S.box(0.8, 0.8, 0.012, '#fbf7ef', -13.45 + i * 0.85, 0.47, -9.88, 0, 'satin');
        S.box(0.02, 0.18, 0.025, '#2b2f38', -13.45 + i * 0.85 + (i % 2 ? -0.32 : 0.32), 0.7, -9.86, 0, 'metal');
      }
      S.box(3.5, 0.06, 0.8, '#b97e4e', -12.3, 0.98, -10.25, 0, 'satin');
      // espresso machine, grinder, kettle, canisters, cups
      S.rbox(0.56, 0.46, 0.4, 0.05, '#2b2f38', -13.3, 1.24, -10.3, 0, 'metal');
      S.box(0.5, 0.05, 0.36, '#d7dbe0', -13.3, 1.49, -10.3, 0, 'metal');
      S.box(0.46, 0.02, 0.2, '#5c6571', -13.3, 1.03, -10.1, 0, 'metal');
      S.cyl(0.03, 0.06, '#d7dbe0', -13.45, 1.18, -10.1, 'metal', 8);
      S.cyl(0.03, 0.06, '#d7dbe0', -13.15, 1.18, -10.1, 'metal', 8);
      S.cyl(0.04, 0.012, '#c0392b', -13.3, 1.36, -10.095, 'matte', 10, Math.PI / 2);
      S.rbox(0.18, 0.34, 0.2, 0.04, '#171b22', -12.82, 1.17, -10.35, 0, 'metal');
      S.cone(0.1, 0.06, 0.1, '#171b22', -12.82, 1.4, -10.35, 'metal', 10);
      S.cyl(0.1, 0.18, '#e8604c', -12.4, 1.1, -10.4, 'satin', 12); // kettle
      S.cone(0.1, 0.06, 0.06, '#e8604c', -12.4, 1.22, -10.4, 'satin', 12);
      S.tor(0.08, 0.012, '#2b2f38', -12.3, 1.12, -10.4, 0, 1.4, 0, 'matte', 10, Math.PI);
      for (let i = 0; i < 3; i++) {
        S.cyl(0.07, 0.2, '#e4ebef', -11.9 + i * 0.17, 1.1, -10.5, 'satin', 10);
        S.cyl(0.072, 0.03, i === 1 ? '#3fb6a8' : '#e8604c', -11.9 + i * 0.17, 1.21, -10.5, 'satin', 10);
      }
      // NYC-style paper cups: stack, tray and a couple of lids
      this._cupStack(S, -12.9, 1.01, -10.0, 6);
      this._cupStack(S, -12.72, 1.01, -9.98, 4);
      S.rbox(0.4, 0.025, 0.24, 0.01, '#d9b45c', -12.1, 1.025, -10.05, 0.05, 'metal');
      for (let i = 0; i < 3; i++) this._cup(S, -12.22 + i * 0.12, 1.04, -10.05, i === 1);
      // fruit bowl (design) + a mixed herb trio
      S.put(
        GEO('bowl', () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)),
        '#f6c445',
        -11.2,
        1.2,
        -10.25,
        0.22,
        0.22,
        0.22,
        0,
        0,
        0,
        'satin',
      );
      [0, 1, 2].forEach(i =>
        S.sph(
          0.08,
          ['#e8604c', '#7cc36b', '#f29c38'][i],
          -11.28 + i * 0.09,
          1.13 + 0.01 * i,
          -10.25 + (i - 1) * 0.05,
          1,
          1,
          1,
          'satin',
          10,
        ),
      );
      // sink with tap, rack and towel
      S.rbox(1.8, 0.95, 0.75, 0.05, '#2b3a55', -9.65, 0.475, -10.25, 0, 'satin');
      for (let i = 0; i < 2; i++) S.box(0.8, 0.8, 0.012, '#344665', -10.05 + i * 0.85, 0.47, -9.88, 0, 'satin');
      S.box(1.9, 0.05, 0.82, '#c9ced6', -9.65, 0.98, -10.25, 0, 'metal');
      S.box(0.55, 0.012, 0.4, '#8f99a6', -9.95, 1.012, -10.25, 0, 'metal');
      S.cyl(0.018, 0.34, '#d7dbe0', -9.95, 1.18, -10.5, 'metal', 8);
      S.tor(0.07, 0.013, '#d7dbe0', -9.95, 1.35, -10.43, 0, Math.PI / 2, 0, 'metal', 10, Math.PI);
      S.cyl(0.012, 0.07, '#d7dbe0', -9.95, 1.32, -10.36, 'metal', 6);
      if (hi) {
        S.box(0.34, 0.03, 0.22, '#aab2be', -9.2, 1.025, -10.3, 0, 'metal');
        for (let i = 0; i < 4; i++) S.box(0.012, 0.1, 0.2, '#aab2be', -9.34 + i * 0.09, 1.07, -10.3, 0, 'metal');
        S.cyl(0.035, 0.2, '#4fe3a8', -9.35, 1.1, -10.55, 'satin', 8); // soap
        S.box(0.3, 0.4, 0.012, '#e8604c', -9.95, 0.5, -9.862, 0, 'satin'); // towel
        S.rbox(0.5, 0.28, 0.4, 0.03, '#e9ecef', -11.0, 1.16, -10.35, 0, 'satin'); // microwave
        S.box(0.3, 0.2, 0.01, '#16181d', -11.05, 1.16, -10.14, 0, 'matte');
      }
      // recycling + trash bins
      S.cyl(0.2, 0.55, '#3a73c9', -8.4, 0.28, -10.3, 'satin', 14);
      S.cyl(0.215, 0.04, '#2b5aa0', -8.4, 0.57, -10.3, 'satin', 14);
      S.cyl(0.2, 0.55, '#3a3f4d', -7.95, 0.28, -10.3, 'satin', 14);
      S.cyl(0.215, 0.04, '#2b2f38', -7.95, 0.57, -10.3, 'satin', 14);
    }

    _cup(B, x, y, z, lid = false) {
      B.cone(0.036, 0.05, 0.11, '#fbfaf6', x, y + 0.055, z, 'satin', 12);
      B.cone(0.0385, 0.0437, 0.04, '#2b6cb0', x, y + 0.04, z, 'satin', 12);
      B.cone(0.0447, 0.0455, 0.012, '#f7c320', x, y + 0.07, z, 'satin', 12);
      if (lid) B.cyl(0.05, 0.014, '#3a2c24', x, y + 0.117, z, 'matte', 12);
    }
    _cupStack(B, x, y, z, n) {
      for (let i = 0; i < n; i++) B.cone(0.04, 0.05, 0.07, '#fbfaf6', x, y + 0.035 + i * 0.045, z, 'satin', 12);
      B.cone(0.0455, 0.0485, 0.012, '#2b6cb0', x, y + 0.06, z, 'satin', 12);
    }

    /* ---------- trophy and awards case with the sales cup ---------- */
    _trophyCase(root) {
      const S = this.S,
        hi = !this.mobile,
        z0 = 2.2,
        rot = Math.PI / 2,
        L = this._loc(-15.55, z0, rot);
      const P = (lx, ly, lz) => L(lx, ly, lz);
      const B = (w, h, d, c, lx, ly, lz, bk = 'satin') => S.box(w, h, d, c, ...P(lx, ly, lz), rot, bk);
      B(2.6, 0.82, 0.5, '#f4eee6', 0, 0.41, 0);
      B(2.7, 0.05, 0.56, '#b97e4e', 0, 0.845, 0.02);
      for (let i = 0; i < 3; i++) B(0.8, 0.7, 0.012, '#fbf7ef', -0.86 + i * 0.86, 0.4, 0.256);
      for (const x of [-1.3, 1.3]) B(0.05, 1.7, 0.5, '#2b2f38', x, 1.7, 0, 'metal');
      B(2.65, 0.06, 0.5, '#2b2f38', 0, 2.57, 0, 'metal');
      B(2.6, 1.7, 0.03, '#1d2a4a', 0, 1.7, -0.23); // navy felt back
      [1.25, 1.75].forEach(y => B(2.55, 0.025, 0.46, '#cfe3ec', 0, y, 0));
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(2.55, 1.7),
        new THREE.MeshStandardMaterial({
          color: '#cfe8f5',
          transparent: true,
          opacity: 0.1,
          roughness: 0.05,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const gp = P(0, 1.7, 0.25);
      glass.position.set(gp[0], gp[1], gp[2]);
      glass.rotation.y = rot;
      root.add(glass);
      const gold = '#e0b84a';
      // the big sales cup on the middle shelf
      const cup = (lx, ly, k = 1, c = gold) => {
        const q = P(lx, ly, 0);
        S.cyl(0.11 * k, 0.03 * k, '#2b2f38', q[0], q[1] + 0.015 * k, q[2], 'metal', 12);
        S.cyl(0.07 * k, 0.02 * k, c, q[0], q[1] + 0.05 * k, q[2], 'metal', 12);
        S.cyl(0.02 * k, 0.16 * k, c, q[0], q[1] + 0.14 * k, q[2], 'metal', 8);
        S.cone(0.06 * k, 0.15 * k, 0.26 * k, c, q[0], q[1] + 0.35 * k, q[2], 'metal', 16);
        [-1, 1].forEach(s => {
          const hp = P(lx + s * 0.1 * k, ly + 0.33 * k, 0);
          S.tor(0.07 * k, 0.012 * k, c, hp[0], hp[1], hp[2], 0, rot, 0, 'metal', 10);
        });
      };
      cup(0, 1.25, 1.55);
      cup(-0.75, 1.25, 0.8, '#c9ced6');
      cup(0.75, 1.25, 0.8, '#c98a4b');
      // lower shelf: small trophies, a star, medals
      cup(-0.95, 0.85, 0.6);
      cup(0.95, 0.85, 0.6, '#c9ced6');
      if (hi) {
        const q = P(0.1, 0.85, 0);
        S.cone(0.08, 0.01, 0.1, '#2b2f38', q[0], q[1] + 0.05, q[2], 'metal', 4);
        S.sph(0.1, gold, q[0], q[1] + 0.22, q[2], 1, 1, 0.3, 'metal', 5);
        for (let i = 0; i < 4; i++) {
          const m = P(-0.4 + i * 0.15, 1.72, 0.2);
          S.box(0.02, 0.1, 0.004, ['#e8604c', '#3fb6a8', '#5aa6e0', '#f5b83d'][i], m[0], m[1], m[2], rot);
          S.cyl(0.04, 0.008, gold, m[0], m[1] - 0.07, m[2], 'metal', 12, Math.PI / 2, 0, 0, rot);
        }
        // framed certificates + a brass plaque row on the felt
        const f1 = P(-0.7, 2.2, -0.2);
        S.box(0.5, 0.36, 0.02, '#b97e4e', f1[0], f1[1], f1[2], rot);
        S.box(0.44, 0.3, 0.022, '#f6f1e6', f1[0], f1[1], f1[2], rot);
        const f2 = P(0.0, 2.2, -0.2);
        S.box(0.5, 0.36, 0.02, '#2b2f38', f2[0], f2[1], f2[2], rot);
        S.box(0.44, 0.3, 0.022, '#f6f1e6', f2[0], f2[1], f2[2], rot);
        const cert = paint(256, 180, (g, W, H) => {
          g.fillStyle = '#fbf6e8';
          g.fillRect(0, 0, W, H);
          g.strokeStyle = '#c9a24b';
          g.lineWidth = 8;
          g.strokeRect(8, 8, W - 16, H - 16);
          g.fillStyle = '#26324d';
          g.font = '800 22px "Space Grotesk", sans-serif';
          g.textAlign = 'center';
          g.fillText('TOP CLOSER', W / 2, 52);
          g.fillRect(40, 70, W - 80, 4);
          g.fillRect(60, 88, W - 120, 4);
          g.fillRect(60, 104, W - 120, 4);
          g.fillStyle = '#c0392b';
          g.beginPath();
          g.arc(W / 2, 140, 17, 0, 7);
          g.fill();
        }).t;
        [f1, f2].forEach(f => {
          const q = P(f === f1 ? -0.7 : 0.0, 2.2, -0.2 + 0.014);
          this._plane(root, cert, 0.4, 0.28, q[0], q[1], q[2], rot);
        });
        for (let i = 0; i < 3; i++) {
          const pl = P(0.65 + (i % 2) * 0.0, 2.35 - i * 0.12, -0.2);
          S.box(0.46, 0.08, 0.02, gold, pl[0], pl[1], pl[2], rot, 'metal');
        }
        // a stack of award ribbons (rosettes) on the top shelf
        for (let i = 0; i < 3; i++) {
          const rz = P(-1.0 + i * 0.22, 1.82, 0.12);
          S.cyl(
            0.05,
            0.015,
            ['#e8604c', '#5aa6e0', '#f5b83d'][i],
            rz[0],
            rz[1],
            rz[2],
            'satin',
            12,
            Math.PI / 2,
            0,
            0,
            rot,
          );
        }
      }
      // brass plate and a spotlight strip along the top
      const pt = paint(512, 96, (g, W, H) => {
        g.fillStyle = '#d9b45c';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#4a3a12';
        g.font = '800 42px "Space Grotesk", sans-serif';
        g.textAlign = 'center';
        g.fillText('THE SALES CUP', W / 2, 46);
        g.font = '600 24px Inter, sans-serif';
        g.fillText('FAST SALES · NEW YORK', W / 2, 78);
      }).t;
      const pp = P(0, 0.62, 0.262);
      this._plane(root, pt, 0.9, 0.17, pp[0], pp[1], pp[2], rot);
      const sp = P(0, 2.52, 0.12);
      S.box(2.3, 0.025, 0.05, '#fff4d6', sp[0], sp[1], sp[2], rot, 'lamp');
    }

    /* ---------- reception: desk with a sign, slatted backdrop, checker floor, coat rack, sofa corner ---------- */
    _reception(root) {
      const S = this.S,
        hi = !this.mobile,
        cx = -3.0,
        cz = 8.9;
      // black-and-white tile under the front door area
      const ct = paint(512, 384, ART.checker, [1, 1]).t;
      const tile = new THREE.Mesh(
        new THREE.PlaneGeometry(6.4, 4.8),
        new THREE.MeshStandardMaterial({ map: ct, roughness: 0.35, metalness: 0.05 }),
      );
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(cx, 0.008, 9.2);
      tile.receiveShadow = true;
      root.add(tile);
      // slatted backdrop with the brand
      const bz = 7.0;
      S.box(4.6, 2.5, 0.05, '#1f2a44', cx, 1.25, bz - 0.04, 0, 'satin');
      for (let i = 0; i < 36; i++)
        S.box(0.085, 2.46, 0.05, i % 3 ? '#b97e4e' : '#a56d41', cx - 2.2 + i * 0.125, 1.25, bz, 0, 'satin');
      S.box(4.7, 0.06, 0.12, '#2b2f38', cx, 2.52, bz, 0, 'metal');
      S.box(3.8, 1.05, 0.02, '#12182b', cx, 1.65, bz + 0.03, 0, 'satin');
      const bt = paint(768, 200, (g, W, H) => {
        g.clearRect(0, 0, W, H);
        g.fillStyle = '#f0d58a';
        g.textAlign = 'center';
        g.font = '800 104px "Space Grotesk", sans-serif';
        g.fillText('FAST SALES', W / 2, 108);
        g.fillStyle = '#ffffff';
        g.font = '700 38px "Space Grotesk", sans-serif';
        g.fillText('N E W   Y O R K   ·   H E A D Q U A R T E R S', W / 2, 168);
      }).t;
      const sign = this._plane(root, bt, 3.4, 0.89, cx, 1.65, bz + 0.045, 0, {
        transparent: true,
        emissive: '#ffffff',
        emissiveMap: bt,
        emissiveIntensity: 0.3,
        roughness: 0.5,
      });
      this.lampMats.push(sign.material);
      // the desk: navy body, wood top, raised visitor ledge, lit fascia sign
      S.rbox(4.0, 1.0, 0.8, 0.04, '#1f2a44', cx, 0.5, cz, 0, 'satin');
      for (let i = 0; i < 14; i++) S.box(0.04, 0.9, 0.02, '#2b3a5c', cx - 1.82 + i * 0.28, 0.5, cz + 0.405, 0, 'satin');
      S.box(4.15, 0.06, 0.95, '#b97e4e', cx, 1.03, cz, 0, 'satin');
      S.box(4.15, 0.12, 0.26, '#c88a58', cx, 1.12, cz + 0.33, 0, 'satin');
      S.box(0.05, 1.1, 0.8, '#1f2a44', cx - 2.05, 0.55, cz - 0.4, 0, 'satin'); // return panel
      const fs = paint(640, 100, (g, W, H) => {
        g.fillStyle = '#12182b';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#f5b83d';
        g.textAlign = 'center';
        g.font = '800 54px "Space Grotesk", sans-serif';
        g.fillText('WELCOME · CHECK IN HERE', W / 2, 66);
      }).t;
      const fsm = this._plane(root, fs, 2.8, 0.44, cx, 0.52, cz + 0.416, 0, {
        emissive: '#ffffff',
        emissiveMap: fs,
        emissiveIntensity: 0.3,
      });
      this.lampMats.push(fsm.material);
      // things on the desk
      S.rbox(0.62, 0.38, 0.04, 0.02, '#1c2028', cx - 0.6, 1.4, cz - 0.1, 0.1, 'metal'); // monitor (back to the camera)
      S.cyl(0.03, 0.3, '#2b2f38', cx - 0.6, 1.2, cz - 0.1, 'metal', 8);
      S.rbox(0.17, 0.02, 0.24, 0.01, '#d7dbe0', cx + 0.7, 1.16, cz + 0.33, 0, 'metal'); // visitor tablet stand
      S.rbox(0.2, 0.15, 0.015, 0.01, '#16181d', cx + 0.7, 1.26, cz + 0.28, 0, 'matte', -0.3);
      S.cyl(0.05, 0.03, '#d9b45c', cx + 1.2, 1.2, cz + 0.33, 'metal', 14); // bell
      S.sph(0.05, '#d9b45c', cx + 1.2, 1.22, cz + 0.33, 1, 0.8, 1, 'metal', 12);
      S.box(0.3, 0.04, 0.22, '#e8604c', cx - 1.3, 1.07, cz + 0.2, 0.2);
      S.box(0.28, 0.04, 0.2, '#fbfaf6', cx - 1.3, 1.11, cz + 0.2, -0.1);
      this._tower(S, cx - 1.7, 1.06, cz - 0.1, 0.35);
      this._plantB(S, 'orchid', cx + 1.7, 1.06, cz - 0.1, 0.55, 'white');
      this._plantB(S, 'succulent', cx + 1.0, 1.06, cz - 0.15, 0.4, 'white');
      this._cup(S, cx - 0.2, 1.06, cz + 0.2, true);
      this._cup(S, cx - 0.05, 1.06, cz + 0.28);
      if (hi) {
        // brochure rack, pen cup, small flag
        S.box(0.26, 0.04, 0.12, '#cfe3ec', cx + 0.15, 1.07, cz + 0.3, 0.1, 'satin');
        for (let i = 0; i < 3; i++)
          S.box(
            0.24,
            0.1,
            0.012,
            ['#f5b83d', '#3fb6a8', '#e8604c'][i],
            cx + 0.15,
            1.12 + i * 0.07,
            cz + 0.28 - i * 0.02,
            0.1,
            'satin',
            -0.25,
          );
        S.cyl(0.015, 0.4, '#d7dbe0', cx - 1.95, 1.25, cz - 0.3, 'metal', 6);
        S.box(0.2, 0.12, 0.004, '#e8604c', cx - 1.86, 1.4, cz - 0.3, 0, 'satin');
        S.rbox(0.14, 0.03, 0.1, 0.01, '#2b2f38', cx + 0.5, 1.07, cz - 0.1, 0.4, 'satin');
      }
      // receptionist's chair
      this._chair(root, cx, 7.8, Math.PI, '#26324d');
      // coat rack, umbrella stand and a rolling suitcase by the door
      this._coatRack(S, 0.2, 7.3);
      S.cyl(0.15, 0.55, '#3a3f4d', 0.2, 0.28, 8.8, 'matte', 12);
      for (let i = 0; i < 3; i++)
        S.cyl(
          0.012,
          0.8,
          ['#e8604c', '#26324d', '#2f7a55'][i],
          0.2 + (i - 1) * 0.06,
          0.8,
          8.8,
          'matte',
          5,
          0,
          (i - 1) * 0.12,
        );
      S.rbox(0.38, 0.55, 0.2, 0.04, '#3fb6a8', 0.9, 0.34, 10.6, 0.4, 'satin');
      S.box(0.04, 0.5, 0.04, '#2b2f38', 0.84, 0.75, 10.6, 0.4, 'metal');
      // sofa corner: tufted mustard sofa with cushions and a throw
      const sofaC = '#e2a63b';
      S.rbox(3.6, 0.5, 1.1, 0.15, sofaC, -9.5, 0.35, 8.4, 0, 'matte');
      S.rbox(3.6, 0.9, 0.32, 0.14, sofaC, -9.5, 0.85, 8.85, 0, 'matte');
      [-1, 1].forEach(s => S.rbox(0.32, 0.75, 1.1, 0.12, sofaC, -9.5 + s * 1.75, 0.5, 8.4, 0, 'matte'));
      [-1.0, 0, 1.0].forEach(x => {
        S.rbox(1.0, 0.16, 0.9, 0.06, '#eab04c', -9.5 + x, 0.65, 8.35, 0, 'matte');
        S.box(0.02, 0.18, 0.3, '#c78d28', -9.5 + x + 0.5, 0.58, 8.5);
      });
      for (let i = 0; i < 6; i++) S.sph(0.025, '#a77a1e', -10.2 + i * 0.28, 1.0, 8.68, 1, 1, 1, 'satin', 6);
      [
        [-0.95, '#3fb6a8', 0.1],
        [0.9, '#e8604c', -0.12],
        [0.5, '#26324d', 0.2],
        [-0.45, '#f5f0e6', -0.2],
      ].forEach(([x, c, r], i) => {
        S.rbox(0.56, 0.5, 0.15, 0.07, c, -9.5 + x, 0.9, 8.6 - (i > 1 ? 0.05 : 0), r, 'matte', -0.25);
      });
      S.box(0.9, 0.04, 0.45, '#e8ecf2', -8.55, 0.62, 8.1, 0.3, 'matte'); // throw
      S.box(0.9, 0.02, 0.4, '#c9845a', -8.55, 0.645, 8.1, 0.3, 'matte');
      // coffee table with books, a plant and a tray
      S.cyl(0.75, 0.06, '#b97e4e', -9.5, 0.45, 6.9, 'satin', 32);
      S.cone(0.2, 0.08, 0.42, '#2b2f38', -9.5, 0.21, 6.9, 'satin', 12);
      S.cyl(0.35, 0.02, '#2b2f38', -9.5, 0.01, 6.9, 'metal', 14);
      [0, 1, 2].forEach(i =>
        S.box(
          0.5,
          0.07,
          0.36,
          BOOK_COLORS[(i * 3 + 1) % BOOK_COLORS.length],
          -9.6,
          0.515 + i * 0.07,
          6.9,
          (rnd() - 0.5) * 0.4,
        ),
      );
      S.box(0.36, 0.015, 0.26, '#fbfaf6', -9.1, 0.49, 7.1, 0.5, 'matte');
      this._plantB(S, 'succulent', -9.62, 0.72, 6.9, 0.3, 'white');
      this._cup(S, -9.1, 0.48, 6.7, true);
      this._cup(S, -9.3, 0.48, 6.6);
      // side table + floor lamps + tall plants
      S.cyl(0.3, 0.04, '#26324d', -11.55, 0.56, 8.5, 'satin', 16);
      S.cyl(0.03, 0.54, '#2b2f38', -11.55, 0.27, 8.5, 'metal', 8);
      this._plantB(S, 'cactus', -11.55, 0.58, 8.5, 0.4, 'terra');
      this._floorLamp(S, -12.3, 8.9);
      this._floorLamp(S, 14.6, 8.0);
      this._plantB(S, 'fiddle', -12.8, 0, 9.9, 1.0, 'white');
      this._plantB(S, 'monstera', -14.7, 0, 10.2, 1.1, 'basket');
      this._plantB(S, 'palm', 15.1, 0, 10.2, 1.2);
      this._plantB(S, 'palm', 15.1, 0, -10.2, 1.2);
      this._plantB(S, 'bush', -12.6, 0, 6.0, 0.8, 'concrete');
      this._plantB(S, 'snake', 15.1, 0, 2.9, 0.9, 'navy');
      this._plantB(S, 'bush', -15.1, 0, 0.9, 0.8, 'terra');
      this._plantB(S, 'olive', 0.6, 0, 6.2, 0.9, 'concrete');
    }

    _coatRack(B, x, z) {
      B.cyl(0.18, 0.04, '#2b2f38', x, 0.02, z, 'metal', 12);
      B.cyl(0.02, 1.75, '#2b2f38', x, 0.9, z, 'metal', 6);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * 6.28;
        B.cyl(
          0.012,
          0.18,
          '#d9b45c',
          x + Math.cos(a) * 0.08,
          1.7,
          z + Math.sin(a) * 0.08,
          'metal',
          5,
          Math.sin(a) * 1,
          Math.cos(a) * -1,
        );
      }
      // a trench coat and a fedora hanging up
      B.rbox(0.36, 0.8, 0.14, 0.05, '#b89a6a', x + 0.1, 1.28, z + 0.12, 0.3, 'matte');
      B.box(0.1, 0.6, 0.02, '#8a6f45', x + 0.1, 1.2, z + 0.2, 0.3);
      B.cone(0.17, 0.16, 0.012, '#5a4a3a', x - 0.12, 1.82, z - 0.04, 'matte', 14);
      B.cyl(0.11, 0.12, '#5a4a3a', x - 0.12, 1.88, z - 0.04, 'matte', 12);
      B.cyl(0.113, 0.03, '#26324d', x - 0.12, 1.86, z - 0.04, 'matte', 12);
    }

    _floorLamp(B, x, z) {
      B.cyl(0.25, 0.05, '#2b2f38', x, 0.025, z, 'metal', 20);
      B.cyl(0.025, 1.8, '#2b2f38', x, 0.9, z, 'metal', 8);
      B.cone(0.38, 0.22, 0.42, '#f7e0b8', x, 1.95, z, 'lamp', 24);
      B.sph(0.1, '#fff4d6', x, 1.85, z, 1, 1, 1, 'lamp', 10);
    }

    /* ---------- meeting corner ---------- */
    _meeting(root) {
      const S = this.S,
        hi = !this.mobile,
        tx = 11.4,
        tz = 6.6;
      S.cyl(1.3, 0.08, '#b97e4e', tx, 0.78, tz, 'satin', 48);
      S.cyl(1.32, 0.03, '#8a5a36', tx, 0.74, tz, 'satin', 48);
      S.cone(0.35, 0.1, 0.78, '#2b2f38', tx, 0.39, tz, 'satin', 16);
      S.cyl(0.5, 0.03, '#2b2f38', tx, 0.015, tz, 'metal', 20);
      for (let i = 0; i < 4; i++)
        this._chair(
          root,
          tx + Math.cos((i * Math.PI) / 2 + 0.6) * 1.9,
          tz + Math.sin((i * Math.PI) / 2 + 0.6) * 1.9,
          -((i * Math.PI) / 2 + 0.6) - Math.PI / 2,
          '#3fb6a8',
        );
      this._laptopB(S, 11.0, 0.82, 6.3, 0.6, '#d7dbe0');
      this._plantB(S, 'bush', 11.6, 0.82, 6.9, 0.35);
      // notebooks, a pen, a speaker puck, cups, a water carafe
      [
        [0, '#e8604c'],
        [1.6, '#f5b83d'],
        [3.1, '#26324d'],
      ].forEach(([a, c], i) => {
        const px = tx + Math.cos(a + 0.5) * 0.85,
          pz = tz + Math.sin(a + 0.5) * 0.85;
        S.box(0.22, 0.02, 0.3, c, px, 0.83, pz, -a, 'satin');
        S.box(0.2, 0.012, 0.28, '#fbfaf6', px, 0.845, pz, -a + 0.1);
        this._cup(S, px + 0.2, 0.82, pz + 0.1, i === 1);
      });
      S.cyl(0.12, 0.04, '#2b2f38', tx, 0.84, tz, 'satin', 16);
      S.tor(0.1, 0.006, '#4fe3ff', tx, 0.865, tz, Math.PI / 2, 0, 0, 'lamp', 20);
      S.cyl(0.07, 0.22, '#cfe8f5', tx + 0.5, 0.93, tz - 0.4, 'satin', 12);
      S.cyl(0.04, 0.12, '#cfe8f5', tx + 0.5, 1.1, tz - 0.4, 'satin', 10);
      if (hi) {
        // a flip chart easel beside the table
        const ex = 8.8,
          ez = 8.8;
        [-1, 0, 1].forEach(k =>
          S.cyl(0.014, 1.9, '#2b2f38', ex + k * 0.42, 0.95, ez + (k === 0 ? 0.2 : -0.12), 'metal', 6, k * 0.12),
        );
        S.box(0.8, 0.9, 0.025, '#fbfaf6', ex, 1.35, ez - 0.1, 0.2, 'matte');
        S.box(0.84, 0.04, 0.05, '#2b2f38', ex, 0.88, ez - 0.05, 0.2, 'metal');
        S.box(0.5, 0.03, 0.01, '#e8604c', ex, 1.55, ez - 0.085, 0.2);
        S.box(0.42, 0.03, 0.01, '#3fb6a8', ex, 1.45, ez - 0.085, 0.2);
        S.box(0.55, 0.03, 0.01, '#26324d', ex, 1.35, ez - 0.085, 0.2);
      }
    }

    /* ---------- huddle booth ---------- */
    _huddle(root) {
      const S = this.S,
        cx = -5.4,
        cz = 4.9;
      const felt = '#26324d',
        seat = '#3fb6a8',
        wood = '#b97e4e';
      // U of benches around a small table with slatted, low walls
      S.rbox(2.8, 0.4, 0.55, 0.08, seat, cx, 0.2, cz - 0.95, 0, 'matte');
      S.rbox(0.55, 0.4, 1.6, 0.08, seat, cx - 1.4, 0.2, cz - 0.15, 0, 'matte');
      S.rbox(0.55, 0.4, 1.6, 0.08, seat, cx + 1.4, 0.2, cz - 0.15, 0, 'matte');
      S.box(2.9, 1.5, 0.08, felt, cx, 0.95, cz - 1.28, 0, 'matte');
      S.box(0.08, 1.4, 1.9, felt, cx - 1.72, 0.9, cz - 0.28, 0, 'matte');
      S.box(0.08, 1.4, 1.9, felt, cx + 1.72, 0.9, cz - 0.28, 0, 'matte');
      for (let i = 0; i < 20; i++)
        S.box(0.07, 1.4, 0.05, i % 2 ? wood : '#a56d41', cx - 1.4 + i * 0.147, 0.95, cz - 1.34, 0, 'satin');
      for (let k = 0; k < 7; k++) {
        S.box(0.05, 1.3, 0.07, wood, cx - 1.78, 0.9, cz - 1.2 + k * 0.28, 0, 'satin');
        S.box(0.05, 1.3, 0.07, wood, cx + 1.78, 0.9, cz - 1.2 + k * 0.28, 0, 'satin');
      }
      S.box(2.9, 0.05, 0.1, wood, cx, 1.7, cz - 1.28, 0, 'satin');
      S.cyl(0.5, 0.05, '#f4eee6', cx, 0.7, cz + 0.05, 'satin', 28);
      S.cone(0.2, 0.06, 0.68, '#2b2f38', cx, 0.35, cz + 0.05, 'satin', 12);
      S.cyl(0.3, 0.03, '#2b2f38', cx, 0.015, cz + 0.05, 'metal', 14);
      this._laptopB(S, cx - 0.1, 0.725, cz + 0.05, Math.PI / 2, '#c9ced6');
      this._cup(S, cx + 0.3, 0.725, cz + 0.2, true);
      this._cup(S, cx + 0.2, 0.725, cz - 0.1);
      this._plantB(S, 'succulent', cx + 0.3, 0.725, cz - 0.15, 0.3, 'white');
      [-0.6, 0.6, 1.0].forEach((x, i) =>
        S.rbox(
          0.45,
          0.45,
          0.12,
          0.05,
          ['#f5b83d', '#e8604c', '#f5f0e6'][i],
          cx + x * (i === 2 ? 1 : 1) * 0.9,
          0.55,
          cz - 0.9,
          i * 0.1,
          'matte',
          -0.3,
        ),
      );
      S.box(1.2, 0.018, 0.8, '#26324d', cx, 0.015, cz + 1.1, 0, 'matte'); // floor mat at the door
    }

    /* ---------- whiteboard (sales funnel) and a standing desk ---------- */
    _boards(root) {
      const S = this.S,
        bx = 2.3,
        bz = 5.0;
      S.box(2.7, 1.65, 0.07, '#d7dbe0', bx, 1.75, bz, 0, 'metal');
      [-1.2, 1.2].forEach(s => {
        S.box(0.06, 1.9, 0.06, '#7f8996', bx + s, 1.0, bz - 0.02, 0, 'metal');
        S.box(0.06, 0.06, 0.8, '#7f8996', bx + s, 0.06, bz, 0, 'metal');
        S.cyl(0.04, 0.05, '#16181d', bx + s, 0.03, bz + 0.38, 'matte', 8);
        S.cyl(0.04, 0.05, '#16181d', bx + s, 0.03, bz - 0.38, 'matte', 8);
      });
      S.box(2.5, 0.05, 0.12, '#aab2be', bx, 0.9, bz + 0.08, 0, 'metal');
      ['#e8604c', '#26324d', '#3fb6a8', '#f5b83d'].forEach((c, i) =>
        S.cyl(0.012, 0.12, c, bx - 0.5 + i * 0.15, 0.94, bz + 0.1, 'matte', 6, 0, 0, Math.PI / 2),
      );
      S.box(0.12, 0.04, 0.05, '#e8ecf2', bx + 0.5, 0.93, bz + 0.1, 0, 'matte');
      const ft = paint(1024, 576, ART.funnel).t;
      this._plane(root, ft, 2.5, 1.45, bx, 1.75, bz + 0.037, 0, { roughness: 0.3 });
      // standing desk with an anti-fatigue mat and a high stool
      const sx = 6.0,
        sz = 4.4;
      S.rbox(1.5, 0.05, 0.75, 0.02, '#f4eee6', sx, 1.1, sz, 0, 'satin');
      [-0.62, 0.62].forEach(d => {
        S.box(0.07, 1.08, 0.07, '#2b2f38', sx + d, 0.54, sz, 0, 'metal');
        S.box(0.07, 0.04, 0.72, '#2b2f38', sx + d, 0.03, sz, 0, 'metal');
      });
      S.box(1.4, 0.06, 0.04, '#2b2f38', sx, 0.95, sz - 0.3, 0, 'metal');
      S.box(0.5, 0.04, 0.3, '#2b2f38', sx + 0.55, 1.15, sz - 0.18);
      S.rbox(0.32, 0.03, 0.2, 0.01, '#ff9ec4', sx + 0.55, 1.18, sz - 0.18);
      this._laptopB(S, sx - 0.1, 1.125, sz, Math.PI, '#c9ced6');
      this._cup(S, sx + 0.5, 1.125, sz + 0.2, true);
      S.rbox(1.0, 0.025, 0.7, 0.01, '#2b3445', sx, 0.014, sz + 0.85, 0, 'matte');
      S.cyl(0.2, 0.06, '#3fb6a8', 7.4, 0.78, 4.9, 'matte', 14);
      S.cyl(0.03, 0.74, '#2b2f38', 7.4, 0.4, 4.9, 'metal', 8);
      S.cyl(0.22, 0.03, '#2b2f38', 7.4, 0.015, 4.9, 'metal', 14);
      S.sph(0.32, '#5aa6e0', 4.2, 0.32, 5.9, 1, 1, 1, 'satin', 16); // balance ball
    }

    /* ---------- right side: printer, cooler, lockers, files and a vending machine ---------- */
    _utility(root) {
      const S = this.S,
        hi = !this.mobile;
      S.rbox(1.0, 0.7, 0.8, 0.04, '#f4eee6', 14.9, 0.35, -2.4, 0, 'satin');
      S.rbox(0.9, 0.5, 0.7, 0.06, '#e9ecef', 14.9, 0.95, -2.4, 0, 'satin');
      S.box(0.6, 0.02, 0.3, '#2b2f38', 14.7, 1.2, -2.4);
      S.box(0.5, 0.04, 0.3, '#ffffff', 14.62, 1.23, -2.4, 0.1);
      S.box(0.16, 0.1, 0.04, '#16181d', 14.5, 1.1, -2.04, 0, 'matte');
      S.box(0.1, 0.012, 0.01, '#3ccf8e', 14.48, 1.12, -2.016, 0, 'lamp');
      S.box(0.5, 0.05, 0.3, '#fbfaf6', 14.45, 1.215, -2.8);
      S.cyl(0.22, 0.45, '#3a73c9', 14.1, 0.23, -3.3, 'satin', 12); // paper recycling
      S.box(0.3, 0.12, 0.4, '#fbfaf6', 14.9, 0.76, -2.4, 0, 'matte');
      // water cooler
      S.rbox(0.5, 1.0, 0.5, 0.06, '#f4f4f4', 14.95, 0.5, -0.9, 0, 'satin');
      S.box(0.3, 0.06, 0.02, '#3fb6a8', 14.7, 0.82, -0.9, 0, 'satin');
      S.box(0.3, 0.06, 0.02, '#e8604c', 14.7, 0.72, -0.9, 0, 'satin');
      S.cyl(0.04, 0.12, '#cfd5dc', 14.7, 0.58, -0.9, 'metal', 8, Math.PI / 2);
      S.cyl(0.07, 0.14, '#ffffff', 14.7, 0.9, -1.2, 'satin', 10);
      for (let i = 0; i < 5; i++) S.cone(0.034, 0.028, 0.03, '#ffffff', 14.7, 0.95 + i * 0.02, -1.2, 'matte', 8);
      const jug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.5, 16),
        new THREE.MeshStandardMaterial({ color: '#7fc7e9', transparent: true, opacity: 0.7, roughness: 0.1 }),
      );
      jug.position.set(14.95, 1.25, -0.9);
      root.add(jug);
      // lockers (4) and filing cabinets (2) along the right balustrade
      for (let i = 0; i < 4; i++) {
        const z = -5.6 + i * 0.5,
          c = i % 2 ? '#3fb6a8' : '#26324d';
        S.box(0.5, 1.9, 0.46, c, 15.55, 0.95, z, 0, 'satin');
        S.box(0.012, 1.7, 0.4, '#1b2233', 15.29, 0.95, z, 0, 'satin');
        for (let k = 0; k < 4; k++) S.box(0.014, 0.012, 0.28, '#11151c', 15.285, 1.5 + k * 0.05, z, 0, 'matte');
        S.box(0.02, 0.1, 0.02, '#d7dbe0', 15.285, 0.95, z + 0.15, 0, 'metal');
        S.box(0.012, 0.06, 0.1, '#d9b45c', 15.286, 1.75, z - 0.08, 0, 'metal');
      }
      for (let i = 0; i < 2; i++) {
        S.box(0.5, 1.05, 0.5, '#8e97a3', 15.55, 0.525, 0.4 + i * 0.52, 0, 'metal');
        for (let k = 0; k < 3; k++) {
          S.box(0.012, 0.28, 0.44, '#9aa3b2', 15.29, 0.2 + k * 0.33, 0.4 + i * 0.52, 0, 'metal');
          S.box(0.02, 0.03, 0.18, '#2b2f38', 15.28, 0.3 + k * 0.33, 0.4 + i * 0.52, 0, 'metal');
        }
      }
      this._plantB(S, 'succulent', 15.55, 1.05, 0.66, 0.5, 'white');
      // vending machine, lit
      S.rbox(0.85, 1.95, 1.0, 0.05, '#c94a3b', 15.45, 0.98, 4.6, 0, 'satin');
      S.box(0.04, 1.0, 0.7, '#171b22', 14.95, 1.2, 4.6, 0, 'matte');
      S.box(0.04, 0.2, 0.7, '#1b2233', 14.95, 0.15, 4.6, 0, 'matte');
      S.box(0.04, 0.12, 0.12, '#f5b83d', 14.94, 0.7, 5.05, 0, 'lamp');
      const vt = paint(256, 480, ART.vending).t;
      const vm = this._plane(root, vt, 0.62, 1.16, 14.9, 1.2, 4.4, -Math.PI / 2, {
        emissive: '#ffffff',
        emissiveMap: vt,
        emissiveIntensity: 0.5,
        side: THREE.DoubleSide,
      });
      vm.material.color.set('#ffffff');
      this.lampMats.push(vm.material);
      vm.position.x = 14.922;
      S.box(0.04, 0.9, 0.12, '#171b22', 14.94, 1.1, 4.99, 0, 'matte');
      if (hi) this._floorBoxes(root);
    }

    // brass floor boxes with leads and low cable covers where the desks plug in
    _floorBoxes(root) {
      const S = this.S;
      [
        [1.0, -2.1],
        [6.2, -2.1],
        [-4.8, -2.1],
        [11.2, -2.1],
        [-1.5, 3.0],
        [8.7, 3.0],
      ].forEach(([x, z]) => {
        S.box(0.3, 0.012, 0.3, '#d9b45c', x, 0.012, z, 0, 'metal');
        S.box(0.2, 0.014, 0.2, '#8a6f45', x, 0.016, z, 0, 'metal');
        S.cyl(0.008, 1.4, '#16181d', x + 0.5, 0.012, z, 'matte', 4, 0, Math.PI / 2);
      });
    }

    // small things in corners: radiator under the brick, cable, umbrella pennants etc.
    _corners(root) {
      const S = this.S,
        hi = !this.mobile;
      if (!hi) return;
      // cast-iron radiators under the left wall windows-style, loft touch
      [-2.0, 7.0].forEach(z => {
        for (let i = 0; i < 10; i++) S.cyl(0.05, 0.62, '#d8d4cb', -15.62, 0.4, z - 0.5 + i * 0.11, 'satin', 8);
        S.box(0.14, 0.06, 1.2, '#cfcac0', -15.62, 0.74, z, 0, 'satin');
        S.box(0.14, 0.06, 1.2, '#cfcac0', -15.62, 0.12, z, 0, 'satin');
      });
      // fire extinguisher + a framed evacuation plan by the printer
      S.cyl(0.07, 0.3, '#c0392b', 15.7, 0.25, -7.2, 'satin', 10);
      S.cyl(0.03, 0.08, '#2b2f38', 15.7, 0.45, -7.2, 'metal', 8);
      S.box(0.01, 0.4, 0.1, '#e8ecf2', 15.76, 0.36, -7.2);
    }

    /* ---------- the ceiling, loft style: steel beams, ducts, pendants, recessed lights (hidden from above) ---------- */
    _ceiling(root) {
      const C = new Bake(),
        hi = !this.mobile,
        steel = '#5c6571',
        duct = '#aab2be';
      // I-beams across the room
      [-12.4, -4.2, 4.0, 12.2].forEach(x => {
        C.box(0.34, 0.05, 22, steel, x, 5.52, 0, 0, 'metal');
        C.box(0.34, 0.05, 22, steel, x, 5.92, 0, 0, 'metal');
        C.box(0.06, 0.36, 22, steel, x, 5.72, 0, 0, 'metal');
        if (hi)
          for (let z = -10.4; z < 11; z += 1.3) {
            C.cyl(0.02, 0.06, '#2b2f38', x - 0.1, 5.52, z, 'metal', 6);
            C.cyl(0.02, 0.06, '#2b2f38', x + 0.1, 5.52, z, 'metal', 6);
          }
      });
      // round galvanised ducts along the room, joints and hangers
      [
        [-6.0, 5.1, 0.42],
        [7.5, 5.1, 0.32],
        [0.0, 5.3, 0.26],
      ].forEach(([z, y, r], k) => {
        C.cyl(r, 31.2, duct, 0, y, z, 'metal', 20, 0, Math.PI / 2);
        for (let x = -15; x < 16; x += 2.6) {
          C.cyl(r + 0.02, 0.06, '#8e97a3', x, y, z, 'metal', 20, 0, Math.PI / 2);
          if (hi && k < 2) {
            C.cyl(0.012, 0.5, '#2b2f38', x + 0.2, y + r + 0.25, z, 'metal', 5);
            C.cyl(0.012, 0.5, '#2b2f38', x + 0.2, y + r + 0.25, z, 'metal', 5);
          }
        }
        C.cone(r * 1.3, r * 0.6, 0.3, '#8e97a3', 13.6 - k, y - r - 0.1, z, 'metal', 14);
      });
      // a branch duct dropping into the kitchenette and one over the reception
      C.cyl(0.26, 1.4, duct, -11.5, 4.6, -6.0, 'metal', 16);
      C.box(0.9, 0.06, 0.9, '#8e97a3', -11.5, 3.88, -6.0, 0, 'metal');
      C.cyl(0.24, 1.2, duct, -4.5, 4.6, 7.5, 'metal', 16);
      C.box(0.8, 0.06, 0.8, '#8e97a3', -4.5, 3.98, 7.5, 0, 'metal');
      // cable tray + conduits
      C.box(0.5, 0.08, 31, '#7f8996', 8.2, 5.2, 0, 0, 'metal');
      C.box(0.5, 0.2, 0.04, '#7f8996', 8.2, 5.3, 0, 0, 'metal');
      for (let i = 0; i < 3; i++) C.cyl(0.012, 31, '#16181d', 8.0 + i * 0.1, 5.26, 0, 'matte', 4, Math.PI / 2);
      // drop-ceiling soffits with recessed lights over the kitchenette and reception
      const soffit = (x0, x1, z0, z1, y) => {
        C.box(x1 - x0, 0.16, z1 - z0, '#e8e1d4', (x0 + x1) / 2, y, (z0 + z1) / 2, 0, 'satin');
        for (let x = x0 + 0.7; x < x1 - 0.3; x += 1.4)
          for (let z = z0 + 0.7; z < z1 - 0.3; z += 1.4) {
            C.cyl(0.13, 0.02, '#fff4d6', x, y - 0.09, z, 'lamp', 14);
            C.cyl(0.15, 0.015, '#c9c3b6', x, y - 0.085, z, 'satin', 14);
          }
      };
      soffit(-15.6, -8.0, -10.9, -8.6, 5.3);
      soffit(-6.5, 0.4, 7.2, 10.9, 5.3);
      // industrial dome pendants over the desks, the meeting table and the reception
      const pend = (x, y, z, k = 0.3, c = '#1d2230') => {
        C.cyl(0.006, 5.5 - y, '#16181d', x, (5.5 + y) / 2, z, 'matte', 4);
        C.cone(k, 0.07, k * 0.55, c, x, y, z, 'metal', 20);
        C.cone(k * 0.97, 0.06, k * 0.5, '#d98f4e', x, y - 0.01, z, 'metal', 20);
        C.sph(0.07, '#fff4d6', x, y - k * 0.22, z, 1, 1, 1, 'lamp', 10);
      };
      [
        [-1.5, -4.0],
        [3.6, -4.0],
        [8.7, -4.0],
        [-1.5, 1.2],
        [3.6, 1.2],
        [8.7, 1.2],
      ].forEach(([x, z]) => pend(x, 4.15, z, 0.34));
      pend(-10.2, 4.2, -3.2, 0.36);
      pend(-6.2, 4.2, -7.4, 0.4);
      pend(-5.4, 4.0, 4.9, 0.3, '#26324d');
      [-4.2, -3.0, -1.8].forEach(x => {
        C.cyl(0.006, 5.5 - 4.4, '#16181d', x, 4.95, 8.9, 'matte', 4);
        C.sph(0.16, '#fff4d6', x, 4.4, 8.9, 1, 1, 1, 'lamp', 14);
        C.tor(0.17, 0.008, '#d9b45c', x, 4.55, 8.9, Math.PI / 2, 0, 0, 'metal', 14);
      });
      // a wide drum over the meeting table and a linear light over the whiteboard aisle
      C.cyl(0.9, 0.35, '#26324d', 11.4, 4.3, 6.6, 'satin', 28);
      C.cyl(0.88, 0.02, '#fff4d6', 11.4, 4.12, 6.6, 'lamp', 28);
      [-0.6, 0.6].forEach(d => C.cyl(0.008, 1.2, '#16181d', 11.4 + d, 4.9, 6.6, 'matte', 4));
      C.box(2.6, 0.06, 0.1, '#e9ecef', 2.3, 4.2, 5.4, 0, 'satin');
      C.box(2.5, 0.02, 0.07, '#fff4d6', 2.3, 4.16, 5.4, 0, 'lamp');
      [-1.1, 1.1].forEach(d => C.cyl(0.006, 1.3, '#16181d', 2.3 + d, 4.85, 5.4, 'matte', 4));
      // linear lights over the aisle between the desk rows
      [-4.4, 3.6, 11.0].forEach(x => {
        C.box(3.2, 0.06, 0.12, '#e9ecef', x, 4.7, -1.6, 0, 'satin');
        C.box(3.1, 0.02, 0.08, '#fff4d6', x, 4.66, -1.6, 0, 'lamp');
        [-1.3, 1.3].forEach(d => C.cyl(0.006, 0.85, '#16181d', x + d, 5.15, -1.6, 'matte', 4));
      });
      // a few pipes that stay visible from above so the loft shows from the overview too
      const Q = new Bake(this.lampMat);
      Q.cyl(0.2, 31.2, duct, 0, 5.82, -10.35, 'metal', 20, 0, Math.PI / 2);
      Q.cyl(0.25, 21.4, duct, -15.3, 5.5, 0, 'metal', 20, Math.PI / 2);
      for (let x = -15; x < 16; x += 2.6) Q.cyl(0.22, 0.06, '#8e97a3', x, 5.82, -10.35, 'metal', 20, 0, Math.PI / 2);
      for (let z = -10; z < 11; z += 2.6) Q.cyl(0.27, 0.06, '#8e97a3', -15.3, 5.5, z, 'metal', 20, Math.PI / 2);
      Q.flush(root, false);
      const g = (this.ceil = new THREE.Group());
      root.add(g);
      C.flush(g, false);
      g.traverse(o => {
        if (o.isMesh && o.material === this.lampMat) o.castShadow = false;
      });
    }

    _label(key, name, role, color) {
      const el = document.createElement('div');
      el.className = 'tag3d';
      el.style.setProperty('--c', color);
      el.innerHTML = `<div class="bubble"></div><div class="nm">${name}<small>${role}</small></div>`;
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        this.select(key, true);
      });
      const obj = new CSS2DObject(el);
      return { obj, el };
    }

    _agentScreen(color, name) {
      const s = canvasTex(256, 150);
      const draw = (lines = []) => {
        const g = s.ctx;
        g.fillStyle = '#0f141c';
        g.fillRect(0, 0, 256, 150);
        g.fillStyle = color;
        g.fillRect(0, 0, 256, 22);
        g.fillStyle = '#0a0e14';
        g.font = '700 13px "JetBrains Mono", monospace';
        g.fillText(name.toUpperCase(), 8, 16);
        g.font = '500 11px "JetBrains Mono", monospace';
        for (let i = 0; i < 8; i++) {
          const w = 40 + ((i * 53 + lines.length * 17) % 170);
          g.fillStyle = i === 0 ? color : 'rgba(200,215,235,.35)';
          g.fillRect(8, 32 + i * 14, w, 6);
        }
        if (lines[0]) {
          g.fillStyle = '#e9eef5';
          g.fillText(String(lines[0]).slice(0, 34), 8, 144);
        }
        s.t.needsUpdate = true;
      };
      draw();
      return { tex: s.t, draw };
    }

    _mkPerson(key, color) {
      const look = { ...(LOOKS[key] || FALLBACK[Object.keys(this.actors).length % 2]), rich: !this.mobile };
      if (!look.top) look.top = soften(color, 0.25);
      else if (key !== 'max' && key !== 'owner' && key !== 'receptionist' && key !== 'visitor')
        look.top = soften(look.top, 0.22);
      return makePerson(look);
    }

    _person(key, color) {
      const p = this._mkPerson(key, color);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.025, 8, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.03;
      p.g.add(ring);
      p.pose('sit');
      return { ...p, ring };
    }

    /** A small desk plate with the agent's name and role (brass for the CEO). */
    _nameplate(root, x, z, name, role, color, brass = false) {
      const s = paint(256, 80, (g, W, H) => {
        g.fillStyle = brass ? '#d9b45c' : '#fbfaf6';
        g.fillRect(0, 0, W, H);
        g.fillStyle = color;
        g.fillRect(0, 0, 12, H);
        g.fillStyle = brass ? '#3a2c0c' : '#26324d';
        g.font = '800 34px "Space Grotesk", sans-serif';
        g.fillText(String(name).toUpperCase().slice(0, 10), 24, 38);
        g.fillStyle = brass ? '#5a4a1a' : '#6b7488';
        g.font = '600 20px Inter, sans-serif';
        g.fillText(String(role || '').slice(0, 20), 24, 66);
      }).t;
      const dark = new THREE.MeshStandardMaterial({
        color: brass ? '#8a6f2a' : '#26324d',
        roughness: 0.4,
        metalness: brass ? 0.6 : 0.1,
      });
      const front = new THREE.MeshStandardMaterial({ map: s, roughness: 0.4, metalness: brass ? 0.3 : 0 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.03), [dark, dark, dark, dark, front, dark]);
      m.position.set(x - 0.35, 0.845, z + 0.48);
      m.rotation.x = -0.3;
      m.castShadow = true;
      root.add(m);
      this.S.box(0.3, 0.012, 0.07, '#2b2f38', x - 0.35, 0.8, z + 0.49, 0, 'metal');
    }

    _agentAt(root, key, x, z, { big = false }) {
      const a = this.info[key] || { name: key, role: '', color: '#6ee7f9' };
      const scr = this._agentScreen(a.color, a.name);
      const dk = this._desk(root, x, z, a.color, scr.tex, false, big ? 3.0 : 2.4, {
        key,
        dual: key === 'teo' || key === 'nico' || key === 'max',
        plant: DESK_PLANT[key]?.[0],
        pot: DESK_PLANT[key]?.[1],
      });
      this._nameplate(root, x, z, a.name, a.short || a.role, a.color, big);
      const chair = this._chair(root, x, z - 1.0, Math.PI, soften(a.color, 0.4), { high: big });
      const p = this._person(key, a.color);
      p.g.position.set(x, 0, z - 1.05);
      root.add(p.g);
      const lab = this._label(key, a.name, a.short || a.role, a.color);
      lab.obj.position.set(0, 2.15, 0);
      p.g.add(lab.obj);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.2), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 1.0;
      hit.userData.agent = key;
      p.g.add(hit);
      this.clickables.push(hit);
      this.actors[key] = {
        ...p,
        key,
        label: lab,
        screen: scr,
        base: p.g.position.clone(),
        state: 'idle',
        talkUntil: 0,
        phase: Math.random() * 6,
        color: a.color,
        chairObj: chair,
        deskMug: dk?.mug,
        yaw: 0,
        yawT: 0,
        micro: null,
        chat: null,
      };
    }

    _ownerDesk(root, human) {
      const { x, z } = OWNER_DESK;
      const dk = this._desk(root, x, z, '#f2c879', this.dashTex.t, false, 3.2, {
        key: 'owner',
        dual: true,
        plant: 'orchid',
        pot: 'white',
      });
      this._nameplate(root, x, z, human.name, human.role, '#f2c879', true);
      const crmMini = new THREE.Mesh(
        new THREE.PlaneGeometry(1.0, 0.58),
        new THREE.MeshBasicMaterial({ map: this.crmTex.t, toneMapped: false }),
      );
      crmMini.position.set(x + 0.75, 1.27, z - 0.18);
      crmMini.rotation.y = -0.4;
      root.add(crmMini);
      const back = new THREE.Mesh(
        new RoundedBoxGeometry(1.08, 0.66, 0.04, 2, 0.02),
        new THREE.MeshStandardMaterial({ color: '#1c2028', metalness: 0.4, roughness: 0.3 }),
      );
      back.position.copy(crmMini.position);
      back.rotation.copy(crmMini.rotation);
      back.translateZ(-0.03);
      root.add(back);
      crmMini.userData.view = 'crm';
      this.clickables.push(crmMini);
      const chair = this._chair(root, x, z - 1.0, Math.PI, '#26324d', { high: true });
      const p = this._person('owner', '#f2c879');
      p.g.position.set(x, 0, z - 1.05);
      root.add(p.g);
      const lab = this._label('owner', human.name, human.role, '#f2c879');
      lab.obj.position.set(0, 2.15, 0);
      p.g.add(lab.obj);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.2), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 1.0;
      hit.userData.agent = 'owner';
      p.g.add(hit);
      this.clickables.push(hit);
      this.actors.owner = {
        ...p,
        key: 'owner',
        label: lab,
        base: p.g.position.clone(),
        state: 'idle',
        talkUntil: 0,
        phase: 0,
        color: '#f2c879',
        human: true,
        chairObj: chair,
        deskMug: dk?.mug,
        yaw: 0,
        yawT: 0,
        micro: null,
        chat: null,
      };
    }

    /* ---------- the people who are not agents: receptionist, a visitor and someone walking with a coffee ---------- */
    _ambient(root) {
      this.crowd = [];
      const r = this._mkPerson('receptionist', '#26324d');
      r.pose('sit');
      r.g.position.set(-3.0, 0, 7.72);
      root.add(r.g);
      this.crowd.push({ p: r, kind: 'recep', k: 2.1 });
      const v = this._mkPerson('visitor', '#b89a6a');
      v.g.position.set(-1.35, 0, 10.2);
      v.g.rotation.y = Math.PI + 0.55;
      root.add(v.g);
      this.crowd.push({ p: v, kind: 'visitor', k: 4.4 });
      // someone doing a coffee round: coffee corner -> the aisle -> printer -> back
      const w = this._mkPerson('jordan', '#ef8f6b');
      w.hold('mug');
      const pts = [
        { x: -12.2, z: -8.9, pause: 3500, face: Math.PI },
        { x: -12.2, z: -6.1 },
        { x: -3.0, z: -6.1 },
        { x: 11.5, z: -6.1 },
        { x: 11.5, z: -2.0 },
        { x: 13.4, z: -2.0, pause: 3000, face: Math.PI / 2 },
        { x: 6.0, z: -2.0 },
        { x: -3.9, z: -2.0 },
        { x: -13.2, z: -2.0 },
        { x: -13.2, z: -9.0 },
      ];
      w.g.position.set(pts[0].x, 0, pts[0].z);
      root.add(w.g);
      this.walker = { p: w, pts, seg: 0, pauseUntil: performance.now() + 2500, a: Math.PI };
      this.crowd.push({ p: w, kind: 'walker', k: 0.7 });
    }

    _crowdTick(dt, t, now) {
      for (const c of this.crowd || []) {
        const p = c.p;
        if (c.kind === 'recep') {
          const s = Math.sin(t * 0.22 + c.k);
          p.animate(t, s > 0.55 ? 'talk' : s < -0.6 ? 'phone' : 'type', c.k);
        } else if (c.kind === 'visitor') {
          const s = Math.sin(t * 0.22 + 2.1);
          p.animate(t, s < -0.3 ? 'sip' : s > 0.4 ? 'talk' : 'idle', c.k);
          if (s >= -0.3) {
            p.hold('mug');
            p.props.mug.rotation.x = -(p.arms[1].sh.rotation.x + p.arms[1].el.rotation.x);
          }
        } else if (c.kind === 'walker') this._walkLoop(this.walker, dt, t, now);
      }
    }

    _walkLoop(w, dt, t, now) {
      const p = w.p,
        pts = w.pts,
        cur = pts[w.seg],
        nxt = pts[(w.seg + 1) % pts.length];
      if (now < w.pauseUntil) {
        let d = (cur.face ?? 0) - p.g.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        p.g.rotation.y += d * 0.1;
        p.animate(t, 'sip', 1.3);
        return;
      }
      const dx = nxt.x - p.g.position.x,
        dz = nxt.z - p.g.position.z,
        len = Math.hypot(dx, dz);
      const step = 1.25 * dt;
      if (len <= step) {
        p.g.position.set(nxt.x, 0, nxt.z);
        w.seg = (w.seg + 1) % pts.length;
        if (nxt.pause) w.pauseUntil = now + nxt.pause;
        return;
      }
      p.g.position.x += (dx / len) * step;
      p.g.position.z += (dz / len) * step;
      let d = Math.atan2(dx, dz) - p.g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.g.rotation.y += d * 0.12;
      p.animate(t, 'walkMug', 0.7);
    }

    /** Idle life at the desks: sipping, reading the screen, a phone call, a stretch... and short chats between neighbours. */
    _microMode(a, now) {
      if (a.chat) return a.chat.mode;
      if (!a.micro || now > a.micro.until) {
        if (a.micro && a.micro.mode !== 'type') a.micro = { mode: 'type', until: now + 3500 + Math.random() * 7000 };
        else {
          const r = Math.random(),
            mode =
              r < 0.28
                ? 'sip'
                : r < 0.5
                  ? 'look'
                  : r < 0.64
                    ? 'think'
                    : r < 0.78
                      ? 'phone'
                      : r < 0.9
                        ? 'read'
                        : 'stretch';
          a.micro = { mode, until: now + 3500 + Math.random() * 3500 };
        }
      }
      return a.micro.mode;
    }

    _chatTick(now, t) {
      const ready = key => {
        const a = this.actors[key];
        return a && !a.trip && !a.human && a.talkUntil < now && a.state !== 'working' && a.state !== 'needs';
      };
      if (this.chat) {
        const [ka, kb, until] = this.chat;
        const a = this.actors[ka],
          b = this.actors[kb];
        const aTalks = Math.sin(t * 0.8 + a.phase) > 0;
        if (a.chat) a.chat.mode = aTalks ? 'talk' : 'idle';
        if (b.chat) b.chat.mode = aTalks ? 'idle' : 'talk';
        if (now > until || a.trip || b.trip) {
          a.chat = b.chat = null;
          a.yawT = b.yawT = 0;
          this.chat = null;
          this.chatNext = now + 14000 + Math.random() * 20000;
        }
        return;
      }
      if (now < (this.chatNext ||= now + 9000)) return;
      const pairs = CHAT_PAIRS.filter(([x, y]) => ready(x) && ready(y));
      if (!pairs.length) {
        this.chatNext = now + 8000;
        return;
      }
      const [ka, kb] = pairs[(Math.random() * pairs.length) | 0];
      const a = this.actors[ka],
        b = this.actors[kb];
      const dir = Math.sign(b.base.x - a.base.x) || 1;
      a.chat = { mode: 'talk' };
      b.chat = { mode: 'idle' };
      a.yawT = dir * 1.05;
      b.yawT = -dir * 1.05;
      this.chat = [ka, kb, now + 6500 + Math.random() * 4000];
    }

    /* ---------- the wall TV: a live feed of what the agents are saying ---------- */
    _tvDraw(t = 0) {
      const g = this.tv.ctx,
        W = 640,
        H = 360;
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#101826');
      gr.addColorStop(1, '#0a0f17');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#e8604c';
      g.beginPath();
      g.arc(26, 26, 7, 0, 7);
      g.fill();
      g.fillStyle = '#e8ecf2';
      g.font = '800 22px "Space Grotesk", sans-serif';
      g.fillText('SALES FLOOR LIVE', 42, 34);
      let clock = '';
      try {
        clock = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: this.tz || 'America/New_York',
        }).format(new Date());
      } catch {}
      g.textAlign = 'right';
      g.fillStyle = '#f5b83d';
      g.font = '700 20px "JetBrains Mono", monospace';
      g.fillText('NEW YORK ' + clock, W - 22, 34);
      g.textAlign = 'left';
      const feed = this.feed.length
        ? this.feed
        : Object.values(this.info || {})
            .slice(0, 5)
            .map(a => ({ name: a.name, text: a.role, color: a.color }));
      feed.slice(0, 5).forEach((f, i) => {
        const y = 62 + i * 46;
        g.fillStyle = 'rgba(255,255,255,.05)';
        rr(g, 16, y, W - 32, 38, 8);
        g.fill();
        g.fillStyle = f.color || '#6ee7f9';
        g.fillRect(16, y, 6, 38);
        g.font = '700 16px "Space Grotesk", sans-serif';
        g.fillText(String(f.name || '').slice(0, 10), 34, y + 24);
        g.fillStyle = '#c9d2e0';
        g.font = '500 16px Inter, sans-serif';
        g.fillText(String(f.text || '').slice(0, 52), 130, y + 24);
      });
      // a ticker made from the team's roles, with decorative activity bars
      const tick = Object.values(this.info || {})
        .map(a => `${a.name} · ${a.short || a.role}`)
        .join('    ✦    ');
      g.fillStyle = '#f5b83d';
      g.font = '600 15px "JetBrains Mono", monospace';
      const off = -((t * 40) % 900);
      g.fillText(tick, 230 + off, 340);
      g.fillText(tick, 230 + off + 900, 340);
      g.fillStyle = '#0a0f17';
      g.fillRect(0, 316, 224, 44);
      for (let i = 0; i < 24; i++) {
        const h = 6 + (Math.sin(t * 1.6 + i * 0.7) * 0.5 + 0.5) * 22;
        g.fillStyle = i % 5 === 0 ? '#3ccf8e' : '#2b3a55';
        g.fillRect(20 + i * 8, 346 - h, 5, h);
      }
      this.tv.t.needsUpdate = true;
    }

    _clock(root) {
      const s = canvasTex(256, 256);
      const g = s.ctx;
      this.clockDraw = () => {
        let h = 0,
          m = 0;
        try {
          const p = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
            timeZone: this.tz || 'America/New_York',
          }).formatToParts(new Date());
          h = +p.find(x => x.type === 'hour').value % 12;
          m = +p.find(x => x.type === 'minute').value;
        } catch {}
        g.clearRect(0, 0, 256, 256);
        g.fillStyle = '#fffaf2';
        g.beginPath();
        g.arc(128, 128, 120, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 10;
        g.strokeStyle = '#2b2f38';
        g.stroke();
        g.strokeStyle = '#1c2230';
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          g.lineWidth = i % 3 ? 4 : 8;
          g.beginPath();
          g.moveTo(128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92);
          g.lineTo(128 + Math.sin(a) * 106, 128 - Math.cos(a) * 106);
          g.stroke();
        }
        const hand = (a, len, w) => {
          g.lineWidth = w;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(128, 128);
          g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len);
          g.stroke();
        };
        hand(((h + m / 60) / 12) * Math.PI * 2, 58, 10);
        hand((m / 60) * Math.PI * 2, 84, 6);
        g.fillStyle = '#f5b83d';
        g.beginPath();
        g.arc(128, 128, 9, 0, Math.PI * 2);
        g.fill();
        s.t.needsUpdate = true;
      };
      this.clockDraw();
      const c = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 48),
        new THREE.MeshStandardMaterial({ map: s.t, transparent: true, roughness: 0.6 }),
      );
      c.position.set(2.65, 5.15, -10.83);
      root.add(c);
      clearInterval(this._clockT);
      this._clockT = setInterval(() => this.clockDraw(), 20000);
    }

    _availableSign(root) {
      const s = canvasTex(1024, 256);
      const g = s.ctx;
      g.fillStyle = 'rgba(28,34,48,.88)';
      rr(g, 0, 0, 1024, 256, 28);
      g.fill();
      g.strokeStyle = '#f5b83d';
      g.lineWidth = 6;
      rr(g, 6, 6, 1012, 244, 24);
      g.stroke();
      g.fillStyle = '#f5b83d';
      g.font = '700 84px "Space Grotesk", sans-serif';
      g.textAlign = 'center';
      g.fillText('FLOOR BEING SET UP', 512, 118);
      g.fillStyle = '#e8ecf2';
      g.font = '500 40px Inter, sans-serif';
      g.fillText('Agents go live once this office is connected to its CRM', 512, 190);
      s.t.needsUpdate = true;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 2.5),
        new THREE.MeshBasicMaterial({ map: s.t, transparent: true, toneMapped: false, side: THREE.DoubleSide }),
      );
      m.position.set(3.6, 4.6, -7.2);
      root.add(m);
      this.sign = m;
    }

    /* ---------- data on screens ---------- */
    drawContent(posts = [], week = '') {
      const { ctx: g, t } = this.contentTex;
      const W = 1280,
        H = 512;
      g.fillStyle = '#0a0f17';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#f5b83d';
      g.font = '700 30px "Space Grotesk", sans-serif';
      g.fillText('CONTENT WEEK' + (week ? ' · ' + week : ''), 28, 46);
      g.fillStyle = '#8792a3';
      g.font = '500 18px "JetBrains Mono", monospace';
      g.fillText('LUNA · approved by Elvis before publishing', 28, 76);
      const days = posts.length
        ? posts.slice(0, 7)
        : ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => ({
            day: d,
            format: '—',
            title: 'Waiting for Luna',
            status: 'pending',
          }));
      const cw = (W - 56 - 6 * 12) / 7;
      days.forEach((p, i) => {
        const x = 28 + i * (cw + 12),
          y = 100;
        g.fillStyle = '#121a26';
        rr(g, x, y, cw, 380, 14);
        g.fill();
        const col = p.status === 'approved' ? '#3ccf8e' : p.status === 'changes' ? '#ff6b5e' : '#f5b83d';
        g.fillStyle = col;
        rr(g, x, y, cw, 8, 4);
        g.fill();
        g.fillStyle = '#f5b83d';
        g.font = '700 22px "JetBrains Mono", monospace';
        g.fillText(
          String(p.day || '')
            .slice(0, 3)
            .toUpperCase(),
          x + 14,
          y + 44,
        );
        g.fillStyle = '#8792a3';
        g.font = '600 14px "JetBrains Mono", monospace';
        g.fillText(
          String(p.format || '')
            .toUpperCase()
            .slice(0, 18),
          x + 14,
          y + 70,
        );
        g.fillStyle = '#e8ecf2';
        g.font = '600 19px Inter, sans-serif';
        this._wrap(g, String(p.title || ''), x + 14, y + 104, cw - 26, 25, 9);
        g.fillStyle = col;
        g.font = '700 13px "JetBrains Mono", monospace';
        g.fillText((p.status || 'pending').toUpperCase(), x + 14, y + 362);
      });
      t.needsUpdate = true;
    }

    _wrap(g, text, x, y, maxW, lh, maxLines) {
      const words = text.split(/\s+/);
      let line = '',
        n = 0;
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (g.measureText(test).width > maxW && line) {
          g.fillText(line, x, y + n * lh);
          line = w;
          if (++n >= maxLines) return;
        } else line = test;
      }
      if (line) g.fillText(line, x, y + n * lh);
    }

    drawCRM(data) {
      const { ctx: g, t } = this.crmTex;
      const W = 1024;
      g.fillStyle = '#0a0f17';
      g.fillRect(0, 0, W, 576);
      g.fillStyle = '#6aa8ff';
      g.font = '700 30px "Space Grotesk", sans-serif';
      g.fillText('CRM · ENROLLMENT PIPELINE', 30, 50);
      const pipe = data?.pipeline || [];
      const max = Math.max(1, ...pipe.map(p => p.count || 0));
      pipe.forEach((p, i) => {
        const y = 92 + i * 62;
        g.fillStyle = '#8792a3';
        g.font = '600 20px Inter, sans-serif';
        g.fillText(p.label, 30, y + 24);
        g.fillStyle = '#141c28';
        rr(g, 290, y + 6, 600, 24, 12);
        g.fill();
        g.fillStyle = ['enrolled', 'active', 'completed'].includes(p.key) ? '#3ccf8e' : '#6aa8ff';
        rr(g, 290, y + 6, Math.max(14, (600 * (p.count || 0)) / max), 24, 12);
        g.fill();
        g.fillStyle = '#e8ecf2';
        g.font = '700 26px "Space Grotesk", sans-serif';
        g.textAlign = 'right';
        g.fillText(String(p.count ?? 0), 990, y + 28);
        g.textAlign = 'left';
      });
      if (!pipe.length) {
        g.fillStyle = '#8792a3';
        g.font = '500 24px Inter, sans-serif';
        g.fillText('Connecting to your CRM…', 30, 120);
      }
      t.needsUpdate = true;
    }

    drawDash(k) {
      const { ctx: g, t } = this.dashTex;
      const W = 640;
      g.fillStyle = '#0a0f17';
      g.fillRect(0, 0, W, 800);
      g.fillStyle = '#3ccf8e';
      g.beginPath();
      g.arc(40, 44, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e8ecf2';
      g.font = '700 30px "Space Grotesk", sans-serif';
      g.fillText('LIVE', 60, 54);
      const rows = [
        ['LEADS TODAY', k?.leadsToday],
        ['CALLS BOOKED · 24H', k?.booked24h],
        ['ENROLLED THIS MONTH', k?.enrolledMonth],
        ['REPLY TIME', k?.replySeconds != null ? k.replySeconds + ' s' : '—'],
      ];
      rows.forEach(([l, v], i) => {
        const y = 110 + i * 168;
        g.fillStyle = '#121a26';
        rr(g, 28, y, W - 56, 148, 16);
        g.fill();
        g.fillStyle = '#8792a3';
        g.font = '600 22px "JetBrains Mono", monospace';
        g.fillText(l, 52, y + 42);
        g.fillStyle = i === 2 ? '#f5b83d' : '#e8ecf2';
        g.font = '700 74px "Space Grotesk", sans-serif';
        g.fillText(v == null ? '—' : String(v), 52, y + 122);
      });
      t.needsUpdate = true;
    }

    /* ---------- behaviour ---------- */
    setState(key, state) {
      const a = this.actors[key];
      if (a) a.state = state;
    }

    say(key, text, ms = 7000, walk = false) {
      const a = this.actors[key];
      if (!a) return;
      a.label.el.querySelector('.bubble').textContent = text;
      a.label.el.classList.add('talk');
      a.talkUntil = performance.now() + ms;
      this.feed.unshift({
        name: a.label.el.querySelector('.nm')?.firstChild?.textContent || key,
        text,
        color: a.color,
      });
      this.feed.length = Math.min(this.feed.length, 6);
      if (this.tv) this._tvDraw(this.clock.elapsedTime);
      a.state = a.state === 'needs' ? 'needs' : 'working';
      if (a.screen) a.screen.draw([text]);
      if (walk) this.visitMax(key);
    }

    /** The agent gets up, walks over to Max's desk to report, then goes back. */
    visitMax(key) {
      const a = this.actors[key],
        max = this.actors.max;
      if (this.reduced || !a || !max || a.human || key === 'max' || a.trip || this.trips >= 2) return;
      const b = a.base,
        slot = this.trips++;
      const tgt = new THREE.Vector3(CEO_DESK.x + 0.4 + slot * 0.9, 0, CEO_DESK.z + 1.55);
      const out = new THREE.Vector3(b.x + 1.45, 0, b.z); // step out from behind the desk
      const path =
        b.z < -3
          ? [b.clone(), out, new THREE.Vector3(out.x, 0, -6.1), new THREE.Vector3(tgt.x, 0, -6.1), tgt]
          : [
              b.clone(),
              out,
              new THREE.Vector3(out.x, 0, -1.6),
              new THREE.Vector3(-3.9, 0, -1.6),
              new THREE.Vector3(-3.9, 0, -6.1),
              tgt,
            ];
      a.pose('stand');
      a.trip = { path, back: path.slice().reverse(), seg: 0, t0: performance.now(), stage: 'go', wait: 0 };
    }

    _walk(a, now, t) {
      const tr = a.trip,
        pts = tr.stage === 'back' ? tr.back : tr.path,
        speed = 1.9;
      if (tr.stage === 'stay') {
        let d = Math.PI - a.g.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        a.g.rotation.y += d * 0.15; // face Max
        a.animate(t, 'talk', a.phase);
        if (now > tr.wait) {
          tr.stage = 'back';
          tr.seg = 0;
          tr.t0 = now;
        }
        return;
      }
      const p0 = pts[tr.seg],
        p1 = pts[tr.seg + 1];
      const len = p0.distanceTo(p1) || 0.001,
        k = Math.min(1, (((now - tr.t0) / 1000) * speed) / len);
      a.g.position.lerpVectors(p0, p1, k);
      const dir = Math.atan2(p1.x - p0.x, p1.z - p0.z);
      let d = dir - a.g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      a.g.rotation.y += d * 0.2;
      a.animate(t, 'walk', a.phase);
      if (k >= 1) {
        tr.seg++;
        tr.t0 = now;
        if (tr.seg >= pts.length - 1) {
          if (tr.stage === 'go') {
            tr.stage = 'stay';
            tr.wait = now + 2600;
          } else {
            a.g.position.copy(a.base);
            a.g.rotation.y = 0;
            a.trip = null;
            a.pose('sit');
            this.trips = Math.max(0, this.trips - 1);
          }
        }
      }
    }

    select(key, fromScene = false) {
      Object.values(this.actors).forEach(a => a.label.el.classList.toggle('sel', a.key === key));
      this.selected = key;
      if (key && this.actors[key]) this.view('agent:' + key);
      if (fromScene) this.onSelect(key);
    }

    view(name, instant = false) {
      const V = {
        overview: [
          [3, 17, 25],
          [0, 0.4, -3],
        ],
        owner: [
          [-6.5, 3.4, 2.5],
          [OWNER_DESK.x, 1.1, OWNER_DESK.z - 1],
        ],
        ceo: [
          [-2.8, 3.4, -2.8],
          [CEO_DESK.x, 1.2, CEO_DESK.z - 1],
        ],
        crm: [
          [-9.5, 3.0, -2.4],
          [-15.8, 3.0, -2.4],
        ],
        content: [
          [2.6, 3.2, -3.2],
          [2.65, 2.9, -10.8],
        ],
        team: [
          [3.6, 7.5, 10],
          [3.6, 1, -1.8],
        ],
        dash: [
          [9.5, 2.8, -4.4],
          [13.9, 2.3, -7.6],
        ],
        city: [
          [36, 10, 42],
          [0, 1, -3],
        ],
      };
      this.cityMode = name === 'city';
      let pos, tgt;
      if (name.startsWith('agent:')) {
        const a = this.actors[name.slice(6)];
        if (!a) return;
        const p = a.base;
        pos = [p.x + 1.5, 2.6, p.z + 4.0];
        tgt = [p.x, 1.2, p.z];
      } else {
        [pos, tgt] = V[name] || V.overview;
      }
      if (name === 'city' && this.camera.aspect < 1.4) {
        const k = 1.4 - this.camera.aspect * 0.3;
        pos = pos.map((v, i) => tgt[i] + (v - tgt[i]) * k);
      }
      if (window.innerWidth < 640) {
        const k = name === 'overview' ? 0.3 : 0.35;
        pos = [
          pos[0] + (pos[0] - tgt[0]) * k,
          pos[1] + (name === 'overview' ? 6 : 1.2),
          pos[2] + (pos[2] - tgt[2]) * k,
        ];
      }
      this.camGoal = { pos: new THREE.Vector3(...pos), tgt: new THREE.Vector3(...tgt) };
      if (instant || this.reduced) {
        this.camera.position.copy(this.camGoal.pos);
        this.controls.target.copy(this.camGoal.tgt);
        this.camGoal = null;
      }
    }

    _pick(e) {
      const r = this.renderer.domElement.getBoundingClientRect();
      this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(this.ptr, this.camera);
      const hit = this.ray.intersectObjects(this.clickables, false)[0];
      return hit ? hit.object.userData : null;
    }
    _click(e) {
      if (!this._down || Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]) > 6) return;
      const d = this._pick(e);
      if (!d) return;
      if (d.demo) {
        this.onSelect('demo:' + d.demo);
        return;
      }
      if (d.agent) this.select(d.agent, true);
      else if (d.view) {
        this.view(d.view);
        this.onSelect('view:' + d.view);
      }
    }
    _hover(e) {
      const d = this._pick(e);
      this.renderer.domElement.style.cursor = d ? 'pointer' : 'grab';
    }

    /** Stop the loop and release the GPU and DOM this scene holds (added for the app: the design never unmounts it). */
    dispose() {
      this.dead = true;
      this._ro?.disconnect();
      clearInterval(this._clockT);
      this.controls?.dispose();
      this.composer?.dispose?.();
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
      this.renderer.domElement.remove();
      this.labels.domElement.remove();
    }

    _loop() {
      if (this.dead) return;
      requestAnimationFrame(this._loop);
      if (this.paused) {
        this.clock.getDelta();
        return;
      }
      const dt = this.clock.getDelta(),
        t = this.clock.elapsedTime,
        now = performance.now();
      if (this.camGoal) {
        this.camera.position.lerp(this.camGoal.pos, 0.07);
        this.controls.target.lerp(this.camGoal.tgt, 0.07);
        if (this.camera.position.distanceTo(this.camGoal.pos) < 0.05) this.camGoal = null;
      }
      const dist = Math.max(
        this.camera.position.distanceTo(this.controls.target),
        Math.hypot(this.camera.position.x, this.camera.position.z) - 6,
      );
      const want = this.cityMode || dist > 58 ? 1 : 0;
      if (Math.abs(want - this.roofA) > 0.001)
        this._setShell(
          this.reduced
            ? want
            : this.roofA + Math.sign(want - this.roofA) * Math.min(Math.abs(want - this.roofA), dt * 2.2),
        );
      // the loft ceiling (beams, ducts, pendants) is only drawn when the camera is inside the room
      if (this.ceil) this.ceil.visible = this.camera.position.y < 5.3;
      // keep the camera above the street and away from the building's underside
      if (this.camera.position.y < -4.5) this.camera.position.y = -4.5;
      if (!this.reduced) {
        this.city.update(dt, t);
        for (const x of this.extras) x.update?.(dt, t, this.camera);
        for (const a of Object.values(this.actors)) {
          const talking = a.talkUntil > now,
            working = a.state === 'working' || talking;
          if (a.trip) this._walk(a, now, t);
          else {
            let mode = talking
              ? 'talk'
              : working || a.key === 'owner' || Math.sin(t * 0.15 + a.phase) > -0.3
                ? 'type'
                : 'idle';
            if (!talking && !working) mode = this._microMode(a, now) || mode;
            // turn the chair (and whoever sits in it) towards a neighbour while they chat
            a.yaw += (a.yawT - a.yaw) * 0.05;
            a.g.rotation.y = a.yaw;
            if (a.chairObj) a.chairObj.rotation.y = Math.PI + a.yaw;
            if (a.deskMug) a.deskMug.visible = mode !== 'sip';
            a.animate(t, mode, a.phase);
          }
          if (a.ring) {
            const col = a.state === 'needs' ? '#ff6b5e' : working ? '#3ccf8e' : a.color;
            a.ring.material.color.set(col);
            a.ring.material.opacity = working || a.state === 'needs' ? 0.55 + Math.sin(t * 5) * 0.35 : 0.5;
            a.ring.scale.setScalar(working ? 1 + Math.sin(t * 5) * 0.06 : 1);
          }
          if (a.talkUntil && a.talkUntil < now) {
            a.label.el.classList.remove('talk');
            a.talkUntil = 0;
            if (a.state === 'working') a.state = 'idle';
          }
        }
        if (this.sign) this.sign.position.y = 4.6 + Math.sin(t * 1.2) * 0.08;
        this._chatTick(now, t);
        this._crowdTick(dt, t, now);
        this._tvAcc = (this._tvAcc || 0) + dt;
        if (this.tv && this._tvAcc > (this.mobile ? 1.6 : 0.8)) {
          this._tvAcc = 0;
          this._tvDraw(t);
        }
        if (this.neonMat && this._neonBase) {
          const f = Math.sin(t * 0.37) > 0.985 ? 0.35 + 0.65 * Math.abs(Math.sin(t * 40)) : 1;
          this.neonMat.emissiveIntensity = this._neonBase * f;
        }
      } else if (!this._still) {
        this._still = true;
        this.city.update(0.016, 0);
        for (const a of Object.values(this.actors)) a.animate(0, 'type', 0);
      }
      this.controls.update();
      if (this.composer && this.tod !== 'day') this.composer.render();
      else this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
    }
  }

  return { Office3D };
})();
