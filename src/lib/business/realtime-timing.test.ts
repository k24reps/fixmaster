import { describe, it, expect } from 'vitest';
import {
  computeBackoff,
  withJitter,
  isHealthDue,
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  HEALTH_IDLE_MS,
} from './realtime-timing';

describe('computeBackoff', () => {
  it('returns base for attempt 0', () => {
    expect(computeBackoff(0)).toBe(BACKOFF_BASE_MS);
  });

  it('doubles per attempt', () => {
    expect(computeBackoff(1)).toBe(2_000);
    expect(computeBackoff(2)).toBe(4_000);
    expect(computeBackoff(3)).toBe(8_000);
    expect(computeBackoff(4)).toBe(16_000);
  });

  it('clamps to the cap', () => {
    expect(computeBackoff(5)).toBe(BACKOFF_CAP_MS); // 32000 → 30000
    expect(computeBackoff(100)).toBe(BACKOFF_CAP_MS);
  });

  it('treats invalid/negative attempts as 0', () => {
    expect(computeBackoff(-3)).toBe(BACKOFF_BASE_MS);
    expect(computeBackoff(NaN)).toBe(BACKOFF_BASE_MS);
  });

  it('honors custom base and cap', () => {
    expect(computeBackoff(0, 500, 5_000)).toBe(500);
    expect(computeBackoff(10, 500, 5_000)).toBe(5_000);
  });
});

describe('withJitter', () => {
  it('returns the floor of the range when rand=0 (factor = 1-ratio)', () => {
    expect(withJitter(1_000, 0.2, () => 0)).toBe(800);
  });

  it('returns the center when rand=0.5 (factor = 1)', () => {
    expect(withJitter(1_000, 0.2, () => 0.5)).toBe(1_000);
  });

  it('returns near the ceiling as rand→1 (factor → 1+ratio)', () => {
    expect(withJitter(1_000, 0.2, () => 0.999999)).toBe(1_200);
  });

  it('stays within ±ratio for arbitrary rand', () => {
    for (const r of [0, 0.13, 0.37, 0.62, 0.88, 0.999]) {
      const v = withJitter(10_000, 0.2, () => r);
      expect(v).toBeGreaterThanOrEqual(8_000);
      expect(v).toBeLessThanOrEqual(12_000);
    }
  });

  it('returns 0 for non-positive or invalid input', () => {
    expect(withJitter(0)).toBe(0);
    expect(withJitter(-5)).toBe(0);
    expect(withJitter(NaN)).toBe(0);
  });

  it('clamps ratio into [0,1]', () => {
    // ratio > 1 clamped to 1 → rand=0 gives factor 0 → 0.
    expect(withJitter(1_000, 5, () => 0)).toBe(0);
    // negative ratio clamped to 0 → no jitter.
    expect(withJitter(1_000, -1, () => 0)).toBe(1_000);
  });
});

describe('isHealthDue', () => {
  it('is false before the idle window elapses', () => {
    expect(isHealthDue(0, HEALTH_IDLE_MS - 1)).toBe(false);
  });

  it('is true at or after the idle window', () => {
    expect(isHealthDue(0, HEALTH_IDLE_MS)).toBe(true);
    expect(isHealthDue(0, HEALTH_IDLE_MS + 5_000)).toBe(true);
  });

  it('honors a custom idle window', () => {
    // lastEventAt=1000, idleMs=10000 → due when elapsed (now-1000) >= 10000.
    expect(isHealthDue(1_000, 11_001, 10_000)).toBe(true); // elapsed 10001
    expect(isHealthDue(1_000, 11_000, 10_000)).toBe(true); // elapsed 10000 (boundary)
    expect(isHealthDue(1_000, 10_999, 10_000)).toBe(false); // elapsed 9999
  });

  it('is false for invalid timestamps', () => {
    expect(isHealthDue(NaN, 100_000)).toBe(false);
    expect(isHealthDue(0, NaN)).toBe(false);
  });
});
