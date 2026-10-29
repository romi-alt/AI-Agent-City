// Tests for the demo office's workflow scenarios: generated per lead, one per agent, always simulated, and a state
// machine that cannot be pushed into an impossible state.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOffice } from '../lib/lite/office.ts';
import { buildScenarioPack, withScenarios } from '../lib/lite/scenarios.ts';
import {
  advance,
  decisionLabel,
  draftBodyFor,
  isValidProgress,
  OUTCOME_STEP,
  outcomeFor,
  REVIEW_STEP,
  START,
  statusFor,
  summariseDay,
  type Decision,
  type FlowAction,
  type Progress,
  type Scenario,
} from '../lib/lite/scenario-types.ts';
import { parseScenarios } from '../lib/lite-scenario-parse.ts';

const NOW = new Date('2026-10-28T10:00:00Z');
const officeFor = (id: string) => buildOffice(id, 'Acme Motors', NOW);
const packFor = (id: string) => buildScenarioPack(id, officeFor(id));

test('scenarios are deterministic per lead and differ between leads', () => {
  assert.deepEqual(packFor('lead-a'), packFor('lead-a'));
  const a = packFor('lead-a').scenarios.map(s => s.id);
  const b = packFor('lead-b').scenarios.map(s => s.id);
  assert.notDeepEqual(a, b);
});

test('every agent in the roster has exactly one scenario, in day order, with a distinct story', () => {
  const office = officeFor('lead-a');
  const { scenarios } = packFor('lead-a');
  assert.equal(scenarios.length, office.agents.length);
  assert.deepEqual([...scenarios.map(s => s.agentId)].sort(), office.agents.map(a => a.id).sort());
  assert.equal(new Set(scenarios.map(s => s.title)).size, scenarios.length);
  assert.equal(new Set(scenarios.map(s => s.id)).size, scenarios.length);
  const times = scenarios.map(s => s.time);
  assert.deepEqual(times, [...times].sort());
  const roles = scenarios.map(s => s.role).sort();
  assert.deepEqual(roles, ['CSI', 'chat', 'closer', 'content', 'follow-up', 'reviews', 'service visits', 'web leads']);
});

test('across leads the three kinds of business all appear', () => {
  const sectors = new Set(Array.from({ length: 40 }, (_, i) => packFor(`lead-${i}`).sector));
  assert.equal(sectors.size, 3);
});

function textsOf(s: Scenario): string[] {
  const out = [s.approve, s.decline].flatMap(o => [o.headline, o.log, o.next, o.task]);
  return [...out, ...s.draft.reasoning, ...s.checks.map(c => c.finding), s.summary];
}

test('every step is labelled simulated and nothing claims that something was sent', () => {
  const ALLOWED = /nothing (was|is) (sent|published|posted)/gi;
  for (let i = 0; i < 12; i += 1) {
    for (const s of packFor(`lead-${i}`).scenarios) {
      assert.equal(s.simulated, true);
      for (const o of [s.approve, s.decline]) {
        assert.match(o.log, /^SIMULATED:/);
        assert.match(o.log, /Nothing was (sent|published)/);
        assert.match(o.task, /\((simulated|sample)\)/);
      }
      for (const t of textsOf(s)) {
        assert.doesNotMatch(t.replace(ALLOWED, ''), /\b(sent|delivered|published|posted|emailed)\b/i, t);
      }
      assert.ok(s.decision.changes.length >= 2 && s.decision.changes.length <= 3);
      assert.ok(s.checks.length >= 3 && s.draft.reasoning.length >= 2);
      assert.match(s.trigger.source + s.trigger.headline + s.trigger.detail, /Sample|sample/);
    }
  }
});

test('no model identifiers, real brands or contact details in the scenario text', () => {
  const all = JSON.stringify(packFor('lead-a'));
  assert.doesNotMatch(all, /claude|gpt|openai|anthropic|gemini/i);
  assert.doesNotMatch(all, /@|https?:|\d{3}[ -]\d{3}[ -]\d{4}/);
  assert.doesNotMatch(all, /guarantee|revenue|% /i);
});

test('the office response gains the scenarios and keeps every old field', () => {
  const base = officeFor('lead-a');
  const extended = withScenarios('lead-a', base);
  assert.deepEqual(
    { ...extended, scenarios: undefined, dayReport: undefined, sector: undefined },
    {
      ...base,
      scenarios: undefined,
      dayReport: undefined,
      sector: undefined,
    },
  );
  assert.equal(extended.scenarios.length, 8);
  assert.equal(extended.dayReport.simulated, true);
  assert.equal(parseScenarios(JSON.parse(JSON.stringify(extended.scenarios))).length, 8);
  assert.equal(parseScenarios([{ id: 'x' }, null, 4]).length, 0);
});

