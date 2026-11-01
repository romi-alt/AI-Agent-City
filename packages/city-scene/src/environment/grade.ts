/**
 * The city's colour grade: a pure helper that pulls a colour toward its own grey, so the client buildings' pastel
 * brand colours read as real materials (painted metal, stone, brick) in a Midtown street rather than as toys.
 */
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Pulls an sRGB hex colour `k` (0..1) of the way to its luminance grey and scales it by `scale`. */
export function muteHex(hex: string, k: number, scale = 1): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const ch = (v: number) => clamp((v + (l - v) * k) * scale);
  return `#${((ch(r) << 16) | (ch(g) << 8) | ch(b)).toString(16).padStart(6, '0')}`;
}
