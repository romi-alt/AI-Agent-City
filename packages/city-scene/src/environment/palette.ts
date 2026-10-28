import { Color, Vector3 } from 'three';
import { useCityContext } from '../context.tsx';
import type { CityStore } from '../store.ts';
import { type EnvState, presetFor } from './presets.ts';

/**
 * The city's architectural palette (PLAN.md "Visual direction") and the live lighting every system reads.
 * Owner: A1. Others read `useEnvironmentLight()` inside `useFrame`; its fields change every frame, the object does not.
 */
export const PALETTE = {
  navy: '#0f1b2d',
  gold: '#f5b335',
  teal: '#1f8a8a',
  sky: '#6fb7e8',
  coral: '#ff7a5c',
  green: '#5b9a5b',
  ivory: '#f6f3ec',
  stone: '#e7e1d6',
} as const;

export interface EnvironmentLight {
  /** Unit vector toward the key light (the sun by day, the moon at night). */
  sunDirection: Vector3;
  /** Key light colour, premultiplied by its intensity (linear). */
  sunColor: Color;
  /** Ambient sky light, premultiplied by its intensity (linear). */
  ambient: Color;
  /** 0 by day, 1 at night (also raised on dark rainy afternoons): switch lights on with it. */
  nightFactor: number;
  /** How wet the ground is, 0..1. */
  wetness: number;
}

/** Shader uniforms shared by every A1 material, updated once per frame by <Environment>. */
export interface SharedUniforms {
  /** Animation clock in seconds; stops while paused. */
  uTime: { value: number };
  uNight: { value: number };
  uWet: { value: number };
  /** 1 when non-essential motion may run (wind, flags, water); 0 with reduced motion. */
  uMotion: { value: number };
  uSunDir: { value: Vector3 };
  uFogColor: { value: Color };
  /** Cloud cover 0..1: drives the soft moving cloud shadows on the ground and buildings. */
  uCloud: { value: number };
}

export interface EnvRuntime {
  light: EnvironmentLight;
  uniforms: SharedUniforms;
  /** The blended state this frame. */
  state: EnvState;
}

// One runtime per city instance (keyed by its store), never a module-wide singleton.
const runtimes = new WeakMap<CityStore, EnvRuntime>();

export function envRuntime(store: CityStore): EnvRuntime {
  let rt = runtimes.get(store);
  if (!rt) {
    const s = store.get();
    rt = {
      light: {
        sunDirection: new Vector3(0.5, 0.7, 0.5).normalize(),
        sunColor: new Color(1, 1, 1),
        ambient: new Color(0.5, 0.5, 0.5),
        nightFactor: 0,
        wetness: 0,
      },
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: 0 },
        uWet: { value: 0 },
        uMotion: { value: 1 },
        uSunDir: { value: new Vector3(0.5, 0.7, 0.5).normalize() },
        uFogColor: { value: new Color() },
        uCloud: { value: 0 },
      },
      state: presetFor(s.timeOfDay, s.weather),
    };
    runtimes.set(store, rt);
  }
  return rt;
}

/** Live lighting of the city: `{ sunDirection, sunColor, ambient, nightFactor, wetness }`. Read it in useFrame. */
export function useEnvironmentLight(): EnvironmentLight {
  return envRuntime(useCityContext().store).light;
}

/** The shared uniforms A1's materials bind to. */
export function useSharedUniforms(): SharedUniforms {
  return envRuntime(useCityContext().store).uniforms;
}

/** The whole blended environment state (sky colours, fog, rain…), for systems that need more than the light. */
export function useEnvRuntime(): EnvRuntime {
  return envRuntime(useCityContext().store);
}
