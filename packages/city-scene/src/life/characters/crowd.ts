import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterAsset } from './asset.ts';
import { ZONE_FRAGMENT } from './material.ts';
import {
  CLIPS,
  HAIR_MESH,
  HAIRS,
  type CharacterBody,
  type CharacterClip,
  type CharacterHair,
  type CharacterLook,
} from './zones.ts';

/**
 * Instanced skeletal crowd. Each clip is sampled once into a bone-matrix texture (one row per frame, four texels per
 * bone); the vertex shader skins every instance from it, interpolating between frames and cross-fading between two
 * clips. One draw call per body type for any number of people, with real skeletal animation.
 */
export const CROWD_FPS = 24;

export interface BakedClip {
  /** First texture row of the clip. */
  row: number;
  frames: number;
  duration: number;
}

export interface CrowdBake {
  body: CharacterBody;
  texture: THREE.DataTexture;
  clips: Record<CharacterClip, BakedClip>;
  geometry: THREE.BufferGeometry;
  /** Hairstyle → hair index used by the shader (1-based; 0 is the body). */
  hairIndex: Partial<Record<CharacterHair, number>>;
  /** Ground covered by one cycle of each walk clip, in metres (so feet never slide). */
  stride: Partial<Record<CharacterClip, number>>;
}

/** Bake the given clips for one body. Runs once per body when the asset arrives (a few milliseconds). */
export function bakeCrowd(asset: CharacterAsset, body: CharacterBody, clipNames: CharacterClip[]): CrowdBake {
  const name = body === 'male' ? 'Male' : 'Female';
  const root = cloneSkinned(asset.scene.getObjectByName(name)!) as THREE.Group;
  const lod = root.getObjectByName(`${name}_Body_LOD`) as THREE.SkinnedMesh;
  const skeleton = lod.skeleton;
  const bones = skeleton.bones.length;
  const mixer = new THREE.AnimationMixer(root);
  const clips = {} as Record<CharacterClip, BakedClip>;
  const stride: Partial<Record<CharacterClip, number>> = {};
  let rows = 0;
  for (const c of clipNames) {
    const clip = asset.clips[body][c];
    const frames = Math.max(2, Math.round(clip.duration * CROWD_FPS));
    clips[c] = { row: rows, frames, duration: clip.duration };
    rows += frames;
  }
  const data = new Float32Array(bones * 4 * rows * 4);
  const m = new THREE.Matrix4();
  const foot = new THREE.Vector3();
  const ball = root.getObjectByName('ball_l')!;
  for (const c of clipNames) {
    const clip = asset.clips[body][c];
    const { row, frames } = clips[c];
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.reset().play();
    const feet: { y: number; z: number }[] = [];
    for (let f = 0; f < frames; f++) {
      mixer.setTime((f / frames) * clip.duration);
      root.updateMatrixWorld(true);
      skeleton.update();
      for (let b = 0; b < bones; b++) {
        // Bind space → bind space, as three.js skinning does: bindMatrixInverse · bone · bindMatrix.
        m.fromArray(skeleton.boneMatrices!, b * 16)
          .premultiply(lod.bindMatrixInverse)
          .multiply(lod.bindMatrix);
        m.toArray(data, ((row + f) * bones + b) * 16);
      }
      ball.getWorldPosition(foot);
      feet.push({ y: foot.y, z: foot.z });
    }
    if (c.startsWith('walk') || c === 'carry') {
      // In-place walk: the planted foot slides backwards at walking speed. Measure it while it is on the ground.
      const minY = Math.min(...feet.map(p => p.y));
      let travel = 0;
      for (let f = 0; f < frames; f++) {
        const a = feet[f]!;
        const b = feet[(f + 1) % frames]!;
        if (a.y < minY + 0.025 && b.y < minY + 0.025) travel += Math.max(0, a.z - b.z);
      }
      // One foot's ground contact covers half a cycle; the other foot covers the other half.
      stride[c] = travel * 2;
    }
  }
  mixer.stopAllAction();
  const texture = new THREE.DataTexture(data, bones * 4, rows, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;

  // Geometry: the body LOD plus every hairstyle LOD, tagged so an instance shows one hairstyle.
  const parts: THREE.BufferGeometry[] = [];
  const hairIndex: Partial<Record<CharacterHair, number>> = {};
  const addPart = (mesh: THREE.SkinnedMesh, hair: number) => {
    const g = mesh.geometry;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.getAttribute('position'));
    out.setAttribute('normal', g.getAttribute('normal'));
    out.setAttribute('aJoints', g.getAttribute('skinIndex'));
    out.setAttribute('aWeights', g.getAttribute('skinWeight'));
    // Zone and hairstyle in one float: hair * 8 + zone.
    const col = g.getAttribute('color');
    const tag = new Float32Array(col.count);
    for (let i = 0; i < col.count; i++) tag[i] = hair * 8 + Math.round(col.getX(i) * 8);
    out.setAttribute('aTag', new THREE.BufferAttribute(tag, 1));
    out.setIndex(g.index);
    parts.push(out);
  };
  addPart(lod, 0);
  HAIRS[body].forEach((h, i) => {
    const mesh = root.getObjectByName(`${HAIR_MESH[body][h]}_LOD`) as THREE.SkinnedMesh | undefined;
    if (!mesh) return;
    hairIndex[h] = i + 1;
    addPart(mesh, i + 1);
  });
  const geometry = mergeGeometries(parts)!;
  geometry.computeBoundingSphere();
  return { body, texture, clips, geometry, hairIndex, stride };
}

