'use client';

// A short guided tour over the demo office. It is a non-modal card (the page stays usable behind it): each step
// moves focus to its heading so screen readers read it, outlines the part of the page it talks about, and can be
// skipped with the Skip button or Escape. Progress is remembered per person in this browser (a convenience only), so
// the tour shows itself on the first visit, resumes where it was left, and stays away once finished or skipped.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import './demo.css';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** `data-tour` value of the element this step talks about. */
  target?: string;
}

export interface TourRecord {
  step: number;
  status: 'active' | 'done' | 'skipped';
}

const KEY_PREFIX = 'agentcity:demo-tour:v1:';

export function readTour(person: string): TourRecord | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + person);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<TourRecord>;
    if (typeof v.step !== 'number' || !['active', 'done', 'skipped'].includes(String(v.status))) return null;
    return { step: v.step, status: v.status as TourRecord['status'] };
  } catch {
    return null;
  }
}

function writeTour(person: string, record: TourRecord) {
  try {
    localStorage.setItem(KEY_PREFIX + person, JSON.stringify(record));
  } catch {
    // storage blocked: the tour just won't remember
  }
}

export interface GuidedTourProps {
  steps: TourStep[];
  /** Whose progress this is (the signed-in subject); progress is stored per person. */
  person: string;
  open: boolean;
  startAt: number;
  onStep?: (step: TourStep, index: number) => void;
  onClose: (how: 'done' | 'skipped') => void;
}

export function GuidedTour({ steps, person, open, startAt, onStep, onClose }: GuidedTourProps) {
  const uid = useId();
  const [index, setIndex] = useState(startAt);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = steps[Math.min(index, steps.length - 1)]!;
  const last = index >= steps.length - 1;

  useEffect(() => {
    if (open) setIndex(Math.min(Math.max(startAt, 0), steps.length - 1));
  }, [open, startAt, steps.length]);

  // Each step: remember it, tell the host (it may select an agent), outline the target, and move focus here.
  useEffect(() => {
    if (!open) return;
    writeTour(person, { step: index, status: 'active' });
    onStep?.(step, index);
    heading.current?.focus({ preventScroll: true });
    // The outline is pure CSS keyed on this attribute, so it survives the host re-rendering the target. Scrolling
    // waits a moment: onStep may have just put the target on the page.
    const root = document.documentElement;
    if (step.target) root.dataset.tourTarget = step.target;
    else delete root.dataset.tourTarget;
    const timer = setTimeout(() => {
      const target = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }, 120);
    return () => {
      clearTimeout(timer);
      delete root.dataset.tourTarget;
    };
    // Keyed on the step's id: the host's callback and step objects may be new on every render.
  }, [open, index, person, step.id]);

  const finish = useCallback(
    (how: 'done' | 'skipped') => {
      writeTour(person, { step: index, status: how });
      onClose(how);
    },
    [index, onClose, person],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish('skipped');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish]);

  if (!open) return null;
  return (
    <div
      className="dm-tour"
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${uid}-title`}
      aria-describedby={`${uid}-body`}
      data-testid="tour"
      data-step={step.id}
    >
      <div className="dm-tour-progress">
        <span data-testid="tour-progress">
          Step {index + 1} of {steps.length}
        </span>
        <span className="dm-tour-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.id} data-on={i <= index} />
          ))}
        </span>
      </div>
      <h2 id={`${uid}-title`} tabIndex={-1} ref={heading} data-testid="tour-title">
        {step.title}
      </h2>
      <p id={`${uid}-body`}>{step.body}</p>
      <div className="dm-tour-foot">
        <button type="button" className="dm-link-btn" onClick={() => finish('skipped')} data-testid="tour-skip">
          Skip tour
        </button>
        <span className="dm-actions">
          {index > 0 && (
            <button
              type="button"
              className="mk-btn mk-btn-secondary mk-btn-sm"
              onClick={() => setIndex(i => i - 1)}
              data-testid="tour-back"
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="mk-btn mk-btn-primary mk-btn-sm"
            onClick={() => (last ? finish('done') : setIndex(i => i + 1))}
            data-testid="tour-next"
          >
            {last ? 'Finish' : 'Next'}
          </button>
        </span>
      </div>
    </div>
  );
}
