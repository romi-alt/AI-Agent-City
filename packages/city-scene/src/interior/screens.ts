import * as THREE from 'three';
import type { DeskOccupant } from './occupants.ts';
import { statusColor, statusLabel } from './occupants.ts';

/**
 * Desk monitor content: a calm, abstract work UI (title bar, a few text lines, a slowly drawn chart) that changes a
 * little every second or so. No figures: the public city has no live data, and the demo's numbers live in its panels.
 */
export class DeskScreen {
  readonly texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private phase: number;

  constructor(seed: number) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 160;
    this.g = c.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.phase = seed * 1.7;
  }

  draw(o: DeskOccupant | null, t: number) {
    const g = this.g;
    g.fillStyle = '#0d1520';
    g.fillRect(0, 0, 256, 160);
    if (!o) {
      // A free desk: lock screen with a soft gradient.
      const grd = g.createLinearGradient(0, 0, 256, 160);
      grd.addColorStop(0, '#16263a');
      grd.addColorStop(1, '#0d1520');
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 160);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.font = '600 22px system-ui, sans-serif';
      g.fillText('9:41', 16, 40);
      this.texture.needsUpdate = true;
      return;
    }
    const needs = o.status === 'needs-you';
    g.fillStyle = needs ? '#3a1d17' : '#13263a';
    g.fillRect(0, 0, 256, 24);
    g.fillStyle = statusColor(o.status);
    g.beginPath();
    g.arc(14, 12, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8eef5';
    g.font = '600 13px system-ui, sans-serif';
    g.fillText(`${o.name ?? o.role} · ${statusLabel(o.status)}`.slice(0, 30), 26, 17);
    const p = t * 0.6 + this.phase;
    // Text lines: lengths drift slowly so the screen looks alive without flicker.
    for (let i = 0; i < 5; i++) {
      const w = 60 + ((Math.sin(p * 0.7 + i * 1.9) + 1) / 2) * 110;
      g.fillStyle = i === 0 ? 'rgba(245,179,53,0.85)' : 'rgba(200,215,230,0.35)';
      g.fillRect(14, 36 + i * 13, w, 6);
    }
    // A chart panel drawing itself left to right.
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(14, 104, 228, 46);
    g.strokeStyle = needs ? '#ff7a5c' : '#6fb7e8';
    g.lineWidth = 2;
    g.beginPath();
    const reveal = ((p * 0.25) % 1) * 228;
    for (let x = 0; x <= reveal; x += 6) {
      const y = 140 - (Math.sin((x + this.phase * 40) * 0.05) * 0.5 + 0.5) * 28;
      if (x === 0) g.moveTo(14 + x, y);
      else g.lineTo(14 + x, y);
    }
    g.stroke();
    // Blinking caret on the active line.
    if (Math.floor(p * 2) % 2 === 0) {
      g.fillStyle = '#e8eef5';
      g.fillRect(14 + 60 + ((Math.sin(p * 0.7) + 1) / 2) * 110 + 4, 34, 2, 10);
    }
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}

/** The big wall display: the floor's name, what it does and who sits here (from the layout or the host). */
export function drawRoster(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
  subtitle: string,
  info: string | null,
  people: DeskOccupant[],
) {
  g.fillStyle = '#0f1b2d';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#f5b335';
  g.fillRect(0, 0, w, 8);
  g.fillStyle = '#f6f3ec';
  g.font = `700 ${Math.round(h * 0.09)}px system-ui, sans-serif`;
  g.fillText(title.slice(0, 34), w * 0.05, h * 0.17);
  g.fillStyle = '#9fb3c8';
  g.font = `500 ${Math.round(h * 0.055)}px system-ui, sans-serif`;
  g.fillText(subtitle.slice(0, 60), w * 0.05, h * 0.27);
  if (info) {
    g.fillStyle = '#c9d4df';
    g.font = `400 ${Math.round(h * 0.045)}px system-ui, sans-serif`;
    wrap(g, info, w * 0.05, h * 0.37, w * 0.9, h * 0.06, 2);
  }
  const top = h * 0.52;
  const cols = Math.max(1, Math.min(4, people.length));
  const cw = (w * 0.9) / cols;
  people.slice(0, 8).forEach((o, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = w * 0.05 + col * cw;
    const y = top + row * h * 0.22;
    g.fillStyle = '#17283f';
    g.fillRect(x + 4, y, cw - 8, h * 0.19);
    g.fillStyle = statusColor(o.status);
    g.fillRect(x + 4, y, 6, h * 0.19);
    g.fillStyle = '#f6f3ec';
    g.font = `600 ${Math.round(h * 0.05)}px system-ui, sans-serif`;
    g.fillText((o.name ?? (o.kind === 'human' ? 'Team member' : 'AI agent')).slice(0, 16), x + 20, y + h * 0.075);
    g.fillStyle = '#9fb3c8';
    g.font = `400 ${Math.round(h * 0.04)}px system-ui, sans-serif`;
    g.fillText(o.role.slice(0, 22), x + 20, y + h * 0.145);
  });
  if (!people.length) {
    g.fillStyle = '#9fb3c8';
    g.font = `400 ${Math.round(h * 0.05)}px system-ui, sans-serif`;
    g.fillText('This floor is ready for a new team.', w * 0.05, top + h * 0.1);
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, lines: number) {
  const words = text.split(' ');
  let line = '';
  let n = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > max && line) {
      g.fillText(line, x, y + n * lh);
      if (++n >= lines) return;
      line = word;
    } else line = test;
  }
  if (line) g.fillText(line, x, y + n * lh);
}
