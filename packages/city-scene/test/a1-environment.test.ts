import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hex,
  lerpState,
  presetFor,
  startTransition,
  stepTransition,
  sunVector,
  TRANSITION_SECONDS,
  transitionDone,
} from '../src/environment/presets.ts';
import { defaultSignalPhase } from '../src/streets/signal-source.ts';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

describe('environment presets', () => {
  it('converts sRGB hex to linear', () => {
    assert.deepEqual(hex('#000000'), [0, 0, 0]);
    assert.deepEqual(hex('#ffffff'), [1, 1, 1]);
    close(hex('#808080')[0], 0.2158605, 1e-6);
  });

  it('gets darker and lights up from day to night', () => {
    const day = presetFor('day', 'clear');
    const night = presetFor('night', 'clear');
    assert.equal(day.nightFactor, 0);
    assert.equal(night.nightFactor, 1);
    assert.ok(night.sunIntensity < day.sunIntensity);
    assert.ok(night.zenith[2] < day.zenith[2]);
  });

  it('makes light rain wet, overcast and dimmer, and switches some office lights on', () => {
    const clear = presetFor('day', 'clear');
    const rain = presetFor('day', 'light-rain');
    assert.equal(rain.rain, 1);
    assert.equal(rain.wetness, 1);
    assert.equal(clear.wetness, 0);
    assert.ok(rain.cloudCover > 0.9);
    assert.ok(rain.sunIntensity < clear.sunIntensity * 0.3);
    assert.ok(rain.fogFar < clear.fogFar && rain.fogNear < clear.fogNear);
    assert.ok(rain.nightFactor > 0 && rain.nightFactor < 0.5);
  });

  it('interpolates every field, colours component-wise, azimuth the short way round', () => {
    const a = presetFor('day', 'clear');
    const b = presetFor('night', 'overcast');
    assert.deepEqual(lerpState(a, b, 0), a);
    const end = lerpState(a, b, 1);
    for (const k of Object.keys(b) as (keyof typeof b)[]) {
      if (k === 'sunAzimuth') continue;
      if (Array.isArray(b[k])) (b[k] as number[]).forEach((v, i) => close((end[k] as number[])[i]!, v));
      else close(end[k] as number, b[k] as number);
    }
    const mid = lerpState(a, b, 0.5);
    close(mid.nightFactor, (a.nightFactor + b.nightFactor) / 2);
    close(mid.zenith[1], (a.zenith[1] + b.zenith[1]) / 2);
    // 350° to 10° passes through 0°, not 180°.
    const wrap = lerpState({ ...a, sunAzimuth: 350 }, { ...a, sunAzimuth: 10 }, 0.5);
    close(((wrap.sunAzimuth % 360) + 360) % 360, 0);
  });

  it('blends over a few seconds, eased, and lands exactly on the target', () => {
    const from = presetFor('day', 'clear');
    const to = presetFor('night', 'clear');
    const tr = startTransition(from, to, false);
    assert.equal(tr.duration, TRANSITION_SECONDS);
    assert.ok(TRANSITION_SECONDS >= 2 && TRANSITION_SECONDS <= 4);
    const early = stepTransition(tr, 0.3);
    assert.ok(early.nightFactor > 0 && early.nightFactor < 0.1, 'eased start');
    const half = stepTransition(tr, TRANSITION_SECONDS / 2 - 0.3);
    close(half.nightFactor, 0.5, 1e-9);
    assert.equal(transitionDone(tr), false);
    const done = stepTransition(tr, 10);
    assert.equal(done, to);
    assert.equal(transitionDone(tr), true);
  });

  it('cuts instantly with reduced motion', () => {
    const to = presetFor('golden', 'partly-cloudy');
    const tr = startTransition(presetFor('day', 'clear'), to, true);
    assert.equal(stepTransition(tr, 0), to);
    assert.equal(transitionDone(tr), true);
  });

  it('points the sun vector up for positive elevations', () => {
    const [x, y, z] = sunVector(90, 0);
    close(x, 0, 1e-12);
    close(y, 1);
    close(z, 0, 1e-12);
    const [, ly] = sunVector(-4, 70);
    assert.ok(ly < 0);
    const v = sunVector(52, 128);
    close(Math.hypot(...v), 1);
  });
});

describe('default traffic-signal cycle', () => {
  it('never shows green both ways and follows the legacy timings', () => {
    for (let t = 0; t < 64; t += 0.25) {
      const p = defaultSignalPhase(t);
      assert.ok(!(p.x === 'g' && p.z === 'g'));
      assert.ok(p.x === 'r' || p.z === 'r');
    }
    assert.deepEqual(defaultSignalPhase(0), { x: 'g', z: 'r' });
    assert.deepEqual(defaultSignalPhase(7), { x: 'y', z: 'r' });
    assert.deepEqual(defaultSignalPhase(10), { x: 'r', z: 'g' });
    assert.deepEqual(defaultSignalPhase(15), { x: 'r', z: 'y' });
    assert.deepEqual(defaultSignalPhase(16), defaultSignalPhase(0));
    assert.deepEqual(defaultSignalPhase(-1), defaultSignalPhase(15));
  });
});
