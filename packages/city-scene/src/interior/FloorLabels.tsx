'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { explodeState, floorLift } from '../camera/explode.ts';
import { labelRegistry } from '../camera/labels.ts';
import { findBuilding } from '../camera/modes.ts';
import { floorBase } from '../camera/shots.ts';
import { navigate } from '../camera/useNav.ts';
import { useCity, useCityContext } from '../context.tsx';
import { FLOOR_HEIGHT } from '../types.ts';

/**
 * Floor labels in 3D beside the focused building (building and floor modes): each floor's number and department,
 * at its height (lifted with exploded floors), always on the building's screen-right side. Each is a button that
 * opens its floor; the current floor is marked.
 */
export function FloorLabels() {
  const { store, layout } = useCityContext();
  const mode = useCity(s => s.mode);
  const { camera } = useThree();
  const b = mode.kind === 'building' || mode.kind === 'floor' ? findBuilding(layout, mode.building) : null;
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
  useFrame(() => {
    if (!b) return;
    // Beside the building on the screen's right, whatever the heading.
    right.set(1, 0, 0).applyQuaternion((camera as unknown as THREE.Camera).quaternion);
    right.y = 0;
    right.normalize();
    const off = Math.hypot(b.w, b.d) / 2 + 1.2;
    const t = explodeState(store).t;
    b.floors.forEach((f, i) => {
      const a = anchors[i]!;
      a.position.set(
        b.x + right.x * off,
        floorBase(f.level) + floorLift(f.level, t) + FLOOR_HEIGHT * 0.75,
        b.z + right.z * off,
      );
      a.updateMatrixWorld();
    });
  });
  return null;
}
