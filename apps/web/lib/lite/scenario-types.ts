// The shapes of the demo's workflow scenarios and the small state machine that plays them. This file has no server
// imports on purpose: the browser plays the scenario with the same rules the unit tests check. Everything is
// sample content; no step sends, books or publishes anything.

export type DraftKind = 'message' | 'plan' | 'report';

export interface ScenarioCheck {
  label: string;
  finding: string;
}

export interface ScenarioChange {
  id: string;
  label: string;
  /** What the agent changes, in a few words ("shorter reply"). */
  effect: string;
  /** The draft after the change. */
  revised: string;
}

export interface ScenarioOutcome {
  headline: string;
  /** The line added to the simulated log. It always says nothing was sent. */
  log: string;
  next: string;
  /** The task that moves to done. */
  task: string;
  /** How much this adds to the day's "drafted" and "open conversations" counters. */
  drafted: number;
  open: number;
}

export interface Scenario {
  id: string;
  agentId: string;
  agentName: string;
  role: string;
  /** When in the sample day this runs ("08:15"), used to order "Run the day". */
  time: string;
  title: string;
  summary: string;
  trigger: { source: string; headline: string; detail: string };
  checks: ScenarioCheck[];
  score: { value: number; of: number; label: string; why: string } | null;
  draft: { kind: DraftKind; label: string; subject: string | null; body: string; reasoning: string[] };
  decision: { prompt: string; approve: string; decline: string; changes: ScenarioChange[] };
  approve: ScenarioOutcome;
  decline: ScenarioOutcome;
  simulated: true;
}

export interface DayReportPlan {
  title: string;
  intro: string;
  closing: string;
  simulated: true;
}

// ---------- The state machine ----------

export const STEP_LABELS = ['Trigger', 'Checks', 'Draft', 'Your review', 'Outcome'] as const;
export const REVIEW_STEP = 3;
export const OUTCOME_STEP = 4;

export type Decision = { kind: 'approve' } | { kind: 'change'; option: string } | { kind: 'decline' };

/** `step` is the last step reached (0..4). A decision exists exactly when the outcome step has been reached. */
export interface Progress {
  step: number;
  decision: Decision | null;
}

export type FlowAction =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'to-review' }
  | { type: 'decide'; decision: Decision }
  | { type: 'reset' };

export const START: Progress = { step: 0, decision: null };

type Decidable = Pick<Scenario, 'decision'>;

function knownDecision(s: Decidable, d: Decision): boolean {
  if (d.kind !== 'change') return d.kind === 'approve' || d.kind === 'decline';
  return s.decision.changes.some(c => c.id === d.option);
}

/** Whether a stored or computed progress is one the machine can be in. */
export function isValidProgress(p: Progress, s: Decidable): boolean {
  if (!Number.isInteger(p.step) || p.step < 0 || p.step > OUTCOME_STEP) return false;
  if (p.step < OUTCOME_STEP) return p.decision === null;
  return p.decision !== null && knownDecision(s, p.decision);
}

/** Any action that does not fit the current step leaves the progress as it was. */
export function advance(p: Progress, action: FlowAction, s: Decidable): Progress {
  switch (action.type) {
    case 'reset':
      return START;
    case 'next':
      return p.step < REVIEW_STEP ? { step: p.step + 1, decision: null } : p;
    case 'back':
      return p.step > 0 && p.step <= REVIEW_STEP ? { step: p.step - 1, decision: null } : p;
    case 'to-review':
      return p.step < REVIEW_STEP ? { step: REVIEW_STEP, decision: null } : p;
    case 'decide':
      return p.step === REVIEW_STEP && knownDecision(s, action.decision)
        ? { step: OUTCOME_STEP, decision: action.decision }
        : p;
  }
}

export function outcomeFor(s: Scenario, d: Decision): ScenarioOutcome {
  if (d.kind === 'approve') return s.approve;
  if (d.kind === 'decline') return s.decline;
  const change = s.decision.changes.find(c => c.id === d.option);
  const effect = change ? change.effect : 'revised';
  return {
    ...s.approve,
    headline: `Draft revised (${effect}) and approved. ${s.approve.headline}`,
    log: `SIMULATED: the revised draft (${effect}) was recorded as approved. Nothing was sent.`,
  };
}

export function decisionLabel(s: Scenario, d: Decision): string {
  if (d.kind === 'approve') return 'Approved';
  if (d.kind === 'decline') return 'Declined';
  return `Changed: ${s.decision.changes.find(c => c.id === d.option)?.label ?? 'revised'}`;
}

/** The draft the visitor is looking at once a change has been chosen. */
export function draftBodyFor(s: Scenario, d: Decision | null): string {
  if (d?.kind !== 'change') return s.draft.body;
  return s.decision.changes.find(c => c.id === d.option)?.revised ?? s.draft.body;
}

// ---------- Effects on the roster and the day ----------

export type AgentStatus = 'working' | 'idle' | 'needs-you';

/** What the roster shows for an agent given where the visitor is in its scenario. */
export function statusFor(base: AgentStatus, p: Progress | undefined, s: Pick<Scenario, 'decision'>): AgentStatus {
  if (!p || !isValidProgress(p, s)) return base;
  if (p.step === REVIEW_STEP) return 'needs-you';
  if (p.step === OUTCOME_STEP) return p.decision?.kind === 'decline' ? 'idle' : 'working';
  return base;
}

export interface DayCounters {
  repliesDrafted: number;
  conversationsOpen: number;
  waitingForYou: number;
}

export interface LogEntry {
  scenarioId: string;
  agentName: string;
  time: string;
  text: string;
  decision: string;
}

export interface DayView {
  counters: DayCounters;
  approved: number;
  changed: number;
  declined: number;
  decided: number;
  log: LogEntry[];
}

/** The day's numbers with the visitor's decisions applied on top of the seeded starting numbers. */
export function summariseDay(
  base: DayCounters,
  scenarios: Scenario[],
  progress: Record<string, Progress | undefined>,
  baseStatus: (agentId: string) => AgentStatus,
): DayView {
  const view: DayView = {
    counters: { ...base },
    approved: 0,
    changed: 0,
    declined: 0,
    decided: 0,
    log: [],
  };
  let waiting = 0;
  for (const s of scenarios) {
    const p = progress[s.id];
    if (statusFor(baseStatus(s.agentId), p, s) === 'needs-you') waiting += 1;
    if (!p || !isValidProgress(p, s) || !p.decision) continue;
    const out = outcomeFor(s, p.decision);
    view.decided += 1;
    if (p.decision.kind === 'approve') view.approved += 1;
    if (p.decision.kind === 'change') view.changed += 1;
    if (p.decision.kind === 'decline') view.declined += 1;
    view.counters.repliesDrafted += out.drafted;
    view.counters.conversationsOpen += out.open;
    view.log.push({
      scenarioId: s.id,
      agentName: s.agentName,
      time: s.time,
      text: out.log,
      decision: decisionLabel(s, p.decision),
    });
  }
  view.counters.waitingForYou = waiting;
  return view;
}
