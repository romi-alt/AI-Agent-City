import { MeshStandardMaterial } from 'three';
import { GLSL_NOISE } from '../environment/glsl.ts';
import type { SharedUniforms } from '../environment/palette.ts';
import { CITY_HALF, type ExtendedGrid, ROAD_HALF, SIDEWALK } from './grid.ts';
import { LAMP_OFFSET } from './furniture.ts';

/** GLSL: nearest road line, lamp light pools and wetness shared by the road and sidewalk shaders. */
function commonGlsl(grid: ExtendedGrid, lampReach: number) {
  const first = grid.xs[0]!;
  const firstZ = grid.zs[0]!;
  return /* glsl */ `
  ${GLSL_NOISE}
  uniform float uNight, uWet, uTime;
  varying vec3 vWorldA1;
  varying float vUpA1;
  const float SP = ${grid.spacing.toFixed(2)};
  const vec2 ORIGIN = vec2(${first.toFixed(2)}, ${firstZ.toFixed(2)});
  const float CITY_HALF = ${CITY_HALF.toFixed(1)};
  // Signed offset from the nearest road centre line on one axis (roads are evenly spaced).
  float roadOffset(float v, float origin) {
    return v - (origin + floor((v - origin) / SP + 0.5) * SP);
  }
  // Warm pools under the street lamps (same placement rule as furniture.ts).
  float lampPools(vec2 w) {
    if (max(abs(w.x), abs(w.y)) > ${lampReach.toFixed(1)}) return 0.0;
    float acc = 0.0;
    for (int axis = 0; axis < 2; axis++) {
      float across = axis == 0 ? roadOffset(w.x, ORIGIN.x) : roadOffset(w.y, ORIGIN.y);
      float alongV = axis == 0 ? w.y : w.x;
      float o = axis == 0 ? ORIGIN.y : ORIGIN.x;
      float t = mod(alongV - o, SP);
      float da = min(min(abs(t - 5.2), abs(t - 14.8)), min(abs(t + SP - 14.8), abs(t - SP - 5.2)));
      float dc = abs(abs(across) - ${(LAMP_OFFSET - 0.9).toFixed(2)});
      acc += exp(-(da * da) / 4.0 - (dc * dc) / 3.0);
    }
    return acc;
  }
  float puddles(vec2 w) {
    float n = a1fbm(w * 0.18) * 0.7 + a1noise(w * 0.9) * 0.3;
    return smoothstep(0.52, 0.62, n);
  }
  `;
}

function inject(m: MeshStandardMaterial, shared: SharedUniforms, head: string, body: string, key: string) {
  m.onBeforeCompile = shader => {
    shader.uniforms.uNight = shared.uNight;
    shader.uniforms.uWet = shared.uWet;
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldA1;\nvarying float vUpA1;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vUpA1 = objectNormal.y;
        #ifdef USE_INSTANCING
          vWorldA1 = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWorldA1 = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${head}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${body}\ndiffuseColor.rgb = gAlbedo;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gEmit;');
  };
  m.customProgramCacheKey = () => key;
}

/**
 * The road surface: asphalt with aggregate and tyre wear, double yellow centre lines, zebra crossings and stop lines
 * at every junction, lamp pools at night and puddles when wet. Beyond the street grid it becomes plain paving that
 * fades into the haze. One plane, one draw call, no z-fighting decals.
 */
