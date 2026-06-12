import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore, resolveCreateOutlet, mustPickOutlet } from './session';

/**
 * Outlet-resolution helpers (Level 2). These decide which branch a new
 * transaction is stamped with and whether a multi-outlet user must pick a
 * branch first. They read live session state, so we set it directly.
 */

type O = { id: string; isPrimary?: boolean };
const outlets: O[] = [
  { id: 'a', isPrimary: false },
  { id: 'b', isPrimary: true },
  { id: 'c' },
];

function setState(activeOutletId: string | null, allowedOutletIds: string[]) {
  useSessionStore.setState({ activeOutletId, allowedOutletIds });
}

beforeEach(() => {
  setState(null, []);
});

describe('resolveCreateOutlet', () => {
  it('uses the active outlet when one is selected', () => {
    setState('a', []);
    expect(resolveCreateOutlet(outlets)).toBe('a');
  });

  it('active outlet wins even over allowed set', () => {
    setState('c', ['a', 'b']);
    expect(resolveCreateOutlet(outlets)).toBe('c');
  });

  it('falls back to the single allowed outlet when scope is "All"', () => {
    setState(null, ['a']);
    expect(resolveCreateOutlet(outlets)).toBe('a');
  });

  it('defaults to primary within the allowed set when multi-outlet', () => {
    setState(null, ['a', 'b']);
    expect(resolveCreateOutlet(outlets)).toBe('b'); // b is primary
  });

  it('defaults to org primary when no restriction (manager/local)', () => {
    setState(null, []);
    expect(resolveCreateOutlet(outlets)).toBe('b'); // primary
  });

  it('falls back to first outlet when none is primary', () => {
    setState(null, []);
    expect(resolveCreateOutlet([{ id: 'x' }, { id: 'y' }])).toBe('x');
  });

  it('returns null when there are no outlets at all', () => {
    setState(null, []);
    expect(resolveCreateOutlet([])).toBeNull();
  });
});

describe('mustPickOutlet', () => {
  it('never forces a pick when a specific outlet is active', () => {
    setState('a', ['a', 'b']);
    expect(mustPickOutlet(3)).toBe(false);
  });

  it('forces a pick for multi-outlet staff on "All" scope', () => {
    setState(null, ['a', 'b']);
    expect(mustPickOutlet(3)).toBe(true);
  });

  it('does not force a pick for single-outlet staff', () => {
    setState(null, ['a']);
    expect(mustPickOutlet(3)).toBe(false);
  });

  it('forces a pick for an unrestricted user (manager) with multiple outlets', () => {
    setState(null, []);
    expect(mustPickOutlet(2)).toBe(true);
  });

  it('does not force a pick when the org has a single outlet', () => {
    setState(null, []);
    expect(mustPickOutlet(1)).toBe(false);
  });
});
