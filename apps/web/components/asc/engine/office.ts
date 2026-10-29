// @ts-nocheck
// The Fast Sales HQ floor and the scene that hosts everything (camera, light, time of day).
// Ported unchanged from the AutoSalesCity design file (three r160 code, runs on the app's three). Everything is
// generated in code: no model, texture or image downloads.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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
      hairStyle: 'side',
      hair: '#2a2a2e',
      skin: SKIN[2],
      top: '#26324d',
      jacket: '#26324d',
      tie: '#f5b83d',
      accent: '#ffffff',
      bottom: '#26324d',
      shoes: '#2a1d14',
    },
    vera: {
      gender: 'f',
      hairStyle: 'long',
      hair: '#3a2618',
      skin: SKIN[0],
      top: '#ff6b5e',
      accent: '#ffe2dc',
      bottom: '#2b2f3a',
      skirt: true,
      shoes: '#7a2b2b',
    },
    nico: {
      gender: 'm',
      hairStyle: 'quiff',
      hair: '#5b3a22',
      skin: SKIN[3],
      top: '#818cf8',
      accent: '#ffffff',
      bottom: '#3a4a6b',
      glasses: true,
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
    },
    iris: {
      gender: 'f',
      hairStyle: 'bun',
      hair: '#1d1612',
      skin: SKIN[2],
      top: '#2dd4bf',
      accent: '#e6fffb',
      bottom: '#3a4a6b',
      glasses: true,
    },
    dante: {
      gender: 'm',
      hairStyle: 'side',
      hair: '#8a5a2b',
      skin: SKIN[1],
      accent: '#ffffff',
      bottom: '#4a3b30',
      beard: true,
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
    },
  };
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
      this.mobile = window.innerWidth < 700 || matchMedia('(pointer: coarse)').matches;

      const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 2));
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      el.appendChild(r.domElement);

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
      if (available) this._availableSign(root);
      this._clock(root);
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
    _decor(root) {
      const R = (...a) => this._rug(root, ...a);
      R(3.6, -1.6, 15.6, 9.6, '#efdcc0', '#d9a066'); // team area
      R(-8.2, -5.2, 7.2, 7.4, '#e7d2b4', '#c9845a'); // owner + CEO
      R(11.4, 6.6, 6.6, 6.6, '#cfe0d4', '#3fb6a8', true); // meeting corner
      R(-9.5, 7.6, 6.4, 4.2, '#f2cf9a', '#e8604c'); // reception

      // bookshelves + pictures on the left wall
      this._shelf(root, -15.55, 5.6, Math.PI / 2, 3.2, 2.9);
      this._shelf(root, -15.55, -8.4, Math.PI / 2, 2.6, 2.4);
      this._picture(root, -15.8, 3.1, 5.0, Math.PI / 2, 1.4, 1.0, 0);
      this._picture(root, -15.8, 3.2, 1.7, Math.PI / 2, 1.0, 1.3, 1);
      this._picture(root, -15.8, 3.6, -6.4, Math.PI / 2, 1.2, 0.9, 2);
      // a few pictures on the wooden panel beside the content screen are covered by the screen; add a shelf under it
      const ledge = new THREE.Mesh(
        new RoundedBoxGeometry(9.6, 0.8, 0.55, 2, 0.05),
        new THREE.MeshStandardMaterial({ color: '#f4eee6', roughness: 0.6 }),
      );
      ledge.position.set(2.65, 0.4, -10.5);
      ledge.castShadow = true;
      ledge.receiveShadow = true;
      root.add(ledge);
      const ledgeTop = new THREE.Mesh(new THREE.BoxGeometry(9.7, 0.05, 0.6), this.woodMat);
      ledgeTop.position.set(2.65, 0.82, -10.5);
      root.add(ledgeTop);
      this._plant(root, -1.6, -10.45, 0.6, 'bush', 0.84);
      this._plant(root, 6.9, -10.45, 0.6, 'snake', 0.84);
      this._books(root, 4.4, 0.85, -10.5, 7);

      // plants
      this._plant(root, -14.9, -10.2, 1.25, 'monstera');
      this._plant(root, 15.1, 10.2, 1.2, 'palm');
      this._plant(root, -14.9, 10.1, 1.1, 'monstera');
      this._plant(root, 15.1, -10.2, 1.2, 'palm');
      this._plant(root, -12.6, 9.9, 0.9, 'bush');
      this._plant(root, 15.1, 2.9, 0.9, 'snake');
      this._plant(root, -15.1, 0.9, 0.85, 'bush');

      // coffee corner in front of the back windows
      const counter = new THREE.Mesh(
        new RoundedBoxGeometry(3.4, 0.95, 0.75, 2, 0.05),
        new THREE.MeshStandardMaterial({ color: '#f4eee6', roughness: 0.6 }),
      );
      counter.position.set(-12.3, 0.475, -10.25);
      counter.castShadow = true;
      root.add(counter);
      const ctop = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.06, 0.8), this.woodMat);
      ctop.position.set(-12.3, 0.98, -10.25);
      root.add(ctop);
      const mach = new THREE.Mesh(
        new RoundedBoxGeometry(0.5, 0.6, 0.4, 2, 0.06),
        new THREE.MeshStandardMaterial({ color: '#2b2f38', metalness: 0.6, roughness: 0.3 }),
      );
      mach.position.set(-13.3, 1.31, -10.3);
      mach.castShadow = true;
      root.add(mach);
      const mug = new THREE.MeshStandardMaterial({ color: '#e8604c', roughness: 0.5 });
      [
        [-12.6, 0],
        [-12.35, 1],
        [-11.9, 2],
      ].forEach(([x, i]) => {
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.05, 0.13, 12),
          i === 1 ? new THREE.MeshStandardMaterial({ color: '#3fb6a8' }) : mug,
        );
        m.position.set(x, 1.075, -10.15);
        root.add(m);
      });
      const bowl = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#f6c445', side: THREE.DoubleSide }),
      );
      bowl.position.set(-11.2, 1.2, -10.25);
      root.add(bowl);
      [0, 1, 2].forEach(i => {
        const f = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 10, 8),
          new THREE.MeshStandardMaterial({ color: ['#e8604c', '#7cc36b', '#f29c38'][i] }),
        );
        f.position.set(-11.28 + i * 0.09, 1.13, -10.25 + (i - 1) * 0.05);
        root.add(f);
      });

      // meeting corner (front right): round wooden table + teal chairs + pendant
      const tbl = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.08, 48), this.woodMat);
      tbl.position.set(11.4, 0.78, 6.6);
      tbl.castShadow = true;
      tbl.receiveShadow = true;
      root.add(tbl);
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.35, 0.78, 16),
        new THREE.MeshStandardMaterial({ color: '#2b2f38', roughness: 0.5 }),
      );
      leg.position.set(11.4, 0.39, 6.6);
      root.add(leg);
      for (let i = 0; i < 4; i++)
        this._chair(
          root,
          11.4 + Math.cos((i * Math.PI) / 2 + 0.6) * 1.9,
          6.6 + Math.sin((i * Math.PI) / 2 + 0.6) * 1.9,
          -((i * Math.PI) / 2 + 0.6) - Math.PI / 2,
          '#3fb6a8',
        );
      const laptop = this._laptop('#d7dbe0');
      laptop.position.set(11.0, 0.82, 6.3);
      laptop.rotation.y = 0.6;
      root.add(laptop);
      this._plant(root, 11.6, 6.9, 0.35, 'bush', 0.82);

      // reception: mustard sofa, coffee table, floor lamp
      const sofaM = new THREE.MeshStandardMaterial({ color: '#e2a63b', roughness: 0.85 });
      const sofa = new THREE.Mesh(new RoundedBoxGeometry(3.6, 0.5, 1.1, 3, 0.15), sofaM);
      sofa.position.set(-9.5, 0.35, 8.4);
      sofa.castShadow = true;
      root.add(sofa);
      const back = new THREE.Mesh(new RoundedBoxGeometry(3.6, 0.9, 0.32, 3, 0.14), sofaM);
      back.position.set(-9.5, 0.85, 8.85);
      back.castShadow = true;
      root.add(back);
      [-1, 1].forEach(s => {
        const a = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.75, 1.1, 3, 0.12), sofaM);
        a.position.set(-9.5 + s * 1.75, 0.5, 8.4);
        root.add(a);
      });
      const cushM = [
        new THREE.MeshStandardMaterial({ color: '#3fb6a8', roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ color: '#e8604c', roughness: 0.9 }),
      ];
      [-0.9, 0.9].forEach((x, i) => {
        const c = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.5, 0.18, 3, 0.08), cushM[i]);
        c.position.set(-9.5 + x, 0.85, 8.6);
        c.rotation.x = -0.25;
        root.add(c);
      });
      const ct = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 32), this.woodMat);
      ct.position.set(-9.5, 0.45, 6.9);
      ct.castShadow = true;
      root.add(ct);
      const ctl = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 0.42, 12), leg.material);
      ctl.position.set(-9.5, 0.21, 6.9);
      root.add(ctl);
      this._books(root, -9.6, 0.48, 6.9, 3, true);
      this._floorLamp(root, -11.9, 8.9);
      this._floorLamp(root, 14.6, 8.0);

      // printer + water cooler on the right
      const pr = new THREE.Mesh(
        new RoundedBoxGeometry(0.9, 0.5, 0.7, 2, 0.06),
        new THREE.MeshStandardMaterial({ color: '#e9ecef', roughness: 0.5 }),
      );
      const prStand = new THREE.Mesh(
        new RoundedBoxGeometry(1.0, 0.7, 0.8, 2, 0.04),
        new THREE.MeshStandardMaterial({ color: '#f4eee6', roughness: 0.6 }),
      );
      prStand.position.set(14.9, 0.35, -2.4);
      pr.position.set(14.9, 0.95, -2.4);
      prStand.castShadow = pr.castShadow = true;
      root.add(prStand);
      root.add(pr);
      const cool = new THREE.Mesh(
        new RoundedBoxGeometry(0.5, 1.0, 0.5, 2, 0.06),
        new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.5 }),
      );
      cool.position.set(14.95, 0.5, -0.9);
      cool.castShadow = true;
      root.add(cool);
      const jug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.5, 16),
        new THREE.MeshStandardMaterial({ color: '#7fc7e9', transparent: true, opacity: 0.7, roughness: 0.1 }),
      );
      jug.position.set(14.95, 1.25, -0.9);
      root.add(jug);
    }

    _rug(root, x, z, w, d, base, border, round = false) {
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

    _shelf(root, x, z, rotY, w = 2.6, h = 2.6) {
      const g = new THREE.Group();
      const dep = 0.42,
        t = 0.06;
      const box = (sx, sy, sz, px, py, pz) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), this.woodMat);
        b.position.set(px, py, pz);
        b.castShadow = true;
        b.receiveShadow = true;
        g.add(b);
      };
      box(t, h, dep, -w / 2, h / 2, 0);
      box(t, h, dep, w / 2, h / 2, 0);
      box(w, t, dep, 0, h, 0);
      const rows = 4;
      for (let i = 0; i < rows; i++) box(w, t, dep, 0, 0.1 + i * (h / rows), 0);
      box(w, h, 0.03, 0, h / 2, -dep / 2);
      // books (one instanced mesh)
      const geo = new THREE.BoxGeometry(1, 1, 1),
        mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
      const n = 80,
        im = new THREE.InstancedMesh(geo, mat, n);
      let k = 0;
      const o = new THREE.Object3D(),
        col = new THREE.Color();
      for (let r = 0; r < rows; r++) {
        let bx = -w / 2 + 0.1;
        const y0 = 0.13 + r * (h / rows);
        while (bx < w / 2 - 0.2 && k < n) {
          if (rnd() < 0.12) {
            bx += 0.25 + rnd() * 0.3;
            continue;
          }
          const bw = 0.05 + rnd() * 0.06,
            bh = 0.28 + rnd() * 0.18 * (h / rows / 0.65);
          const lean = rnd() < 0.08 ? 0.25 : 0;
          o.position.set(bx + bw / 2, y0 + Math.min(bh, h / rows - 0.1) / 2, 0.02);
          o.scale.set(bw, Math.min(bh, h / rows - 0.1), 0.26 + rnd() * 0.08);
          o.rotation.set(0, 0, lean);
          o.updateMatrix();
          im.setMatrixAt(k, o.matrix);
          im.setColorAt(k, col.set(BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)]));
          k++;
          bx += bw + 0.008 + (lean ? 0.08 : 0);
        }
      }
      im.count = k;
      im.castShadow = true;
      g.add(im);
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      root.add(g);
      // a small plant on top
      const p = new THREE.Group();
      this._plant(p, 0, 0, 0.35, 'bush', 0);
      p.position.set(x + 0.05, h + 0.03, z - w * 0.3);
      root.add(p);
    }

    _books(root, x, y, z, n, flat = false) {
      for (let i = 0; i < n; i++) {
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(flat ? 0.5 : 0.07, flat ? 0.07 : 0.3 + rnd() * 0.1, flat ? 0.36 : 0.26),
          new THREE.MeshStandardMaterial({ color: BOOK_COLORS[(i * 3 + 1) % BOOK_COLORS.length], roughness: 0.8 }),
        );
        if (flat) {
          b.position.set(x, y + 0.035 + i * 0.07, z);
          b.rotation.y = (rnd() - 0.5) * 0.4;
        } else {
          b.position.set(x + i * 0.085, y + b.geometry.parameters.height / 2, z);
        }
        b.castShadow = true;
        root.add(b);
      }
    }

    _picture(root, x, y, z, rotY, w, h, style) {
      const s = canvasTex(256, Math.round((256 * h) / w));
      const g = s.ctx,
        H = s.c.height;
      const bg = ['#f6e3c4', '#d9ece6', '#fbe0d4'][style];
      g.fillStyle = bg;
      g.fillRect(0, 0, 256, H);
      if (style === 0) {
        // sunset hills
        g.fillStyle = '#f29c38';
        g.beginPath();
        g.arc(170, H * 0.45, 40, 0, 7);
        g.fill();
        g.fillStyle = '#3fb6a8';
        g.beginPath();
        g.moveTo(0, H);
        g.quadraticCurveTo(80, H * 0.45, 170, H * 0.8);
        g.quadraticCurveTo(220, H * 0.6, 256, H * 0.75);
        g.lineTo(256, H);
        g.fill();
        g.fillStyle = '#2f7a55';
        g.beginPath();
        g.moveTo(0, H);
        g.quadraticCurveTo(120, H * 0.7, 256, H * 0.9);
        g.lineTo(256, H);
        g.fill();
      } else if (style === 1) {
        // abstract shapes
        g.fillStyle = '#e8604c';
        g.beginPath();
        g.arc(90, H * 0.35, 50, 0, 7);
        g.fill();
        g.fillStyle = '#f6c445';
        g.fillRect(120, H * 0.5, 90, 90);
        g.fillStyle = '#26324d';
        g.fillRect(40, H * 0.7, 110, 14);
      } else {
        // chart going up (sales!)
        g.strokeStyle = '#26324d';
        g.lineWidth = 8;
        g.lineCap = 'round';
        g.beginPath();
        [
          [30, 160],
          [80, 130],
          [120, 140],
          [170, 80],
          [220, 40],
        ].forEach(([px, py], i) => (i ? g.lineTo(px, (py * H) / 192) : g.moveTo(px, (py * H) / 192)));
        g.stroke();
        g.fillStyle = '#f5b83d';
        g.beginPath();
        g.arc(220, (40 * H) / 192, 12, 0, 7);
        g.fill();
      }
      s.t.needsUpdate = true;
      const grp = new THREE.Group();
      const fr = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.05),
        new THREE.MeshStandardMaterial({ color: style === 1 ? '#2b2f38' : '#b97e4e', roughness: 0.6 }),
      );
      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshStandardMaterial({ map: s.t, roughness: 0.8 }),
      );
      art.position.z = 0.03;
      grp.add(fr);
      grp.add(art);
      grp.position.set(x, y, z);
      grp.rotation.y = rotY;
      root.add(grp);
    }

    _plant(root, x, z, size = 1, type = 'bush', y0 = 0) {
      const g = new THREE.Group();
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.24, 0.6, 20),
        (this._potM ||= new THREE.MeshStandardMaterial({ color: '#c96f4a', roughness: 0.8 })),
      );
      pot.position.y = 0.3;
      g.add(pot);
      const soil = new THREE.Mesh(
        new THREE.CircleGeometry(0.3, 16),
        (this._soilM ||= new THREE.MeshStandardMaterial({ color: '#4a3324' })),
      );
      soil.rotation.x = -Math.PI / 2;
      soil.position.y = 0.58;
      g.add(soil);
      const greens = (this._greens ||= ['#3f9a5c', '#4ea457', '#5fb760', '#2f7a55'].map(
        c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide }),
      ));
      const leafG = (this._leafG ||= (() => {
        const s = new THREE.Shape();
        s.moveTo(0, 0);
        s.bezierCurveTo(0.25, 0.15, 0.22, 0.6, 0, 0.8);
        s.bezierCurveTo(-0.22, 0.6, -0.25, 0.15, 0, 0);
        return new THREE.ShapeGeometry(s, 8);
      })());
      const n = type === 'snake' ? 9 : type === 'palm' ? 12 : type === 'monstera' ? 11 : 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
        const leaf = new THREE.Mesh(leafG, greens[i % greens.length]);
        if (type === 'snake') {
          leaf.scale.set(0.35, 1.3 + rnd() * 0.5, 1);
          leaf.rotation.set(0, a, (rnd() - 0.5) * 0.25);
          leaf.position.set(Math.cos(a) * 0.08, 0.55, Math.sin(a) * 0.08);
        } else if (type === 'palm') {
          leaf.scale.set(0.6, 1.5, 1);
          leaf.rotation.set(0, a, 0);
          leaf.rotateX(-0.6 - rnd() * 0.5);
          leaf.position.set(0, 0.9 + rnd() * 0.5, 0);
        } else if (type === 'monstera') {
          leaf.scale.set(1.3, 1.1, 1);
          leaf.rotation.set(0, a, 0);
          leaf.rotateX(-0.35 - rnd() * 0.7);
          leaf.position.set(0, 0.6 + rnd() * 0.5, 0);
        } else {
          leaf.scale.set(0.7, 0.7, 1);
          leaf.rotation.set(0, a, 0);
          leaf.rotateX(-0.2 - rnd() * 1.0);
          leaf.position.set(0, 0.55 + rnd() * 0.2, 0);
        }
        leaf.castShadow = true;
        g.add(leaf);
      }
      if (type === 'palm') {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.9, 8), this.woodMat);
        st.position.y = 0.95;
        g.add(st);
      }
      pot.castShadow = true;
      g.scale.setScalar(size);
      g.position.set(x, y0, z);
      root.add(g);
      return g;
    }

    _floorLamp(root, x, z) {
      const m = new THREE.MeshStandardMaterial({ color: '#2b2f38', roughness: 0.4, metalness: 0.5 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.05, 20), m);
      base.position.set(x, 0.025, z);
      root.add(base);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 8), m);
      pole.position.set(x, 0.9, z);
      root.add(pole);
      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.38, 0.42, 24, 1, true),
        new THREE.MeshStandardMaterial({
          color: '#f7e0b8',
          roughness: 0.8,
          side: THREE.DoubleSide,
          emissive: '#ffc070',
          emissiveIntensity: 0.4,
        }),
      );
      shade.position.set(x, 1.95, z);
      shade.castShadow = true;
      root.add(shade);
      this.lampMats.push(shade.material);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), this.lampMat);
      b.position.set(x, 1.85, z);
      root.add(b);
    }

    _chair(root, x, z, rotY, color = '#e8862f') {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
      const dark = (this._chairDark ||= new THREE.MeshStandardMaterial({
        color: '#2b2f38',
        roughness: 0.4,
        metalness: 0.5,
      }));
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.12, 0.6, 3, 0.05), m);
      seat.position.y = 0.5;
      g.add(seat);
      const bk = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.66, 0.1, 3, 0.05), m);
      bk.position.set(0, 0.92, 0.3);
      bk.rotation.x = -0.1;
      g.add(bk);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), dark);
      st.position.y = 0.26;
      g.add(st);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const l = new THREE.Mesh((this._chairLegG ||= new THREE.BoxGeometry(0.05, 0.035, 0.3)), dark);
        l.position.set(Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15);
        l.rotation.y = a;
        g.add(l);
        const w = new THREE.Mesh((this._wheelG ||= new THREE.SphereGeometry(0.035, 8, 6)), dark);
        w.position.set(Math.sin(a) * 0.29, 0.035, Math.cos(a) * 0.29);
        g.add(w);
      }
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      g.traverse(o => {
        if (o.isMesh) o.castShadow = true;
      });
      root.add(g);
      return g;
    }

    _laptop(color = '#c9ced6', screenColor = '#1b2533') {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
      const base = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.025, 0.32, 2, 0.01), m);
      base.position.y = 0.012;
      g.add(base);
      const lid = new THREE.Group();
      lid.position.set(0, 0.025, 0.15);
      lid.rotation.x = 0.28;
      g.add(lid);
      const back = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.3, 0.018, 2, 0.008), m);
      back.position.y = 0.15;
      lid.add(back);
      const scr = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.26),
        new THREE.MeshBasicMaterial({ color: screenColor }),
      );
      scr.position.set(0, 0.15, -0.011);
      scr.rotation.y = Math.PI;
      lid.add(scr);
      g.traverse(o => {
        if (o.isMesh) o.castShadow = true;
      });
      return g;
    }

    _desk(root, x, z, accent = '#c9b79c', screenTex = null, empty = false, w = 2.4) {
      const g = new THREE.Group();
      const top = new THREE.Mesh(new RoundedBoxGeometry(w, 0.07, 1.15, 2, 0.03), this.woodMat);
      top.position.y = 0.78;
      g.add(top);
      const white = (this._deskWhite ||= new THREE.MeshStandardMaterial({ color: '#f4eee6', roughness: 0.6 }));
      // drawer unit on the right, slim legs on the left
      const cab = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.72, 1.0, 2, 0.03), white);
      cab.position.set(w / 2 - 0.35, 0.37, 0);
      g.add(cab);
      for (let i = 0; i < 3; i++) {
        const hnd = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.025, 0.03),
          new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4 }),
        );
        hnd.position.set(w / 2 - 0.35, 0.6 - i * 0.22, 0.51);
        g.add(hnd);
      }
      const legM = (this._legM ||= new THREE.MeshStandardMaterial({
        color: '#2b2f38',
        metalness: 0.5,
        roughness: 0.4,
      }));
      [-0.5, 0.5].forEach(dz => {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.76, 8), legM);
        l.position.set(-w / 2 + 0.12, 0.38, dz);
        g.add(l);
      });
      // monitor angled toward the front so the camera can see the agent's activity
      const mon = new THREE.Group();
      const frame = new THREE.Mesh(
        new RoundedBoxGeometry(1.1, 0.68, 0.05, 2, 0.02),
        new THREE.MeshStandardMaterial({ color: '#1c2028', metalness: 0.4, roughness: 0.3 }),
      );
      mon.add(frame);
      const scr = new THREE.Mesh(
        new THREE.PlaneGeometry(1.02, 0.6),
        new THREE.MeshBasicMaterial({
          color: empty ? '#141a22' : '#ffffff',
          map: screenTex || null,
          toneMapped: false,
        }),
      );
      scr.position.z = 0.03;
      mon.add(scr);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), legM);
      stand.position.y = -0.45;
      mon.add(stand);
      const sfoot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.2), legM);
      sfoot.position.y = -0.6;
      mon.add(sfoot);
      mon.position.set(-w / 2 + 0.6, 1.42, -0.25);
      mon.rotation.y = 0.5;
      g.add(mon);
      if (!empty) {
        const lap = this._laptop();
        lap.position.set(0.05, 0.815, -0.22);
        lap.rotation.y = Math.PI;
        g.add(lap);
        const mug = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.05, 0.12, 12),
          new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 }),
        );
        mug.position.set(w / 2 - 0.62, 0.875, -0.3);
        g.add(mug);
        const papers = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.03, 0.4),
          new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
        );
        papers.position.set(-0.55, 0.83, 0.25);
        papers.rotation.y = 0.2;
        g.add(papers);
      } else {
        this._plant(g, 0.2, 0, 0.32, 'bush', 0.815);
      }
      // desk lamp
      const lm = this._legM;
      const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.03, 16), lm);
      lb.position.set(w / 2 - 0.3, 0.83, 0.3);
      g.add(lb);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.46, 6), lm);
      arm.position.set(w / 2 - 0.3, 1.05, 0.3);
      g.add(arm);
      const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 6), lm);
      arm2.position.set(w / 2 - 0.3, 1.26, 0.2);
      arm2.rotation.x = Math.PI / 2 - 0.3;
      g.add(arm2);
      const sh = new THREE.Mesh(
        (this._shadeG ||= new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
        new THREE.MeshStandardMaterial({ color: accent, roughness: 0.45, side: THREE.DoubleSide }),
      );
      sh.position.set(w / 2 - 0.3, 1.25, 0.08);
      g.add(sh);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), this.lampMat);
      bulb.position.set(w / 2 - 0.3, 1.24, 0.08);
      g.add(bulb);
      g.position.set(x, 0, z);
      g.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      root.add(g);
      return g;
    }

    _person(key, color) {
      const look = { ...(LOOKS[key] || FALLBACK[Object.keys(this.actors).length % 2]) };
      if (!look.top) look.top = soften(color, 0.25);
      else if (key !== 'max' && key !== 'owner') look.top = soften(look.top, 0.22);
      const p = makePerson(look);
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

    _agentAt(root, key, x, z, { big = false }) {
      const a = this.info[key] || { name: key, role: '', color: '#6ee7f9' };
      const scr = this._agentScreen(a.color, a.name);
      this._desk(root, x, z, a.color, scr.tex, false, big ? 3.0 : 2.4);
      this._chair(root, x, z - 1.0, Math.PI);
      const p = this._person(key, a.color);
      p.g.position.set(x, 0, z - 1.05);
      root.add(p.g);
      if (big) {
        // CEO: nameplate on the desk
        const s = canvasTex(256, 64);
        s.ctx.fillStyle = '#26324d';
        s.ctx.fillRect(0, 0, 256, 64);
        s.ctx.fillStyle = '#f5b83d';
        s.ctx.font = '700 34px "Space Grotesk", sans-serif';
        s.ctx.textAlign = 'center';
        s.ctx.fillText('CEO', 128, 44);
        s.t.needsUpdate = true;
        const np = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.12, 0.08),
          [0, 0, 0, 0, 1, 0].map(i =>
            i ? new THREE.MeshStandardMaterial({ map: s.t }) : new THREE.MeshStandardMaterial({ color: '#26324d' }),
          ),
        );
        np.position.set(x + 0.3, 0.88, z + 0.45);
        root.add(np);
      }
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
      };
    }

    _ownerDesk(root, human) {
      const { x, z } = OWNER_DESK;
      this._desk(root, x, z, '#f2c879', this.dashTex.t, false, 3.2);
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
      this._chair(root, x, z - 1.0, Math.PI, '#26324d');
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
      };
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
      c.position.set(2.65, 5.3, -10.83);
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
      // keep the camera above the street and away from the building's underside
      if (this.camera.position.y < -4.5) this.camera.position.y = -4.5;
      if (!this.reduced) {
        this.city.update(dt, t);
        for (const x of this.extras) x.update?.(dt, t, this.camera);
        for (const a of Object.values(this.actors)) {
          const talking = a.talkUntil > now,
            working = a.state === 'working' || talking;
          if (a.trip) this._walk(a, now, t);
          else
            a.animate(
              t,
              talking ? 'talk' : working || a.key === 'owner' || Math.sin(t * 0.15 + a.phase) > -0.3 ? 'type' : 'idle',
              a.phase,
            );
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
