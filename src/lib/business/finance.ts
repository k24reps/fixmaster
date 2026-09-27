/**
 * Pure finance business logic: wallet balance effects of income/expense
 * mutations, transfers, and reverse-cascade calculations.
 * No DOM/repository dependencies → fully unit-testable.
 */
import type { Wallet, Income, Expense, WalletTransfer } from '@/data/types';

/** Apply a signed delta to a wallet balance, returning a new wallet. */
export function applyBalance(wallet: Wallet, delta: number): Wallet {
  return { ...wallet, balance: wallet.balance + delta };
}

/**
 * Compute net wallet deltas for a batch of income (+) and expense (-)
 * records, keyed by walletId. Used to recompute balances after edits.
 */
export function netWalletDeltas(
  incomes: Pick<Income, 'walletId' | 'amount'>[],
  expenses: Pick<Expense, 'walletId' | 'amount'>[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const i of incomes) {
    map.set(i.walletId, (map.get(i.walletId) ?? 0) + i.amount);
  }
  for (const e of expenses) {
    map.set(e.walletId, (map.get(e.walletId) ?? 0) - e.amount);
  }
  return map;
}

/** Delta to reverse a single income record (subtract it from the wallet). */
export function reverseIncomeDelta(income: Pick<Income, 'amount'>): number {
  return -income.amount;
}

/** Delta to reverse a single expense record (add it back to the wallet). */
export function reverseExpenseDelta(expense: Pick<Expense, 'amount'>): number {
  return expense.amount;
}

// ---------- Transfer antar wallet (0086) ----------
/** Bagian transfer yang menggerakkan uang. */
export interface TransferMoney {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
}

/**
 * Selisih saldo bersih per wallet untuk berpindah dari `before` ke `after`.
 * `before = null` = transfer baru; `after = null` = transfer dibatalkan; keduanya
 * ada = edit (lama dibalik, baru diterapkan). Satu rumus untuk ketiganya, sama
 * dengan loop di update_wallet_transfer.
 */
export function transferDeltas(
  before: TransferMoney | null,
  after: TransferMoney | null,
): Map<string, number> {
  const map = new Map<string, number>();
  const add = (id: string, d: number) => map.set(id, (map.get(id) ?? 0) + d);
  if (before) {
    add(before.fromWalletId, before.amount);
    add(before.toWalletId, -before.amount);
  }
  if (after) {
    add(after.fromWalletId, -after.amount);
    add(after.toWalletId, after.amount);
  }
  return map;
}

export type TransferChangeResult =
  | { ok: true; wallets: Wallet[] }
  | { ok: false; error: string };

const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

/**
 * Validasi lalu terapkan perubahan transfer ke saldo — aturan & pesannya
 * kembaran RPC 0086, supaya galat muncul seketika tanpa menunggu server dan
 * mode lokal/demo berperilaku sama. Mengembalikan HANYA wallet yang berubah.
 * Wallet yang berkurang tidak boleh jatuh di bawah nol: uang yang sudah
 * terpakai tidak bisa ditarik kembali.
 */
export function applyTransferChange(
  wallets: Wallet[],
  before: TransferMoney | null,
  after: TransferMoney | null,
): TransferChangeResult {
  if (after) {
    if (after.fromWalletId === after.toWalletId) return { ok: false, error: 'Wallet asal & tujuan sama' };
    if (!(after.amount > 0)) return { ok: false, error: 'Nominal harus lebih dari 0' };
    if (!Number.isInteger(after.amount)) return { ok: false, error: 'Nominal harus rupiah bulat' };
    if (!wallets.some((w) => w.id === after.fromWalletId)) return { ok: false, error: 'Wallet asal tidak ditemukan' };
    if (!wallets.some((w) => w.id === after.toWalletId)) return { ok: false, error: 'Wallet tujuan tidak ditemukan' };
  }
  const changed: Wallet[] = [];
  for (const [id, delta] of transferDeltas(before, after)) {
    if (delta === 0) continue;
    const w = wallets.find((x) => x.id === id);
    if (!w) return { ok: false, error: 'Wallet tidak ditemukan' };
    if (delta < 0 && w.balance + delta < 0) {
      const error = !before
        ? `Saldo ${w.name} tidak cukup (tersisa ${rp(w.balance)})`
        : !after
          ? `Saldo ${w.name} tinggal ${rp(w.balance)} — tidak cukup untuk mengembalikan ${rp(-delta)}`
          : `Saldo ${w.name} tidak cukup (tersisa ${rp(w.balance)}, perlu ${rp(-delta)})`;
      return { ok: false, error };
    }
    changed.push(applyBalance(w, delta));
  }
  return { ok: true, wallets: changed };
}

/**
 * Nominal & wallet sebuah transfer hanya bisa diubah/dibatalkan di bulan
 * berjalan (assert_open_month, 0071); keterangannya selalu bisa.
 */
export function transferMoneyLocked(t: { date: string; status: string }, today: string): boolean {
  return t.status !== 'active' || t.date < today.slice(0, 8) + '01';
}

