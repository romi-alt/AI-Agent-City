// Compares a git revision of this repository against the migration pack's audit/source-manifest.json.
// Usage: node compare-manifest.mjs <manifest.json> <git-rev>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const [manifestPath, rev] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', rev], { encoding: 'utf8' }).split('\n').filter(Boolean);
const inManifest = new Map(manifest.files.map(f => [f.path, f.sha256]));
const rows = { same: [], changed: [], onlyInRepo: [], onlyInZip: [] };
for (const p of tracked) {
  if (p.startsWith('planning/')) continue;
  const sha = createHash('sha256').update(execFileSync('git', ['show', `${rev}:${p}`])).digest('hex');
  if (!inManifest.has(p)) rows.onlyInRepo.push(p);
  else if (inManifest.get(p) === sha) rows.same.push(p);
  else rows.changed.push(p);
}
for (const p of inManifest.keys()) if (!tracked.includes(p)) rows.onlyInZip.push(p);
console.log(`# ${rev}: ${rows.same.length} identical, ${rows.changed.length} changed, ${rows.onlyInRepo.length} only in repo, ${rows.onlyInZip.length} only in ZIP`);
for (const k of ['changed', 'onlyInRepo', 'onlyInZip']) if (rows[k].length) console.log(`${k}: ${rows[k].join(', ')}`);
