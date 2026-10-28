import { Color, MeshStandardMaterial } from 'three';
import { injectCloudShadow } from '../environment/cloud-shadow.ts';
import { GLSL_NOISE } from '../environment/glsl.ts';
import type { SharedUniforms } from '../environment/palette.ts';
import { type District, ROAD_HALF, SIDEWALK } from './grid.ts';

/** Lamp poles: 3.15 from the road centre, every LAMP_STEP along it (furniture.ts uses the same rule). */
export const LAMP_OFFSET = 3.15;
export const LAMP_STEP = 10;

type Shader = Parameters<MeshStandardMaterial['onBeforeCompile']>[0];

/** Road lines as GLSL constants and helpers: nearest road on each axis, lamp pools, puddles. */
function roadsGlsl(d: District) {
  const arr = (v: number[]) => `float[${v.length}](${v.map(x => x.toFixed(2)).join(', ')})`;
  return /* glsl */ `
  ${GLSL_NOISE}
  uniform float uNight, uWet, uTime;
  varying float vUpA1;
  varying float vKindA1;
  const float RING = ${d.ring.toFixed(2)};
  const float RX[${d.xs.length}] = ${arr(d.xs)};
  const float RZ[${d.zs.length}] = ${arr(d.zs)};
  // Signed offset from the nearest road centre line on one axis.
  float nearX(float v) { float best = 1e5; for (int i = 0; i < ${d.xs.length}; i++) { float o = v - RX[i]; if (abs(o) < abs(best)) best = o; } return best; }
  float nearZ(float v) { float best = 1e5; for (int i = 0; i < ${d.zs.length}; i++) { float o = v - RZ[i]; if (abs(o) < abs(best)) best = o; } return best; }
  float lampPools(vec2 w) {
    float acc = 0.0;
    float ax = nearX(w.x);
    float az = nearZ(w.y);
    float alongZ = mod(w.y + 5.0, ${LAMP_STEP.toFixed(1)}) - 5.0;
    float alongX = mod(w.x + 5.0, ${LAMP_STEP.toFixed(1)}) - 5.0;
    float dc = abs(abs(ax) - ${(LAMP_OFFSET - 0.9).toFixed(2)});
    acc += exp(-(alongZ * alongZ) / 4.0 - (dc * dc) / 3.0);
    dc = abs(abs(az) - ${(LAMP_OFFSET - 0.9).toFixed(2)});
    acc += exp(-(alongX * alongX) / 4.0 - (dc * dc) / 3.0);
    return acc * step(max(abs(w.x), abs(w.y)), RING + 4.0);
  }
  float puddles(vec2 w) {
    float n = a1fbm(w * 0.18) * 0.7 + a1noise(w * 0.9) * 0.3;
    return smoothstep(0.52, 0.62, n);
  }
  `;
}

function inject(
  m: MeshStandardMaterial,
  shared: SharedUniforms,
  head: string,
  body: string,
  key: string,
  extra?: (s: Shader) => void,
) {
  m.onBeforeCompile = shader => {
    shader.uniforms.uNight = shared.uNight;
    shader.uniforms.uWet = shared.uWet;
    shader.uniforms.uTime = shared.uTime;
    injectCloudShadow(shader, shared);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vUpA1;\nvarying float vKindA1;\nattribute float aKind;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUpA1 = objectNormal.y;\nvKindA1 = aKind;');
    shader.fragmentShader = shader.fragmentShader
      .replace('varying vec3 vA1World;', `varying vec3 vA1World;\n${head}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n{\n${body}\ndiffuseColor.rgb = gAlbedo;\nroughA1 = gRough;\nemitA1 = gEmit;\n}`,
      )
      .replace('void main() {', 'void main() {\nfloat roughA1 = 1.0;\nvec3 emitA1 = vec3(0.0);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = roughA1;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += emitA1;');
    extra?.(shader);
  };
  m.customProgramCacheKey = () => key;
}

