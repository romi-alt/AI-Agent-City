'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { floorLift, liveExplode } from '../camera/explode.ts';
import { labelRegistry } from '../camera/labels.ts';
import { findBuilding } from '../camera/modes.ts';
import { floorBase } from '../camera/shots.ts';
import { navigate } from '../camera/useNav.ts';
import { useCity, useCityContext } from '../context.tsx';
import { FLOOR_HEIGHT } from '../types.ts';

/**
 * Floor labels in 3D beside the focused building (building mode): each floor's number and department,
 * at its height (lifted with exploded floors), always on the building's screen-right side. Each is a button that
 * opens its floor; the current floor is marked.
 */
export function FloorLabels() {
  const { store, layout } = useCityContext();
  const mode = useCity(s => s.mode);
  const { camera } = useThree();
  // Building mode only: in the floor view the side panel offers floor above/below, and the labels would sit
  // where the panel is.
  const b = mode.kind === 'building' ? findBuilding(layout, mode.building) : null;
  const current = mode.kind === 'floor' ? mode.level : null;
  const reg = labelRegistry(store);
  const anchors = useMemo(() => (b ? b.floors.map(() => new THREE.Object3D()) : []), [b]);

  useEffect(() => {
    if (!b) return;
    const ids: string[] = [];
    b.floors.forEach((f, i) => {
      const id = `floor:${b.key}:${f.level}`;
      ids.push(id);
      reg.set(
        {
          id,
          kind: 'floor',
          text: String(f.level),
          sub: f.name,
          selected: f.level === current,
          ariaLabel: `Floor ${f.level}, ${f.name}. ${f.level === current ? 'Shown now' : 'Open this floor'}`,
          onSelect: () => navigate(store, layout, { type: 'select-floor', level: f.level }),
        },
        { object: anchors[i]!, offset: new THREE.Vector3(), align: 'right' },
      );
    });
    return () => {
      for (const id of ids) reg.remove(id);
    };
  }, [b, current, anchors, reg, store, layout]);

  const right = useMemo(() => new THREE.Vector3(), []);
  const probe = useMemo(() => new THREE.Vector3(), []);
  const size = useThree(s => s.size);
  useFrame(() => {
    if (!b) return;
    const cam = camera as unknown as THREE.Camera;
    // Beside the building on the screen's right, whatever the heading.
    right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    right.y = 0;
    right.normalize();
    const off = Math.hypot(b.w, b.d) / 2 + 1.2;
    const t = liveExplode(store, b.key);
    const x = b.x + right.x * off;
    const z = b.z + right.z * off;
    const screenY = (y: number) => (1 - probe.set(x, y, z).project(cam).y) * 0.5 * size.height;
    // Floors are stacked in order; where they sit closer on screen than a label is tall (a double-height lobby
    // seen from afar, the ground floors of an exploded tower), the labels above are nudged up to keep a gap.
    const MIN_PX = 26;
    let lastPx = Infinity;
    let raise = 0;
    [...b.floors]
      .sort((p, q) => p.level - q.level)
      .forEach(f => {
        const i = b.floors.indexOf(f);
        const a = anchors[i]!;
        let y = floorBase(f.level) + floorLift(b.key, f.level, t) + FLOOR_HEIGHT * 0.75 + raise;
        const px = screenY(y);
        if (lastPx - px < MIN_PX && Number.isFinite(lastPx)) {
          const perUnit = Math.max(1, Math.abs(screenY(y) - screenY(y + 1)));
          const extra = (MIN_PX - (lastPx - px)) / perUnit;
          raise += extra;
          y += extra;
        }
        lastPx = screenY(y);
        a.position.set(x, y, z);
        a.updateMatrixWorld();
      });
  });
  return null;
}
