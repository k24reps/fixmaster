import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportError, setErrorReporter, type ErrorReporter } from './report';

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
