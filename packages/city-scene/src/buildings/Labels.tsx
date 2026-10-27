'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { type Camera, Vector3 } from 'three';
import { useCityContext } from '../context.tsx';

export interface LabelItem {
  key: string;
  name: string;
  x: number;
  y: number;
  z: number;
}

const PILL =
  'position:absolute;left:0;top:0;white-space:nowrap;padding:6px 12px;border-radius:999px;' +
  'background:rgba(15,27,45,0.84);color:#f6f3ec;font:600 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;' +
  'letter-spacing:0.01em;box-shadow:0 4px 14px rgba(0,0,0,0.25);backdrop-filter:blur(4px);display:none;will-change:transform;';

/**
 * Building names over the canvas, shown only for the hovered, focused or called-out building. Plain DOM nodes
 * positioned each frame (no extra React roots); names are set with textContent, never parsed as HTML.
 */
export function BuildingLabels({ items }: { items: LabelItem[] }) {
  const { store } = useCityContext();
  const gl = useThree(s => s.gl);
  const nodes = useMemo(() => {
    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2;';
    const els = items.map(it => {
      const el = document.createElement('div');
      el.style.cssText = PILL;
      const name = document.createElement('span');
      name.textContent = it.name;
      const open = document.createElement('span');
      open.textContent = 'Open';
      open.style.cssText = 'color:#f5b335;margin-left:8px;font-weight:500;display:none;';
      el.append(name, open);
      layer.append(el);
      return { el, open };
    });
    return { layer, els };
  }, [items]);

  useEffect(() => {
    const parent = gl.domElement.parentElement;
    parent?.append(nodes.layer);
    return () => nodes.layer.remove();
  }, [gl, nodes]);

  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const st = store.get();
    const focus = st.mode.kind === 'explore' || st.mode.kind === 'arrival' ? null : st.mode.building;
    items.forEach((it, i) => {
      const { el, open } = nodes.els[i]!;
      const show = st.hovered === it.key || focus === it.key || st.highlight === it.key;
      if (show) {
        v.set(it.x, it.y, it.z).project(camera as unknown as Camera);
        if (v.z > 1 || Math.abs(v.x) > 1.2 || v.y < -1.2) {
          el.style.display = 'none';
          return;
        }
        const enterable = st.enterable.includes(it.key);
        open.style.display = enterable ? 'inline' : 'none';
        el.style.border = `1px solid ${enterable ? 'rgba(245,179,53,0.9)' : 'rgba(246,243,236,0.18)'}`;
        const px = ((v.x + 1) / 2) * size.width;
        // A building taller than the view keeps its name pinned just inside the top edge.
        const py = Math.max(40, ((1 - v.y) / 2) * size.height);
        el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -100%)`;
      }
      el.style.display = show ? 'block' : 'none';
    });
  });
  return null;
}
