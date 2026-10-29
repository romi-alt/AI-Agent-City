'use client';

// The visitor's place in each workflow, kept in this tab's sessionStorage so a reload keeps their progress. Only
// scenario ids (opaque hashes) and step numbers are stored: no names, no text, nothing personal, and never in
// localStorage, so closing the tab clears it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  advance,
  isValidProgress,
  START,
  type Decision,
  type FlowAction,
  type Progress,
  type Scenario,
} from '../../lib/lite/scenario-types';

const KEY = 'agentcity:demo-scenarios:v1';

export interface DayRun {
  active: boolean;
  /** Position in the day's order of the scenario the visitor is on. */
  index: number;
  /** Scenario ids the visitor chose to skip while running the day. */
  skipped: string[];
}

export const DAY_IDLE: DayRun = { active: false, index: 0, skipped: [] };

interface Stored {
  progress: Record<string, Progress>;
  day: DayRun;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function readDecision(v: unknown): Decision | null {
  if (!isObj(v)) return null;
  if (v.kind === 'approve' || v.kind === 'decline') return { kind: v.kind };
  if (v.kind === 'change' && typeof v.option === 'string') return { kind: 'change', option: v.option };
  return null;
}

function readProgress(v: unknown, s: Scenario): Progress | null {
  if (!isObj(v) || typeof v.step !== 'number') return null;
  const p: Progress = { step: v.step, decision: readDecision(v.decision) };
  return isValidProgress(p, s) ? p : null;
}

function readDay(v: unknown, ids: Set<string>, count: number): DayRun {
  if (!isObj(v)) return DAY_IDLE;
  const index = typeof v.index === 'number' && v.index >= 0 && v.index <= count ? Math.floor(v.index) : 0;
  const skipped = Array.isArray(v.skipped)
    ? v.skipped.filter((x): x is string => typeof x === 'string' && ids.has(x))
    : [];
  return { active: v.active === true, index, skipped };
}

/** What the tab remembers, checked against today's scenarios: anything that does not fit is forgotten. */
export function loadStored(scenarios: Scenario[]): Stored {
  const empty: Stored = { progress: {}, day: DAY_IDLE };
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return empty;
    const data: unknown = JSON.parse(raw);
    if (!isObj(data) || !isObj(data.progress)) return empty;
    const progress: Record<string, Progress> = {};
    for (const s of scenarios) {
      const p = readProgress(data.progress[s.id], s);
      if (p) progress[s.id] = p;
    }
    return { progress, day: readDay(data.day, new Set(scenarios.map(s => s.id)), scenarios.length) };
  } catch {
    return empty;
  }
}

function save(stored: Stored) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // storage blocked: progress just lasts until the page is reloaded
  }
}

export function useScenarios(scenarios: Scenario[]) {
  const [stored, setStored] = useState<Stored>(() => loadStored(scenarios));
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    save(stored);
  }, [stored]);

  const byId = useMemo(() => new Map(scenarios.map(s => [s.id, s])), [scenarios]);

  const act = useCallback(
    (id: string, action: FlowAction) => {
      const s = byId.get(id);
      if (!s) return;
      setStored(prev => {
        const cur = prev.progress[id] ?? START;
        const next = advance(cur, action, s);
        if (next === cur) return prev;
        return { ...prev, progress: { ...prev.progress, [id]: next } };
      });
    },
    [byId],
  );

  const setDay = useCallback((day: DayRun) => setStored(prev => ({ ...prev, day })), []);
  const resetAll = useCallback(() => setStored({ progress: {}, day: DAY_IDLE }), []);

  return { progress: stored.progress, day: stored.day, act, setDay, resetAll };
}
