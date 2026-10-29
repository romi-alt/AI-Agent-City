import * as THREE from 'three';
import { seeded } from '../textures.ts';
import { clockHands, PIPELINE_STAGES, funnelShape, WEEK_CHANNELS, WEEK_DAYS, type ArtKind } from './detail.ts';

/**
 * Canvas drawings for the office's detail: framed pictures, patterned rugs, the wall clock, the CRM and content
 * screens, a richer plank floor, a face for the people. All procedural (no downloaded assets) and all text is
 * drawn as text, never parsed as markup. Browser-only: each function makes its own canvas.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

// ── Pictures ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The three prints of the legacy room: sunset hills, abstract shapes and a rising sales chart. */
export function artTexture(kind: ArtKind, w: number, h: number): THREE.CanvasTexture {
  const px = 256;
  const H = Math.round((px * h) / w);
  const [c, g] = canvas(px, H);
  g.fillStyle = kind === 'hills' ? '#f6e3c4' : kind === 'abstract' ? '#d9ece6' : '#fbe0d4';
  g.fillRect(0, 0, px, H);
  if (kind === 'hills') {
    g.fillStyle = '#f29c38';
    g.beginPath();
    g.arc(170, H * 0.45, 40, 0, 7);
    g.fill();
    g.fillStyle = '#3fb6a8';
    g.beginPath();
    g.moveTo(0, H);
    g.quadraticCurveTo(80, H * 0.45, 170, H * 0.8);
    g.quadraticCurveTo(220, H * 0.6, 256, H * 0.75);
    g.lineTo(256, H);
    g.fill();
    g.fillStyle = '#2f7a55';
    g.beginPath();
    g.moveTo(0, H);
    g.quadraticCurveTo(120, H * 0.7, 256, H * 0.9);
    g.lineTo(256, H);
    g.fill();
  } else if (kind === 'abstract') {
    g.fillStyle = '#e8604c';
    g.beginPath();
    g.arc(90, H * 0.35, 50, 0, 7);
    g.fill();
    g.fillStyle = '#f6c445';
    g.fillRect(120, H * 0.5, 90, 90);
    g.fillStyle = '#26324d';
    g.fillRect(40, H * 0.7, 110, 14);
  } else {
    g.strokeStyle = '#26324d';
    g.lineWidth = 8;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    [
      [30, 160],
      [80, 130],
      [120, 140],
      [170, 80],
      [220, 40],
    ].forEach(([x, y], i) => (i ? g.lineTo(x!, (y! * H) / 192) : g.moveTo(x!, (y! * H) / 192)));
    g.stroke();
    g.fillStyle = '#f5b83d';
    g.beginPath();
    g.arc(220, (40 * H) / 192, 12, 0, 7);
    g.fill();
  }
  return tex(c);
}

// ── Rugs ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type RugKind = 'team' | 'lead' | 'lounge' | 'meeting';

const RUG_COLOURS: Record<RugKind, { base: string; border: string; ink: string }> = {
  team: { base: '#efdcc0', border: '#d9a066', ink: '#c98d52' },
  lead: { base: '#e7d2b4', border: '#c9845a', ink: '#b9724a' },
  lounge: { base: '#f2cf9a', border: '#e8604c', ink: '#e8604c' },
  meeting: { base: '#cfe0d4', border: '#3fb6a8', ink: '#3fb6a8' },
};

/**
 * A rug: bordered field with a thin inner rule and a woven pattern per zone (diamonds for the team, stripes for
 * leadership, dots for reception, rings for the meeting corner).
 * `aspect` is width over depth, so the pattern is not stretched.
 */
