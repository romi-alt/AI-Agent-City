// Response shapes the web app reads from the API (DESIGN.md "HTTP API"). Mirrored here, never imported from
// apps/api. Where DESIGN.md does not fix a shape (session/device lists, memberships), the normalisers below accept
// the likely variants and ignore what they don't know, so a renamed optional field degrades to a blank cell instead of
// a broken page.

export type StepUpReason = 'credential' | 'billing' | 'permission';

export interface LoginStartResponse {
  authorizeUrl: string;
}

export interface LogoutResponse {
  endSessionUrl?: string | null;
}

export interface AuthMeResponse {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  amr: string[];
  acr: string | null;
  authTime: string;
  stepUpAt: string | null;
  device: { id: string; label: string | null };
  tenantId: string | null;
  workspaceId: string | null;
}

export interface SessionRow {
  id: string;
  deviceId: string | null;
  deviceLabel: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  amr: string[];
  current: boolean;
}

export interface DeviceRow {
  id: string;
  label: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  current: boolean;
}

export interface MembershipRow {
  tenantId: string;
  tenantName: string;
  workspaceId: string | null;
  workspaceName: string | null;
  role: string;
}

type Obj = Record<string, unknown>;
const pick = (o: Obj, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
};
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x): x is Obj => !!x && typeof x === 'object') : []);

export function normaliseSessions(body: Obj, currentSessionId?: string | null) {
  const sessions: SessionRow[] = list(body.sessions).map(s => {
    const device = (s.device && typeof s.device === 'object' ? s.device : {}) as Obj;
    const id = pick(s, 'id', 'sessionId') ?? '';
    return {
      id,
      deviceId: pick(s, 'deviceId') ?? pick(device, 'id'),
      deviceLabel: pick(s, 'deviceLabel') ?? pick(device, 'label'),
      createdAt: pick(s, 'createdAt', 'startedAt', 'authTime'),
      lastSeenAt: pick(s, 'lastSeenAt', 'lastUsedAt', 'lastActiveAt'),
      amr: Array.isArray(s.amr) ? s.amr.filter((m): m is string => typeof m === 'string') : [],
      current: s.current === true || (!!currentSessionId && id === currentSessionId),
    };
  });
  const currentDevice = sessions.find(s => s.current)?.deviceId ?? null;
  const devices: DeviceRow[] = list(body.devices).map(d => {
    const id = pick(d, 'id', 'deviceId', 'jkt') ?? '';
    return {
      id,
      label: pick(d, 'label', 'name'),
      createdAt: pick(d, 'createdAt', 'firstSeenAt'),
      lastSeenAt: pick(d, 'lastSeenAt', 'lastUsedAt'),
      current: d.current === true || (!!currentDevice && id === currentDevice),
    };
  });
  return { sessions: sessions.filter(s => s.id), devices: devices.filter(d => d.id) };
}

export function normaliseMemberships(body: unknown): MembershipRow[] {
  const rows = Array.isArray(body) ? list(body) : list((body as Obj | null)?.memberships);
  const out: MembershipRow[] = [];
  for (const m of rows) {
    const tenant = (m.tenant && typeof m.tenant === 'object' ? m.tenant : {}) as Obj;
    const tenantId = pick(m, 'tenantId') ?? pick(tenant, 'id');
    if (!tenantId) continue;
    const tenantName = pick(m, 'tenantName') ?? pick(tenant, 'name') ?? tenantId;
    const role = pick(m, 'role') ?? '';
    const workspaces = list(m.workspaces);
    if (workspaces.length === 0) {
      out.push({
        tenantId,
        tenantName,
        workspaceId: pick(m, 'workspaceId'),
        workspaceName: pick(m, 'workspaceName'),
        role,
      });
    }
    for (const w of workspaces) {
      out.push({
        tenantId,
        tenantName,
        workspaceId: pick(w, 'id', 'workspaceId'),
        workspaceName: pick(w, 'name', 'workspaceName'),
        role: pick(w, 'role') ?? role,
      });
    }
  }
  return out;
}

export function describeAmr(amr: string[]): string {
  const names: Record<string, string> = {
    passkey: 'passkey',
    'email-code': 'email sign-in code',
    sso: 'agency single sign-on',
    password: 'password',
    otp: 'one-time code',
    'recovery-code': 'recovery code',
  };
  return amr.length ? amr.map(m => names[m] ?? m).join(', ') : 'unknown';
}

export function describeRole(role: string): string {
  const names: Record<string, string> = {
    'client-admin': 'client admin',
    'client-viewer': 'viewer',
    viewer: 'viewer',
    'agency-owner': 'agency owner',
    'agency-staff': 'agency staff',
    support: 'support',
  };
  return names[role] ?? role;
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
