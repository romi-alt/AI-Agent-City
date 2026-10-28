import { createHash } from 'node:crypto';

// The simulated demo office. Everything here is generated from the lead id, so a visitor sees the same team, tasks
// and numbers every time, and two visitors see different ones. Every item says it is simulated; nothing here
// contacts anyone, and no real customer data is involved.

export type AgentStatus = 'working' | 'idle' | 'needs-you';

export interface SimAgent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  currentTask: string;
  summary: string;
  lastUpdated: string;
  simulated: true;
}

export interface SimTask {
  id: string;
  agentId: string;
  title: string;
  status: 'done' | 'in-progress' | 'needs-you';
  at: string;
  simulated: true;
}

export interface SimOffice {
  simulated: true;
  notice: string;
  company: string;
  agents: SimAgent[];
  tasks: SimTask[];
  daySummary: {
    headline: string;
    repliesDrafted: number;
    conversationsOpen: number;
    waitingForYou: number;
    simulated: true;
  };
}

interface Persona {
  name: string;
  role: string;
  summary: (company: string) => string;
  tasks: [string, string, string];
}

const ROSTER: Persona[] = [
  {
    name: 'Wren',
    role: 'web leads',
    summary: c => `Replies to ${c}'s website enquiries within minutes and books the first call.`,
    tasks: [
      'Replied to a new website enquiry from Sample Jordan Lee',
      'Qualified two enquiries from last night',
      'Booked a call for tomorrow 10:00',
    ],
  },
  {
    name: 'Nora',
    role: 'chat',
    summary: () => 'Answers chat questions day and night and hands warm conversations to the team.',
    tasks: ['Answered 6 chat questions', 'Handed one hot lead to Vera', 'Updated the opening-hours answer'],
  },
  {
    name: 'Kai',
    role: 'follow-up',
    summary: () => 'Follows up with quiet prospects so nobody is forgotten.',
    tasks: [
      'Drafted follow-ups for 4 quiet prospects',
      'Waiting for your approval on 2 drafts',
      'Closed one stale conversation',
    ],
  },
  {
    name: 'Vera',
    role: 'closer',
    summary: () => 'Prepares proposals and next steps for prospects who are ready to decide.',
    tasks: [
      'Prepared a proposal outline for Sample Sam Rivera',
      'Listed open questions before signing',
      'Scheduled a decision call',
    ],
  },
  {
    name: 'Hana',
    role: 'CSI',
    summary: () => 'Checks in after every visit and turns feedback into improvements.',
    tasks: [
      'Drafted 3 satisfaction check-ins (simulated)',
      "Summarised this week's feedback",
      'Flagged one unhappy customer for a call',
    ],
  },
  {
    name: 'Dex',
    role: 'service visits',
    summary: () => 'Reminds customers about upcoming visits and fills empty slots.',
    tasks: ["Drafted reminders for next week's visits", 'Filled a cancelled slot', 'Updated the visit calendar'],
  },
  {
    name: 'Luna',
    role: 'content',
    summary: c => `Plans and drafts social posts for ${c}; nothing is published without your approval.`,
    tasks: [
      'Drafted 3 posts for next week',
      'Suggested a customer-story idea',
      'Waiting for your approval before anything goes live',
    ],
  },
  {
    name: 'Rio',
    role: 'reviews',
    summary: () => 'Thanks happy customers for reviews and drafts careful replies to critical ones.',
    tasks: [
      'Drafted replies to 2 new reviews',
      'Listed 3 happy customers to ask for a review (simulated)',
      'Reported the weekly rating trend',
    ],
  },
];

/** A small seeded generator (mulberry32) so the same lead always gets the same office. */
export function seededRandom(seed: string): () => number {
  let a = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stableId = (leadId: string, label: string): string => {
  const h = createHash('sha256').update(`${leadId}:${label}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const minutesAgo = (now: Date, mins: number): string => new Date(now.getTime() - mins * 60_000).toISOString();

export function buildOffice(leadId: string, company: string, now: Date): SimOffice {
  const rnd = seededRandom(leadId);
  const agents: SimAgent[] = [];
  const tasks: SimTask[] = [];
  ROSTER.forEach((p, i) => {
    const agentId = stableId(leadId, `agent-${i}`);
    const roll = rnd();
    const status: AgentStatus = roll < 0.55 ? 'working' : roll < 0.8 ? 'needs-you' : 'idle';
    const updated = 3 + Math.floor(rnd() * 90);
    const current =
      status === 'idle'
        ? 'Waiting for the next enquiry'
        : status === 'needs-you'
          ? p.tasks[2]
          : p.tasks[Math.floor(rnd() * 3)]!;
    agents.push({
      id: agentId,
      name: p.name,
      role: p.role,
      status,
      currentTask: current,
      summary: p.summary(company),
      lastUpdated: minutesAgo(now, updated),
      simulated: true,
    });
    p.tasks.forEach((title, n) => {
      const open = n === 2 && status !== 'idle';
      tasks.push({
        id: stableId(leadId, `task-${i}-${n}`),
        agentId,
        title,
        status: open ? (status === 'needs-you' ? 'needs-you' : 'in-progress') : 'done',
        at: minutesAgo(now, updated + (3 - n) * 47 + Math.floor(rnd() * 20)),
        simulated: true,
      });
    });
  });
  const waiting = agents.filter(a => a.status === 'needs-you').length;
  const open = agents.filter(a => a.status !== 'idle').length;
  return {
    simulated: true,
    notice: 'This is a simulated demo office. The team, tasks and messages are examples; nothing is sent to anyone.',
    company,
    agents,
    tasks: tasks.sort((a, b) => b.at.localeCompare(a.at)),
    daySummary: {
      headline: `${open} of ${agents.length} agents are busy for ${company} today; ${waiting} would like your approval.`,
      repliesDrafted: 9 + Math.floor(rnd() * 14),
      conversationsOpen: 4 + Math.floor(rnd() * 9),
      waitingForYou: waiting,
      simulated: true,
    },
  };
}
