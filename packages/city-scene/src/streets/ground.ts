import { Color, MeshStandardMaterial } from 'three';
import { injectCloudShadow } from '../environment/cloud-shadow.ts';
import { GLSL_NOISE } from '../environment/glsl.ts';
import type { SharedUniforms } from '../environment/palette.ts';
import { type District, ROAD_HALF, SIDEWALK } from './grid.ts';

/** Lamp poles: 3.15 from the road centre, every LAMP_STEP along it (furniture.ts uses the same rule). */
export const LAMP_OFFSET = 3.15;
export const LAMP_STEP = 10;

type Shader = Parameters<MeshStandardMaterial['onBeforeCompile']>[0];

/** Road lines as GLSL helpers: the city's roads are evenly spaced, so the nearest one is modular arithmetic. */
function roadsGlsl(d: District) {
  const sp = d.xs.length > 1 ? d.xs[1]! - d.xs[0]! : 20;
  return /* glsl */ `
  ${GLSL_NOISE}
  uniform float uNight, uWet, uTime;
  varying float vUpA1;
  varying float vKindA1;
  const float SP = ${sp.toFixed(2)};
  const vec2 ORIGIN = vec2(${d.xs[0]!.toFixed(2)}, ${d.zs[0]!.toFixed(2)});
  const float EXTENT = ${d.extent.toFixed(1)};
  // Signed offset from the nearest road centre line on each axis.
  float nearX(float v) { return v - (ORIGIN.x + floor((v - ORIGIN.x) / SP + 0.5) * SP); }
  float nearZ(float v) { return v - (ORIGIN.y + floor((v - ORIGIN.y) / SP + 0.5) * SP); }
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
    return acc * step(abs(w.x), ${(d.bounds.maxX + 22).toFixed(1)}) * step(abs(w.y), ${(d.bounds.maxZ + 22).toFixed(1)});
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
 * Sidewalk slabs (one instanced box per block, aKind = 0 lot, 1 plaza, 2 park, 3 decor, 4 city): light concrete
 * flags with joints and a granite curb; a planted strip with street trees just behind the walking line; lawns
 * inside the park blocks; a patterned granite field on the plaza.
 */
export function createBlockMaterial(shared: SharedUniforms, d: District) {
  const m = new MeshStandardMaterial({ roughness: 0.85 });
  const plaza = d.cells.find(c => c.kind === 'plaza');
  const head = `${roadsGlsl(d)}\nconst vec2 PLAZA = vec2(${(plaza?.cx ?? 0).toFixed(2)}, ${((plaza?.cz ?? 0) - 2).toFixed(2)});`;
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
    float lawn = step(1.5, kind) * step(kind, 2.5) * step(4.6, edge);
    // Plaza: granite field in a large grid with lighter bands.
    if (kind > 0.5 && kind < 1.5 && edge > 4.6) {
      // Plaza: concentric granite rings around the fountain, radial joints, a darker border band and
      // two-tone setts, so the paving has a designed pattern.
      vec2 pc = w - PLAZA;
      float rr = length(pc);
      float ang = atan(pc.y, pc.x);
      float ringId = floor(rr / 0.8);
      float rf = fract(rr / 0.8);
      float seg = fract(ang / 6.28318 * max(8.0, floor(rr * 5.0)));
      float jointR = smoothstep(0.04, 0.0, min(rf, 1.0 - rf) - aa * 0.6);
      float jointA = smoothstep(0.04, 0.0, min(seg, 1.0 - seg) - aa * 0.6) * step(3.0, rr);
      float tone = a1hash12(vec2(ringId, floor(ang / 6.28318 * max(8.0, floor(rr * 5.0)))));
      vec3 a1 = vec3(0.56, 0.54, 0.5);
      vec3 b1 = vec3(0.42, 0.41, 0.4);
      vec3 sett = mix(a1, a1 * 0.9, tone);
      float accent = step(0.5, mod(ringId, 4.0)) * step(mod(ringId, 4.0), 1.5);
      sett = mix(sett, b1, accent);
      col = sett * (0.95 + 0.08 * grain) * (1.0 - 0.22 * max(jointR, jointA));
      float border = step(edge, 5.6);
      col = mix(col, vec3(0.36, 0.35, 0.34), border);
    }
    col = mix(col, mix(soil, green, 0.85), max(strip * (1.0 - step(0.5, kind)) * step(edge, 4.15), lawn));
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
  inject(m, shared, head, body, 'a1-blocks-v4');
  return m;
}

/**
 * The ground under and beyond the city blocks: worn concrete paving that continues past the last road and dissolves
 * into the horizon fog, so there is never an edge or void.
 */
export function createFarGroundMaterial(shared: SharedUniforms, d: District) {
  const m = new MeshStandardMaterial({ roughness: 0.92 });
  const body = /* glsl */ `
    vec2 w = vA1World.xz;
    float n = a1fbm(w * 0.05) * 0.6 + a1noise(w * 0.8) * 0.4;
    vec3 col = mix(vec3(0.33, 0.32, 0.3), vec3(0.4, 0.39, 0.36), n);
    vec3 gAlbedo = col * mix(1.0, 0.6, uWet);
    float gRough = mix(0.92, 0.2, uWet);
    vec3 gEmit = vec3(0.0);
  `;
  inject(m, shared, roadsGlsl(d), body, 'a1-farground-v1');
  return m;
}

/** Pond water: deep teal, small moving ripples, reflective. */
export function createWaterMaterial(shared: SharedUniforms, tint = '#1c4a5c') {
  const m = new MeshStandardMaterial({
    color: new Color(tint),
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
