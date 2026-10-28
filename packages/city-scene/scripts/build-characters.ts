/**
 * Builds apps/web/public/city/models/characters.glb from the Quaternius CC0 packs (see ASSETS.md):
 *   Universal Base Characters (bodies, eyes, brows, hair) + Universal Animation Library 1 and 2 (clips).
 *
 * Usage: CHAR_SRC=/path/to/src node --import tsx scripts/build-characters.ts
 * where CHAR_SRC holds UAL1_Standard.glb, UAL2_Standard.glb, base/ (Godot - UE glTF bodies) and hair/
 * ("Rigged to Head Bone" glTF hairstyles). The source packs are not committed; only the output is.
 *
 * What it does:
 * - drops every texture: clothing is painted by the shader from a per-vertex zone (skin, top, bottom, shoes, hair,
 *   eyes) derived from the dominant bone, so one asset gives any outfit and stays small;
 * - adds a simplified level of detail of each body and hairstyle for the instanced street crowd;
 * - keeps the clips city life and offices need, strips finger animation to a held pose and keeps only rotations
 *   (plus the pelvis height), and synthesises a typing clip from the seated driving pose.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

// GLTFExporter (binary) reads Blobs with FileReader, which Node lacks.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(b: Blob) {
    void b.arrayBuffer().then(r => {
      this.result = r;
      this.onloadend?.();
    });
  }
  readAsDataURL(b: Blob) {
    void b.arrayBuffer().then(r => {
      this.result = `data:${b.type || 'application/octet-stream'};base64,${Buffer.from(r).toString('base64')}`;
      this.onloadend?.();
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;
// FileLoader reports progress with ProgressEvent (data: URIs go through fetch).
(globalThis as unknown as { ProgressEvent: unknown }).ProgressEvent ??= class extends Event {
  constructor(type: string, init: Record<string, unknown> = {}) {
    super(type);
    Object.assign(this, init);
  }
};

const SRC = process.env.CHAR_SRC ?? '/tmp/claude-0/src';
const OUT = new URL('../../../apps/web/public/city/models/characters.glb', import.meta.url).pathname;

/** Zones painted by the shader. Keep in sync with src/life/characters/zones.ts. */
const ZONE = { skin: 0, top: 1, bottom: 2, shoes: 3, hair: 4, eyes: 5, shirt: 6, belt: 7 } as const;

const loader = new GLTFLoader();
function parse(data: ArrayBuffer | string): Promise<GLTF> {
  return new Promise((res, rej) => loader.parse(data, '', res, rej));
}

async function loadGlb(path: string) {
  const b = readFileSync(path);
  return parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

/** A .gltf with an external .bin, with textures removed (we paint by zone). */
async function loadGltf(path: string) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  for (const buf of json.buffers) {
    const bin = readFileSync(join(dirname(path), buf.uri));
    buf.uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;
  }
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    const pbr = m.pbrMetallicRoughness ?? {};
    delete pbr.baseColorTexture;
    delete pbr.metallicRoughnessTexture;
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
    m.extensions = undefined;
  }
  return parse(JSON.stringify(json));
}

function skinnedMeshes(root: THREE.Object3D) {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse(o => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh);
  });
  return out;
}

function zoneForBone(name: string): number {
  if (/^(Head|neck_01)$/.test(name)) return ZONE.skin;
  if (/^(hand|index|middle|pinky|ring|thumb)_/.test(name)) return ZONE.skin;
  if (/^(foot|ball)_/.test(name)) return ZONE.shoes;
  if (/^(pelvis|thigh|calf)/.test(name)) return ZONE.bottom;
  return ZONE.top;
}

/** Bake a per-vertex zone (in COLOR_0.r, as zone / 8) and strip everything the runtime does not use. */
function prepare(mesh: THREE.SkinnedMesh, fixedZone: number | null) {
  const g = mesh.geometry;
  for (const k of Object.keys(g.attributes))
    if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let zone = fixedZone;
    if (zone === null) {
      let best = 0;
      let bi = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w > best) {
          best = w;
          bi = si.getComponent(i, k);
        }
      }
      zone = zoneForBone(mesh.skeleton.bones[bi]!.name);
    }
    col[i * 3] = zone / 8;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  mesh.material = new THREE.MeshStandardMaterial({ name: 'Character', vertexColors: true, roughness: 0.8 });
}

