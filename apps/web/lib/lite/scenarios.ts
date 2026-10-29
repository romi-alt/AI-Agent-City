import { createHash } from 'node:crypto';
import { seededRandom, type SimAgent, type SimOffice } from './office.ts';
import type { DayReportPlan, Scenario, ScenarioChange } from './scenario-types.ts';
import { SAMPLE_PEOPLE, SLOTS, VOCABS, type Vocab } from './scenario-vocab.ts';

// Workflow scenarios for the demo office: one realistic, role-specific story per agent that the visitor plays step by
// step (trigger, checks, draft, decision, outcome). They are generated from the lead id alone, so a visitor sees the
// same ones every time. Nothing here sends, books or publishes anything, and every text says so where it matters.

interface Ctx {
  v: Vocab;
  company: string;
  person: string;
  first: string;
  slot: string;
  agent: string;
}

type Core = Omit<Scenario, 'id' | 'agentId' | 'agentName' | 'role' | 'time' | 'simulated'>;
type Builder = (c: Ctx) => Core;

const NOT_SENT = 'Nothing was sent.';

const change = (id: string, label: string, effect: string, revised: string): ScenarioChange => ({
  id,
  label,
  effect,
  revised,
});

const numbered = (items: string[]): string => items.map((p, i) => `${i + 1}. ${p}`).join('\n');

function webLeads(c: Ctx): Core {
  const body = `Hi ${c.first},\n\nThanks for asking about ${c.v.offer}. Yes, we can help with that. The quickest next step is ${c.v.meetLong}, which I can pencil in for tomorrow at ${c.slot} if that suits you.\n\nWould that work, or is another time better?\n\n${c.company} team`;
  const other = SLOTS[(SLOTS.indexOf(c.slot) + 1) % SLOTS.length];
  return {
    title: 'New website enquiry',
    summary: 'Qualifies a new enquiry and drafts the first reply.',
    trigger: {
      source: `${c.v.channel} (sample)`,
      headline: `${c.person} submitted an enquiry`,
      detail: `"${c.v.enquiry}"`,
    },
    checks: [
      { label: 'Complete enough to answer', finding: 'Asks about one specific offer and gives a timeframe.' },
      { label: 'Already a customer or in a conversation?', finding: 'No earlier conversation in the sample records.' },
      {
        label: 'Buying signal',
        finding: 'Asks a practical question and offers to come in or talk, not just browsing.',
      },
      { label: 'Anything to hand to a person?', finding: 'No complaint, no unusual request.' },
    ],
    score: {
      value: 78,
      of: 100,
      label: 'Sample fit score',
      why: 'Named a specific offer, gave a timeframe and asked a practical question. An illustration of how the agent explains its ranking, not a prediction.',
    },
    draft: {
      kind: 'message',
      label: 'Draft reply',
      subject: `Your enquiry about ${c.v.offerShort}`,
      body,
      reasoning: [
        'Answers the question first, so the reply is useful even if they do not respond.',
        `Proposes one concrete next step (${c.v.meet}) instead of a list of options.`,
        'Offers a time but lets them choose another, so it does not feel like pressure.',
      ],
    },
    decision: {
      prompt: `Should ${c.agent} use this reply?`,
      approve: 'Approve reply',
      decline: 'Decline and handle it myself',
      changes: [
        change(
          'shorter',
          'Shorter',
          'shorter reply',
          `Hi ${c.first},\n\nYes, we can help with ${c.v.offerShort}. Would tomorrow at ${c.slot} suit you for ${c.v.meetLong}?\n\n${c.company} team`,
        ),
        change(
          'time',
          'Add a time',
          'two time options',
          `${body}\n\nIf tomorrow does not work, the day after at ${other} is also free.`,
        ),
        change(
          'warmer',
          'Warmer tone',
          'warmer tone',
          body.replace('Thanks for asking about', 'Lovely to hear from you, and thanks for asking about'),
        ),
      ],
    },
    approve: {
      headline: `Reply approved. A ${c.v.meet} is pencilled in for tomorrow at ${c.slot}.`,
      log: `SIMULATED: reply to ${c.person} recorded as approved and a call added to the sample diary. ${NOT_SENT} No calendar was touched.`,
      next: `Tomorrow ${c.slot}: ${c.v.meet} with ${c.person} (sample).`,
      task: `Replied to ${c.person}'s enquiry (simulated)`,
      drafted: 1,
      open: 1,
    },
    decline: {
      headline: 'Reply declined. The enquiry is parked on your own list.',
      log: `SIMULATED: the draft for ${c.person} was declined and the enquiry moved to "handle personally". ${NOT_SENT}`,
      next: `${c.agent} will not contact ${c.first} unless you ask.`,
      task: `Handed ${c.person}'s enquiry to you (simulated)`,
      drafted: 0,
      open: 1,
    },
  };
}