const CROWD_VERTEX_HEAD = /* glsl */ `
uniform sampler2D uBones;
uniform float uBoneCount;
attribute vec4 aJoints;
attribute vec4 aWeights;
attribute float aTag;
attribute vec4 iAnimA; // row, frames, frame (fractional), blend towards B
attribute vec4 iAnimB; // row, frames, frame, hairstyle
attribute vec4 iC1;    // skin rgb, shoes (packed rgb)
attribute vec4 iC2;    // top rgb, hair (packed rgb)
attribute vec4 iC3;    // bottom rgb, shirt (packed rgb; -1 = no jacket)
varying float vZone;
mat4 acBone(float row, float joint) {
  int x = int(joint) * 4;
  int y = int(row);
  return mat4(
    texelFetch(uBones, ivec2(x, y), 0),
    texelFetch(uBones, ivec2(x + 1, y), 0),
    texelFetch(uBones, ivec2(x + 2, y), 0),
    texelFetch(uBones, ivec2(x + 3, y), 0));
}
mat4 acClip(vec4 anim) {
  float f0 = floor(anim.z);
  float t = anim.z - f0;
  float r0 = anim.x + mod(f0, anim.y);
  float r1 = anim.x + mod(f0 + 1.0, anim.y);
  mat4 m = mat4(0.0);
  for (int k = 0; k < 4; k++) {
    float w = aWeights[k];
    if (w <= 0.0) continue;
    float j = aJoints[k];
    m += w * (acBone(r0, j) * (1.0 - t) + acBone(r1, j) * t);
  }
  return m;
}
mat4 acSkinMatrix() {
  mat4 m = acClip(iAnimA);
  if (iAnimA.w > 0.001) m = m * (1.0 - iAnimA.w) + acClip(vec4(iAnimB.xyz, 0.0)) * iAnimA.w;
  return m;
}
bool acHidden() {
  float hair = floor((aTag + 0.5) / 8.0);
  return hair > 0.5 && abs(hair - iAnimB.w) > 0.5;
}
vec3 acUnpack(float c) {
  float r = floor(c / 65536.0);
  float g = floor((c - r * 65536.0) / 256.0);
  float b = c - r * 65536.0 - g * 256.0;
  return vec3(r, g, b) / 255.0;
}
`;

