import type { Expense, ID, OutletRent } from '@/data/types';
import type { TranslationKey } from '@/i18n';

/**
 * Overhead bulanan dari catatan Keuangan — satu-satunya sumber; isian perkiraan
 * di onboarding/Pengaturan sengaja ditiadakan (29 Sep 2026): angka tebakan yang
 * lalu ditinggal, sementara catatan Keuangan sudah memuat hal yang sama.
 * Anggaran di Pengaturan dulu satu-satunya sumber, padahal gaji, listrik, dan
 * bonus berubah tiap bulan — dan Indikator Break-Even membandingkannya dengan
 * arus kas bersih yang SUDAH dipotong pengeluaran itu, jadi overhead terhitung
 * dua kali dan toko yang sudah surplus terlihat "baru impas".
 */
export const OVERHEAD_CATEGORIES = ['Gaji', 'Sewa', 'Operasional', 'Lainnya'] as const;
export type OverheadCategory = (typeof OVERHEAD_CATEGORIES)[number];
/** Biaya yang lahir dari transaksi: mengurangi laba kotor, bukan overhead. */
export const DIRECT_COST_CATEGORIES = ['Garansi', 'Refund Penjualan'];

/**
 * actual = realisasi bulan lewat · estimate = bulan berjalan diperkirakan dari
 * riwayat · partial = bulan tanpa riwayat (mis. bulan pertama), hanya yang
 * sudah dicatat — hampir pasti belum lengkap karena gaji dibayar akhir bulan.
 */
export type OverheadBasis = 'actual' | 'estimate' | 'partial';

export interface OverheadResult {
  /** 0 = belum ada catatan overhead sama sekali dalam periode. */
  total: number;
  byCategory: Record<OverheadCategory, number>;
  /** Basis terlemah yang dipakai: actual < estimate < partial. */
  basis: OverheadBasis;
  /** Bulan penuh terakhir tercatat tanpa satu pun pengeluaran Gaji. */
  missingPayroll: boolean;
}

export interface OverheadInput {
  /** Pengeluaran dari 3 bulan sebelum `from` sampai akhir bulan `to`. */
  expenses: Pick<Expense, 'date' | 'category' | 'amount' | 'outletId'>[];
  from: string;
  to: string;
  today: string;
  rent: Record<ID, OutletRent>;
  /** Cabang dalam cakupan laporan — sewa tahunannya dihitung ÷ 12. */
  outletIds: ID[];
  /** 'YYYY-MM' bulan mulai memakai FixMaster; bulan itu dianggap belum lengkap. */
  startMonth: string | null;
}

