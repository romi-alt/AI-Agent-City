const fs = require('fs');
const OUT = '/home/user/x06-life/planning/agentcity-migration/x06-life';
const d = JSON.parse(fs.readFileSync(`${OUT}/lr-birds-log.json`));
const F = d.frames;
let sim = 0; const times = [0];
for (let i = 1; i < F.length; i++) { sim += Math.min(F[i].t - F[i - 1].t, 0.25); times.push(sim); }
const byId = new Map();
F.forEach((fr, i) => fr.birds.forEach(b => { if (!byId.has(b[0])) byId.set(b[0], []); byId.get(b[0]).push({ t: times[i], x: b[1], y: b[2], z: b[3], amp: b[4], wing: b[5], perched: b[6], bank: b[7] }); }));
const flying = [...byId.entries()].filter(([, r]) => r.filter(q => q.perched < 0.5).length > 40);
const score = ([, r]) => { const a = r.map(q => q.amp); return Math.max(...a) - Math.min(...a) + Math.max(...r.map(q => Math.abs(q.bank))); };
flying.sort((a, b) => score(b) - score(a));
console.log('frames', F.length, 'sim s', sim.toFixed(1), 'birds', byId.size, 'flying long', flying.length);
if (flying[0]) {
  const [id, rows] = flying[0];
  console.log('bird', id, 't,amp,bank,y,x,z,perched');
  for (const r of rows.filter((_, i) => i % 2 === 0)) console.log([r.t.toFixed(2), r.amp, r.bank, r.y, r.x, r.z, r.perched].join(','));
  fs.writeFileSync(`${OUT}/lr-birds-track.json`, JSON.stringify({ id, rows }));
}
let glide = 0, flap = 0, banked = 0, n = 0;
for (const [, r] of flying) for (const q of r) { if (q.perched > 0.5) continue; n++; if (q.amp < 0.12) glide++; if (q.amp > 0.5) flap++; if (Math.abs(q.bank) > 0.25) banked++; }
console.log('flying samples', n, 'gliding(amp<0.12)', glide, 'flapping(amp>0.5)', flap, 'banked>0.25rad', banked);
