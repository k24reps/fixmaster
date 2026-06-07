/**
 * Pure PIN rate-limiting / lockout logic.
 * FixNova's PIN had no brute-force protection; FixMaster adds escalating
 * lockouts. Kept pure (state passed in/out) so it's fully unit-testable
 * and storage-agnostic.
 */

export interface AttemptState {
  /** Consecutive failed attempts. */
  fails: number;
  /** Epoch ms until which login is locked (0 = not locked). */
  lockedUntil: number;
}

export const MAX_ATTEMPTS = 5;

/** Lockout durations (ms) keyed by how many times the threshold was hit. */
const LOCK_STEPS_MS = [30_000, 60_000, 300_000, 900_000]; // 30s, 1m, 5m, 15m

export function initialAttemptState(): AttemptState {
  return { fails: 0, lockedUntil: 0 };
}

/** Whether login is currently locked. */
export function isLocked(state: AttemptState, now: number = Date.now()): boolean {
  return state.lockedUntil > now;
}

/** Seconds remaining on the current lock (0 if unlocked). */
export function lockSecondsLeft(state: AttemptState, now: number = Date.now()): number {
  return isLocked(state, now) ? Math.ceil((state.lockedUntil - now) / 1000) : 0;
}

/** Record a failed attempt, applying a lockout once the threshold is reached. */
export function registerFailure(state: AttemptState, now: number = Date.now()): AttemptState {
  const fails = state.fails + 1;
  if (fails >= MAX_ATTEMPTS) {
    const lockIndex = Math.min(
      Math.floor(fails / MAX_ATTEMPTS) - 1,
      LOCK_STEPS_MS.length - 1,
    );
    return { fails, lockedUntil: now + LOCK_STEPS_MS[lockIndex] };
  }
  return { fails, lockedUntil: 0 };
}

/** Reset on successful login. */
export function registerSuccess(): AttemptState {
  return initialAttemptState();
}

/** Attempts left before the next lockout. */
export function attemptsLeft(state: AttemptState): number {
  return Math.max(0, MAX_ATTEMPTS - (state.fails % MAX_ATTEMPTS));
}

// ============================================================
// Generic sliding-window limiter (pure, reusable).
// Used beyond PIN lockout — e.g. throttling the public service-tracking
// search so a single client can't hammer lookups. State is an array of
// epoch-ms timestamps that the caller persists (component state / ref).
// ============================================================

/** Drop timestamps older than the window. Returns a NEW array. */
export function pruneWindow(
  timestamps: number[],
  windowMs: number,
  now: number = Date.now(),
): number[] {
  const cutoff = now - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

export interface SlidingWindowResult {
  /** Whether this action is allowed. */
  allowed: boolean;
  /** The updated timestamp list to persist (includes `now` if allowed). */
  timestamps: number[];
  /** Seconds until the oldest in-window event expires (0 if allowed). */
  retryAfter: number;
}

/**
 * Allow at most `max` actions per `windowMs`. Pure: pass the prior timestamps
 * in and persist the returned ones. When blocked, `retryAfter` tells the
 * caller how long until a slot frees up.
 */
export function slidingWindowAllow(
  timestamps: number[],
  max: number,
  windowMs: number,
  now: number = Date.now(),
): SlidingWindowResult {
  const recent = pruneWindow(timestamps, windowMs, now);
  if (recent.length >= max) {
    const oldest = Math.min(...recent);
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, timestamps: recent, retryAfter: Math.max(1, retryAfter) };
  }
  return { allowed: true, timestamps: [...recent, now], retryAfter: 0 };
}
