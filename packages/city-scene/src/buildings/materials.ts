import { Color, DoubleSide, type Material, MeshStandardMaterial } from 'three';
import { injectCloudShadow } from '../environment/cloud-shadow.ts';
import { GLSL_NOISE } from '../environment/glsl.ts';
import type { EnvState } from '../environment/presets.ts';
import type { SharedUniforms } from '../environment/palette.ts';

/**
 * The physically based material library of the district (X02). Colours come from per-instance colours, so one
 * material serves every building that uses it (few draw calls). Shader additions:
 *  - glass: clear reflective glazing with office lights behind it that dim and brighten slowly (frame-rate
 *    independent, per window), more of them at dusk and night;
 *  - lobby glass and lanterns: warm lit interiors;
 *  - masonry: subtle world-space variation, brick coursing and mortar;
 *  - fans: blades turning in the vertex shader;
 *  - everything: soft moving cloud shadows on direct sunlight.
 */
export type KitMaterials = Record<string, Material>;

type Shader = Parameters<MeshStandardMaterial['onBeforeCompile']>[0];

function std(
  p: ConstructorParameters<typeof MeshStandardMaterial>[0],
  shared: SharedUniforms,
  extra?: (s: Shader) => void,
  key = '',
) {
  const m = new MeshStandardMaterial({ color: '#ffffff', ...p });
  m.onBeforeCompile = shader => {
    extra?.(shader);
    injectCloudShadow(shader, shared);
  };
  m.customProgramCacheKey = () => `a1-kit-${key || 'std'}-${extra ? 'x' : 'p'}`;
  return m;
}

/** Window lights behind glass. `lobby` lights the whole pane warmly (lobbies, lanterns). */
function glassShader(shared: SharedUniforms, mode: 'office' | 'lobby' | 'lantern') {
  return (shader: Shader) => {
    shader.uniforms.uNight = shared.uNight;
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uMotion = shared.uMotion;
    shader.uniforms.uSkyA1 = shared.uFogColor;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aSeed;\nvarying vec3 vA1Local;\nvarying float vA1Seed;\nvarying vec3 vA1N;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 sc = vec3(1.0);
          #ifdef USE_INSTANCING
            sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          #endif
          vA1Local = (position + 0.5) * sc;
          vA1Seed = aSeed;
          vA1N = normal;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${GLSL_NOISE}
        uniform float uNight;
        uniform float uTime;
        uniform float uMotion;
        uniform vec3 uSkyA1;
        varying vec3 vA1Local;
        varying float vA1Seed;
        varying vec3 vA1N;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float seed = floor(vA1Seed + 0.5);
          float u = abs(vA1N.x) > 0.5 ? vA1Local.z : vA1Local.x;
          float side = abs(vA1N.x) > 0.5 ? (vA1N.x > 0.0 ? 1.0 : 2.0) : (vA1N.z > 0.0 ? 3.0 : 4.0);
          float vy = vA1Local.y;
          float nightK = uNight * uNight;
          ${
            mode === 'office'
              ? `float bay = floor(u / 0.75);
          float h = a1hash13(vec3(bay, side, seed));
          float h2 = a1hash13(vec3(bay + 7.0, side * 3.1, seed + 11.0));
          float litRatio = 0.08 + 0.3 * uNight;
          float lit = step(h, litRatio);
          // Slow life: rooms dim and brighten; a few switch on or off over minutes.
          float t = uTime * uMotion;
          float breathe = 0.72 + 0.28 * sin(t * (0.05 + 0.07 * h2) + h2 * 40.0);
          float toggle = step(0.86, h2) * smoothstep(-0.25, 0.25, sin(t * 0.021 + h * 61.0));
          lit = clamp(lit + toggle * step(0.3, uNight), 0.0, 1.0);
          vec3 warm = h2 < 0.6 ? vec3(1.0, 0.72, 0.45) : h2 < 0.88 ? vec3(1.0, 0.86, 0.68) : vec3(0.82, 0.9, 1.0);
          float ceiling = 0.55 + 0.45 * smoothstep(0.1, 0.9, vy / 1.4);
          float edge = smoothstep(0.0, 0.06, fract(u / 0.75)) * smoothstep(1.0, 0.94, fract(u / 0.75));
          totalEmissiveRadiance += warm * lit * breathe * ceiling * edge * (0.04 + 1.15 * nightK);
          // Sky gradient in the glass: grazing angles and upper floors pick up the bright horizon sky.
          float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
          float upper = smoothstep(2.0, 30.0, vA1World.y);
          totalEmissiveRadiance += uSkyA1 * (0.06 + 0.16 * upper + 0.35 * fres) * (1.0 - uNight) * (1.0 - lit * nightK);`
              : mode === 'lobby'
                ? `// A lit lobby seen through the glass: bright ceiling with a row of downlights, a soft wash on the back
          // wall, darker floor and furniture zone, and a few columns breaking up the depth.
          float hgt = vy;
          float lights = pow(max(0.0, sin(u * 3.14159 / 0.9)), 8.0) * smoothstep(2.2, 2.45, hgt);
          float floorZone = 1.0 - smoothstep(0.0, 0.9, hgt);
          float column = step(0.88, fract(u / 3.1 + seed * 0.13));
          vec3 warm = vec3(1.0, 0.8, 0.58);
          vec3 lobby = warm * (0.32 + 0.35 * smoothstep(0.6, 2.4, hgt) + 0.9 * lights) * (1.0 - 0.55 * floorZone) * (1.0 - 0.6 * column);
          totalEmissiveRadiance += lobby * (0.08 + 0.25 * nightK);`
                : `totalEmissiveRadiance += vec3(1.0, 0.78, 0.42) * (0.18 + 1.6 * nightK);`
          }
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // Each pane sits a hair off-plane, so it mirrors a slightly different patch of sky (no flat colour).
          float pane = floor((abs(vA1N.x) > 0.5 ? vA1Local.z : vA1Local.x) / 0.75);
          float ph = a1hash13(vec3(pane, floor(vA1Seed + 0.5), 3.0));
          float ph2 = a1hash13(vec3(pane, floor(vA1Seed + 0.5), 9.0));
          normal = normalize(normal + vec3(ph - 0.5, ph2 - 0.5, 0.0) * 0.07);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), 0.3);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        mode === 'office'
          ? '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - 0.55 * uNight;'
          : '#include <metalnessmap_fragment>',
      );
  };
}

