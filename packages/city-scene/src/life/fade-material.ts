import * as THREE from 'three';

/** A vertex-coloured standard material whose instances fade individually (attribute `iFade`, 0..1). */
export function fadingMaterial(key: string, params: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.2,
    transparent: true,
    ...params,
  });
  m.onBeforeCompile = shader => {
    shader.vertexShader =
      'attribute float iFade;\nvarying float vFade;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = iFade;');
    shader.fragmentShader =
      'varying float vFade;\n' +
      shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  m.customProgramCacheKey = () => `agentcity-fade-${key}`;
  return m;
}
