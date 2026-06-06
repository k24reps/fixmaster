/**
 * Pure POS (point-of-sale) business logic: cart math, discounts,
 * multi-wallet payment allocation, and void calculations.
 * No DOM/repository dependencies → fully unit-testable.
 */
import type { SaleLine, PaymentAllocation } from '@/data/types';

export interface CartItem {
  itemId: string;
  name: string;
  qty: number;
  sellPrice: number;
  costPrice: number;
  /** Available stock, for over-sell validation. */
  stock: number;
}

export type DiscountType = 'percent' | 'amount';

/** Sum of line item prices before discount. */
export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.sellPrice * i.qty, 0);
}

/** Resolve a discount (percent or fixed amount) into a rupiah value, clamped to subtotal. */
export function resolveDiscount(
  subtotal: number,
  discount: number,
  type: DiscountType,
): number {
  if (discount <= 0) return 0;
  const value = type === 'percent' ? (subtotal * discount) / 100 : discount;
  return Math.min(Math.max(0, Math.round(value)), subtotal);
}

/** Final total after discount. */
export function cartTotal(items: CartItem[], discount: number, type: DiscountType): number {
  const subtotal = cartSubtotal(items);
  return subtotal - resolveDiscount(subtotal, discount, type);
}

/** Total cost of goods sold (HPP) for margin reporting. */
export function cartCogs(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.costPrice * i.qty, 0);
}

export interface CartValidation {
  ok: boolean;
  errors: string[];
}

/** Validate the cart can be checked out (non-empty, qty within stock). */
export function validateCart(items: CartItem[]): CartValidation {
  const errors: string[] = [];
  if (items.length === 0) errors.push('Keranjang kosong');
  for (const i of items) {
    if (i.qty <= 0) errors.push(`Qty "${i.name}" harus lebih dari 0`);
    if (i.qty > i.stock) errors.push(`Stok "${i.name}" tidak cukup (tersisa ${i.stock})`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Validate that payment allocations exactly cover the total (tolerating
 * sub-rupiah rounding). Returns the difference for UI feedback.
 */
export function validatePayments(
  payments: PaymentAllocation[],
  total: number,
): { ok: boolean; paid: number; diff: number } {
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  const diff = paid - total;
  return { ok: Math.abs(diff) < 1, paid, diff };
}

/** Convert cart items into immutable sale lines. */
export function toSaleLines(items: CartItem[]): SaleLine[] {
  return items.map((i) => ({
    itemId: i.itemId,
    name: i.name,
    qty: i.qty,
    sellPrice: i.sellPrice,
    costPrice: i.costPrice,
  }));
}

/** Stock changes to apply on checkout (negative = deduct). */
export function checkoutStockDeltas(items: CartItem[]): { itemId: string; delta: number }[] {
  return items.map((i) => ({ itemId: i.itemId, delta: -i.qty }));
}

/** Stock changes to apply on void (positive = restore). */
export function voidStockDeltas(lines: SaleLine[]): { itemId: string; delta: number }[] {
  return lines.map((l) => ({ itemId: l.itemId, delta: l.qty }));
}
