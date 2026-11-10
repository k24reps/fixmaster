/**
 * Keadaan stok barang untuk Kasir & Stok, badge sidebar, dan peringatan
 * Dashboard. Ketiganya menampilkan angka yang sama, jadi aturannya satu di
 * sini. nav_counts (0081) menghitung ulang di server dengan aturan yang sama
 * persis: habis = stok <= 0, menipis = 0 < stok <= stok minimum.
 */

interface Stocked {
  stock: number;
  minStock: number;
}

export type StockState = 'out' | 'low' | 'ok';
/** Saringan di strip ringkasan: Semua, Menipis, Habis. */
export type StockFilter = 'all' | 'low' | 'out';

export function stockState(item: Stocked): StockState {
  if (item.stock <= 0) return 'out';
  if (item.stock <= item.minStock) return 'low';
  return 'ok';
}

/** Nilai `?stock=` dari tautan Dashboard / alamat lama /inventory. */
export function parseStockFilter(value: string | null): StockFilter {
  return value === 'low' || value === 'out' ? value : 'all';
}

export interface StockSummary {
  total: number;
  low: number;
  out: number;
  /** Modal tertanam di stok (HPP × stok). Hanya untuk owner/admin. */
  value: number;
}

export function stockSummary(items: (Stocked & { costPrice: number })[]): StockSummary {
  let low = 0;
  let out = 0;
  let value = 0;
  for (const item of items) {
    const state = stockState(item);
    if (state === 'out') out++;
    else if (state === 'low') low++;
    value += item.costPrice * Math.max(0, item.stock);
  }
  return { total: items.length, low, out, value };
}

interface CatalogItem extends Stocked {
  name: string;
  category: string;
  sku?: string | null;
}

/** Cocok bila kata kunci ada di nama, kategori, atau SKU (huruf besar/kecil sama). */
export function matchesCatalogQuery(item: CatalogItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    item.name.toLowerCase().includes(q) ||
    item.category.toLowerCase().includes(q) ||
    (item.sku ?? '').toLowerCase().includes(q)
  );
}

/**
 * Urutan katalog. Semua: yang bisa dijual dulu, barang habis di belakang
 * (tetap tampil, redup) supaya kasir tak mengira barangnya tak terdaftar.
 * Menipis: stok paling sedikit dulu, itu yang paling mendesak dibeli.
 * Di luar itu urutan asal dipertahankan.
 */
export function sortCatalog<T extends Stocked>(items: T[], filter: StockFilter): T[] {
  if (filter === 'low') return [...items].sort((a, b) => a.stock - b.stock);
  return [...items].sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0));
}

/** Saring keadaan stok, lalu kategori dan kata kunci, lalu urutkan. */
export function filterCatalog<T extends CatalogItem>(
  items: T[],
  opts: { stock: StockFilter; query: string; inCategory?: (item: T) => boolean },
): T[] {
  const { stock, query, inCategory } = opts;
  return sortCatalog(
    items.filter(
      (i) =>
        (stock === 'all' || stockState(i) === stock) &&
        (!inCategory || inCategory(i)) &&
        matchesCatalogQuery(i, query),
    ),
    stock,
  );
}
