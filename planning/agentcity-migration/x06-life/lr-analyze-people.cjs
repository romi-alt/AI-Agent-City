const fs = require('fs');
const OUT = '/home/user/x06-life/planning/agentcity-migration/x06-life';
const d = JSON.parse(fs.readFileSync(`${OUT}/lr-people-log.json`));
const F = d.frames;
let sim = 0; const times = [0];
for (let i = 1; i < F.length; i++) { sim += Math.min(F[i].t - F[i - 1].t, 0.25); times.push(sim); }
const tracks = []; let open = [];
F.forEach((fr, i) => {
  const used = new Set(); const next = [];
  for (const c of fr.people) {
    let best = -1, bd = 0.8;
    open.forEach((tr, k) => { if (used.has(k) || tr.kind !== c[0] || tr.lastFrame !== i - 1) return; const l = tr.rows.at(-1); const dd = Math.hypot(l.x - c[1], l.z - c[2]); if (dd < bd) { bd = dd; best = k; } });
    const row = { f: i, t: times[i], x: c[1], z: c[2], clip: c[3], frame: c[4], frames: c[5], blend: c[6] };
    if (best >= 0) { used.add(best); open[best].rows.push(row); open[best].lastFrame = i; next.push(open[best]); }
    else { const tr = { kind: c[0], rows: [row], lastFrame: i }; tracks.push(tr); next.push(tr); }
  }
  open = next;
});
for (const tr of tracks) tr.rows.forEach((r, k) => { r.v = k ? Math.hypot(r.x - tr.rows[k - 1].x, r.z - tr.rows[k - 1].z) / (r.t - tr.rows[k - 1].t || 1) : null; r.phase = r.frames ? (r.frame / r.frames) % 1 : 0; });
const long = tracks.filter(t => t.rows.length >= 14);
const moving = long.filter(t => t.rows.some(r => r.v > 0.5));
const stops = long.filter(t => t.rows.some(r => r.v > 0.5) && t.rows.some(r => r.v != null && r.v < 0.05));
console.log('frames', F.length, 'sim s', sim.toFixed(1), 'tracks', tracks.length, 'long', long.length, 'moving', moving.length, 'walk-then-stop', stops.length);
const pick = stops[0] || moving[0] || long[0];
if (pick) {
  console.log('t,speed,stridePhase,idleBlend,x,z');
  for (const r of pick.rows) console.log([r.t.toFixed(2), r.v == null ? '' : r.v.toFixed(2), r.phase.toFixed(3), r.blend, r.x, r.z].join(','));
  fs.writeFileSync(`${OUT}/lr-people-track.json`, JSON.stringify({ kind: pick.kind, rows: pick.rows.map(r => ({ t: +r.t.toFixed(2), x: r.x, z: r.z, speed: r.v == null ? null : +r.v.toFixed(3), stridePhase: +r.phase.toFixed(3), idleBlend: r.blend })) }));
}
// Pairs: tracks of the same kind within 0.9 of each other for most of their life moving together.
let pairs = 0;
for (let a = 0; a < moving.length; a++) for (let b = a + 1; b < moving.length; b++) {
  const A = moving[a].rows, B = moving[b].rows; const common = A.filter(r => B.find(q => q.f === r.f));
  if (common.length < 10) continue;
  const near = common.filter(r => { const q = B.find(q => q.f === r.f); return Math.hypot(r.x - q.x, r.z - q.z) < 1.0; }).length;
  if (near / common.length > 0.9) pairs++;
}
console.log('walking pairs (stay within 1 unit for >90% of frames):', pairs);