function chat(c: Ctx): Core {
  const body = `Thanks for your message. ${c.v.chatAnswer}. I have passed your question to the team so a person can confirm the details with you.`;
  return {
    title: 'After-hours chat question',
    summary: 'Answers what is approved and hands the rest to a person.',
    trigger: {
      source: 'Website chat, 21:40 (sample)',
      headline: 'A visitor asked a question after closing time',
      detail: `"${c.v.chat}"`,
    },
    checks: [
      {
        label: 'Covered by approved answers?',
        finding: 'Opening hours and the list of services are; confirming a booking is not.',
      },
      {
        label: 'Needs a person?',
        finding: 'Yes for the booking part. The agent may not confirm times or prices on its own.',
      },
      { label: 'Tone', finding: 'Friendly and short. The visitor is on a phone, in the evening.' },
    ],
    score: null,
    draft: {
      kind: 'message',
      label: 'Draft chat answer',
      subject: null,
      body,
      reasoning: [
        'Gives the part of the answer that is already approved.',
        'Says plainly that a person will confirm the rest, so no promise is made that the team has not agreed to.',
        'Leaves a note for the morning list with the question word for word.',
      ],
    },
    decision: {
      prompt: `Should ${c.agent} answer this way and pass it on?`,
      approve: 'Approve answer and hand-off',
      decline: 'Decline and leave it to the team',
      changes: [
        change('short', 'Shorter', 'shorter answer', `${c.v.chatAnswer}. A person will confirm the rest.`),
        change(
          'human',
          'Offer a person',
          'offers a person',
          `${body} If you would rather talk to someone, say so here and the team will pick it up.`,
        ),
      ],
    },
    approve: {
      headline: 'Answer approved and the conversation is on the morning list.',
      log: `SIMULATED: chat answer recorded as approved and the conversation added to the team's morning list. ${NOT_SENT}`,
      next: 'The team sees this question first thing, with the visitor’s words.',
      task: 'Answered an after-hours chat question (simulated)',
      drafted: 1,
      open: 1,
    },
    decline: {
      headline: 'Answer declined. The question waits for the team as it is.',
      log: `SIMULATED: the chat draft was declined; the question was left for the team. ${NOT_SENT}`,
      next: 'Nothing is answered automatically until you approve a wording.',
      task: 'Left a chat question for the team (simulated)',
      drafted: 0,
      open: 1,
    },
  };
}

function followUp(c: Ctx): Core {
  const body = `Hi ${c.first},\n\nJust checking in. Last time we spoke about ${c.v.quietAsk}. If it helps, I can go through it in ${c.v.meetLong}, or answer by message, whichever is easier.\n\nNo rush at all.\n\n${c.company} team`;
  return {
    title: 'An undecided buyer goes quiet',
    summary: 'Re-engages someone who has not replied, without chasing.',
    trigger: {
      source: 'Quiet-prospect check (sample)',
      headline: `${c.person} has not replied in nine days`,
      detail: `They ${c.v.quietReason}.`,
    },
    checks: [
      { label: 'Last contact', finding: 'Nine days ago, from our side. No reply and no opt-out.' },
      { label: 'What they cared about', finding: `Asked about ${c.v.quietAsk}.` },
      { label: 'Contacted too often?', finding: 'This would be the first follow-up. Rule: at most one note per week.' },
      { label: 'Right approach', finding: 'A short check-in that answers their open question, not a sales push.' },
    ],
    score: {
      value: 62,
      of: 100,
      label: 'Sample re-engagement fit',
      why: 'Interest was clear and the last open question is one we can answer. Worth one gentle note, not a series.',
    },
    draft: {
      kind: 'message',
      label: 'Draft follow-up',
      subject: 'Checking in',
      body,
      reasoning: [
        'Refers to their own question so it reads as help, not a mass note.',
        'Offers two easy ways to reply.',
        'Says there is no rush, which fits someone who may be comparing options.',
      ],
    },
    decision: {
      prompt: `Should ${c.agent} use this follow-up?`,
      approve: 'Approve follow-up',
      decline: 'Decline, park this prospect',
      changes: [
        change(
          'shorter',
          'Shorter',
          'shorter note',
          `Hi ${c.first}, still thinking about ${c.v.offerShort}? Happy to answer questions whenever suits you.\n\n${c.company} team`,
        ),
        change('time', 'Offer a time', 'adds a call time', `${body}\n\nTomorrow at ${c.slot} would work on our side.`),
        change(
          'softer',
          'Softer tone',
          'softer tone',
          body.replace('Just checking in.', 'Hope your week is going well.'),
        ),
      ],
    },
    approve: {
      headline: 'Follow-up approved. It is kept as a draft.',
      log: `SIMULATED: follow-up for ${c.person} recorded as approved. ${NOT_SENT}`,
      next: `If there is no reply, ${c.agent} will suggest one last note in a week, and you approve it first.`,
      task: `Followed up with ${c.person} (simulated)`,
      drafted: 1,
      open: 1,
    },
    decline: {
      headline: 'Follow-up declined. This prospect is parked.',
      log: `SIMULATED: the follow-up for ${c.person} was declined and the prospect parked. ${NOT_SENT}`,
      next: `${c.agent} will not contact ${c.first} again until you reopen the conversation.`,
      task: `Parked ${c.person}'s conversation (simulated)`,
      drafted: 0,
      open: 0,
    },
  };
}

