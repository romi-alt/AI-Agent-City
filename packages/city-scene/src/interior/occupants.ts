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
