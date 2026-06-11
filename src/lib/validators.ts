/**
 * Zod validation schemas for core entities.
 * STRICT entities (finance, services, sales) reject invalid writes;
 * callers use safeParse and surface errors. Type-inferred so schema and
 * TypeScript types never drift apart — an upgrade over FixNova's manual
 * validators.js.
 */
import { z } from 'zod';

const id = z.string().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD');
const money = z.number().finite().min(0, 'Nilai tidak boleh negatif');

/**
 * No. HP: hanya digit + pemisah umum (+ - spasi ( )), dengan 8–15 digit
 * setelah strip non-digit. Menolak teks/simbol & nomor terlalu pendek (F2).
 * 0812..., 62812..., +62 812-3456-7890 semua valid.
 */
const phone = z
  .string()
  .trim()
  .min(1, 'No. HP wajib diisi')
  .refine((v) => /^[\d+\-\s()]+$/.test(v), 'No. HP hanya boleh angka dan + - ( ) spasi')
  .refine((v) => {
    const digits = v.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  }, 'No. HP harus 8–15 digit');

export const customerSchema = z.object({
  id,
  name: z.string().trim().min(1, 'Nama pelanggan wajib diisi'),
  phone,
  email: z.string().email('Email tidak valid').or(z.literal('')),
});

export const inventoryItemSchema = z.object({
  id,
  name: z.string().trim().min(1, 'Nama barang wajib diisi'),
  stock: z.number().int('Stok harus bilangan bulat').min(0, 'Stok tidak boleh negatif'),
  minStock: z.number().int().min(0),
  costPrice: money,
  sellPrice: money,
});

export const serviceSchema = z
  .object({
    id,
    serviceNo: z.string().min(1),
    customerName: z.string().trim().min(1, 'Nama pelanggan wajib diisi'),
    device: z.string().trim().min(1, 'Perangkat wajib diisi'),
    estimateCost: money,
    finalCost: money,
    downPayment: money,
  })
  .refine((s) => s.downPayment <= Math.max(s.finalCost, s.estimateCost) || s.finalCost === 0, {
    message: 'DP tidak boleh melebihi total biaya',
    path: ['downPayment'],
  });

export const saleSchema = z
  .object({
    id,
    saleNo: z.string().min(1),
    date: isoDate,
    subtotal: money,
    discount: money,
    total: money,
    lines: z
      .array(
        z.object({
          itemId: id,
          qty: z.number().int().positive('Qty harus lebih dari 0'),
          sellPrice: money,
        }),
      )
      .min(1, 'Minimal 1 item dalam transaksi'),
    payments: z.array(z.object({ walletId: id, amount: money })).min(1),
  })
  .refine(
    (s) => {
      const paid = s.payments.reduce((sum, p) => sum + p.amount, 0);
      return Math.abs(paid - s.total) < 1; // tolerate rounding
    },
    { message: 'Total pembayaran harus sama dengan total transaksi', path: ['payments'] },
  );

export const expenseSchema = z.object({
  id,
  date: isoDate,
  amount: money.refine((v) => v > 0, 'Nominal harus lebih dari 0'),
  walletId: id,
});

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/** Run a schema and collapse zod errors into a flat string list. */
export function validate<T>(schema: z.ZodType<T>, value: unknown): ValidationResult {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true };
  return { ok: false, errors: result.error.issues.map((i) => i.message) };
}
