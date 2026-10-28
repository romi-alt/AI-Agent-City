import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type LabelCandidate, placeLabels } from '../src/buildings/labelLayout.ts';

const tag = (over: Partial<LabelCandidate>): LabelCandidate => ({
  x: 200,
  y: 200,
  fullWidth: 160,
  briefWidth: 60,
  height: 26,
  pinned: false,
  needsYou: false,
  depth: 10,
  ...over,
});

describe('placeLabels', () => {
  it('leaves distant tags alone', () => {
    const out = placeLabels([tag({}), tag({ x: 600 })]);
    assert.deepEqual(out, [
      { form: 'full', dy: 0 },
      { form: 'full', dy: 0 },
    ]);
  });

  it('nudges or shrinks the farther of two overlapping tags and keeps the nearer one', () => {
    const out = placeLabels([tag({ depth: 20 }), tag({ depth: 5 })]);
    assert.deepEqual(out[1], { form: 'full', dy: 0 });
    assert.equal(out[0]!.form === 'full' && out[0]!.dy === 0, false);
  });

  it('never hides a needs-you tag and gives it priority over a nearer one', () => {
    const out = placeLabels([tag({ needsYou: true, depth: 50 }), tag({ depth: 1 })]);
    assert.deepEqual(out[0], { form: 'full', dy: 0 });
    assert.equal(out[1]!.form === 'full' && out[1]!.dy === 0, false);
  });

  it('hides the lowest-priority tag in a pile-up but keeps every badge', () => {
    const pile = Array.from({ length: 12 }, (_, i) => tag({ depth: i, needsYou: i === 11 }));
    const out = placeLabels(pile);
    assert.notEqual(out[11]!.form, 'hidden');
    assert.ok(out.some(p => p.form === 'hidden'));
  });

  it('is deterministic', () => {
    const pile = Array.from({ length: 8 }, (_, i) => tag({ x: 200 + i * 20, depth: i }));
    assert.deepEqual(placeLabels(pile), placeLabels(pile));
  });
});
