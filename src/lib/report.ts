/**
 * Error reporting seam.
 *
 * A tiny indirection so the app has ONE place to send unexpected errors. By
 * default it only logs to the console (no network, no SDK, no bundle cost).
 * A real tracker (e.g. Sentry) can be wired later by calling `setErrorReporter`
 * once at startup — nothing else in the app needs to change.
 *
 * This deliberately avoids importing any vendor SDK: shipping an unconfigured
 * tracker would add weight and phone home for no benefit. The seam is the
 * product; the integration is opt-in.
 */

export interface ErrorContext {
  /** Where the error surfaced, e.g. 'render', 'route', 'async'. */
  source?: string;
  /** React component stack or other structured detail. */
  componentStack?: string;
  /** Any extra tags the caller wants attached. */
  [key: string]: unknown;
}

export type ErrorReporter = (error: Error, context?: ErrorContext) => void;

/** Default reporter: console only. Replaced via `setErrorReporter`. */
const consoleReporter: ErrorReporter = (error, context) => {
  // Group so the stack + context read as one entry in the console.
  console.error('[FixMaster] Unhandled error:', error, context ?? {});
};

let active: ErrorReporter = consoleReporter;

/**
 * Swap in a real reporter (call once at startup). Example:
 *   setErrorReporter((err, ctx) => Sentry.captureException(err, { extra: ctx }))
 */
export function setErrorReporter(reporter: ErrorReporter): void {
  active = reporter;
}

/** Report an error through the active reporter. Never throws. */
export function reportError(error: unknown, context?: ErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  try {
    active(err, context);
  } catch {
    // A broken reporter must never crash the app.
    consoleReporter(err, context);
  }
}

/**
 * Opt-in remote error tracking. Call once at startup.
 *
 * Cost-safe by design: when `VITE_SENTRY_DSN` is unset (local dev, or any
 * deploy that doesn't want it) this is a complete no-op AND the Sentry SDK
 * is never imported — the dynamic import keeps it out of the initial bundle,
 * so users who don't configure it pay nothing in bytes or network.
 *
 * When a DSN is present, the SDK loads lazily and becomes the active reporter
 * via `setErrorReporter`, so every `reportError(...)` (including the one in
 * ErrorBoundary) is forwarded to Sentry with its context as `extra`.
 */
export function initErrorTracking(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // No DSN → stay console-only, never load the SDK.

  void import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        // Keep volume (and cost) low by default; opt into more via env later.
        tracesSampleRate: 0,
        environment: import.meta.env.MODE,
      });
      setErrorReporter((err, ctx) => {
        Sentry.captureException(err, { extra: ctx as Record<string, unknown> });
      });
    })
    .catch((e) => {
      // Loading/initialising Sentry must never break the app.
      console.error('[FixMaster] Failed to init error tracking:', e);
    });
}
