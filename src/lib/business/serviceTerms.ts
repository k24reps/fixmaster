import { fmtRp } from '@/lib/format';
import { interpolate } from '@/lib/business/notify';
import { cleanReceiptText } from '@/lib/business/receiptTemplate';
import type { TranslationKey } from '@/i18n';
import type { ServiceTerms, TermsSettings } from '@/data/types';

/**
 * Syarat & Ketentuan servis untuk pelanggan, sebagai DATA: kunci kalimat plus
 * angka. Perender (nota, halaman lacak, Pengaturan) yang menerjemahkan dan
 * memformat, jadi isi pasal bisa diuji tanpa DOM dan satu sumber dipakai tiga
 * permukaan.
 *
 * Teks pasal tetap, toko hanya mengatur angka dan menambah ketentuan sendiri.
 * Alasannya: UU Perlindungan Konsumen Pasal 18 membatalkan klausula baku yang
 * mengalihkan tanggung jawab ("bukan tanggung jawab kami"), jadi kalimat yang
 * bisa diketik bebas mudah berubah jadi pasal yang tak melindungi siapa pun.
 */

/**
 * Tanggal template pasal bawaan. Mengubah TEKS pasal bawaan wajib menaikkan
 * tanggal ini: versi setiap toko ikut naik, sedangkan tiket lama tetap membawa
 * versi lamanya.
 */
export const TERMS_TEMPLATE_VERSION = '2026-11-12';

export const TERMS_PICKUP_DAYS_DEFAULT = 60;
export const TERMS_PICKUP_DAYS_MAX = 365;
export const TERMS_FEE_MAX = 10_000_000;
export const TERMS_EXTRA_MAX = 400;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Isian Pengaturan yang boleh disimpan. Nilai di luar rentang ditolak di
 * formulir, bukan diam-diam dijatuhkan ke bawaan oleh `readTerms`: toko yang
 * mengetik biaya Rp 20.000.000 tak boleh mendapati S&K-nya tanpa biaya.
 */
export function isValidPickupDays(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= TERMS_PICKUP_DAYS_MAX;
}

export function isValidTermsFee(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= TERMS_FEE_MAX;
}

/** Bilangan bulat dalam rentang, selain itu bawaan. `unknown` karena isinya jsonb. */
function intIn(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  const n = Math.round(raw);
  return n < min || n > max ? fallback : n;
}

/**
 * S&K apa adanya dari jsonb: nilai asing jatuh ke bawaan. Versi yang tak
 * terbaca jatuh ke tanggal template, bukan dikarang.
 */
export function readTerms(raw: unknown): ServiceTerms {
  const r: Partial<Record<keyof TermsSettings, unknown>> =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    pickupDays: intIn(r.pickupDays, 1, TERMS_PICKUP_DAYS_MAX, TERMS_PICKUP_DAYS_DEFAULT),
    storageFee: intIn(r.storageFee, 0, TERMS_FEE_MAX, 0),
    checkFee: intIn(r.checkFee, 0, TERMS_FEE_MAX, 0),
    extra: cleanReceiptText(r.extra, TERMS_EXTRA_MAX),
    version: typeof r.version === 'string' && DATE_RE.test(r.version) ? r.version : TERMS_TEMPLATE_VERSION,
  };
}

/**
 * S&K toko yang berlaku sekarang. Versi tak pernah lebih tua dari template:
 * toko yang terakhir menyimpan sebelum teks bawaan diubah ikut berganti versi.
 */
export function currentTerms(raw: unknown): ServiceTerms {
  const t = readTerms(raw);
  return t.version < TERMS_TEMPLATE_VERSION ? { ...t, version: TERMS_TEMPLATE_VERSION } : t;
}

const sameContent = (a: ServiceTerms, b: Omit<ServiceTerms, 'version'>) =>
  a.pickupDays === b.pickupDays &&
  a.storageFee === b.storageFee &&
  a.checkFee === b.checkFee &&
  a.extra === b.extra;

/**
 * Setelan yang disimpan dari isian Pengaturan. Versi berganti ke `today` hanya
 * bila isinya berubah; menyimpan ulang tanpa perubahan tak membuat versi baru.
 */
export function termsToSave(
  prev: ServiceTerms,
  draft: Partial<Record<keyof TermsSettings, unknown>>,
  today: string,
): ServiceTerms {
  const next = readTerms({ ...draft, version: prev.version });
  if (sameContent(prev, next)) return prev;
  return { ...next, version: today > prev.version ? today : prev.version };
}

/**
 * S&K yang disetujui untuk tiket ini: salinan di entri riwayat pertama yang
 * membawanya. `null` untuk tiket yang diterima sebelum fitur ini ada dan untuk
 * tiket klaim garansi, yang mengikuti S&K tiket aslinya.
 */
export function termsOf(history: readonly { terms?: unknown }[] | undefined): ServiceTerms | null {
  const entry = history?.find((h) => h.terms && typeof h.terms === 'object');
  return entry ? readTerms(entry.terms) : null;
}

// ---------------------------------------------------------------------------
// Pasal

/** Satu kalimat pasal. Angka dibawa mentah; perender yang memformat. */
export interface TermsSentence {
  key: TranslationKey;
  days?: number;
  fee?: number;
}

export interface TermsClause {
  title: TranslationKey;
  body: TermsSentence[];
}

/**
 * Enam pasal bawaan. Kalimat bersyarat ditulis UTUH per varian (dengan dan
 * tanpa biaya pengecekan), bukan disambung potongan, supaya terjemahan bebas
 * menyusun ulang urutan kata.
 */
export function termsClauses(t: ServiceTerms): TermsClause[] {
  return [
    { title: 'terms.intake.title', body: [{ key: 'terms.intake.body' }] },
    { title: 'terms.data.title', body: [{ key: 'terms.data.body' }] },
    {
      title: 'terms.cancel.title',
      body: [
        t.checkFee > 0
          ? { key: 'terms.cancel.bodyFee', fee: t.checkFee }
          : { key: 'terms.cancel.body' },
      ],
    },
    { title: 'terms.warranty.title', body: [{ key: 'terms.warranty.body' }] },
    { title: 'terms.pickup.title', body: [{ key: 'terms.pickup.body' }] },
    {
      title: 'terms.limit.title',
      body: [
        { key: 'terms.limit.body', days: t.pickupDays },
        ...(t.storageFee > 0 ? [{ key: 'terms.limit.fee' as const, fee: t.storageFee }] : []),
      ],
    },
  ];
}

/**
 * Kalimat jadi, dengan penerjemah dari pemanggil (`t` di React, `receiptText` di
 * cetak). Rupiah memakai spasi tak-putus: "Rp" yang tertinggal sendirian di
 * ujung baris, angkanya di baris berikut, terbaca seperti dua hal berbeda.
 */
export function termsSentenceText(s: TermsSentence, tr: (key: TranslationKey) => string): string {
  return interpolate(tr(s.key), {
    days: s.days === undefined ? '' : String(s.days),
    fee: s.fee === undefined ? '' : fmtRp(s.fee).replace(' ', '\u00a0'),
  });
}
