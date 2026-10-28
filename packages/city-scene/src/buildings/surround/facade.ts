/**
 * The facade kit of the surround, ported from the legacy `textures.ts` facade styles (classic, brick, ribbon) and the
 * legacy shopfront, as one small texture array: each style is one floor high and one window bay wide, so the shader
 * tiles it over any box. Layer 2k is the albedo, layer 2k + 1 the glass mask that lights up at night.
 *
 * Albedo alpha says what the pixel is: 0 = wall (its rgb shades the building's own colour, so one texture serves
 * every pastel), 1 = its own colour (white window frames, glass). Generated in plain JS, so tests need no canvas.
 */
import { DataArrayTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';
import { STYLE } from './plan.ts';

/** Texels per tile side. */
export const TILE = 64;
/** World width of one window bay; a floor is FLOOR_HEIGHT high. */
export const BAY = 1.3;
/** Boxes reach this far below their base, so they stay grounded whatever the ground height under them. */
export const SINK = 0.35;
export const STYLE_COUNT = Object.keys(STYLE).length;

type Rgb = [number, number, number];
interface Tile {
  albedo: Uint8Array;
  mask: Uint8Array;
}

const hex = (h: string): Rgb => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map(i => a[i]! + (b[i]! - a[i]!) * t) as Rgb;

function tile(): Tile {
  const albedo = new Uint8Array(TILE * TILE * 4);
  const mask = new Uint8Array(TILE * TILE * 4);
  for (let i = 0; i < TILE * TILE; i++) {
    albedo.set([255, 255, 255, 0], i * 4); // plain wall
    mask.set([0, 0, 0, 255], i * 4);
  }
  return { albedo, mask };
}

/** Rectangle in texels, y up from the floor line (row 0 is the bottom of the floor). */
function rect(
  t: Tile,
  x: number,
  y: number,
  w: number,
  h: number,
  paint: (u: number, v: number) => [Rgb, number, number],
) {
  for (let j = Math.max(0, y); j < Math.min(TILE, y + h); j++)
    for (let i = Math.max(0, x); i < Math.min(TILE, x + w); i++) {
      const [c, a, glass] = paint((i - x) / w, (j - y) / h);
      const k = (j * TILE + i) * 4;
      t.albedo.set([c[0], c[1], c[2], a], k);
      if (glass >= 0) t.mask.set([glass, glass, glass, 255], k);
    }
}

const WHITE: Rgb = [250, 248, 244];

/** Glass with the legacy gradient and a diagonal sheen. */
function glass(tint: string) {
  const base = hex(tint);
  const light = lerp(base, [255, 255, 255], 0.35);
  const dark = lerp(base, [0, 0, 0], 0.25);
  return (u: number, v: number): [Rgb, number, number] => {
    const g = (u + (1 - v)) / 2;
    let c = g < 0.55 ? lerp(light, base, g / 0.55) : lerp(base, dark, (g - 0.55) / 0.45);
    const sheen = Math.abs(u - (1 - v) * 0.6 - 0.2) < 0.08;
    if (sheen) c = lerp(c, [255, 255, 255], 0.28);
    return [c, 255, 255];
  };
}
const solid =
  (c: Rgb, a = 255, glassMask = -1) =>
  (): [Rgb, number, number] => [c, a, glassMask];
/** Shade the wall colour (alpha 0 keeps it the building's own colour). */
const wallShade = (k: number) => solid([k * 255, k * 255, k * 255], 0, 0);

function classic(): Tile {
  const t = tile();
  rect(t, 0, 0, TILE, 5, wallShade(0.86)); // floor band
  rect(t, 15, 13, 34, 42, solid(WHITE, 255, 0)); // white frame
  rect(t, 18, 16, 28, 36, glass('#5f7f99'));
  rect(t, 31, 16, 2, 36, solid(WHITE, 255, 0)); // mullion
  rect(t, 12, 11, 40, 3, solid(WHITE, 255, 0)); // sill
  return t;
}

function brick(): Tile {
  const t = tile();
  for (let y = 0; y < TILE; y += 6) {
    rect(t, 0, y, TILE, 1, wallShade(0.8));
    for (let x = (y / 6) % 2 ? 6 : 0; x < TILE; x += 12) rect(t, x, y, 1, 6, wallShade(0.82));
  }
  rect(t, 17, 12, 30, 44, solid(WHITE, 255, 0));
  rect(t, 20, 15, 24, 38, glass('#5f86a6'));
  rect(t, 31, 15, 2, 38, solid(WHITE, 255, 0));
  rect(t, 14, 9, 36, 4, solid(WHITE, 255, 0));
  return t;
}

function ribbon(): Tile {
  const t = tile();
  rect(t, 0, 0, TILE, 6, wallShade(0.88));
  rect(t, 0, 18, TILE, 30, glass('#4f7896'));
  rect(t, 0, 16, TILE, 2, solid(WHITE, 255, 0));
  rect(t, 0, 48, TILE, 2, solid(WHITE, 255, 0));
  rect(t, 0, 18, 2, 30, solid(WHITE, 255, 0));
  rect(t, 62, 18, 2, 30, solid(WHITE, 255, 0));
  return t;
}

/** Ground-floor shop: a big display window in a white frame and a sign band above (under the awning). */
function shop(): Tile {
  const t = tile();
  rect(t, 0, 0, TILE, 4, solid([120, 116, 110], 255, 0)); // stall riser
  rect(t, 0, 4, TILE, 40, solid(WHITE, 255, 0));
  rect(t, 3, 6, 58, 36, glass('#3f5a6e'));
  rect(t, 0, 50, TILE, 10, solid([240, 236, 226], 255, 0)); // sign band
  return t;
}

/** Ring 2: windows without frames, reads as a pattern at distance. */
function plain(): Tile {
  const t = tile();
  rect(t, 0, 0, TILE, 4, wallShade(0.88));
  rect(t, 18, 15, 28, 36, solid([236, 234, 228], 255, 0)); // light frame
  rect(t, 21, 18, 22, 30, solid([112, 134, 156], 255, 255));
  return t;
}

/** Ring 3: pale curtain-wall bands, tinted by the tower colour so it stays a soft silhouette. */
function tower(): Tile {
  const t = tile();
  rect(t, 0, 14, TILE, 40, (_u, v) => [[205 + 20 * v, 214 + 18 * v, 226 + 14 * v], 0, 255]);
  rect(t, 30, 14, 3, 40, wallShade(1));
  return t;
}

const BUILDERS: Record<keyof typeof STYLE, () => Tile> = { classic, brick, ribbon, shop, plain, tower };

/** All layers, in STYLE order: albedo then glass mask per style. */
export function facadePixels(): Uint8Array {
  const out = new Uint8Array(TILE * TILE * 4 * STYLE_COUNT * 2);
  for (const [name, index] of Object.entries(STYLE)) {
    const t = BUILDERS[name as keyof typeof STYLE]();
    out.set(t.albedo, TILE * TILE * 4 * index * 2);
    out.set(t.mask, TILE * TILE * 4 * (index * 2 + 1));
  }
  return out;
}

export function createFacadeTexture(): DataArrayTexture {
  const tex = new DataArrayTexture(facadePixels(), TILE, TILE, STYLE_COUNT * 2);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
