// Demo funnel calls and response shapes (PLAN.md "API contract (demo module)"). Browser-only. Every call goes through
// lib/api-client.ts; the shapes are mirrored here (the web app never imports API code) and normalised defensively, so
// a renamed optional field shows as a blank instead of breaking the page.
import { api, ApiError } from '../../lib/api-client';
import { getDeviceKey } from '../../lib/device-key';

type Obj = Record<string, unknown>;

/**
 * Calls the public demo endpoints (form token, request, request status). There is no session yet, so a 401/403 must
 * never turn into a sign-in or step-up redirect: those options make the client throw instead. A device proof is
 * still attached (harmless); if this browser cannot create its key (blocked storage, some private windows), the call
 * is sent once more without one rather than failing the form.
 */
export async function publicApi<T = Obj>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  try {
    await getDeviceKey();
  } catch {
    return withoutProof<T>(method, path, body);
  }
  return api<T>(method, path, { body, signedOut: 'throw', stepUp: 'throw' });
}

async function withoutProof<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    credentials: 'same-origin',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: Obj = {};
  try {
    const text = await res.text();
    parsed = text ? (JSON.parse(text) as Obj) : {};
  } catch {
    parsed = {};
  }
  if (!res.ok) throw new ApiError(res.status, parsed);
  return parsed as T;
}

// ---------------------------------------------------------------------------------------------------------------
// Attribution and the visitor's own email (kept in this browser only)

export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrerHost?: string;
}

/** utm_* from the address bar and the referring site's host (never its path or query). Empty values are left out. */
export function readAttribution(): Attribution {
  const out: Attribution = {};
  const params = new URLSearchParams(window.location.search);
  const take = (key: keyof Attribution, param: string) => {
    const v = params.get(param)?.trim();
    if (v) out[key] = v.slice(0, 200);
  };
  take('utmSource', 'utm_source');
  take('utmMedium', 'utm_medium');
  take('utmCampaign', 'utm_campaign');
  take('utmTerm', 'utm_term');
  take('utmContent', 'utm_content');
  try {
    if (document.referrer) {
      const host = new URL(document.referrer).host;
      if (host && host !== window.location.host) out.referrerHost = host;
    }
  } catch {
    // no usable referrer
  }
  return out;
}

const EMAIL_KEY = 'agentcity:demo-email';
const EMAIL_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The address the visitor typed, remembered in this browser so the sign-in after verification can be prefilled
 * (login_hint). It never goes into a URL. Forgotten after the demo is claimed, or after three days.
 */
export function rememberDemoEmail(email: string): void {
  try {
    localStorage.setItem(EMAIL_KEY, JSON.stringify({ email, at: Date.now() }));
  } catch {
    // storage blocked: sign-in simply won't be prefilled
  }
}

export function recallDemoEmail(): string | null {
  try {
    const raw = localStorage.getItem(EMAIL_KEY);
    if (!raw) return null;
    const { email, at } = JSON.parse(raw) as { email?: unknown; at?: unknown };
    if (typeof email !== 'string' || typeof at !== 'number' || Date.now() - at > EMAIL_TTL_MS) {
      localStorage.removeItem(EMAIL_KEY);
      return null;
    }
    return email;
  } catch {
    return null;
  }
}

export function forgetDemoEmail(): void {
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    // nothing to forget
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Response shapes

export type DemoRequestStatus = 'verification-sent' | 'ready' | 'expired';

export interface DemoPlace {
  building: { key: string; name: string };
  office: { level: number | null; name: string };
}

export interface DemoClaim extends DemoPlace {
  tenantId: string | null;
  workspaceId: string | null;
  firstName: string;
  company: string;
  expiresAt: string | null;
}

export interface DemoTask {
  title: string;
  status: string | null;
  when: string | null;
}

export interface DemoMessage {
  from: string;
  text: string;
}

export interface DemoConversation {
  title: string;
  messages: DemoMessage[];
}

export interface DemoAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  summary: string;
  tasks: DemoTask[];
  conversations: DemoConversation[];
}

export interface DemoActivity {
  agentId: string | null;
  text: string;
  when: string | null;
}

