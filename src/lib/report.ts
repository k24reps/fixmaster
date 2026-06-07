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