/**
 * Asphalt with aggregate and tyre polish, crisp double-yellow centre lines, zebra crossings and stop lines at
 * every junction, lamp pools at night, puddles when wet. Drawn on the merged road strips only.
 */
export function createRoadMaterial(shared: SharedUniforms, d: District) {
  const m = new MeshStandardMaterial({ roughness: 0.9 });
  const body = /* glsl */ `
    vec2 w = vA1World.xz;
    float ax = nearX(w.x);
    float az = nearZ(w.y);
    vec2 fw = fwidth(w) + 1e-4;
    float aa = max(fw.x, fw.y);
    float grain = a1noise(w * 7.0) * 0.5 + a1noise(w * 23.0) * 0.5;
    float patchN = a1fbm(w * 0.08);
    vec3 asphalt = mix(vec3(0.036, 0.037, 0.04), vec3(0.052, 0.053, 0.056), grain * 0.6 + patchN * 0.3);
    float onX = 1.0 - smoothstep(${ROAD_HALF.toFixed(1)} - aa, ${ROAD_HALF.toFixed(1)} + aa, abs(ax));
    float onZ = 1.0 - smoothstep(${ROAD_HALF.toFixed(1)} - aa, ${ROAD_HALF.toFixed(1)} + aa, abs(az));
    float laneX = abs(abs(ax) - 1.0);
    float laneZ = abs(abs(az) - 1.0);
    asphalt *= 1.0 + 0.1 * (onX * (1.0 - onZ) * smoothstep(0.45, 0.15, laneX) + onZ * (1.0 - onX) * smoothstep(0.45, 0.15, laneZ));
    vec3 white = vec3(0.86, 0.86, 0.84);
    vec3 yellow = vec3(0.9, 0.6, 0.1);
    float paint = 0.0;
    vec3 paintCol = white;
    if (onX > 0.5 && onZ < 0.5) {
      float dj = az;
      float yl = (1.0 - smoothstep(0.045 - aa, 0.045 + aa, abs(abs(ax) - 0.11))) * step(3.7, abs(dj));
      float zebra = step(2.15, abs(dj)) * step(abs(dj), 3.25) * step(fract(ax * 1.8 + 0.25), 0.55) * step(abs(ax), 1.85);
      float stopL = step(3.4, abs(dj)) * step(abs(dj), 3.62) * step(0.05, ax * sign(dj)) * step(abs(ax), 1.85);
      float edge = (1.0 - smoothstep(0.04 - aa, 0.04 + aa, abs(abs(ax) - 1.8))) * step(3.7, abs(dj));
      paint = max(max(zebra, stopL), max(yl, edge));
      paintCol = yl > 0.5 ? yellow : white;
    }
    if (onZ > 0.5 && onX < 0.5) {
      float dj = ax;
      float yl = (1.0 - smoothstep(0.045 - aa, 0.045 + aa, abs(abs(az) - 0.11))) * step(3.7, abs(dj));
      float zebra = step(2.15, abs(dj)) * step(abs(dj), 3.25) * step(fract(az * 1.8 + 0.25), 0.55) * step(abs(az), 1.85);
      float stopL = step(3.4, abs(dj)) * step(abs(dj), 3.62) * step(0.05, -az * sign(dj)) * step(abs(az), 1.85);
      float edge = (1.0 - smoothstep(0.04 - aa, 0.04 + aa, abs(abs(az) - 1.8))) * step(3.7, abs(dj));
      paint = max(max(zebra, stopL), max(yl, edge));
      paintCol = yl > 0.5 ? yellow : white;
    }
    paint *= 0.94 + 0.06 * a1noise(w * 3.0);
    vec3 col = mix(asphalt, paintCol, paint);
    vec2 cell = floor(w / 10.0);
    vec2 mh = (cell + 0.5) * 10.0 + vec2(a1hash12(cell) - 0.5, a1hash12(cell + 7.0) - 0.5) * 3.0;
    col = mix(col, vec3(0.03, 0.028, 0.026), (1.0 - smoothstep(0.32, 0.36, length(w - mh))) * step(0.6, a1hash12(cell + 3.0)) * (1.0 - paint));
    float wet = uWet * mix(0.55, 1.0, puddles(w));
    vec3 gAlbedo = col * mix(1.0, 0.45, wet);
    float gRough = mix(mix(0.9, 0.7, paint), 0.06, wet);
    vec3 gEmit = gAlbedo * vec3(1.0, 0.72, 0.45) * lampPools(w) * uNight * 1.3;
  `;
  inject(m, shared, roadsGlsl(d), body, 'a1-road-v2');
  return m;
}