const CROWD_COLOR = /* glsl */ `
  float acZone = mod(floor(aTag + 0.5), 8.0);
  vZone = acZone;
  vColor = vec4(iC1.rgb, 1.0);
  if (acZone == 1.0) vColor.rgb = iC2.rgb;
  else if (acZone == 2.0) vColor.rgb = iC3.rgb;
  else if (acZone == 3.0) vColor.rgb = acUnpack(iC1.w);
  else if (acZone == 4.0) vColor.rgb = acUnpack(iC2.w);
  else if (acZone == 5.0) vColor.rgb = vec3(0.05, 0.045, 0.04);
  else if (acZone == 6.0) vColor.rgb = iC3.w >= 0.0 ? acUnpack(iC3.w) : iC2.rgb;
  else if (acZone == 7.0) vColor.rgb = iC3.w >= 0.0 ? vec3(0.025, 0.02, 0.018) : iC3.rgb;
`;

/** sRGB hex → linear colour components (matching three.js colour management). */
function linear(hex: string, c = new THREE.Color()) {
  return c.set(hex);
}

/** Pack a colour into one float (8 bits per channel; exact in a 32-bit float). */
function packColor(hex: string) {
  const c = linear(hex);
  return Math.round(c.r * 255) * 65536 + Math.round(c.g * 255) * 256 + Math.round(c.b * 255);
}

export interface CrowdInstanceAnim {
  clip: CharacterClip;
  /** Seconds into the clip (looped). */
  time: number;
  /** Optional second clip to cross-fade towards, with its own time, and the blend (0 = only `clip`). */
  next?: CharacterClip;
  nextTime?: number;
  blend?: number;
}

/**
 * An instanced crowd of one body type. Set looks once, then per frame set each instance's matrix and animation.
 * Hidden instances: give them a zero-scale matrix, or pack the visible people into the first slots with
 * `assign(slot, person)` and draw only those with `draw(n)` (people out of view then cost nothing).
 */
export class CrowdMesh {
  readonly mesh: THREE.InstancedMesh;
  readonly bake: CrowdBake;
  private animA: THREE.InstancedBufferAttribute;
  private animB: THREE.InstancedBufferAttribute;
  private colors: THREE.InstancedBufferAttribute[];
  readonly uniforms: {
    uBones: THREE.IUniform<THREE.Texture>;
    uBoneCount: THREE.IUniform<number>;
    uNight: THREE.IUniform<number>;
  };

