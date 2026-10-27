import type * as THREE from 'three';

/**
 * R3F's element types currently resolve a different @types/three than this package (the workspace hoists the legacy
 * app's 0.180 types next to @react-three/fiber). The runtime is one three.js; these casts only bridge the two type
 * copies at the JSX boundary. Remove once the workspace pins @types/three for fiber (integrator).
 */
export const asMat = (m: THREE.Material | THREE.Material[]) => m as never;
export const asGeo = (g: THREE.BufferGeometry) => g as never;
export const asAny = <T>(v: T) => v as never;
