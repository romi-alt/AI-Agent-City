/**
 * The Times Square-style cluster of lit screens, as plain data: invented ads (no real brands), and where the masts
 * and panels stand around one junction at the south-east corner of the district. Pure, so tests need no WebGL.
 */
import { ROAD_HALF } from '../streets/grid.ts';

export interface Ad {
  bg: string;
  fg: string;
  accent: string;
  big: string;
  small: string;
}

/** Twelve invented ads; every one is fictional. */
export const ADS: readonly Ad[] = [
  {
    bg: '#f5b83d',
    fg: '#141414',
    accent: '#141414',
    big: 'EVERY LEAD ANSWERED',
    small: 'AutoSalesCity - the AI sales floor',
  },
  { bg: '#141a2e', fg: '#ffffff', accent: '#3ccf8e', big: 'TEST DRIVES BOOKED', small: 'while you sleep - AI BDC' },
  { bg: '#2f7cf6', fg: '#ffffff', accent: '#ffffff', big: 'AURORA MOTORS', small: 'Trade-in week - 42nd St.' },
  { bg: '#1c2230', fg: '#f5b83d', accent: '#f5b83d', big: 'FAST SALES TRAINING', small: 'Enroll today' },
  { bg: '#18b67a', fg: '#ffffff', accent: '#ffffff', big: 'VOLTA EV', small: 'Charge into spring' },
  {
    bg: '#e5484d',
    fg: '#ffffff',
    accent: '#ffffff',
    big: 'NO LEAD LEFT BEHIND',
    small: 'Follow-ups that never forget',
  },
  {
    bg: '#0d0d14',
    fg: '#ff4fa3',
    accent: '#38e1ff',
    big: 'BROADWAY LIVE',
    small: 'Tonight 8 pm - tickets in the lobby',
  },
  { bg: '#fff3d6', fg: '#7a2e12', accent: '#e0852b', big: 'MERIDIAN COFFEE', small: 'Open all night' },
  { bg: '#0f3b57', fg: '#ffffff', accent: '#7fd3ff', big: 'NORTHLINE AIR', small: 'Fly the new shuttle' },
  { bg: '#6a2cd1', fg: '#ffffff', accent: '#ffd23f', big: 'PULSE FITNESS', small: 'First month free' },
  { bg: '#101010', fg: '#f2b705', accent: '#f2b705', big: 'METRO CAB', small: 'Hail it. Ride it.' },
  { bg: '#1b5e20', fg: '#ffffff', accent: '#c6ff00', big: 'HARBOR BANK', small: 'Banking that keeps moving' },
];

/** The junction the cluster stands at (a cross street and an avenue: both are road centre lines). */
export const SQUARE = { x: 70, z: 50 } as const;

export interface Panel {
  x: number;
  y: number;
  z: number;
  /** Rotation about y so the screen faces the junction. */
  yaw: number;
  w: number;
  h: number;
  /** Which ad it shows first (it advances through the list every few seconds). */
  ad: number;
}

export interface Mast {
  x: number;
  z: number;
  height: number;
}

/** Seconds each ad stays up. */
export const AD_SECONDS = 7;

/** The masts at the four corners and the panels on them (about `count` in all). */
export function planBillboards(count: number): { masts: Mast[]; panels: Panel[] } {
  const corner = ROAD_HALF + 1.6;
  const masts: Mast[] = [];
  const panels: Panel[] = [];
  const per = Math.max(1, Math.round(count / 4));
  let ad = 0;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = SQUARE.x + sx * corner;
      const z = SQUARE.z + sz * corner;
      const height = 5 + per * 3.1;
      masts.push({ x, z, height });
      // The screens face the middle of the junction, spread a little to either side so they fan out.
      const base = Math.atan2(SQUARE.x - x, SQUARE.z - z);
      for (let k = 0; k < per; k++) {
        const fan = (k % 2 ? 1 : -1) * 0.22 * Math.min(2, k);
        panels.push({
          x: x + Math.sin(base + fan) * 0.9,
          y: 6 + k * 3.1,
          z: z + Math.cos(base + fan) * 0.9,
          yaw: base + fan,
          w: 6.2 - k * 0.3,
          h: 2.9,
          ad: ad++ % ADS.length,
        });
      }
    }
  return { masts, panels };
}
