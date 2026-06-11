/**
 * TIER 5 — Audit validasi input (OFFLINE, tanpa jaringan).
 *
 * Fase "tests-only / find-first": test di sini MENYATAKAN perilaku validasi
 * yang DIINGINKAN (aman). Yang GAGAL = bukti celah terdokumentasi, BUKAN untuk
 * langsung diperbaiki sekarang. Lihat laporan temuan (artifact) untuk
 * klasifikasi & rekomendasi.
 *
 * Fokus: F2 — customerSchema.phone saat ini hanya `.min(1)` sehingga menerima
 * teks/simbol apa pun. Test di bawah mengharapkan No. HP berupa nomor yang
 * masuk akal (digit, opsional + / spasi / - , panjang wajar).
 */
import { describe, it, expect } from 'vitest';
import { validate, customerSchema } from '@/lib/validators';

/** Heuristik "nomor telepon Indonesia yang masuk akal" untuk acuan audit. */
function looksLikePhone(v: string): boolean {
  const digits = v.replace(/\D/g, '');
  return /^[\d+\-\s()]+$/.test(v) && digits.length >= 8 && digits.length <= 15;
}

describe('Tier 5 (AUDIT/F2) — customerSchema.phone seharusnya menolak non-nomor', () => {
  const valid = { id: '1', name: 'Andi', email: '' };

  it('menolak No. HP berisi huruf ("abcdefg")', () => {
    const r = validate(customerSchema, { ...valid, phone: 'abcdefg' });
    expect(r.ok).toBe(false); // FAIL saat ini → F2 terbukti
  });

  it('menolak No. HP berisi simbol ("!!!@@@")', () => {
    const r = validate(customerSchema, { ...valid, phone: '!!!@@@' });
    expect(r.ok).toBe(false);
  });

  it('menolak No. HP terlalu pendek ("12")', () => {
    const r = validate(customerSchema, { ...valid, phone: '12' });
    expect(r.ok).toBe(false);
  });

  it('TETAP menerima No. HP yang valid ("081234567890")', () => {
    const r = validate(customerSchema, { ...valid, phone: '081234567890' });
    expect(r.ok).toBe(true); // ini harus hijau di kedua kondisi
  });

  it('heuristik acuan konsisten (sanity)', () => {
    expect(looksLikePhone('081234567890')).toBe(true);
    expect(looksLikePhone('abcdefg')).toBe(false);
    expect(looksLikePhone('!!!')).toBe(false);
  });
});