export function rugTexture(kind: RugKind, aspect: number): THREE.CanvasTexture {
  const W = 512;
  const H = Math.max(128, Math.round(W / aspect));
  const [c, g] = canvas(W, H);
  const col = RUG_COLOURS[kind];
  g.clearRect(0, 0, W, H);
  if (kind === 'meeting') {
    g.fillStyle = col.border;
    g.beginPath();
    g.arc(W / 2, H / 2, W / 2 - 1, 0, 7);
    g.fill();
    g.fillStyle = col.base;
    g.beginPath();
    g.arc(W / 2, H / 2, W / 2 - 24, 0, 7);
    g.fill();
    g.strokeStyle = col.ink;
    g.globalAlpha = 0.4;
    g.lineWidth = 5;
    for (const r of [W / 2 - 52, W / 2 - 110, W / 2 - 170]) {
      g.beginPath();
      g.arc(W / 2, H / 2, r, 0, 7);
      g.stroke();
    }
    g.globalAlpha = 1;
    return tex(c);
  }
  g.fillStyle = col.border;
  roundRect(g, 0, 0, W, H, 18);
  g.fill();
  g.fillStyle = col.base;
  roundRect(g, 18, 18, W - 36, H - 36, 12);
  g.fill();
  g.strokeStyle = col.ink;
  g.globalAlpha = 0.45;
  g.lineWidth = 4;
  roundRect(g, 38, 38, W - 76, H - 76, 8);
  g.stroke();
  g.fillStyle = col.ink;
  g.globalAlpha = 0.22;
  const x0 = 60;
  const x1 = W - 60;
  const y0 = 60;
  const y1 = H - 60;
  if (kind === 'team') {
    for (let y = y0; y < y1 - 20; y += 44)
      for (let x = x0; x < x1 - 20; x += 44) {
        g.beginPath();
        g.moveTo(x + 22, y);
        g.lineTo(x + 44, y + 22);
        g.lineTo(x + 22, y + 44);
        g.lineTo(x, y + 22);
        g.fill();
      }
  } else if (kind === 'lead') {
    for (let y = y0; y < y1 - 14; y += 40) g.fillRect(x0, y, x1 - x0, 14);
  } else {
    for (let y = y0 + 12; y < y1; y += 36)
      for (let x = x0 + 12; x < x1; x += 36) {
        g.beginPath();
        g.arc(x, y, 7, 0, 7);
        g.fill();
      }
  }
  g.globalAlpha = 1;
  return tex(c);
}

// ── Floor ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Light oak planks with grain: staggered boards, each with its own tone, a few long grain strokes, knots and a dark
 * seam. Warmer and more detailed than the plain floor of the cut-away; `size` is the canvas edge in pixels.
 */
export function oakFloorTexture(repeat: [number, number], size: number): THREE.CanvasTexture {
  const [c, g] = canvas(size, size);
  const rnd = seeded(61);
  const rows = 12;
  const h = size / rows;
  g.fillStyle = '#e2c39a';
  g.fillRect(0, 0, size, size);
  for (let row = 0; row < rows; row++) {
    let x = -rnd() * size * 0.5;
    while (x < size) {
      const len = size * (0.28 + rnd() * 0.3);
      const l = 0.94 + rnd() * 0.1;
      g.fillStyle = `rgb(${Math.round(232 * l)},${Math.round(206 * l)},${Math.round(170 * l)})`;
      g.fillRect(x, row * h, len, h);
      g.lineWidth = Math.max(1, size / 512);
      for (let k = 0; k < 4; k++) {
        const y = row * h + (h * (k + 0.5)) / 4 + (rnd() - 0.5) * 3;
        g.strokeStyle = `rgba(150,100,55,${0.08 + rnd() * 0.08})`;
        g.beginPath();
        g.moveTo(x + 4, y);
        g.bezierCurveTo(x + len * 0.3, y + (rnd() - 0.5) * 5, x + len * 0.6, y + (rnd() - 0.5) * 5, x + len - 4, y);
        g.stroke();
      }
      if (rnd() < 0.18) {
        g.fillStyle = 'rgba(130,85,45,0.2)';
        g.beginPath();
        g.ellipse(x + len * (0.2 + rnd() * 0.6), row * h + h / 2, h * 0.16, h * 0.08, 0, 0, 7);
        g.fill();
      }
      g.fillStyle = 'rgba(110,72,38,0.3)';
      g.fillRect(x, row * h, Math.max(1.5, size / 400), h);
      x += len;
    }
    g.fillStyle = 'rgba(110,72,38,0.24)';
    g.fillRect(0, row * h, size, Math.max(1.5, size / 400));
  }
  return tex(c, repeat);
}

