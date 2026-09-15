import { describe, expect, it } from 'vitest';
import type { ServiceSparepart } from '@/data/types';
import {
  applyPartWarranty,
  latestPartWarranty,
  partWarranties,
  warrantyDecided,
} from './services';

const part = (name: string, over: Partial<ServiceSparepart> = {}): ServiceSparepart => ({
  itemId: null,
  name,
  qty: 1,
  costPrice: 100,
  sellPrice: 0,
  deducted: false,
  kind: 'manual',
  ...over,
});

describe('garansi per sparepart', () => {
  it('menghitung tanggal per part dari tanggal selesai; 0 = tanpa garansi', () => {
    const parts = applyPartWarranty([part('LCD'), part('Baterai'), part('Lem')], [30, 90, 0], '2026-09-14');
    expect(parts.map((p) => [p.warrantyDays, p.warrantyUntil])).toEqual([
      [30, '2026-10-14'],
      [90, '2026-12-13'],
      [0, null],
    ]);
  });

  it('tanggal tiket = part paling akhir; null bila semua tanpa garansi', () => {
    const parts = applyPartWarranty([part('LCD'), part('Baterai')], [30, 90], '2026-09-14');
    expect(latestPartWarranty(parts)).toBe('2026-12-13');
    expect(latestPartWarranty(applyPartWarranty([part('Lem')], [0], '2026-09-14'))).toBeNull();
  });

  it('hanya part yang sudah diatur ikut tampil; part belum diatur dilewati', () => {
    const parts = [
      part('LCD', { warrantyDays: 30, warrantyUntil: '2026-10-14' }),
      part('Lem', { warrantyDays: 0, warrantyUntil: null }),
      part('Kabel'),
    ];
    expect(partWarranties(parts)).toEqual([
      { name: 'LCD', until: '2026-10-14' },
      { name: 'Lem', until: null },
    ]);
  });

  it('"tanpa garansi" hanya bermakna setelah tiket melewati Selesai', () => {
    expect(warrantyDecided({ status: 'selesai' })).toBe(true);
    expect(warrantyDecided({ status: 'lunas' })).toBe(true);
    expect(warrantyDecided({ status: 'pengerjaan' })).toBe(false);
    expect(warrantyDecided({ status: 'batal' })).toBe(false);
  });
});
