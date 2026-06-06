import { describe, it, expect } from 'vitest';
import {
  canTransition,
  nextStatuses,
  canSetStatus,
  shouldDeductStock,
  computeStockDeduction,
  outstandingBalance,
  sparepartCost,
  serviceProfit,
  isTerminal,
  isActive,
  isUnderWarranty,
  canClaimWarranty,
} from './services';
import type { ServiceSparepart } from '@/data/types';

describe('status machine', () => {
  it('allows valid transitions', () => {
    expect(canTransition('diterima', 'diagnosa')).toBe(true);
    expect(canTransition('selesai', 'lunas')).toBe(true);
    expect(canTransition('konfirmasi', 'pengerjaan')).toBe(true);
  });
  it('rejects invalid transitions', () => {
    expect(canTransition('diterima', 'lunas')).toBe(false);
    expect(canTransition('lunas', 'pengerjaan')).toBe(false);
  });
  it('lists next statuses', () => {
    expect(nextStatuses('konfirmasi')).toEqual(['tunggu', 'pengerjaan', 'batal']);
    expect(nextStatuses('lunas')).toEqual([]);
  });
  it('detects terminal + active states', () => {
    expect(isTerminal('lunas')).toBe(true);
    expect(isTerminal('batal')).toBe(true);
    expect(isTerminal('pengerjaan')).toBe(false);
    expect(isActive('pengerjaan')).toBe(true);
    expect(isActive('lunas')).toBe(false);
  });
});

describe('role gates', () => {
  it('lets owner/admin set any status', () => {
    expect(canSetStatus('owner', 'lunas')).toBe(true);
    expect(canSetStatus('admin', 'batal')).toBe(true);
  });
  it('blocks staff from confirm/settle/cancel', () => {
    expect(canSetStatus('karyawan', 'konfirmasi')).toBe(false);
    expect(canSetStatus('karyawan', 'lunas')).toBe(false);
    expect(canSetStatus('karyawan', 'batal')).toBe(false);
  });
  it('lets staff set work statuses', () => {
    expect(canSetStatus('karyawan', 'pengerjaan')).toBe(true);
    expect(canSetStatus('karyawan', 'selesai')).toBe(true);
  });
});

describe('deferred stock deduction', () => {
  const sp = (over: Partial<ServiceSparepart>): ServiceSparepart => ({
    itemId: 'i1', name: 'RAM', qty: 1, costPrice: 100, sellPrice: 200, deducted: false, ...over,
  });

  it('only deducts at pengerjaan', () => {
    expect(shouldDeductStock('diterima')).toBe(false);
    expect(shouldDeductStock('pengerjaan')).toBe(true);
  });
  it('deducts only not-yet-deducted items', () => {
    const parts = [sp({ itemId: 'a', qty: 2 }), sp({ itemId: 'b', deducted: true })];
    const { deductions, updated } = computeStockDeduction(parts, 'pengerjaan');
    expect(deductions).toEqual([{ itemId: 'a', qty: 2 }]);
    expect(updated.every((p) => p.deducted)).toBe(true);
  });
  it('does nothing for non-deducting statuses', () => {
    const parts = [sp({})];
    const { deductions, updated } = computeStockDeduction(parts, 'diagnosa');
    expect(deductions).toEqual([]);
    expect(updated[0].deducted).toBe(false);
  });
});

describe('money helpers', () => {
  const parts: ServiceSparepart[] = [
    { itemId: 'a', name: 'A', qty: 2, costPrice: 50000, sellPrice: 80000, deducted: false },
    { itemId: 'b', name: 'B', qty: 1, costPrice: 30000, sellPrice: 50000, deducted: false },
  ];
  it('computes outstanding balance', () => {
    expect(outstandingBalance({ finalCost: 500000, downPayment: 200000 })).toBe(300000);
    expect(outstandingBalance({ finalCost: 100000, downPayment: 150000 })).toBe(0);
  });
  it('computes sparepart cost (HPP)', () => {
    expect(sparepartCost(parts)).toBe(130000);
  });
  it('computes service profit', () => {
    expect(serviceProfit({ finalCost: 500000, spareparts: parts })).toBe(370000);
  });
});

describe('warranty claim eligibility', () => {
  it('isUnderWarranty is true while EITHER service or parts warranty is valid (inclusive)', () => {
    // Service only
    expect(
      isUnderWarranty({ warrantyServiceUntil: '2026-07-01', warrantyPartsUntil: null }, '2026-06-15'),
    ).toBe(true);
    // Parts outlast service: still covered after service expires
    expect(
      isUnderWarranty({ warrantyServiceUntil: '2026-06-10', warrantyPartsUntil: '2026-07-01' }, '2026-06-20'),
    ).toBe(true);
    // Inclusive of the last day
    expect(
      isUnderWarranty({ warrantyServiceUntil: '2026-07-01', warrantyPartsUntil: null }, '2026-07-01'),
    ).toBe(true);
    // Past both dates
    expect(
      isUnderWarranty({ warrantyServiceUntil: '2026-07-01', warrantyPartsUntil: '2026-06-20' }, '2026-07-02'),
    ).toBe(false);
    // Neither set
    expect(
      isUnderWarranty({ warrantyServiceUntil: null, warrantyPartsUntil: null }, '2026-06-15'),
    ).toBe(false);
  });

  it('canClaimWarranty only for settled, in-warranty, non-claim tickets', () => {
    const base = {
      status: 'lunas' as const,
      warrantyServiceUntil: '2026-07-01',
      warrantyPartsUntil: '2026-06-15',
      warrantyClaimOf: null,
    };
    expect(canClaimWarranty(base, '2026-06-15')).toBe(true);
    // not settled yet
    expect(canClaimWarranty({ ...base, status: 'selesai' }, '2026-06-15')).toBe(false);
    // both warranties expired
    expect(canClaimWarranty(base, '2026-08-01')).toBe(false);
    // already a claim ticket
    expect(canClaimWarranty({ ...base, warrantyClaimOf: 's-original' }, '2026-06-15')).toBe(false);
  });
});