/**
 * Dress a base body: the packs ship athletic bodies in underwear, so clothing painted straight onto them reads as
 * body paint. Clothed zones are smoothed (Laplacian, which softens muscle and anatomy into fabric) and pushed out a
 * little along the normal; a V of shirt shows at the neck of the top and a belt band marks the waist.
 */
function dress(mesh: THREE.SkinnedMesh) {
  const g = mesh.geometry;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  const n = pos.count;
  const zone = (i: number) => Math.round(col.getX(i) * 8);
  // Weld by position so smoothing crosses UV seams.
  const key = (i: number) => `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
  const ids = new Map<string, number>();
  const weld = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = key(i);
    if (!ids.has(k)) ids.set(k, ids.size);
    weld[i] = ids.get(k)!;
  }
  const m = ids.size;
  const nbr: Set<number>[] = Array.from({ length: m }, () => new Set());
  const index = g.index!;
  for (let t = 0; t < index.count; t += 3) {
    const a = weld[index.getX(t)]!;
    const b = weld[index.getX(t + 1)]!;
    const c = weld[index.getX(t + 2)]!;
    nbr[a]!.add(b).add(c);
    nbr[b]!.add(a).add(c);
    nbr[c]!.add(a).add(b);
  }
  const P = new Float32Array(m * 3);
  const clothed = new Uint8Array(m);
  for (let i = 0; i < n; i++) {
    const w = weld[i]!;
    P[w * 3] = pos.getX(i);
    P[w * 3 + 1] = pos.getY(i);
    P[w * 3 + 2] = pos.getZ(i);
    const z = zone(i);
    clothed[w] = z === ZONE.top || z === ZONE.bottom ? 1 : 0;
  }
  // Vertices on a clothing edge (next to skin or shoes) stay put so cuffs and collars do not pull.
  const edge = new Uint8Array(m);
  for (let w = 0; w < m; w++) if (clothed[w]) for (const o of nbr[w]!) if (!clothed[o]) edge[w] = 1;
  for (let it = 0; it < 6; it++) {
    const Q = P.slice();
    for (let w = 0; w < m; w++) {
      if (!clothed[w] || edge[w] || nbr[w]!.size === 0) continue;
      let x = 0;
      let y = 0;
      let z = 0;
      for (const o of nbr[w]!) {
        x += P[o * 3]!;
        y += P[o * 3 + 1]!;
        z += P[o * 3 + 2]!;
      }
      const k = 1 / nbr[w]!.size;
      Q[w * 3] = P[w * 3]! * 0.4 + x * k * 0.6;
      Q[w * 3 + 1] = P[w * 3 + 1]! * 0.4 + y * k * 0.6;
      Q[w * 3 + 2] = P[w * 3 + 2]! * 0.4 + z * k * 0.6;
    }
    P.set(Q);
  }
  for (let i = 0; i < n; i++) {
    const w = weld[i]!;
    pos.setXYZ(i, P[w * 3]!, P[w * 3 + 1]!, P[w * 3 + 2]!);
  }
  g.computeVertexNormals();
  // Fabric thickness (smoothing also shrinks a little), then the shirt V and the belt.
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n; i++) {
    const z = zone(i);
    const push = z === ZONE.top ? 0.009 : z === ZONE.bottom ? 0.006 : z === ZONE.shoes ? 0.004 : 0;
    if (push)
      pos.setXYZ(
        i,
        pos.getX(i) + nor.getX(i) * push,
        pos.getY(i) + nor.getY(i) * push,
        pos.getZ(i) + nor.getZ(i) * push,
      );
    const x = pos.getX(i);
    const y = pos.getY(i);
    const front = pos.getZ(i) > 0.02;
    if (z === ZONE.top && front && y > 1.3 && y < 1.56 && Math.abs(x) < (y - 1.28) * 0.55) col.setX(i, ZONE.shirt / 8);
    if (z === ZONE.bottom && y > 0.985) col.setX(i, ZONE.belt / 8);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  g.computeVertexNormals();
}

/** Simplify a skinned mesh for the crowd: remove vertices by edge collapse, then copy skin data back by position. */
async function lod(mesh: THREE.SkinnedMesh, keep: number): Promise<THREE.SkinnedMesh> {
  const src = mesh.geometry;
  const pos = src.getAttribute('position');
  const key = (x: number, y: number, z: number) => `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
  const byPos = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) byPos.set(key(pos.getX(i), pos.getY(i), pos.getZ(i)), i);
  const plain = new THREE.BufferGeometry();
  plain.setAttribute('position', pos.clone());
  if (src.index) plain.setIndex(src.index.clone());
  const target = Math.max(0, pos.count - keep);
  const simple = await new SimplifyModifier().modify(plain, target);
  const sp = simple.getAttribute('position');
  const si = new Uint16Array(sp.count * 4);
  const sw = new Float32Array(sp.count * 4);
  const col = new Float32Array(sp.count * 3);
  const srcSi = src.getAttribute('skinIndex');
  const srcSw = src.getAttribute('skinWeight');
  const srcCol = src.getAttribute('color');
  for (let i = 0; i < sp.count; i++) {
    const j = byPos.get(key(sp.getX(i), sp.getY(i), sp.getZ(i))) ?? 0;
    for (let k = 0; k < 4; k++) {
      si[i * 4 + k] = srcSi.getComponent(j, k);
      sw[i * 4 + k] = srcSw.getComponent(j, k);
    }
    col[i * 3] = srcCol.getX(j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', sp.clone());
  g.setIndex(simple.index ? simple.index.clone() : null);
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const out = new THREE.SkinnedMesh(g, mesh.material);
  out.name = `${mesh.name}_LOD`;
  out.bind(mesh.skeleton, mesh.bindMatrix);
  return out;
}

/** Re-bind a hair mesh (own copy of the skeleton) to a body's skeleton by bone name. */
function rebind(hair: THREE.SkinnedMesh, skeleton: THREE.Skeleton, bindMatrix: THREE.Matrix4) {
  const names = hair.skeleton.bones.map(b => b.name);
  const map = names.map(n => skeleton.bones.findIndex(b => b.name === n));
  const si = hair.geometry.getAttribute('skinIndex');
  for (let i = 0; i < si.count; i++)
    for (let k = 0; k < 4; k++) si.setComponent(i, k, Math.max(0, map[si.getComponent(i, k)]!));
  // Keep the hair where it was modelled: its bind-space vertices move to the body's bind space through world space.
  hair.updateMatrixWorld(true);
  const toWorld = hair.bindMatrix.clone();
  const toBody = bindMatrix.clone().invert();
  hair.geometry.applyMatrix4(toBody.multiply(toWorld));
  const out = new THREE.SkinnedMesh(hair.geometry, hair.material);
  out.name = hair.name;
  out.bind(skeleton, bindMatrix);
  return out;
}

const FINGER = /^(index|middle|pinky|ring|thumb)_/;

/** Keep rotations (fingers held at their first pose) and the pelvis position; drop scale and the rest. */
function slim(clip: THREE.AnimationClip, name: string): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of clip.tracks) {
    const [bone, prop] = t.name.split('.') as [string, string];
    if (bone === 'root') continue;
    if (prop === 'position' && bone !== 'pelvis') continue;
    if (prop === 'scale') continue;
    if (FINGER.test(bone)) {
      const v = Array.from(t.values.slice(0, 4));
      tracks.push(new THREE.QuaternionKeyframeTrack(t.name, [0, clip.duration], [...v, ...v]));
      continue;
    }
    tracks.push(t.clone());
  }
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

