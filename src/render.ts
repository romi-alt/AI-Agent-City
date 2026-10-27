import type { AgentRole, City, Dealership } from './types';

const ROLE_COLOR: Record<AgentRole, string> = {
  greeter: '#f5c542',
  sales: '#3ecf8e',
  finance: '#a78bfa',
  service: '#f97316',
  manager: '#ffffff',
};

export function drawCity(ctx: CanvasRenderingContext2D, city: City, selected?: string) {
  const t = city.tileSize;
  ctx.fillStyle = '#6aa84f';
  ctx.fillRect(0, 0, city.width * t, city.height * t);

  // Main boulevard between the two rows of dealerships.
  ctx.fillStyle = '#444';
  ctx.fillRect(0, 9 * t, city.width * t, 5 * t);
  ctx.strokeStyle = '#f1c232';
  ctx.setLineDash([t / 2, t / 2]);
  ctx.beginPath();
  ctx.moveTo(0, 11.5 * t);
  ctx.lineTo(city.width * t, 11.5 * t);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const d of city.dealerships) drawDealership(ctx, d, t, d.id === selected);
}

function drawDealership(ctx: CanvasRenderingContext2D, d: Dealership, t: number, selected: boolean) {
  const px = d.x * t, py = d.y * t;
  ctx.fillStyle = '#bbb';
  ctx.fillRect(px - t / 2, py - t / 2, (d.w + 1) * t, (d.h + 1.5) * t); // parking lot
  ctx.fillStyle = d.color;
  ctx.fillRect(px, py, d.w * t, d.h * t);
  ctx.lineWidth = selected ? 3 : 1;
  ctx.strokeStyle = selected ? '#fff' : '#222';
  ctx.strokeRect(px, py, d.w * t, d.h * t);

  ctx.fillStyle = '#fff';
  ctx.font = `bold ${t * 0.5}px system-ui`;
  ctx.fillText(d.brand, px + 4, py - 4);

  for (const a of d.agents) {
    ctx.fillStyle = ROLE_COLOR[a.role];
    ctx.beginPath();
    ctx.arc(px + (a.x + 0.5) * t, py + (a.y + 0.5) * t, t * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function dealershipAt(city: City, px: number, py: number): Dealership | undefined {
  const tx = px / city.tileSize, ty = py / city.tileSize;
  return city.dealerships.find(d => tx >= d.x && tx < d.x + d.w && ty >= d.y && ty < d.y + d.h);
}
