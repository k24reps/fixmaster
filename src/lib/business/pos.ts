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

/**
 * Batas diskon untuk karyawan, persen dari subtotal. Diskon besar adalah uang
 * toko yang keluar tanpa jejak persetujuan, jadi di atas batas ini transaksinya
 * harus diproses owner/admin. Cermin process_sale (0070) — server yang menolak.
 */
export const STAFF_MAX_DISCOUNT_PCT = 10;

/** Diskon rupiah tertinggi yang boleh diberikan peran ini. */
export function discountLimit(subtotal: number, isManager: boolean): number {
  return isManager ? subtotal : Math.round((subtotal * STAFF_MAX_DISCOUNT_PCT) / 100);
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

export interface TenderSettlement {
  ok: boolean;
  /** Uang yang DITERIMA dari pelanggan (boleh melebihi total). */
  paid: number;
  /** Sisa yang belum dibayar (0 bila sudah tertutup). */
  due: number;
  /** Kembalian yang diserahkan kasir. */
  change: number;
  /** Wallet yang menyerahkan kembalian: baris tender terakhir. */
  changeWalletId: string | null;
  /** Lebih bayar yang tak bisa jadi kembalian: baris lain saja sudah menutup total. */
  excess: boolean;
  /** Alokasi yang dicatat ke server — jumlahnya selalu = total saat ok. */
  allocations: PaymentAllocation[];
}

/**
 * Tender kasir: tiap baris = uang yang diterima per wallet. Lebih bayar menjadi
 * kembalian yang dipotong dari baris TERAKHIR — urutan yang wajar di meja
 * kasir (QRIS/transfer diisi pas, tunai diterima paling akhir), sehingga yang
 * tercatat di wallet adalah uang yang benar-benar tinggal, bukan uang yang
 * sempat dipegang. process_sale (0069) tetap menerima jumlah = total.
 * ponytail: wallet tak punya tipe "tunai", jadi baris terakhir yang dianggap
 * laci; tambah `kind` di Wallet bila perlu memaksa kembalian hanya dari tunai.
 */
export function settleTender(tendered: PaymentAllocation[], total: number): TenderSettlement {
  const lines = tendered.filter((p) => p.amount > 0);
  const paid = lines.reduce((sum, p) => sum + p.amount, 0);
  const base = { paid, due: 0, change: 0, changeWalletId: null, excess: false, allocations: lines };
  if (paid < total - 0.5) return { ...base, ok: false, due: total - paid };
  const change = Math.round(paid - total);
  if (change < 1) return { ...base, ok: true };
  const last = lines[lines.length - 1];
  if (paid - last.amount >= total) return { ...base, ok: false, change, excess: true };
  return {
    ...base,
    ok: true,
    change,
    changeWalletId: last.walletId,
    allocations: lines.map((p, i) =>
      i === lines.length - 1 ? { ...p, amount: p.amount - change } : p,
    ),
  };
}

/**
 * Nominal uang yang lazim diserahkan untuk tagihan `due`: pas, lalu pembulatan
 * ke atas pecahan 10rb/50rb/100rb/500rb/1jt. Maksimal empat, tanpa kembar.
 */
export function cashSuggestions(due: number): number[] {
  if (due <= 0) return [];
  const out = [due];
  for (const step of [10_000, 50_000, 100_000, 500_000, 1_000_000]) {
    const v = Math.ceil(due / step) * step;
    if (!out.includes(v)) out.push(v);
  }
  return out.slice(0, 4);
}

/**
 * Barang yang ditambahkan saat Enter di kolom cari. SKU persis menang (pemindai
 * barcode mengetik SKU lalu Enter); selain itu hanya bila hasilnya tinggal satu,
 * supaya Enter tak pernah menebak di antara beberapa barang.
 */
export function pickOnEnter<T extends { sku: string; stock: number }>(
  inventory: T[],
  visible: T[],
  query: string,
): T | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const bySku = inventory.find((i) => i.sku && i.sku.toLowerCase() === q);
  if (bySku) return bySku;
  const sellable = visible.filter((i) => i.stock > 0);
  return sellable.length === 1 ? sellable[0] : null;
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
