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
  costCorrectionDescription,
  partsStockDelta,
  openClaimFor,
  claimableItems,
  serviceNoFromCorrection,
  splitTotal,
  normalizeSplits,
  validateSplit,
  dpIncomeDescription,
  settlementIncomeDescription,
  isTerminal,
  isActive,
  isAwaitingPickup,
  isUnderWarranty,
  canClaimWarranty,
} from './services';
import type { ServiceSparepart } from '@/data/types';

describe('status machine', () => {
  it('allows valid transitions', () => {
    expect(canTransition('diterima', 'diagnosa')).toBe(true);
    expect(canTransition('selesai', 'lunas')).toBe(true);
    // Salah tandai Selesai bisa dibuka lagi; unit yang tak ditebus bisa dibatalkan.
    expect(canTransition('selesai', 'pengerjaan')).toBe(true);
    expect(canTransition('selesai', 'batal')).toBe(true);
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
  it('detects awaiting-pickup (closed but uncollected)', () => {
    // Closed/done statuses that are not yet collected → awaiting pickup.
    expect(isAwaitingPickup({ status: 'selesai', pickedUp: false })).toBe(true);
    expect(isAwaitingPickup({ status: 'lunas', pickedUp: false })).toBe(true);
    expect(isAwaitingPickup({ status: 'batal', pickedUp: false })).toBe(true);
    // Already collected → not awaiting, regardless of status.
    expect(isAwaitingPickup({ status: 'lunas', pickedUp: true })).toBe(false);
    // Still in progress → not awaiting pickup even if uncollected.
    expect(isAwaitingPickup({ status: 'pengerjaan', pickedUp: false })).toBe(false);
    expect(isAwaitingPickup({ status: 'diterima', pickedUp: false })).toBe(false);
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

describe('partsStockDelta', () => {
  const part = (itemId: string | null, qty: number, over: Partial<ServiceSparepart> = {}): ServiceSparepart => ({
    itemId,
    name: itemId ?? 'Modal',
    qty,
    costPrice: 0,
    sellPrice: 0,
    deducted: true,
    ...over,
  });
  it('tambah baris = ambil dari rak, hapus baris = kembali ke rak', () => {
    expect(partsStockDelta([], [part('a', 2)])).toEqual([{ itemId: 'a', delta: -2 }]);
    expect(partsStockDelta([part('a', 2), part('b', 1)], [part('b', 1)])).toEqual([{ itemId: 'a', delta: 2 }]);
  });
  it('baris lama baru mengambil stok saat ditandai deducted; baris modal tidak menyentuh stok', () => {
    expect(partsStockDelta([part('a', 3, { deducted: false })], [part('a', 3)])).toEqual([{ itemId: 'a', delta: -3 }]);
    expect(partsStockDelta([], [part(null, 1, { kind: 'manual', deducted: false })])).toEqual([]);
  });
});

describe('claimableItems', () => {
  it('hanya jasa & part yang garansinya masih berlaku; part lama memakai garansi part tiket', () => {
    const part = (name: string, over: Partial<ServiceSparepart> = {}): ServiceSparepart => ({
      itemId: null,
      name,
      qty: 1,
      costPrice: 0,
      sellPrice: 0,
      deducted: false,
      ...over,
    });
    const items = claimableItems(
      {
        warrantyServiceUntil: '2026-09-10', // sudah habis
        warrantyPartsUntil: '2026-10-01',
        spareparts: [
          part('Baterai', { warrantyDays: 90, warrantyUntil: '2026-12-01' }),
          part('LCD', { warrantyDays: 7, warrantyUntil: '2026-09-01' }), // sudah habis
          part('Konektor'), // tiket lama tanpa garansi per part
        ],
      },
      '2026-09-15',
    );
    expect(items).toEqual([
      { kind: 'part', name: 'Baterai', until: '2026-12-01' },
      { kind: 'part', name: 'Konektor', until: '2026-10-01' },
    ]);
  });
});

describe('openClaimFor', () => {
  it('hanya klaim yang belum Lunas/Batal yang menghalangi klaim baru', () => {
    const claims = [
      { warrantyClaimOf: 'o1', status: 'lunas' as const, serviceNo: 'K1' },
      { warrantyClaimOf: 'o1', status: 'pengerjaan' as const, serviceNo: 'K2' },
    ];
    expect(openClaimFor(claims, 'o1')?.serviceNo).toBe('K2');
    expect(openClaimFor(claims.slice(0, 1), 'o1')).toBeUndefined();
  });
});

describe('DP & settlement helpers', () => {
  it('settlementAmount = final − DP, floored at 0', () => {
    expect(settlementAmount(500000, 200000)).toBe(300000);
    expect(settlementAmount(150000, 150000)).toBe(0);
    expect(settlementAmount(100000, 150000)).toBe(0); // DP over-covers → no negative
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
    // Dicocokkan RPC correct_service_cost (0063) — string yang sama persis.
    expect(costCorrectionDescription('SRV-1')).toBe('Koreksi biaya servis SRV-1');
    expect(serviceNoFromCorrection('Koreksi biaya servis SRV-1')).toBe('SRV-1');
    expect(serviceNoFromCorrection('Pelunasan servis SRV-1')).toBeNull();
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
