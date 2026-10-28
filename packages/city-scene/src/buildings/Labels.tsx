'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { type Camera, Vector3 } from 'three';
import { useCityContext } from '../context.tsx';
import { explodeRuntime, floorOffset } from './explode.ts';
import { simulatedActivity } from './activity.ts';

export interface LabelItem {
  key: string;
  /** Full name (hover title, accessible name) and the short brand label shown on the tag. */
  name: string;
  short: string;
  x: number;
  y: number;
  z: number;
  /** Floor count: the label rises with the top floor when the building is exploded. */
  floors: number;
  /** AI desks in the building (the "y" of "x/y working"), and rentable floors (rentals). */
  desks: number;
  forRent: number;
}

const PILL =
  'position:absolute;left:0;top:0;display:none;align-items:center;gap:6px;white-space:nowrap;padding:5px 10px 5px 9px;' +
  'border-radius:999px;background:#ffffff;color:#0c0c0d;border:1px solid rgba(12,12,13,0.06);cursor:pointer;' +
  'font:600 12.5px/1.15 var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);' +
  'letter-spacing:-0.01em;box-shadow:0 1px 2px rgba(12,12,13,0.10),0 6px 18px rgba(12,12,13,0.14);' +
  'pointer-events:auto;will-change:transform;transition:box-shadow 120ms ease;';
const SUB = 'font-weight:500;color:#52525b;font-variant-numeric:tabular-nums;';
const SIM = 'font-weight:500;color:#a1a1aa;font-size:10.5px;';
const BADGE =
  'display:none;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#ff7a5c;color:#fff;' +
  'font:700 11px/18px var(--font-sans, system-ui, sans-serif);text-align:center;';

/**
 * The client buildings' tags (X04): always visible over the city, above their neighbours — brand name, an
 * "x/y working" count (simulated in the public city, and marked "sim") and a coral needs-you badge. White pills
 * with a soft shadow keep their contrast over the pastel blocks. Clicking a tag opens the building, like clicking
 * the building. Plain DOM positioned each frame; every string is set with textContent, never parsed as HTML.
 * Hidden inside a building, floor or office (except the focused building's own tag in building mode).
 */
export function BuildingLabels({ items }: { items: LabelItem[] }) {
  const { store } = useCityContext();
  const gl = useThree(s => s.gl);
  const nodes = useMemo(() => {
    const layer = document.createElement('div');
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2;';
    layer.setAttribute('aria-label', 'Client buildings');
    layer.setAttribute('role', 'group');
    const els = items.map(it => {
      const el = document.createElement('button');
      el.type = 'button';
      el.style.cssText = PILL;
      el.title = `${it.name} (simulated activity)`;
      const badge = document.createElement('span');
      badge.style.cssText = BADGE;
      const name = document.createElement('b');
      name.textContent = it.short;
      const sub = document.createElement('span');
      sub.style.cssText = SUB;
      const sim = document.createElement('span');
      sim.style.cssText = SIM;
      sim.textContent = 'sim';
      el.append(badge, name, sub, sim);
      el.addEventListener('pointerdown', e => e.stopPropagation());
      el.addEventListener('click', e => {
        e.stopPropagation();
        store.set({ mode: { kind: 'building', building: it.key } });
      });
      el.addEventListener('pointerenter', () => store.get().hovered !== it.key && store.set({ hovered: it.key }));
      el.addEventListener('pointerleave', () => store.get().hovered === it.key && store.set({ hovered: null }));
      layer.append(el);
      return { el, badge, sub, sim, last: '' };
    });
    return { layer, els };
  }, [items, store]);

  useEffect(() => {
    const parent = gl.domElement.parentElement;
    parent?.append(nodes.layer);
    return () => nodes.layer.remove();
  }, [gl, nodes]);

  const v = useMemo(() => new Vector3(), []);
  const dir = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size, clock }) => {
    const st = store.get();
    const kind = st.mode.kind;
    const focus = kind === 'building' ? st.mode.building : null;
    const compact = size.width < 600;
    const t = st.reducedMotion ? 0 : clock.elapsedTime;
    items.forEach((it, i) => {
      const n = nodes.els[i]!;
      const visible = kind === 'explore' || kind === 'arrival' || it.key === focus;
      if (!visible) {
        n.el.style.display = 'none';
        return;
      }
      const lift = floorOffset(it.key, it.floors, explodeRuntime(store).progress.get(it.key) ?? 0);
      v.set(it.x, it.y + lift, it.z);
      // Behind the camera or off screen: hide.
      dir.copy(v).sub(camera.position);
      v.project(camera as unknown as Camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
        n.el.style.display = 'none';
        return;
      }
      const act = simulatedActivity(it.key, it.desks, t);
      const text = it.desks > 0 ? `${act.working}/${it.desks} working` : `${it.forRent} for rent`;
      const key = `${text}|${act.needs}|${compact}|${st.hovered === it.key}`;
      if (key !== n.last) {
        n.last = key;
        n.sub.textContent = text;
        n.sub.style.display = compact ? 'none' : '';
        n.sim.style.display = compact || it.desks === 0 ? 'none' : '';
        n.badge.textContent = String(act.needs);
        n.badge.style.display = act.needs > 0 ? 'inline-block' : 'none';
        n.el.setAttribute(
          'aria-label',
          `${it.name}: ${text}${act.needs ? `, ${act.needs} need you` : ''} (simulated activity). Open building.`,
        );
        n.el.style.boxShadow =
          st.hovered === it.key
            ? '0 0 0 2px #f5b335,0 6px 18px rgba(12,12,13,0.18)'
            : '0 1px 2px rgba(12,12,13,0.10),0 6px 18px rgba(12,12,13,0.14)';
      }
      const px = ((v.x + 1) / 2) * size.width;
      const py = Math.max(28, ((1 - v.y) / 2) * size.height);
      // Nearer tags draw on top of farther ones.
      n.el.style.zIndex = String(1000 - Math.round(dir.length()));
      n.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -100%)`;
      n.el.style.display = 'inline-flex';
    });
  });
  return null;
}
