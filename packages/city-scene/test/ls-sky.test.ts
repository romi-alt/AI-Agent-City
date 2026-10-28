import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bakeCloudSprite,
  buildCloudField,
  CLOUD_RADIUS,
  cloudDemand,
  clusterPresence,
  driftedX,
  groundShadows,
  MAX_SHADOWS,
  rimFade,
  SPRITE_SIZE,
  sizeBoost,
  visibleClusters,
} from '../src/environment/cloud-field.ts';
import { hex, presetFor } from '../src/environment/presets.ts';
import { acesFilmic, invAcesFilmic } from '../src/environment/tonemap.ts';
import { QUALITY } from '../src/quality/quality.ts';
import type { TimeOfDay, Weather } from '../src/types.ts';

const TIMES: TimeOfDay[] = ['day', 'golden', 'evening', 'night'];
const COVER = (w: Weather) => presetFor('day', w).cloudCover;
const field = buildCloudField(3);
const SUN: [number, number, number] = [0.5, 0.77, -0.4];

/** Compass bearing (radians, 0 = +z, clockwise towards +x) of a cluster as seen from the city. */
const bearing = (x: number, z: number) => Math.atan2(x, z);
const angleBetween = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('cloud field', () => {
  it('is deterministic: the same layers give the same sky', () => {
    assert.deepEqual(buildCloudField(3), buildCloudField(3));
    assert.deepEqual(buildCloudField(1).clusters, buildCloudField(3).clusters.slice(0, 6));
  });
  it('keeps its cost bounded per quality preset (puffs are the instance count of the one draw call)', () => {
    const puffs = (q: keyof typeof QUALITY) => buildCloudField(QUALITY[q].cloudLayers).puffs.length;
    assert.ok(puffs('low') <= 40, `low ${puffs('low')}`);
    assert.ok(puffs('low') < puffs('balanced') && puffs('balanced') < puffs('ultra'));
    assert.ok(puffs('ultra') <= 110, `ultra ${puffs('ultra')}`);
  });
  it('has big hero clouds near the horizon and smaller ones above, drifting faster the higher they are', () => {
    const [hero, mid, high] = [0, 1, 2].map(l => field.clusters.filter(c => c.layer === l));
    const mean = (cs: typeof hero, f: (c: (typeof field.clusters)[number]) => number) =>
      cs!.reduce((a, c) => a + f(c), 0) / cs!.length;
    assert.ok(mean(hero, c => c.width) > mean(mid, c => c.width) && mean(mid, c => c.width) > mean(high, c => c.width));
    assert.ok(mean(hero, c => Math.hypot(c.x, c.z)) > mean(high, c => Math.hypot(c.x, c.z)), 'heroes sit farther out');
    assert.ok(mean(hero, c => c.y) < mean(mid, c => c.y) && mean(mid, c => c.y) < mean(high, c => c.y));
    assert.ok(mean(hero, c => c.speed) < mean(mid, c => c.speed) && mean(mid, c => c.speed) < mean(high, c => c.speed));
  });
  it('every puff of a cloud stays on its flat base or above it, with bases flatter than tops', () => {
    for (const p of field.puffs) {
      assert.ok(p.dy >= 0 && p.rise >= 0 && p.rise <= 1 && p.size > 0);
    }
  });
});

