import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { projectToVisible, type Viewport } from '../src/camera/fit.ts';
import {
  clampToRoom,
  officeDeskShot,
  officeHeading,
  officeLimits,
  officeOverviewOrbit,
  officeRoom,
  OFFICE_PHI,
} from '../src/camera/office.ts';
import { orbitFromPose } from '../src/camera/orbit.ts';
import layoutJson from '../src/data/city-layout.json' with { type: 'json' };
import { referenceDeskWorld, referencePlanFor } from '../src/interior/placement.ts';
import { roomLayout } from '../src/interior/room/layout.ts';
import type { CityLayout } from '../src/types.ts';

const layout = layoutJson as CityLayout;
const DESKTOP: Viewport = { width: 1440, height: 900, right: 396, bottom: 0, fov: 42 };
const PHONE: Viewport = { width: 390, height: 844, right: 0, bottom: 440, fov: 42 };

describe('office camera (R3)', () => {
  const b = layout.buildings.find(x => x.key === 'rental-2')!;
  // The demo team: eight AI agents (the public layout's own desks on other floors work the same way).
  const people = Array.from({ length: 8 }, () => ({ kind: 'ai' as const, role: 'follow-up' }));
  const room = officeRoom(b, 3, referencePlanFor(b, people));

  it('looks in from the front, about 40–45° down, with the feature wall at the back centre', () => {
    const o = officeOverviewOrbit(room, DESKTOP);
    assert.equal(o.theta, officeHeading(room));
    assert.equal(o.theta, 0, 'the camera stands on the +z side, the feature wall is at -z');
    const down = 90 - (OFFICE_PHI * 180) / Math.PI;
    assert.ok(down >= 38 && down <= 46, `${down.toFixed(1)}° down`);
    const [x] = projectToVisible(o, [(room.minX + room.maxX) / 2, room.wallTop, room.minZ], DESKTOP);
    assert.ok(Math.abs(x) < 0.05, 'feature wall centred across the visible view');
  });

  it('frames the whole room inside the part of the view the panel leaves visible', () => {
    const o = officeOverviewOrbit(room, DESKTOP);
    for (const x of [room.minX, room.maxX])
      for (const z of [room.minZ, room.maxZ]) {
        const [px, py] = projectToVisible(o, [x, room.floor, z], DESKTOP);
        assert.ok(Math.abs(px) <= 1.001 && Math.abs(py) <= 1.001, `corner ${x},${z} at ${px},${py}`);
      }
  });

  it('frames the team, not the whole width, above a phone’s bottom sheet', () => {
    assert.ok(room.team, 'the plan gives the team’s extent');
    const wide = officeOverviewOrbit(room, { ...PHONE, bottom: 0, width: 1400 });
    const phone = officeOverviewOrbit(room, PHONE);
    assert.ok(phone.radius > 0 && wide.radius > 0);
    const [px] = projectToVisible(phone, [room.team!.maxX, room.floor, room.maxZ], PHONE);
    assert.ok(Math.abs(px) <= 1.001);
  });

  it('eases to a desk without swinging round and keeps limits above the floor', () => {
    const d = referenceDeskWorld(b, 3, 0, people)!;
    const shot = officeDeskShot(d.pos, room);
    const o = orbitFromPose(shot.pos, shot.target);
    assert.ok(Math.abs(o.theta - officeHeading(room)) < 1e-9);
    assert.ok(shot.pos[1] > d.pos[1]);
    const lim = officeLimits(officeOverviewOrbit(room, DESKTOP));
    assert.ok(lim.maxPhi < Math.PI / 2 - 0.3, 'never down at the floor’s level');
    assert.ok(lim.maxRadius > officeOverviewOrbit(room, DESKTOP).radius);
  });

  it('crops the bare front of a deep floor: the furnished part fills the frame', () => {
    const deep = layout.buildings.reduce((a, x) => (x.d > a.d ? x : a));
    const plan = referencePlanFor(deep, people);
    const r = roomLayout(plan);
    const cropped = officeRoom(deep, 2, plan, [r.leadRug, r.teamRug, r.loungeRug]);
    const whole = officeRoom(deep, 2, plan);
    assert.ok(cropped.content && cropped.content.maxZ < whole.maxZ, 'front of the floor left out');
    assert.equal(cropped.content.minZ, whole.minZ, 'the back glass stays in');
    assert.ok(officeOverviewOrbit(cropped, DESKTOP).radius < officeOverviewOrbit(whole, DESKTOP).radius);
  });

  it('keeps pans over the room', () => {
    const far = clampToRoom([room.maxX + 100, 0, room.minZ - 100], room);
    assert.ok(far[0] < room.maxX + (room.maxX - room.minX) && far[2] > room.minZ - (room.maxZ - room.minZ));
  });
});
