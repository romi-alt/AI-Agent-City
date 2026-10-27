export type Channel = 'email' | 'phone' | 'text';
export type AgentKind = 'human' | 'ai';
export type AgentStatus = 'idle' | 'working' | 'needs-you';
export type BuildingKind = 'training' | 'dealership' | 'associates' | 'rental';
/** Which task list an agent draws from. `manager` agents run the hourly/daily routines. */
export type TaskSetId = 'dealership' | 'fastSales' | 'social' | 'manager' | 'none';

export interface Agent {
  id: string;
  name: string;
  /** Short job label shown on the desk tag, e.g. "closer", "follow-up". */
  role: string;
  kind: AgentKind;
  taskSet: TaskSetId;
  /** Task categories this agent works (subset of its task set). */
  categories: string[];
  buildingId: string;
  floor: number;
  status: AgentStatus;
  current?: Task;
  done: number;
  /** Signed-in user this human agent belongs to. */
  userId?: string;
}

export interface Task {
  id: string;
  title: string;
  category: string;
  channel?: Channel;
  leadId?: string;
  contentId?: string;
  inboxId?: string;
  /** What finishing the task does. */
  action: 'contact' | 'social' | 'admin';
  /** Sim ticks remaining until the task completes. */
  remaining: number;
  needsApproval: boolean;
}

export interface Tenant {
  name: string;
  contact: string;
  email: string;
  phone: string;
  since: number;
}

export interface Floor {
  level: number;
  name: string;
  /** Empty or for-rent floors have no agents and are shown as "Available". */
  vacant: boolean;
  rent?: number;
  tenant?: Tenant;
  info?: string;
  agents: Agent[];
}

export interface Building {
  id: string;
  name: string;
  short: string;
  kind: BuildingKind;
  brand?: string;
  color: string;
  accent: string;
  /** Lot centre in world units and footprint. */
  x: number;
  z: number;
  w: number;
  d: number;
  floors: Floor[];
}

export type LeadKind = 'customer' | 'affiliate';

export interface LeadEvent {
  t: number;
  text: string;
  agent?: string;
  channel?: Channel | 'note' | 'stage' | 'social';
}

export interface Lead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  source: string;
  interest: string;
  buildingId: string;
  /** Department floor that owns the lead (Training Center courses). */
  floor?: number;
  kind: LeadKind;
  /** Real people entered by a human. Only real leads are ever contacted for real. */
  real: boolean;
  stage: string;
  stageAt: number;
  createdAt: number;
  touchedAt: number;
  priority?: boolean;
  history: LeadEvent[];
}

export interface FeedItem {
  t: number;
  agent: string;
  buildingId: string;
  text: string;
  kind: 'info' | 'done' | 'needs-you';
}

export type ApprovalKind = 'task' | 'message' | 'post' | 'reply' | 'call' | 'ads';

export interface Approval {
  id: string;
  kind: ApprovalKind;
  agentId: string;
  buildingId: string;
  text: string;
  detail?: string;
  /** Message / content / inbox / lead id the approval acts on. */
  refId?: string;
  /** The agent task waiting on this approval, if any. */
  taskId?: string;
  t: number;
}

export type MessageStatus = 'simulated' | 'pending' | 'sent' | 'failed' | 'skipped';

export interface Message {
  id: string;
  t: number;
  buildingId: string;
  agentId?: string;
  agentName: string;
  leadId?: string;
  channel: Channel;
  to: string;
  subject?: string;
  body: string;
  category?: string;
  status: MessageStatus;
  real: boolean;
  by: 'template' | 'claude' | 'human';
  error?: string;
}

export type ContentFormat = 'image' | 'carousel' | 'video' | 'reel' | 'story';
export type ContentStatus = 'idea' | 'draft' | 'asset-ready' | 'needs-approval' | 'scheduled' | 'published' | 'rejected';

export interface Metrics { reach: number; impressions: number; engagement: number; clicks: number; leads: number }

export interface ContentItem {
  id: string;
  buildingId: string;
  /** Sim day index the post is planned for. */
  day: number;
  time: string;
  platform: string;
  format: ContentFormat;
  topic: string;
  campaign?: boolean;
  hook?: string;
  caption?: string;
  cta?: string;
  hashtags?: string[];
  brief?: string;
  status: ContentStatus;
  agentId?: string;
  by?: 'template' | 'claude';
  metrics?: Metrics;
  publishedAt?: number;
}

export interface InboxItem {
  id: string;
  t: number;
  buildingId: string;
  platform: string;
  author: string;
  kind: 'comment' | 'dm' | 'mention';
  text: string;
  intent: 'faq' | 'sensitive' | 'lead' | 'praise';
  status: 'open' | 'answered' | 'escalated' | 'resolved';
  reply?: string;
  contentId?: string;
  leadId?: string;
}

export interface Insight {
  id: string;
  t: number;
  buildingId: string;
  kind: 'strategy' | 'trend' | 'competitor' | 'optimization' | 'campaign';
  agent: string;
  text: string;
}

export interface Report {
  id: string;
  t: number;
  kind: 'morning' | 'daily' | 'weekly-social';
  subject: string;
  body: string;
  to: string[];
  /** `skipped`: refused by the server's outbound gate (kill switch off), so nothing was sent. */
  status: 'simulated' | 'sent' | 'failed' | 'pending' | 'skipped';
  error?: string;
}

export interface Settings {
  companyName: string;
  reportRecipients: string[];
  /** `simulate`: nothing leaves the building. `live`: real leads and reports go out through configured providers. */
  deliveryMode: 'simulate' | 'live';
  /** e.g. https://app.gohighlevel.com/v2/location/XXX/contacts/detail/{id} */
  crmUrlTemplate: string;
  morningReportAt: number;
  dailyReportAt: number;
  aiDrafts: boolean;
  /** Real-time minutes per sim tick multiplier. 0 = paused. */
  speed: number;
}

/** A building outside what the viewer may see: a shape on the skyline with no name or contents. */
export interface Neighbour { x: number; z: number; w: number; d: number; floors: number }

export interface Snapshot {
  version: number;
  startDate: string;
  now: number;
  buildings: Building[];
  leads: Lead[];
  feed: FeedItem[];
  approvals: Approval[];
  messages: Message[];
  content: ContentItem[];
  inbox: InboxItem[];
  insights: Insight[];
  reports: Report[];
  stats: StatsDump;
  statsToday: StatsDump;
  statsDay: number;
  revenue: { t: number; buildingId: string; amount: number }[];
  /** Every lead stage change, for "booked in 24h" / "enrolled this month" KPIs. */
  stageLog: StageEvent[];
  settings: Settings;
  seq: number;
  /** Only in what a client's browser receives: other clients' buildings, as bare shapes. */
  neighbours?: Neighbour[];
}

export type StatsDump = [string, [string, Record<string, number>][]][];
export interface StageEvent { t: number; b: string; s: string }

export interface Patch {
  now: number;
  agents?: Agent[];
  floors?: { buildingId: string; floor: Floor }[];
  leads?: Lead[];
  removedLeads?: string[];
  feed?: FeedItem[];
  approvals?: Approval[];
  messages?: Message[];
  content?: ContentItem[];
  inbox?: InboxItem[];
  insights?: Insight[];
  reports?: Report[];
  stats?: StatsDump;
  statsToday?: StatsDump;
  statsDay?: number;
  revenue?: Snapshot['revenue'];
  stageLog?: StageEvent[];
  removedContent?: string[];
  settings?: Settings;
}
