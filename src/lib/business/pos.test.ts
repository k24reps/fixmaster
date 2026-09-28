import { describe, it, expect } from 'vitest';
import {
  cartSubtotal,
  resolveDiscount,
  discountLimit,
  cartTotal,
  cartCogs,
  validateCart,
  checkoutStockDeltas,
  voidStockDeltas,
  settleTender,
  changeRowIndex,
  cashSuggestions,
  pickOnEnter,
  groupSalesByDay,
  type CartItem,
} from './pos';
import type { SaleLine } from '@/data/types';

const item = (over: Partial<CartItem>): CartItem => ({
  itemId: 'i1', name: 'RAM', qty: 1, sellPrice: 100000, costPrice: 60000, stock: 10, ...over,
});

describe('cart math', () => {
  const cart = [item({ qty: 2, sellPrice: 100000, costPrice: 60000 }), item({ itemId: 'i2', qty: 1, sellPrice: 50000, costPrice: 30000 })];
  it('computes subtotal', () => {
    expect(cartSubtotal(cart)).toBe(250000);
  });
  it('computes COGS', () => {
    expect(cartCogs(cart)).toBe(150000);
  });
});

describe('resolveDiscount', () => {
  it('resolves a percentage', () => {
    expect(resolveDiscount(200000, 10, 'percent')).toBe(20000);
  });
  it('resolves a fixed amount', () => {
    expect(resolveDiscount(200000, 25000, 'amount')).toBe(25000);
  });
  it('clamps discount to subtotal', () => {
    expect(resolveDiscount(100000, 150000, 'amount')).toBe(100000);
    expect(resolveDiscount(100000, 200, 'percent')).toBe(100000);
  });
  it('ignores non-positive discount', () => {
    expect(resolveDiscount(100000, 0, 'percent')).toBe(0);
    expect(resolveDiscount(100000, -5, 'amount')).toBe(0);
  });
});

describe('cartTotal', () => {
  it('subtracts the resolved discount', () => {
    const cart = [item({ qty: 2, sellPrice: 100000 })];
    expect(cartTotal(cart, 10, 'percent')).toBe(180000);
    expect(cartTotal(cart, 50000, 'amount')).toBe(150000);
  });
});

