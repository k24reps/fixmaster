import { describe, it, expect } from 'vitest';
import {
  poTotal,
  poOrderedQty,
  poReceivedQty,
  deriveStatus,
  receiveGoods,
  receivedValue,
} from './purchase';
import type { PurchaseOrder, PurchaseOrderLine } from '@/data/types';

const line = (over: Partial<PurchaseOrderLine>): PurchaseOrderLine => ({
  itemId: over.itemId ?? 'i1',
  name: over.name ?? 'RAM',
  qty: over.qty ?? 10,
  costPrice: over.costPrice ?? 50000,
  receivedQty: over.receivedQty ?? 0,
});

const po = (lines: PurchaseOrderLine[], over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'po1',
  orgId: 'o1',
  outletId: null,
  poNumber: 'PO-0001',
  supplierId: 's1',
  status: over.status ?? 'ordered',
  lines,
  orderedAt: null,
  receivedAt: null,
  note: '',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

describe('PO totals', () => {
  const lines = [line({ qty: 10, costPrice: 50000 }), line({ itemId: 'i2', qty: 2, costPrice: 100000 })];
  it('computes total value', () => {
    expect(poTotal(lines)).toBe(700000);
  });
  it('computes ordered and received quantities', () => {
    expect(poOrderedQty(lines)).toBe(12);
    expect(poReceivedQty([line({ receivedQty: 3 })])).toBe(3);
  });
});

describe('deriveStatus', () => {
  it('stays draft/cancelled regardless of receipts', () => {
    expect(deriveStatus([line({ qty: 5, receivedQty: 5 })], 'draft')).toBe('draft');
    expect(deriveStatus([line({ qty: 5, receivedQty: 5 })], 'cancelled')).toBe('cancelled');
  });
  it('becomes received when all lines fully received', () => {
    expect(deriveStatus([line({ qty: 5, receivedQty: 5 })], 'ordered')).toBe('received');
  });
  it('becomes partial when some received', () => {
    expect(deriveStatus([line({ qty: 5, receivedQty: 2 })], 'ordered')).toBe('partial');
  });
  it('stays ordered when nothing received', () => {
    expect(deriveStatus([line({ qty: 5, receivedQty: 0 })], 'ordered')).toBe('ordered');
  });
});

describe('receiveGoods', () => {
  it('applies receipts and returns stock deltas', () => {
    const order = po([line({ itemId: 'a', qty: 10, receivedQty: 0 })]);
    const result = receiveGoods(order, { a: 4 });
    expect(result.stockDeltas).toEqual([{ itemId: 'a', delta: 4 }]);
    expect(result.lines[0].receivedQty).toBe(4);
    expect(result.status).toBe('partial');
  });

  it('clamps receipts to the remaining ordered quantity', () => {
    const order = po([line({ itemId: 'a', qty: 10, receivedQty: 8 })]);
    const result = receiveGoods(order, { a: 5 }); // only 2 remaining
    expect(result.stockDeltas).toEqual([{ itemId: 'a', delta: 2 }]);
    expect(result.lines[0].receivedQty).toBe(10);
    expect(result.status).toBe('received');
  });

  it('ignores items with zero receipt', () => {
    const order = po([line({ itemId: 'a', qty: 10 }), line({ itemId: 'b', qty: 5 })]);
    const result = receiveGoods(order, { a: 0, b: 5 });
    expect(result.stockDeltas).toEqual([{ itemId: 'b', delta: 5 }]);
  });

  it('marks fully received when all lines complete', () => {
    const order = po([line({ itemId: 'a', qty: 3 }), line({ itemId: 'b', qty: 2 })]);
    const result = receiveGoods(order, { a: 3, b: 2 });
    expect(result.status).toBe('received');
  });
});

describe('receivedValue', () => {
  it('values goods received now (full)', () => {
    const order = po([line({ itemId: 'a', qty: 10, costPrice: 50000 })]);
    expect(receivedValue(order, { a: 10 })).toBe(500000);
  });

  it('values only the partial qty received now', () => {
    const order = po([line({ itemId: 'a', qty: 10, costPrice: 50000 })]);
    expect(receivedValue(order, { a: 4 })).toBe(200000);
  });

  it('clamps over-entry to the remaining qty', () => {
    const order = po([line({ itemId: 'a', qty: 10, costPrice: 50000, receivedQty: 8 })]);
    // Only 2 remaining → value caps at 2 × 50000.
    expect(receivedValue(order, { a: 5 })).toBe(100000);
  });

  it('sums across multiple lines', () => {
    const order = po([
      line({ itemId: 'a', qty: 10, costPrice: 50000 }),
      line({ itemId: 'b', qty: 2, costPrice: 100000 }),
    ]);
    expect(receivedValue(order, { a: 3, b: 2 })).toBe(350000);
  });

  it('is zero when nothing received', () => {
    const order = po([line({ itemId: 'a', qty: 10, costPrice: 50000 })]);
    expect(receivedValue(order, { a: 0 })).toBe(0);
  });
});