function closer(c: Ctx): Core {
  const body = `Prepared for the decision call with ${c.person}\n\n${numbered(c.v.proposal)}\n\nOpen questions to settle on the call:\n- What would make them comfortable deciding this week?\n- Who else needs to agree?`;
  return {
    title: 'Appointment prep for a ready buyer',
    summary: 'Prepares the proposal outline and the decision call.',
    trigger: {
      source: 'Conversation signal (sample)',
      headline: `${c.person} asked what happens next`,
      detail: `They asked for written details of the ${c.v.offerShort} and possible dates.`,
    },
    checks: [
      { label: 'What has been agreed', finding: `The ${c.v.offerShort} and a rough timeframe. Nothing is signed.` },
      { label: 'What is still open', finding: 'Price confirmation, dates and who else decides.' },
      {
        label: 'Anything we must not promise',
        finding: 'No price, discount or outcome is promised in the outline. A person confirms those.',
      },
    ],
    score: null,
    draft: {
      kind: 'plan',
      label: 'Proposal outline and call plan',
      subject: null,
      body,
      reasoning: [
        'Lists only what the conversation already established.',
        'Keeps prices and terms out until you confirm them.',
        'Ends with the questions that usually decide the outcome, so the call stays short.',
      ],
    },
    decision: {
      prompt: `Should ${c.agent} book the decision call with this outline?`,
      approve: 'Approve outline and call',
      decline: 'Decline, I will prepare it',
      changes: [
        change(
          'short',
          'Shorter',
          'shorter outline',
          `Prepared for ${c.person}\n\n${numbered(c.v.proposal.slice(0, 2))}\n\nOne question: what would make them comfortable deciding?`,
        ),
        change(
          'compare',
          'Add a comparison',
          'adds a comparison',
          `${body}\n\nAlso prepare a short comparison of the two options they looked at.`,
        ),
        change(
          'call',
          'Add call agenda',
          'adds a call agenda',
          `${body}\n\nAgenda (20 minutes): needs, options, next step.`,
        ),
      ],
    },
    approve: {
      headline: `Outline approved. A decision call is pencilled in for tomorrow at ${c.slot}.`,
      log: `SIMULATED: outline for ${c.person} recorded as approved and a call added to the sample diary. ${NOT_SENT}`,
      next: `Tomorrow ${c.slot}: decision call with ${c.person} (sample).`,
      task: `Prepared the decision call for ${c.person} (simulated)`,
      drafted: 1,
      open: 1,
    },
    decline: {
      headline: 'Outline declined. You will prepare this one yourself.',
      log: `SIMULATED: the outline for ${c.person} was declined. ${NOT_SENT}`,
      next: `${c.agent} keeps the notes in case you want them back.`,
      task: `Handed ${c.person}'s decision call to you (simulated)`,
      drafted: 0,
      open: 1,
    },
  };
}

