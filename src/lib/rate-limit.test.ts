import { describe, it, expect } from 'vitest';
import {
  initialAttemptState,
  isLocked,
  registerFailure,
  registerSuccess,
  attemptsLeft,
  lockSecondsLeft,
  MAX_ATTEMPTS,
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
