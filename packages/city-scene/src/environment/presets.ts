import type { TimeOfDay, Weather } from '../types.ts';

/**
 * Time-of-day and weather presets as plain numbers, so they can be blended, tested and shared without a renderer.
 * Colours are linear RGB triples (converted once from the sRGB hex values below). Owner: A1.
 */

export type Rgb = [number, number, number];

export interface EnvState {
  /** Sun (or, at night, moon) elevation and azimuth in degrees. Azimuth 0 = +z, 90 = +x. */
  sunElevation: number;
  sunAzimuth: number;
  /** Colour and intensity of the key (directional) light. */
  sunColor: Rgb;
  sunIntensity: number;
  /** Visible sun disk (0 at night or under cloud). */
  sunDisk: number;
  moon: number;
  hemiSky: Rgb;
  hemiGround: Rgb;
  hemiIntensity: number;
  /** Sky gradient and the glow around the sun. */
  zenith: Rgb;
  horizon: Rgb;
  sunGlow: Rgb;
  fogColor: Rgb;
  fogDensity: number;
  /** 0 by day, 1 at night: drives window lights, street lamps, headlights. */
  nightFactor: number;
  stars: number;
  /** Cloud coverage 0..1 and the lit/shadow colours of the clouds. */
  cloudCover: number;
  cloudLit: Rgb;
  cloudShade: Rgb;
  /** Rain amount 0..1 and how wet the ground is 0..1. */
  rain: number;
  wetness: number;
  /** Strength of image-based lighting from the sky. */
  envIntensity: number;
  /** Extra bloom on ultra (lit windows and lamps at night). */
  bloom: number;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** sRGB hex ("#rrggbb") to a linear RGB triple. */
export function hex(h: string): Rgb {
  const n = parseInt(h.slice(1), 16);
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)];
}

const TIME: Record<TimeOfDay, EnvState> = {
  day: {
    sunElevation: 52,
    sunAzimuth: 128,
    sunColor: hex('#fff2df'),
    sunIntensity: 2.9,
    sunDisk: 1,
    moon: 0,
    hemiSky: hex('#d3e6f7'),
    hemiGround: hex('#9a8f80'),
    hemiIntensity: 0.55,
    zenith: hex('#3b7cc8'),
    horizon: hex('#c4dbec'),
    sunGlow: hex('#fff1d0'),
    fogColor: hex('#bfd3e2'),
    fogDensity: 0.0026,
    nightFactor: 0,
    stars: 0,
    cloudCover: 0.2,
    cloudLit: hex('#ffffff'),
    cloudShade: hex('#aebccb'),
    rain: 0,
    wetness: 0,
    envIntensity: 0.4,
    bloom: 0.15,
  },
  golden: {
    sunElevation: 10,
    sunAzimuth: 64,
    sunColor: hex('#ffbf7a'),
    sunIntensity: 2.2,
    sunDisk: 1,
    moon: 0,
    hemiSky: hex('#b8c2d8'),
    hemiGround: hex('#8c6c52'),
    hemiIntensity: 0.75,
    zenith: hex('#3f64a0'),
    horizon: hex('#f3c39a'),
    sunGlow: hex('#ffad66'),
    fogColor: hex('#e0c7b0'),
    fogDensity: 0.0017,
    nightFactor: 0.18,
    stars: 0,
    cloudCover: 0.2,
    cloudLit: hex('#ffd2a6'),
    cloudShade: hex('#9a8aa0'),
    rain: 0,
    wetness: 0,
    envIntensity: 0.55,
    bloom: 0.25,
  },
  evening: {
    sunElevation: -4,
    sunAzimuth: 70,
    sunColor: hex('#9c9ad6'),
    sunIntensity: 0.7,
    sunDisk: 0,
    moon: 0.3,
    hemiSky: hex('#56659a'),
    hemiGround: hex('#3b3240'),
    hemiIntensity: 0.85,
    zenith: hex('#1a2a55'),
    horizon: hex('#d48a76'),
    sunGlow: hex('#ff8f5e'),
    fogColor: hex('#5d5b7c'),
    fogDensity: 0.0032,
    nightFactor: 0.75,
    stars: 0.25,
    cloudCover: 0.2,
    cloudLit: hex('#f2a08a'),
    cloudShade: hex('#3e3d5e'),
    rain: 0,
    wetness: 0,
    envIntensity: 0.5,
    bloom: 0.55,
  },
  night: {
    sunElevation: 40,
    sunAzimuth: 215,
    sunColor: hex('#9fb5e6'),
    sunIntensity: 0.6,
    sunDisk: 0,
    moon: 1,
    hemiSky: hex('#2a3a64'),
    hemiGround: hex('#2a2630'),
    hemiIntensity: 1.0,
    zenith: hex('#050b1a'),
    horizon: hex('#1b2846'),
    sunGlow: hex('#33467a'),
    fogColor: hex('#141d33'),
    fogDensity: 0.0036,
    nightFactor: 1,
    stars: 1,
    cloudCover: 0.2,
    cloudLit: hex('#4b5a80'),
    cloudShade: hex('#161c30'),
    rain: 0,
    wetness: 0,
    envIntensity: 0.6,
    bloom: 0.8,
  },
};

