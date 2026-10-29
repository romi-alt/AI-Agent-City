import type { Rgb } from './presets.ts';

/**
 * Balanced and ultra finish with ACES tone mapping in the composer (PostFX.tsx), which greys out a light blue sky and
 * white clouds; the low preset has no composer and shows the sky untouched. To make the sky read as the same blue at
 * every quality, the sky and clouds are given the colour that ACES maps to the intended one. These are three's ACES
 * filmic curve (exposure 1) and its numeric inverse; linear RGB triples throughout.
 */
type Mat = readonly (readonly number[])[];
const IN: Mat = [
  [0.59719, 0.35458, 0.04823],
  [0.076, 0.90834, 0.01566],
  [0.0284, 0.13383, 0.83777],
];
const OUT: Mat = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
];

const mul = (m: Mat, v: Rgb): Rgb => [0, 1, 2].map(i => m[i]![0]! * v[0] + m[i]![1]! * v[1] + m[i]![2]! * v[2]) as Rgb;
const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The colour the composer shows for a linear colour (three's ACESFilmicToneMapping at exposure 1). */
export function acesFilmic(c: Rgb): Rgb {
  const x = mul(IN, [c[0] / 0.6, c[1] / 0.6, c[2] / 0.6]);
  const y = mul(OUT, [fit(x[0]), fit(x[1]), fit(x[2])]);
  return [clamp01(y[0]), clamp01(y[1]), clamp01(y[2])];
}

/** The brightest result of the curve we ask the inverse for: whites above it would need an unbounded input. */
const MAX_TARGET = 0.94;

function solve3(m: number[][], b: Rgb): Rgb {
  const det = (a: number[][]) =>
    a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!) -
    a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!) +
    a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!);
  const d = det(m) || 1e-9;
  const col = (k: number) => det(m.map((row, i) => row.map((v, j) => (j === k ? b[i]! : v))));
  return [col(0) / d, col(1) / d, col(2) / d];
}

/** The linear colour that the composer's ACES maps to `target` (Newton's method on the curve; targets clamped). */
export function invAcesFilmic(target: Rgb): Rgb {
  const t: Rgb = [Math.min(MAX_TARGET, target[0]), Math.min(MAX_TARGET, target[1]), Math.min(MAX_TARGET, target[2])];
  let x: Rgb = [t[0] * 1.3 + 0.01, t[1] * 1.3 + 0.01, t[2] * 1.3 + 0.01];
  const h = 1e-4;
  for (let i = 0; i < 14; i++) {
    const f = acesFilmic(x);
    const r: Rgb = [f[0] - t[0], f[1] - t[1], f[2] - t[2]];
    if (Math.abs(r[0]) + Math.abs(r[1]) + Math.abs(r[2]) < 1e-6) break;
    const cols = [0, 1, 2].map(k => {
      const xp: Rgb = [x[0], x[1], x[2]];
      xp[k] = xp[k]! + h;
      const fp = acesFilmic(xp);
      return [(fp[0] - f[0]) / h, (fp[1] - f[1]) / h, (fp[2] - f[2]) / h];
    });
    const jac = [0, 1, 2].map(row => [0, 1, 2].map(k => cols[k]![row]!));
    const dx = solve3(jac, r);
    x = [Math.max(0, x[0] - dx[0]), Math.max(0, x[1] - dx[1]), Math.max(0, x[2] - dx[2])];
  }
  return x;
}