// ---------- state machine ----------

const sample = packFor('lead-a').scenarios[1]!;
const decisions = (s: Scenario): Decision[] => [
  { kind: 'approve' },
  { kind: 'decline' },
  ...s.decision.changes.map<Decision>(c => ({ kind: 'change', option: c.id })),
  { kind: 'change', option: 'not-an-option' },
];
const actions = (s: Scenario): FlowAction[] => [
  { type: 'next' },
  { type: 'back' },
  { type: 'to-review' },
  { type: 'reset' },
  ...decisions(s).map<FlowAction>(decision => ({ type: 'decide', decision })),
];

test('no sequence of actions can leave the machine in an invalid state', () => {
  const seen = new Set<string>();
  const queue: Progress[] = [START];
  while (queue.length) {
    const p = queue.pop()!;
    const key = JSON.stringify(p);
    if (seen.has(key)) continue;
    seen.add(key);
    assert.ok(isValidProgress(p, sample), key);
    for (const a of actions(sample)) queue.push(advance(p, a, sample));
  }
  // 4 steps without a decision, plus the outcome once for each valid decision
  assert.equal(seen.size, 4 + (decisions(sample).length - 1));
});

test('a decision is only possible at the review step, and only a known one', () => {
  const approve: FlowAction = { type: 'decide', decision: { kind: 'approve' } };
  assert.deepEqual(advance(START, approve, sample), START);
  const atReview = advance(START, { type: 'to-review' }, sample);
  assert.equal(atReview.step, REVIEW_STEP);
  const bad = advance(atReview, { type: 'decide', decision: { kind: 'change', option: 'nope' } }, sample);
  assert.deepEqual(bad, atReview);
  const done = advance(atReview, approve, sample);
  assert.equal(done.step, OUTCOME_STEP);
  assert.deepEqual(advance(done, { type: 'next' }, sample), done);
  assert.deepEqual(advance(done, { type: 'back' }, sample), done);
  assert.deepEqual(advance(done, { type: 'decide', decision: { kind: 'decline' } }, sample), done);
  assert.deepEqual(advance(done, { type: 'reset' }, sample), START);
  assert.deepEqual(advance(START, { type: 'back' }, sample), START);
});

test('outcomes, drafts and roster status follow the decision', () => {
  const change: Decision = { kind: 'change', option: sample.decision.changes[0]!.id };
  assert.equal(outcomeFor(sample, { kind: 'approve' }), sample.approve);
  assert.equal(outcomeFor(sample, { kind: 'decline' }), sample.decline);
  assert.match(outcomeFor(sample, change).log, /^SIMULATED:.*Nothing was sent\.$/);
  assert.match(decisionLabel(sample, change), /^Changed: /);
  assert.equal(draftBodyFor(sample, change), sample.decision.changes[0]!.revised);
  assert.equal(draftBodyFor(sample, null), sample.draft.body);
  const at = (step: number, decision: Decision | null): Progress => ({ step, decision });
  assert.equal(statusFor('idle', undefined, sample), 'idle');
  assert.equal(statusFor('idle', at(REVIEW_STEP, null), sample), 'needs-you');
  assert.equal(statusFor('needs-you', at(OUTCOME_STEP, { kind: 'approve' }), sample), 'working');
  assert.equal(statusFor('working', at(OUTCOME_STEP, { kind: 'decline' }), sample), 'idle');
  assert.equal(statusFor('working', at(OUTCOME_STEP, null), sample), 'working', 'a corrupt record is ignored');
});

test('the day summary reflects exactly what the visitor decided', () => {
  const { scenarios } = packFor('lead-a');
  const base = { repliesDrafted: 10, conversationsOpen: 5, waitingForYou: 2 };
  const none = summariseDay(base, scenarios, {}, () => 'working');
  assert.deepEqual(none.counters, { ...base, waitingForYou: 0 });
  assert.equal(none.decided, 0);

  const progress: Record<string, Progress> = {};
  const first = scenarios[0]!;
  const second = scenarios[1]!;
  progress[first.id] = { step: OUTCOME_STEP, decision: { kind: 'approve' } };
  progress[second.id] = { step: OUTCOME_STEP, decision: { kind: 'decline' } };
  progress[scenarios[2]!.id] = { step: REVIEW_STEP, decision: null };
  const day = summariseDay(base, scenarios, progress, () => 'working');
  assert.equal(day.approved, 1);
  assert.equal(day.declined, 1);
  assert.equal(day.changed, 0);
  assert.equal(day.counters.repliesDrafted, 10 + first.approve.drafted);
  assert.equal(day.counters.waitingForYou, 1);
  assert.equal(day.log.length, 2);
  assert.ok(day.log.every(l => l.text.startsWith('SIMULATED:')));
});