/** Masonry variation: world-space noise, and for brick, coursing with lighter mortar. */
function masonryShader(brick: boolean, ashlar = false) {
  return (shader: Shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 w = vA1World;
          float n = a1noise(w.xz * 2.3 + w.y * 1.7) * 0.5 + a1noise(vec2(w.x + w.z, w.y) * 9.0) * 0.5;
          diffuseColor.rgb *= 0.94 + 0.1 * n;
          ${
            brick
              ? `vec2 bp = vec2((w.x + w.z) * 5.0, w.y * 12.0);
          float row = floor(bp.y);
          bp.x += mod(row, 2.0) * 0.5;
          vec2 f = fract(bp);
          vec2 fw = fwidth(bp) + 1e-4;
          float mortar = 1.0 - smoothstep(0.0, fw.x * 1.5, min(f.x, 1.0 - f.x) - 0.04) * smoothstep(0.0, fw.y * 1.5, min(f.y, 1.0 - f.y) - 0.07);
          float fade = 1.0 - smoothstep(0.12, 0.3, max(fw.x, fw.y));
          diffuseColor.rgb *= 1.0 + (0.16 * a1hash12(floor(bp)) - 0.08) * fade;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.6 + vec3(0.22, 0.21, 0.2), mortar * fade * 0.6);`
              : ashlar
                ? `// Ashlar: courses 0.45 high, blocks 1.1 long with staggered joints, each block a touch different.
          vec2 ap = vec2((w.x + w.z) / 1.1, w.y / 0.45);
          ap.x += mod(floor(ap.y), 2.0) * 0.5;
          vec2 af = fract(ap);
          vec2 afw = fwidth(ap) + 1e-4;
          float jt = 1.0 - smoothstep(0.0, afw.x * 1.2, min(af.x, 1.0 - af.x) - 0.012) * smoothstep(0.0, afw.y * 1.2, min(af.y, 1.0 - af.y) - 0.02);
          float af2 = 1.0 - smoothstep(0.15, 0.4, max(afw.x, afw.y));
          diffuseColor.rgb *= 1.0 + (0.08 * a1hash12(floor(ap)) - 0.04) * af2;
          diffuseColor.rgb *= 1.0 - 0.18 * jt * af2;`
                : ''
          }
        }`,
      );
  };
}

/** Fan blades spinning about their hub. */
function fanShader(shared: SharedUniforms) {
  return (shader: Shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uMotion = shared.uMotion;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;\nuniform float uMotion;\nattribute float aSeed;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float a = uTime * uMotion * (2.2 + fract(aSeed * 0.37) * 1.6) + aSeed;
          float c = cos(a);
          float s = sin(a);
          transformed.xz = mat2(c, -s, s, c) * transformed.xz;
        }`,
      )
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>');
  };
}

