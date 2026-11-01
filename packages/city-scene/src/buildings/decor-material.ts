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
import { injectCloudShadow } from '../environment/cloud-shadow.ts';
import type { SharedUniforms } from '../environment/palette.ts';
import { CURB_H } from '../streets/grid.ts';
import { FLOOR_HEIGHT } from '../types.ts';
import type { DecorBox } from './decor.ts';

/**
 * Legacy-style facade for the pastel decor buildings: pastel walls (instance colour), a regular grid of
 * white-framed windows with a light sill, a dark shopfront on the ground floor, a light flat roof; at night a
 * share of the windows and every shopfront glow. One instanced draw for all decor buildings.
 */
export function createDecorMaterial(shared: SharedUniforms): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.82 });
  m.onBeforeCompile = shader => {
    shader.uniforms.uNight = shared.uNight;
    injectCloudShadow(shader, shared);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aSeedD;\nvarying vec4 vFacD;\nvarying float vSeedD;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec3 ip = transformed + 0.5;
          vec3 n = objectNormal;
          float u = 0.0; float fw = 1.0; float roof = 0.0;
          if (abs(n.x) > 0.5) { u = (n.x > 0.0 ? 1.0 - ip.z : ip.z) * sc.z; fw = sc.z; }
          else if (abs(n.z) > 0.5) { u = (n.z > 0.0 ? ip.x : 1.0 - ip.x) * sc.x; fw = sc.x; }
          else { roof = 1.0; }
          vFacD = vec4(u, ip.y * sc.y, fw, roof);
          vSeedD = aSeedD;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'varying vec3 vA1World;',
        `varying vec3 vA1World;
        uniform float uNight;
        varying vec4 vFacD;
        varying float vSeedD;
        float dBox(vec2 p, vec2 lo, vec2 hi, vec2 aa) {
          vec2 s = smoothstep(lo - aa, lo + aa, p) * (1.0 - smoothstep(hi - aa, hi + aa, p));
          return s.x * s.y;
        }`,
      )
      .replace('void main() {', 'void main() {\nvec3 emitD = vec3(0.0);\nfloat roughD = 0.82;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vFacD.w > 0.5) {
          diffuseColor.rgb = vec3(0.4, 0.4, 0.4);
          roughD = 0.9;
        } else {
          float seed = floor(vSeedD + 0.5);
          float lv = vFacD.y / ${FLOOR_HEIGHT.toFixed(3)};
          float fl = floor(lv);
          float fy = fract(lv);
          float nb = max(1.0, floor(vFacD.z / 1.15 + 0.5));
          float bu = vFacD.x / vFacD.z * nb;
          float bay = floor(bu);
          float fx = fract(bu);
          vec2 dd = vec2(fwidth(bu), fwidth(lv));
          vec2 aa = clamp(dd * 0.8, 0.002, 0.5);
          float detail = 1.0 - smoothstep(0.2, 0.45, max(dd.x, dd.y));
          vec3 wall = diffuseColor.rgb;
          vec3 col = wall;
          if (fl < 0.5) {
            // Shopfront: dark glass between slim white piers, with a light sign band above.
            float sf = dBox(vec2(fract(vFacD.x / 2.4), fy), vec2(0.06, 0.04), vec2(0.94, 0.7), aa);
            col = mix(wall, vec3(0.07, 0.09, 0.11), sf);
            col = mix(col, vec3(0.12, 0.11, 0.1), step(0.74, fy) * step(fy, 0.84));
            emitD = vec3(1.0, 0.8, 0.55) * sf * (0.05 + 0.9 * uNight);
            roughD = mix(0.82, 0.15, sf);
          } else {
            float frame = dBox(vec2(fx, fy), vec2(0.24, 0.2), vec2(0.76, 0.82), aa);
            float glass = dBox(vec2(fx, fy), vec2(0.3, 0.26), vec2(0.7, 0.76), aa);
            float mull = 1.0 - dBox(vec2(fx, fy), vec2(0.485, -1.0), vec2(0.515, 2.0), aa);
            vec3 white = vec3(0.7, 0.67, 0.61);
            col = mix(wall, white, frame * detail);
            col = mix(col, vec3(0.17, 0.23, 0.29), glass * mull * detail);
            float h = fract(sin(dot(vec3(bay, fl, seed), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            float lit = step(h, 0.25 + 0.3 * uNight);
            emitD = vec3(1.0, 0.78, 0.5) * glass * mull * lit * detail * uNight * uNight * 1.1;
            // Distant blocks: the grid averages out instead of shimmering.
            col = mix(mix(wall, white, 0.25), col, detail);
            roughD = mix(0.85, 0.2, glass * detail);
          }
          diffuseColor.rgb = col;
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = roughD;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += emitD;');
  };
  m.customProgramCacheKey = () => 'a1-decor-v2';
  return m;
}

/** One instanced mesh for every decor building. */
export function buildDecorMesh(boxes: DecorBox[], material: MeshStandardMaterial, castShadow: boolean): InstancedMesh {
  const geo = new BoxGeometry(1, 1, 1);
  const seeds = new Float32Array(boxes.length);
  const mesh = new InstancedMesh(geo, material, Math.max(1, boxes.length));
  const m = new Matrix4();
  const c = new Color();
  boxes.forEach((b, i) => {
    const h = b.floors * FLOOR_HEIGHT;
    mesh.setMatrixAt(i, m.compose(new Vector3(b.x, CURB_H + h / 2, b.z), new Quaternion(), new Vector3(b.w, h, b.d)));
    mesh.setColorAt(i, c.set(b.color));
    seeds[i] = b.seed;
  });
  geo.setAttribute('aSeedD', new InstancedBufferAttribute(seeds, 1));
  mesh.count = boxes.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  mesh.raycast = () => {};
  mesh.name = 'a1-district-decor';
  return mesh;
}