// ── Clock ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Draws an analogue clock face (cream dial, tick marks, hour and minute hands, amber hub) for the given time. */
export function drawClock(g: CanvasRenderingContext2D, size: number, hours: number, minutes: number) {
  const k = size / 256;
  const mid = 128 * k;
  g.clearRect(0, 0, size, size);
  g.fillStyle = '#fffaf2';
  g.beginPath();
  g.arc(mid, mid, 120 * k, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 10 * k;
  g.strokeStyle = '#2b2f38';
  g.stroke();
  g.strokeStyle = '#1c2230';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.lineWidth = (i % 3 ? 4 : 8) * k;
    g.beginPath();
    g.moveTo(mid + Math.sin(a) * 92 * k, mid - Math.cos(a) * 92 * k);
    g.lineTo(mid + Math.sin(a) * 106 * k, mid - Math.cos(a) * 106 * k);
    g.stroke();
  }
  const hand = (a: number, len: number, w: number) => {
    g.lineWidth = w * k;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(mid, mid);
    g.lineTo(mid + Math.sin(a) * len * k, mid - Math.cos(a) * len * k);
    g.stroke();
  };
  const a = clockHands(hours, minutes);
  hand(a.hour, 58, 10);
  hand(a.minute, 84, 6);
  g.fillStyle = '#f5b83d';
  g.beginPath();
  g.arc(mid, mid, 9 * k, 0, Math.PI * 2);
  g.fill();
}

// ── Wall screens ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The CRM wall: a pipeline sketched as horizontal bars, narrowing stage by stage. It is a picture of how the
 * pipeline is laid out and says so; the real figures live in the product's own panels.
 */
export function drawCrmWall(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = '#0a0f17';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#6aa8ff';
  g.font = `700 ${Math.round(h * 0.075)}px system-ui, sans-serif`;
  g.fillText('CRM · PIPELINE', w * 0.03, h * 0.11);
  g.fillStyle = '#8792a3';
  g.font = `500 ${Math.round(h * 0.04)}px system-ui, sans-serif`;
  g.textAlign = 'right';
  g.fillText('Sample layout', w * 0.97, h * 0.1);
  g.textAlign = 'left';
  const bars = funnelShape(PIPELINE_STAGES.length);
  const rowH = (h * 0.78) / PIPELINE_STAGES.length;
  PIPELINE_STAGES.forEach((label, i) => {
    const y = h * 0.19 + i * rowH;
    g.fillStyle = '#8792a3';
    g.font = `600 ${Math.round(rowH * 0.3)}px system-ui, sans-serif`;
    g.fillText(label, w * 0.03, y + rowH * 0.5);
    g.fillStyle = '#141c28';
    roundRect(g, w * 0.26, y + rowH * 0.12, w * 0.7, rowH * 0.42, rowH * 0.21);
    g.fill();
    g.fillStyle = i === PIPELINE_STAGES.length - 1 ? '#3ccf8e' : '#6aa8ff';
    roundRect(g, w * 0.26, y + rowH * 0.12, w * 0.7 * bars[i]!, rowH * 0.42, rowH * 0.21);
    g.fill();
  });
}

