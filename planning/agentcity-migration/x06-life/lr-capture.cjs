// node capture.cjs <scenario> [night]   scenarios: traffic | people | birds
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const OUT = '/home/user/x06-life/planning/agentcity-migration/x06-life';
const scenario = process.argv[2];
const night = process.argv[3] === 'night';
const TIMEOUT = 240000;

// Camera per scenario: eye, target (world units). Birds follow a flock instead.
const CAMS = {
  traffic: { eye: [10, 10, 31], target: [10, 0, 9], frames: 70 },
  people: { eye: [10, 5.5, 25], target: [10, 0.4, 12], frames: 70 },
  birds: { follow: true, frames: 70 },
};

(async () => {
  const cfg = CAMS[scenario];
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('agentcity:arrival-played', '1'); } catch (e) {}
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(TIMEOUT);
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://localhost:3381/city', { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForFunction(() => window.__life && window.__life.scene, null, { timeout: TIMEOUT });
  if (night) {
    await page.getByRole('button', { name: /View settings/ }).click();
    await page.locator('input[value="night"]').first().check({ force: true });
    await page.locator('input[value="ultra"]').first().check({ force: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(20000);
  }
  await page.evaluate(({ cfg, scenario }) => {
    const L = window.__life;
    L.cam = cfg;
    L.follow = null;
    L.frame = (scene, camera) => {
      if (L.cam.follow) {
        if (L.focus) {
          const [fx, fy, fz] = L.focus;
          camera.position.set(fx + 4.5, fy + 1.6, fz + 6);
          camera.lookAt(fx, fy, fz);
        }
      } else {
        camera.position.set(...L.cam.eye);
        camera.lookAt(...L.cam.target);
      }
      camera.updateMatrixWorld(true);
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    };
    // Find the shared animation clock (A1's uTime uniform) among the scene's shader materials.
    const clocks = [];
    L.scene.traverse(o => {
      const u = o.material && o.material.uniforms && o.material.uniforms.uTime;
      if (u && !clocks.includes(u)) clocks.push(u);
    });
    L.clocks = clocks;
    L.t = () => Math.max(...L.clocks.map(c => c.value));
    L.log = [];
    L.shots = 0;
    const meshes = (re) => { const out = []; L.scene.traverse(o => { if (o.isInstancedMesh && re.test(o.name)) out.push(o); }); return out; };
    const near = (x, z) => Math.hypot(x - L.cam.target[0], z - L.cam.target[2]) < 26;
    let last = -1;
    const tick = () => {
      const t = L.t();
      if (t !== last) {
        last = t;
        const rec = { t, wall: performance.now() };
        if (scenario === 'traffic') {
          rec.cars = [];
          for (const m of meshes(/^life-vehicles-/)) {
            const st = m.geometry.getAttribute('iState');
            for (let i = 0; i < m.count; i++) {
              const e = m.instanceMatrix.array;
              const x = e[i * 16 + 12], z = e[i * 16 + 14];
              if (!near(x, z)) continue;
              rec.cars.push([m.name.replace('life-vehicles-', ''), +x.toFixed(3), +z.toFixed(3), +Math.atan2(-e[i * 16 + 2], e[i * 16]).toFixed(3),
                +st.getX(i).toFixed(3), +st.getZ(i).toFixed(4), +Math.asin(Math.max(-1, Math.min(1, e[i * 16 + 9]))).toFixed(4), +Math.asin(Math.max(-1, Math.min(1, e[i * 16 + 1]))).toFixed(4)]);
            }
          }
        } else if (scenario === 'people') {
          rec.people = [];
          for (const m of meshes(/^life-people-/)) {
            const a = m.geometry.getAttribute('iAnimA');
            for (let i = 0; i < m.count; i++) {
              const e = m.instanceMatrix.array;
              const x = e[i * 16 + 12], z = e[i * 16 + 14];
              if (!near(x, z)) continue;
              rec.people.push([m.name.replace('life-people-', ''), +x.toFixed(3), +z.toFixed(3), a.getX(i), +a.getZ(i).toFixed(3), a.getY(i), +a.getW(i).toFixed(3)]);
            }
          }
        } else {
          rec.birds = [];
          const m = meshes(/^life-birds$/)[0];
          const b = m.geometry.getAttribute('iBird');
          let fx = 0, fy = 0, fz = 0, n = 0;
          for (let i = 0; i < m.count; i++) {
            const e = m.instanceMatrix.array;
            const s = Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]);
            if (s < 0.05) continue;
            const amp = b.getY(i), phase = b.getX(i), perched = b.getW(i);
            rec.birds.push([i, +e[i * 16 + 12].toFixed(2), +e[i * 16 + 13].toFixed(2), +e[i * 16 + 14].toFixed(2), +amp.toFixed(3), +(Math.sin(phase) * 0.9 * amp + 0.1).toFixed(3), +perched.toFixed(2), +Math.asin(Math.max(-1, Math.min(1, e[i * 16 + 9] / s))).toFixed(3)]);
            // Follow a flying resident flock: the first bird that is not perched and its neighbours.
          }
          const fly = rec.birds.filter(r => r[6] < 0.5 && r[2] > 6);
          if (fly.length) {
            if (L.follow == null || !fly.find(r => r[0] === L.follow)) L.follow = fly[0][0];
            const lead = fly.find(r => r[0] === L.follow);
            for (const r of fly) if (Math.hypot(r[1] - lead[1], r[2] - lead[2], r[3] - lead[3]) < 14) { fx += r[1]; fy += r[2]; fz += r[3]; n++; }
            L.focus = [fx / n, fy / n, fz / n];
          }
        }
        L.log.push(rec);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, { cfg, scenario });

  // Frame sequence: a screenshot every ~12 logged frames, 6 in all.
  const shots = [];
  for (let k = 0; k < 6; k++) {
    await page.waitForFunction(n => window.__life.log.length >= n, k * 3 + 4, { timeout: TIMEOUT });
    const t = await page.evaluate(() => window.__life.t());
    const file = `${OUT}/lr-${scenario}${night ? '-night' : ''}-${k + 1}.png`;
    await page.screenshot({ path: file, timeout: TIMEOUT });
    shots.push({ file, t });
    console.log('shot', k + 1, 't=', t.toFixed(2));
  }
  await page.waitForFunction(n => window.__life.log.length >= n, cfg.frames, { timeout: TIMEOUT });
  const info = await page.evaluate(() => {
    const out = { log: window.__life.log };
    const calls = window.__life.scene;
    return out;
  });
  const stats = await page.evaluate(() => {
    const L = window.__life;
    let tris = 0, instances = 0;
    const named = {};
    L.scene.traverse(o => {
      if (o.isInstancedMesh && /^life-/.test(o.name)) {
        const idx = o.geometry.index;
        const per = idx ? idx.count / 3 : o.geometry.getAttribute('position').count / 3;
        tris += per * o.count; instances += o.count;
        named[o.name] = { count: o.count, trisPer: per };
      }
      if (o.isPoints && /^life-/.test(o.name)) named[o.name] = { points: o.geometry.drawRange.count };
    });
    return { tris, instances, named };
  });
  fs.writeFileSync(`${OUT}/lr-${scenario}${night ? '-night' : ''}-log.json`, JSON.stringify({ shots, stats, frames: info.log }));
  console.log('logged frames', info.log.length, JSON.stringify(stats).slice(0, 600));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
