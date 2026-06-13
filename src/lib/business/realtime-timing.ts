/**
 * Pure timing helpers for realtime channel resilience. No DOM / Supabase deps
 * so they are 100% unit-testable (mirrors the FixNova `sync-timing.js` lesson:
 * extract timing math into a tested pure module rather than scattering magic
 * numbers through the channel code).
 *
 * Used by `subscribeOrgTables` (supabase-client.ts) to drive exponential
 * reconnect backoff and "zombie channel" health detection.
 */

/** Default reconnect backoff floor (ms). */
export const BACKOFF_BASE_MS = 1_000;
/** Default reconnect backoff ceiling (ms). */
export const BACKOFF_CAP_MS = 30_000;
/** Default idle window before a silent channel is treated as a zombie (ms). */
export const HEALTH_IDLE_MS = 60_000;

/**
 * Exponential backoff for reconnect attempt N (0-based): base * 2^attempt,
 * clamped to [base, cap]. attempt 0 → base, then doubles up to the cap.
 *
 *   computeBackoff(0) === 1000
 *   computeBackoff(1) === 2000
 *   computeBackoff(5) === 30000 (capped)
 */
export function computeBackoff(
  attempt: number,
  base: number = BACKOFF_BASE_MS,
  cap: number = BACKOFF_CAP_MS,
): number {
  if (!Number.isFinite(attempt) || attempt < 0) attempt = 0;
  const raw = base * 2 ** Math.floor(attempt);
  return Math.min(Math.max(raw, base), cap);
}

/**
 * Apply ±`ratio` random jitter to a delay so many clients reconnecting after
 * the same outage don't stampede the server (thundering herd). Deterministic
 * when `rand` is supplied (for tests); defaults to Math.random.
 *
 * Result is clamped to be non-negative.
 */
export function withJitter(ms: number, ratio = 0.2, rand: () => number = Math.random): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);
  // rand() in [0,1) → factor in [1-ratio, 1+ratio).
  const factor = 1 + (rand() * 2 - 1) * clampedRatio;
  return Math.max(0, Math.round(ms * factor));
}

/**
 * True when a channel has been silent too long and should be probed/reconnected.
 * `lastEventAt` is the ms timestamp of the last received event (or the time the
 * channel was (re)subscribed); `now` is the current ms timestamp.
 */
export function isHealthDue(
  lastEventAt: number,
  now: number,
  idleMs: number = HEALTH_IDLE_MS,
): boolean {
  if (!Number.isFinite(lastEventAt) || !Number.isFinite(now)) return false;
  return now - lastEventAt >= idleMs;
}
