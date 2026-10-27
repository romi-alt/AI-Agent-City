import { z } from 'zod';

/**
 * The legacy files, as the legacy app writes them (apps/legacy/src/core/types.ts, server/auth.ts).
 * The top level must match exactly or the whole import is refused before anything is written. Individual records
 * that do not match are quarantined with the reason, not dropped.
 */
export const LEGACY_STATE_VERSION = 2;

const num = z.number().finite();
const channel = z.enum(['email', 'phone', 'text']);

export const LegacyLead = z.looseObject({
  id: z.string().min(1),
  name: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  source: z.string(),
  interest: z.string(),
  buildingId: z.string().min(1),
  floor: num.optional(),
  kind: z.enum(['customer', 'affiliate']),
  real: z.boolean(),
  stage: z.string(),
  stageAt: num,
  createdAt: num,
  touchedAt: num,
  history: z.array(
    z.looseObject({ t: num, text: z.string(), agent: z.string().optional(), channel: z.string().optional() }),
  ),
});
export type LegacyLead = z.infer<typeof LegacyLead>;

export const LegacyMessage = z.looseObject({
  id: z.string().min(1),
  t: num,
  buildingId: z.string(),
  agentId: z.string().optional(),
  agentName: z.string(),
  leadId: z.string().optional(),
  channel,
  to: z.string(),
  subject: z.string().optional(),
  body: z.string(),
  status: z.enum(['simulated', 'pending', 'sent', 'failed', 'skipped']),
  real: z.boolean(),
  by: z.string(),
});
export type LegacyMessage = z.infer<typeof LegacyMessage>;

export const LegacyApproval = z.looseObject({
  id: z.string().min(1),
  kind: z.enum(['task', 'message', 'post', 'reply', 'call', 'ads']),
  agentId: z.string(),
  buildingId: z.string(),
  text: z.string(),
  detail: z.string().optional(),
  refId: z.string().optional(),
  taskId: z.string().optional(),
  t: num,
});
export type LegacyApproval = z.infer<typeof LegacyApproval>;

export const LegacyContent = z.looseObject({
  id: z.string().min(1),
  buildingId: z.string(),
  day: num,
  time: z.string(),
  platform: z.string(),
  format: z.string(),
  topic: z.string(),
  caption: z.string().optional(),
  status: z.enum(['idea', 'draft', 'asset-ready', 'needs-approval', 'scheduled', 'published', 'rejected']),
});
export type LegacyContent = z.infer<typeof LegacyContent>;

const LegacyAgent = z.looseObject({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  kind: z.enum(['ai', 'human']),
  taskSet: z.string(),
  categories: z.array(z.string()),
});
export const LegacyBuilding = z.looseObject({
  id: z.string().min(1),
  kind: z.enum(['training', 'dealership', 'associates', 'rental']),
  floors: z.array(
    z.looseObject({
      level: z.number().int(),
      vacant: z.boolean(),
      tenant: z
        .looseObject({ name: z.string(), contact: z.string(), email: z.string(), phone: z.string(), since: num })
        .optional(),
      agents: z.array(LegacyAgent),
    }),
  ),
});
export type LegacyBuilding = z.infer<typeof LegacyBuilding>;

/** Top level: exact version, every list present. Records inside lists are checked one by one. */
export const LegacyState = z.object({
  version: z.literal(LEGACY_STATE_VERSION),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  now: num,
  buildings: z.array(z.unknown()),
  leads: z.array(z.unknown()),
  feed: z.array(z.unknown()),
  approvals: z.array(z.unknown()),
  messages: z.array(z.unknown()),
  content: z.array(z.unknown()),
  inbox: z.array(z.unknown()),
  insights: z.array(z.unknown()),
  reports: z.array(z.unknown()),
  stageLog: z.array(z.unknown()),
  revenue: z.array(z.unknown()),
  settings: z.looseObject({}),
  stats: z.unknown(),
  statsToday: z.unknown(),
  statsDay: z.unknown(),
  seq: z.unknown(),
});
export type LegacyState = z.infer<typeof LegacyState>;

/** auth.json. Credentials are recognised only so they can be counted and left behind. */
export const LegacyAuth = z.object({
  users: z.array(
    z.looseObject({
      id: z.string().min(1),
      username: z.string(),
      name: z.string(),
      role: z.enum(['owner', 'staff', 'client-admin', 'client-viewer', 'admin', 'member']),
      clientId: z.string().optional(),
    }),
  ),
  clients: z
    .array(z.looseObject({ id: z.string().min(1), name: z.string(), buildingIds: z.array(z.string()) }))
    .default([]),
  devices: z.array(z.unknown()).default([]),
  sessions: z.array(z.unknown()).default([]),
  signins: z.array(z.unknown()).default([]),
});
export type LegacyAuth = z.infer<typeof LegacyAuth>;

/** The explicit ownership mapping, written and reviewed by a person. Nothing is inferred from proximity. */
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
export const ImportMapping = z.strictObject({
  version: z.literal(1),
  note: z.string().optional(),
  agency: z.strictObject({ key, name: z.string().min(1) }),
  demoTenant: z.strictObject({ key, name: z.string().min(1) }),
  tenants: z.array(
    z.strictObject({
      key,
      name: z.string().min(1),
      kind: z.enum(['client', 'agency']),
      legacyClientIds: z.array(z.string()).default([]),
      workspaces: z
        .array(
          z.strictObject({
            key,
            name: z.string().min(1),
            buildings: z.array(z.string()).default([]),
            floors: z.array(z.strictObject({ building: z.string(), level: z.number().int() })).default([]),
            installAgents: z.boolean().default(true),
          }),
        )
        .min(1),
    }),
  ),
  contactOwnership: z.array(
    z.strictObject({
      tenant: key,
      workspace: key,
      evidence: z.string().min(10),
      legacyLeadIds: z.array(z.string()).optional(),
      legacyBuilding: z.string().optional(),
    }),
  ),
  users: z.array(
    z.strictObject({
      legacyUserId: z.string(),
      email: z.email(),
      evidence: z.string().min(10),
      tenant: key,
      workspace: key.optional(),
      role: z.enum(['agency-owner', 'agency-staff', 'client-admin', 'client-viewer']),
    }),
  ),
});
export type ImportMapping = z.infer<typeof ImportMapping>;
