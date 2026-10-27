import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** One floor-high, two-window-wide facade tile in the building's wall colour. */
export function facadeTexture(wall: string) {
  return canvasTex(`facade-${wall}`, 128, (g, s) => {
    g.fillStyle = wall;
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, s - 8, s, 8); // floor band
    for (const x of [14, 72]) {
      g.fillStyle = '#ffffff';
      g.fillRect(x - 3, 22, 48, 74);
      g.fillStyle = '#5f7f99';
      g.fillRect(x, 25, 42, 68);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x, 25, 14, 68);
    }
  });
}

/** Emissive mask: which windows glow at night. Variant picks a different lit pattern. */
export function windowGlowTexture(variant: number) {
  return canvasTex(`glow-${variant}`, 128, (g, s) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    [14, 72].forEach((x, i) => {
      if ((variant >> i) & 1) {
        g.fillStyle = '#ffd89a';
        g.fillRect(x, 25, 42, 68);
      }
    });
  });
}

export function woodTexture() {
  return canvasTex('wood', 256, (g, s) => {
    g.fillStyle = '#e8d3b0';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      g.fillStyle = y % 32 ? '#e3cba5' : '#ecd8b8';
      g.fillRect(0, y, s, 15);
      g.fillStyle = 'rgba(120,80,40,0.15)';
      g.fillRect(((y * 37) % s), y, 1, 15);
      g.fillRect(((y * 91) % s), y, 1, 15);
    }
  });
}

export function roadTexture() {
  return canvasTex('road', 64, (g, s) => {
    g.fillStyle = '#5b6066';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#f2d16b';
    g.fillRect(s / 2 - 1, 0, 2, s / 2);
  });
}
