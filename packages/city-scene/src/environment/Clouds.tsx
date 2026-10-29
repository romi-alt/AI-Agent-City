'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  Color,
  DataTexture,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
} from 'three';
import {
  bakeCloudSprite,
  buildCloudField,
  CLOUD_RADIUS,
  cloudDemand,
  groundShadows,
  MAX_SHADOWS,
  SPRITE_SIZE,
  sizeBoost,
} from './cloud-field.ts';
import type { EnvRuntime } from './palette.ts';
import { invAcesFilmic } from './tonemap.ts';

/**
 * Cumulus as camera-facing puffs: each cloud is a handful of quads sharing one baked noise sprite, shaded in the
 * fragment shader as a lumpy height field lit from the sun (bright tops and sun-facing edges, grey-blue or sunset
 * undersides from the preset's cloud colours). Layers drift at different speeds for parallax, the shapes slowly
 * morph, and distance and the horizon haze melt them into the sky. One draw call; the same cloud field also drives the
 * ground shadows (cloud-field.ts), so what is drawn and what shades the city agree.
 */
export function Clouds({ layers, rt, compensate }: { layers: number; rt: EnvRuntime; compensate: boolean }) {
  const { mesh, material, field, sprite } = useMemo(() => {
    const field = buildCloudField(layers);
    const count = field.puffs.length;
    const cluster = new Float32Array(count * 4);
    const puff = new Float32Array(count * 4);
    const info = new Float32Array(count * 4);
    field.puffs.forEach((p, i) => {
      const c = field.clusters[p.cluster]!;
      cluster.set([c.x, c.y, c.z, c.speed], i * 4);
      puff.set([p.dx, p.dy, p.dz, p.size], i * 4);
      info.set([c.threshold, c.follow, p.rise, p.seed], i * 4);
    });
    const geo = new PlaneGeometry(1, 1);
    geo.setAttribute('aCluster', new InstancedBufferAttribute(cluster, 4));
    geo.setAttribute('aPuff', new InstancedBufferAttribute(puff, 4));
    geo.setAttribute('aInfo', new InstancedBufferAttribute(info, 4));
    const sprite = new DataTexture(bakeCloudSprite(), SPRITE_SIZE, SPRITE_SIZE, RGBAFormat);
    sprite.minFilter = LinearFilter;
    sprite.magFilter = LinearFilter;
    // Repeat: the fine-detail channel is sampled at several tiles per puff.
    sprite.wrapS = sprite.wrapT = RepeatWrapping;
    sprite.generateMipmaps = false;
    sprite.needsUpdate = true;
    const material = new ShaderMaterial({
      uniforms: {
        uSprite: { value: sprite },
        uT: rt.uniforms.uCloudT,
        uDemand: { value: 0.3 },
        uBoost: { value: 1 },
        uCover: { value: 0.3 },
        uLit: { value: new Color() },
        uShade: { value: new Color() },
        uSunTint: { value: new Color() },
        uSunDir: rt.uniforms.uSunDir,
        uFog: rt.uniforms.uFogColor,
      },
      vertexShader: /* glsl */ `
        attribute vec4 aCluster;
        attribute vec4 aPuff;
        attribute vec4 aInfo;
        uniform float uT, uDemand, uBoost;
        varying vec2 vUv;
        varying vec3 vCentre;
        varying vec2 vInfo;
        varying float vAlpha;
        varying float vMorph;
        void main() {
          // Present and not faded at the rim: the same rules as cloud-field.ts (clusterPresence, rimFade, driftedX).
          float k = clamp((uDemand * aInfo.y - aInfo.x) / 0.1, 0.0, 1.0);
          float presence = k * k * (3.0 - 2.0 * k);
          float chord = sqrt(max(${CLOUD_RADIUS * CLOUD_RADIUS}.0 - aCluster.z * aCluster.z, 10000.0));
          float x = mod(aCluster.x + uT * aCluster.w + chord, 2.0 * chord) - chord;
          float rim = 1.0 - smoothstep(0.72, 1.0, abs(x) / chord);
          vAlpha = presence * rim;
          if (vAlpha < 0.01) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }
          vec3 c = vec3(x, aCluster.y, aCluster.z) + aPuff.xyz;
          vec4 mv = viewMatrix * vec4(c, 1.0);
          mv.xy += position.xy * aPuff.w * uBoost * (0.7 + 0.3 * presence) * vec2(1.0, 0.8);
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vCentre = c;
          vInfo = vec2(aInfo.z, aInfo.w);
          // Each puff changes shape on its own slow cycle (about two minutes), frozen with the drift clock.
          vMorph = 0.5 + 0.5 * sin(uT * 0.05 * (0.6 + 0.8 * aInfo.w) + aInfo.w * 40.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSprite;
        uniform vec3 uLit, uShade, uSunTint, uSunDir, uFog;
        uniform float uCover;
        varying vec2 vUv;
        varying vec3 vCentre;
        varying vec2 vInfo;
        varying float vAlpha;
        varying float vMorph;
        float shape(vec2 uv) {
          vec2 s = texture2D(uSprite, uv).rg;
          return mix(s.r, s.g, vMorph);
        }
        void main() {
          bool flip = vInfo.y > 0.5;
          vec2 t = flip ? vec2(1.0 - vUv.x, vUv.y) : vUv;
          float e = 2.0 / ${SPRITE_SIZE}.0;
          float d0 = shape(t);
          // Fine noise erodes the soft edge into small lumps (cauliflower tops) without touching the dense core.
          float fine = texture2D(uSprite, vUv * 2.3 + vInfo.yy * 7.0).b;
          float d = d0 + (fine - 0.5) * 0.5 * (1.0 - d0 * 0.7);
          vec2 g = vec2(shape(t + vec2(e, 0.0)) - d0, shape(t + vec2(0.0, e)) - d0) / e * 0.06;
          if (flip) g.x = -g.x;
          float a = smoothstep(0.08, 0.34, d) * vAlpha * mix(0.9, 1.0, uCover);
          vec3 toCentre = vCentre - cameraPosition;
          float dist = length(toCentre);
          // Never a veil over the camera: puffs that come close fade out.
          a *= smoothstep(150.0, 420.0, dist);
          // Edge-on to the horizon, a cloud's base thins out instead of showing a hard line.
          float sinE = toCentre.y / dist;
          a *= smoothstep(0.0, 0.03, sinE);
          if (a < 0.01) discard;
          // Lumpy height field lit from the sun: the sun's side of every lump is bright, the far side dim.
          vec3 sv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
          vec3 n = normalize(vec3(-g, 1.0));
          float lam = 0.5 + 0.5 * dot(n, normalize(vec3(sv.xy, 0.35 - sv.z * 0.5)));
          float shade = 0.1 + 0.5 * lam + 0.6 * vInfo.x + 0.2 * (vUv.y - 0.5) + 0.3 * (fine - 0.5);
          vec3 col = mix(uShade, uLit, smoothstep(0.2, 0.9, shade));
          // Thin edges toward the sun glow with the sun's colour (a silver or golden lining).
          float toward = max(dot(toCentre / dist, uSunDir), 0.0);
          col += uSunTint * pow(toward, 6.0) * (1.0 - smoothstep(0.1, 0.6, d)) * 0.7 * (1.0 - uCover * 0.6);
          // Distance and the low horizon melt clouds into the haze (which is the fog colour).
          float haze = max(smoothstep(600.0, 1500.0, dist) * 0.3, (1.0 - smoothstep(0.0, 0.15, sinE)) * 0.4);
          col = mix(col, uFog, haze);
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
      // Like the sky: not tone-mapped here, so clouds and the haze they melt into stay one colour (the final pass maps
      // both when there is a composer).
      toneMapped: false,
    });
    const mesh = new InstancedMesh(geo, material, count);
    const id = new Matrix4();
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, id);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    return { mesh, material, field, sprite };
  }, [layers, rt]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      material.dispose();
      sprite.dispose();
    },
    [mesh, material, sprite],
  );

  const shadowData = useMemo(() => new Float32Array(MAX_SHADOWS * 4), []);
  useFrame(() => {
    const s = rt.state;
    const u = material.uniforms;
    u.uCover!.value = s.cloudCover;
    u.uDemand!.value = cloudDemand(s.cloudCover);
    u.uBoost!.value = sizeBoost(s.cloudCover);
    // With a composer the cloud colours are pre-compensated for its tone mapping, like the sky's (tonemap.ts).
    (u.uLit!.value as Color).setRGB(...(compensate ? invAcesFilmic(s.cloudLit) : s.cloudLit));
    (u.uShade!.value as Color).setRGB(...(compensate ? invAcesFilmic(s.cloudShade) : s.cloudShade));
    // The sun's colour at full brightness: the lining of a cloud is tinted, not made brighter, by a strong sun.
    const peak = Math.max(...s.sunColor, 1e-3);
    (u.uSunTint!.value as Color).setRGB(s.sunColor[0] / peak, s.sunColor[1] / peak, s.sunColor[2] / peak);
    const d = rt.uniforms.uSunDir.value;
    groundShadows(field, s.cloudCover, rt.uniforms.uCloudT.value, [d.x, d.y, d.z], shadowData);
    rt.uniforms.uCloudShadow.value.forEach((v, i) => v.fromArray(shadowData, i * 4));
  });

  return <primitive object={mesh} />;
}
