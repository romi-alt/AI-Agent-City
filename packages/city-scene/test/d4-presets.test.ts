import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cityBounds, cityBoxes } from '../src/camera/bounds.ts';
import { projectToVisible, type Viewport } from '../src/camera/fit.ts';
import { sampleFlight } from '../src/camera/flight.ts';
import { dist } from '../src/camera/math.ts';
import { EXPLORE_LIMITS, orbitFromPose } from '../src/camera/orbit.ts';
import {
  cityFrame,
  edgeHidden,
  exploreLimits,
  fogHides,
  framedHeroes,
  groundReach,
  mainStreet,
  orbitPreset,
  overviewPreset,
  PRESET_SECONDS,
  presetFlight,
  presetPose,
  topPreset,
} from '../src/camera/presets.ts';
import { homeShot } from '../src/camera/shots.ts';
import layoutJson from '../src/data/city-layout.json' with { type: 'json' };
import { presetFor } from '../src/environment/presets.ts';
import type { CityLayout, TimeOfDay } from '../src/types.ts';

const TIMES: TimeOfDay[] = ['day', 'golden', 'evening', 'night'];

const layout = layoutJson as CityLayout;
const boxes = cityBoxes(layout);
const frame = cityFrame(layout);
const bounds = cityBounds(layout);
const DESK: Viewport = { width: 1440, height: 900, right: 0, bottom: 0, fov: 42 };
const PANEL: Viewport = { ...DESK, right: 396 };
const PHONE: Viewport = { width: 390, height: 844, right: 0, bottom: 0, fov: 42 };
const PHONE_SHEET: Viewport = { ...PHONE, bottom: 300 };
const VIEWPORTS = [DESK, PANEL, PHONE, PHONE_SHEET];
/** D1's linear fog at its thinnest (clear day; evening, night and weather only hide more). */
const FOG = { far: Math.max(...TIMES.map(t => presetFor(t, 'clear').fogFar)) };
const pitchOf = (phi: number) => 90 - (phi * 180) / Math.PI;

function inView(o: ReturnType<typeof overviewPreset>, vp: Viewport, keys: Set<string>) {
  for (const b of boxes.filter(x => keys.has(x.key))) {
    for (const p of [
      [b.minX, 0, b.minZ],
      [b.maxX, b.top, b.maxZ],
      [b.minX, b.top, b.maxZ],
      [b.maxX, 0, b.minZ],
    ] as [number, number, number][]) {
      const [x, y] = projectToVisible(o, p, vp);
      assert.ok(Math.abs(x) <= 1.0001 && Math.abs(y) <= 1.0001, `${b.key} outside the view: ${x}, ${y}`);
    }
  }
}

