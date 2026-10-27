'use client';
import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, SMAA, ToneMapping } from '@react-three/postprocessing';
import { type BloomEffect, ToneMappingMode } from 'postprocessing';
import { useRef } from 'react';
import type { EnvRuntime } from './palette.ts';

/**
 * Ultra only: a light bloom that picks up lit windows, lamps and the beacon (strongest at night), SMAA in place of
 * MSAA, and the same ACES tone mapping the renderer uses without postprocessing. Deliberately subtle.
 */
export function PostFX({ rt }: { rt: EnvRuntime }) {
  const bloom = useRef<BloomEffect>(null);
  useFrame(() => {
    if (bloom.current) bloom.current.intensity = rt.state.bloom;
  });
  return (
    <EffectComposer multisampling={0}>
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.95} luminanceSmoothing={0.2} intensity={0.3} radius={0.6} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
