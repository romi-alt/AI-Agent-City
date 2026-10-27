import type { Patch, Snapshot } from './core/types';

export type Role = 'owner' | 'staff' | 'client-admin' | 'client-viewer';
export const ROLES: Role[] = ['owner', 'staff', 'client-admin', 'client-viewer'];
export const ROLE_LABEL: Record<Role, string> = { owner: 'Agency owner', staff: 'Agency staff', 'client-admin': 'Client admin', 'client-viewer': 'Client viewer' };

export interface Me {
  state: 'anon' | 'code' | 'locked' | 'in';
  setupNeeded: boolean;
  user?: { id: string; username: string; name: string; role: Role; clientId?: string; clientName?: string; onDuty: boolean; agentId?: string; recoveryLeft: number };
}
export interface Person { id: string; name: string; onDuty: boolean; agentId?: string }
export interface Integrations {
  email: boolean; sms: boolean; from: string;
  claude: { configured: boolean; model: string; perHour: number; usedLastHour: number };
  /** The server's outbound kill switch (OUTBOUND_ENABLED). Off means no provider is ever called. */
  outbound: { switchOn: boolean; blocked: { email: number; sms: number; llm: number } };
}
export interface StatePayload { snapshot: Snapshot; me: Me; integrations: Integrations; people: Person[] }

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.error ?? `Request failed (${status})`));
    this.status = status;
    this.body = body;
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined || method !== 'GET' ? { 'content-type': 'application/json', 'x-fs': '1' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T,>(url: string) => call<T>('GET', url),
  post: <T,>(url: string, body: unknown = {}) => call<T>('POST', url, body),
  put: <T,>(url: string, body: unknown) => call<T>('PUT', url, body),
  del: <T,>(url: string) => call<T>('DELETE', url),
  me: () => call<Me>('GET', '/api/auth/me'),
  state: () => call<StatePayload>('GET', '/api/state'),
  action: <T = { ok: true }>(a: Record<string, unknown>) => call<T>('POST', '/api/action', a),
};

/** Live updates. Reconnects on its own; tells the caller when the session ended. */
export function stream(onPatch: (p: Patch) => void, onPeople: (p: Person[]) => void, onLost: () => void) {
  const es = new EventSource('/api/stream');
  es.addEventListener('patch', e => onPatch(JSON.parse((e as MessageEvent).data)));
  es.addEventListener('people', e => onPeople(JSON.parse((e as MessageEvent).data)));
  es.onerror = async () => {
    // EventSource retries by itself; if we were signed out or locked, stop and let the app show sign-in.
    const me = await api.me().catch(() => undefined);
    if (me && me.state !== 'in') { es.close(); onLost(); }
  };
  return () => es.close();
}
