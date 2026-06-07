import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportError, setErrorReporter, initErrorTracking, type ErrorReporter } from './report';

afterEach(() => {
  // Restore the default console reporter between tests.
  setErrorReporter((err, ctx) => console.error('[FixMaster] Unhandled error:', err, ctx ?? {}));
  vi.restoreAllMocks();
});

describe('reportError', () => {
  it('forwards Error instances to the active reporter with context', () => {
    const spy: ErrorReporter = vi.fn();
    setErrorReporter(spy);
    const err = new Error('boom');
    reportError(err, { source: 'route' });
    expect(spy).toHaveBeenCalledWith(err, { source: 'route' });
  });

  it('wraps non-Error values in an Error', () => {
    const spy = vi.fn();
    setErrorReporter(spy);
    reportError('just a string');
    const [passed] = spy.mock.calls[0];
    expect(passed).toBeInstanceOf(Error);
    expect((passed as Error).message).toBe('just a string');
  });

  it('never throws even if the reporter throws', () => {
    setErrorReporter(() => {
      throw new Error('reporter failed');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => reportError(new Error('x'))).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
  });
});

describe('initErrorTracking', () => {
  it('is a no-op when VITE_SENTRY_DSN is unset (keeps the active reporter)', () => {
    // No DSN in the test env → must not load the SDK, swap the reporter, or throw.
    const spy: ErrorReporter = vi.fn();
    setErrorReporter(spy);
    expect(() => initErrorTracking()).not.toThrow();
    // The reporter we set is still the active one (Sentry never took over).
    reportError(new Error('still mine'));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
