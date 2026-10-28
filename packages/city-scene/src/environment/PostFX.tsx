'use client';
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

/**
 * Balanced and ultra: ambient occlusion (N8AO) for contact shadows where facades meet slabs, sidewalks and
 * roofs, SMAA for edges, and ACES tone mapping at the end. No bloom or blur over the geometry.
 *
 * Fog note: three applies fog after tone mapping in its own shaders; here tone mapping runs last, so fog blends
 * in linear light. The district keeps fog to the far horizon only, so the two paths (low without a composer,
 * balanced/ultra with one) read the same.
 */
export function PostFX({ ultra }: { ultra: boolean }) {
  return (
    <EffectComposer multisampling={0}>
      <N8AO
        aoRadius={2.2}
        distanceFalloff={0.8}
        intensity={ultra ? 2.4 : 2}
        quality={ultra ? 'high' : 'medium'}
        halfRes={!ultra}
        aoSamples={ultra ? 16 : 8}
        denoiseSamples={ultra ? 8 : 4}
      />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