export function createRoadMaterial(shared: SharedUniforms, grid: ExtendedGrid, lampReach: number) {
  const m = new MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  const head = commonGlsl(grid, lampReach);
  const body = /* glsl */ `
    vec2 w = vWorldA1.xz;
    float ax = roadOffset(w.x, ORIGIN.x);
    float az = roadOffset(w.y, ORIGIN.y);
    float inside = 1.0 - step(CITY_HALF + ${ROAD_HALF.toFixed(1)}, max(abs(w.x), abs(w.y)));
    vec2 fw = fwidth(w) + 1e-4;
    float aa = max(fw.x, fw.y);
    float grain = a1noise(w * 7.0) * 0.5 + a1noise(w * 23.0) * 0.5;
    float patchN = a1fbm(w * 0.08);
    vec3 asphalt = mix(vec3(0.048, 0.049, 0.052), vec3(0.062, 0.063, 0.066), grain * 0.6 + patchN * 0.25);
    // Tyre wear: lighter polish along the middle of each lane.
    float onX = 1.0 - smoothstep(${ROAD_HALF.toFixed(1)} - aa, ${ROAD_HALF.toFixed(1)} + aa, abs(ax));
    float onZ = 1.0 - smoothstep(${ROAD_HALF.toFixed(1)} - aa, ${ROAD_HALF.toFixed(1)} + aa, abs(az));
    float junction = onX * onZ;
    float laneX = abs(abs(ax) - 1.0);
    float laneZ = abs(abs(az) - 1.0);
    asphalt *= 1.0 - 0.12 * (onX * (1.0 - onZ) * smoothstep(0.45, 0.15, laneX) + onZ * (1.0 - onX) * smoothstep(0.45, 0.15, laneZ));
    vec3 col = asphalt;
    vec3 white = vec3(0.86, 0.86, 0.84);
    vec3 yellow = vec3(0.9, 0.6, 0.1);
    float paint = 0.0;
    vec3 paintCol = white;
    // Road along z (at x = road): a = ax, distance to the junction along it = az.
    if (onX > 0.5 && onZ < 0.5) {
      float dj = az;
      float yl = (1.0 - smoothstep(0.045 - aa, 0.045 + aa, abs(abs(ax) - 0.11))) * step(3.7, abs(dj));
      float zebra = step(2.15, abs(dj)) * step(abs(dj), 3.25) * step(fract(ax * 1.8 + 0.25), 0.55) * step(abs(ax), 1.85);
      float stopL = step(3.4, abs(dj)) * step(abs(dj), 3.62) * step(0.05, ax * sign(dj)) * step(abs(ax), 1.85);
      paint = max(max(zebra, stopL), yl);
      paintCol = yl > 0.5 ? yellow : white;
    }
    if (onZ > 0.5 && onX < 0.5) {
      float dj = ax;
      float yl = (1.0 - smoothstep(0.045 - aa, 0.045 + aa, abs(abs(az) - 0.11))) * step(3.7, abs(dj));
      float zebra = step(2.15, abs(dj)) * step(abs(dj), 3.25) * step(fract(az * 1.8 + 0.25), 0.55) * step(abs(az), 1.85);
      float stopL = step(3.4, abs(dj)) * step(abs(dj), 3.62) * step(0.05, -az * sign(dj)) * step(abs(az), 1.85);
      paint = max(max(zebra, stopL), yl);
      paintCol = yl > 0.5 ? yellow : white;
    }
    // Worn paint.
    paint *= 0.92 + 0.08 * a1noise(w * 3.0);
    col = mix(col, paintCol, paint * inside);
    // Manhole covers in some lanes.
    vec2 cell = floor(w / 10.0);
    vec2 mh = (cell + 0.5) * 10.0 + vec2(a1hash12(cell) - 0.5, a1hash12(cell + 7.0) - 0.5) * 3.0;
    float mhd = length(w - mh);
    col = mix(col, vec3(0.03, 0.028, 0.026), (1.0 - smoothstep(0.32, 0.36, mhd)) * step(0.6, a1hash12(cell + 3.0)) * max(onX, onZ));
    // Outside the grid: pale paving that dissolves into the haze.
    vec3 paving = mix(vec3(0.3, 0.29, 0.27), vec3(0.34, 0.33, 0.31), grain);
    col = mix(paving, col, inside);
    float wet = uWet * mix(0.55, 1.0, puddles(w));
    vec3 gAlbedo = col * mix(1.0, 0.45, wet);
    float gRough = mix(mix(0.92, 0.75, paint), 0.06, wet);
    vec3 gEmit = gAlbedo * vec3(1.0, 0.7, 0.42) * lampPools(w) * uNight * 1.2 * inside;
  `;
  inject(m, shared, head, body, 'a1-road-v1');
  return m;
}

/**
 * Sidewalk slabs: concrete flags with joints, a granite curb band at the edge, darker tree pits; wet and lit like
 * the road. Applied to instanced boxes (one per block).
 */
export function createSidewalkMaterial(shared: SharedUniforms, grid: ExtendedGrid, lampReach: number) {
  const m = new MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  const head = commonGlsl(grid, lampReach);
  const body = /* glsl */ `
    vec2 w = vWorldA1.xz;
    float ax = abs(roadOffset(w.x, ORIGIN.x));
    float az = abs(roadOffset(w.y, ORIGIN.y));
    float edge = min(ax, az);
    vec2 fw = fwidth(w) + 1e-4;
    float aa = max(fw.x, fw.y);
    float grain = a1noise(w * 9.0);
    vec2 tile = w / 1.25;
    vec2 tf = abs(fract(tile) - 0.5);
    float joint = smoothstep(0.47 - aa, 0.5, max(tf.x, tf.y)) * (1.0 - smoothstep(0.08, 0.3, aa));
    vec3 conc = mix(vec3(0.4, 0.38, 0.35), vec3(0.45, 0.43, 0.4), grain) * (0.94 + 0.06 * a1hash12(floor(tile)));
    conc *= 1.0 - 0.18 * joint;
    float curb = 1.0 - smoothstep(${(ROAD_HALF + 0.28).toFixed(2)} - aa, ${(ROAD_HALF + 0.28).toFixed(2)} + aa, edge);
    vec3 col = mix(conc, vec3(0.3, 0.3, 0.3) * (0.92 + 0.16 * grain), curb);
    // Side faces of the slab (the curb face) are granite.
    float side = step(vUpA1, 0.5);
    col = mix(col, vec3(0.26, 0.26, 0.26), side);
    float walk = 1.0 - smoothstep(0.0, 0.6, abs(edge - ${SIDEWALK.toFixed(2)}));
    col *= 1.0 - 0.05 * walk;
    float wet = uWet * mix(0.6, 1.0, puddles(w + 13.0));
    vec3 gAlbedo = col * mix(1.0, 0.55, wet);
    float gRough = mix(0.88, 0.12, wet);
    vec3 gEmit = gAlbedo * vec3(1.0, 0.72, 0.45) * lampPools(w) * uNight * 1.1;
  `;
  inject(m, shared, head, body, 'a1-sidewalk-v1');
  return m;
}