/**
 * Sidewalk slabs (one instanced box per block, aKind = 0 lot, 1 plaza, 2 park, 3 strip): light warm concrete
 * flags with joints and a granite curb; a planted strip with street trees just behind the walking line; lawns
 * inside the park blocks; a patterned granite field on the plaza.
 */
export function createBlockMaterial(shared: SharedUniforms, d: District) {
  const m = new MeshStandardMaterial({ roughness: 0.85 });
  const body = /* glsl */ `
    vec2 w = vA1World.xz;
    float ax = abs(nearX(w.x));
    float az = abs(nearZ(w.y));
    float edge = min(ax, az);
    vec2 fw = fwidth(w) + 1e-4;
    float aa = max(fw.x, fw.y);
    float grain = a1noise(w * 9.0);
    vec2 tile = w / 1.0;
    vec2 tf = abs(fract(tile) - 0.5);
    float joint = smoothstep(0.47 - aa, 0.5, max(tf.x, tf.y)) * (1.0 - smoothstep(0.08, 0.3, aa));
    vec3 conc = mix(vec3(0.46, 0.43, 0.39), vec3(0.52, 0.49, 0.45), grain) * (0.95 + 0.05 * a1hash12(floor(tile)));
    conc *= 1.0 - 0.14 * joint;
    float kind = floor(vKindA1 + 0.5);
    vec3 col = conc;
    // Planting strip with street trees: 3.25..4.15 from the road centre, broken at the corners.
    float strip = step(3.25, edge) * step(edge, 4.15) * step(6.0, max(ax, az));
    vec3 green = mix(vec3(0.12, 0.24, 0.07), vec3(0.17, 0.32, 0.09), a1noise(w * 3.0));
    vec3 soil = vec3(0.16, 0.11, 0.07);
    // Inner lawns of park blocks and strips.
    float lawn = (kind > 1.5 ? 1.0 : 0.0) * step(4.6, edge);
    // Plaza: granite field in a large grid with lighter bands.
    if (kind > 0.5 && kind < 1.5 && edge > 4.6) {
      vec2 g = abs(fract(w / 4.0) - 0.5);
      float band = smoothstep(0.46, 0.48, max(g.x, g.y));
      col = mix(vec3(0.5, 0.48, 0.45), vec3(0.62, 0.6, 0.56), band) * (0.95 + 0.08 * grain);
    }
    col = mix(col, mix(soil, green, 0.85), max(strip * (1.0 - step(1.5, kind)) * step(edge, 4.15), lawn));
    // Park walks: a diagonal cross and a loop of warm gravel through the lawns.
    if (lawn > 0.5) {
      float diag = min(abs(abs(fract(w.x / 20.0 + 0.5) - 0.5) - abs(fract(w.y / 20.0 + 0.5) - 0.5)), 1.0) * 20.0;
      float gravel = 1.0 - smoothstep(0.55, 0.7, diag);
      col = mix(col, vec3(0.5, 0.45, 0.37) * (0.95 + 0.1 * grain), gravel);
      lawn *= 1.0 - gravel;
    }
    float mow = 0.94 + 0.06 * step(0.5, fract((w.x + w.y) * 0.25));
    col *= mix(1.0, mow, lawn);
    float curb = 1.0 - smoothstep(${(ROAD_HALF + 0.28).toFixed(2)} - aa, ${(ROAD_HALF + 0.28).toFixed(2)} + aa, edge);
    col = mix(col, vec3(0.42, 0.42, 0.41) * (0.94 + 0.12 * grain), curb);
    float side = step(vUpA1, 0.5);
    col = mix(col, vec3(0.38, 0.38, 0.37), side);
    float walk = 1.0 - smoothstep(0.0, 0.6, abs(edge - ${SIDEWALK.toFixed(2)}));
    col *= 1.0 - 0.04 * walk;
    float wet = uWet * mix(0.6, 1.0, puddles(w + 13.0));
    vec3 gAlbedo = col * mix(1.0, 0.55, wet);
    float gRough = mix(lawn > 0.5 ? 0.95 : 0.85, 0.15, wet * (1.0 - lawn));
    vec3 gEmit = gAlbedo * vec3(1.0, 0.72, 0.45) * lampPools(w) * uNight * 1.1;
  `;
  inject(m, shared, roadsGlsl(d), body, 'a1-blocks-v2');
  return m;
}

