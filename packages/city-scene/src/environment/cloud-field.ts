/**
 * The cloud population as plain numbers, so the drawn clouds (Clouds.tsx), the cloud shadows on the ground
 * (cloud-shadow.ts) and the tests all read one source. A "cluster" is one cumulus; it is drawn as a handful of
 * camera-facing puffs. Deterministic: the same layers always give the same sky.
 */

/** Radius of the disc of sky the clouds live in (the sky dome is 1500). Each cloud drifts along its own chord of it. */
export const CLOUD_RADIUS = 1450;
/** Shadows the ground shader can hold at once. */
export const MAX_SHADOWS = 8;

export interface Cluster {
  /** Position of the cloud's flat base, centre of its width. */
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  layer: number;
  /** The cloud exists once the sky's demand passes this (0..1): low thresholds are the first to appear. */
  threshold: number;
  /** Drift speed along +x in world units per second. */
  speed: number;
  /** How much of the sky's demand this layer follows (hero clouds first, the upper layers a little later). */
  follow: number;
}

export interface Puff {
  cluster: number;
  dx: number;
  dy: number;
  dz: number;
  /** Diameter in world units. */
  size: number;
  /** 0..1 random, for the texture flip and the shape's slow change. */
  seed: number;
  /** 0 at the cloud's base to 1 at its top: tops are lit, bases are shaded. */
  rise: number;
}

export interface CloudField {
  clusters: Cluster[];
  puffs: Puff[];
}

interface LayerSpec {
  count: number;
  puffs: number;
  /** Horizontal distance from the city, base altitude, cloud width. */
  dist: [number, number];
  base: [number, number];
  width: [number, number];
  speed: number;
  follow: number;
}

/**
 * Layer 0: a few big hero clouds near the horizon, where Overview and Orbit show sky. Layers 1 and 2: smaller clouds
 * higher up and closer in, drifting faster (parallax); they also throw the shadows that cross the city.
 */
const LAYERS: LayerSpec[] = [
  { count: 6, puffs: 6, dist: [950, 1350], base: [20, 50], width: [650, 950], speed: 5, follow: 1 },
  { count: 7, puffs: 5, dist: [150, 1000], base: [170, 290], width: [260, 420], speed: 8.5, follow: 0.9 },
  { count: 7, puffs: 4, dist: [100, 800], base: [380, 500], width: [200, 340], speed: 13, follow: 0.8 },
];
/** Golden angle: any first few clusters are spread round the whole sky. */
const GOLDEN = 2.399963;
/** Heading the first cloud sits at, so the default views (looking toward -z) have clouds in front. */
const FIRST_AZIMUTH = Math.PI + 0.3;

function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const mix = (r: () => number, [a, b]: [number, number]) => a + (b - a) * r();

/** The clouds of `layers` altitude layers (1..3). */
export function buildCloudField(layers: number, seed = 11): CloudField {
  const rnd = rng(seed);
  const clusters: Cluster[] = [];
  const puffs: Puff[] = [];
  for (let l = 0; l < Math.min(3, Math.max(1, Math.round(layers))); l++) {
    const spec = LAYERS[l]!;
    for (let i = 0; i < spec.count; i++) {
      const az = FIRST_AZIMUTH + i * GOLDEN + l * 1.7;
      const dist = mix(rnd, spec.dist);
      const width = mix(rnd, spec.width);
      const c: Cluster = {
        x: Math.sin(az) * dist,
        y: mix(rnd, spec.base),
        z: Math.cos(az) * dist,
        width,
        height: width * (0.3 + 0.2 * rnd()),
        layer: l,
        threshold: ((i + 0.5) / spec.count) * 0.97,
        speed: spec.speed * (0.85 + 0.3 * rnd()),
        follow: spec.follow,
      };
      clusters.push(c);
      puffs.push(...clusterPuffs(clusters.length - 1, c, spec.puffs, rnd));
    }
  }
  return { clusters, puffs };
}

/** A cumulus: a row of wide puffs along a flat base, with smaller ones piled up in the middle. */
function clusterPuffs(index: number, c: Cluster, n: number, rnd: () => number): Puff[] {
  const out: Puff[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const dome = Math.sin(Math.PI * (0.1 + 0.8 * t));
    const top = i % 2 === 1;
    const size = c.width * (0.24 + 0.16 * dome) * (0.8 + 0.4 * rnd()) * (top ? 0.85 : 1);
    const dy = top ? size * 0.4 + dome * c.height * (0.3 + 0.45 * rnd()) : size * 0.2;
    out.push({
      cluster: index,
      dx: (t - 0.5) * c.width * 0.8 + (rnd() - 0.5) * c.width * 0.1,
      dy,
      dz: (rnd() - 0.5) * c.width * 0.3,
      size,
      seed: rnd(),
      rise: Math.min(1, (dy + size * 0.2) / (c.height + size * 0.4)),
    });
  }
  return out;
}

/** How many clouds the sky asks for: a few when clear, scattered when partly cloudy, all of them when overcast. */
export function cloudDemand(cover: number): number {
  return Math.min(1.2, Math.max(0, 0.12 + cover * 1.1));
}

