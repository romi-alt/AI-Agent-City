const fs = require('fs');
const OUT = '/home/user/x06-life/planning/agentcity-migration/x06-life';
const suffix = process.argv[2] || '';
const d = JSON.parse(fs.readFileSync(`${OUT}/lr-traffic${suffix}-log.json`));
const F = d.frames;
// Sim time per frame: the life clock advances by min(frame delta, 0.25 s).
let sim = 0; const times = [0];
for (let i = 1; i < F.length; i++) { sim += Math.min(F[i].t - F[i - 1].t, 0.25); times.push(sim); }
const tracks = [];
let open = [];
F.forEach((fr, i) => {
  const used = new Set(); const next = [];
  for (const c of fr.cars) {
    let best = -1, bd = 1.6;
    open.forEach((tr, k) => { if (used.has(k) || tr.kind !== c[0]) return; const l = tr.rows.at(-1); const dd = Math.hypot(l.x - c[1], l.z - c[2]); if (dd < bd && tr.lastFrame === i - 1) { bd = dd; best = k; } });
    const row = { f: i, t: times[i], x: c[1], z: c[2], yaw: c[3], brake: c[4], odo: c[5], roll: c[6], pitch: c[7] };
    if (best >= 0) { used.add(best); open[best].rows.push(row); open[best].lastFrame = i; next.push(open[best]); }
    else { const tr = { kind: c[0], rows: [row], lastFrame: i }; tracks.push(tr); next.push(tr); }
  }
  open = next;
});
// Speed from displacement along the track (odometer wraps per wheel turn, so use position).
for (const tr of tracks) tr.rows.forEach((r, k) => { r.v = k ? Math.hypot(r.x - tr.rows[k - 1].x, r.z - tr.rows[k - 1].z) / (r.t - tr.rows[k - 1].t || 1) : null; });
const long = tracks.filter(t => t.rows.length >= 12);
const score = t => { const v = t.rows.map(r => r.v).filter(x => x != null); return Math.max(...v) - Math.min(...v); };
long.sort((a, b) => score(b) - score(a));
const pick = long[0];
console.log('frames', F.length, 'sim seconds', sim.toFixed(1), 'tracks', tracks.length, 'long', long.length, 'dt range', Math.min(...times.slice(1).map((t, i) => t - times[i])).toFixed(3), Math.max(...times.slice(1).map((t, i) => t - times[i])).toFixed(3));
if (pick) {
  console.log('tracked', pick.kind, 'rows', pick.rows.length);
  console.log('t,speed,brake,pitch,roll');
  for (const r of pick.rows) console.log([r.t.toFixed(2), r.v == null ? '' : r.v.toFixed(2), r.brake, r.pitch, r.roll].join(','));
  fs.writeFileSync(`${OUT}/lr-traffic${suffix}-track.json`, JSON.stringify({ kind: pick.kind, rows: pick.rows.map(r => ({ t: +r.t.toFixed(2), x: r.x, z: r.z, speed: r.v == null ? null : +r.v.toFixed(3), brake: r.brake, pitch: r.pitch, roll: r.roll })) }));
}
const braking = long.filter(t => t.rows.some(r => r.brake > 0.5));
console.log('tracks seen with brake lights on:', braking.length, 'with |pitch|>0.005:', long.filter(t => t.rows.some(r => Math.abs(r.pitch) > 0.005)).length, 'with |roll|>0.005:', long.filter(t => t.rows.some(r => Math.abs(r.roll) > 0.005)).length);