/** The land beyond the parkway: mown parkland with soft variation, darker toward the far horizon. */
export function createGrassMaterial(shared: SharedUniforms, d: District) {
  const m = new MeshStandardMaterial({ roughness: 0.95 });
  const body = /* glsl */ `
    vec2 w = vA1World.xz;
    // The bay: no land beyond the embankment.
    if (w.y < ${d.waterZ.toFixed(2)} || w.x < ${d.waterX.toFixed(2)}) discard;
    float n = a1fbm(w * 0.04) * 0.6 + a1noise(w * 0.7) * 0.4;
    vec3 col = mix(vec3(0.15, 0.27, 0.08), vec3(0.22, 0.36, 0.11), n);
    float mow = 0.95 + 0.05 * step(0.5, fract((w.x - w.y) * 0.18));
    col *= mow;
    // Meadow patches and darker ground under the groves.
    col = mix(col, vec3(0.12, 0.2, 0.07), smoothstep(0.5, 0.7, a1fbm(w * 0.02 + 4.0)) * 0.6);
    // Winding gravel paths through the parkland.
    float wave = w.y - (RING + 22.0) - 6.0 * sin(w.x * 0.05);
    float wave2 = w.x - (RING + 22.0) - 6.0 * sin(w.y * 0.05);
    float pth = min(abs(wave), abs(wave2));
    col = mix(col, vec3(0.5, 0.46, 0.38), (1.0 - smoothstep(1.0, 1.3, pth)) * 0.9);
    vec3 gAlbedo = col;
    float gRough = 0.95;
    vec3 gEmit = vec3(0.0);
  `;
  inject(m, shared, roadsGlsl(d), body, 'a1-grass-v1');
  return m;
}

/** Bay water: deep teal, small moving ripples, reflective; quieter toward the horizon. */
export function createWaterMaterial(shared: SharedUniforms) {
  const m = new MeshStandardMaterial({
    color: new Color('#1c4a5c'),
    roughness: 0.08,
    metalness: 0.1,
    envMapIntensity: 1.2,
  });
  m.onBeforeCompile = shader => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uMotion = shared.uMotion;
    injectCloudShadow(shader, shared);
    shader.fragmentShader = shader.fragmentShader
      .replace('varying vec3 vA1World;', 'varying vec3 vA1World;\nuniform float uTime;\nuniform float uMotion;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec2 w = vA1World.xz;
          float t = uTime * uMotion;
          float d = length(w - cameraPosition.xz);
          float k = 1.0 - smoothstep(40.0, 220.0, d);
          vec2 p1 = w * 1.6 + vec2(t * 0.35, t * 0.12);
          vec2 p2 = w * 2.7 - vec2(t * 0.22, -t * 0.3);
          vec2 g = vec2(a1noise(p1) - a1noise(p1 + vec2(0.35, 0.0)), a1noise(p2) - a1noise(p2 + vec2(0.0, 0.35)));
          vec3 bump = vec3(g.x, 0.0, g.y) * 0.16 * k;
          normal = normalize(normal + (viewMatrix * vec4(bump, 0.0)).xyz);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'a1-water-v2';
  return m;
}
