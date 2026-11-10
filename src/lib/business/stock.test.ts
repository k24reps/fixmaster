import { describe, expect, it } from 'vitest';
import {
  filterCatalog,
  matchesCatalogQuery,
  parseStockFilter,
  sortCatalog,
  stockState,
  stockSummary,
} from './stock';

const item = (name: string, stock: number, minStock: number, extra: Partial<{ category: string; sku: string | null; costPrice: number }> = {}) => ({
  name,
  stock,
  minStock,
  category: extra.category ?? 'Sparepart',
  sku: extra.sku ?? null,
  costPrice: extra.costPrice ?? 0,
});

describe('stockState', () => {
  it('habis = stok <= 0, menipis = 0 < stok <= minimum (sama dengan nav_counts 0081)', () => {
    expect(stockState(item('a', 0, 2))).toBe('out');
    expect(stockState(item('a', -1, 2))).toBe('out');
    expect(stockState(item('a', 2, 2))).toBe('low');
    expect(stockState(item('a', 1, 2))).toBe('low');
    expect(stockState(item('a', 3, 2))).toBe('ok');
    // Minimum 0: barang dengan stok 1 tetap aman.
    expect(stockState(item('a', 1, 0))).toBe('ok');
  });
});

describe('parseStockFilter', () => {
  it('menerima low/out/ok, sisanya Semua', () => {
    expect(parseStockFilter('low')).toBe('low');
    expect(parseStockFilter('out')).toBe('out');
    expect(parseStockFilter('ok')).toBe('ok');
    expect(parseStockFilter(null)).toBe('all');
    expect(parseStockFilter('habis')).toBe('all');
  });
});

describe('stockSummary', () => {
  it('menghitung habis, menipis, dan nilai modal', () => {
    const s = stockSummary([
      item('a', 0, 2, { costPrice: 100 }),
      item('b', 1, 2, { costPrice: 50 }),
      item('c', 5, 2, { costPrice: 10 }),
    ]);
    expect(s).toEqual({ total: 3, out: 1, low: 1, value: 50 + 50 });
  });

  it('stok minus tidak mengurangi nilai stok', () => {
    expect(stockSummary([item('a', -2, 0, { costPrice: 100 })]).value).toBe(0);
  });
});

describe('matchesCatalogQuery', () => {
  const lcd = item('LCD iPhone 12', 2, 1, { category: 'Layar', sku: 'LCD-IP12' });
  it('cocok di nama, kategori, atau SKU tanpa peduli huruf besar', () => {
    expect(matchesCatalogQuery(lcd, 'iphone')).toBe(true);
    expect(matchesCatalogQuery(lcd, 'layar')).toBe(true);
    expect(matchesCatalogQuery(lcd, 'lcd-ip')).toBe(true);
    expect(matchesCatalogQuery(lcd, '  ')).toBe(true);
    expect(matchesCatalogQuery(lcd, 'baterai')).toBe(false);
  });
});

describe('sortCatalog', () => {
  it('Semua: barang habis ke belakang, urutan lain dipertahankan', () => {
    const list = [item('habis', 0, 1), item('b', 3, 1), item('c', 1, 1)];
    expect(sortCatalog(list, 'all').map((i) => i.name)).toEqual(['b', 'c', 'habis']);
  });

  it('Menipis: stok paling sedikit dulu', () => {
    const list = [item('a', 3, 5), item('b', 1, 5), item('c', 2, 5)];
    expect(sortCatalog(list, 'low').map((i) => i.name)).toEqual(['b', 'c', 'a']);
  });
});

describe('filterCatalog', () => {
  const list = [
    item('Baterai A1964', 0, 3, { category: 'Baterai' }),
    item('LCD iPhone 12', 2, 2, { category: 'Layar' }),
    item('SSD 512GB', 10, 4, { category: 'Storage' }),
    item('LCD Samsung A50', 8, 2, { category: 'Layar' }),
  ];

  it('Semua menampilkan barang habis di akhir, tidak disembunyikan', () => {
    expect(filterCatalog(list, { stock: 'all', query: '' }).map((i) => i.name)).toEqual([
      'LCD iPhone 12',
      'SSD 512GB',
      'LCD Samsung A50',
      'Baterai A1964',
    ]);
  });

  it('menggabungkan filter stok, kategori, dan kata kunci', () => {
    const layar = (i: (typeof list)[number]) => i.category === 'Layar';
    expect(filterCatalog(list, { stock: 'all', query: 'lcd', inCategory: layar }).map((i) => i.name)).toEqual([
      'LCD iPhone 12',
      'LCD Samsung A50',
    ]);
    expect(filterCatalog(list, { stock: 'low', query: '', inCategory: layar }).map((i) => i.name)).toEqual([
      'LCD iPhone 12',
    ]);
    expect(filterCatalog(list, { stock: 'out', query: '' }).map((i) => i.name)).toEqual(['Baterai A1964']);
  });
});
