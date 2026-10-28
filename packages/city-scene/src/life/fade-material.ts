import * as THREE from 'three';

export interface HazeUniforms {
  /** Colour distant things fade towards (the scene's fog colour, set each frame). */
  uHazeColor: THREE.IUniform<THREE.Color>;
  /** Haze per unit of distance (exponential). */
  uHazeDensity: THREE.IUniform<number>;
}

/**
 * A vertex-coloured standard material whose instances fade individually (attribute `iFade`, 0..1). With `haze`,
 * scene fog is replaced by a much thinner atmospheric haze, so aircraft kilometres away stay visible but soft
 * (the city's fog is tuned for streets and would hide them completely).
 */
export function fadingMaterial(key: string, params: THREE.MeshStandardMaterialParameters = {}, haze?: HazeUniforms) {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.2,
    transparent: true,
    ...params,
    ...(haze ? { fog: false } : {}),
  });
  m.onBeforeCompile = shader => {
    shader.vertexShader =
      'attribute float iFade;\nvarying float vFade;\nvarying float vHazeDist;\n' +
      shader.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = iFade;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvHazeDist = -mvPosition.z;');
    let frag = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.a *= vFade;',
    );
    if (haze) {
      Object.assign(shader.uniforms, haze);
      frag =
        'uniform vec3 uHazeColor;\nuniform float uHazeDensity;\n' +
        frag.replace(
          '#include <dithering_fragment>',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, 1.0 - exp(-vHazeDist * uHazeDensity));\n#include <dithering_fragment>',
        );
    }
    shader.fragmentShader = 'varying float vFade;\nvarying float vHazeDist;\n' + frag;
  };
  m.customProgramCacheKey = () => `agentcity-fade-${key}${haze ? '-haze' : ''}`;
  return m;
}