function csi(c: Ctx): Core {
  const body = `Hi ${c.first},\n\nThank you for choosing ${c.company}. You ${c.v.afterVisit}, so we would love to know how it went.\n\n1. How would you rate your experience, from 1 to 5?\n2. Is there anything we could have done better?\n\nJust reply here. Thank you!\n\n${c.company} team`;
  return {
    title: 'After-visit check-in',
    summary: 'Asks how it went and flags anything that needs a call.',
    trigger: {
      source: 'Visit completed (sample)',
      headline: `${c.person} ${c.v.afterVisit}`,
      detail: 'The check-in window for a satisfaction note has opened.',
    },
    checks: [
      { label: 'Visit really completed', finding: 'Marked complete in the sample records.' },
      { label: 'Open complaint?', finding: 'None on file, so a normal check-in is fine.' },
      { label: 'Contacted recently?', finding: 'No other message in the last 30 days.' },
      { label: 'Length', finding: 'Two questions only, so it takes under a minute to answer.' },
    ],
    score: null,
    draft: {
      kind: 'message',
      label: 'Draft check-in',
      subject: 'How did it go?',
      body,
      reasoning: [
        'Thanks them first, then asks two short questions.',
        'The rating is easy; the second question lets an unhappy customer say why.',
        'Any low rating or complaint is flagged to you for a call, not answered automatically.',
      ],
    },
    decision: {
      prompt: `Should ${c.agent} use this check-in?`,
      approve: 'Approve check-in',
      decline: 'Decline, skip this one',
      changes: [
        change(
          'one',
          'One question only',
          'one question',
          `Hi ${c.first},\n\nThank you for choosing ${c.company}. How would you rate your experience, from 1 to 5?\n\n${c.company} team`,
        ),
        change(
          'thanks',
          'More thanks',
          'warmer thanks',
          body.replace('Thank you for choosing', 'It was a pleasure to look after you. Thank you for choosing'),
        ),
        change(
          'shorter',
          'Shorter',
          'shorter note',
          `Hi ${c.first}, how did it go? A quick 1 to 5 and any comment is perfect.\n\n${c.company} team`,
        ),
      ],
    },
    approve: {
      headline: 'Check-in approved. Replies will be summarised for you.',
      log: `SIMULATED: check-in for ${c.person} recorded as approved. ${NOT_SENT}`,
      next: `${c.agent} will list low ratings in the daily summary so you can call them.`,
      task: `Check-in for ${c.person} (simulated)`,
      drafted: 1,
      open: 0,
    },
    decline: {
      headline: 'Check-in declined. This customer is skipped.',
      log: `SIMULATED: the check-in for ${c.person} was declined. ${NOT_SENT}`,
      next: `${c.agent} will not ask ${c.first} about this ${c.v.visitKind}.`,
      task: `Skipped a check-in for ${c.person} (simulated)`,
      drafted: 0,
      open: 0,
    },
  };
}

function serviceVisits(c: Ctx): Core {
  const body = `Hi ${c.first},\n\nA friendly reminder about your ${c.v.reminder}. If you need a different time, just reply and we will find one.\n\n${c.company} team`;
  return {
    title: 'Reminder and a gap to fill',
    summary: 'Reminds customers about visits and offers freed-up slots.',
    trigger: {
      source: 'Sample diary',
      headline: `${c.person} has a ${c.v.reminder}`,
      detail: `Also open in the diary: ${c.v.gap}.`,
    },
    checks: [
      { label: 'Details match the diary', finding: 'Date, time and place agree with the sample diary.' },
      { label: 'Preferred channel', finding: 'The sample record says message, not phone.' },
      {
        label: 'The gap',
        finding:
          'Two people on the sample waiting list could take it. The reminder goes first; the gap offer is a second draft.',
      },
    ],
    score: null,
    draft: {
      kind: 'message',
      label: 'Draft reminder',
      subject: 'Your upcoming booking',
      body,
      reasoning: [
        'States the booking in one line so it is easy to check.',
        'Makes changing the time as easy as replying.',
        'Keeps the gap offer separate, so one message never does two jobs.',
      ],
    },
    decision: {
      prompt: `Should ${c.agent} use this reminder?`,
      approve: 'Approve reminder',
      decline: 'Decline, skip the reminder',
      changes: [
        change(
          'short',
          'Shorter',
          'shorter reminder',
          `Hi ${c.first}, a reminder about your ${c.v.reminder}. Reply if you need to change it.`,
        ),
        change(
          'bring',
          'Add what to bring',
          'adds what to bring',
          `${body}\n\nPlease bring anything listed in your booking confirmation.`,
        ),
        change(
          'move',
          'Offer another time',
          'offers another time',
          `${body}\n\nThe next free time is tomorrow at ${c.slot}.`,
        ),
      ],
    },
    approve: {
      headline: 'Reminder approved. The open slot is offered to the waiting list next.',
      log: `SIMULATED: reminder for ${c.person} recorded as approved. ${NOT_SENT} The diary was not changed.`,
      next: `${c.agent} drafts an offer for ${c.v.gap}; it waits for your approval.`,
      task: `Reminder for ${c.person} (simulated)`,
      drafted: 1,
      open: 1,
    },
    decline: {
      headline: 'Reminder declined. No reminder is prepared for this booking.',
      log: `SIMULATED: the reminder for ${c.person} was declined. ${NOT_SENT}`,
      next: `${c.agent} leaves the booking as it is.`,
      task: `Skipped a reminder for ${c.person} (simulated)`,
      drafted: 0,
      open: 0,
    },
  };
}

