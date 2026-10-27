'use client';
import type { ThreeElements } from '@react-three/fiber';
import type * as THREE from 'three';
import { useKit } from './kit.ts';
import { asGeo, asMat } from './r3f.ts';

type MeshProps = Omit<ThreeElements['mesh'], 'geometry' | 'material'> & { mat: THREE.Material };

/** A unit box scaled to size: every box in the office shares one geometry. */
export function Box({ mat, ...p }: MeshProps) {
  const { g } = useKit();
  return <mesh geometry={asGeo(g.box)} material={asMat(mat)} {...p} />;
}
export function Cyl({ mat, ...p }: MeshProps) {
  const { g } = useKit();
  return <mesh geometry={asGeo(g.cyl)} material={asMat(mat)} {...p} />;
}
export function Sphere({ mat, ...p }: MeshProps) {
  const { g } = useKit();
  return <mesh geometry={asGeo(g.sphere)} material={asMat(mat)} {...p} />;
}
export function Plane({ mat, ...p }: MeshProps) {
  const { g } = useKit();
  return <mesh geometry={asGeo(g.plane)} material={asMat(mat)} {...p} />;
}
export function Capsule({ mat, ...p }: MeshProps) {
  const { g } = useKit();
  return <mesh geometry={asGeo(g.capsule)} material={asMat(mat)} {...p} />;
}
