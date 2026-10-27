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
}

export const QUALITY: Record<QualityLevel, QualityBudget> = {
  ultra: {
    dpr: [1, 2],
    shadows: true,
    shadowMapSize: 2048,
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
  },
  balanced: {
    dpr: [1, 1.5],
    shadows: true,
    shadowMapSize: 1024,
    postprocessing: false,
    vehicles: 50,
    pedestrians: 80,
    birds: 30,
    aircraft: 2,
    helicopters: 1,
    cloudLayers: 2,
    rainDrops: 2500,
    decorBuildingDetail: 'reduced',
    microAnimations: true,
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
  },
};
