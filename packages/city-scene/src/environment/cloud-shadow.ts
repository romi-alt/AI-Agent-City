import { GLSL_NOISE } from './glsl.ts';
import { MAX_SHADOWS } from './cloud-field.ts';
import type { SharedUniforms } from './palette.ts';

/**
 * Soft moving cloud shadows: the shadows of the clouds that are drawn (cloud-field.ts `groundShadows`, written to
 * `uCloudShadow` by <Clouds>) dim the direct sunlight (not the sky light) on the ground and on buildings. Injected
 * into MeshStandardMaterial shaders.
 */
type Shader = { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string };

/**
 * Adds a world-position varying (vA1World) and the cloud-shadow term to a standard material's shader.
 */
export function injectCloudShadow(shader: Shader, shared: SharedUniforms): void {
  shader.uniforms.uCloud = shared.uCloud;
  shader.uniforms.uCloudShadow = shared.uCloudShadow;
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
      uniform vec4 uCloudShadow[${MAX_SHADOWS}];
      float a1cloudShadow(vec2 w) {
        if (uCloud < 0.02) return 1.0;
        // Each cloud's shadow is a soft blob (x, z, radius, strength); noise roughs up its edge.
        float rough = 0.75 + 0.5 * a1noise(w * 0.02);
        float dim = 0.0;
        for (int i = 0; i < ${MAX_SHADOWS}; i++) {
          vec4 b = uCloudShadow[i];
          vec2 d = (w - b.xy) / max(b.z, 1.0);
          dim = max(dim, b.w * smoothstep(1.0, 0.3, dot(d, d) * rough));
        }
        return 1.0 - 0.6 * dim;
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
