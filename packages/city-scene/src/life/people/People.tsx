'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { LifeEnv } from '../env-adapter.ts';
import { SIDEWALK_Y } from '../geometry.ts';
import { instanceAttr, PartBuilder, Placer } from '../mesh-utils.ts';
import { createRng } from '../rng.ts';
import type { StreetSim } from '../street-sim.ts';
import { useCharacterAsset } from '../characters/asset.ts';
import { bakeCrowd, CrowdMesh, STREET_CLIPS } from '../characters/crowd.ts';
import { characterLook, CITY_SCALE, type CharacterClip } from '../characters/zones.ts';
import { BODY, personGeometry, personLook, personMaterials } from './body.ts';
import { PERSON_SCALE } from './proportions.ts';
import { MODE } from './sim.ts';

/** Seat height of the benches above the sidewalk: a chair-height seat (0.45 m) at the city's character scale. */
const SEAT = 0.45 * CITY_SCALE;
/** Benches are sized for the people on them (1.6 m long). */
const BS = 0.73;

function benchGeometry(benches: { x: number; z: number; yaw: number }[]) {
  const b = new PartBuilder();
  for (const bench of benches) {
    const c = Math.cos(bench.yaw);
    const s = -Math.sin(bench.yaw);
    // Local frame: +x forward (where the sitter faces), z along the bench.
    const at = (fx: number, y: number, fz: number): [number, number, number] => [
      bench.x + c * fx - s * fz,
      SIDEWALK_Y + y,
      bench.z + s * fx + c * fz,
    ];
    const rot: [number, number, number] = [0, bench.yaw, 0];
    b.add(new THREE.BoxGeometry(0.36 * BS, 0.04, 1.5 * BS), { at: at(0, SEAT - 0.025, 0), rot, color: '#7a5a3c' });
    b.add(new THREE.BoxGeometry(0.04, 0.3 * BS, 1.5 * BS), {
      at: at(-0.17 * BS, SEAT + 0.17 * BS, 0),
      rot: [0, bench.yaw, 0.12],
      color: '#7a5a3c',
    });
    for (const fz of [-0.62 * BS, 0.62 * BS])
      b.add(new THREE.BoxGeometry(0.32 * BS, SEAT, 0.04), { at: at(0, SEAT / 2, fz), rot, color: '#2e3135' });
  }
  return b.build();
}

interface Props {
  sim: StreetSim;
  env: LifeEnv;
  shadows: boolean;
  /** Limb animation runs only when true (paused or reduced motion: people hold a calm standing pose). */
  animate: boolean;
}

