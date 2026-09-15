import { describe, it, expect } from 'vitest';
import {
  computeKpis,
  technicianLeaderboard,
  serviceSummary,
  computeAlerts,
  revenueSeries,
} from './dashboard';
import type { Service, Income, Expense, Wallet, InventoryItem, ServiceHistoryEntry } from '@/data/types';

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
  ...over,
});

const income = (
  date: string,
  amount: number,
  category: Income['category'] = 'Servis',
): Income => ({
  id: 'i' + date + amount,
  orgId: 'o1',
  outletId: null,
  date,
  category,
  amount,
  walletId: 'w1',
  description: '',
  serviceId: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});
const expense = (
  date: string,
  amount: number,
  category: Expense['category'] = 'Operasional',
): Expense => ({
  id: 'e' + date + amount,
  orgId: 'o1',
  outletId: null,
  date,
  category,
  amount,
  walletId: 'w1',
  description: '',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

/** [from, to) bulan Juni 2026. */
const JUNE = ['2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'] as const;
const doneAt = (at: string): ServiceHistoryEntry[] => [
  { at, status: 'selesai', by: '', byName: '', note: '', internal: false },
];

describe('computeKpis', () => {
  it('aggregates revenue, expense, net cash flow, and wallet totals', () => {
    const wallets: Wallet[] = [
      {
        id: 'w1',
        orgId: 'o1',
        outletId: null,
        name: 'Tunai',
        balance: 1000,
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
        deletedAt: null,
      },
    ];
    const kpis = computeKpis(
      [income('2026-06-02', 500000)],
      [expense('2026-06-02', 200000)],
      wallets,
      '2026-06-01',
      '2026-06-30',
    );
    expect(kpis.revenue).toBe(500000);
    expect(kpis.expense).toBe(200000);
    expect(kpis.netCashFlow).toBe(300000);
    expect(kpis.totalWallet).toBe(1000);
  });

  it('excludes out-of-range income', () => {
    const kpis = computeKpis([income('2026-05-01', 999)], [], [], '2026-06-01', '2026-06-30');
    expect(kpis.revenue).toBe(0);
  });
});

describe('serviceSummary', () => {
  it('"belum selesai" tidak menghitung tiket Selesai, dan tiket arsip tidak dihitung', () => {
    const summary = serviceSummary(
      [
        baseSvc({ id: '1', status: 'pengerjaan' }),
        baseSvc({ id: '2', status: 'selesai' }),
        baseSvc({ id: '3', status: 'lunas', finalCost: 300 }),
        baseSvc({ id: '4', status: 'diterima', createdAt: '2026-05-20T08:00:00.000Z' }),
        baseSvc({ id: '5', status: 'lunas', finalCost: 999, archived: true }),
      ],
      ...JUNE,
    );
    expect(summary).toMatchObject({
      total: 4,
      unfinished: 2,
      inProcess: 1,
      done: 2,
      awaitingPickup: 2,
      confirmation: 0,
      lunasValue: 300,
      unitsIn: 3,
    });
  });
});

describe('technicianLeaderboard', () => {
  it('tiket yang selesai dalam periode, per teknisi; nilai hanya dari Lunas; tanpa klaim garansi', () => {
    const board = technicianLeaderboard(
      [
        baseSvc({ id: '1', technicianId: 't1', technicianName: 'Budi', status: 'lunas', finalCost: 100, history: doneAt('2026-06-05T02:00:00.000Z') }),
        // Belum dibayar: dihitung selesai, nilainya belum. Nama terbaru dipakai.
        baseSvc({ id: '2', technicianId: 't1', technicianName: 'Budi S.', status: 'selesai', finalCost: 200, history: doneAt('2026-06-10T02:00:00.000Z') }),
        baseSvc({ id: '3', technicianId: 't2', technicianName: 'Ani', status: 'lunas', finalCost: 50, history: doneAt('2026-06-03T02:00:00.000Z') }),
        // Selesai bulan lalu, walau dilunasi bulan ini.
        baseSvc({ id: '4', technicianId: 't2', technicianName: 'Ani', status: 'lunas', finalCost: 500, history: doneAt('2026-05-28T02:00:00.000Z') }),
        baseSvc({ id: '5', technicianId: 't2', technicianName: 'Ani', status: 'lunas', warrantyClaimOf: '3', history: doneAt('2026-06-04T02:00:00.000Z') }),
        baseSvc({ id: '6', technicianId: 't2', technicianName: 'Ani', status: 'pengerjaan' }),
      ],
      ...JUNE,
    );
    expect(board).toEqual([
      { key: 't1', name: 'Budi S.', completed: 2, revenue: 100 },
      { key: 't2', name: 'Ani', completed: 1, revenue: 50 },
    ]);
  });
});

describe('computeAlerts', () => {
  it('flags confirmation, stock, and ready units', () => {
    const inv: InventoryItem[] = [
      {
        id: 'a',
        orgId: 'o1',
        outletId: null,
        name: 'X',
        category: '',
        sku: '',
        stock: 0,
        minStock: 2,
        costPrice: 0,
        sellPrice: 0,
        supplierId: null,
        createdAt: '',
        updatedAt: '',
        deletedAt: null,
      },
      {
        id: 'b',
        orgId: 'o1',
        outletId: null,
        name: 'Y',
        category: '',
        sku: '',
        stock: 1,
        minStock: 3,
        costPrice: 0,
        sellPrice: 0,
        supplierId: null,
        createdAt: '',
        updatedAt: '',
        deletedAt: null,
      },
    ];
    const alerts = computeAlerts(
      serviceSummary(
        [
          baseSvc({ id: '1', status: 'konfirmasi' }),
          baseSvc({ id: '2', status: 'selesai' }),
          // Already collected → must NOT count toward "menunggu diambil".
          baseSvc({ id: '3', status: 'lunas', pickedUp: true }),
        ],
        ...JUNE,
      ),
      inv,
    );
    expect(alerts).toEqual([
      expect.objectContaining({
        kind: 'confirmation',
        count: 1,
        href: '/services?status=konfirmasi',
      }),
      expect.objectContaining({
        kind: 'out-of-stock',
        count: 1,
        href: '/inventory?stock=out',
      }),
      expect.objectContaining({
        kind: 'low-stock',
        count: 1,
        href: '/inventory?stock=low',
      }),
      expect.objectContaining({
        kind: 'awaiting-pickup',
        count: 1,
        href: '/services?pickup=awaiting',
      }),
    ]);
  });

  it('returns no alerts when all clear', () => {
    expect(computeAlerts({ confirmation: 0, awaitingPickup: 0 }, [])).toHaveLength(0);
  });
});

describe('capital flows are never counted as business performance', () => {
  it('computeKpis ignores Modal and Prive', () => {
    const kpis = computeKpis(
      [income('2026-06-02', 500000), income('2026-06-03', 13500000, 'Modal')],
      [expense('2026-06-02', 200000), expense('2026-06-04', 9000000, 'Prive')],
      [],
      '2026-06-01',
      '2026-06-30',
    );
    expect(kpis.revenue).toBe(500000);
    expect(kpis.expense).toBe(200000);
    expect(kpis.netCashFlow).toBe(300000);
  });

  it('revenueSeries ignores Modal', () => {
    const series = revenueSeries(
      [income('2026-06-02', 100), income('2026-06-02', 13500000, 'Modal')],
      7,
      new Date('2026-06-02T12:00:00'),
    );
    expect(series.values[series.values.length - 1]).toBe(100);
  });
});

describe('revenueSeries', () => {
  it('builds a series of the requested length', () => {
    const series = revenueSeries(
      [income('2026-06-02', 100)],
      7,
      new Date('2026-06-02T12:00:00'),
    );
    expect(series.labels).toHaveLength(7);
    expect(series.values).toHaveLength(7);
    expect(series.values[6]).toBe(100); // today is last
  });
});
