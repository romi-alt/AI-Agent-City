// Present mode (/city?present=1): a guided pitch through the public city, one caption per stop. The words come from
// the landing page (How it works, Product, Security, Get a demo), so the pitch never claims more than the page does.
// Plain data and pure helpers, so the steps can be tested without a browser.

export type PresentView =
  { kind: 'explore' } | { kind: 'building'; building: string } | { kind: 'floor'; building: string; level: number };

export interface PresentStep {
  tag: string;
  title: string;
  line: string;
  view: PresentView;
}

export const PRESENT_STEPS: readonly PresentStep[] = [
  {
    tag: 'AgentCity',
    title: 'Your business. Your AI team. One clear view.',
    line: 'A place for your business and a role for every agent. Activity in this sample city is simulated.',
    view: { kind: 'explore' },
  },
  {
    tag: 'How it works · 01',
    title: 'Your business has a building.',
    line: 'Bring your teams into a shared visual workspace, with a clear place for each part of the business.',
    view: { kind: 'building', building: 'fast-sales' },
  },
  {
    tag: 'How it works · 02',
    title: 'Each department has a floor.',
    line: 'Organize sales, marketing, customer care and training around the work they need to do.',
    view: { kind: 'floor', building: 'audi', level: 11 },
  },
  {
    tag: 'How it works · 03',
    title: 'Every agent has a desk.',
    line: 'Inspect responsibilities, review prepared work and find the decisions waiting for your input.',
    view: { kind: 'floor', building: 'fast-sales', level: 12 },
  },
  {
    tag: 'Meet your AI team',
    title: 'Clear roles. Shared priorities.',
    line: 'Sales conversations, follow-up, content, customer care and partnerships, with Max bringing the priorities together.',
    view: { kind: 'building', building: 'audi' },
  },
  {
    tag: 'You stay in control',
    title: 'Your team prepares. You make the call.',
    line: 'Review the draft, understand the context and decide what happens next. Demo approvals send nothing.',
    view: { kind: 'building', building: 'honda' },
  },
  {
    tag: 'Start with a free demo',
    title: 'Step inside your future workspace.',
    line: 'Meet the AI personas, explore their desks and review sample tasks. No card required.',
    view: { kind: 'explore' },
  },
];

/** The step at index i, wrapping both ways, so Next on the last step returns to the first and Prev the other way. */
export function stepIndex(i: number, count = PRESENT_STEPS.length): number {
  return ((i % count) + count) % count;
}

/** The building a step calls out in the city, if any. */
export function stepBuilding(step: PresentStep): string | null {
  return step.view.kind === 'explore' ? null : step.view.building;
}
