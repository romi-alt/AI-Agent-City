import type { QualityLevel } from '../types.ts';

/**
 * Automatic quality from measured frame times (pure, so it is unit-tested). The initial level comes from the median
 * frame time once the scene has settled; afterwards only sustained slowness steps it down, one level at a time, and
 * nothing ever steps it back up on its own (no oscillation).
 */

export const ORDER: QualityLevel[] = ['low', 'balanced', 'ultra'];

/** Median frame time at or under these picks the level (ms): ~55 fps for ultra, ~33 fps for balanced. */
export const INITIAL_THRESHOLDS = { ultra: 18, balanced: 30 };
/** Frames sampled for the initial pick, after the settle time. */
export const SAMPLE_FRAMES = 90;
export const SETTLE_SECONDS = 2;
/** A second whose average frame is slower than this counts as slow (~24 fps). */
export const SLOW_FRAME_MS = 42;
/** This many slow seconds in a row step the quality down. */
export const SLOW_SECONDS = 3;

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function pickInitialQuality(frameMs: number[]): QualityLevel {
  const m = median(frameMs);
  if (m <= INITIAL_THRESHOLDS.ultra) return 'ultra';
  if (m <= INITIAL_THRESHOLDS.balanced) return 'balanced';
  return 'low';
}

export function stepDown(q: QualityLevel): QualityLevel {
  return ORDER[Math.max(0, ORDER.indexOf(q) - 1)]!;
}

/** Watches frame times in one-second buckets and reports when the quality should step down. */
export class SlowFrameMonitor {
  private bucketMs = 0;
  private bucketFrames = 0;
  private slowRun = 0;

  /** Feed one frame; returns true when the last SLOW_SECONDS seconds were all slow. */
  push(frameMs: number): boolean {
    this.bucketMs += frameMs;
    this.bucketFrames += 1;
    if (this.bucketMs < 1000) return false;
    const avg = this.bucketMs / this.bucketFrames;
    this.bucketMs = 0;
    this.bucketFrames = 0;
    this.slowRun = avg > SLOW_FRAME_MS ? this.slowRun + 1 : 0;
    if (this.slowRun >= SLOW_SECONDS) {
      this.slowRun = 0;
      return true;
    }
    return false;
  }

  reset() {
    this.bucketMs = 0;
    this.bucketFrames = 0;
    this.slowRun = 0;
  }
}
