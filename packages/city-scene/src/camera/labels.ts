'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import type { CityStore } from '../store.ts';

/**
 * Labels in the 3D scene drawn as real DOM (buttons a keyboard and a screen reader can reach), positioned over
 * their 3D anchors every frame. Scene parts register labels with `useSceneLabel`; <SceneLabels/> (in the overlay)
 * renders them; <LabelProjector/> (in the canvas) moves them. One registry per city store.
 */
export interface SceneLabel {
  id: string;
  /** 'agent' is the Office view's name pill (the reference look); 'desk' the tag used elsewhere. */
  kind: 'desk' | 'agent' | 'floor' | 'callout';
  /** Agent pills: whose legend colour the role takes. */
  tone?: 'ai' | 'human';
  text: string;
  sub?: string;
  kicker?: string;
  status?: string;
  selected?: boolean;
  ariaLabel?: string;
  /** `data-testid` for the label's button (hosts' end-to-end tests). */
  testId?: string;
  onSelect?: () => void;
}

interface Anchor {
  object: THREE.Object3D;
  offset: THREE.Vector3;
  /** 'above' centres the label over its anchor (desks); 'right' starts it at the anchor (floor labels). */
  align?: 'above' | 'right';
}

export interface LabelRegistry {
  list(): SceneLabel[];
  subscribe(fn: () => void): () => void;
  set(label: SceneLabel, anchor: Anchor): void;
  remove(id: string): void;
  bindElement(id: string, el: HTMLElement | null): void;
  anchors: Map<string, Anchor>;
  elements: Map<string, HTMLElement>;
}

const registries = new WeakMap<CityStore, LabelRegistry>();

export function labelRegistry(store: CityStore): LabelRegistry {
  let r = registries.get(store);
  if (!r) {
    const labels = new Map<string, SceneLabel>();
    const fns = new Set<() => void>();
    let snapshot: SceneLabel[] = [];
    const changed = () => {
      snapshot = [...labels.values()];
      for (const fn of [...fns]) fn();
    };
    r = {
      list: () => snapshot,
      subscribe(fn) {
        fns.add(fn);
        return () => fns.delete(fn);
      },
      set(label, anchor) {
        const prev = labels.get(label.id);
        r!.anchors.set(label.id, anchor);
        if (prev && shallowEqual(prev, label)) return;
        labels.set(label.id, label);
        changed();
      },
      remove(id) {
        r!.anchors.delete(id);
        if (labels.delete(id)) changed();
      },
      bindElement(id, el) {
        if (el) r!.elements.set(id, el);
        else r!.elements.delete(id);
      },
      anchors: new Map(),
      elements: new Map(),
    };
    registries.set(store, r);
  }
  return r;
}

function shallowEqual(a: SceneLabel, b: SceneLabel): boolean {
  return (
    a.text === b.text &&
    a.sub === b.sub &&
    a.kicker === b.kicker &&
    a.status === b.status &&
    a.selected === b.selected &&
    a.ariaLabel === b.ariaLabel &&
    a.testId === b.testId &&
    a.kind === b.kind &&
    a.tone === b.tone &&
    !!a.onSelect === !!b.onSelect
  );
}

/** Register a label anchored to an object (plus an offset in its local space) while `label` is not null. */
export function useSceneLabel(
  store: CityStore,
  label: SceneLabel | null,
  object: React.RefObject<THREE.Object3D | null>,
  offset: [number, number, number],
) {
  const reg = labelRegistry(store);
  const [ox, oy, oz] = offset;
  useEffect(() => {
    if (!label || !object.current) return;
    reg.set(label, { object: object.current, offset: new THREE.Vector3(ox, oy, oz) });
  });
  const id = label?.id ?? null;
  useEffect(() => {
    if (!id) return;
    return () => reg.remove(id);
  }, [reg, id]);
}

/** Moves the DOM labels over their anchors (inside the canvas; one per scene). */
export function LabelProjector({ store }: { store: CityStore }) {
  const reg = labelRegistry(store);
  const { camera, size } = useThree();
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const toPoint = new THREE.Vector3();
  useFrame(() => {
    const cam = camera as unknown as THREE.PerspectiveCamera;
    cam.getWorldDirection(dir);
    const desks: { el: HTMLElement; x: number; y: number; selected: boolean }[] = [];
    for (const [id, a] of reg.anchors) {
      const el = reg.elements.get(id);
      if (!el) continue;
      v.copy(a.offset);
      a.object.localToWorld(v);
      toPoint.copy(v).sub(cam.position);
      const ahead = toPoint.dot(dir) > 0;
      v.project(cam);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      const onScreen = ahead && x > -80 && x < size.width + 80 && y > -40 && y < size.height + 40;
      el.style.visibility = onScreen ? 'visible' : 'hidden';
      if (!onScreen) continue;
      if (el.classList.contains('ac-desk-tag') || el.classList.contains('ac-agent-pill'))
        desks.push({ el, x, y, selected: el.classList.contains('is-selected') });
      else
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${a.align === 'right' ? 'translate(0, -50%)' : 'translate(-50%, -100%)'}`;
    }
    placeDeskTags(desks);
  });
  return null;
}

/** Measured once per tag (reading layout every frame would force a reflow each time). */
const tagSize = new WeakMap<HTMLElement, { w: number; h: number }>();

/**
 * Desk tags never sit on top of each other: the selected one keeps its place, then the nearest (lowest on screen)
 * first; a tag that would overlap one already placed moves up a step or two (or just below its desk), and the
 * least-crowded spot wins when every candidate is taken.
 */
function placeDeskTags(tags: { el: HTMLElement; x: number; y: number; selected: boolean }[]) {
  tags.sort((a, b) => Number(b.selected) - Number(a.selected) || b.y - a.y);
  const placed: { l: number; t: number; r: number; b: number }[] = [];
  const GAP = 3;
  for (const tag of tags) {
    let dims = tagSize.get(tag.el);
    if (!dims || !dims.w) tagSize.set(tag.el, (dims = { w: tag.el.offsetWidth, h: tag.el.offsetHeight }));
    const w = dims.w || 120;
    const h = dims.h || 28;
    const step = h + GAP;
    let best = { dy: 0, overlap: Infinity };
    for (const dy of [0, -step, step + 6, -2 * step, 2 * step + 6, -3 * step]) {
      const box = { l: tag.x - w / 2, t: tag.y - h + dy, r: tag.x + w / 2, b: tag.y + dy };
      let overlap = 0;
      for (const p of placed) {
        const ox = Math.min(box.r, p.r) - Math.max(box.l, p.l);
        const oy = Math.min(box.b, p.b) - Math.max(box.t, p.t);
        if (ox > -GAP && oy > -GAP) overlap += Math.max(ox, 1) * Math.max(oy, 1);
      }
      if (overlap < best.overlap) best = { dy, overlap };
      if (overlap === 0) break;
    }
    const t = tag.y - h + best.dy;
    placed.push({ l: tag.x - w / 2, t, r: tag.x + w / 2, b: t + h });
    tag.el.style.transform = `translate(${tag.x.toFixed(1)}px, ${(tag.y + best.dy).toFixed(1)}px) translate(-50%, -100%)`;
  }
}
