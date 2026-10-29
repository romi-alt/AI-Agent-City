// Unit tests for the /city Present mode steps (app/city/present.ts): every stop points at a real place in the public
// city, and Next/Prev wrap around.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import layout from '../../../packages/city-scene/src/data/city-layout.json' with { type: 'json' };
import { PRESENT_STEPS, stepBuilding, stepIndex } from '../app/city/present.ts';

const buildings = (layout as { buildings: { key: string; floors: { level: number }[] }[] }).buildings;

test('every step that calls out a building or floor names one the public city has', () => {
  for (const step of PRESENT_STEPS) {
    if (step.view.kind === 'explore') continue;
    const view = step.view;
    const b = buildings.find(x => x.key === view.building);
    assert.ok(b, `"${step.title}" names building "${view.building}", which the layout doesn't have`);
    if (view.kind === 'floor') {
      assert.ok(
        b.floors.some(f => f.level === view.level),
        `"${step.title}" names floor ${view.level} of "${view.building}", which doesn't exist`,
      );
    }
  }
});

test('the pitch opens and closes on the city overview, and every step has its words', () => {
  assert.equal(PRESENT_STEPS[0]?.view.kind, 'explore');
  assert.equal(PRESENT_STEPS.at(-1)?.view.kind, 'explore');
  for (const s of PRESENT_STEPS) {
    assert.ok(s.tag.trim() && s.title.trim() && s.line.trim(), `a step is missing its tag, title or line`);
  }
  assert.equal(new Set(PRESENT_STEPS.map(s => s.title)).size, PRESENT_STEPS.length, 'step titles are unique');
});

test('Next on the last step returns to the first, and Prev on the first goes to the last', () => {
  const n = PRESENT_STEPS.length;
  assert.equal(stepIndex(n), 0);
  assert.equal(stepIndex(-1), n - 1);
  assert.equal(stepIndex(n * 3 + 2), 2);
  assert.equal(stepIndex(-n - 1), n - 1);
});

test('the called-out building follows the step', () => {
  for (const s of PRESENT_STEPS) {
    assert.equal(stepBuilding(s), s.view.kind === 'explore' ? null : s.view.building);
  }
});
