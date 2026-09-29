import { describe, it, expect } from 'vitest';
import { payrollOverview, netPay } from './payroll';

const row = (category: string, amount: number, employeeId: string | null, date = '2026-09-20') => ({
  category: category as never,
  amount,
  employeeId,
  date,
  createdAt: `${date}T10:00:00Z`,
  deletedAt: null,
});

describe('payrollOverview', () => {
  it('sisa kasbon = kasbon − pelunasan; gaji terakhir = Gaji terbaru', () => {
    const exps = [
      row('Kasbon Karyawan', 500e3, 'budi'),
      row('Kasbon Karyawan', 200e3, 'budi', '2026-09-25'),
      row('Gaji', 2.4e6, 'budi', '2026-08-05'),
      row('Gaji', 2.5e6, 'budi', '2026-09-05'),
      row('Kasbon Karyawan', 999e3, null),
    ];
    const incs = [row('Pelunasan Kasbon', 300e3, 'budi')];
    const b = payrollOverview(incs, exps).get('budi')!;
    expect(b.advanceOutstanding).toBe(400e3);
    expect(b.lastSalary).toBe(2.5e6);
  });
  it('pelunasan berlebih tidak membuat sisa negatif', () => {
    const b = payrollOverview([row('Pelunasan Kasbon', 900e3, 'x')], [row('Kasbon Karyawan', 500e3, 'x')]).get('x')!;
    expect(b.advanceOutstanding).toBe(0);
  });
  it('netPay', () => {
    expect(netPay(2.5e6, 500e3)).toBe(2e6);
  });
});
