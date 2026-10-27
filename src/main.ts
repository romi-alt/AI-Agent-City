import './style.css';
import { city } from './city';
import { dealershipAt, drawCity } from './render';

const canvas = document.querySelector<HTMLCanvasElement>('#city')!;
const panel = document.querySelector<HTMLElement>('#panel')!;
const ctx = canvas.getContext('2d')!;
canvas.width = city.width * city.tileSize;
canvas.height = city.height * city.tileSize;

let selected: string | undefined;

function render() {
  drawCity(ctx, city, selected);
  const d = city.dealerships.find(d => d.id === selected);
  panel.innerHTML = d
    ? `<h2>${d.name}</h2><ul>${d.agents.map(a => `<li><b>${a.role}</b> — ${a.name}</li>`).join('')}</ul>`
    : `<h2>Sales City</h2><p>${city.dealerships.length} dealerships. Click a building to see its agents.</p>`;
}

canvas.addEventListener('click', e => {
  const r = canvas.getBoundingClientRect();
  const scale = canvas.width / r.width;
  selected = dealershipAt(city, (e.clientX - r.left) * scale, (e.clientY - r.top) * scale)?.id;
  render();
});

render();
