import type { QualityLevel } from '../types.ts';

/** Per-quality budgets every system reads instead of hard-coding counts. Owner: A1 (may tune; keep the keys). */
export interface QualityBudget {
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: number;
  postprocessing: boolean;
  vehicles: number;
  pedestrians: number;
  birds: number;
  aircraft: number;
  helicopters: number;
  cloudLayers: number;
  rainDrops: number;
  decorBuildingDetail: 'full' | 'reduced' | 'minimal';
  microAnimations: boolean;
  /** Boats on the rivers and cars crossing each bridge. */
  boats: number;
  bridgeCars: number;
  /** Trees per green block of the big park. */
  parkTrees: number;
  /** Lit billboards in the Times Square cluster. */
  billboards: number;
}

export const QUALITY: Record<QualityLevel, QualityBudget> = {
  ultra: {
    dpr: [1, 2],
    shadows: true,
    shadowMapSize: 4096,
    // Ambient occlusion (N8AO), SMAA and tone mapping in a composer. Balanced uses the same chain (so both look
    // alike; fog is only at the far horizon, where the fog/tone-mapping order no longer shows).
    postprocessing: true,
    vehicles: 90,
    pedestrians: 160,
    birds: 60,
    aircraft: 3,
    helicopters: 2,
    cloudLayers: 3,
    rainDrops: 6000,
    decorBuildingDetail: 'full',
    microAnimations: true,
    boats: 14,
    bridgeCars: 6,
    parkTrees: 10,
    billboards: 40,
  },
  balanced: {
    dpr: [1, 1.5],
    shadows: true,
    shadowMapSize: 2048,
    postprocessing: true,
    vehicles: 50,
    pedestrians: 80,
    birds: 30,
    aircraft: 2,
    helicopters: 1,
    cloudLayers: 2,
    rainDrops: 2500,
    decorBuildingDetail: 'reduced',
    microAnimations: true,
    boats: 10,
    bridgeCars: 4,
    parkTrees: 6,
    billboards: 28,
  },
  low: {
    dpr: [0.75, 1],
    shadows: false,
    shadowMapSize: 512,
    postprocessing: false,
    vehicles: 18,
    pedestrians: 24,
    birds: 10,
    aircraft: 1,
    helicopters: 0,
    cloudLayers: 1,
    rainDrops: 600,
    decorBuildingDetail: 'minimal',
    microAnimations: false,
    boats: 6,
    bridgeCars: 2,
    parkTrees: 2,
    billboards: 12,
  },
};
