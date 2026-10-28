import * as THREE from 'three';

/**
 * Procedural canvas textures for the office (no downloaded assets, so nothing to license). A small seeded random
 * keeps every office the same from visit to visit.
 */

export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat: [number, number], srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Wide-plank oak flooring: staggered planks, each with its own tone and grain. */
export function woodFloorTexture(repeat: [number, number]): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const rnd = seeded(7);
  const plankH = 1024 / 8;
  for (let row = 0; row < 8; row++) {
    let x = -rnd() * 400;
    while (x < 1024) {
      const len = 300 + rnd() * 380;
      const tone = 0.86 + rnd() * 0.18;
      const r = Math.round(196 * tone);
      const gg = Math.round(160 * tone);
      const b = Math.round(118 * tone);
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(x, row * plankH, len, plankH);
      // Grain: long faint strokes.
      for (let k = 0; k < 18; k++) {
        const y = row * plankH + rnd() * plankH;
        g.strokeStyle = `rgba(${rnd() < 0.5 ? '90,60,35' : '255,235,200'},${0.05 + rnd() * 0.08})`;
        g.lineWidth = 1 + rnd() * 2;
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + len * 0.3, y + (rnd() - 0.5) * 8, x + len * 0.7, y + (rnd() - 0.5) * 8, x + len, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(60,40,25,0.55)';
      g.fillRect(x, row * plankH, 2, plankH);
      x += len;
    }
    g.fillStyle = 'rgba(60,40,25,0.45)';
    g.fillRect(0, row * plankH, 1024, 2);
  }
  return toTexture(c, repeat);
}

/** Large-format porcelain / stone tiles with soft veining (showroom floors, reception counter). */
export function stoneTexture(repeat: [number, number], base = '#ece8e1', tiles = 4): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const rnd = seeded(11);
  g.fillStyle = base;
  g.fillRect(0, 0, 1024, 1024);
  for (let k = 0; k < 26; k++) {
    g.strokeStyle = `rgba(120,115,110,${0.05 + rnd() * 0.1})`;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath();
    let x = rnd() * 1024;
    let y = rnd() * 1024;
    g.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (rnd() - 0.3) * 160;
      y += (rnd() - 0.5) * 120;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  if (tiles > 0) {
    g.strokeStyle = 'rgba(150,145,138,0.5)';
    g.lineWidth = 2;
    const step = 1024 / tiles;
    for (let i = 0; i <= tiles; i++) {
      g.beginPath();
      g.moveTo(i * step, 0);
      g.lineTo(i * step, 1024);
      g.moveTo(0, i * step);
      g.lineTo(1024, i * step);
      g.stroke();
    }
  }
  return toTexture(c, repeat);
}

/** Carpet tiles laid in alternating directions (the team area). */
export function carpetTexture(repeat: [number, number]): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const rnd = seeded(5);
  const step = 128;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const v = 112 + Math.round(rnd() * 10);
      g.fillStyle = `rgb(${v},${v + 8},${v + 16})`;
      g.fillRect(i * step, j * step, step, step);
      g.strokeStyle = 'rgba(255,255,255,0.04)';
      for (let k = 0; k < 40; k++) {
        const o = rnd() * step;
        g.beginPath();
        if ((i + j) % 2) {
          g.moveTo(i * step + o, j * step);
          g.lineTo(i * step + o, j * step + step);
        } else {
          g.moveTo(i * step, j * step + o);
          g.lineTo(i * step + step, j * step + o);
        }
        g.stroke();
      }
    }
  }
  return toTexture(c, repeat);
}

/** Fine vertical grain for walnut cladding and table tops. */
export function grainTexture(
  base: string,
  repeat: [number, number],
  dark = 'rgba(40,24,14,0.18)',
): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const rnd = seeded(23);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 140; k++) {
    g.strokeStyle = rnd() < 0.7 ? dark : 'rgba(255,240,220,0.06)';
    g.lineWidth = 0.5 + rnd() * 1.8;
    const x = rnd() * 512;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + (rnd() - 0.5) * 20, 170, x + (rnd() - 0.5) * 20, 340, x + (rnd() - 0.5) * 12, 512);
    g.stroke();
  }
  return toTexture(c, repeat);
}