describe('city presets', () => {
  it('Overview is low (30–35° down), looks up a north–south street, and frames the client buildings', () => {
    for (const vp of VIEWPORTS) {
      const o = overviewPreset(boxes, frame, vp);
      const pitch = pitchOf(o.phi);
      assert.ok(pitch >= 30 && pitch <= 35, `pitch ${pitch.toFixed(1)}°`);
      assert.ok(Math.abs(o.theta) < 0.2, 'looking (almost) straight along the streets');
      inView(o, vp, new Set(framedHeroes(boxes, vp).map(b => b.key)));
    }
    assert.ok(frame.roadsX.includes(mainStreet(frame)));
  });
  it('Overview is lower and closer than the old aerial', () => {
    for (const vp of [DESK, PHONE]) {
      const now = overviewPreset(boxes, frame, vp);
      const old = orbitFromPose(homeShot(boxes, vp).pos, homeShot(boxes, vp).target);
      assert.ok(now.radius < old.radius, `radius ${now.radius.toFixed(0)} vs ${old.radius.toFixed(0)}`);
      assert.ok(now.radius * Math.cos(now.phi) < old.radius * Math.cos(old.phi) * 0.75, 'camera height');
    }
  });
  it('Top looks straight down, tight enough that the client buildings fill the view on one axis', () => {
    for (const vp of VIEWPORTS) {
      const o = topPreset(boxes, vp);
      assert.ok(o.phi < 0.06);
      let spanX = 0;
      let spanY = 0;
      for (const b of framedHeroes(boxes, vp)) {
        for (const p of [
          [b.minX, 0, b.minZ],
          [b.maxX, 0, b.maxZ],
        ] as [number, number, number][]) {
          const [x, y] = projectToVisible(o, p, vp);
          spanX = Math.max(spanX, Math.abs(x));
          spanY = Math.max(spanY, Math.abs(y));
        }
      }
      assert.ok(Math.max(spanX, spanY) > 0.97, `buildings reach ${Math.max(spanX, spanY).toFixed(2)} of the view`);
    }
  });
  it('Orbit turns round the district centre at the low angle', () => {
    const o = orbitPreset(boxes, DESK);
    const pitch = pitchOf(o.phi);
    assert.ok(pitch >= 30 && pitch <= 38, `pitch ${pitch.toFixed(1)}°`);
    assert.ok(Math.hypot(o.target[0], o.target[2]) < 6, 'centred on the district');
  });
  it('re-frames for the HUD: a side panel moves the overview, it is never fixed coordinates', () => {
    const a = overviewPreset(boxes, frame, DESK);
    const b = overviewPreset(boxes, frame, PANEL);
    assert.ok(dist(a.target, b.target) > 0.5 || Math.abs(a.radius - b.radius) > 0.5);
  });
  it('moves between presets in about a second, ending exactly on the preset', () => {
    const lim = exploreLimits(EXPLORE_LIMITS, frame, boxes, DESK, FOG, bounds.targetExtent);
    const views = ['overview', 'top', 'orbit'] as const;
    for (const from of views) {
      for (const to of views) {
        const f = presetFlight(presetPose(from, boxes, frame, DESK, lim), presetPose(to, boxes, frame, DESK, lim));
        assert.ok(f.duration >= 0.9 && f.duration <= 1.3 && f.duration === PRESET_SECONDS);
        assert.ok(dist(sampleFlight(f, f.duration).pos, f.to.pos) < 1e-6);
      }
    }
  });
});

describe('edge of the generated city', () => {
  it('measures how far the visible ground reaches', () => {
    const o = overviewPreset(boxes, frame, DESK);
    assert.equal(groundReach({ ...o, phi: 1.45 }, DESK, Infinity), Infinity, 'the horizon with no fog: unbounded');
    assert.ok(groundReach(o, DESK, 200) < groundReach(o, DESK, 400), 'thicker fog hides more');
    assert.ok(groundReach(topPreset(boxes, DESK), DESK, Infinity) < 120, 'straight down sees only the district');
    assert.ok(Math.abs(fogHides({ far: 300 }) - 300) < 1e-9);
    assert.ok(fogHides({ density: 0.01 }) > 200 && fogHides(null) === Infinity);
  });
  it('the presets, the farthest zoom and the lowest tilt never show the edge, in any viewport', () => {
    for (const vp of VIEWPORTS) {
      const lim = exploreLimits(EXPLORE_LIMITS, frame, boxes, vp, FOG, bounds.targetExtent);
      const fog = fogHides(FOG);
      for (const view of ['overview', 'top', 'orbit'] as const) {
        const p = presetPose(view, boxes, frame, vp, lim);
        const o = orbitFromPose(p.pos, p.target);
        assert.ok(o.radius <= lim.maxRadius + 1e-6 && o.phi <= lim.maxPhi + 1e-6, `${view} inside the limits`);
        assert.ok(groundReach(o, vp, fog) < frame.extent, `${view} shows the edge`);
      }
      // Every zoom and tilt the limits allow, with the target panned to the corners of the district.
      for (let phi = lim.minPhi; phi <= lim.maxPhi + 1e-9; phi += 0.04) {
        for (const k of [0.25, 0.5, 0.75, 1]) {
          const r = lim.minRadius + (lim.maxRadius - lim.minRadius) * k;
          assert.ok(edgeHidden(phi, r, frame, vp, fog, bounds.targetExtent), `edge at phi ${phi.toFixed(2)} r ${r}`);
        }
      }
      assert.ok(edgeHidden(lim.maxPhi, lim.maxRadius, frame, vp, fog, bounds.targetExtent));
      // The limits still leave room to look around: some zoom out past the overview, and its tilt or lower.
      const ov = overviewPreset(boxes, frame, vp);
      assert.ok(lim.maxRadius > ov.radius * 1.05, `max zoom ${lim.maxRadius.toFixed(0)} vs ${ov.radius.toFixed(0)}`);
      assert.ok(lim.maxPhi >= ov.phi - 1e-9, `lowest pitch ${pitchOf(lim.maxPhi).toFixed(1)}°`);
    }
  });
});
