import { repository } from '@/data';
import { recordFinanceEntry } from '@/data/supabase-client';
import { applyBalance } from '@/lib/business/finance';
import { newId } from '@/lib/id';
import { isCloudMode } from '@/stores/demo';
import type { IncomeCategory, ExpenseCategory } from '@/data/types';

export interface NewFinanceEntry {
  orgId: string;
  kind: 'income' | 'expense';
  date: string;
  category: string;
  amount: number;
  walletId: string;
  description: string;
  outletId: string | null;
  /** Karyawan untuk Gaji / Kasbon Karyawan / Pelunasan Kasbon (0098). */
  employeeId?: string | null;
}

/**
 * Catat satu baris pemasukan/pengeluaran beserta pergerakan saldo wallet-nya,
 * dan kembalikan id barisnya. Cloud: satu transaksi server (record_finance_entry,
 * 0071). Lokal/demo: baris ditulis lalu saldo direkonsiliasi.
 *
 * Satu pintu untuk setiap layar yang mencatat uang (Keuangan, saldo awal wallet
 * di Pengaturan) — percabangan cloud/lokal tidak boleh hidup di dalam modal,
 * karena tiap salinannya harus disepakati ulang saat bentuk barisnya berubah.
 * Pola yang sama dengan `saveServiceParts`.
 */
export async function createFinanceEntry(a: NewFinanceEntry): Promise<string> {
  if (isCloudMode()) {
    return recordFinanceEntry({
      orgId: a.orgId,
      kind: a.kind,
      date: a.date,
      category: a.category,
      amount: a.amount,
      walletId: a.walletId,
      description: a.description,
      outletId: a.outletId,
      employeeId: a.employeeId ?? null,
    });
  }

  const id = newId();
  const now = new Date().toISOString();
  const base = {
    id,
    orgId: a.orgId,
    outletId: a.outletId,
    date: a.date,
    amount: a.amount,
    walletId: a.walletId,
    description: a.description,
    employeeId: a.employeeId ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  if (a.kind === 'income') {
    await repository.put('incomes', {
      ...base,
      category: a.category as IncomeCategory,
      serviceId: null,
    });
  } else {
    await repository.put('expenses', { ...base, category: a.category as ExpenseCategory });
  }

  const wallet = await repository.get('wallets', a.walletId);
  if (wallet) {
    await repository.put(
      'wallets',
      applyBalance(wallet, a.kind === 'income' ? a.amount : -a.amount),
    );
  }
  return id;
}