// ---------- Modal pemilik vs uang operasional ----------
/**
 * Arus kas pemilik: uangnya BENAR-BENAR bergerak (saldo wallet berubah, baris
 * tetap tampil di Buku Kas), tapi bukan hasil/ongkos berdagang — jadi tak
 * boleh ikut dihitung sebagai omzet maupun laba.
 *
 * Ini satu-satunya sumber kebenarannya. Setiap agregasi uang WAJIB menyaring
 * lewat `operatingIncomes`/`operatingExpenses`, bukan menjumlah mentah — bug
 * yang melahirkan aturan ini: suntikan modal pemilik terhitung sebagai
 * pemasukan, menggelembungkan laba 43% tanpa satu pun error.
 */
export const CAPITAL_INCOME_CATEGORY = 'Modal';
export const CAPITAL_EXPENSE_CATEGORY = 'Prive';

/** True bila baris ini arus kas pemilik, bukan pendapatan/biaya usaha. */
export function isCapitalFlow(row: { category: string }): boolean {
  return (
    row.category === CAPITAL_INCOME_CATEGORY || row.category === CAPITAL_EXPENSE_CATEGORY
  );
}

/** Buang setoran modal dari deret pemasukan sebelum dijumlahkan. */
export function operatingIncomes<T extends { category: string }>(incomes: T[]): T[] {
  return incomes.filter((i) => !isCapitalFlow(i));
}

/** Buang prive dari deret pengeluaran sebelum dijumlahkan. */
export function operatingExpenses<T extends { category: string }>(expenses: T[]): T[] {
  return expenses.filter((e) => !isCapitalFlow(e));
}

export interface FinanceSummary {
  income: number;
  expense: number;
  net: number;
}

/**
 * Summarize income/expense totals over a pre-filtered set. Setoran modal
 * (`Modal`) dan penarikan pemilik (`Prive`) disaring DI SINI, bukan di
 * pemanggil — supaya pemanggil baru tak bisa lupa dan diam-diam berbohong.
 */
export function summarize(
  incomes: Pick<Income, 'amount' | 'category'>[],
  expenses: Pick<Expense, 'amount' | 'category'>[],
): FinanceSummary {
  const income = operatingIncomes(incomes).reduce((s, i) => s + i.amount, 0);
  const expense = operatingExpenses(expenses).reduce((s, e) => s + e.amount, 0);
  return { income, expense, net: income - expense };
}

/**
 * Whether deleting a service-linked income should revert the service
 * from "lunas" back to "selesai" (reverse-cascade rule).
 */
export function shouldRevertServiceOnIncomeDelete(
  income: Pick<Income, 'serviceId' | 'category'>,
): boolean {
  return income.category === 'Servis' && !!income.serviceId;
}

/**
 * Tanggal catat/ubah transaksi: awal bulan ini s/d hari ini. Cermin
 * `assert_entry_date` (0091) — bulan lalu laporannya sudah berjalan, dan tanggal
 * masa depan dulu memotong saldo tanpa pernah tampil di buku kas.
 */
export function entryDateError(date: string, today: string): string | null {
  if (!date) return 'Tanggal wajib diisi';
  if (date > today) return 'Tanggal tidak boleh di masa depan';
  if (date < today.slice(0, 8) + '01') {
    return 'Bulan lalu sudah terkunci — catat koreksinya sebagai transaksi bulan ini';
  }
  return null;
}

/**
 * Baris yang identik (nominal, wallet, keterangan, tanggal) dan baru dicatat
 * dalam `windowMin` menit — tanda ketuk dua kali atau catat ulang tanpa sadar.
 */
export function findRecentDuplicate<
  T extends Pick<Income, 'amount' | 'walletId' | 'description' | 'date' | 'createdAt'>,
>(
  rows: readonly T[],
  entry: Pick<Income, 'amount' | 'walletId' | 'description' | 'date'>,
  now: Date = new Date(),
  windowMin = 10,
): T | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const since = now.getTime() - windowMin * 60_000;
  return (
    rows.find(
      (r) =>
        r.amount === entry.amount &&
        r.walletId === entry.walletId &&
        r.date === entry.date &&
        norm(r.description) === norm(entry.description) &&
        Date.parse(r.createdAt) >= since,
    ) ?? null
  );
}

export interface WalletMovement {
  in: number;
  out: number;
  /** Transfer masuk − keluar (transfer batal diabaikan). */
  transfer: number;
}

/** Pergerakan satu wallet dalam himpunan baris yang sudah disaring periodenya. */
export function walletMovement(
  walletId: string,
  incomes: readonly Pick<Income, 'amount' | 'walletId'>[],
  expenses: readonly Pick<Expense, 'amount' | 'walletId'>[],
  transfers: readonly Pick<WalletTransfer, 'amount' | 'fromWalletId' | 'toWalletId' | 'status'>[],
): WalletMovement {
  const sum = (rows: readonly { amount: number }[]) => rows.reduce((n, r) => n + r.amount, 0);
  const live = transfers.filter((t) => t.status !== 'void');
  return {
    in: sum(incomes.filter((i) => i.walletId === walletId)),
    out: sum(expenses.filter((e) => e.walletId === walletId)),
    transfer:
      sum(live.filter((t) => t.toWalletId === walletId)) -
      sum(live.filter((t) => t.fromWalletId === walletId)),
  };
}