function content(c: Ctx): Core {
  const [a, b, d] = c.v.posts;
  const caption = `${a}: a short, friendly look at the people behind ${c.company}. Questions welcome in the comments.`;
  const body = `Week plan for ${c.company} (sample)\n\nTue: ${a}\nThu: ${b}\nSat: ${d}\n\nCaption for Tuesday:\n${caption}`;
  return {
    title: 'Week plan and a caption to approve',
    summary: 'Plans the week’s posts and drafts the first caption.',
    trigger: {
      source: 'Monday planning (sample)',
      headline: 'The week’s content plan is due',
      detail: 'Last week’s posts are done; three slots are open for this week.',
    },
    checks: [
      {
        label: 'Themes from your notes',
        finding: 'People, practical tips and a news item, so the feed is not all promotion.',
      },
      { label: 'Calendar gaps', finding: 'Tuesday, Thursday and Saturday are free.' },
      { label: 'Claims check', finding: 'No prices, discounts, results or customer quotes in the draft captions.' },
    ],
    score: null,
    draft: {
      kind: 'plan',
      label: 'Week plan and first caption',
      subject: null,
      body,
      reasoning: [
        'Mixes people, a useful tip and a news item.',
        'The first caption invites a question instead of pushing a sale.',
        'Nothing is published. Approving the plan only marks these as ready for the next step.',
      ],
    },
    decision: {
      prompt: `Should ${c.agent} go ahead with this plan?`,
      approve: 'Approve plan and caption',
      decline: 'Decline, I will plan it',
      changes: [
        change('short', 'Shorter caption', 'shorter caption', body.replace(caption, `${a}. Say hello below!`)),
        change('warm', 'Warmer tone', 'warmer tone', body.replace('a short, friendly look at', 'a warm hello from')),
        change(
          'question',
          'End with a question',
          'ends with a question',
          `${body}\n\nWhat would you like to see next week?`,
        ),
      ],
    },
    approve: {
      headline: 'Plan approved. The posts stay as drafts; nothing is published.',
      log: `SIMULATED: week plan and first caption recorded as approved. ${NOT_SENT} Nothing was published.`,
      next: `${c.agent} prepares pictures and the other two captions for your review.`,
      task: 'Planned the week’s posts (simulated)',
      drafted: 3,
      open: 0,
    },
    decline: {
      headline: 'Plan declined. The three slots stay open.',
      log: `SIMULATED: the week plan was declined. ${NOT_SENT} Nothing was published.`,
      next: `${c.agent} waits for your own plan.`,
      task: 'Left the week’s plan to you (simulated)',
      drafted: 0,
      open: 0,
    },
  };
}

