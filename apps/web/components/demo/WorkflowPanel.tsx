'use client';

// One agent's workflow, played step by step: what triggered it, what the agent checked, what it drafted, the
// decision it needs from the visitor, and what happens next. Everything is sample content. Approving in the demo
// never sends, books or publishes anything, and the panel says so where the decision is made.
import { useEffect, useId, useRef } from 'react';
import {
  decisionLabel,
  draftBodyFor,
  outcomeFor,
  OUTCOME_STEP,
  REVIEW_STEP,
  START,
  STEP_LABELS,
  type FlowAction,
  type Progress,
  type Scenario,
} from '../../lib/lite/scenario-types';
import type { LiteAgent } from '../../lib/api-client';
import { AgentAvatar, Simulated } from './DemoBits';
import { LiteStatus } from './LiteBits';

export interface WorkflowPanelProps {
  scenario: Scenario | null;
  agent: LiteAgent | null;
  progress: Progress | undefined;
  onAction: (id: string, action: FlowAction) => void;
}

const NO_SEND = 'Approvals in this demo do not send anything.';

export function WorkflowPanel({ scenario, agent, progress, onAction }: WorkflowPanelProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const seen = useRef<string>('');
  const p = progress ?? START;
  const key = scenario ? `${scenario.id}:${p.step}` : '';

  // After the visitor moves to another step, focus its heading so keyboard and screen-reader users land on the new
  // content. The first render of a scenario is left alone so opening the panel never steals focus.
  useEffect(() => {
    const [id] = key.split(':');
    const last = seen.current.split(':')[0];
    if (key && seen.current && last === id && key !== seen.current) heading.current?.focus();
    seen.current = key;
  }, [key]);

  if (!scenario || !agent) {
    return (
      <section className="dm-mock" aria-labelledby="wf-empty" data-testid="workflow-panel" data-scenario="">
        <div className="dm-mock-bar">
          <h2 id="wf-empty" className="dm-mock-title">
            Workflow
          </h2>
        </div>
        <p className="dm-empty">
          Choose an agent to play their workflow: a sample task from start to finish. {NO_SEND}
        </p>
      </section>
    );
  }
  const act = (action: FlowAction) => onAction(scenario.id, action);
  return (
    <section
      className="dm-mock dm-wf"
      aria-labelledby="wf-title"
      data-testid="workflow-panel"
      data-scenario={scenario.id}
      data-step={p.step}
    >
      <div className="dm-mock-bar">
        <span className="dm-wf-who">
          <AgentAvatar name={agent.name} />
          <span className="dm-row-main">
            <h2 id="wf-title" className="dm-mock-title" data-testid="wf-title" tabIndex={-1}>
              {agent.name}: {scenario.title}
            </h2>
            <span className="dm-row-sub">
              {agent.role} · {scenario.time} in the sample day
            </span>
          </span>
        </span>
        <LiteStatus status={agent.status} testId="wf-status" />
      </div>
      <div className="dm-panel-body">
        <p className="dm-wf-note" data-testid="wf-note">
          <Simulated label="Sample" /> {NO_SEND}
        </p>
        <Stepper step={p.step} />
        <div className="dm-wf-step">
          <StepBody scenario={scenario} progress={p} headingRef={heading} act={act} />
        </div>
        <Controls scenario={scenario} progress={p} act={act} />
        <p className="sr-only" role="status" aria-live="polite" data-testid="wf-live">
          {`${scenario.agentName}: step ${p.step + 1} of ${STEP_LABELS.length}, ${STEP_LABELS[p.step]}.`}
          {p.step === OUTCOME_STEP && p.decision ? ` ${outcomeFor(scenario, p.decision).headline}` : ''}
        </p>
      </div>
    </section>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="dm-wf-steps" aria-label="Workflow steps" data-testid="wf-steps">
      {STEP_LABELS.map((label, i) => (
        <li
          key={label}
          className="dm-wf-dot"
          data-state={i < step ? 'done' : i === step ? 'current' : 'todo'}
          aria-current={i === step ? 'step' : undefined}
        >
          <span aria-hidden="true">{i + 1}</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

interface BodyProps {
  scenario: Scenario;
  progress: Progress;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  act: (a: FlowAction) => void;
}

function StepHeading({
  headingRef,
  children,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  children: React.ReactNode;
}) {
  return (
    <h3 className="dm-wf-h" tabIndex={-1} ref={headingRef} data-testid="wf-step-title">
      {children}
    </h3>
  );
}

function StepBody(props: BodyProps) {
  const { scenario: s, progress: p, headingRef } = props;
  if (p.step === 0) return <TriggerStep s={s} headingRef={headingRef} />;
  if (p.step === 1) return <ChecksStep s={s} headingRef={headingRef} />;
  if (p.step === 2) return <DraftStep s={s} headingRef={headingRef} />;
  if (p.step === REVIEW_STEP) return <ReviewStep {...props} />;
  return <OutcomeStep {...props} />;
}

function TriggerStep({ s, headingRef }: { s: Scenario; headingRef: BodyProps['headingRef'] }) {
  return (
    <>
      <StepHeading headingRef={headingRef}>1. Trigger</StepHeading>
      <p className="dm-row-sub">
        {s.trigger.source} <Simulated label="Sample" />
      </p>
      <p>
        <b>{s.trigger.headline}</b>
      </p>
      <blockquote className="dm-wf-quote">{s.trigger.detail}</blockquote>
      <p className="dm-muted">{s.summary}</p>
    </>
  );
}

function ChecksStep({ s, headingRef }: { s: Scenario; headingRef: BodyProps['headingRef'] }) {
  return (
    <>
      <StepHeading headingRef={headingRef}>2. What {s.agentName} checked</StepHeading>
      <ul className="dm-wf-checks">
        {s.checks.map(c => (
          <li key={c.label}>
            <b>{c.label}</b>
            <span>{c.finding}</span>
          </li>
        ))}
      </ul>
      {s.score && (
        <div className="dm-wf-score" data-testid="wf-score">
          <div className="dm-wf-score-top">
            <b>{s.score.label}</b>
            <span>
              {s.score.value} / {s.score.of}
            </span>
          </div>
          <div className="dm-wf-meter" role="img" aria-label={`${s.score.value} out of ${s.score.of}`}>
            <span style={{ width: `${Math.round((s.score.value / s.score.of) * 100)}%` }} />
          </div>
          <p className="dm-muted">{s.score.why}</p>
        </div>
      )}
    </>
  );
}

function Draft({ s, body }: { s: Scenario; body: string }) {
  return (
    <figure className="dm-wf-draft" data-testid="wf-draft">
      <figcaption>
        {s.draft.label} <Simulated label="Draft" />
        {s.draft.subject && <span className="dm-row-sub"> Subject: {s.draft.subject}</span>}
      </figcaption>
      <pre>{body}</pre>
    </figure>
  );
}

function DraftStep({ s, headingRef }: { s: Scenario; headingRef: BodyProps['headingRef'] }) {
  return (
    <>
      <StepHeading headingRef={headingRef}>3. What {s.agentName} drafted</StepHeading>
      <Draft s={s} body={s.draft.body} />
      <h4 className="dm-label">Why this draft</h4>
      <ul className="dm-wf-why">
        {s.draft.reasoning.map(r => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </>
  );
}

function ReviewStep({ scenario: s, headingRef, act }: BodyProps) {
  const group = useId();
  return (
    <>
      <StepHeading headingRef={headingRef}>
        4. Awaiting your review <span className="mk-status mk-status-wait">Needs you</span>
      </StepHeading>
      <Draft s={s} body={s.draft.body} />
      <p id={group}>
        <b>{s.decision.prompt}</b> <span className="dm-muted">{NO_SEND}</span>
      </p>
      <div className="dm-wf-decide" role="group" aria-labelledby={group} data-testid="wf-decide">
        <button
          type="button"
          className="mk-btn mk-btn-primary mk-btn-sm"
          onClick={() => act({ type: 'decide', decision: { kind: 'approve' } })}
          data-testid="wf-approve"
        >
          {s.decision.approve}
        </button>
        <button
          type="button"
          className="mk-btn mk-btn-secondary mk-btn-sm"
          onClick={() => act({ type: 'decide', decision: { kind: 'decline' } })}
          data-testid="wf-decline"
        >
          {s.decision.decline}
        </button>
      </div>
      <fieldset className="dm-wf-changes">
        <legend className="dm-label">Request a change</legend>
        <div className="dm-wf-decide">
          {s.decision.changes.map(c => (
            <button
              key={c.id}
              type="button"
              className="mk-btn mk-btn-secondary mk-btn-sm"
              onClick={() => act({ type: 'decide', decision: { kind: 'change', option: c.id } })}
              data-testid={`wf-change-${c.id}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function OutcomeStep({ scenario: s, progress: p, headingRef }: BodyProps) {
  if (!p.decision) return null;
  const out = outcomeFor(s, p.decision);
  return (
    <>
      <StepHeading headingRef={headingRef}>
        5. Outcome <span className="mk-tag">{decisionLabel(s, p.decision)}</span>
      </StepHeading>
      <p data-testid="wf-outcome">
        <b>{out.headline}</b>
      </p>
      {p.decision.kind !== 'decline' && <Draft s={s} body={draftBodyFor(s, p.decision)} />}
      <ul className="dm-lines dm-wf-result">
        <li>
          <span>Task done: {out.task}</span>
          <span className="dm-row-when">Done</span>
        </li>
        <li data-testid="wf-log">
          <span>
            <Simulated /> {out.log}
          </span>
        </li>
        <li>
          <span>Next: {out.next}</span>
        </li>
      </ul>
      <p className="dm-muted">The team list and the day summary now show this decision.</p>
    </>
  );
}

function Controls({
  scenario,
  progress: p,
  act,
}: {
  scenario: Scenario;
  progress: Progress;
  act: (a: FlowAction) => void;
}) {
  const canNext = p.step < REVIEW_STEP;
  return (
    <div className="dm-wf-controls">
      {p.step > 0 && p.step <= REVIEW_STEP && (
        <button
          type="button"
          className="mk-btn mk-btn-secondary mk-btn-sm"
          onClick={() => act({ type: 'back' })}
          data-testid="wf-back"
        >
          Back
        </button>
      )}
      {canNext && (
        <button
          type="button"
          className="mk-btn mk-btn-primary mk-btn-sm"
          onClick={() => act({ type: 'next' })}
          data-testid="wf-next"
        >
          Next: {STEP_LABELS[p.step + 1]}
        </button>
      )}
      {p.step < REVIEW_STEP - 1 && (
        <button
          type="button"
          className="mk-btn mk-btn-secondary mk-btn-sm"
          onClick={() => act({ type: 'to-review' })}
          data-testid="wf-skip"
        >
          Skip to review
        </button>
      )}
      {p.step > 0 && (
        <button
          type="button"
          className="mk-btn mk-btn-secondary mk-btn-sm"
          onClick={() => act({ type: 'reset' })}
          data-testid="wf-reset"
        >
          {p.step === OUTCOME_STEP ? 'Replay this workflow' : 'Start again'}
        </button>
      )}
      <span className="sr-only">{scenario.title}</span>
    </div>
  );
}
