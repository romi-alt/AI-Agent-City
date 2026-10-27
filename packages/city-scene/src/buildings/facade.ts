import {
  BoxGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { GLSL_NOISE } from '../environment/glsl.ts';
import type { SharedUniforms } from '../environment/palette.ts';
import { hex, type Rgb } from '../environment/presets.ts';
import { FLOOR_HEIGHT } from '../types.ts';

/**
 * Facade styles, drawn procedurally in the fragment shader from world-space floor/bay coordinates (no textures):
 * windows, mullions, spandrels, brick coursing, sills, storefronts, blinds and night-lit offices all come from the
 * same material, so the whole skyline is one instanced draw call.
 */
export const STYLE = {
  /** Curtain-wall glass with aluminium mullions and dark spandrels. */
  glass: 0,
  /** Limestone grid: piers and recessed windows. */
  stone: 1,
  /** Pre-war brick with punched windows, stone sills and lintels. */
  brick: 2,
  /** Horizontal ribbon windows between solid bands. */
  ribbon: 3,
  /** Glass behind vertical fins, with some solid panels. */
  fins: 4,
  /** A lantern crown: glass that glows as a feature at night. */
  crown: 5,
  /** Mechanical penthouse: louvres, no windows. */
  louvre: 6,
} as const;
export type FacadeStyle = keyof typeof STYLE;

/** Default bay width (world units) per style. */
const BAY: Record<FacadeStyle, number> = {
  glass: 1.5,
  stone: 1.35,
  brick: 1.05,
  ribbon: 2.2,
  fins: 0.95,
  crown: 1.1,
  louvre: 2,
};

/** One box of a building ("mass"): its footprint centre, size, height range and look. */
export interface Mass {
  x: number;
  z: number;
  w: number;
  d: number;
  y0: number;
  y1: number;
  style: FacadeStyle;
  /** Wall / frame colour (sRGB hex or linear triple). */
  wall: string | Rgb;
  /** Glass tint. */
  glass: string | Rgb;
  /** Varies window lights and panels; masses of one building share it so windows line up. */
  seed: number;
  /** Share of offices lit at night, 0..1. */
  lit: number;
  /** Height where floor 1 starts (usually the sidewalk), and how many floors at the bottom are storefront/lobby. */
  baseY: number;
  ground: number;
  bay?: number;
}

const toRgb = (c: string | Rgb): Rgb => (typeof c === 'string' ? hex(c) : c);

/** Rim highlight uniforms of an interactive building (hover/selection/callout). */
export interface RimUniforms {
  uRim: { value: number };
  uRimColor: { value: Color };
}

export function createFacadeMaterial(shared: SharedUniforms, rim?: RimUniforms): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const rimU: RimUniforms = rim ?? { uRim: { value: 0 }, uRimColor: { value: new Color('#f5b335') } };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      uNight: shared.uNight,
      uWet: shared.uWet,
      uTime: shared.uTime,
      uRim: rimU.uRim,
      uRimColor: rimU.uRimColor,
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute vec4 aF0;
        attribute vec4 aF1;
        attribute vec3 aWall;
        attribute vec3 aGlass;
        varying vec4 vFac;
        varying vec4 vF0;
        varying vec4 vF1;
        varying vec3 vWall;
        varying vec3 vGlass;
        varying vec3 vWorldA1;
        varying float vTop;
        varying float vNbA1;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        {
          vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec3 ip = transformed + 0.5;
          vec3 n = objectNormal;
          float u = 0.0; float fw = 1.0; float roof = 0.0;
          if (abs(n.x) > 0.5) { u = (n.x > 0.0 ? 1.0 - ip.z : ip.z) * sc.z; fw = sc.z; }
          else if (abs(n.z) > 0.5) { u = (n.z > 0.0 ? ip.x : 1.0 - ip.x) * sc.x; fw = sc.x; }
          else { roof = n.y > 0.0 ? 1.0 : 2.0; }
          vec4 wpA1 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vFac = vec4(u, wpA1.y, fw, roof);
          vWorldA1 = wpA1.xyz;
          vTop = (1.0 - ip.y) * sc.y;
          vF0 = aF0; vF1 = aF1; vWall = aWall; vGlass = aGlass;
          vNbA1 = max(1.0, floor(fw / aF0.z + 0.5));
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        ${GLSL_NOISE}
        uniform float uNight, uWet, uTime, uRim;
        uniform vec3 uRimColor;
        varying vec4 vFac;
        varying vec4 vF0;
        varying vec4 vF1;
        varying vec3 vWall;
        varying vec3 vGlass;
        varying vec3 vWorldA1;
        varying float vTop;
        varying float vNbA1;
        float a1box(vec2 p, vec2 lo, vec2 hi, vec2 aa) {
          vec2 s = smoothstep(lo - aa, lo + aa, p) * (1.0 - smoothstep(hi - aa, hi + aa, p));
          return s.x * s.y;
        }
        struct A1Facade { vec3 albedo; float rough; float metal; vec3 emissive; };
        A1Facade a1facade() {
          A1Facade o;
          // Interpolated "constants" wobble by an ulp between pixels; hashing them raw would speckle the windows.
          float style = floor(vF0.x + 0.5); float seed = floor(vF0.y + 0.5); float bayW = vF0.z; float litRatio = vF0.w;
          float ground = floor(vF1.x + 0.5); float baseY = vF1.y;
          float wetK = mix(1.0, 0.72, uWet);
          // Derivatives first, outside any branch.
          float lv = (vFac.y - baseY) / ${FLOOR_HEIGHT.toFixed(3)};
          float nb = max(1.0, floor(vNbA1 + 0.5));
          float bu = vFac.x / vFac.z * nb;
          vec2 dd = vec2(fwidth(bu), fwidth(lv));
          vec2 bp = vec2(vFac.x * 4.2, vFac.y * 11.0);
          vec2 bpw = fwidth(bp);
          if (vFac.w > 0.5) {
            float n = a1noise(vWorldA1.xz * 1.3 + seed);
            float edge = 1.0 - a1box(fract(vWorldA1.xz * 0.5), vec2(0.03), vec2(0.97), vec2(0.02));
            o.albedo = mix(vec3(0.24, 0.235, 0.225), vec3(0.32, 0.31, 0.295), n) * (1.0 - edge * 0.2) * wetK;
            o.rough = mix(0.92, 0.3, uWet);
            o.metal = 0.0;
            o.emissive = vec3(0.0);
            return o;
          }
          float floorIdx = floor(lv);
          float fy = fract(lv);
          float bay = floor(bu);
          float fx = fract(bu);
          vec2 aa = clamp(dd * 0.8, 0.002, 0.5);
          float detail = 1.0 - smoothstep(0.16, 0.42, max(dd.x, dd.y));
          float r1 = a1hash13(vec3(bay, floorIdx, seed));
          float r2 = a1hash13(vec3(bay * 1.7 + 3.1, floorIdx * 0.7 + 1.3, seed + 5.0));
          float grime = 0.96 + 0.04 * a1noise(vec2(vFac.x * 2.5 + seed, vFac.y * 0.25));
          vec3 wall = vWall * grime;
          float wallRough = 0.82;
          float wallMetal = 0.0;
          float win = 0.0;
          float cov = 0.5;
          float wy = fy;
          float store = step(0.0, floorIdx) * (1.0 - step(ground, floorIdx));
          float isLantern = 0.0;
          if (store > 0.5) {
            float sy = (vFac.y - baseY) / (${FLOOR_HEIGHT.toFixed(3)} * ground);
            float su = vFac.x / vFac.z * max(1.0, floor(vFac.z / 2.6 + 0.5));
            win = a1box(vec2(fract(su), sy), vec2(0.035, 0.03), vec2(0.965, 0.8), aa);
            wall = mix(wall, vec3(0.05, 0.05, 0.055), 0.55);
            wallRough = 0.45; wallMetal = 0.5;
            wy = sy / 0.8;
            cov = 0.7;
          } else if (style < 0.5) {
            win = a1box(vec2(fx, fy), vec2(0.035, 0.12), vec2(0.965, 0.985), aa);
            wall = mix(wall, vGlass * 0.6, step(fy, 0.12) * step(0.03, fx) * step(fx, 0.97));
            wallRough = 0.35; wallMetal = 0.7;
            cov = 0.85;
          } else if (style < 1.5) {
            win = a1box(vec2(fx, fy), vec2(0.18, 0.2), vec2(0.82, 0.88), aa);
            float mull = 1.0 - a1box(vec2(fx, fy), vec2(0.485, -1.0), vec2(0.515, 2.0), aa);
            win *= mix(1.0, mull, detail);
            cov = 0.42;
          } else if (style < 2.5) {
            win = a1box(vec2(fx, fy), vec2(0.27, 0.24), vec2(0.73, 0.8), aa);
            float row = floor(bp.y);
            bp.x += mod(row, 2.0) * 0.5;
            float mortar = 1.0 - a1box(fract(bp), vec2(0.04, 0.08), vec2(0.96, 0.92), bpw * 0.8);
            float brickDetail = 1.0 - smoothstep(0.2, 0.5, max(bpw.x, bpw.y));
            wall *= (0.9 + 0.2 * a1hash12(floor(bp) + seed)) * mix(1.0, 1.25, mortar * brickDetail);
            float trim = a1box(vec2(fx, fy), vec2(0.23, 0.15), vec2(0.77, 0.23), aa) + a1box(vec2(fx, fy), vec2(0.25, 0.8), vec2(0.75, 0.87), aa);
            wall = mix(wall, vec3(0.78, 0.74, 0.66), clamp(trim, 0.0, 1.0) * detail);
            cov = 0.3;
          } else if (style < 3.5) {
            win = a1box(vec2(fx, fy), vec2(-1.0, 0.34), vec2(2.0, 0.88), aa);
            float mull = 1.0 - a1box(vec2(fx, fy), vec2(-0.02, -1.0), vec2(0.02, 2.0), aa);
            win *= mix(1.0, mull, detail);
            wy = (fy - 0.34) / 0.54;
            cov = 0.54;
          } else if (style < 4.5) {
            win = a1box(vec2(fx, fy), vec2(0.16, 0.06), vec2(0.84, 0.97), aa) * step(0.22, r2);
            wallRough = 0.5; wallMetal = 0.35;
            cov = 0.55;
          } else if (style < 5.5) {
            win = a1box(vec2(fx, fy), vec2(0.06, 0.05), vec2(0.94, 0.95), aa);
            wallRough = 0.3; wallMetal = 0.8;
            isLantern = 1.0;
            cov = 0.8;
          } else {
            float louv = step(0.5, fract(vFac.y * 5.0));
            wall *= mix(0.75, 1.0, mix(0.5, louv, detail));
            cov = 0.0;
          }
          // Parapet: the top of every box is solid coping.
          float coping = 1.0 - smoothstep(0.3, 0.36, vTop);
          win *= 1.0 - coping * (1.0 - isLantern);
          wall = mix(wall, wall * 1.12 + 0.02, coping);
          win = mix(cov, win, detail);

          // Glass: tinted reflective panes, some with blinds drawn; offices lit at night.
          // Reflective low-e glass: a bright tinted mirror of the sky, nearly uniform pane to pane.
          float blind = step(0.9, r2) * (1.0 - store) * step(1.0 - (0.2 + 0.3 * r1), wy) * detail;
          vec3 glassCol = mix(vGlass, vec3(0.7, 0.76, 0.8), 0.3) * (0.94 + 0.12 * r1);
          vec3 albedo = mix(glassCol, vec3(0.42, 0.44, 0.47), blind);
          float rough = mix(0.035 + 0.05 * r2, 0.8, blind);
          float metal = mix(0.93, 0.0, blind);
          // Fewer offices burn late into the night than at dusk.
          float litK = litRatio * mix(1.0, 0.7, smoothstep(0.6, 1.0, uNight));
          float lit = mix(step(r1, litK), litK, 1.0 - detail);
          lit = max(lit, store);
          // Office light: mostly warm, some neutral, a few cool fluorescent; dimmer and brighter rooms.
          vec3 warm = r2 < 0.55 ? vec3(1.0, 0.64, 0.34) : r2 < 0.85 ? vec3(1.0, 0.82, 0.6) : vec3(0.78, 0.86, 1.0);
          float bright = (0.35 + 0.75 * fract(r1 * 7.31)) * (0.6 + 0.4 * smoothstep(0.0, 0.9, wy));
          // Night drives lights non-linearly, so a dark afternoon shows only a hint of them.
          float nightK = uNight * uNight;
          // Shop and lobby interiors: brighter towards the ceiling, darker counters and fittings low down.
          float storeGlow = store * (0.04 + 0.95 * nightK) * mix(0.45, 1.0, smoothstep(0.12, 0.4, wy)) * (0.7 + 0.3 * r2);
          vec3 em = warm * lit * bright * (nightK * 0.9 * (1.0 - store) + storeGlow);
          em += isLantern * vec3(1.0, 0.75, 0.35) * (0.03 + 1.2 * nightK);
          // Lit windows show the room, not the sky.
          metal *= 1.0 - 0.7 * lit * uNight;

          o.albedo = mix(wall * wetK, albedo, win);
          o.rough = mix(mix(wallRough, 0.25, uWet * 0.6), rough, win);
          o.metal = mix(wallMetal, metal, win);
          // Street light bouncing up the lower floors at night.
          vec3 uplight = wall * vec3(1.0, 0.75, 0.5) * nightK * 0.35 * exp(-max(vFac.y, 0.0) / 10.0);
          o.emissive = em * win + uplight * (1.0 - win);
          return o;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        A1Facade a1 = a1facade();
        diffuseColor.rgb = a1.albedo;`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = a1.rough;')
      // Glass gets a stronger sky reflection; masonry less sky fill, so the sun models the forms.
      .replace(
        '#include <lights_fragment_maps>',
        '#include <lights_fragment_maps>\nradiance *= 1.0 + 0.6 * a1.metal;\niblIrradiance *= 0.75;',
      )
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = a1.metal;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance = a1.emissive;
        if (uRim > 0.001) {
          // A soft outline along the building's corners and parapets, plus a faint wash: lit, not neon.
          float edge = vFac.w > 0.5 ? 10.0 : min(min(vFac.x, vFac.z - vFac.x), vTop);
          float outline = 1.0 - smoothstep(0.0, 0.32, edge);
          totalEmissiveRadiance += uRimColor * uRim * (0.035 + 1.4 * outline);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'a1-facade-v3';
  return m;
}

const unitBox = new BoxGeometry(1, 1, 1);

/** Builds one instanced mesh holding every mass (one draw call), with the per-instance facade attributes. */
export function buildFacadeMesh(masses: Mass[], material: MeshStandardMaterial): InstancedMesh {
  const geo = unitBox.clone();
  const n = masses.length;
  const f0 = new Float32Array(n * 4);
  const f1 = new Float32Array(n * 4);
  const wall = new Float32Array(n * 3);
  const glass = new Float32Array(n * 3);
  masses.forEach((m, i) => {
    f0.set([STYLE[m.style], m.seed, m.bay ?? BAY[m.style], m.lit], i * 4);
    f1.set([m.ground, m.baseY, 0, 0], i * 4);
    wall.set(toRgb(m.wall), i * 3);
    glass.set(toRgb(m.glass), i * 3);
  });
  geo.setAttribute('aF0', new InstancedBufferAttribute(f0, 4));
  geo.setAttribute('aF1', new InstancedBufferAttribute(f1, 4));
  geo.setAttribute('aWall', new InstancedBufferAttribute(wall, 3));
  geo.setAttribute('aGlass', new InstancedBufferAttribute(glass, 3));
  const mesh = new InstancedMesh(geo, material, n);
  const mat = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  masses.forEach((m, i) => {
    mesh.setMatrixAt(i, mat.compose(p.set(m.x, (m.y0 + m.y1) / 2, m.z), q, s.set(m.w, m.y1 - m.y0, m.d)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
