import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ARRIVAL_KEY, arrivalPlayed, markArrivalPlayed, shouldPlayArrival } from '../src/camera/arrival.ts';
import { keyBelongsToControl, keyToCommand } from '../src/camera/keyboard.ts';
import { breadcrumbs, type NavContext, parentMode, reduceMode } from '../src/camera/modes.ts';
import layoutJson from '../src/data/city-layout.json' with { type: 'json' };
import type { CityLayout, CityMode } from '../src/types.ts';
import { announce, floorSummary } from '../src/ui/text.ts';

const layout = layoutJson as CityLayout;
const publicCtx: NavContext = { layout, enterable: [], highlight: null };
const demoCtx: NavContext = { layout, enterable: ['rental-2'], highlight: 'rental-2' };
const explore: CityMode = { kind: 'explore' };

describe('mode transitions', () => {
  it('goes city → building → floor → office → desk and back one step at a time', () => {
    let m = reduceMode(explore, { type: 'select-building', building: 'rental-2' }, demoCtx);
    assert.deepEqual(m, { kind: 'building', building: 'rental-2' });
    m = reduceMode(m, { type: 'select-floor', level: 3 }, demoCtx);
    assert.deepEqual(m, { kind: 'floor', building: 'rental-2', level: 3 });
    m = reduceMode(m, { type: 'enter-office' }, demoCtx);
    assert.deepEqual(m, { kind: 'office', building: 'rental-2', level: 3, desk: null });
    m = reduceMode(m, { type: 'select-desk', desk: 1 }, demoCtx);
    assert.deepEqual(m, { kind: 'office', building: 'rental-2', level: 3, desk: 1 });
    m = reduceMode(m, { type: 'back' }, demoCtx);
    assert.deepEqual(m, { kind: 'office', building: 'rental-2', level: 3, desk: null });
    m = reduceMode(m, { type: 'back' }, demoCtx);
    assert.deepEqual(m, { kind: 'floor', building: 'rental-2', level: 3 });
    m = reduceMode(m, { type: 'back' }, demoCtx);
    assert.deepEqual(m, { kind: 'building', building: 'rental-2' });
    m = reduceMode(m, { type: 'back' }, demoCtx);
    assert.deepEqual(m, explore);
    assert.equal(reduceMode(explore, { type: 'back' }, demoCtx), explore);
  });
  it('lets anyone look at any floor, but only enter offices they may enter', () => {
    const floor = reduceMode({ kind: 'building', building: 'audi' }, { type: 'select-floor', level: 12 }, publicCtx);
    assert.deepEqual(floor, { kind: 'floor', building: 'audi', level: 12 });
    assert.equal(reduceMode(floor, { type: 'enter-office' }, publicCtx), floor);
    assert.equal(reduceMode(floor, { type: 'enter-office' }, demoCtx), floor, 'the demo may enter only its building');
  });
  it('ignores unknown buildings and floors, desks outside an office, and bad desk numbers', () => {
    const b: CityMode = { kind: 'building', building: 'rental-2' };
    assert.equal(reduceMode(explore, { type: 'select-building', building: 'nope' }, publicCtx), explore);
    assert.equal(reduceMode(b, { type: 'select-floor', level: 99 }, publicCtx), b);
    assert.equal(reduceMode(explore, { type: 'select-floor', level: 1 }, publicCtx), explore);
    assert.equal(reduceMode(b, { type: 'select-desk', desk: 0 }, publicCtx), b);
    const office: CityMode = { kind: 'office', building: 'rental-2', level: 3, desk: null };
    assert.equal(reduceMode(office, { type: 'select-desk', desk: -1 }, demoCtx), office);
    assert.equal(reduceMode(office, { type: 'select-desk', desk: 1.5 }, demoCtx), office);
  });
  it('moves between floors and buildings directly', () => {
    const f: CityMode = { kind: 'floor', building: 'audi', level: 4 };
    assert.deepEqual(reduceMode(f, { type: 'select-floor', level: 5 }, publicCtx), { ...f, level: 5 });
    assert.deepEqual(reduceMode(f, { type: 'select-building', building: 'honda' }, publicCtx), {
      kind: 'building',
      building: 'honda',
    });
    assert.deepEqual(reduceMode(f, { type: 'home' }, publicCtx), explore);
    assert.equal(reduceMode(explore, { type: 'home' }, publicCtx), explore, 'home in the city is a no-op (view reset)');
  });
  it('ends the arrival at the visitor’s building, or in the open city', () => {
    const arrival: CityMode = { kind: 'arrival' };
    assert.deepEqual(reduceMode(arrival, { type: 'arrival-done' }, demoCtx), {
      kind: 'building',
      building: 'rental-2',
    });
    assert.deepEqual(reduceMode(arrival, { type: 'arrival-done' }, publicCtx), explore);
    assert.deepEqual(parentMode(arrival, publicCtx), explore);
    assert.equal(reduceMode(explore, { type: 'arrival-done' }, demoCtx), explore);
  });
  it('builds the breadcrumb City › Building › Floor › Office with the last one current', () => {
    const crumbs = breadcrumbs({ kind: 'office', building: 'rental-2', level: 3, desk: 2 }, layout);
    assert.deepEqual(
      crumbs.map(c => c.label),
      ['City', 'Rental 2', 'Floor 3', 'Office'],
    );
    assert.equal(crumbs.at(-1)!.mode, null);
    assert.deepEqual(crumbs[2]!.mode, { kind: 'floor', building: 'rental-2', level: 3 });
    assert.deepEqual(
      breadcrumbs(explore, layout).map(c => [c.label, c.mode]),
      [['City', null]],
    );
  });
});