/**
 * Typing: the seated driving pose (arms forward) with the forearms lowered to desk height and the hands making
 * small alternating keystrokes; the head nods slightly towards the screen.
 */
function typing(sit: THREE.AnimationClip, drive: THREE.AnimationClip): THREE.AnimationClip {
  const fps = 30;
  const duration = 2.4;
  const times = Array.from({ length: Math.round(duration * fps) + 1 }, (_, i) => i / fps);
  const sample = (clip: THREE.AnimationClip, track: string, t: number) => {
    const tr = clip.tracks.find(x => x.name === track);
    if (!tr) return null;
    const interp = tr.createInterpolant() as unknown as { evaluate(t: number): Float32Array };
    return Array.from(interp.evaluate(t % clip.duration));
  };
  const tracks: THREE.KeyframeTrack[] = [];
  const armBones = [
    'clavicle_l',
    'upperarm_l',
    'lowerarm_l',
    'hand_l',
    'clavicle_r',
    'upperarm_r',
    'lowerarm_r',
    'hand_r',
  ];
  for (const t of sit.tracks) {
    const bone = t.name.split('.')[0]!;
    if (armBones.includes(bone) && t.name.endsWith('.quaternion')) continue;
    tracks.push(t.clone());
  }
  const q = new THREE.Quaternion();
  const e = new THREE.Quaternion();
  for (const bone of armBones) {
    const name = `${bone}.quaternion`;
    const values: number[] = [];
    for (const time of times) {
      const v = sample(drive, name, time) ?? [0, 0, 0, 1];
      q.set(v[0]!, v[1]!, v[2]!, v[3]!);
      const side = bone.endsWith('_l') ? 0 : Math.PI;
      const w = Math.sin(time * Math.PI * 2 * 2.5 + side) * 0.5 + 0.5;
      if (bone.startsWith('lowerarm')) e.setFromEuler(new THREE.Euler(0, 0, 0.18 + 0.03 * w));
      else if (bone.startsWith('hand')) e.setFromEuler(new THREE.Euler(0.05 * w, 0, -0.12 + 0.12 * w * w));
      else if (bone.startsWith('upperarm')) e.setFromEuler(new THREE.Euler(0, 0, 0.12));
      else e.identity();
      q.multiply(e);
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(name, times, values));
  }
  return new THREE.AnimationClip('Typing_Loop', duration, tracks);
}

