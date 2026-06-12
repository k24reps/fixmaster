import { describe, it, expect } from 'vitest';
import {
  canTransition,
  nextStatuses,
  canSetStatus,
  shouldDeductStock,
  computeStockDeduction,
  computeStockRestore,
  outstandingBalance,
  sparepartCost,
  serviceModalTotal,
  serviceProfit,
  walletDeltasForModalEdit,
  settlementAmount,
  settlementCorrectionDelta,
  splitTotal,
  normalizeSplits,
  validateSplit,
  dpIncomeDescription,
  settlementIncomeDescription,
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
  it('blocks staff from settle/cancel', () => {
    expect(canSetStatus('karyawan', 'lunas')).toBe(false);
    expect(canSetStatus('karyawan', 'batal')).toBe(false);
  });
  it('lets staff set work statuses (full pipeline incl. konfirmasi)', () => {
    expect(canSetStatus('karyawan', 'konfirmasi')).toBe(true);
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
  it('skips manual "modal dadakan" lines (no stock to deduct)', () => {
    const parts = [
      sp({ itemId: 'a', qty: 2 }),
      sp({ itemId: null, kind: 'manual', name: 'Beli baut', qty: 1 }),
    ];
    const { deductions, updated } = computeStockDeduction(parts, 'pengerjaan');
    expect(deductions).toEqual([{ itemId: 'a', qty: 2 }]);
    // Manual line is never marked deducted (it has no stock).
    expect(updated.find((p) => p.kind === 'manual')!.deducted).toBe(false);
  });
});

describe('stock restore on cancel', () => {
  const sp = (over: Partial<ServiceSparepart>): ServiceSparepart => ({
    itemId: 'i1', name: 'RAM', qty: 1, costPrice: 100, sellPrice: 200, deducted: false, ...over,
  });

  it('restores only deducted inventory lines and clears their flag', () => {
    const parts = [
      sp({ itemId: 'a', qty: 2, deducted: true }),
      sp({ itemId: 'b', qty: 1, deducted: false }), // never deducted → nothing to give back
    ];
    const { restorations, updated } = computeStockRestore(parts);
    expect(restorations).toEqual([{ itemId: 'a', qty: 2 }]);
    expect(updated[0].deducted).toBe(false); // flipped → no double-restore
    expect(updated[1].deducted).toBe(false);
  });
  it('skips manual lines (no stock; cash reversed via Expense)', () => {
    const parts = [
      sp({ itemId: 'a', qty: 1, deducted: true }),
      sp({ itemId: null, kind: 'manual', name: 'Beli baut', qty: 1, deducted: false }),
    ];
    const { restorations } = computeStockRestore(parts);
    expect(restorations).toEqual([{ itemId: 'a', qty: 1 }]);
  });
  it('is a no-op when nothing was deducted', () => {
    const parts = [sp({ itemId: 'a' }), sp({ itemId: 'b' })];
    const { restorations, updated } = computeStockRestore(parts);
    expect(restorations).toEqual([]);
    expect(updated).toEqual(parts);
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
  it('serviceModalTotal sums every cost line incl. manual', () => {
    const withManual: ServiceSparepart[] = [
      ...parts,
      { itemId: null, name: 'Beli LCD luar', qty: 1, costPrice: 70000, sellPrice: 0, deducted: false, kind: 'manual' },
    ];
    expect(serviceModalTotal(withManual)).toBe(200000);
  });
  it('profit subtracts manual modal too', () => {
    const withManual: ServiceSparepart[] = [
      ...parts,
      { itemId: null, name: 'Beli LCD luar', qty: 1, costPrice: 70000, sellPrice: 0, deducted: false, kind: 'manual' },
    ];
    expect(serviceProfit({ finalCost: 500000, spareparts: withManual })).toBe(300000);
  });
  it('handles finalCost = 0 (profit negative by modal)', () => {
    expect(serviceProfit({ finalCost: 0, spareparts: parts })).toBe(-130000);
  });
});

describe('walletDeltasForModalEdit (edit modal dadakan)', () => {
  it('nets to a single delta when amount changes on the same wallet', () => {
    // 100k → 150k on W1: refund +100k, debit −150k → net −50k.
    const d = walletDeltasForModalEdit('w1', 100000, 'w1', 150000);
    expect(d.size).toBe(1);
    expect(d.get('w1')).toBe(-50000);
  });
  it('yields no entries for a no-op edit (same wallet, same amount)', () => {
    const d = walletDeltasForModalEdit('w1', 100000, 'w1', 100000);
    expect(d.size).toBe(0);
  });
  it('refunds old wallet and debits new wallet when wallet changes', () => {
    const d = walletDeltasForModalEdit('w1', 100000, 'w2', 100000);
    expect(d.get('w1')).toBe(100000); // refund
    expect(d.get('w2')).toBe(-100000); // new debit
  });
  it('handles a missing old wallet (older lines without walletId)', () => {
    const d = walletDeltasForModalEdit(null, 0, 'w2', 80000);
    expect(d.size).toBe(1);
    expect(d.get('w2')).toBe(-80000);
  });
});

describe('DP & settlement helpers', () => {
  it('settlementAmount = final − DP, floored at 0', () => {
    expect(settlementAmount(500000, 200000)).toBe(300000);
    expect(settlementAmount(150000, 150000)).toBe(0);
    expect(settlementAmount(100000, 150000)).toBe(0); // DP over-covers → no negative
  });
  it('settlementCorrectionDelta credits when final rises', () => {
    // 300k → 500k, DP 100k: owed 200k → 400k, delta +200k.
    expect(settlementCorrectionDelta(300000, 500000, 100000)).toBe(200000);
  });
  it('settlementCorrectionDelta refunds when final drops', () => {
    expect(settlementCorrectionDelta(500000, 300000, 100000)).toBe(-200000);
  });
  it('settlementCorrectionDelta clamps when DP exceeds the new final', () => {
    // old owed = 400k (final 500k − DP 100k); new final 80k < DP → owed 0.
    expect(settlementCorrectionDelta(500000, 80000, 100000)).toBe(-400000);
  });
  it('splitTotal sums leg amounts', () => {
    expect(splitTotal([{ walletId: 'a', amount: 100000 }, { walletId: 'b', amount: 50000 }])).toBe(150000);
    expect(splitTotal([])).toBe(0);
  });
  it('normalizeSplits drops empty wallets and non-positive amounts', () => {
    const clean = normalizeSplits([
      { walletId: 'a', amount: 100000 },
      { walletId: '', amount: 50000 },
      { walletId: 'b', amount: 0 },
    ]);
    expect(clean).toEqual([{ walletId: 'a', amount: 100000 }]);
  });
  it('validateSplit passes when legs cover the target exactly', () => {
    expect(validateSplit([{ walletId: 'a', amount: 200000 }, { walletId: 'b', amount: 100000 }], 300000)).toBeNull();
    // single-wallet payment is a one-leg split
    expect(validateSplit([{ walletId: 'a', amount: 300000 }], 300000)).toBeNull();
  });
  it('validateSplit flags empty and mismatched totals', () => {
    expect(validateSplit([], 300000)).toBe('empty');
    expect(validateSplit([{ walletId: '', amount: 0 }], 300000)).toBe('empty');
    expect(validateSplit([{ walletId: 'a', amount: 250000 }], 300000)).toBe('mismatch');
    expect(validateSplit([{ walletId: 'a', amount: 350000 }], 300000)).toBe('mismatch');
  });
  it('canonical income descriptions are distinct & service-scoped', () => {
    expect(dpIncomeDescription('SRV-1')).toBe('DP servis SRV-1');
    expect(settlementIncomeDescription('SRV-1')).toBe('Pelunasan servis SRV-1');
    expect(dpIncomeDescription('SRV-1')).not.toBe(settlementIncomeDescription('SRV-1'));
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