describe('coverage by weather', () => {
  it('clear shows few clouds, partly-cloudy scatters them, overcast fills the sky', () => {
    assert.ok(COVER('clear') < COVER('partly-cloudy') && COVER('partly-cloudy') < COVER('overcast'));
    const n = (w: Weather) => visibleClusters(field, COVER(w), 0).length;
    assert.ok(n('clear') >= 2 && n('clear') <= 6, `clear: ${n('clear')} of ${field.clusters.length}`);
    assert.ok(n('partly-cloudy') > n('clear') && n('partly-cloudy') < field.clusters.length * 0.8);
    assert.ok(n('overcast') >= field.clusters.length - 2, `overcast: ${n('overcast')}`);
    assert.ok(COVER('light-rain') >= COVER('overcast'), 'rain keeps its overcast sky');
  });
  it('weather changes grow clouds in smoothly (no pop): presence is continuous in the demand', () => {
    const c = field.clusters[0]!;
    let last = 0;
    for (let d = 0; d <= 1.2; d += 0.01) {
      const p = clusterPresence(c, d);
      assert.ok(p >= last - 1e-9 && p - last < 0.15, `jump at demand ${d}`);
      last = p;
    }
    assert.equal(clusterPresence(c, 0), 0);
    assert.equal(clusterPresence(c, 1.2), 1);
    assert.ok(cloudDemand(0.16) < cloudDemand(0.42) && cloudDemand(0.42) < cloudDemand(0.9));
    assert.ok(sizeBoost(0.9) > 2 && sizeBoost(0.2) === 1, 'overcast puffs swell into a deck');
  });
  it('puts hero clouds in front of the default view (looking toward -z) in clear and partly cloudy weather', () => {
    const front = (w: Weather) =>
      visibleClusters(field, COVER(w), 0).filter(i => {
        const c = field.clusters[i]!;
        return c.layer === 0 && angleBetween(bearing(c.x, c.z), Math.PI) < 0.6;
      }).length;
    assert.ok(front('clear') >= 1, `clear: ${front('clear')}`);
    assert.ok(front('partly-cloudy') >= front('clear'), `partly: ${front('partly-cloudy')}`);
  });
});

describe('drift', () => {
  it('is a pure function of time: the same time gives the same place, and clouds move along +x at their speed', () => {
    const c = field.clusters[3]!;
    assert.equal(driftedX(c, 40), driftedX(c, 40));
    const a = driftedX(c, 10);
    const b = driftedX(c, 20);
    const len = 2 * Math.sqrt(CLOUD_RADIUS ** 2 - c.z ** 2);
    const moved = (((b - a) % len) + len) % len;
    assert.ok(Math.abs(moved - c.speed * 10) < 1e-6, `moved ${moved}`);
  });
  it('wraps inside the cloud disc, and the rim fades so the wrap never shows', () => {
    for (const c of field.clusters) {
      for (const t of [0, 77, 1234, 99999]) {
        const x = driftedX(c, t);
        assert.ok(Math.hypot(x, c.z) <= CLOUD_RADIUS + 1e-6, 'inside the cloud disc');
      }
    }
    assert.equal(rimFade(CLOUD_RADIUS, 0), 0);
    assert.equal(rimFade(0, 0), 1);
  });
  it('moves visibly in a few seconds (parallax: the upper layers faster than the horizon ones)', () => {
    const slow = field.clusters.find(c => c.layer === 0)!;
    const fast = field.clusters.find(c => c.layer === 2)!;
    const shift = (c: typeof slow) => Math.abs(driftedX(c, 6) - driftedX(c, 0)) / Math.hypot(c.x, c.z);
    assert.ok(shift(slow) > 0.02, 'horizon clouds move by more than a hundredth of their distance in 6 s');
    assert.ok(shift(fast) > shift(slow));
  });
});

describe('cloud shadows follow the clouds that are drawn', () => {
  const out = () => new Float32Array(MAX_SHADOWS * 4);
  const count = (a: Float32Array) =>
    Array.from({ length: MAX_SHADOWS }, (_, i) => a[i * 4 + 3]!).filter(s => s > 0).length;
  it('has none when nothing is in the sky and fewer when clear than when partly cloudy', () => {
    assert.equal(count(groundShadows(field, 0, 0, SUN, out())), 0);
    // Scan a few minutes: shadows are over the city only part of the time, and more often with more clouds.
    const total = (cover: number) => {
      let n = 0;
      for (let t = 0; t < 1200; t += 20) n += count(groundShadows(field, cover, t, SUN, out()));
      return n;
    };
    assert.ok(total(COVER('clear')) < total(COVER('partly-cloudy')));
    assert.ok(total(COVER('partly-cloudy')) > 0);
  });
  it('lie where the sun ray through the cloud meets the ground, and move with the cloud', () => {
    const cover = COVER('partly-cloudy');
    const t = 0;
    const shadows = groundShadows(field, cover, t, SUN, out());
    const sources = visibleClusters(field, cover, t).map(i => field.clusters[i]!);
    for (let k = 0; k < MAX_SHADOWS; k++) {
      if (shadows[k * 4 + 3]! <= 0) continue;
      const hit = sources.some(c => {
        const alt = c.y + c.height * 0.4;
        const gx = driftedX(c, t) - (SUN[0] / SUN[1]) * alt;
        const gz = c.z - (SUN[2] / SUN[1]) * alt;
        return Math.hypot(gx - shadows[k * 4]!, gz - shadows[k * 4 + 1]!) < 1e-3;
      });
      assert.ok(hit, `shadow ${k} belongs to a visible cloud`);
    }
    const later = groundShadows(field, cover, 30, SUN, out());
    assert.notDeepEqual(Array.from(later), Array.from(shadows), 'shadows drift');
  });
  it('lose their edge under a flat overcast and when the sun is below the horizon', () => {
    assert.equal(count(groundShadows(field, 0.99, 0, SUN, out())), 0);
    assert.equal(count(groundShadows(field, 0.42, 0, [0.5, 0, 0.5], out())), 0);
  });
});