/** A plain text sign (reception wall). Text is drawn as text: user-supplied names are never parsed. */
export function signTexture(
  lines: { text: string; size: number; color: string; weight?: string }[],
  w = 1024,
  h = 384,
) {
  const [c, g] = canvas(w, h);
  g.clearRect(0, 0, w, h);
  const total = lines.reduce((n, l) => n + l.size * 1.3, 0);
  let y = (h - total) / 2;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (const l of lines) {
    g.fillStyle = l.color;
    // Long names shrink to fit the wall before anything is cut short.
    let size = l.size;
    const font = (px: number) => `${l.weight ?? '600'} ${px}px "Inter", system-ui, sans-serif`;
    g.font = font(size);
    while (g.measureText(l.text).width > w * 0.92 && size > l.size * 0.5) g.font = font((size -= 2));
    let text = l.text;
    while (g.measureText(text).width > w * 0.92 && text.length > 4) text = `${text.slice(0, -2)}…`;
    g.fillText(text, w / 2, y);
    y += l.size * 1.3;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Light warm wood planks for the reference-look office (about #EAD9C2), drawn flat and soft so the room reads as a
 * toy diorama: staggered planks with a faint seam and a little tone change, no heavy grain.
 */
export function plankFloorTexture(repeat: [number, number]): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const rnd = seeded(31);
  const rows = 8;
  const h = 512 / rows;
  for (let row = 0; row < rows; row++) {
    let x = -rnd() * 260;
    while (x < 512) {
      const len = 200 + rnd() * 220;
      const k = (rnd() - 0.5) * 10;
      g.fillStyle = `rgb(${Math.round(234 + k)},${Math.round(217 + k)},${Math.round(194 + k)})`;
      g.fillRect(x, row * h, len, h);
      g.fillStyle = 'rgba(150,110,70,0.10)';
      for (let s = 0; s < 3; s++) g.fillRect(x + rnd() * len, row * h + 6 + rnd() * (h - 12), 30 + rnd() * 80, 1);
      g.fillStyle = 'rgba(140,100,60,0.22)';
      g.fillRect(x, row * h, 1.5, h);
      x += len;
    }
    g.fillStyle = 'rgba(140,100,60,0.18)';
    g.fillRect(0, row * h, 512, 1.5);
  }
  return toTexture(c, repeat);
}

/**
 * One storey of a neighbour's facade, two windows wide: the wall colour with white window frames, glazing bars and
 * sills, like the pastel streets in the legacy floor view. Repeated across and up a whole building.
 */
export function windowGridTexture(wall: string): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = wall;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(0,0,0,0.06)';
  g.fillRect(0, 120, 128, 8);
  for (const x of [16, 72]) {
    g.fillStyle = '#ffffff';
    g.fillRect(x - 4, 22, 48, 78);
    const grad = g.createLinearGradient(x, 26, x + 40, 96);
    grad.addColorStop(0, '#d9ecf7');
    grad.addColorStop(1, '#9cc3dc');
    g.fillStyle = grad;
    g.fillRect(x, 26, 40, 70);
    g.fillStyle = '#ffffff';
    g.fillRect(x + 19, 26, 3, 70);
    g.fillRect(x, 58, 40, 3);
    g.fillRect(x - 7, 100, 54, 6);
  }
  return toTexture(c, [1, 1]);
}

/** The office-mode sky: a vertical gradient used as the screen-space background. */
export function skyGradientTexture(top: string, horizon: string): THREE.CanvasTexture {
  const [c, g] = canvas(4, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.75, horizon);
  grad.addColorStop(1, horizon);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A small framed print: soft pastel shapes on cream, different per seed. */
export function pictureTexture(seed: number): THREE.CanvasTexture {
  const [c, g] = canvas(128, 160);
  const rnd = seeded(seed * 13 + 1);
  const colours = ['#e9806b', '#f2c14e', '#3bb8a8', '#7baad6', '#f2a2b8', '#8fd3a6'];
  g.fillStyle = '#f6efe3';
  g.fillRect(0, 0, 128, 160);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = colours[Math.floor(rnd() * colours.length)]!;
    g.beginPath();
    if (i % 2) g.arc(20 + rnd() * 88, 30 + rnd() * 100, 14 + rnd() * 22, 0, Math.PI * 2);
    else g.rect(10 + rnd() * 60, 20 + rnd() * 80, 30 + rnd() * 40, 20 + rnd() * 40);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
