'use client';

// "Run the day" and the day summary. Run the day walks the visitor through every agent's decision in the order of the
// sample day, with a timeline; the summary and the daily priorities report show what the visitor approved, changed
// or declined. All of it is sample content, and the log lines say that nothing was sent.
import {
  decisionLabel,
  OUTCOME_STEP,
  type DayReportPlan,
  type DayView,
  type Progress,
  type Scenario,
} from '../../lib/lite/scenario-types';
import type { DayRun } from './use-scenarios';
import { Simulated } from './DemoBits';

type ItemState = 'waiting' | 'now' | 'approved' | 'changed' | 'declined' | 'skipped';

const STATE_TEXT: Record<ItemState, string> = {
  waiting: 'Later',
  now: 'Your turn',
  approved: 'Approved',
  changed: 'Changed',
  declined: 'Declined',
  skipped: 'Skipped',
};

function stateOf(s: Scenario, p: Progress | undefined, day: DayRun, current: boolean): ItemState {
  if (p?.step === OUTCOME_STEP && p.decision) {
    return p.decision.kind === 'approve' ? 'approved' : p.decision.kind === 'change' ? 'changed' : 'declined';
  }
  if (day.skipped.includes(s.id)) return 'skipped';
  return current ? 'now' : 'waiting';
}

export interface RunDayProps {
  scenarios: Scenario[];
  progress: Record<string, Progress | undefined>;
  day: DayRun;
  onStart: () => void;
  onNext: () => void;
  onSkip: () => void;
  onStop: () => void;
}

export function RunDayPanel({ scenarios, progress, day, onStart, onNext, onSkip, onStop }: RunDayProps) {
  const current = scenarios[day.index];
  const finished = day.active && !current;
  const decidedHere = current ? progress[current.id]?.step === OUTCOME_STEP : false;
  return (
    <section className="dm-mock" aria-labelledby="runday-title" data-testid="run-day" data-active={day.active}>
      <div className="dm-mock-bar">
        <h2 id="runday-title" className="dm-mock-title">
          Run the day
        </h2>
        <Simulated label="Sample day" />
      </div>
      <div className="dm-panel-body">
        <p className="dm-muted">
          {day.active
            ? finished
              ? 'The sample day is over. Your decisions are in the summary below.'
              : 'Each agent stops where it needs you. Decide, then go on to the next.'
            : 'Play the whole team’s day in order, from the first chat at 07:30 to the last review at 17:00. Approvals in this demo do not send anything.'}
        </p>
        <ol className="dm-day-line" aria-label="The sample day" data-testid="day-timeline">
          {scenarios.map((s, i) => {
            const state = stateOf(s, progress[s.id], day, day.active && i === day.index);
            return (
              <li key={s.id} data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
                <span className="dm-day-time">{s.time}</span>
                <span className="dm-day-what">
                  <b>{s.agentName}</b> <span className="dm-row-sub">{s.title}</span>
                </span>
                <span className="dm-day-state">{STATE_TEXT[state]}</span>
              </li>
            );
          })}
        </ol>
        <div className="dm-actions">
          {!day.active && (
            <button
              type="button"
              className="mk-btn mk-btn-primary mk-btn-sm"
              onClick={onStart}
              data-testid="run-day-start"
            >
              Run the day
            </button>
          )}
          {day.active && !finished && (
            <>
              <button
                type="button"
                className="mk-btn mk-btn-primary mk-btn-sm"
                onClick={onNext}
                disabled={!decidedHere}
                data-testid="run-day-next"
              >
                {decidedHere ? 'Next agent' : 'Decide to continue'}
              </button>
              <button
                type="button"
                className="mk-btn mk-btn-secondary mk-btn-sm"
                onClick={onSkip}
                data-testid="run-day-skip"
              >
                Skip this one
              </button>
            </>
          )}
          {day.active && (
            <button
              type="button"
              className="mk-btn mk-btn-secondary mk-btn-sm"
              onClick={onStop}
              data-testid="run-day-stop"
            >
              {finished ? 'Close' : 'Stop'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export interface DaySummaryProps {
  headline: string;
  view: DayView;
  plan: DayReportPlan | null;
  scenarios: Scenario[];
  progress: Record<string, Progress | undefined>;
  onResetAll: () => void;
}

export function DaySummaryPanel({ headline, view, plan, scenarios, progress, onResetAll }: DaySummaryProps) {
  return (
    <section className="dm-mock" aria-labelledby="day-title" data-testid="day-summary">
      <div className="dm-mock-bar">
        <h2 id="day-title" className="dm-mock-title">
          Today in the office
        </h2>
        <Simulated label="Sample" />
      </div>
      <div className="dm-panel-body">
        <p className="dm-muted" data-testid="day-headline">
          {headline}
        </p>
        <dl className="dm-day-stats" data-testid="day-stats">
          <div>
            <dt>Replies drafted</dt>
            <dd data-testid="stat-drafted">{view.counters.repliesDrafted}</dd>
          </div>
          <div>
            <dt>Conversations open</dt>
            <dd data-testid="stat-open">{view.counters.conversationsOpen}</dd>
          </div>
          <div>
            <dt>Waiting for you</dt>
            <dd data-testid="stat-waiting">{view.counters.waitingForYou}</dd>
          </div>
        </dl>
        <p className="dm-row-sub" data-testid="day-decided">
          {view.decided === 0
            ? 'You have not decided anything yet. Play an agent’s workflow to see this change.'
            : `You decided ${view.decided} of ${scenarios.length}: ${view.approved} approved, ${view.changed} changed, ${view.declined} declined.`}
        </p>
        {view.log.length > 0 && (
          <>
            <h3 className="dm-label">Activity log</h3>
            <ul className="dm-lines" data-testid="day-log">
              {view.log.map(l => (
                <li key={l.scenarioId}>
                  <span>
                    <Simulated /> <b>{l.agentName}</b> ({l.decision}): {l.text}
                  </span>
                  <span className="dm-row-when">{l.time}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {plan && <PrioritiesReport plan={plan} scenarios={scenarios} progress={progress} />}
        {view.decided > 0 && (
          <button
            type="button"
            className="mk-btn mk-btn-secondary mk-btn-sm"
            onClick={onResetAll}
            data-testid="day-reset"
          >
            Reset all workflows
          </button>
        )}
      </div>
    </section>
  );
}

function PrioritiesReport({
  plan,
  scenarios,
  progress,
}: {
  plan: DayReportPlan;
  scenarios: Scenario[];
  progress: Record<string, Progress | undefined>;
}) {
  return (
    <div className="dm-wf-report" data-testid="day-report">
      <h3 className="dm-label">
        {plan.title} <Simulated label="Sample" />
      </h3>
      <p className="dm-muted">{plan.intro}</p>
      <ol className="dm-wf-priorities">
        {scenarios.map(s => {
          const p = progress[s.id];
          const decided = p?.step === OUTCOME_STEP && p.decision;
          return (
            <li key={s.id} data-done={decided ? 'true' : 'false'}>
              <b>{s.agentName}</b>: {p && decided ? nextLine(s, p) : s.title}
              <span className="dm-row-when">
                {p?.decision && decided ? decisionLabel(s, p.decision) : 'Waiting for you'}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="dm-row-sub">{plan.closing}</p>
    </div>
  );
}

function nextLine(s: Scenario, p: Progress): string {
  if (p.decision?.kind === 'decline') return s.decline.next;
  return s.approve.next;
}
