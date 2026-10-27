'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { type Material, MeshStandardMaterial } from 'three';
import { useEnvRuntime } from '../environment/palette.ts';

/** Shared PBR materials for architectural details (cornices, tanks, gold, awnings…), keyed for `buildParts`. */
export function usePartMaterials(): Record<string, Material> {
  const rt = useEnvRuntime();
  const table = useMemo(() => {
    const std = (p: ConstructorParameters<typeof MeshStandardMaterial>[0]) => new MeshStandardMaterial(p);
    return {
      stone: std({ color: '#ece4d4', roughness: 0.8 }),
      steel: std({ color: '#5a6066', roughness: 0.55, metalness: 0.6 }),
      darkMetal: std({ color: '#25292e', roughness: 0.45, metalness: 0.6 }),
      gold: std({ color: '#d9a531', roughness: 0.3, metalness: 1 }),
      copper: std({ color: '#5f8f7e', roughness: 0.6, metalness: 0.4 }),
      tank: std({ color: '#7a5a3e', roughness: 0.9 }),
      tankRoof: std({ color: '#3f3a36', roughness: 0.8 }),
      garden: std({ color: '#5f9a4c', roughness: 0.95 }),
      hvac: std({ color: '#b9bec2', roughness: 0.7, metalness: 0.2 }),
      awning: std({ color: '#ffffff', roughness: 0.8 }),
      accent: std({ color: '#ffffff', roughness: 0.4, metalness: 0.3 }),
      glow: std({ color: '#fff4dc', emissive: '#ffd9a0', emissiveIntensity: 0.3, roughness: 0.5 }),
      beacon: std({ color: '#ffb0a0', emissive: '#ff3a24', emissiveIntensity: 0.5, roughness: 0.4 }),
      hqBeacon: std({ color: '#ffe2a0', emissive: '#f5b335', emissiveIntensity: 0.5, roughness: 0.4 }),
    } satisfies Record<string, MeshStandardMaterial>;
  }, []);
  useEffect(
    () => () => {
      for (const m of Object.values(table)) m.dispose();
    },
    [table],
  );
  useFrame(() => {
    const n = rt.state.nightFactor;
    const t = rt.uniforms.uTime.value;
    table.glow.emissiveIntensity = 0.3 + 2.2 * n;
    // Aircraft-warning lights burn steadily; only the Training Center's beacon breathes (one slow, unique rhythm).
    table.beacon.emissiveIntensity = 0.3 + 2.4 * n;
    table.hqBeacon.emissiveIntensity =
      (0.5 + 2.5 * n) * (rt.uniforms.uMotion.value ? 0.7 + 0.3 * Math.sin(t * 1.3) : 1);
  });
  return table;
}
