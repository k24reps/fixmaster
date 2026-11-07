import { useCallback, useSyncExternalStore } from 'react';

/**
 * Apakah media query cocok, dan ikut berubah saat jendela diubah ukurannya.
 * Tanpa `matchMedia` (jsdom, render server) hasilnya `fallback`.
 *
 * Hanya untuk pilihan yang bergantung pada PERANGKAT. Breakpoint yang menjaga
 * muat/tidak muat tetap `@container` (AGENTS.md §3): zoom aplikasi tidak
 * menggeser media query.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener?.('change', onChange);
      return () => list?.removeEventListener?.('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? fallback,
    () => fallback,
  );
}
