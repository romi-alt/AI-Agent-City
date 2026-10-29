// How the visitor's decisions show up around the page: the team's status chips and the 3D status rings, the agent's
// "right now" line and its task list. Pure, so the same function feeds every panel.
import type { LiteAgent, LiteTask } from '../../lib/api-client';
import {
  OUTCOME_STEP,
  outcomeFor,
  REVIEW_STEP,
  statusFor,
  type Progress,
  type Scenario,
} from '../../lib/lite/scenario-types';

export function effectiveAgents(
  agents: LiteAgent[],
  scenarios: Scenario[],
  progress: Record<string, Progress | undefined>,
): LiteAgent[] {
  const byAgent = new Map(scenarios.map(s => [s.agentId, s]));
  return agents.map(a => {
    const s = byAgent.get(a.id);
    const p = s ? progress[s.id] : undefined;
    if (!s || !p) return a;
    const status = statusFor(a.status, p, s);
    if (p.step === REVIEW_STEP) return { ...a, status, currentTask: `Awaiting your review: ${s.title}` };
    if (p.step === OUTCOME_STEP && p.decision) return { ...a, status, currentTask: outcomeFor(s, p.decision).next };
    return { ...a, status };
  });
}

export function effectiveTasks(
  tasks: LiteTask[],
  scenarios: Scenario[],
  progress: Record<string, Progress | undefined>,
): LiteTask[] {
  const done: LiteTask[] = [];
  for (const s of scenarios) {
    const p = progress[s.id];
    if (p?.step === OUTCOME_STEP && p.decision) {
      done.push({ id: `${s.id}-done`, agentId: s.agentId, title: outcomeFor(s, p.decision).task, status: 'done' });
    }
  }
  return [...done, ...tasks];
}

/** The same sentence the server writes, from the statuses the visitor's decisions leave. */
export function dayHeadline(company: string, agents: LiteAgent[]): string {
  const busy = agents.filter(a => a.status !== 'idle').length;
  const waiting = agents.filter(a => a.status === 'needs-you').length;
  return `${busy} of ${agents.length} agents are busy for ${company || 'your business'} today; ${waiting} would like your approval.`;
}