const CLIPS: [string, string][] = [
  ['Idle_Loop', 'Idle_Loop'],
  ['Idle_Talking_Loop', 'Idle_Talking_Loop'],
  ['Idle_TalkingPhone_Loop', 'Idle_TalkingPhone_Loop'],
  ['Idle_FoldArms_Loop', 'Idle_FoldArms_Loop'],
  ['Walk_Loop', 'Walk_Loop'],
  ['Walk_Formal_Loop', 'Walk_Formal_Loop'],
  ['Walk_Carry_Loop', 'Walk_Carry_Loop'],
  ['Sitting_Idle_Loop', 'Sitting_Idle_Loop'],
  ['Sitting_Talking_Loop', 'Sitting_Talking_Loop'],
  ['Sitting_Enter', 'Sitting_Enter'],
  ['Sitting_Exit', 'Sitting_Exit'],
  ['Interact', 'Interact'],
];

/** Store colours, joints and weights as normalised bytes (65 bones fit in a byte). */
function compact(m: THREE.SkinnedMesh) {
  const g = m.geometry;
  const col = g.getAttribute('color');
  const c8 = new Uint8Array(col.count * 3);
  for (let i = 0; i < col.count; i++) c8[i * 3] = Math.round(col.getX(i) * 255);
  g.setAttribute('color', new THREE.BufferAttribute(c8, 3, true));
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const i8 = new Uint8Array(si.count * 4);
  const w8 = new Uint8Array(sw.count * 4);
  for (let i = 0; i < si.count; i++) {
    let sum = 0;
    const w = [0, 1, 2, 3].map(k => Math.round(sw.getComponent(i, k) * 255));
    for (const x of w) sum += x;
    // Keep the four weights summing to exactly 255 after rounding.
    let big = 0;
    for (let k = 1; k < 4; k++) if (w[k]! > w[big]!) big = k;
    w[big] = w[big]! + 255 - sum;
    for (let k = 0; k < 4; k++) {
      i8[i * 4 + k] = si.getComponent(i, k);
      w8[i * 4 + k] = w[k]!;
    }
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(i8, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(w8, 4, true));
}

async function main() {
  const ual1 = await loadGlb(join(SRC, 'UAL1_Standard.glb'));
  const ual2 = await loadGlb(join(SRC, 'UAL2_Standard.glb'));
  const all = [...ual1.animations, ...ual2.animations];
  const byName = (n: string) => {
    const c = all.find(a => a.name === n);
    if (!c) throw new Error(`clip ${n} missing`);
    return c;
  };
  const clips = CLIPS.map(([src, out]) => slim(byName(src), out));
  clips.push(slim(typing(byName('Sitting_Idle_Loop'), byName('Driving_Loop')), 'Typing_Loop'));
  let mannequinPelvis: THREE.Vector3 | null = null;
  ual1.scene.traverse(o => {
    if (o.name === 'pelvis') mannequinPelvis = o.position.clone();
  });

  const root = new THREE.Group();
  root.name = 'Characters';
  const bodies: { name: string; file: string; hairs: string[]; lodKeep: number }[] = [
    {
      name: 'Male',
      file: 'Superhero_Male_FullBody.gltf',
      hairs: ['Hair_SimpleParted', 'Hair_Buzzed', 'Hair_Beard'],
      lodKeep: 1500,
    },
    {
      name: 'Female',
      file: 'Superhero_Female_FullBody.gltf',
      hairs: ['Hair_Long', 'Hair_Buns', 'Hair_BuzzedFemale'],
      lodKeep: 1500,
    },
  ];
  for (const spec of bodies) {
    const gltf = await loadGltf(join(SRC, 'base', spec.file));
    const group = new THREE.Group();
    group.name = spec.name;
    const meshes = skinnedMeshes(gltf.scene);
    const body = meshes.reduce((a, b) =>
      a.geometry.getAttribute('position').count > b.geometry.getAttribute('position').count ? a : b,
    );
    const skeleton = body.skeleton;
    const armature = skeleton.bones[0]!;
    let top: THREE.Object3D = armature;
    while (top.parent && top.parent !== gltf.scene) top = top.parent;
    group.add(top);
    for (const m of meshes) {
      const isBody = m === body;
      const count = m.geometry.getAttribute('position').count;
      // The smaller face meshes: eyes (spheres) and brows.
      // Eyes are the two 556-vertex spheres in both bodies; the other small mesh is the brows.
      const isEyes = !isBody && count === 556;
      prepare(m, isBody ? null : isEyes ? ZONE.eyes : ZONE.hair);
      if (isBody) dress(m);
      m.name = `${spec.name}_${isBody ? 'Body' : isEyes ? 'Eyes' : 'Brows'}`;
      m.removeFromParent();
      group.add(m);
    }
    group.add(await lod(body, spec.lodKeep));
    for (const h of spec.hairs) {
      const hg = await loadGltf(join(SRC, 'hair', `${h}.gltf`));
      const hm = skinnedMeshes(hg.scene)[0]!;
      hm.name = `${spec.name}_${h.replace('Hair_', 'Hair_').replace('BuzzedFemale', 'Buzzed')}`;
      prepare(hm, ZONE.hair);
      const bound = rebind(hm, skeleton, body.bindMatrix);
      group.add(bound);
      group.add(await lod(bound, Math.min(420, Math.round(bound.geometry.getAttribute('position').count * 0.3))));
    }
    root.add(group);
  }
  // Clips are authored on the mannequin: shift the pelvis track to the male rest pose. The runtime shifts it again
  // for the female body (from the two rest poses in this file).
  let malePelvis: THREE.Vector3 | null = null;
  root.getObjectByName('Male')!.traverse(o => {
    if (o.name === 'pelvis' && !malePelvis) malePelvis = o.position.clone();
  });
  const delta = (malePelvis as unknown as THREE.Vector3).clone().sub(mannequinPelvis as unknown as THREE.Vector3);
  console.log('pelvis offset mannequin -> male', delta.toArray());
  for (const c of clips)
    for (const t of c.tracks)
      if (t.name === 'pelvis.position')
        for (let i = 0; i < t.values.length; i += 3) {
          t.values[i] = t.values[i]! + delta.x;
          t.values[i + 1] = t.values[i + 1]! + delta.y;
          t.values[i + 2] = t.values[i + 2]! + delta.z;
        }
  for (const m of skinnedMeshes(root)) compact(m);
  for (const m of skinnedMeshes(root)) console.log(m.name, m.geometry.getAttribute('position').count, 'verts');

  const exporter = new GLTFExporter();
  const glb = (await exporter.parseAsync(root, { binary: true, animations: clips, onlyVisible: false })) as ArrayBuffer;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.from(glb));
  console.log('wrote', OUT, (glb.byteLength / 1024).toFixed(0), 'KiB', clips.map(c => c.name).join(', '));
}

void main();