/** The content-week wall: seven day cards (a title bar, a thumbnail block and text lines each). */
export function drawContentWeek(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = '#0a0f17';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#f5b83d';
  g.font = `700 ${Math.round(h * 0.085)}px system-ui, sans-serif`;
  g.fillText('CONTENT · THIS WEEK', w * 0.025, h * 0.12);
  g.fillStyle = '#8792a3';
  g.font = `500 ${Math.round(h * 0.05)}px system-ui, sans-serif`;
  g.textAlign = 'right';
  g.fillText('Sample plan', w * 0.975, h * 0.11);
  g.textAlign = 'left';
  const gap = w * 0.012;
  const cw = (w * 0.95 - gap * 6) / 7;
  const colours = ['#6aa8ff', '#e8604c', '#3ccf8e', '#f5b83d', '#b78be6', '#3fb6a8', '#8792a3'];
  WEEK_DAYS.forEach((day, i) => {
    const x = w * 0.025 + i * (cw + gap);
    const y = h * 0.2;
    const ch = h * 0.74;
    g.fillStyle = '#121a26';
    roundRect(g, x, y, cw, ch, 10);
    g.fill();
    g.fillStyle = colours[i]!;
    g.fillRect(x, y + 6, 5, ch * 0.12);
    g.fillStyle = '#e8ecf2';
    g.font = `700 ${Math.round(h * 0.07)}px system-ui, sans-serif`;
    g.fillText(day, x + 14, y + ch * 0.12);
    g.fillStyle = '#1c2636';
    roundRect(g, x + 10, y + ch * 0.2, cw - 20, ch * 0.34, 6);
    g.fill();
    g.fillStyle = colours[i]!;
    g.globalAlpha = 0.55;
    roundRect(g, x + 10, y + ch * 0.2, (cw - 20) * (0.45 + ((i * 37) % 40) / 100), ch * 0.34, 6);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(200,215,235,.35)';
    for (let k = 0; k < 3; k++) g.fillRect(x + 10, y + ch * (0.62 + k * 0.08), (cw - 20) * (0.9 - k * 0.2), h * 0.018);
    g.fillStyle = '#8792a3';
    g.font = `600 ${Math.round(h * 0.045)}px system-ui, sans-serif`;
    g.fillText(WEEK_CHANNELS[i]!, x + 10, y + ch * 0.93);
  });
}

// ── Faces ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface FaceLook {
  skin: string;
  glasses: boolean;
  female: boolean;
  lips: string;
}

/**
 * A face for the head sphere: skin tone with brows, eyes (white, iris, highlight), a soft blush, a mouth and optional
 * glasses, drawn where a sphere's +z side maps (u = 0.25). One small canvas per distinct look, shared.
 */
export function faceTexture(look: FaceLook, brow: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  g.fillStyle = look.skin;
  g.fillRect(0, 0, 256, 128);
  const cx = 64; // u = 0.25 of 256
  const cy = 66;
  const eye = (s: number) => {
    const x = cx + s * 15;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(x, cy, 6, look.female ? 5.5 : 4.5, 0, 0, 7);
    g.fill();
    g.fillStyle = '#2a2230';
    g.beginPath();
    g.arc(x, cy + 0.5, 3.2, 0, 7);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x + 1.2, cy - 1, 1.1, 0, 7);
    g.fill();
    g.strokeStyle = brow;
    g.lineWidth = look.female ? 2 : 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - 7, cy - 11 + s * 0.5);
    g.lineTo(x + 7, cy - 12 - s * 0.5);
    g.stroke();
  };
  eye(-1);
  eye(1);
  g.fillStyle = 'rgba(232,120,110,0.25)';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * 24, cy + 12, 7, 4, 0, 0, 7);
    g.fill();
  }
  g.strokeStyle = look.lips;
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(cx, cy + 15, 8, 0.2 * Math.PI, 0.8 * Math.PI);
  g.stroke();
  if (look.glasses) {
    g.strokeStyle = '#20232a';
    g.lineWidth = 2.5;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.roundRect(cx + s * 15 - 11, cy - 8, 22, 16, 5);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(cx - 4, cy - 2);
    g.lineTo(cx + 4, cy - 2);
    g.stroke();
  }
  return tex(c);
}

/** A soft round light pool for the floor under a lamp (warm, fading to nothing at the edge). */
export function lightPoolTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,205,130,0.85)');
  grad.addColorStop(0.5, 'rgba(255,205,130,0.3)');
  grad.addColorStop(1, 'rgba(255,205,130,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

/** A small engraved plate: the text centred on a dark card with an amber rule (desk and door plates). */
export function plateTexture(text: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#26324d';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#f5b83d';
  g.fillRect(0, 58, 256, 6);
  g.textAlign = 'center';
  let size = 34;
  g.font = `700 ${size}px system-ui, sans-serif`;
  const label = text.toUpperCase();
  while (g.measureText(label).width > 236 && size > 14) g.font = `700 ${(size -= 2)}px system-ui, sans-serif`;
  g.fillText(label, 128, 42);
  return tex(c);
}