describe('sprite', () => {
  it('is deterministic, empty at its edge and dense in the middle', () => {
    const a = bakeCloudSprite();
    assert.deepEqual(a, bakeCloudSprite());
    const at = (x: number, y: number, c: number) => a[(y * SPRITE_SIZE + x) * 4 + c]!;
    const m = SPRITE_SIZE / 2;
    for (const c of [0, 1]) {
      assert.equal(at(0, 0, c), 0);
      assert.equal(at(SPRITE_SIZE - 1, m, c), 0);
      assert.ok(at(m, m, c) > 90, `centre ${at(m, m, c)}`);
    }
  });
});

describe('sky presets', () => {
  it('clear daylight is the X04 gradient: #5AA9E6 at the zenith to #D6ECFA at the horizon and in the fog', () => {
    const s = presetFor('day', 'clear');
    assert.deepEqual(s.zenith, hex('#5aa9e6'));
    assert.deepEqual(s.horizon, hex('#d6ecfa'));
    assert.deepEqual(s.fogColor, s.horizon, 'no seam between the fogged skyline and the sky');
  });
  it('keeps the fog thin enough that the low presets never show the edge (see d4)', () => {
    for (const t of TIMES) assert.ok(presetFor(t, 'clear').fogFar <= 240);
  });
  it('every time of day has cloud colours that read against its sky: lit tops brighter than their undersides', () => {
    const lum = (c: number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    for (const t of TIMES) {
      const s = presetFor(t, 'clear');
      assert.ok(lum(s.cloudLit) > lum(s.cloudShade), t);
    }
    const night = presetFor('night', 'clear');
    assert.ok(night.stars > 0 && night.moon > 0, 'stars and moon at night');
    assert.ok(presetFor('night', 'overcast').stars === 0, 'no stars under cloud');
  });
});

describe('tone-mapping compensation for the composer', () => {
  const toSrgb = (l: number) => Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055));
  it('matches what the composer shows (measured in the browser: the fog colour #d6ecfa comes out as 213, 220, 224)', () => {
    assert.deepEqual(acesFilmic(hex('#d6ecfa')).map(toSrgb), [213, 220, 224]);
  });
  it('the inverse maps back to the intended sky and cloud colours at every time of day and weather', () => {
    for (const t of TIMES) {
      for (const w of ['clear', 'overcast'] as Weather[]) {
        const s = presetFor(t, w);
        for (const c of [s.zenith, s.horizon, s.cloudLit, s.cloudShade]) {
          const back = acesFilmic(invAcesFilmic(c));
          const want = c.map(v => Math.min(v, 0.94));
          back.forEach((v, i) => assert.ok(Math.abs(v - want[i]!) < 2e-3, `${t} ${w}: ${v} vs ${want[i]}`));
        }
      }
    }
  });
  it('makes the daytime zenith bluer than the plain mapping would', () => {
    const z = presetFor('day', 'clear').zenith;
    const plain = acesFilmic(z);
    const comp = acesFilmic(invAcesFilmic(z));
    assert.ok(comp[2] / comp[0] > plain[2] / plain[0]);
  });
});
