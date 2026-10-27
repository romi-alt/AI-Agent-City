export type Channel = 'email' | 'phone' | 'text';
export type AgentKind = 'human' | 'ai';
export type AgentStatus = 'idle' | 'working' | 'needs-you';
export type BuildingKind = 'training' | 'dealership' | 'associates' | 'rental';

export interface Agent {
  id: string;
  name: string;
  /** Short job label shown on the desk tag, e.g. "closer", "follow-up". */
  role: string;
  kind: AgentKind;
  /** Which task list this agent draws from. */
  taskSet: TaskSetId;
  buildingId: string;
  floor: number;
  status: AgentStatus;
  current?: Task;
  done: number;
}

export type TaskSetId = 'dealership' | 'fastSales' | 'social' | 'none';

export interface Task {
  id: string;
  title: string;
  category: string;
  channel?: Channel;
  leadId?: string;
  /** Sim ticks remaining until the task completes. */
  remaining: number;
  needsApproval: boolean;
}

export interface Floor {
  level: number;
  name: string;
  /** Empty or for-rent floors have no agents and are shown as "Available". */
  vacant: boolean;
  rent?: number;
  agents: Agent[];
}

export interface Building {
  id: string;
  name: string;
  short: string;
  kind: BuildingKind;
  color: string;
  accent: string;
  /** Lot position in world units (centre) and footprint. */
  x: number;
  z: number;
  w: number;
  d: number;
  floors: Floor[];
}

export type LeadStage = string;

export interface Lead {
  id: string;
  name: string;
  source: string;
  interest: string;
  buildingId: string;
  stage: LeadStage;
  createdAt: number;
  touchedAt: number;
}

export interface FeedItem {
  t: number;
  agent: string;
  buildingId: string;
  text: string;
  kind: 'info' | 'done' | 'needs-you';
}

export interface Approval {
  id: string;
  agentId: string;
  buildingId: string;
  text: string;
  t: number;
}