/** 0..1: how present a cluster is under a demand (it grows in and out smoothly while the weather changes). */
export function clusterPresence(c: Cluster, demand: number): number {
  const x = (demand * c.follow - c.threshold) / 0.1;
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** Puffs swell when it is overcast so the clouds merge into a deck. */
export function sizeBoost(cover: number): number {
  const t = Math.min(1, Math.max(0, (cover - 0.55) / 0.4));
  return 1 + 1.3 * t * t * (3 - 2 * t);
}

/** Half the length of the chord a cloud at depth `z` drifts along inside the cloud disc. */
function chordHalf(z: number): number {
  return Math.sqrt(Math.max(CLOUD_RADIUS * CLOUD_RADIUS - z * z, 1e4));
}

/** Where a cluster is after `time` seconds of drift: it wraps from one end of its chord of the cloud disc to the other. */
export function driftedX(c: Cluster, time: number): number {
  const half = chordHalf(c.z);
  const x = c.x + time * c.speed + half;
  return x - Math.floor(x / (2 * half)) * 2 * half - half;
}

/** Clouds near the end of their chord fade away, so the wrap never shows. */
export function rimFade(x: number, z: number): number {
  const t = Math.min(1, Math.max(0, (Math.abs(x) / chordHalf(z) - 0.72) / 0.28));
  return 1 - t * t * (3 - 2 * t);
}

/** Clouds that are visible (present and not faded out at the rim) at a time and cover. */
export function visibleClusters(field: CloudField, cover: number, time: number): number[] {
  const demand = cloudDemand(cover);
  const out: number[] = [];
  field.clusters.forEach((c, i) => {
    if (clusterPresence(c, demand) * rimFade(driftedX(c, time), c.z) > 0.2) out.push(i);
  });
  return out;
}

/**
 * The ground shadows of the clouds, as (x, z, radius, strength) quadruples for the ground shader: each cloud's
 * shadow lies where the sun's ray through it meets the ground, so shadows drift with the clouds that are drawn.
 * The nearest shadows to the city win when there are more than `MAX_SHADOWS`. `out` is filled and returned.
 */
export function groundShadows(
  field: CloudField,
  cover: number,
  time: number,
  sun: [number, number, number],
  out: Float32Array,
): Float32Array {
  out.fill(0);
  const demand = cloudDemand(cover);
  // At or near overcast the sky is flat and shadows lose their edges.
  const contrast = 1 - Math.min(1, Math.max(0, (cover - 0.7) / 0.25));
  const run = sun[1] > 0.05 ? 1 / sun[1] : 0;
  const found: { x: number; z: number; r: number; s: number; d: number }[] = [];
  for (const c of field.clusters) {
    const x = driftedX(c, time);
    const s = clusterPresence(c, demand) * rimFade(x, c.z) * contrast;
    if (s < 0.02 || !run) continue;
    const alt = c.y + c.height * 0.4;
    const gx = x - sun[0] * run * alt;
    const gz = c.z - sun[2] * run * alt;
    const r = c.width * 0.5;
    const d = Math.hypot(gx, gz) - r;
    if (d < 320) found.push({ x: gx, z: gz, r, s, d });
  }
  found.sort((a, b) => a.d - b.d);
  found.slice(0, MAX_SHADOWS).forEach((f, i) => out.set([f.x, f.z, f.r, f.s], i * 4));
  return out;
}

/** Texture size of the baked cloud sprite. */
export const SPRITE_SIZE = 128;

/** Smooth value noise on a wrapping lattice, so the baked sprite has no seam inside the quad. */
function latticeNoise(x: number, y: number, period: number, seed: number): number {
  const hash = (ix: number, iy: number) => {
    const px = ((ix % period) + period) % period;
    const py = ((iy % period) + period) % period;
    const h = Math.sin(px * 127.1 + py * 311.7 + seed * 74.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * ux;
  const b = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * ux;
  return a + (b - a) * uy;
}

/** One cloud shape: a rounded blob whose edge and body are broken up by noise. 0..1 at (u, v) in 0..1. */
export function puffDensity(u: number, v: number, seed: number): number {
  const px = u * 2 - 1;
  const py = (v * 2 - 1) * 1.1;
  const radius = Math.hypot(px, py);
  let n = 0;
  let amp = 0.5;
  let period = 3;
  for (let o = 0; o < 4; o++) {
    n += amp * latticeNoise(u * period, v * period, period, seed + o);
    amp *= 0.55;
    period *= 2;
  }
  const mask = Math.min(1, Math.max(0, (1 - radius) / 0.65));
  const body = mask * mask * (3 - 2 * mask);
  // Never flat on top: the lumps inside the shape are what the shader lights as a height field.
  return Math.min(1, Math.max(0, body * (0.05 + 1.35 * (n - 0.12))));
}

/** Tileable fine noise (no blob mask): the shader scales it down to break the cloud's edge into small lumps. */
export function detailNoise(u: number, v: number): number {
  return (
    0.55 * latticeNoise(u * 4, v * 4, 4, 5) +
    0.3 * latticeNoise(u * 8, v * 8, 8, 6) +
    0.15 * latticeNoise(u * 16, v * 16, 16, 7)
  );
}

/** The sprite as RGBA bytes: red and green are two shapes the cloud morphs between, blue is the fine detail noise. */
export function bakeCloudSprite(size = SPRITE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const i = (y * size + x) * 4;
      data[i] = Math.round(puffDensity(u, v, 3) * 255);
      data[i + 1] = Math.round(puffDensity(u, v, 17) * 255);
      data[i + 2] = Math.round(detailNoise(u, v) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}
