// @ts-nocheck
// The hero's night city: the design's scene code, ported as it was written for three r128 (loaded as a global from
// /asc/three.r128.min.js, see AscClient). It is deliberately not rewritten for the newer three the rest of the app
// uses: r128's light units and colour handling are what the scene was tuned against. Everything it starts is undone
// by the function it returns (React runs effects twice in development).
import { CLIENTS } from './data';
import { pick, prefersReducedMotion } from './landing';

export function initHeroCity(hud) {
  const { cityEvent } = hud;
  const REDUCED = prefersReducedMotion();
  const MOBILE = innerWidth < 760;
  const $ = s => document.querySelector(s);
  const THREE = window.THREE;
  const timers = [];
  const offs = [];
  let stopped = false;
  let raf = 0;
  let renderer = null;
  let heroIO = null;
  const towersRef = { list: [] };
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    offs.push(() => target.removeEventListener(type, fn));
  };
  const dispose = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    timers.forEach(clearInterval);
    offs.forEach(f => f());
    heroIO?.disconnect();
    towersRef.list.forEach(t => t.el.remove());
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss?.();
    }
  };

  const hero = $('#hero');
  let gl = null;
  try {
    const c = document.createElement('canvas');
    gl = c.getContext('webgl2') || c.getContext('webgl');
  } catch (e) {}
  if (!window.THREE || !gl) {
    hero.classList.add('no-webgl');
    if (!REDUCED) timers.push(setInterval(() => cityEvent(pick(CLIENTS)), 2600));
    return dispose;
  }

  const canvas = $('#city');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#0b0f22', 0.0062);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 900);

  // lights
  scene.add(new THREE.HemisphereLight('#7f8cff', '#1b0f22', 0.55));
  const moon = new THREE.DirectionalLight('#b4c4ff', 0.55);
  moon.position.set(-120, 200, 80);
  scene.add(moon);
  const warm = new THREE.PointLight('#ff9f43', 1.4, 260, 1.6);
  warm.position.set(0, 40, 0);
  scene.add(warm);

  // ---- textures
  function makeCanvas(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  function windowTex(palette, density) {
    return makeCanvas(128, 256, (g, w, h) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      for (let y = 6; y < h - 4; y += 10)
        for (let x = 5; x < w - 4; x += 9) {
          if (Math.random() < density) {
            g.fillStyle = pick(palette);
            g.globalAlpha = 0.55 + Math.random() * 0.45;
            g.fillRect(x, y, 5, 6);
          }
        }
      g.globalAlpha = 1;
    });
  }
  const WT = [
    windowTex(['#ffd58a', '#ffe7b8', '#ffc46b'], 0.42),
    windowTex(['#bcd6ff', '#9fc1ff', '#ffffff'], 0.38),
    windowTex(['#ffd58a', '#ff9fd6', '#a0f0ff'], 0.3),
  ];
  const glowTex = makeCanvas(128, 128, (g, w) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });

  // ---- ground with roads
  const GRID = MOBILE ? 12 : 16,
    CELL = 12,
    HALF = (GRID * CELL) / 2,
    ROAD_EVERY = 4;
  const isRoad = i => i % ROAD_EVERY === 0;
  const groundTex = makeCanvas(1024, 1024, (g, w) => {
    g.fillStyle = '#0a0d18';
    g.fillRect(0, 0, w, w);
    const px = w / GRID;
    for (let i = 0; i <= GRID; i++)
      if (isRoad(i)) {
        const p = i * px;
        g.fillStyle = '#141a2c';
        g.fillRect(p - px * 0.45, 0, px * 0.9, w);
        g.fillRect(0, p - px * 0.45, w, px * 0.9);
      }
    g.strokeStyle = 'rgba(245,184,61,.55)';
    g.lineWidth = 2;
    g.setLineDash([10, 12]);
    for (let i = 0; i <= GRID; i++)
      if (isRoad(i)) {
        const p = i * px;
        g.beginPath();
        g.moveTo(p, 0);
        g.lineTo(p, w);
        g.stroke();
        g.beginPath();
        g.moveTo(0, p);
        g.lineTo(w, p);
        g.stroke();
      }
    g.setLineDash([]);
    g.strokeStyle = 'rgba(120,140,200,.12)';
    g.lineWidth = 1;
    for (let i = 0; i <= GRID; i++) {
      const p = i * px;
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, w);
      g.stroke();
      g.beginPath();
      g.moveTo(0, p);
      g.lineTo(w, p);
      g.stroke();
    }
  });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID * CELL, GRID * CELL),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9, metalness: 0.1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const outer = new THREE.Mesh(new THREE.CircleGeometry(700, 48), new THREE.MeshBasicMaterial({ color: '#070a14' }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.05;
  scene.add(outer);

  // ---- buildings (instanced, 3 window palettes)
  const cellCenter = i => -HALF + i * CELL + CELL / 2;
  const lots = [];
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      if (isRoad(i) || isRoad(j)) continue;
      lots.push({ i, j, x: cellCenter(i), z: cellCenter(j) });
    }
  // clients get the most central lots, spread around
  const byCenter = lots.slice().sort((a, b) => a.x * a.x + a.z * a.z - (b.x * b.x + b.z * b.z));
  const clientLots = [];
  for (const L of byCenter) {
    if (clientLots.length >= CLIENTS.length) break;
    if (clientLots.every(c => Math.hypot(c.x - L.x, c.z - L.z) > CELL * 2.6)) clientLots.push(L);
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const groups = WT.map(t => ({
    mat: new THREE.MeshStandardMaterial({
      color: '#141a2e',
      roughness: 0.75,
      metalness: 0.25,
      emissive: '#ffffff',
      emissiveMap: t,
      emissiveIntensity: 1.25,
    }),
    items: [],
  }));
  const dummy = new THREE.Object3D();
  for (const L of lots) {
    if (clientLots.includes(L)) continue;
    const d = Math.hypot(L.x, L.z) / HALF;
    const n = Math.random() < 0.35 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const w = n === 2 ? CELL * (0.34 + Math.random() * 0.08) : CELL * (0.6 + Math.random() * 0.22);
      const dpt = CELL * (0.55 + Math.random() * 0.25);
      const h = 6 + Math.random() * 18 + Math.pow(Math.max(0, 1 - d), 2) * 44 * Math.random();
      const ox = n === 2 ? (k ? 1 : -1) * CELL * 0.22 : (Math.random() - 0.5) * 1.2;
      groups[Math.floor(Math.random() * groups.length)].items.push({
        x: L.x + ox,
        z: L.z + (Math.random() - 0.5) * 1.2,
        w,
        d: dpt,
        h,
      });
    }
  }
  groups.forEach(gp => {
    const im = new THREE.InstancedMesh(boxGeo, gp.mat, gp.items.length);
    gp.items.forEach((b, i) => {
      dummy.position.set(b.x, 0, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    scene.add(im);
  });
  // rooftop blinkers on the taller towers
  const blinkers = [];
  groups.forEach(gp =>
    gp.items
      .filter(b => b.h > 34)
      .slice(0, 10)
      .forEach(b => {
        const s = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex,
            color: '#ff4d4d',
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        s.position.set(b.x, b.h + 1.2, b.z);
        s.scale.setScalar(3);
        scene.add(s);
        blinkers.push({ s, ph: Math.random() * 6 });
      }),
  );

  // ---- client towers: glass, accent crown, beacon, label
  const towers = (towersRef.list = CLIENTS.map((c, idx) => {
    const L = clientLots[idx] || byCenter[idx];
    const h = idx === 0 ? 66 : 40 + Math.random() * 22;
    const col = new THREE.Color(c.color);
    const g = new THREE.Group();
    g.position.set(L.x, 0, L.z);
    scene.add(g);
    const tex = windowTex([c.color, '#ffffff', '#ffe7b8'], 0.62);
    const body = new THREE.Mesh(
      boxGeo,
      new THREE.MeshStandardMaterial({
        color: '#10162a',
        roughness: 0.35,
        metalness: 0.6,
        emissive: '#ffffff',
        emissiveMap: tex,
        emissiveIntensity: 1.5,
      }),
    );
    body.scale.set(CELL * 0.7, h, CELL * 0.7);
    g.add(body);
    // glowing edges
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(CELL * 0.7, h, CELL * 0.7)),
      new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9 }),
    );
    edges.position.y = h / 2;
    g.add(edges);
    // stepped crown
    const crown = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: col }));
    crown.scale.set(CELL * 0.5, 2.2, CELL * 0.5);
    crown.position.y = h;
    g.add(crown);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(CELL * 0.55, 0.25, 8, 48),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = h + 4;
    g.add(ring);
    const beacon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: col,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    beacon.position.y = h + 4;
    beacon.scale.setScalar(14);
    g.add(beacon);
    // light column into the sky
    const beamGeo = new THREE.CylinderGeometry(0.6, 2.8, 120, 16, 1, true);
    beamGeo.translate(0, 60, 0);
    const beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.07,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    beam.position.y = h + 4;
    g.add(beam);
    // ground halo
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(CELL * 0.55, CELL * 0.95, 48),
      new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.05;
    g.add(halo);
    // label
    const el = document.createElement('div');
    el.className = 'blabel';
    el.style.setProperty('--c', c.color);
    {
      const dot = document.createElement('i');
      const small = document.createElement('small');
      small.textContent = c.district;
      el.append(dot, c.name, small);
    }
    $('#labels').appendChild(el);
    return { c, g, h, ring, beacon, beam, halo, edges, el, flash: 0, top: new THREE.Vector3(L.x, h + 9, L.z) };
  }));

  // ---- traffic: instanced cars with head and tail lights
  const lanes = [];
  for (let i = 0; i <= GRID; i++)
    if (isRoad(i)) {
      const p = -HALF + i * CELL;
      lanes.push(
        { axis: 'x', c: p - 1.6, dir: 1 },
        { axis: 'x', c: p + 1.6, dir: -1 },
        { axis: 'z', c: p - 1.6, dir: -1 },
        { axis: 'z', c: p + 1.6, dir: 1 },
      );
    }
  const NCARS = MOBILE ? 70 : 150;
  const carGeo = new THREE.BoxGeometry(3.2, 1.1, 1.6);
  carGeo.translate(0, 0.75, 0);
  const carMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 });
  const cars = new THREE.InstancedMesh(carGeo, carMat, NCARS);
  const lightGeo = new THREE.PlaneGeometry(1, 1);
  const heads = new THREE.InstancedMesh(
    lightGeo,
    new THREE.MeshBasicMaterial({
      color: '#fff4d6',
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    NCARS,
  );
  const tails = new THREE.InstancedMesh(
    lightGeo,
    new THREE.MeshBasicMaterial({
      color: '#ff3b3b',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    NCARS,
  );
  const CAR_COLORS = [
    '#e8604c',
    '#f6c445',
    '#3fb6a8',
    '#5aa6e0',
    '#f2f2f2',
    '#2d3142',
    '#9b7fd1',
    '#c0c7d4',
    '#111317',
    '#ff8a3d',
  ].map(x => new THREE.Color(x));
  const carState = [];
  for (let i = 0; i < NCARS; i++) {
    carState.push({ ln: pick(lanes), s: (Math.random() - 0.5) * GRID * CELL, v: 10 + Math.random() * 12 });
    cars.setColorAt(i, pick(CAR_COLORS));
  }
  cars.instanceColor.needsUpdate = true;
  scene.add(cars, heads, tails);
  function placeCars(dt) {
    const lim = HALF + 6;
    for (let i = 0; i < NCARS; i++) {
      const c = carState[i];
      c.s += c.v * c.ln.dir * dt;
      if (c.s > lim) c.s = -lim;
      if (c.s < -lim) c.s = lim;
      const ang = c.ln.axis === 'x' ? (c.ln.dir > 0 ? 0 : Math.PI) : c.ln.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      const x = c.ln.axis === 'x' ? c.s : c.ln.c,
        z = c.ln.axis === 'x' ? c.ln.c : c.s;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, ang, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      cars.setMatrixAt(i, dummy.matrix);
      const fx = Math.cos(ang),
        fz = -Math.sin(ang);
      // headlight beam (flat glow on the road ahead)
      dummy.position.set(x + fx * 4.2, 0.12, z + fz * 4.2);
      dummy.rotation.set(-Math.PI / 2, 0, ang);
      dummy.scale.set(5, 1.8, 1);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x - fx * 1.75, 0.9, z - fz * 1.75);
      dummy.rotation.set(0, ang - Math.PI / 2, 0);
      dummy.scale.set(1.4, 0.35, 1);
      dummy.updateMatrix();
      tails.setMatrixAt(i, dummy.matrix);
    }
    cars.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = tails.instanceMatrix.needsUpdate = true;
  }
  heads.material.opacity = 0.22;

  // ---- street lamps as glow sprites along roads
  const lampMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: '#ffbf66',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.6,
  });
  for (let i = 0; i <= GRID; i++)
    if (isRoad(i))
      for (let s = -HALF; s <= HALF; s += CELL) {
        const p = -HALF + i * CELL;
        [
          [p + 4.4, s],
          [s, p - 4.4],
        ].forEach(([x, z]) => {
          const l = new THREE.Sprite(lampMat);
          l.position.set(x, 5, z);
          l.scale.setScalar(4.5);
          scene.add(l);
        });
      }

  // ---- stars
  {
    const n = 900,
      pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        e = 0.12 + Math.random() * 1.3,
        r = 600;
      pos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(
      new THREE.Points(
        g,
        new THREE.PointsMaterial({
          color: '#cfd8ff',
          size: 1.4,
          sizeAttenuation: false,
          fog: false,
          transparent: true,
          opacity: 0.8,
        }),
      ),
    );
  }

  // ---- lead pulses: comets that fly in from the city edge to a client tower
  const pulses = [];
  const pulseMat = c =>
    new THREE.SpriteMaterial({
      map: glowTex,
      color: c,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  function launchPulse() {
    const t = pick(towers);
    const a = Math.random() * Math.PI * 2,
      r = HALF * 1.6;
    const p0 = new THREE.Vector3(Math.cos(a) * r, 6 + Math.random() * 10, Math.sin(a) * r);
    const p2 = t.top.clone();
    const p1 = p0.clone().lerp(p2, 0.5);
    p1.y += 50 + Math.random() * 40;
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    const head = new THREE.Sprite(pulseMat(t.c.color));
    head.scale.setScalar(6);
    scene.add(head);
    const trail = [];
    for (let k = 0; k < 10; k++) {
      const s = new THREE.Sprite(pulseMat(t.c.color));
      s.material.opacity = 0.55 * (1 - k / 10);
      s.scale.setScalar(4.5 * (1 - k / 12));
      scene.add(s);
      trail.push(s);
    }
    pulses.push({ t, curve, k: 0, v: 0.32 + Math.random() * 0.2, head, trail });
  }
  function updatePulses(dt) {
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.k += p.v * dt;
      const k = Math.min(1, p.k);
      p.head.position.copy(p.curve.getPoint(k));
      p.trail.forEach((s, j) => s.position.copy(p.curve.getPoint(Math.max(0, k - (j + 1) * 0.018))));
      if (p.k >= 1) {
        [p.head, ...p.trail].forEach(s => {
          scene.remove(s);
          s.material.dispose();
        });
        pulses.splice(i, 1);
        p.t.flash = 1;
        p.t.el.classList.remove('ping');
        void p.t.el.offsetWidth;
        p.t.el.classList.add('ping');
        cityEvent(p.t.c);
      }
    }
  }

  // ---- camera: slow orbit + mouse parallax + scroll dive
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  on(
    window,
    'pointermove',
    e => {
      mouse.tx = e.clientX / innerWidth - 0.5;
      mouse.ty = e.clientY / innerHeight - 0.5;
    },
    { passive: true },
  );
  let scrollK = 0;
  on(
    window,
    'scroll',
    () => {
      scrollK = Math.min(1, scrollY / (hero.offsetHeight * 0.9));
    },
    { passive: true },
  );
  const focus = towers[0].g.position;
  function placeCamera(t) {
    const ang = (REDUCED ? 0.6 : t * 0.045) + mouse.x * 0.5;
    const R = (MOBILE ? 230 : 190) * (1 - scrollK * 0.55);
    const H = (MOBILE ? 140 : 105) * (1 - scrollK * 0.5) - mouse.y * 30;
    const tx = focus.x * scrollK,
      tz = focus.z * scrollK;
    camera.position.set(tx + Math.cos(ang) * R, H, tz + Math.sin(ang) * R);
    camera.lookAt(tx, 12 + scrollK * 24, tz);
  }

  // ---- labels follow the towers
  const v3 = new THREE.Vector3();
  function placeLabels(w, h) {
    if (w < 760) {
      towers.forEach(t => {
        t.el.style.opacity = 0;
      });
      return;
    } // phones: beacons only, no clutter
    const placed = [];
    const items = towers
      .map(t => {
        v3.copy(t.top);
        v3.project(camera);
        return { t, z: v3.z, x: (v3.x * 0.5 + 0.5) * w, y: (-v3.y * 0.5 + 0.5) * h };
      })
      .sort((a, b) => b.y - a.y);
    for (const it of items) {
      const ew = it.t.el.offsetWidth || 180,
        eh = 30;
      let y = it.y;
      for (let k = 0; k < 6; k++) {
        const hit = placed.some(p => Math.abs(p.x - it.x) < (p.w + ew) / 2 + 6 && Math.abs(p.y - y) < eh);
        if (!hit) break;
        y -= eh;
      }
      const vis = it.z < 1 && it.x - ew / 2 > w * 0.56 && it.x + ew / 2 < w - 8 && y > 80 && y < h - 40;
      placed.push({ x: it.x, y, w: ew });
      it.t.el.style.opacity = vis ? Math.max(0, 1 - scrollK * 1.2) : 0;
      it.t.el.style.transform = `translate(${it.x}px, ${y}px) translate(-50%,-100%)`;
    }
  }

  // ---- resize + loop (paused when the hero is off screen or the tab is hidden)
  let W = 0,
    H = 0;
  function resize() {
    W = hero.clientWidth;
    H = hero.clientHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = W < 640 ? 58 : 46;
    if (W >= 760) camera.setViewOffset(W, H, -Math.round(W * 0.2), -Math.round(H * 0.04), W, H);
    else camera.setViewOffset(W, H, 0, -Math.round(H * 0.2), W, H);
    camera.updateProjectionMatrix();
  }
  resize();
  on(window, 'resize', resize);
  let running = true;
  heroIO = new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    if (running) last = performance.now();
  });
  heroIO.observe(hero);
  on(document, 'visibilitychange', () => {
    if (!document.hidden) last = performance.now();
  });

  let last = performance.now(),
    nextPulse = 0,
    t = 0;
  function frame(now) {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (!running || document.hidden || window.__ascDemoOpen) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;
    if (!REDUCED) {
      placeCars(dt);
      if (t > nextPulse) {
        launchPulse();
        nextPulse = t + (MOBILE ? 1.6 : 1.0) + Math.random() * 1.4;
      }
      updatePulses(dt);
      blinkers.forEach(b => {
        b.s.material.opacity = Math.max(0, Math.sin(t * 2.2 + b.ph));
      });
    }
    towers.forEach((tw, i) => {
      tw.flash = Math.max(0, tw.flash - dt * 1.4);
      const pulse = 0.5 + 0.5 * Math.sin(t * 2 + i);
      tw.ring.rotation.z = t * 0.6 + i;
      tw.ring.scale.setScalar(1 + tw.flash * 0.6);
      tw.beacon.scale.setScalar(12 + pulse * 4 + tw.flash * 26);
      tw.beam.material.opacity = 0.05 + pulse * 0.03 + tw.flash * 0.2;
      tw.halo.material.opacity = 0.25 + pulse * 0.15 + tw.flash * 0.5;
      tw.halo.scale.setScalar(1 + tw.flash * 0.5);
    });
    warm.intensity = 1.2 + Math.sin(t * 0.7) * 0.2;
    placeCamera(t);
    renderer.render(scene, camera);
    placeLabels(W, H);
  }
  placeCars(0);
  raf = requestAnimationFrame(frame);
  if (REDUCED) timers.push(setInterval(() => cityEvent(pick(CLIENTS)), 4000));

  return dispose;
}
