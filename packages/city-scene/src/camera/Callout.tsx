'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useCity, useCityContext } from '../context.tsx';
import { asMat } from '../interior/r3f.ts';
import { findBuilding } from './modes.ts';

/**
 * During the arrival, a soft light column rises from the visitor's building (store.highlight) so it can be found
 * from far away. A1's architecture already names the highlighted building and rings it in gold, so this adds no
 * label or ring of its own. Nothing when there is no highlight (the public city).
 */
export function Callout() {
  const { layout } = useCityContext();
  const highlight = useCity(s => s.highlight);
  const arriving = useCity(s => s.mode.kind === 'arrival');
  const b = findBuilding(layout, highlight);
  const column = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color('#f5b335') }, uOpacity: { value: 0.22 } },
        vertexShader:
          'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 1.6) * uOpacity; gl_FragColor = vec4(uColor, a); }',
      }),
    [],
  );
  if (!b || !arriving) return null;
  const top = b.floors.length * 1.4 + 2;
  const radius = Math.max(b.w, b.d) * 0.75;
  return (
    <mesh position={[b.x, top + 14, b.z]} material={asMat(column)} raycast={() => null} userData={{ noPick: true }}>
      <cylinderGeometry args={[radius * 0.3, radius * 0.42, 28, 32, 1, true]} />
    </mesh>
  );
}
