import { GLSL_NOISE } from './glsl.ts';
import type { SharedUniforms } from './palette.ts';

/**
 * Soft moving cloud shadows: a slow-drifting noise field that dims the direct sunlight (not the sky light) on the
 * ground and on buildings, scaled by cloud cover. Injected into MeshStandardMaterial shaders.
 */
type Shader = { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string };

/**
 * Adds a world-position varying (vA1World) and the cloud-shadow term to a standard material's shader.
 */
export function injectCloudShadow(shader: Shader, shared: SharedUniforms): void {
  shader.uniforms.uCloud = shared.uCloud;
  shader.uniforms.uTimeCS = shared.uTime;
  if (!shader.vertexShader.includes('varying vec3 vA1World;')) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vA1World;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          vec4 a1wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            a1wp = instanceMatrix * a1wp;
          #endif
          vA1World = (modelMatrix * a1wp).xyz;
        }`,
      );
  }
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      ${GLSL_NOISE}
      varying vec3 vA1World;
      uniform float uCloud;
      uniform float uTimeCS;
      float a1cloudShadow(vec2 w) {
        if (uCloud < 0.02) return 1.0;
        vec2 p = w * 0.012 + vec2(uTimeCS * 0.0065, uTimeCS * 0.0028);
        float n = a1fbm(p);
        return 1.0 - uCloud * 0.6 * smoothstep(0.48, 0.7, n);
      }`,
    )
    .replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      {
        float cs = a1cloudShadow(vA1World.xz);
        reflectedLight.directDiffuse *= cs;
        reflectedLight.directSpecular *= cs;
      }`,
    );
}
