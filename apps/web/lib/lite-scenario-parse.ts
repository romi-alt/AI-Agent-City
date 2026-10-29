// Reads the scenarios in the office response. The server is ours, but a half-written or older answer must never break
// the page: anything that does not have the expected shape is dropped, and the office simply has fewer workflows.
import type { DayCounters, DayReportPlan, Scenario, ScenarioChange, ScenarioOutcome } from './lite/scenario-types';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(str);

function isOutcome(v: unknown): v is ScenarioOutcome {
  return isRec(v) && str(v.headline) && str(v.log) && str(v.next) && str(v.task) && num(v.drafted) && num(v.open);
}

function isChange(v: unknown): v is ScenarioChange {
  return isRec(v) && str(v.id) && str(v.label) && str(v.effect) && str(v.revised);
}

function isCheck(v: unknown): boolean {
  return isRec(v) && str(v.label) && str(v.finding);
}

function headOk(r: Rec): boolean {
  return (
    str(r.id) && str(r.agentId) && str(r.agentName) && str(r.role) && str(r.time) && str(r.title) && str(r.summary)
  );
}

function bodyOk(r: Rec): boolean {
  const t = r.trigger;
  const d = r.draft;
  const dc = r.decision;
  if (!isRec(t) || !isRec(d) || !isRec(dc)) return false;
  return (
    str(t.source) &&
    str(t.headline) &&
    str(t.detail) &&
    Array.isArray(r.checks) &&
    r.checks.every(isCheck) &&
    ['message', 'plan', 'report'].includes(String(d.kind)) &&
    str(d.label) &&
    str(d.body) &&
    strings(d.reasoning) &&
    (d.subject === null || str(d.subject)) &&
    str(dc.prompt) &&
    str(dc.approve) &&
    str(dc.decline) &&
    Array.isArray(dc.changes) &&
    dc.changes.every(isChange)
  );
}

function scoreOk(v: unknown): boolean {
  return v === null || (isRec(v) && num(v.value) && num(v.of) && str(v.label) && str(v.why));
}

export function parseScenario(v: unknown): Scenario | null {
  if (!isRec(v) || !headOk(v) || !bodyOk(v) || !scoreOk(v.score)) return null;
  if (!isOutcome(v.approve) || !isOutcome(v.decline)) return null;
  return v as unknown as Scenario;
}

export function parseScenarios(v: unknown): Scenario[] {
  return Array.isArray(v) ? v.map(parseScenario).filter((s): s is Scenario => s !== null) : [];
}

export function parseDayReport(v: unknown): DayReportPlan | null {
  if (!isRec(v) || !str(v.title) || !str(v.intro) || !str(v.closing)) return null;
  return { title: v.title, intro: v.intro, closing: v.closing, simulated: true };
}

export function parseCounters(v: unknown): DayCounters | null {
  if (!isRec(v) || !num(v.repliesDrafted) || !num(v.conversationsOpen) || !num(v.waitingForYou)) return null;
  return { repliesDrafted: v.repliesDrafted, conversationsOpen: v.conversationsOpen, waitingForYou: v.waitingForYou };
}
