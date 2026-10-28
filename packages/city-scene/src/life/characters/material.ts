import * as THREE from 'three';
import type { CharacterLook } from './zones.ts';

/**
 * GLSL that turns the baked zone (COLOR_0.r × 8) into a colour. `source` names the five colours: uniforms for a
 * single character, per-instance attributes for the crowd.
 */
export function zoneColorChunk(source: {
  skin: string;
  top: string;
  bottom: string;
  shoes: string;
  hair: string;
  shirt: string;
  hasShirt: string;
}) {
  return /* glsl */ `
  float acZone = floor(color.r * 8.0 + 0.5);
  vZone = acZone;
  vColor = vec4(${source.skin}, 1.0);
  if (acZone == 1.0) vColor.rgb = ${source.top};
  else if (acZone == 2.0) vColor.rgb = ${source.bottom};
  else if (acZone == 3.0) vColor.rgb = ${source.shoes};
  else if (acZone == 4.0) vColor.rgb = ${source.hair};
  else if (acZone == 5.0) vColor.rgb = vec3(0.05, 0.045, 0.04);
  else if (acZone == 6.0) vColor.rgb = ${source.hasShirt} ? ${source.shirt} : ${source.top};
  else if (acZone == 7.0) vColor.rgb = ${source.hasShirt} ? vec3(0.025, 0.02, 0.018) : ${source.bottom};
`;
}

/** Fabric is matte, skin a little smoother, hair and shoes have a soft sheen; a lamp fill keeps people readable at night. */
export const ZONE_FRAGMENT = /* glsl */ `
  float acZ = floor(vZone + 0.5);
  if (acZ == 0.0) roughnessFactor = 0.62;
  else if (acZ == 3.0 || acZ == 7.0) roughnessFactor = 0.45;
  else if (acZ == 4.0) roughnessFactor = 0.7;
  else if (acZ == 5.0) roughnessFactor = 0.25;
  else roughnessFactor = 0.88;
  totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.2;
`;

export interface LookUniforms {
  uSkin: THREE.IUniform<THREE.Color>;
  uTop: THREE.IUniform<THREE.Color>;
  uBottom: THREE.IUniform<THREE.Color>;
  uShoes: THREE.IUniform<THREE.Color>;
  uHair: THREE.IUniform<THREE.Color>;
  /** rgb = shirt colour, w = 1 when wearing a jacket over it. */
  uShirt: THREE.IUniform<THREE.Vector4>;
  uNight: THREE.IUniform<number>;
}

export function lookUniforms(look: CharacterLook): LookUniforms {
  return {
    uSkin: { value: new THREE.Color(look.skin) },
    uTop: { value: new THREE.Color(look.top) },
    uBottom: { value: new THREE.Color(look.bottom) },
    uShoes: { value: new THREE.Color(look.shoes) },
    uHair: { value: new THREE.Color(look.hair) },
    uShirt: { value: shirtVec(look) },
    uNight: { value: 0 },
  };
}

export function setLook(u: LookUniforms, look: CharacterLook) {
  u.uSkin.value.set(look.skin);
  u.uTop.value.set(look.top);
  u.uBottom.value.set(look.bottom);
  u.uShoes.value.set(look.shoes);
  u.uHair.value.set(look.hair);
  u.uShirt.value.copy(shirtVec(look));
}

function shirtVec(look: CharacterLook) {
  const c = new THREE.Color(look.shirt ?? '#ffffff');
  return new THREE.Vector4(c.r, c.g, c.b, look.shirt ? 1 : 0);
}

/** Material for one skinned character (three.js skinning), coloured by zone from uniforms. */
export function characterMaterial(u: LookUniforms) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader =
      'uniform vec3 uSkin; uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uShoes; uniform vec3 uHair; uniform vec4 uShirt;\nvarying float vZone;\n' +
      shader.vertexShader.replace(
        '#include <color_vertex>',
        zoneColorChunk({
          skin: 'uSkin',
          top: 'uTop',
          bottom: 'uBottom',
          shoes: 'uShoes',
          hair: 'uHair',
          shirt: 'uShirt.rgb',
          hasShirt: '(uShirt.w > 0.5)',
        }),
      );
    shader.fragmentShader =
      'uniform float uNight;\nvarying float vZone;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' + ZONE_FRAGMENT,
      );
  };
  m.customProgramCacheKey = () => 'agentcity-character';
  return m;
}
