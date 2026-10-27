import assert from 'node:assert/strict';
import { it } from 'node:test';
import { CROSSING_TIME, greenRemaining, SIGNAL_CYCLE, signalPhase, walkSignal } from '../src/life/signals.ts';

it('never shows green or amber to both directions at once', () => {
  for (let t = -40; t < 80; t += 0.01) {
    const p = signalPhase(t);
    assert.ok(p.ns === 'red' || p.ew === 'red', `t=${t}: ${JSON.stringify(p)}`);
  }
});

it('keeps the legacy 16 s cycle: east-west green 6.5 s, amber 1.5 s, then north-south', () => {
  assert.equal(SIGNAL_CYCLE, 16);
  assert.deepEqual(signalPhase(0), { ew: 'green', ns: 'red' });
  assert.deepEqual(signalPhase(7), { ew: 'amber', ns: 'red' });
  assert.deepEqual(signalPhase(8.1), { ew: 'red', ns: 'green' });
  assert.deepEqual(signalPhase(15), { ew: 'red', ns: 'amber' });
  assert.deepEqual(signalPhase(16.2), signalPhase(0.2));
  assert.deepEqual(signalPhase(-0.5), signalPhase(15.5));
});

it('lets people start crossing only with enough green left, parallel to the moving traffic', () => {
  for (let t = 0; t < SIGNAL_CYCLE; t += 0.05) {
    const w = walkSignal(t);
    const p = signalPhase(t);
    if (w.ew === 'walk') {
      assert.equal(p.ew, 'green');
      assert.ok(greenRemaining(t, 'ew') >= CROSSING_TIME);
    }
    if (w.ns === 'walk') assert.equal(p.ns, 'green');
    assert.ok(!(w.ew === 'walk' && w.ns === 'walk'));
  }
});
