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
  /** Linear fog: fully clear before `fogNear`, fully fogged at `fogFar` (world units). The generated city ends
   * beyond `fogFar`, so its edge is never visible. */
  fogNear: number;
  fogFar: number;
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
  /** Tone-mapping exposure. */
  exposure: number;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** sRGB hex ("#rrggbb") to a linear RGB triple. */
export function hex(h: string): Rgb {
  const n = parseInt(h.slice(1), 16);
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)];
}

const TIME: Record<TimeOfDay, EnvState> = {
  // Architectural-visualisation daylight: crisp warm-white sun, cool sky fill, clear blue gradient, light haze.
  // The legacy daylight (X04 brief): sky #5AA9E6 to #D6ECFA, warm hemisphere #FFFFFF/#B5A48A ~1.6, sun #FFF4E0 ~2.2.
  day: {
    sunElevation: 50,
    sunAzimuth: 132,
    sunColor: hex('#fff4e0'),
    sunIntensity: 2.2,
    sunDisk: 1,
    moon: 0,
    hemiSky: hex('#ffffff'),
    hemiGround: hex('#b5a48a'),
    hemiIntensity: 1.6,
    zenith: hex('#5aa9e6'),
    horizon: hex('#d6ecfa'),
    sunGlow: hex('#fff3d8'),
    fogColor: hex('#d6ecfa'),
    fogNear: 110,
    fogFar: 330,
    nightFactor: 0,
    stars: 0,
    cloudCover: 0.2,
    cloudLit: hex('#ffffff'),
    cloudShade: hex('#d4e2ef'),
    rain: 0,
    wetness: 0,
    envIntensity: 0.3,
    bloom: 0.1,
    exposure: 1.0,
  },
  golden: {
    sunElevation: 14,
    sunAzimuth: 92,
    sunColor: hex('#ffad62'),
    sunIntensity: 4.2,
    sunDisk: 1,
    moon: 0,
    hemiSky: hex('#9fb5da'),
    hemiGround: hex('#b38c68'),
    hemiIntensity: 0.24,
    zenith: hex('#3d74c4'),
    horizon: hex('#f8d0a4'),
    sunGlow: hex('#ffb257'),
    fogColor: hex('#f0d0ae'),
    fogNear: 110,
    fogFar: 320,
    nightFactor: 0.08,
    stars: 0,
    cloudCover: 0.2,
    cloudLit: hex('#ffe4c4'),
    cloudShade: hex('#d2b8ac'),
    rain: 0,
    wetness: 0,
    envIntensity: 0.48,
    bloom: 0.2,
    exposure: 1.0,
  },
  // Blue hour: deep blue sky, a last warm band on the horizon, some offices lit.
  evening: {
    sunElevation: -4,
    sunAzimuth: 62,
    sunColor: hex('#a9a6e0'),
    sunIntensity: 0.9,
    sunDisk: 0,
    moon: 0.3,
    hemiSky: hex('#5f78b8'),
    hemiGround: hex('#4a4050'),
    hemiIntensity: 1.0,
    zenith: hex('#1b3170'),
    horizon: hex('#e7a07c'),
    sunGlow: hex('#ff9a66'),
    fogColor: hex('#6c6f98'),
    fogNear: 90,
    fogFar: 300,
    nightFactor: 0.6,
    stars: 0.2,
    cloudCover: 0.2,
    cloudLit: hex('#f4ab90'),
    cloudShade: hex('#46497a'),
    rain: 0,
    wetness: 0,
    envIntensity: 1.0,
    bloom: 0.4,
    exposure: 1.15,
  },
  // Elegant night: navy sky, moonlit architecture, a measured scatter of lit offices.
  night: {
    sunElevation: 38,
    sunAzimuth: 215,
    sunColor: hex('#a8c0f0'),
    sunIntensity: 0.75,
    sunDisk: 0,
    moon: 1,
    hemiSky: hex('#34508f'),
    hemiGround: hex('#2f2b36'),
    hemiIntensity: 0.75,
    zenith: hex('#050a1f'),
    horizon: hex('#1b2a55'),
    sunGlow: hex('#3a5290'),
    fogColor: hex('#1b2a55'),
    fogNear: 90,
    fogFar: 300,
    nightFactor: 1,
    stars: 1,
    cloudCover: 0.2,
    cloudLit: hex('#56688f'),
    cloudShade: hex('#1a2138'),
    rain: 0,
    wetness: 0,
    envIntensity: 0.6,
    bloom: 0.6,
    exposure: 1.1,
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
    // A few fair-weather cumulus even on a clear day: depth in the sky and slow soft shadows.
    s.cloudCover = 0.16;
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
    s.fogNear *= rain ? 0.45 : 0.6;
    s.fogFar *= rain ? 0.7 : 0.8;
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
