import { useState } from 'react';

/** Pilihan tampilan — dipakai Kasir, Inventori, Pelanggan, dan Servis. */
export const CATALOG_VIEWS = [
  { id: 'cards', icon: 'view-cards', label: 'Tampilan kartu' },
  { id: 'list', icon: 'view-list', label: 'Tampilan daftar' },
  { id: 'tiles', icon: 'view-tiles', label: 'Tampilan ringkas' },
] as const;

export type CatalogView = (typeof CATALOG_VIEWS)[number]['id'];

/**
 * Tampilan diingat per perangkat, per halaman (`storageKey`), supaya kasir atau
 * pengelola stok tak perlu memilih ulang. Tanpa pilihan tersimpan jatuh ke
 * `fallback` (Servis memakai daftar/tabel supaya tampilan lamanya tetap).
 */
export function usePersistedView(storageKey: string, fallback: CatalogView = 'cards') {
  const [view, setView] = useState<CatalogView>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return CATALOG_VIEWS.some((v) => v.id === saved) ? (saved as CatalogView) : fallback;
    } catch {
      return fallback;
    }
  });
  const chooseView = (next: CatalogView) => {
    setView(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Preferensi tampilan bersifat opsional; tanpa storage tetap bekerja.
    }
  };
  return [view, chooseView] as const;
}

/** Nama kategori untuk filter; kosong digabung jadi satu kelompok. */
export const categoryOf = (category: string): string => category.trim() || 'Tanpa kategori';

/** Kategori beserta jumlah itemnya, urut nama. */
export function countCategories(items: { category: string }[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = categoryOf(item.category);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
