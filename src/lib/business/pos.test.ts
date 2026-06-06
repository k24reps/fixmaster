import { describe, it, expect } from 'vitest';
import {
  cartSubtotal,
  resolveDiscount,
  cartTotal,
  cartCogs,
  validateCart,
  validatePayments,
  checkoutStockDeltas,
  voidStockDeltas,
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

describe('validatePayments', () => {
  it('accepts payments equal to total', () => {
    const r = validatePayments([{ walletId: 'w1', amount: 100000 }], 100000);
    expect(r.ok).toBe(true);
    expect(r.diff).toBe(0);
  });
  it('accepts multi-wallet split that sums to total', () => {
    const r = validatePayments(
      [{ walletId: 'w1', amount: 60000 }, { walletId: 'w2', amount: 40000 }],
      100000,
    );
    expect(r.ok).toBe(true);
  });
  it('rejects underpayment and reports diff', () => {
    const r = validatePayments([{ walletId: 'w1', amount: 80000 }], 100000);
    expect(r.ok).toBe(false);
    expect(r.diff).toBe(-20000);
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
