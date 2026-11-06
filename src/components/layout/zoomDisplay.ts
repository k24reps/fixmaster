import { useSyncExternalStore } from 'react';
import { isBelowTextFloor } from '@/stores/zoom';

/**
 * Pembantu tampilan pembesaran yang dipakai bersama oleh DisplayControls,
 * chip Topbar, dan kartu Pengaturan. Terpisah dari berkas komponen supaya
 * fast refresh tetap jalan (react-refresh/only-export-components).
 */

export function zoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/** Rona LED: nominal (100%), diperbesar, atau di bawah lantai teks 12px. */
export type ZoomTone = 'nominal' | 'up' | 'below';
export function zoomTone(zoom: number): ZoomTone {
  if (isBelowTextFloor(zoom)) return 'below';
  return zoom === 1 ? 'nominal' : 'up';
}

function subscribePointer(onChange: () => void) {
  const query = window.matchMedia?.('(pointer: fine)');
  query?.addEventListener?.('change', onChange);
  return () => query?.removeEventListener?.('change', onChange);
}

/** Token Padat hanya berlaku di pointer presisi (tokens.css). */
export function usePointerFine(): boolean {
  return useSyncExternalStore(
    subscribePointer,
    () => window.matchMedia?.('(pointer: fine)').matches ?? true,
    () => true,
  );
}