/** Everyone on foot: one instanced draw for all bodies (posed in the vertex shader) and one for the benches. */
export function People({ sim, env, shadows, animate }: Props) {
  const asset = useCharacterAsset();
  const poses = sim.people.poses;
  const crowd = useMemo(() => {
    if (!asset) return null;
    try {
      return skeletalCrowd(asset, poses, shadows);
    } catch (err) {
      // Keep the city running with the simple figures rather than losing the scene.
      console.warn('Skeletal crowd unavailable; using simple figures.', err);
      return null;
    }
  }, [asset, poses, shadows]);
  useEffect(() => () => crowd?.dispose(), [crowd]);
  const built = useMemo(() => {
    const uTime = { value: 0 };
    const uNight = { value: 0 };
    const mats = personMaterials(uTime, uNight);
    const mesh = new THREE.InstancedMesh(personGeometry(), mats.color, poses.length);
    mesh.name = 'life-people';
    mesh.customDepthMaterial = mats.depth;
    mesh.castShadow = shadows;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const top = instanceAttr(mesh, 'iTop', 4);
    const bottom = instanceAttr(mesh, 'iBottom', 4);
    const skin = instanceAttr(mesh, 'iSkin', 4);
    const hair = instanceAttr(mesh, 'iHair', 4);
    const anim = instanceAttr(mesh, 'iAnim', 4);
    const rng = createRng(1234);
    const c = new THREE.Color();
    const set = (a: THREE.InstancedBufferAttribute, i: number, hex: string, w: number) => {
      c.set(hex);
      a.setXYZW(i, c.r, c.g, c.b, w);
    };
    poses.forEach((p, i) => {
      const look = personLook(rng);
      // Rooftop workers wear high-visibility orange and a hard hat.
      const worker = p.y > 2;
      set(top, i, worker ? '#ff7a1a' : look.top, worker ? 0 : look.coat);
      set(bottom, i, look.bottom, worker ? 0 : look.bag);
      set(skin, i, look.skin, worker ? 0 : look.longHair);
      set(hair, i, worker ? '#f5c518' : look.hair, 0);
      anim.setXYZW(i, p.phase, 0, p.mode, rng() * 10);
    });
    const benches = sim.people.benches.length
      ? new THREE.Mesh(
          benchGeometry(sim.people.benches),
          new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
        )
      : null;
    if (benches) {
      benches.name = 'life-benches';
      benches.castShadow = shadows;
      benches.receiveShadow = shadows;
    }
    return { mesh, mats, uTime, uNight, anim, benches };
  }, [poses, sim.people.benches, shadows]);

  useEffect(
    () => () => {
      built.mesh.geometry.dispose();
      built.mats.color.dispose();
      built.mats.depth.dispose();
      if (built.benches) {
        built.benches.geometry.dispose();
        (built.benches.material as THREE.Material).dispose();
      }
    },
    [built],
  );

  const placer = useMemo(() => new Placer(), []);
  const view = useMemo(() => new CrowdView(), []);
  const clock = useMemo(() => ({ t: 0 }), []);
  useFrame((state, dt) => {
    if (animate) clock.t += Math.min(dt, 0.25);
    built.mesh.visible = !crowd;
    if (crowd) {
      view.update(state.camera as unknown as THREE.Camera);
      crowd.update(poses, clock.t, animate, env.nightFactor, placer, view);
      return;
    }
    built.uNight.value = env.nightFactor;
    if (animate) built.uTime.value = state.clock.elapsedTime;
    const { mesh, anim } = built;
    poses.forEach((p, i) => {
      const seated = p.mode === MODE.seated;
      const k = p.scale * PERSON_SCALE;
      const y = seated ? SIDEWALK_Y + SEAT + (0.065 - BODY.hip) * k : p.y;
      const back = seated ? -0.09 : 0;
      mesh.setMatrixAt(i, placer.set(p.x + Math.cos(p.yaw) * back, y, p.z - Math.sin(p.yaw) * back, p.yaw, k));
      anim.setX(i, p.phase);
      anim.setY(i, animate ? p.gait : 0);
      anim.setZ(i, p.mode);
    });
    mesh.instanceMatrix.needsUpdate = true;
    anim.needsUpdate = true;
  });

  return (
    <group name="life-people">
      <primitive object={built.mesh} />
      {crowd?.meshes.map(m => (
        <primitive key={m.uuid} object={m} />
      ))}
      {built.benches && <primitive object={built.benches} />}
    </group>
  );
}

/** People farther than this from the camera are a few pixels tall and lost in the haze, so they are not drawn. */
const PEOPLE_FAR = 150;

/** What the camera sees this frame (with a margin so shadows of people just out of view still fall into it). */
class CrowdView {
  private frustum = new THREE.Frustum();
  private m = new THREE.Matrix4();
  private sphere = new THREE.Sphere(new THREE.Vector3(), 1.5);
  private cam = new THREE.Vector3();

