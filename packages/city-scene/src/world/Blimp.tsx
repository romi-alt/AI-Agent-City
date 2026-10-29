'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import { useEnvRuntime } from '../environment/palette.ts';
import { blimpPose } from './blimp.ts';
import { Kit } from './kitbash.ts';

/**
 * An advertising blimp that circles the city. Its envelope carries the product name (drawn on a canvas), it has a
 * gondola, fins and a blinking red light, and its flight follows `blimpPose`. Three draws.
 */
export function Blimp() {
  const rt = useEnvRuntime();
  const built = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e4e8ee';
    g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#f5b83d';
    g.fillRect(0, 196, 1024, 22);
    g.fillStyle = '#1c2230';
    g.font = '800 92px "Space Grotesk", Inter, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('AUTOSALESCITY', 512, 110);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    const envMat = new MeshStandardMaterial({
      map: tex,
      roughness: 0.5,
      emissive: '#ffffff',
      emissiveMap: tex,
      emissiveIntensity: 0.05,
    });
    const env = new Mesh(new SphereGeometry(1, 32, 16), envMat);
    env.scale.set(17, 4.8, 4.8);
    const kit = new Kit()
      .box(0, -5.3, 0, 3.6, 1.0, 1.5, '#2b2f38')
      .box(-14.5, 0, 2.2, 3, 0.18, 3.4, '#f5b83d')
      .box(-14.5, 0, -2.2, 3, 0.18, 3.4, '#f5b83d')
      .box(-14.5, 2.2, 0, 3, 3.4, 0.18, '#f5b83d')
      .box(-14.5, -2.2, 0, 3, 3.4, 0.18, '#f5b83d');
    const parts = new Mesh(kit.build(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    const lightMat = new MeshBasicMaterial({ color: '#ff3b3b', toneMapped: false });
    const light = new Mesh(new SphereGeometry(0.4, 8, 6), lightMat);
    light.position.set(-16, 0.2, 0);
    const group = new Group();
    group.add(env, parts, light);
    group.traverse(o => {
      o.raycast = () => {};
    });
    group.frustumCulled = false;
    return { group, envMat, parts, light, lightMat, tex, env };
  }, []);
  useEffect(
    () => () => {
      built.env.geometry.dispose();
      built.parts.geometry.dispose();
      built.light.geometry.dispose();
      for (const m of [built.envMat, built.parts.material as MeshStandardMaterial, built.lightMat]) m.dispose();
      built.tex.dispose();
    },
    [built],
  );
  useFrame(() => {
    const t = rt.uniforms.uTime.value * rt.uniforms.uMotion.value;
    const p = blimpPose(t + 120);
    built.group.position.set(p.x, p.y, p.z);
    built.group.rotation.y = p.yaw;
    built.envMat.emissiveIntensity = 0.05 + 0.5 * rt.state.nightFactor;
    built.light.visible = Math.sin(t * 2.2) > -0.3;
  });
  return <primitive object={built.group} />;
}
