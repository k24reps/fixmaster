import { repository } from '@/data';
import { fetchPayrollOverview, paySalaryRpc, setFinanceEntryEmployeeRpc } from '@/data/supabase-client';
import { applyBalance } from '@/lib/business/finance';
import { payrollOverview, netPay, type PayrollRow } from '@/lib/business/payroll';
import { newId } from '@/lib/id';
import { isCloudMode } from '@/stores/demo';

/**
 * Satu pintu data Bayar Gaji (pola `createFinanceEntry`): cloud lewat RPC 0098,
 * lokal/demo dihitung dari koleksi — percabangan tidak hidup di dalam modal.
 */
export async function loadPayrollOverview(orgId: string): Promise<Map<string, PayrollRow>> {
  if (isCloudMode()) {
    const rows = await fetchPayrollOverview(orgId);
    return new Map(rows.map((r) => [r.employeeId, r]));
  }
  const [incomes, expenses] = await Promise.all([repository.list('incomes'), repository.list('expenses')]);
  return payrollOverview(incomes, expenses);
}

/**
 * Hubungkan catatan lama ke karyawan. Hanya kolom karyawan yang berubah, jadi
 * catatan bulan terkunci pun boleh — laporan bulan itu tidak bergeser.
 */
export async function linkEntryEmployee(a: {
  orgId: string;
  kind: 'income' | 'expense';
  id: string;
  employeeId: string | null;
}): Promise<void> {
  if (isCloudMode()) {
    await setFinanceEntryEmployeeRpc(a);
    return;
  }
  if (a.kind === 'income') await repository.patch('incomes', a.id, { employeeId: a.employeeId });
  else await repository.patch('expenses', a.id, { employeeId: a.employeeId });
}

export interface PaySalaryArgs {
  orgId: string;
  employeeId: string;
  employeeName: string;
  gross: number;
  deduction: number;
  walletId: string;
  outletId: string | null;
  date: string;
  description: string;
}

/** Gaji penuh (beban) + potongan kasbon (pelunasan piutang) + saldo berkurang sebesar yang ditransfer. */
export async function paySalary(a: PaySalaryArgs): Promise<void> {
  if (isCloudMode()) {
    await paySalaryRpc(a);
    return;
  }
  const now = new Date().toISOString();
  const base = { orgId: a.orgId, outletId: a.outletId, date: a.date, walletId: a.walletId, employeeId: a.employeeId, createdAt: now, updatedAt: now, deletedAt: null };
  await repository.put('expenses', {
    ...base,
    id: newId(),
    category: 'Gaji',
    amount: a.gross,
    description: a.description.trim() || `Gaji ${a.employeeName}`,
  });
  if (a.deduction > 0) {
    await repository.put('incomes', {
      ...base,
      id: newId(),
      category: 'Pelunasan Kasbon',
      amount: a.deduction,
      description: `Potong kasbon ${a.employeeName} (gaji)`,
      serviceId: null,
    });
  }
  const wallet = await repository.get('wallets', a.walletId);
  if (wallet) await repository.put('wallets', applyBalance(wallet, -netPay(a.gross, a.deduction)));
}