describe('arrival plays once per session', () => {
  const storage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it('plays the first time, then not again', () => {
    const s = storage();
    assert.ok(shouldPlayArrival(s));
    markArrivalPlayed(s);
    assert.ok(arrivalPlayed(s));
    assert.equal(s.getItem(ARRIVAL_KEY), '1');
    assert.ok(!shouldPlayArrival(s));
    assert.ok(shouldPlayArrival(s, true), 'a guided tour may force it');
  });
  it('treats blocked storage as not played (and does not throw)', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    assert.ok(shouldPlayArrival(blocked));
    assert.doesNotThrow(() => markArrivalPlayed(blocked));
    assert.ok(shouldPlayArrival(null));
  });
});

describe('keyboard', () => {
  it('maps arrows and WASD to panning, +/- to zoom, Q/E to turn, R/H/Esc', () => {
    assert.deepEqual(keyToCommand({ key: 'ArrowUp' }), { type: 'pan', right: 0, forward: 1 });
    assert.deepEqual(keyToCommand({ key: 'w' }), keyToCommand({ key: 'ArrowUp' }));
    assert.deepEqual(keyToCommand({ key: 'S' }), { type: 'pan', right: 0, forward: -1 });
    assert.deepEqual(keyToCommand({ key: 'a' }), { type: 'pan', right: -1, forward: 0 });
    assert.deepEqual(keyToCommand({ key: 'ArrowRight' }), { type: 'pan', right: 1, forward: 0 });
    assert.deepEqual(keyToCommand({ key: '+' }), { type: 'zoom', dir: 1 });
    assert.deepEqual(keyToCommand({ key: '=' }), { type: 'zoom', dir: 1 });
    assert.deepEqual(keyToCommand({ key: '-' }), { type: 'zoom', dir: -1 });
    assert.deepEqual(keyToCommand({ key: 'q' }), { type: 'rotate', dir: -1 });
    assert.deepEqual(keyToCommand({ key: 'E' }), { type: 'rotate', dir: 1 });
    assert.deepEqual(keyToCommand({ key: 'PageUp' }), { type: 'tilt', dir: -1 });
    assert.deepEqual(keyToCommand({ key: 'r' }), { type: 'reset' });
    assert.deepEqual(keyToCommand({ key: 'H' }), { type: 'home' });
    assert.deepEqual(keyToCommand({ key: 'Escape' }), { type: 'back' });
    assert.equal(keyToCommand({ key: 'x' }), null);
  });
  it('leaves browser shortcuts alone', () => {
    assert.equal(keyToCommand({ key: 'r', ctrlKey: true }), null);
    assert.equal(keyToCommand({ key: '+', metaKey: true }), null);
    assert.equal(keyToCommand({ key: 'ArrowLeft', altKey: true }), null);
  });
  it('lets fields and buttons keep the keys they use', () => {
    assert.ok(keyBelongsToControl('a', 'INPUT', null));
    assert.ok(!keyBelongsToControl('Escape', 'INPUT', null));
    assert.ok(keyBelongsToControl('ArrowUp', 'DIV', 'radiogroup'));
    assert.ok(keyBelongsToControl(' ', 'BUTTON', null));
    assert.ok(keyBelongsToControl('Enter', 'A', null));
    assert.ok(!keyBelongsToControl('r', 'BUTTON', null));
  });
});

describe('HUD text', () => {
  it('summarises floors from the visitor’s side, never naming people', () => {
    const rc = layout.buildings.find(b => b.key === 'rc-new')!.floors[0]!;
    assert.equal(floorSummary(rc), '2 AI agents · 1 person');
    const empty = layout.buildings.find(b => b.key === 'rental-2')!.floors[0]!;
    assert.equal(floorSummary(empty), 'Available to rent');
  });
  it('announces each view', () => {
    assert.match(announce({ kind: 'building', building: 'audi' }, layout), /Audi Dealership\. 12 floors\./);
    assert.match(announce({ kind: 'floor', building: 'audi', level: 12 }, layout), /floor 12: Sales Dept\./);
    assert.match(announce({ kind: 'arrival' }, layout), /skip/i);
  });
});