const HISTORY_MONTHS = 3;
const monthOf = (iso: string) => iso.slice(0, 7);
const daysIn = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
const lastDay = (m: string) => `${m}-${String(daysIn(m)).padStart(2, '0')}`;
function shiftMonth(m: string, n: number): string {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const emptyCats = (): Record<OverheadCategory, number> => ({ Gaji: 0, Sewa: 0, Operasional: 0, Lainnya: 0 });
const isOverhead = (c: string): c is OverheadCategory => (OVERHEAD_CATEGORIES as readonly string[]).includes(c);

/** Awal jendela pengeluaran yang dibutuhkan `overheadForRange`. */
export function overheadFetchFrom(from: string): string {
  return `${shiftMonth(monthOf(from), -HISTORY_MONTHS)}-01`;
}
export function overheadFetchTo(to: string): string {
  return lastDay(monthOf(to));
}

export function overheadForRange(input: OverheadInput): OverheadResult | null {
  const { from, today, rent, outletIds, startMonth } = input;
  // Hari yang belum terjadi tidak menanggung overhead: laba kotornya juga belum ada.
  const to = input.to < today ? input.to : today;
  if (to < from) return null;

  const annualOutlets = new Set(Object.keys(rent).filter((id) => rent[id]?.mode === 'tahunan'));
  const annualRent = outletIds.reduce(
    (sum, id) => sum + (rent[id]?.mode === 'tahunan' ? Math.max(0, rent[id].yearly) / 12 : 0),
    0,
  );

  // Sewa cabang tahunan tetap dicatat (saldo kas benar), tapi diratakan lewat Pengaturan.
  const kept = input.expenses.filter(
    (e): e is typeof e & { category: OverheadCategory } =>
      isOverhead(e.category) && !(e.category === 'Sewa' && e.outletId && annualOutlets.has(e.outletId)),
  );
  const actual = new Map<string, Record<OverheadCategory, number>>();
  for (const e of kept) {
    const m = monthOf(e.date);
    const row = actual.get(m) ?? emptyCats();
    row[e.category] += e.amount;
    actual.set(m, row);
  }
  const actualOf = (m: string) => actual.get(m) ?? emptyCats();
  const sumOf = (r: Record<OverheadCategory, number>) => OVERHEAD_CATEGORIES.reduce((s, c) => s + r[c], 0);
  // Bulan dianggap tercatat bila sudah lewat, sesudah bulan mulai, dan ada isinya
  // (tanpa bulan mulai, bulan kosong kemungkinan besar belum memakai aplikasi).
  const tracked = (m: string) =>
    lastDay(m) < today && (startMonth ? m > startMonth : sumOf(actualOf(m)) > 0);

  const byCategory = emptyCats();
  let rank = 0; // 0 actual, 1 estimate, 2 partial
  const bump = (r: number) => (rank = Math.max(rank, r));

  for (let m = monthOf(from); m <= monthOf(to); m = shiftMonth(m, 1)) {
    const a = from > `${m}-01` ? from : `${m}-01`;
    const b = to < lastDay(m) ? to : lastDay(m);
    const frac = (Number(b.slice(8)) - Number(a.slice(8)) + 1) / daysIn(m);
    const got = actualOf(m);
    const monthly = emptyCats();

    if (tracked(m)) {
      Object.assign(monthly, got);
    } else {
      const history = [1, 2, 3].map((n) => shiftMonth(m, -n)).filter(tracked);
      const current = lastDay(m) >= today;
      if (current && history.length > 0) {
        // Per kategori: gaji yang belum dibayar tetap terhitung dari rata-rata,
        // biaya yang naik bulan ini langsung terhitung begitu dicatat.
        for (const c of OVERHEAD_CATEGORIES) {
          const avg = history.reduce((s, h) => s + actualOf(h)[c], 0) / history.length;
          monthly[c] = Math.max(got[c], avg);
        }
        bump(1);
      } else {
        // Tanpa riwayat tak ada yang bisa diratakan: yang tercatat dalam periode
        // dipakai apa adanya (sewa 5 jt tanggal 1 tetap 5 jt, bukan separuhnya).
        for (const e of kept) if (e.date >= a && e.date <= b) byCategory[e.category] += e.amount;
        byCategory.Sewa += annualRent * frac;
        bump(2);
        continue;
      }
    }
    monthly.Sewa += annualRent;
    for (const c of OVERHEAD_CATEGORIES) byCategory[c] += monthly[c] * frac;
  }

  const lastFull = shiftMonth(monthOf(today), -1);
  return {
    total: sumOf(byCategory),
    byCategory,
    basis: (['actual', 'estimate', 'partial'] as const)[rank],
    missingPayroll: tracked(lastFull) && actualOf(lastFull).Gaji === 0,
  };
}

/** Laba kotor = laba servis + laba penjualan − biaya langsung (garansi, refund). */
export function grossProfit(
  serviceProfit: number,
  sales: { total: number; lines: { qty: number; costPrice: number }[] }[],
  expenses: Pick<Expense, 'category' | 'amount'>[],
): number {
  const salesProfit = sales.reduce(
    (sum, s) => sum + s.total - s.lines.reduce((c, l) => c + l.qty * l.costPrice, 0),
    0,
  );
  const direct = expenses
    .filter((e) => DIRECT_COST_CATEGORIES.includes(e.category))
    .reduce((sum, e) => sum + e.amount, 0);
  return serviceProfit + salesProfit - direct;
}

/**
 * Kelompok kategori pengeluaran menurut perlakuannya di break-even. Dipakai
 * form catat, filter buku kas, dan kartu Pengeluaran per Kategori — supaya
 * salah kategori (mis. ongkir sebagai Sparepart) terlihat saat dicatat.
 */
export type ExpenseGroup = 'overhead' | 'direct' | 'stock' | 'owner';
export const EXPENSE_GROUPS: { id: ExpenseGroup; categories: readonly string[] }[] = [
  { id: 'overhead', categories: OVERHEAD_CATEGORIES },
  { id: 'direct', categories: DIRECT_COST_CATEGORIES },
  { id: 'stock', categories: ['Sparepart'] },
  { id: 'owner', categories: ['Prive'] },
];
export const EXPENSE_GROUP_LABEL: Record<ExpenseGroup, TranslationKey> = {
  overhead: 'finance.groupOverhead',
  direct: 'finance.groupDirect',
  stock: 'finance.groupStock',
  owner: 'finance.groupOwner',
};
/** Kategori di luar daftar (baris lama) diperlakukan sebagai overhead, sama dengan Lainnya. */
export function expenseGroupOf(category: string): ExpenseGroup {
  return EXPENSE_GROUPS.find((g) => g.categories.includes(category))?.id ?? 'overhead';
}

export interface BreakEven {
  overhead: OverheadResult;
  gross: number;
  /** gross ÷ overhead; 0 bila overhead belum tercatat. */
  pct: number;
  /** gross − overhead: + surplus, − kurang. */
  surplus: number;
}

export function computeBreakEven(
  input: OverheadInput,
  serviceProfit: number,
  sales: Parameters<typeof grossProfit>[1],
  rangeExpenses: Parameters<typeof grossProfit>[2],
): BreakEven | null {
  const overhead = overheadForRange(input);
  if (!overhead) return null;
  const gross = grossProfit(serviceProfit, sales, rangeExpenses);
  return {
    overhead,
    gross,
    pct: overhead.total > 0 ? gross / overhead.total : 0,
    surplus: gross - overhead.total,
  };
}

/**
 * Kas × break-even dibaca bersama. Kas naik belum tentu untung (gaji belum
 * dibayar, part dari stok bulan lalu); kas turun belum tentu rugi (uang jadi
 * stok, piutang, sewa dibayar di muka).
 */
export type BreakEvenVerdict = 'healthy' | 'thin' | 'tied' | 'loss';
export function breakEvenVerdict(netCash: number, surplus: number): BreakEvenVerdict {
  if (surplus >= 0) return netCash >= 0 ? 'healthy' : 'tied';
  return netCash >= 0 ? 'thin' : 'loss';
}
