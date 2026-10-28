import { BackSide, Color, ShaderMaterial, Vector3 } from 'three';
import { GLSL_NOISE } from './glsl.ts';

/** Uniforms of the sky dome; shared by the visible sky and the sky rendered into the reflection map. */
export function createSkyUniforms() {
  return {
    uZenith: { value: new Color() },
    uHorizon: { value: new Color() },
    uSunGlow: { value: new Color() },
    uSunColor: { value: new Color() },
    uGround: { value: new Color() },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uMoonDir: { value: new Vector3(-0.4, 0.6, -0.7).normalize() },
    uSunDisk: { value: 1 },
    uMoon: { value: 0 },
    uStars: { value: 0 },
    uCover: { value: 0 },
    uTime: { value: 0 },
  };
}
export type SkyUniforms = ReturnType<typeof createSkyUniforms>;

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p;
}
`;

/**
 * A physically-inspired gradient sky: zenith-to-horizon gradient, a horizon band toward the sun at low sun, the sun
 * disk and its glow, the moon and stars at night. `reflection` darkens the lower hemisphere into ground for the
 * environment map, so glass reflects street and sky rather than sky everywhere.
 */
export function createSkyMaterial(uniforms: SkyUniforms, reflection = false) {
  return new ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}
      uniform vec3 uZenith, uHorizon, uSunGlow, uSunColor, uGround, uSunDir, uMoonDir;
      uniform float uSunDisk, uMoon, uStars, uCover, uTime;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float up = clamp(h, 0.0, 1.0);
        ${reflection ? '// Glass mirrors the sky downward too (softened), so curtain walls read as sky, not as street.\n        up = max(up, 0.22 + abs(h) * 0.6);' : ''}
        // Three stops (horizon, pale sky blue, zenith) so warm horizons never mix into grey-lavender.
        // Legacy gradient (X04): the horizon colour (= the fog) rising quickly into the sky blue.
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.45, up), 0.75));
        col = mix(col, uHorizon * 1.04, exp(-up * 22.0) * 0.6);
        float mu = max(dot(d, uSunDir), 0.0);
        vec3 sunFlat = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-5);
        float muFlat = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), sunFlat), 0.0);
        float clearSky = 1.0 - 0.65 * uCover;
        col += uSunGlow * (pow(mu, 6.0) * 0.3 + pow(mu, 60.0) * 0.55) * clearSky;
        col += uSunGlow * pow(muFlat, 3.0) * exp(-up * 6.0) * 0.75 * clearSky;
        col += uSunColor * smoothstep(0.99955, 0.99985, mu) * uSunDisk * 14.0;
        float mm = dot(d, uMoonDir);
        col += vec3(0.82, 0.86, 0.95) * smoothstep(0.99935, 0.99965, mm) * uMoon * 2.2;
        col += vec3(0.16, 0.2, 0.32) * pow(max(mm, 0.0), 120.0) * uMoon * 0.5;
        if (${reflection ? 'false' : 'uStars > 0.001'}) {
          vec2 g = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))) * 300.0;
          vec2 cell = floor(g);
          float r = a1hash12(cell);
          float star = step(0.993, r) * smoothstep(0.32, 0.0, length(fract(g) - 0.5));
          star *= 0.55 + 0.45 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
          col += vec3(0.9, 0.92, 1.0) * star * uStars * smoothstep(0.08, 0.35, h) * (1.0 - uCover);
        }
        float below = smoothstep(0.0, ${reflection ? '-0.04' : '-0.1'}, h);
        col = mix(col, uGround, below * ${reflection ? '0.35' : '1.0'});
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: BackSide,
    depthWrite: false,
    fog: false,
    // The horizon must equal the fog colour exactly (three adds fog after tone mapping without a composer), so
    // the sky is not tone-mapped there; with the composer the final pass maps sky and fog alike.
    toneMapped: false,
  });
}