describe('validateCart', () => {
  it('rejects an empty cart', () => {
    expect(validateCart([]).ok).toBe(false);
  });
  it('rejects over-sell beyond stock', () => {
    const r = validateCart([item({ qty: 11, stock: 10 })]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('Stok');
  });
  it('accepts a valid cart', () => {
    expect(validateCart([item({ qty: 2, stock: 5 })]).ok).toBe(true);
  });
});

describe('discountLimit', () => {
  it('karyawan dibatasi 10% dari subtotal; manager bebas', () => {
    expect(discountLimit(200000, false)).toBe(20000);
    expect(discountLimit(200000, true)).toBe(200000);
  });
});

describe('stock deltas', () => {
  it('deducts on checkout', () => {
    expect(checkoutStockDeltas([item({ itemId: 'a', qty: 3 })])).toEqual([{ itemId: 'a', delta: -3 }]);
  });
  it('restores on void', () => {
    const lines: SaleLine[] = [{ itemId: 'a', name: 'A', qty: 3, sellPrice: 1, costPrice: 1 }];
    expect(voidStockDeltas(lines)).toEqual([{ itemId: 'a', delta: 3 }]);
  });
});

describe('settleTender', () => {
  it('pas: alokasi = uang diterima, tanpa kembalian', () => {
    const r = settleTender([{ walletId: 'qris', amount: 200000 }], 200000);
    expect(r).toMatchObject({ ok: true, due: 0, change: 0, excess: false });
    expect(r.allocations).toEqual([{ walletId: 'qris', amount: 200000 }]);
  });
  it('kurang: melaporkan sisa', () => {
    expect(settleTender([{ walletId: 'tunai', amount: 50000 }], 200000)).toMatchObject({ ok: false, due: 150000 });
  });
  it('lebih: kembalian dipotong dari baris terakhir, total tercatat = total transaksi', () => {
    const r = settleTender(
      [{ walletId: 'qris', amount: 1000000 }, { walletId: 'tunai', amount: 1500000 }],
      2200000,
    );
    expect(r).toMatchObject({ ok: true, change: 300000, changeWalletId: 'tunai' });
    expect(r.allocations).toEqual([
      { walletId: 'qris', amount: 1000000 },
      { walletId: 'tunai', amount: 1200000 },
    ]);
  });
  it('baris lain sudah menutup total: ditolak, bukan kembalian negatif', () => {
    const r = settleTender(
      [{ walletId: 'qris', amount: 2200000 }, { walletId: 'tunai', amount: 100000 }],
      2200000,
    );
    expect(r).toMatchObject({ ok: false, excess: true });
  });
  it('baris nol diabaikan', () => {
    const r = settleTender([{ walletId: 'a', amount: 0 }, { walletId: 'b', amount: 100 }], 100);
    expect(r.allocations).toEqual([{ walletId: 'b', amount: 100 }]);
  });
});

describe('cashSuggestions', () => {
  it('pas lalu pecahan bulat ke atas, tanpa kembar', () => {
    expect(cashSuggestions(4095000)).toEqual([4095000, 4100000, 4500000, 5000000]);
    expect(cashSuggestions(2200000)).toEqual([2200000, 2500000, 3000000]);
    expect(cashSuggestions(0)).toEqual([]);
  });
});

describe('pickOnEnter', () => {
  const inv = [
    { id: 'a', sku: 'SSD-512', stock: 3, name: 'SSD' },
    { id: 'b', sku: 'KB-1', stock: 1, name: 'Keyboard A' },
    { id: 'c', sku: 'KB-2', stock: 0, name: 'Keyboard B' },
  ];
  it('SKU persis menang (pemindai barcode)', () => {
    expect(pickOnEnter(inv, [], 'ssd-512')?.id).toBe('a');
  });
  it('satu-satunya hasil yang bisa dijual', () => {
    expect(pickOnEnter(inv, [inv[1], inv[2]], 'keyboard')?.id).toBe('b');
  });
  it('beberapa hasil atau kosong: tidak menebak', () => {
    expect(pickOnEnter(inv, [inv[0], inv[1]], 's')).toBeNull();
    expect(pickOnEnter(inv, inv, '  ')).toBeNull();
  });
});

describe('groupSalesByDay', () => {
  it('mengelompokkan per tanggal; transaksi batal tak ikut total', () => {
    const days = groupSalesByDay([
      { date: '2026-09-28', total: 100, voided: false },
      { date: '2026-09-28', total: 50, voided: true },
      { date: '2026-09-27', total: 70, voided: false },
    ]);
    expect(days.map((d) => [d.date, d.total, d.count, d.rows.length])).toEqual([
      ['2026-09-28', 100, 1, 2],
      ['2026-09-27', 70, 1, 1],
    ]);
  });
});

describe('settleTender dengan wallet tunai', () => {
  const cash = new Set(['tunai']);
  it('kembalian selalu dari tunai walau tunai diisi lebih dulu', () => {
    const r = settleTender(
      [{ walletId: 'tunai', amount: 500000 }, { walletId: 'qris', amount: 1500000 }],
      1800000,
      cash,
    );
    expect(r).toMatchObject({ ok: true, change: 200000, changeWalletId: 'tunai' });
    expect(r.allocations).toEqual([{ walletId: 'tunai', amount: 300000 }, { walletId: 'qris', amount: 1500000 }]);
  });
  it('non-tunai yang sudah menutup total = lebih bayar, bukan kembalian', () => {
    const r = settleTender([{ walletId: 'tunai', amount: 100000 }, { walletId: 'qris', amount: 900000 }], 800000, cash);
    expect(r).toMatchObject({ ok: false, excess: true });
  });
  it('tanpa wallet tunai: baris terakhir', () => {
    expect(changeRowIndex([{ walletId: 'a', amount: 1 }, { walletId: 'b', amount: 1 }])).toBe(1);
    expect(changeRowIndex([{ walletId: 'tunai', amount: 1 }, { walletId: 'b', amount: 1 }], cash)).toBe(0);
  });
});
