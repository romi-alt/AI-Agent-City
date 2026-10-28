/**
 * Shared materials of the surround: one facade material for every ring (style, shopfront and window glow come from
 * per-instance attributes), one striped awning material and one vertex-coloured material for the roof items.
 * Night glow follows one uniform the component sets from `useEnvironmentLight().nightFactor` every frame.
 */
import { type Color, type DataArrayTexture, MeshStandardMaterial } from 'three';
import { FLOOR_HEIGHT } from '../../types.ts';
import { BAY, createFacadeTexture, SINK } from './facade.ts';
import { STYLE } from './plan.ts';

type Shader = Parameters<MeshStandardMaterial['onBeforeCompile']>[0];

export interface SurroundUniforms {
  uSNight: { value: number };
  uSFacade: { value: DataArrayTexture };
  /** The environment's live fog colour (read only): Ring 3 dissolves into it. */
  uSFog: { value: Color };
}

const f = (n: number) => n.toFixed(4);

/** The instance's own scale (box size in world units), read from its matrix columns. */
const INSTANCE_SCALE = /* glsl */ `
  vec3 sSc = vec3(1.0);
  #ifdef USE_INSTANCING
    sSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  #endif`;

const FACADE_VERTEX_HEAD = /* glsl */ `
attribute vec4 aFacade;
varying vec3 vSLocal;
varying vec3 vSScale;
varying vec3 vSN;
varying vec4 vSFacade;`;

// Geometry is a unit box standing on y = 0 (x, z in -0.5..0.5); vSLocal is in metres from its corner.
const FACADE_VERTEX = /* glsl */ `
{
  ${INSTANCE_SCALE}
  vSScale = sSc;
  vSLocal = vec3((position.x + 0.5) * sSc.x, position.y * sSc.y, (position.z + 0.5) * sSc.z);
  vSN = normal;
  vSFacade = aFacade;
}`;

const FACADE_FRAGMENT_HEAD = /* glsl */ `
uniform float uSNight;
uniform vec3 uSFog;
uniform mediump sampler2DArray uSFacade;
varying vec3 vSLocal;
varying vec3 vSScale;
varying vec3 vSN;
varying vec4 vSFacade;
float sHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}`;

// After <color_fragment> (diffuseColor already holds the instance colour). Declares sGlass / sLit for later chunks.
// aFacade: x = style, y = shopfront on the ground floor, z = seed, w = share of windows lit at night.
const FACADE_FRAGMENT = /* glsl */ `
float sGlass = 0.0;
float sLit = 0.0;
float sBright = 1.0;
vec3 sWarm = vec3(1.0, 0.76, 0.46);
if (abs(vSN.y) < 0.5) {
  bool alongZ = abs(vSN.x) > 0.5;
  float faceW = alongZ ? vSScale.z : vSScale.x;
  float along = alongZ ? vSLocal.z : vSLocal.x;
  float bays = max(1.0, floor(faceW / ${f(BAY)} + 0.5));
  vec2 uv = vec2(along / faceW * bays, (vSLocal.y - ${f(SINK)}) / ${f(FLOOR_HEIGHT)});
  float ground = step(uv.y, 1.0) * step(0.5, vSFacade.y);
  float style = mix(vSFacade.x, ${f(STYLE.shop)}, ground);
  vec4 albedo = texture(uSFacade, vec3(uv, style * 2.0));
  float mask = texture(uSFacade, vec3(uv, style * 2.0 + 1.0)).r;
  diffuseColor.rgb = mix(diffuseColor.rgb * albedo.rgb, albedo.rgb, albedo.a);
  sGlass = mask;
  float side = alongZ ? (vSN.x > 0.0 ? 1.0 : 2.0) : (vSN.z > 0.0 ? 3.0 : 4.0);
  float h = sHash(vec3(floor(uv.x), floor(uv.y), side + vSFacade.z * 97.0));
  sLit = max(ground, step(h, vSFacade.w));
  float tone = sHash(vec3(floor(uv.y), floor(uv.x) * 1.7, vSFacade.z * 13.0));
  sBright = mix(0.45, 1.0, fract(tone * 7.31)) * mix(1.0, 1.4, ground);
  sWarm = tone < 0.65 ? vec3(1.0, 0.74, 0.44) : tone < 0.9 ? vec3(1.0, 0.88, 0.66) : vec3(0.8, 0.9, 1.0);
} else if (vSN.y > 0.5) {
  // Roof: a darker, greyer take on the wall colour (Ring 1 roofs are covered by their cornice cap anyway).
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.42, 0.44), 0.45);
}`;

// Ring 3 only: the far towers sit in haze on top of the scene fog, densest at their base, so they stay a soft pale
// silhouette at any fog setting.
const HAZE = /* glsl */ `
gl_FragColor.rgb = mix(gl_FragColor.rgb, uSFog, mix(0.55, 0.3, clamp(vSLocal.y / 60.0, 0.0, 1.0)) * (1.0 - 0.5 * uSNight));`;

function facadeShader(u: SurroundUniforms, haze: boolean) {
  return (shader: Shader) => {
    shader.uniforms.uSNight = u.uSNight;
    shader.uniforms.uSFacade = u.uSFacade;
    shader.uniforms.uSFog = u.uSFog;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FACADE_VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FACADE_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FACADE_FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FACADE_FRAGMENT}`)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.28, sGlass);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        // Lit windows by night; a faint warm hint by day keeps shop windows from reading as holes.
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += sWarm * sGlass * sLit * sBright * (0.02 + 0.75 * uSNight * uSNight);`,
      )
      .replace('#include <tonemapping_fragment>', `${haze ? HAZE : ''}\n#include <tonemapping_fragment>`);
  };
}

export interface SurroundMaterials {
  uniforms: SurroundUniforms;
  facade: MeshStandardMaterial;
  /** The facade material plus horizon haze, for Ring 3. */
  far: MeshStandardMaterial;
  cap: MeshStandardMaterial;
  awning: MeshStandardMaterial;
  props: MeshStandardMaterial;
  dispose(): void;
}

function awningShader(shader: Shader) {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      '#include <common>\nattribute float aStripe;\nvarying float vSStripe;\nvarying float vSU;',
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        ${INSTANCE_SCALE}
        vSU = (position.x + 0.5) * sSc.x;
        vSStripe = aStripe;
      }`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vSStripe;\nvarying float vSU;')
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.95, 0.92), vSStripe * step(0.5, fract(vSU * 2.4)));`,
    );
}

function facadeMaterial(uniforms: SurroundUniforms, haze: boolean) {
  const m = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.86 });
  m.onBeforeCompile = facadeShader(uniforms, haze);
  m.customProgramCacheKey = () => `d2-surround-facade-v1-${haze ? 'far' : 'near'}`;
  return m;
}

/** `fog` is the environment's shared fog colour uniform (`useEnvRuntime().uniforms.uFogColor`). */
export function createSurroundMaterials(fog: { value: Color }): SurroundMaterials {
  const uniforms: SurroundUniforms = { uSNight: { value: 0 }, uSFacade: { value: createFacadeTexture() }, uSFog: fog };
  const facade = facadeMaterial(uniforms, false);
  const far = facadeMaterial(uniforms, true);
  const cap = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  const awning = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
  awning.onBeforeCompile = awningShader;
  awning.customProgramCacheKey = () => 'd2-surround-awning-v1';
  const props = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  return {
    uniforms,
    facade,
    far,
    cap,
    awning,
    props,
    dispose() {
      for (const m of [facade, far, cap, awning, props]) m.dispose();
      uniforms.uSFacade.value.dispose();
    },
  };
}
