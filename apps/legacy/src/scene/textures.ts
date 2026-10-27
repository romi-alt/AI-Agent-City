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

export type FacadeStyle = 'classic' | 'glass' | 'brick' | 'ribbon' | 'showroom';
export const FACADE_STYLES: FacadeStyle[] = ['classic', 'glass', 'brick', 'ribbon'];

/** Window rectangles per style on a 128px floor tile, shared by the facade and its night-glow mask. */
const WINDOWS: Record<FacadeStyle, [number, number, number, number][]> = {
  classic: [[14, 25, 42, 68], [72, 25, 42, 68]],
  glass: [[3, 6, 58, 112], [67, 6, 58, 112]],
  brick: [[22, 30, 30, 58], [76, 30, 30, 58]],
  ribbon: [[0, 34, 32, 50], [32, 34, 32, 50], [64, 34, 32, 50], [96, 34, 32, 50]],
  showroom: [[4, 8, 58, 112], [66, 8, 58, 112]],
};

const shade = (hex: string, k: number) => {
  const c = new THREE.Color(hex);
  return `#${(k < 0 ? c.lerp(new THREE.Color('#000000'), -k) : c.lerp(new THREE.Color('#ffffff'), k)).getHexString()}`;
};

/** One floor-high, two-window-wide facade tile in the building's wall colour and style. */
export function facadeTexture(wall: string, style: FacadeStyle = 'classic') {
  return canvasTex(`facade-${style}-${wall}`, 128, (g, s) => {
    const glassFill = (x: number, y: number, w: number, h: number, tint: string) => {
      const grad = g.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, shade(tint, 0.35));
      grad.addColorStop(0.55, tint);
      grad.addColorStop(1, shade(tint, -0.25));
      g.fillStyle = grad;
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.beginPath(); g.moveTo(x, y + h * 0.7); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.65, y); g.lineTo(x, y + h); g.fill();
    };
    if (style === 'glass') {
      g.fillStyle = shade(wall, -0.35);
      g.fillRect(0, 0, s, s);
      for (const [x, y, w, h] of WINDOWS.glass) glassFill(x, y, w, h, shade(wall, 0.1));
      return;
    }
    g.fillStyle = wall;
    g.fillRect(0, 0, s, s);
    if (style === 'brick') {
      g.strokeStyle = shade(wall, -0.18);
      g.lineWidth = 1;
      for (let y = 0; y < s; y += 8) {
        g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(s, y + 0.5); g.stroke();
        for (let x = (y / 8) % 2 ? 8 : 0; x < s; x += 16) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 8); g.stroke(); }
      }
      for (const [x, y, w, h] of WINDOWS.brick) {
        g.fillStyle = '#f4efe6'; g.fillRect(x - 4, y - 4, w + 8, h + 8);
        glassFill(x, y, w, h, '#5f86a6');
        g.fillStyle = '#f4efe6'; g.fillRect(x + w / 2 - 1, y, 2, h); g.fillRect(x - 6, y + h + 3, w + 12, 4);
      }
      return;
    }
    if (style === 'ribbon') {
      g.fillStyle = shade(wall, -0.12); g.fillRect(0, s - 10, s, 10);
      glassFill(0, 34, s, 50, '#4f7896');
      g.fillStyle = shade(wall, 0.4);
      for (let x = 0; x <= s; x += 32) g.fillRect(x - 2, 34, 4, 50);
      return;
    }
    if (style === 'showroom') {
      for (const [x, y, w, h] of WINDOWS.showroom) glassFill(x, y, w, h, '#7fb4d6');
      g.fillStyle = shade(wall, -0.2); g.fillRect(0, 0, s, 6);
      return;
    }
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, s - 8, s, 8); // floor band
    for (const [x, y, w, h] of WINDOWS.classic) {
      g.fillStyle = '#ffffff';
      g.fillRect(x - 3, y - 3, w + 6, h + 6);
      glassFill(x, y, w, h, '#5f7f99');
    }
  });
}

/** Emissive mask: which windows glow at night. Variant picks a different lit pattern. */
export function windowGlowTexture(variant: number, style: FacadeStyle = 'classic') {
  return canvasTex(`glow-${style}-${variant}`, 128, (g, s) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    WINDOWS[style].forEach(([x, y, w, h], i) => {
      if (style === 'showroom' || ((variant * 5 + 3) >> i) & 1) {
        g.fillStyle = style === 'glass' ? '#cfe6ff' : '#ffd89a';
        g.fillRect(x, y, w, h);
      }
    });
  });
}

/** Zebra crossing stripes, laid across the road. */
export function crosswalkTexture() {
  return canvasTex('crosswalk', 64, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    for (let x = 4; x < s; x += 16) g.fillRect(x, 0, 8, s);
  });
}

/** Vertical sky gradient used as the scene background (screen-space). */
export function skyTexture(top: string, horizon: string) {
  return canvasTex(`sky-${top}-${horizon}`, 256, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, top);
    grad.addColorStop(0.75, horizon);
    grad.addColorStop(1, horizon);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
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

/** Two-lane asphalt: white edge lines and a dashed yellow centre line. Tiles along the road's length. */
export function roadTexture() {
  return canvasTex('road', 64, (g, s) => {
    g.fillStyle = '#4c5157';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      g.fillRect((i * 37) % s, (i * 53) % s, 2, 2);
    }
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(3, 0, 2, s);
    g.fillRect(s - 5, 0, 2, s);
    g.fillStyle = '#f2c94c';
    g.fillRect(s / 2 - 1, 0, 2, s / 2);
  });
}
