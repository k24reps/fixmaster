import { describe, it, expect } from 'vitest';
import {
  validate,
  customerSchema,
  inventoryItemSchema,
  serviceSchema,
  saleSchema,
} from './validators';

describe('customerSchema', () => {
  it('accepts a valid customer', () => {
    const r = validate(customerSchema, { id: '1', name: 'Andi', phone: '08123456789', email: '' });
    expect(r.ok).toBe(true);
  });
  it('rejects a missing name', () => {
    const r = validate(customerSchema, { id: '1', name: '', phone: '0812', email: '' });
    expect(r.ok).toBe(false);
  });
  it('rejects an invalid email', () => {
    const r = validate(customerSchema, { id: '1', name: 'Andi', phone: '0812', email: 'nope' });
    expect(r.ok).toBe(false);
  });
});

describe('inventoryItemSchema', () => {
  it('rejects negative stock', () => {
    const r = validate(inventoryItemSchema, {
      id: '1', name: 'RAM', stock: -1, minStock: 0, costPrice: 100, sellPrice: 200,
    });
    expect(r.ok).toBe(false);
  });
  it('rejects non-integer stock', () => {
    const r = validate(inventoryItemSchema, {
      id: '1', name: 'RAM', stock: 1.5, minStock: 0, costPrice: 100, sellPrice: 200,
    });
    expect(r.ok).toBe(false);
  });
});

describe('serviceSchema', () => {
  it('rejects DP exceeding final cost', () => {
    const r = validate(serviceSchema, {
      id: '1', serviceNo: 'FM-1', customerName: 'Andi', device: 'Laptop',
      estimateCost: 0, finalCost: 100000, downPayment: 200000,
    });
    expect(r.ok).toBe(false);
  });
  it('accepts a valid service with DP under final cost', () => {
    const r = validate(serviceSchema, {
      id: '1', serviceNo: 'FM-1', customerName: 'Andi', device: 'Laptop',
      estimateCost: 0, finalCost: 200000, downPayment: 100000,
    });
    expect(r.ok).toBe(true);
  });
});

describe('saleSchema', () => {
  const base = {
    id: '1', saleNo: 'S-1', date: '2026-06-02', subtotal: 100000, discount: 0, total: 100000,
    lines: [{ itemId: 'i1', qty: 1, sellPrice: 100000 }],
  };
  it('rejects when payments do not equal total', () => {
    const r = validate(saleSchema, { ...base, payments: [{ walletId: 'w1', amount: 50000 }] });
    expect(r.ok).toBe(false);
  });
  it('accepts when payments equal total', () => {
    const r = validate(saleSchema, { ...base, payments: [{ walletId: 'w1', amount: 100000 }] });
    expect(r.ok).toBe(true);
  });
  it('rejects an empty cart', () => {
    const r = validate(saleSchema, { ...base, lines: [], payments: [{ walletId: 'w1', amount: 100000 }] });
    expect(r.ok).toBe(false);
  });
});
