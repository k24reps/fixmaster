import type { Expense, Income } from '@/data/types';

/**
 * Sisa kasbon & gaji terakhir per karyawan dari catatan Keuangan — cermin
 * `payroll_overview` (0098) untuk mode lokal/demo. Kasbon = pengeluaran
 * "Kasbon Karyawan"; pelunasannya = pemasukan "Pelunasan Kasbon" (termasuk
 * potongan gaji dari Bayar Gaji). Hanya baris yang terhubung ke karyawan.
 */
export interface PayrollRow {
  employeeId: string;
  advanceOutstanding: number;
  lastSalary: number | null;
}

type Row = Pick<Expense | Income, 'category' | 'amount' | 'date' | 'createdAt' | 'deletedAt' | 'employeeId'>;

export function payrollOverview(incomes: Row[], expenses: Row[]): Map<string, PayrollRow> {
  const out = new Map<string, PayrollRow>();
  const rowOf = (id: string) => {
    const r = out.get(id) ?? { employeeId: id, advanceOutstanding: 0, lastSalary: null };
    out.set(id, r);
    return r;
  };
  const latestSalary = new Map<string, Row>();
  for (const e of expenses) {
    if (!e.employeeId || e.deletedAt) continue;
    if (e.category === 'Kasbon Karyawan') rowOf(e.employeeId).advanceOutstanding += e.amount;
    if (e.category === 'Gaji') {
      const prev = latestSalary.get(e.employeeId);
      if (!prev || `${e.date}${e.createdAt}` > `${prev.date}${prev.createdAt}`) latestSalary.set(e.employeeId, e);
    }
  }
  for (const i of incomes) {
    if (!i.employeeId || i.deletedAt || i.category !== 'Pelunasan Kasbon') continue;
    rowOf(i.employeeId).advanceOutstanding -= i.amount;
  }
  for (const [id, e] of latestSalary) rowOf(id).lastSalary = e.amount;
  for (const r of out.values()) r.advanceOutstanding = Math.max(0, r.advanceOutstanding);
  return out;
}

/** Kategori yang terhubung ke karyawan (0098/0099); kasbon & pelunasannya wajib saat dicatat. */
export const EMPLOYEE_LINK_CATEGORIES: ReadonlySet<string> = new Set(['Gaji', 'Kasbon Karyawan', 'Pelunasan Kasbon']);
export const EMPLOYEE_REQUIRED_CATEGORIES: ReadonlySet<string> = new Set(['Kasbon Karyawan', 'Pelunasan Kasbon']);

/** Yang benar-benar ditransfer = gaji penuh − potongan kasbon. */
export function netPay(gross: number, deduction: number): number {
  return Math.max(0, gross - deduction);
}
