import { describe, expect, it } from 'vitest';
import { categoryOf, countCategories } from './catalogView';

describe('countCategories', () => {
  it('menghitung per kategori, urut nama, dan kategori kosong jadi satu kelompok', () => {
    const items = [
      { category: 'Sparepart' },
      { category: 'Consumable' },
      { category: 'Sparepart' },
      { category: '' },
      { category: '   ' },
    ];
    expect(countCategories(items)).toEqual([
      ['Consumable', 1],
      ['Sparepart', 2],
      ['Tanpa kategori', 2],
    ]);
  });

  it('filter dan chip memakai nama yang sama untuk kategori kosong', () => {
    expect(categoryOf('')).toBe('Tanpa kategori');
    expect(categoryOf(' LCD ')).toBe('LCD');
  });
});
