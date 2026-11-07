import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from './useMediaQuery';

/** matchMedia palsu yang bisa "diubah ukurannya" dari tes. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (media: string) => ({
    get matches() {
      return matches;
    },
    media,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((fn) => fn());
    },
    listeners,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('useMediaQuery', () => {
  it('mengikuti matchMedia dan berubah saat jendela diubah ukurannya', () => {
    const mq = stubMatchMedia(true);
    const { result, unmount } = renderHook(() => useMediaQuery('(max-width: 720px)'));
    expect(result.current).toBe(true);
    act(() => mq.set(false));
    expect(result.current).toBe(false);
    unmount();
    expect(mq.listeners.size).toBe(0);
  });

  it('tanpa matchMedia jatuh ke fallback', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useMediaQuery('(max-width: 720px)')).result.current).toBe(
      false,
    );
    expect(
      renderHook(() => useMediaQuery('(max-width: 720px)', true)).result.current,
    ).toBe(true);
  });
});