function reviews(c: Ctx): Core {
  const body = `Hi, thank you for telling us about this, and we are sorry the experience fell short. We would like to understand what happened. Please contact ${c.company} directly and a manager will look into it.`;
  return {
    title: 'A critical review and a happy one',
    summary: 'Thanks happy customers and answers critical reviews carefully.',
    trigger: {
      source: 'Review monitor (sample)',
      headline: 'Two new reviews arrived',
      detail: `Positive: "${c.v.praise}"  Critical: "${c.v.critical}"`,
    },
    checks: [
      { label: 'Positive review', finding: 'Specific and kind. A short thank-you fits.' },
      {
        label: 'Critical review',
        finding: 'Names one concrete problem. It needs a calm, non-defensive answer and a person to follow up.',
      },
      {
        label: 'What the reply must not do',
        finding: 'Promise compensation, blame the customer or argue the facts in public.',
      },
    ],
    score: null,
    draft: {
      kind: 'message',
      label: 'Draft reply to the critical review',
      subject: null,
      body,
      reasoning: [
        'Acknowledges the problem without arguing about it in public.',
        'Moves the conversation to a direct line, where a manager can look at the details.',
        'Promises nothing the business has not agreed to.',
      ],
    },
    decision: {
      prompt: `Should ${c.agent} use this reply?`,
      approve: 'Approve reply',
      decline: 'Decline, I will reply',
      changes: [
        change(
          'short',
          'Shorter',
          'shorter reply',
          `Thank you for the feedback, and sorry about this. Please contact ${c.company} directly so a manager can look into it.`,
        ),
        change(
          'call',
          'Offer a call',
          'offers a call',
          `${body} We are happy to arrange a call at a time that suits you.`,
        ),
        change(
          'plain',
          'Plainer wording',
          'plainer wording',
          body.replace('we are sorry the experience fell short', 'we are sorry about this'),
        ),
      ],
    },
    approve: {
      headline: 'Reply approved. A manager call-back task is created.',
      log: `SIMULATED: review replies recorded as approved and a call-back task added. ${NOT_SENT} Nothing was posted.`,
      next: `${c.agent} lists the manager call-back in the daily priorities.`,
      task: 'Replied to two reviews (simulated)',
      drafted: 2,
      open: 1,
    },
    decline: {
      headline: 'Reply declined. You will answer the review yourself.',
      log: `SIMULATED: the review reply was declined. ${NOT_SENT} Nothing was posted.`,
      next: `${c.agent} keeps the review at the top of your list.`,
      task: 'Left a review reply to you (simulated)',
      drafted: 0,
      open: 1,
    },
  };
}

const BUILDERS: Record<string, { time: string; build: Builder }> = {
  chat: { time: '07:30', build: chat },
  'web leads': { time: '08:15', build: webLeads },
  'follow-up': { time: '09:30', build: followUp },
  closer: { time: '11:00', build: closer },
  'service visits': { time: '13:00', build: serviceVisits },
  CSI: { time: '15:00', build: csi },
  content: { time: '16:00', build: content },
  reviews: { time: '17:00', build: reviews },
};

export interface SimScenarioPack {
  sector: string;
  scenarios: Scenario[];
  dayReport: DayReportPlan;
}

const stableId = (leadId: string, label: string): string =>
  createHash('sha256').update(`${leadId}:scenario:${label}`).digest('hex').slice(0, 24);

function contextFor(rnd: () => number, v: Vocab, company: string, index: number, agent: SimAgent, offset: number): Ctx {
  const person = SAMPLE_PEOPLE[(offset + index) % SAMPLE_PEOPLE.length]!;
  return {
    v,
    company,
    person,
    first: person.replace(/^Sample\s+/, '').split(' ')[0] ?? 'there',
    slot: SLOTS[Math.floor(rnd() * SLOTS.length)]!,
    agent: agent.name,
  };
}

/** The scenario pack for an office. Deterministic: the same lead id always gives the same pack. */
export function buildScenarioPack(leadId: string, office: Pick<SimOffice, 'agents' | 'company'>): SimScenarioPack {
  const rnd = seededRandom(`${leadId}:scenarios`);
  const v = VOCABS[Math.floor(rnd() * VOCABS.length)]!;
  const offset = Math.floor(rnd() * SAMPLE_PEOPLE.length);
  const scenarios: Scenario[] = [];
  office.agents.forEach((agent, i) => {
    const entry = BUILDERS[agent.role];
    if (!entry) return;
    const core = entry.build(contextFor(rnd, v, office.company, i, agent, offset));
    scenarios.push({
      ...core,
      id: stableId(leadId, agent.role),
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      time: entry.time,
      simulated: true,
    });
  });
  scenarios.sort((a, b) => a.time.localeCompare(b.time));
  return {
    sector: v.label,
    scenarios,
    dayReport: {
      title: 'Daily priorities report (sample)',
      intro: `Here is where ${office.company}'s sample day stands, ordered by when each agent needs you. It is built from the decisions you made in this demo.`,
      closing: 'All items above are examples. Approving one in this demo never sends, books or publishes anything.',
      simulated: true,
    },
  };
}

/** The office with its scenarios added; existing fields are untouched so older clients keep working. */
export function withScenarios(leadId: string, office: SimOffice): SimOffice & SimScenarioPack {
  return { ...office, ...buildScenarioPack(leadId, office) };
}
