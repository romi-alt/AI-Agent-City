'use client';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useCity, useCityContext } from '../context.tsx';
import { buildingHeight } from './bounds.ts';
import { useSceneLabel } from './labels.ts';
import { findBuilding } from './modes.ts';
import { asMat } from '../interior/r3f.ts';

/**
 * Calls out the visitor's building (store.highlight): a soft light column, a ring on the street and a label, while
 * arriving and while that building is in focus. Nothing when there is no highlight (the public city).
 */
export function Callout() {
  const { layout, store } = useCityContext();
  const anchor = useRef<THREE.Group>(null);
  const highlight = useCity(s => s.highlight);
  const mode = useCity(s => s.mode);
  const reduced = useCity(s => s.reducedMotion);
  const paused = useCity(s => s.paused);
  const b = findBuilding(layout, highlight);
  const ring = useRef<THREE.Mesh>(null);
  const column = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color('#f5b335') }, uOpacity: { value: 0.22 } },
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 1.6) * uOpacity; gl_FragColor = vec4(uColor, a); }',
    });
    return m;
  }, []);

  useFrame(({ clock }) => {
    if (!ring.current) return;
    const t = reduced || paused ? 0.5 : (clock.elapsedTime * 0.5) % 1;
    ring.current.scale.setScalar(1 + t * 0.6);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - t);
  });

  const visible = !!b && (mode.kind === 'arrival' || (mode.kind === 'building' && mode.building === b.key));
  useSceneLabel(
    store,
    visible && b ? { id: `callout:${b.key}`, kind: 'callout', kicker: 'Your building', text: b.name } : null,
    anchor,
    [0, b ? buildingHeight(b) + 3.5 : 0, 0],
  );
  if (!b || !visible) return null;
  const h = buildingHeight(b);
  const radius = Math.max(b.w, b.d) * 0.75;
  return (
    <group ref={anchor as never} position={[b.x, 0, b.z]} userData={{ noPick: true }}>
      {mode.kind === 'arrival' && (
        <mesh position={[0, h + 14, 0]} material={asMat(column)} raycast={() => null}>
          <cylinderGeometry args={[radius * 0.3, radius * 0.42, 28, 32, 1, true]} />
        </mesh>
      )}
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.06, 0]} raycast={() => null}>
        <ringGeometry args={[radius, radius + 0.5, 64]} />
        <meshBasicMaterial color="#f5b335" transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  );
}
