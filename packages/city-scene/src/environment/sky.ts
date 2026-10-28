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
    // Low over the horizon toward the way Overview and Orbit look, where their band of sky is.
    uMoonDir: { value: new Vector3(0.3, 0.08, -0.95).normalize() },
    uSunDisk: { value: 1 },
    uMoon: { value: 0 },
    uStars: { value: 0 },
    uCover: { value: 0 },
    uTime: { value: 0 },
    /** Drift clock (frozen with reduced motion and pause) and the colours of an overcast deck. */
    uDrift: { value: 0 },
    uDeckLit: { value: new Color() },
    uDeckShade: { value: new Color() },
  };
}
export type SkyUniforms = ReturnType<typeof createSkyUniforms>;

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Pinned to the far plane: drawn after the opaque scene, it only shades the pixels nothing else covered.
  gl_Position = vec4(p.xy, p.w, p.w);
}
`;

/**
 * A physically-inspired gradient sky: zenith-to-horizon gradient that eases quickly from the horizon haze into the
 * blue (so even the thin band of sky Overview shows is blue), a warm band toward a low sun, the sun disk with a wide
 * halo, the moon and faint stars at night, and a mottled deck when overcast. At the horizon the sky equals the fog
 * colour exactly, so the skyline melts into it with no seam. `reflection` darkens the lower hemisphere into ground for the
 * environment map, so glass reflects street and sky rather than sky everywhere.
 */
export function createSkyMaterial(uniforms: SkyUniforms, reflection = false) {
  return new ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}
      uniform vec3 uZenith, uHorizon, uSunGlow, uSunColor, uGround, uSunDir, uMoonDir, uDeckLit, uDeckShade;
      uniform float uSunDisk, uMoon, uStars, uCover, uTime, uDrift;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float up = clamp(h, 0.0, 1.0);
        ${reflection ? '// Glass mirrors the sky downward too (softened), so curtain walls read as sky, not as street.\n        up = max(up, 0.22 + abs(h) * 0.6);' : ''}
        // Haze at the horizon easing into the blue: Rayleigh-like, quick near the horizon, slow toward the zenith.
        float t = (1.0 - exp(-up * 4.5)) / (1.0 - exp(-4.5));
        vec3 col = mix(uHorizon, uZenith, t);
        col = mix(col, uHorizon * 1.04, exp(-up * 22.0) * 0.5);
        ${reflection ? '' : '// Exactly the fog colour at the horizon (the glow below sits above it), so the skyline has no seam.\n        col = mix(uGround, col, smoothstep(0.0, 0.08, up));'}
        float lift = smoothstep(0.0, 0.06, up);
        float mu = max(dot(d, uSunDir), 0.0);
        vec3 sunFlat = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-5);
        float muFlat = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), sunFlat), 0.0);
        float clearSky = 1.0 - 0.65 * uCover;
        // Sun glow: a wide soft halo, a tighter core, and a band along the horizon on the sun's side.
        col += uSunGlow * (pow(mu, 4.0) * 0.16 + pow(mu, 24.0) * 0.3 + pow(mu, 200.0) * 0.7) * clearSky * lift;
        col += uSunGlow * pow(muFlat, 3.0) * exp(-up * 7.0) * 0.7 * clearSky * lift;
        col += uSunColor * smoothstep(0.99955, 0.99985, mu) * uSunDisk * 14.0;
        float mm = dot(d, uMoonDir);
        col += vec3(0.82, 0.86, 0.95) * smoothstep(0.99974, 0.99984, mm) * uMoon * 2.2;
        col += vec3(0.16, 0.2, 0.32) * pow(max(mm, 0.0), 160.0) * uMoon * 0.4;
        if (${reflection ? 'false' : 'uStars > 0.001'}) {
          vec2 g = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))) * 300.0;
          vec2 cell = floor(g);
          float r = a1hash12(cell);
          float star = step(0.993, r) * smoothstep(0.32, 0.0, length(fract(g) - 0.5));
          star *= 0.55 + 0.45 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
          col += vec3(0.9, 0.92, 1.0) * star * uStars * 0.7 * smoothstep(0.02, 0.2, h) * (1.0 - uCover);
        }
        if (${reflection ? 'false' : 'uCover > 0.5 && h > 0.0'}) {
          // Overcast: a mottled deck at one height, drifting with the clouds, thinning toward the horizon haze.
          vec2 p = d.xz / (h + 0.2) * 0.9 + vec2(uDrift * 0.0012, 0.0);
          float n = a1fbm(p);
          float deck = smoothstep(0.5, 0.95, uCover) * smoothstep(0.0, 0.14, h);
          col = mix(col, mix(uDeckShade, uDeckLit, smoothstep(0.25, 0.75, n)), deck * 0.85);
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
