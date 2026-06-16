import { describe, it, expect } from 'vitest';
import {
  computeKpis,
  technicianLeaderboard,
  computeAlerts,
  revenueSeries,
} from './dashboard';
import type { Service, Income, Expense, Wallet, InventoryItem } from '@/data/types';

const baseSvc = (over: Partial<Service>): Service => ({
  id: over.id ?? 's1',
  orgId: 'o1',
  outletId: null,
  serviceNo: 'FM-1',
  customerId: 'c1',
  customerName: 'A',
  customerPhone: '08',
  category: 'Laptop',
  device: 'X',
  complaint: '',
  accessories: '',
  status: over.status ?? 'diterima',
  technicianId: null,
  technicianName: over.technicianName ?? '',
  estimateCost: 0,
  finalCost: over.finalCost ?? 0,
  downPayment: 0,
  spareparts: [],
  warrantyServiceUntil: null,
  warrantyPartsUntil: null,
  pickedUp: over.pickedUp ?? false,
  pickedUpAt: null,
  warrantyClaimOf: null,
  history: [],
  archived: false,
  createdAt: over.createdAt ?? '2026-06-02T08:00:00.000Z',
  updatedAt: '',
  deletedAt: null,
});

const income = (date: string, amount: number): Income => ({
  id: 'i' + date + amount, orgId: 'o1', outletId: null, date, category: 'Servis', amount,
  walletId: 'w1', description: '', serviceId: null, createdAt: '', updatedAt: '', deletedAt: null,
});
const expense = (date: string, amount: number): Expense => ({
  id: 'e' + date + amount, orgId: 'o1', outletId: null, date, category: 'Operasional', amount,
  walletId: 'w1', description: '', createdAt: '', updatedAt: '', deletedAt: null,
});

describe('computeKpis', () => {
  it('aggregates revenue, expense, profit, and wallet totals', () => {
    const wallets: Wallet[] = [
      { id: 'w1', orgId: 'o1', outletId: null, name: 'Tunai', balance: 1000, sortOrder: 0, createdAt: '', updatedAt: '', deletedAt: null },
    ];
    const kpis = computeKpis(
      [baseSvc({ status: 'pengerjaan' })],
      [income('2026-06-02', 500000)],
      [expense('2026-06-02', 200000)],
      wallets,
      '2026-06-01',
      '2026-06-30',
    );
    expect(kpis.revenue).toBe(500000);
    expect(kpis.expense).toBe(200000);
    expect(kpis.netProfit).toBe(300000);
    expect(kpis.totalWallet).toBe(1000);
    expect(kpis.unitsPending).toBe(1);
  });

  it('excludes out-of-range income', () => {
    const kpis = computeKpis([], [income('2026-05-01', 999)], [], [], '2026-06-01', '2026-06-30');
    expect(kpis.revenue).toBe(0);
  });
});

describe('technicianLeaderboard', () => {
  it('ranks technicians by completed jobs', () => {
    const board = technicianLeaderboard([
      baseSvc({ id: '1', technicianName: 'Budi', status: 'lunas', finalCost: 100 }),
      baseSvc({ id: '2', technicianName: 'Budi', status: 'selesai', finalCost: 200 }),
      baseSvc({ id: '3', technicianName: 'Ani', status: 'lunas', finalCost: 50 }),
      baseSvc({ id: '4', technicianName: 'Ani', status: 'pengerjaan' }), // not counted
    ]);
    expect(board[0]).toEqual({ name: 'Budi', completed: 2, revenue: 300 });
    expect(board[1]).toEqual({ name: 'Ani', completed: 1, revenue: 50 });
  });
});

describe('computeAlerts', () => {
  it('flags confirmation, stock, and ready units', () => {
    const inv: InventoryItem[] = [
      { id: 'a', orgId: 'o1', outletId: null, name: 'X', category: '', sku: '', stock: 0, minStock: 2, costPrice: 0, sellPrice: 0, supplierId: null, createdAt: '', updatedAt: '', deletedAt: null },
      { id: 'b', orgId: 'o1', outletId: null, name: 'Y', category: '', sku: '', stock: 1, minStock: 3, costPrice: 0, sellPrice: 0, supplierId: null, createdAt: '', updatedAt: '', deletedAt: null },
    ];
    const alerts = computeAlerts(
      [
        baseSvc({ id: '1', status: 'konfirmasi' }),
        baseSvc({ id: '2', status: 'selesai' }),
        // Already collected → must NOT count toward "menunggu diambil".
        baseSvc({ id: '3', status: 'lunas', pickedUp: true }),
      ],
      inv,
    );
    const messages = alerts.map((a) => a.message).join(' | ');
    expect(messages).toContain('menunggu konfirmasi');
    expect(messages).toContain('habis');
    expect(messages).toContain('menipis');
    expect(messages).toContain('1 unit menunggu diambil');
  });

  it('returns no alerts when all clear', () => {
    expect(computeAlerts([], [])).toHaveLength(0);
  });
});

describe('revenueSeries', () => {
  it('builds a series of the requested length', () => {
    const series = revenueSeries([income('2026-06-02', 100)], 7, new Date('2026-06-02T12:00:00'));
    expect(series.labels).toHaveLength(7);
    expect(series.values).toHaveLength(7);
    expect(series.values[6]).toBe(100); // today is last
  });
});
