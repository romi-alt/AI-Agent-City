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

/** Window surrounds are stone grey, not white: a Manhattan wall is limestone, brick and dark glass. */
const STONE: Rgb = [201, 194, 181];
const STONE_DARK: Rgb = [150, 144, 134];
const BRONZE: Rgb = [56, 50, 44];
const STEEL: Rgb = [58, 64, 72];

/** Glass with a vertical sky gradient and a diagonal sheen. `tint` is the mid colour. */
function glass(tint: string, sheenK = 0.22) {
  const base = hex(tint);
  const light = lerp(base, [255, 255, 255], 0.3);
  const dark = lerp(base, [0, 0, 0], 0.35);
  return (u: number, v: number): [Rgb, number, number] => {
    const g = (u * 0.35 + (1 - v)) / 1.35;
    let c = g < 0.5 ? lerp(light, base, g / 0.5) : lerp(base, dark, (g - 0.5) / 0.5);
    const sheen = Math.abs(u - (1 - v) * 0.6 - 0.2) < 0.07;
    if (sheen) c = lerp(c, [255, 255, 255], sheenK);
    return [c, 255, 255];
  };
}
const solid =
  (c: Rgb, a = 255, glassMask = -1) =>
  (): [Rgb, number, number] => [c, a, glassMask];
/** Shade the wall colour (alpha 0 keeps it the building's own colour). */
const wallShade = (k: number) => solid([k * 255, k * 255, k * 255], 0, 0);

/** Pre-war mid-rise: punched double-hung window with a stone lintel and a projecting sill. */
function classic(): Tile {
  const t = tile();
  rect(t, 0, 0, TILE, 4, wallShade(0.88)); // floor band
  rect(t, 13, 9, 38, 3, solid(STONE, 255, 0)); // sill
  rect(t, 16, 12, 32, 44, solid(STONE_DARK, 255, 0)); // reveal
  rect(t, 19, 14, 26, 40, glass('#3a4c5e'));
  rect(t, 19, 33, 26, 2, solid(STONE, 255, 0)); // meeting rail
  rect(t, 31, 14, 2, 40, solid(STONE, 255, 0)); // mullion
  rect(t, 13, 56, 38, 4, solid(STONE, 255, 0)); // lintel
  return t;
}

/** Brick wall with coursing, a darker reveal and a stone sill. */
function brick(): Tile {
  const t = tile();
  for (let y = 0; y < TILE; y += 5) {
    rect(t, 0, y, TILE, 1, wallShade(0.78));
    for (let x = (y / 5) % 2 ? 5 : 0; x < TILE; x += 10) rect(t, x, y, 1, 5, wallShade(0.82));
  }
  rect(t, 17, 11, 30, 44, solid([92, 84, 76], 255, 0));
  rect(t, 20, 14, 24, 38, glass('#38495a'));
  rect(t, 31, 14, 2, 38, solid(STONE_DARK, 255, 0));
  rect(t, 14, 8, 36, 3, solid(STONE, 255, 0));
  return t;
}

/** Mid-century office: a continuous glass ribbon between spandrel panels. */
function ribbon(): Tile {
  const t = tile();
  rect(t, 0, 0, TILE, 6, wallShade(0.86));
  rect(t, 0, 18, TILE, 30, glass('#3a4b5c'));
  rect(t, 0, 16, TILE, 2, solid([126, 128, 132], 255, 0));
  rect(t, 0, 48, TILE, 2, solid([126, 128, 132], 255, 0));
  rect(t, 0, 18, 2, 30, solid([126, 128, 132], 255, 0));
  rect(t, 31, 18, 2, 30, solid([126, 128, 132], 255, 0));
  return t;
}

/** Ground-floor shop: a big display window in a dark bronze frame and a sign band above (under the awning). */
function shop(): Tile {
  const t = tile();
  rect(t, 0, 0, TILE, 5, solid([88, 84, 78], 255, 0)); // stall riser
  rect(t, 0, 5, TILE, 40, solid(BRONZE, 255, 0));
  rect(t, 3, 7, 26, 36, glass('#2a3948'));
  rect(t, 35, 7, 26, 36, glass('#2a3948'));
  rect(t, 0, 48, TILE, 11, solid([34, 31, 29], 255, 0)); // sign band
  rect(t, 0, 59, TILE, 2, solid(STONE, 255, 0));
  return t;
}

/** Ring 2: windows without frames, reads as a pattern at distance. */
function plain(): Tile {
  const t = tile();
  rect(t, 0, 0, TILE, 4, wallShade(0.88));
  rect(t, 18, 15, 28, 36, solid([196, 190, 180], 255, 0)); // light frame
  rect(t, 21, 18, 22, 30, solid([66, 82, 98], 255, 255));
  return t;
}

/** Ring 3: curtain-wall bands, tinted by the tower colour so it stays a soft silhouette. */
function tower(): Tile {
  const t = tile();
  rect(t, 0, 12, TILE, 42, (_u, v) => [[104 + 36 * v, 118 + 34 * v, 136 + 30 * v], 0, 255]);
  rect(t, 30, 12, 3, 42, wallShade(0.8));
  return t;
}

/** Glass curtain wall: fine vertical mullions, a dark spandrel and highly reflective glazing. */
function curtain(): Tile {
  const t = tile();
  rect(t, 0, 0, TILE, 11, solid([34, 44, 54], 255, 0)); // spandrel
  rect(t, 0, 11, TILE, 53, glass('#566f86', 0.28));
  for (const x of [0, 21, 42]) rect(t, x, 11, 2, 53, solid(STEEL, 255, 0));
  rect(t, 0, 62, TILE, 2, solid(STEEL, 255, 0));
  return t;
}

/** Art-deco stone: broad piers, recessed spandrels and tall narrow windows (the Empire State and Chrysler look). */
function deco(): Tile {
  const t = tile();
  rect(t, 0, 0, TILE, 12, wallShade(0.74)); // recessed spandrel
  rect(t, 6, 12, 52, 52, wallShade(0.97));
  rect(t, 24, 14, 16, 46, solid([62, 72, 82], 255, 255));
  rect(t, 24, 14, 16, 46, glass('#44566a', 0.1));
  rect(t, 31, 14, 2, 46, solid(STONE, 255, 0));
  rect(t, 0, 0, 6, TILE, wallShade(1));
  rect(t, 58, 0, 6, TILE, wallShade(1));
  return t;
}

/** Crown tiers: fluted stone with narrow slits of light. */
function crown(): Tile {
  const t = tile();
  rect(t, 0, 0, TILE, TILE, wallShade(0.95));
  for (const x of [8, 20, 32, 44, 56]) rect(t, x, 0, 4, TILE, wallShade(0.78));
  rect(t, 26, 18, 12, 36, glass('#5f7790', 0.1));
  return t;
}

const BUILDERS: Record<keyof typeof STYLE, () => Tile> = {
  classic,
  brick,
  ribbon,
  shop,
  plain,
  tower,
  glass: curtain,
  stone: deco,
  crown,
};

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