export function createKitMaterials(shared: SharedUniforms): KitMaterials {
  const m = (p: ConstructorParameters<typeof MeshStandardMaterial>[0], key: string, extra?: (s: Shader) => void) =>
    std(p, shared, extra, key);
  return {
    glass: m({ roughness: 0.05, metalness: 0.7, envMapIntensity: 1.25 }, 'glass', glassShader(shared, 'office')),
    lobbyGlass: m(
      { roughness: 0.03, metalness: 0.4, envMapIntensity: 1.0, transparent: true, opacity: 0.45, depthWrite: false },
      'lobby',
      glassShader(shared, 'lobby'),
    ),
    lantern: m({ roughness: 0.15, metalness: 0.5 }, 'lantern', glassShader(shared, 'lantern')),
    doorGlass: m({ roughness: 0.03, metalness: 0.4, transparent: true, opacity: 0.4, depthWrite: false }, 'door'),
    railGlass: m({ roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.38, depthWrite: false }, 'rail'),
    slab: m({ roughness: 0.85 }, 'slab'),
    metal: m({ roughness: 0.32, metalness: 0.9 }, 'metal'),
    darkMetal: m({ roughness: 0.4, metalness: 0.75 }, 'dmetal'),
    gold: m({ roughness: 0.28, metalness: 1 }, 'gold'),
    paint: m({ roughness: 0.35, metalness: 0.4 }, 'paint'),
    panel: m({ roughness: 0.45, metalness: 0.2 }, 'panel'),
    concrete: m({ roughness: 0.82 }, 'concrete', masonryShader(false)),
    stone: m({ roughness: 0.7 }, 'stone', masonryShader(false, true)),
    brick: m({ roughness: 0.86 }, 'brick', masonryShader(true)),
    wood: m({ roughness: 0.55 }, 'wood'),
    roof: m({ roughness: 0.92 }, 'roof', masonryShader(false)),
    deck: m({ roughness: 0.8 }, 'deck', masonryShader(false)),
    garden: m({ roughness: 0.95 }, 'garden'),
    foliage: m({ roughness: 0.9, flatShading: false }, 'foliage'),
    mech: m({ roughness: 0.5, metalness: 0.5 }, 'mech'),
    louvre: m({ roughness: 0.4, metalness: 0.8 }, 'louvre'),
    fan: m({ roughness: 0.5, metalness: 0.6, side: DoubleSide }, 'fan', fanShader(shared)),
    canvas: m({ roughness: 0.9 }, 'canvas'),
    solar: m({ roughness: 0.18, metalness: 0.7 }, 'solar'),
    glow: m({ emissive: new Color('#ffe1b0'), emissiveIntensity: 0.4, roughness: 0.5 }, 'glow'),
    beacon: m({ emissive: new Color('#f5b335'), emissiveIntensity: 0.6, roughness: 0.4 }, 'beacon'),
  };
}

/** Night-dependent intensities of the plain emissive materials. */
export function updateKitMaterials(mats: KitMaterials, s: EnvState, time: number, motion: number): void {
  const n = s.nightFactor;
  (mats.glow as MeshStandardMaterial).emissiveIntensity = 0.35 + 2.2 * n;
  (mats.beacon as MeshStandardMaterial).emissiveIntensity =
    (0.6 + 2.6 * n) * (motion ? 0.75 + 0.25 * Math.sin(time * 1.3) : 1);
}