export interface DemoWorkspace extends DemoPlace {
  firstName: string;
  company: string;
  industry: string | null;
  agents: DemoAgent[];
  activity: DemoActivity[];
  expiresAt: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Rental Building 2 is where every demo office is shown (PLAN.md decision 6). */
export const DEMO_BUILDING_FALLBACK = { key: 'rental-2', name: 'Rental Building 2' };

function place(b: Obj): DemoPlace {
  const building = obj(b.building);
  const office = obj(b.office);
  const level = typeof office.level === 'number' ? office.level : Number(office.level);
  return {
    building: {
      key: str(building.key) ?? DEMO_BUILDING_FALLBACK.key,
      name: str(building.name) ?? DEMO_BUILDING_FALLBACK.name,
    },
    office: {
      level: Number.isFinite(level) ? level : null,
      name: str(office.name) ?? 'Your demo office',
    },
  };
}

export function normaliseClaim(b: Obj): DemoClaim {
  return {
    ...place(b),
    tenantId: str(b.tenantId),
    workspaceId: str(b.workspaceId),
    firstName: str(b.firstName) ?? '',
    company: str(b.company) ?? '',
    expiresAt: str(b.expiresAt),
  };
}

function task(v: unknown): DemoTask | null {
  if (typeof v === 'string') return v.trim() ? { title: v, status: null, when: null } : null;
  const t = obj(v);
  const title = str(t.title) ?? str(t.text) ?? str(t.summary);
  return title ? { title, status: str(t.status), when: str(t.at) ?? str(t.when) ?? str(t.completedAt) } : null;
}

function conversation(v: unknown, i: number): DemoConversation | null {
  const c = obj(v);
  const messages = arr(c.messages ?? c.lines ?? c.turns)
    .map(m => {
      if (typeof m === 'string') return { from: '', text: m };
      const o = obj(m);
      const text = str(o.text) ?? str(o.body) ?? str(o.content);
      return text ? { from: str(o.from) ?? str(o.author) ?? str(o.role) ?? '', text } : null;
    })
    .filter((m): m is DemoMessage => m !== null);
  if (messages.length === 0) return null;
  return { title: str(c.title) ?? str(c.with) ?? str(c.subject) ?? `Conversation ${i + 1}`, messages };
}

export function normaliseWorkspace(b: Obj): DemoWorkspace {
  const agents = arr(b.agents)
    .map(a => {
      const o = obj(a);
      const id = str(o.id);
      if (!id) return null;
      return {
        id,
        name: str(o.name) ?? 'Agent',
        role: str(o.role) ?? '',
        status: str(o.status) ?? 'idle',
        summary: str(o.summary) ?? '',
        tasks: arr(o.tasks)
          .map(task)
          .filter((t): t is DemoTask => t !== null),
        conversations: arr(o.conversations)
          .map(conversation)
          .filter((c): c is DemoConversation => c !== null),
      };
    })
    .filter((a): a is DemoAgent => a !== null);
  const activity = arr(b.activity)
    .map(a => {
      if (typeof a === 'string') return { agentId: null, text: a, when: null };
      const o = obj(a);
      const text = str(o.text) ?? str(o.summary) ?? str(o.title);
      return text ? { agentId: str(o.agentId), text, when: str(o.at) ?? str(o.when) } : null;
    })
    .filter((a): a is DemoActivity => a !== null);
  return {
    ...place(b),
    firstName: str(b.firstName) ?? '',
    company: str(b.company) ?? '',
    industry: str(b.industry),
    agents,
    activity,
    expiresAt: str(b.expiresAt),
  };
}

/** "Available until 10 November" in the visitor's own locale; blank when the date is missing or unreadable. */
export function formatExpiry(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Status words from the API, written for people. */
export function describeAgentStatus(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('work') || s === 'busy' || s === 'active') return 'Working';
  if (s.includes('approv') || s.includes('wait') || s.includes('review')) return 'Waiting for approval';
  if (s.includes('break') || s.includes('away')) return 'Away';
  if (s.includes('idle') || s.includes('available') || s === 'ready') return 'Available';
  return status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/[-_]/g, ' ') : 'Available';
}

/** Short relative-or-absolute time for lists ("09:40", "Yesterday"); never throws. */
export function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
