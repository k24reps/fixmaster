import { describe, it, expect } from 'vitest';
import {
  initialAttemptState,
  isLocked,
  registerFailure,
  registerSuccess,
  attemptsLeft,
  lockSecondsLeft,
  MAX_ATTEMPTS,
  slidingWindowAllow,
  pruneWindow,
} from './rate-limit';

describe('rate-limit', () => {
  it('starts unlocked with full attempts', () => {
    const s = initialAttemptState();
    expect(isLocked(s)).toBe(false);
    expect(attemptsLeft(s)).toBe(MAX_ATTEMPTS);
  });

  it('decrements attempts on failure without locking before threshold', () => {
    let s = initialAttemptState();
    s = registerFailure(s, 1000);
    expect(s.fails).toBe(1);
    expect(isLocked(s, 1000)).toBe(false);
    expect(attemptsLeft(s)).toBe(MAX_ATTEMPTS - 1);
  });

  it('locks once the threshold is reached', () => {
    let s = initialAttemptState();
    const now = 1000;
    for (let i = 0; i < MAX_ATTEMPTS; i++) s = registerFailure(s, now);
    expect(isLocked(s, now)).toBe(true);
    expect(lockSecondsLeft(s, now)).toBe(30);
  });

  it('escalates lockout duration on repeated threshold hits', () => {
    let s = initialAttemptState();
    const now = 0;
    for (let i = 0; i < MAX_ATTEMPTS; i++) s = registerFailure(s, now);
    const first = s.lockedUntil;
    for (let i = 0; i < MAX_ATTEMPTS; i++) s = registerFailure(s, now);
    expect(s.lockedUntil - now).toBeGreaterThan(first - now);
  });

  it('unlocks after the lock window passes', () => {
    let s = initialAttemptState();
    for (let i = 0; i < MAX_ATTEMPTS; i++) s = registerFailure(s, 1000);
    expect(isLocked(s, 1000)).toBe(true);
    expect(isLocked(s, 1000 + 31_000)).toBe(false);
  });

  it('resets on success', () => {
    let s = registerFailure(initialAttemptState(), 1000);
    expect(s.fails).toBe(1);
    s = registerSuccess();
    expect(s.fails).toBe(0);
    expect(isLocked(s)).toBe(false);
  });
});

describe('slidingWindowAllow', () => {
  it('allows actions below the limit and records the timestamp', () => {
    const r1 = slidingWindowAllow([], 3, 60_000, 1000);
    expect(r1.allowed).toBe(true);
    expect(r1.timestamps).toEqual([1000]);

    const r2 = slidingWindowAllow(r1.timestamps, 3, 60_000, 1500);
    expect(r2.allowed).toBe(true);
    expect(r2.timestamps).toEqual([1000, 1500]);
  });

  it('blocks once the limit is reached and reports retryAfter', () => {
    const ts = [1000, 1500, 2000];
    const r = slidingWindowAllow(ts, 3, 60_000, 2500);
    expect(r.allowed).toBe(false);
    // oldest (1000) + 60s window - now (2500) = 58.5s → ceil 59
    expect(r.retryAfter).toBe(59);
    // blocked actions are NOT appended
    expect(r.timestamps).toEqual([1000, 1500, 2000]);
  });

  it('frees a slot once the oldest event leaves the window', () => {
    const ts = [1000, 1500, 2000];
    // 61s after the oldest → it's pruned, leaving room
    const r = slidingWindowAllow(ts, 3, 60_000, 62_000);
    expect(r.allowed).toBe(true);
    expect(r.timestamps).not.toContain(1000);
    expect(r.timestamps).toContain(62_000);
  });
});

describe('pruneWindow', () => {
  it('drops timestamps older than the window', () => {
    expect(pruneWindow([100, 200, 9000], 1000, 9500)).toEqual([9000]);
  });
});