  constructor(bake: CrowdBake, count: number) {
    this.bake = bake;
    this.uniforms = {
      uBones: { value: bake.texture },
      uBoneCount: { value: bake.texture.image.width / 4 },
      uNight: { value: 0 },
    };
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const vertexMain = (s: string, normals: boolean) =>
      s
        .replace(
          '#include <beginnormal_vertex>',
          normals
            ? 'mat4 acSkin = acSkinMatrix();\nvec3 objectNormal = normalize(mat3(acSkin) * normal);'
            : '#include <beginnormal_vertex>',
        )
        .replace(
          '#include <begin_vertex>',
          `${normals ? '' : 'mat4 acSkin = acSkinMatrix();\n'}vec3 transformed = acHidden() ? vec3(0.0) : (acSkin * vec4(position, 1.0)).xyz;`,
        );
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader =
        CROWD_VERTEX_HEAD + vertexMain(shader.vertexShader, true).replace('#include <color_vertex>', CROWD_COLOR);
      shader.fragmentShader =
        'uniform float uNight;\nvarying float vZone;\n' +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n' + ZONE_FRAGMENT,
        );
    };
    material.customProgramCacheKey = () => 'agentcity-crowd';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader =
        CROWD_VERTEX_HEAD.replace('varying float vZone;', '') + vertexMain(shader.vertexShader, false);
    };
    depth.customProgramCacheKey = () => 'agentcity-crowd-depth';
    const geometry = bake.geometry.clone();
    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
    this.mesh.customDepthMaterial = depth;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const attr = (n: string) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(this.mesh.count * 4), 4);
      geometry.setAttribute(n, a);
      return a;
    };
    this.animA = attr('iAnimA');
    this.animB = attr('iAnimB');
    this.animA.setUsage(THREE.DynamicDrawUsage);
    this.animB.setUsage(THREE.DynamicDrawUsage);
    this.colors = [attr('iC1'), attr('iC2'), attr('iC3')];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.mesh.count; i++) this.mesh.setMatrixAt(i, zero);
  }

  setLook(i: number, look: CharacterLook, hair: CharacterHair) {
    const c = new THREE.Color();
    const [c1, c2, c3] = this.colors as [
      THREE.InstancedBufferAttribute,
      THREE.InstancedBufferAttribute,
      THREE.InstancedBufferAttribute,
    ];
    linear(look.skin, c);
    c1.setXYZW(i, c.r, c.g, c.b, packColor(look.shoes));
    linear(look.top, c);
    c2.setXYZW(i, c.r, c.g, c.b, packColor(look.hair));
    linear(look.bottom, c);
    c3.setXYZW(i, c.r, c.g, c.b, look.shirt ? packColor(look.shirt) : -1);
    for (const a of this.colors) a.needsUpdate = true;
    this.hair[i] = this.bake.hairIndex[hair] ?? 1;
    // Remember person i's look, so it can move to another slot later.
    const saved = new Float32Array(12);
    this.colors.forEach((a, k) => saved.set([a.getX(i), a.getY(i), a.getZ(i), a.getW(i)], k * 4));
    this.looks[i] = { colors: saved, hair: this.hair[i]! };
  }

  private hair: number[] = [];
  private looks: { colors: Float32Array; hair: number }[] = [];

  /** Draw person `person`'s look in instance `slot` (set its matrix and animation on that slot too). */
  assign(slot: number, person: number) {
    const look = this.looks[person];
    if (!look) return;
    this.colors.forEach((a, k) =>
      a.setXYZW(slot, look.colors[k * 4]!, look.colors[k * 4 + 1]!, look.colors[k * 4 + 2]!, look.colors[k * 4 + 3]!),
    );
    this.hair[slot] = look.hair;
    this.packed = true;
  }

  private packed = false;

  /** Draw only the first `n` slots. */
  draw(n: number) {
    this.mesh.count = Math.max(0, Math.min(n, this.capacity));
  }

  /** Number of slots (people) the mesh was made for. */
  get capacity() {
    return this.mesh.instanceMatrix.count;
  }

  /** Set instance `i`'s animation state (times in seconds, wrapped per clip). */
  setAnim(i: number, a: CrowdInstanceAnim) {
    const A = this.bake.clips[a.clip];
    const fa = ((((a.time / A.duration) % 1) + 1) % 1) * A.frames;
    const blend = a.next ? Math.max(0, Math.min(1, a.blend ?? 0)) : 0;
    this.animA.setXYZW(i, A.row, A.frames, fa, blend);
    if (a.next && blend > 0) {
      const B = this.bake.clips[a.next];
      const fb = (((((a.nextTime ?? 0) / B.duration) % 1) + 1) % 1) * B.frames;
      this.animB.setXYZW(i, B.row, B.frames, fb, this.hair[i] ?? 1);
    } else this.animB.setW(i, this.hair[i] ?? 1);
  }

  /** Call once per frame after setting matrices and animations. */
  commit() {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.animA.needsUpdate = true;
    this.animB.needsUpdate = true;
    if (this.packed) for (const a of this.colors) a.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.customDepthMaterial?.dispose();
  }
}

/** Clips the street crowd uses (A3 may bake others, e.g. `type`, for offices). */
export const STREET_CLIPS: CharacterClip[] = [
  'idle',
  'talk',
  'phone',
  'foldArms',
  'walk',
  'walkFormal',
  'sit',
  'sitTalk',
];
export { CLIPS };
