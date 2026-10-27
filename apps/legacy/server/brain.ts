import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Sim } from '../src/core/sim';
import type { Building, ContentItem, Lead, Message } from '../src/core/types';
import type { OutboundGate } from './outbound';

/**
 * Optional AI drafting with Claude. When enabled (Settings → AI drafts, plus credentials in the environment),
 * agents' social posts and messages to real leads are written by Claude instead of the built-in templates.
 * Everything Claude writes still goes through the same approval step before it is published or sent.
 * Every request first asks the outbound gate (outbound.ts): in demo mode, or with the kill switch off,
 * Claude is never called and the template draft stays.
 */
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-5-5';
const PER_HOUR = Number(process.env.AI_DRAFTS_PER_HOUR ?? 60);

const configured = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
const client = configured ? new Anthropic() : undefined;

/** Sends one drafting request. Injected so tests can count calls with a fake. */
export type DraftCall = <T>(schema: z.ZodType<T>, prompt: string) => Promise<T | undefined>;

const PostDraft = z.object({
  hook: z.string().describe('Scroll-stopping first line'),
  caption: z.string().describe('Full caption, platform appropriate, no hashtags'),
  cta: z.string().describe('One call to action'),
  hashtags: z.array(z.string()).describe('3-6 hashtags, each starting with #'),
});
const MessageDraft = z.object({
  subject: z.string().describe('Email subject line; empty string for texts and calls'),
  body: z.string().describe('The message body or call script'),
});

let used: number[] = [];
let running = 0;
const queue: (() => Promise<void>)[] = [];

export function brainStatus() {
  return { configured, model: MODEL, perHour: PER_HOUR, usedLastHour: used.filter(t => t > Date.now() - 3600_000).length };
}

function schedule(gate: OutboundGate, job: () => Promise<void>) {
  // Ask the gate before spending budget: a refused draft never reaches the queue.
  if (!gate.check('llm').ok) return;
  used = used.filter(t => t > Date.now() - 3600_000);
  if (used.length >= PER_HOUR || queue.length > 20) return; // over budget: the template draft stays
  used.push(Date.now());
  queue.push(job);
  pump();
}

function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift()!;
    running++;
    job().catch(logError).finally(() => { running--; pump(); });
  }
}

function logError(e: unknown) {
  if (e instanceof Anthropic.RateLimitError) console.warn('[brain] rate limited, keeping template drafts for now');
  else if (e instanceof Anthropic.AuthenticationError) console.warn('[brain] Claude credentials were rejected – check ANTHROPIC_API_KEY');
  else if (e instanceof Anthropic.APIError) console.warn(`[brain] API error ${e.status}: ${e.message}`);
  else console.warn('[brain]', e);
}

const SYSTEM = `You write for Fast Sales, a car-sales training company, and for the car dealerships in its virtual city.
Write like a friendly, professional local salesperson: short, specific, no hype words, no made-up prices, discounts or inventory claims.
Never promise anything the business hasn't stated. Plain text only.`;

const ask: DraftCall = async (schema, prompt) => {
  if (!client) return;
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });
  if (res.stop_reason === 'refusal') return;
  return res.parsed_output ?? undefined;
};

export function attachBrain(sim: Sim, flush: () => void, gate: OutboundGate, call: DraftCall | undefined = client ? ask : undefined) {
  if (!call) return;
  sim.hooks.draftPost = (c: ContentItem, b: Building) => {
    if (!sim.settings.aiDrafts) return;
    schedule(gate, async () => {
      const out = await call(PostDraft, `Write a ${c.platform} ${c.format} post for ${b.name}.
Topic: ${c.topic}${c.campaign ? '\nThis is a lead-generation campaign post: drive people to request info or enroll.' : ''}
Business type: ${b.kind === 'training' ? 'auto-sales training center (courses, books, dealership packages, affiliates)' : `${b.brand ?? ''} car dealership`}.`);
      if (out) { sim.updateContent(c.id, { ...out, by: 'claude' }); flush(); }
    });
  };
  sim.hooks.draftMessage = (m: Message, lead: Lead, b: Building) => {
    if (!sim.settings.aiDrafts) return;
    schedule(gate, async () => {
      const recent = lead.history.slice(0, 5).map(h => `- ${h.text}`).join('\n');
      const out = await call(MessageDraft, `Draft a ${m.channel === 'phone' ? 'short call script' : m.channel} from ${m.agentName} at ${b.name} to ${lead.name}.
Task type: ${m.category}. Lead interest: ${lead.interest}. Lead source: ${lead.source}. Pipeline stage: ${lead.stage}.
Recent history:\n${recent || '- none'}
${m.channel === 'text' ? 'Keep it under 300 characters.' : ''}
Here is the template draft to improve on:\n${m.subject ? `Subject: ${m.subject}\n` : ''}${m.body}`);
      if (out) { sim.updateMessageDraft(m.id, out.subject || undefined, out.body); flush(); }
    });
  };
}
