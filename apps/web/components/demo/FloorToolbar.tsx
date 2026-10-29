'use client';

// The office view controls: the whole furnished floor or one agent's desk, the day, full screen, and (in full screen)
// the panes that replace the page's side column. Plain buttons, so every control works from the keyboard.
import type { RefObject } from 'react';

export type Pane = 'team' | 'workflow' | 'day' | null;

export interface FloorToolbarProps {
  wholeFloor: boolean;
  viewLabel: string;
  immersive: boolean;
  pane: Pane;
  dayActive: boolean;
  fullscreenRef: RefObject<HTMLButtonElement | null>;
  onWhole: () => void;
  onStep: (delta: 1 | -1) => void;
  onFullscreen: () => void;
  onRunDay: () => void;
  onPane: (p: Pane) => void;
  onHelp: () => void;
}

function Btn(props: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  expanded?: boolean;
  testId: string;
  primary?: boolean;
  btnRef?: RefObject<HTMLButtonElement | null>;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`mk-btn ${props.primary ? 'mk-btn-primary' : 'mk-btn-secondary'} mk-btn-sm`}
      onClick={props.onClick}
      aria-pressed={props.pressed}
      aria-expanded={props.expanded}
      data-testid={props.testId}
      ref={props.btnRef}
      title={props.title}
    >
      {props.label}
    </button>
  );
}

export function FloorToolbar(p: FloorToolbarProps) {
  const toggle = (which: Exclude<Pane, null>) => p.onPane(p.pane === which ? null : which);
  return (
    <div className="dm-lite-toolbar" role="toolbar" aria-label="Office view" data-testid="floor-toolbar">
      <div className="dm-tb-group" role="group" aria-label="Floor and desks">
        <Btn
          label="Whole floor"
          onClick={p.onWhole}
          pressed={p.wholeFloor}
          testId="whole-floor"
          primary
          title="See every desk and agent on the floor at once"
        />
        <Btn label="‹ Desk" onClick={() => p.onStep(-1)} testId="desk-prev" title="Previous agent's desk" />
        <span className="dm-tb-desk" data-testid="desk-label" aria-live="polite">
          {p.viewLabel}
        </span>
        <Btn label="Desk ›" onClick={() => p.onStep(1)} testId="desk-next" title="Next agent's desk" />
      </div>
      <div className="dm-tb-group" role="group" aria-label="Day and screen">
        <Btn label={p.dayActive ? 'Day running' : 'Run the day'} onClick={p.onRunDay} testId="toolbar-run-day" />
        <Btn
          label={p.immersive ? 'Exit full screen' : 'Enter full screen'}
          onClick={p.onFullscreen}
          pressed={p.immersive}
          testId="fullscreen-toggle"
          btnRef={p.fullscreenRef}
        />
      </div>
      {p.immersive && (
        <div className="dm-tb-group" role="group" aria-label="Panels">
          <Btn label="Team" onClick={() => toggle('team')} expanded={p.pane === 'team'} testId="pane-team" />
          <Btn
            label="Workflow"
            onClick={() => toggle('workflow')}
            expanded={p.pane === 'workflow'}
            testId="pane-workflow"
          />
          <Btn label="Day" onClick={() => toggle('day')} expanded={p.pane === 'day'} testId="pane-day" />
          <Btn label="Help" onClick={p.onHelp} testId="immersive-help" title="Replay the tour" />
        </div>
      )}
    </div>
  );
}
