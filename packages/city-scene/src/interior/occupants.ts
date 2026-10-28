'use client';
import { createContext } from 'react';

/** Someone sitting at a desk in the office view. */
export interface DeskOccupant {
  /** Stable id (the demo agent's id), or the desk slot as text for the public layout. */
  id: string;
  /** Shown for AI agents; human desks in public views are anonymous (null). */
  name: string | null;
  role: string;
  kind: 'ai' | 'human';
  /** 'working' | 'idle' | 'needs-you' (anything else shows as idle). */
  status: string;
  summary?: string | null;
}

/**
 * Occupants supplied by a host for one floor (the demo office's synthetic team). When present for the floor being
 * shown they replace the public layout's desks. Provided around <CityScene>; the canvas bridges React context.
 */
export interface OfficeOccupants {
  building: string;
  level: number;
  agents: DeskOccupant[];
  onSelect?: (id: string) => void;
  /** `data-testid` for each desk's name tag. */
  deskTestId?: (id: string) => string;
}

export const OfficeOccupantsContext = createContext<OfficeOccupants | null>(null);

export const STATUS_COLORS: Record<string, string> = {
  working: '#3ecf8e',
  idle: '#9aa5b1',
  'needs-you': '#ff7a5c',
};
export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? STATUS_COLORS.idle!;
}
export function statusLabel(status: string): string {
  if (status === 'working') return 'Working';
  if (status === 'needs-you') return 'Needs you';
  return 'Idle';
}

// ── Reference office look ──────────────────────────────────────────────────────────────────────────────────────

/** The office legend: people in a warm shirt, AI agents in a cool one. */
export const REF_SHIRT = { human: '#f2b33d', ai: '#4aa8d8' } as const;
/** Status rings under the chairs (the legend's colours). */
export const REF_STATUS: Record<string, string> = { working: '#2ecc71', 'needs-you': '#ef4444', idle: '#9aa5b1' };
export function refStatusColor(status: string): string {
  return REF_STATUS[status] ?? REF_STATUS.idle!;
}
/** Role text on the name pills: the legend hues, darkened enough to read on white. */
export const REF_ROLE_TEXT = { human: '#b7791f', ai: '#2f86b8' } as const;