const lum = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** Pulls a colour toward its own grey (k = 0 keeps it, 1 makes it grey) and scales it. */
function grey(c: Rgb, k: number, scale = 1): Rgb {
  const l = lum(c);
  return [(c[0] + (l - c[0]) * k) * scale, (c[1] + (l - c[1]) * k) * scale, (c[2] + (l - c[2]) * k) * scale];
}

/** The target state for a time of day under a weather. */
export function presetFor(time: TimeOfDay, weather: Weather): EnvState {
  const s: EnvState = { ...TIME[time] };
  if (weather === 'clear') {
    s.cloudCover = 0.05;
  } else if (weather === 'partly-cloudy') {
    s.cloudCover = 0.42;
    s.sunIntensity *= 0.92;
  } else {
    const rain = weather === 'light-rain';
    const k = rain ? 0.85 : 0.72;
    s.cloudCover = rain ? 0.97 : 0.9;
    s.sunIntensity *= rain ? 0.12 : 0.2;
    s.sunDisk = 0;
    s.moon *= 0.1;
    s.stars = 0;
    s.hemiIntensity *= time === 'night' ? 1.1 : 1.35;
    s.hemiSky = grey(s.hemiSky, k);
    s.zenith = grey(s.zenith, k, rain ? 0.8 : 0.95);
    s.horizon = grey(s.horizon, k, rain ? 0.85 : 0.95);
    s.sunGlow = grey(s.sunGlow, 0.9, 0.4);
    s.fogColor = grey(s.fogColor, k, rain ? 0.82 : 0.95);
    s.fogDensity *= rain ? 2.4 : 1.8;
    s.cloudLit = grey(s.cloudLit, 0.8, time === 'night' ? 1.4 : 0.9);
    s.cloudShade = grey(s.cloudShade, 0.8, 0.8);
    if (time === 'night' || time === 'evening') {
      // Low cloud over a city at night glows with its light pollution rather than going black.
      const k2 = time === 'night' ? 1 : 0.5;
      const glow = (a: Rgb, b: Rgb): Rgb => [
        a[0] + (b[0] - a[0]) * k2,
        a[1] + (b[1] - a[1]) * k2,
        a[2] + (b[2] - a[2]) * k2,
      ];
      s.zenith = glow(s.zenith, hex('#1d1c24'));
      s.horizon = glow(s.horizon, hex('#3b3640'));
      s.fogColor = glow(s.fogColor, hex('#2f2c34'));
      s.cloudShade = glow(s.cloudShade, hex('#23212a'));
      s.cloudLit = glow(s.cloudLit, hex('#4a4450'));
    }
    // Offices switch their lights on on a dark afternoon.
    s.nightFactor = Math.max(s.nightFactor, rain ? 0.35 : 0.25);
    s.rain = rain ? 1 : 0;
    s.wetness = rain ? 1 : 0;
    s.bloom *= 0.8;
  }
  return s;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Blends two states (t = 0 gives a, 1 gives b). The azimuth takes the short way round. */
export function lerpState(a: EnvState, b: EnvState, t: number): EnvState {
  const out = {} as Record<string, number | Rgb>;
  for (const k of Object.keys(a) as (keyof EnvState)[]) {
    const va = a[k];
    const vb = b[k];
    if (Array.isArray(va)) {
      const cb = vb as Rgb;
      out[k] = [lerp(va[0], cb[0], t), lerp(va[1], cb[1], t), lerp(va[2], cb[2], t)];
    } else if (k === 'sunAzimuth') {
      const d = (((((vb as number) - va) % 360) + 540) % 360) - 180;
      out[k] = va + d * t;
    } else {
      out[k] = lerp(va, vb as number, t);
    }
  }
  return out as unknown as EnvState;
}

/** A timed blend from one state to another. */
export interface Transition {
  from: EnvState;
  to: EnvState;
  elapsed: number;
  duration: number;
}

export const TRANSITION_SECONDS = 3;

export function startTransition(current: EnvState, to: EnvState, reducedMotion: boolean): Transition {
  return { from: current, to, elapsed: 0, duration: reducedMotion ? 0 : TRANSITION_SECONDS };
}

/** Advances a transition by dt seconds and returns the blended state (eased; instant when duration is 0). */
export function stepTransition(tr: Transition, dt: number): EnvState {
  tr.elapsed = Math.min(tr.duration, tr.elapsed + dt);
  const x = tr.duration <= 0 ? 1 : tr.elapsed / tr.duration;
  const eased = x * x * (3 - 2 * x);
  return eased >= 1 ? tr.to : lerpState(tr.from, tr.to, eased);
}

export function transitionDone(tr: Transition): boolean {
  return tr.elapsed >= tr.duration;
}

/** Unit vector pointing from the scene toward the sun (or moon). */
export function sunVector(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}