  update(camera: THREE.Camera) {
    this.frustum.setFromProjectionMatrix(this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    this.cam.setFromMatrixPosition(camera.matrixWorld);
  }

  sees(x: number, y: number, z: number) {
    if (Math.hypot(x - this.cam.x, y - this.cam.y, z - this.cam.z) > PEOPLE_FAR) return false;
    this.sphere.center.set(x, y + 0.3, z);
    return this.frustum.intersectsSphere(this.sphere);
  }
}

interface Persona {
  mesh: CrowdMesh;
  index: number;
  walk: CharacterClip;
  idle: CharacterClip;
  talk: CharacterClip;
  sit: CharacterClip;
  offset: number;
}

/**
 * Skeletal people (Quaternius characters, baked and instanced): each person gets a body, hairstyle and outfit, a
 * walking style and idle habits. Walk clips are timed from the distance walked; idles from the life clock with a
 * personal offset; walk and idle cross-fade with the walker's pace.
 */
function skeletalCrowd(
  asset: NonNullable<ReturnType<typeof useCharacterAsset>>,
  poses: StreetSim['people']['poses'],
  shadows: boolean,
) {
  const rng = createRng(4711);
  const looks = poses.map(p => {
    const l = characterLook(rng);
    // Rooftop workers wear high-visibility orange.
    if (p.y > 2) l.look = { ...l.look, top: '#ff7a1a', bottom: '#2b3240' };
    return l;
  });
  const bakes = { male: bakeCrowd(asset, 'male', STREET_CLIPS), female: bakeCrowd(asset, 'female', STREET_CLIPS) };
  const meshes = {
    male: new CrowdMesh(bakes.male, looks.filter(l => l.body === 'male').length),
    female: new CrowdMesh(bakes.female, looks.filter(l => l.body === 'female').length),
  };
  const counters = { male: 0, female: 0 };
  const personas: Persona[] = looks.map(l => {
    const mesh = meshes[l.body];
    const index = counters[l.body]++;
    mesh.setLook(index, l.look, l.hair);
    const r = rng();
    return {
      mesh,
      index,
      walk: r < 0.45 ? 'walkFormal' : 'walk',
      idle: r < 0.2 ? 'phone' : r < 0.32 ? 'foldArms' : 'idle',
      talk: rng() < 0.75 ? 'talk' : 'idle',
      sit: rng() < 0.4 ? 'sitTalk' : 'sit',
      offset: rng() * 20,
    };
  });
  for (const m of Object.values(meshes)) {
    m.mesh.castShadow = shadows;
    m.mesh.name = `life-people-${m.bake.body}`;
  }
  const strideOf = (p: Persona) => (p.mesh.bake.stride[p.walk] ?? 1.4) * CITY_SCALE;
  return {
    meshes: [meshes.male.mesh, meshes.female.mesh],
    update(
      list: StreetSim['people']['poses'],
      t: number,
      animate: boolean,
      night: number,
      placer: Placer,
      view: CrowdView,
    ) {
      const used = new Map<CrowdMesh, number>([
        [meshes.male, 0],
        [meshes.female, 0],
      ]);
      list.forEach((p, i) => {
        const who = personas[i]!;
        const k = p.scale * CITY_SCALE;
        if (p.scale === 0 || !view.sees(p.x, p.y, p.z)) return;
        // Visible people are packed into the first slots, so the rest are not drawn at all.
        const slot = used.get(who.mesh)!;
        used.set(who.mesh, slot + 1);
        who.mesh.assign(slot, who.index);
        const seated = p.mode === MODE.seated;
        // Characters face +z; city yaw is measured for a model facing +x.
        const back = seated ? -0.08 : 0;
        who.mesh.mesh.setMatrixAt(
          slot,
          placer.set(
            p.x + Math.cos(p.yaw) * back,
            seated ? SIDEWALK_Y : p.y,
            p.z - Math.sin(p.yaw) * back,
            p.yaw + Math.PI / 2,
            k,
          ),
        );
        const own = t + who.offset;
        if (seated) who.mesh.setAnim(slot, { clip: who.sit, time: own });
        else if (p.mode === MODE.talk) who.mesh.setAnim(slot, { clip: who.talk, time: own });
        else {
          const walkClip = who.mesh.bake.clips[who.walk];
          const walkTime = (p.dist / (strideOf(who) * p.scale)) * walkClip.duration;
          const gait = animate ? Math.max(0, Math.min(1, p.gait)) : 0;
          who.mesh.setAnim(slot, {
            clip: who.walk,
            time: walkTime,
            next: who.idle,
            nextTime: own,
            blend: 1 - gait,
          });
        }
      });
      for (const m of [meshes.male, meshes.female]) {
        m.draw(used.get(m)!);
        m.uniforms.uNight.value = night;
        m.commit();
      }
    },
    dispose() {
      meshes.male.dispose();
      meshes.female.dispose();
      for (const b of Object.values(bakes)) {
        b.texture.dispose();
        b.geometry.dispose();
      }
    },
  };
}
