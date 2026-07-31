/**
 * Pure finance business logic: wallet balance effects of income/expense
 * mutations, transfers, and reverse-cascade calculations.
 * No DOM/repository dependencies → fully unit-testable.
 */
import type { Wallet, Income, Expense } from '@/data/types';
import { localDateOf } from '@/lib/time';

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

export interface TransferResult {
  ok: boolean;
  error?: string;
  fromWallet?: Wallet;
  toWallet?: Wallet;
}

/** Move funds between two wallets, guarding against invalid/insufficient transfers. */
export function transfer(from: Wallet, to: Wallet, amount: number): TransferResult {
  if (from.id === to.id) return { ok: false, error: 'Wallet asal & tujuan sama' };
  if (amount <= 0) return { ok: false, error: 'Nominal harus lebih dari 0' };
  if (amount > from.balance) return { ok: false, error: 'Saldo tidak cukup' };
  return {
    ok: true,
    fromWallet: applyBalance(from, -amount),
    toWallet: applyBalance(to, amount),
  };
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

export interface TransferEntry {
  id: string;
  /** Local date (YYYY-MM-DD) the transfer was recorded. */
  date: string;
  /** "Kas A → Kas B" label as recorded in the audit log. */
  label: string;
  amount: number;
  fromWalletId: string;
  toWalletId: string;
}

/**
 * Wallet-to-wallet transfers, read back from the activity log (they book no
 * ledger row, so the audit trail is the only record). `from`/`to` are local
 * date bounds — the caller fetches a widened timestamp window, so edge rows
 * outside the real range are trimmed here.
 */
export function transferEntries(
  logs: {
    id: string;
    action: string;
    entityId: string | null;
    entityLabel: string;
    createdAt: string;
    meta?: Record<string, unknown>;
  }[],
  from: string,
  to: string,
): TransferEntry[] {
  return logs
    .filter((l) => l.action === 'wallet.transfer')
    .map((l) => ({
      id: l.id,
      date: localDateOf(l.createdAt),
      label: l.entityLabel || 'Transfer antar wallet',
      amount: Number(l.meta?.amount ?? 0),
      fromWalletId: l.entityId ?? '',
      toWalletId: String(l.meta?.toWalletId ?? ''),
    }))
    .filter((t) => t.date >= from && t.date <= to);
}
