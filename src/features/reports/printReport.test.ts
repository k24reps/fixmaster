import { describe, it, expect } from 'vitest';
import { reportDocHtml, type ReportDocData } from './printReport';
import { profitLoss, computeBreakEven } from '@/lib/business/overhead';
import { serviceQuality, salesBreakdown, customerStats, stockValue } from '@/lib/business/reports';
import type { Organization } from '@/data/types';

const org: Organization = {
  id: 'o1',
  name: 'Konter Uji',
  address: 'Jl. Uji 1',
  phone: '0812',
  logoDataUrl: null,
  servicePrefix: 'FM',
  planType: 'standard',
  trialStartedAt: null,
  planExpiredAt: null,
  maxOutlets: 1,
  maxUsers: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const sale = {
  date: '2026-11-03',
  subtotal: 1_000_000,
  total: 900_000,
  voided: false,
  customerId: 'c1',
  customerName: 'Ana',
  lines: [{ itemId: 'lcd', name: 'LCD A', qty: 1, sellPrice: 1_000_000, costPrice: 600_000 }],
};

function doc(over: Partial<ReportDocData> = {}): string {
  const base: ReportDocData = {
    org,
    from: '2026-11-01',
    to: '2026-11-30',
    scopeLabel: 'Semua Outlet',
    verdict: { headline: 'Arus kas bersih Rp 1.', source: 'sumber' },
    summary: { income: 2_000_000, expense: 500_000, net: 1_500_000 },
    comparison: {
      current: { income: 2_000_000, expense: 500_000, net: 1_500_000 },
      previous: { income: 0, expense: 0, net: 0 },
      incomeDelta: null,
      expenseDelta: null,
      netDelta: null,
    },
    noBaseline: true,
    salesTotal: 900_000,
    salesInfo: salesBreakdown([sale], '2026-11-01', '2026-11-30'),
    custStats: customerStats([], [], [sale], new Set(['c1']), '2026-11-01', '2026-11-30'),
    stock: stockValue([{ id: 'bat', name: 'Baterai Diam', stock: 3, costPrice: 100_000, sellPrice: 150_000 }], [sale], [], '2026-11-01', '2026-11-30'),
    target: { revenue: 10_000_000, serviceCount: 20, pace: 0.5 },
    breakEven: null,
    pl: profitLoss({ revenue: 1_100_000, profit: 800_000 }, [sale], []),
    unitsDone: 2,
    running: true,
    trend: [],
    incomeByCategory: [],
    expenseByCategory: [],
    catProfit: [],
    partUsage: [],
    restock: [],
    funnel: [],
    quality: serviceQuality([], []),
    techRows: [],
    pickups: [],
    outletStats: [],
    receivables: [],
    txnRows: [],
  };
  return reportDocHtml({ ...base, ...over });
}

describe('reportDocHtml', () => {
  it('memuat bagian-bagian baru Laporan (14 Nov 2026)', () => {
    const html = doc();
    for (const heading of ['Target Bulan Ini', 'Penjualan Kasir', 'Nilai Stok di Rak', 'Pelanggan Periode Ini', 'Mutu &amp; Kecepatan Servis']) {
      expect(html, heading).toContain(heading);
    }
    // Barang kasir, barang tak bergerak, dan pelanggan teratas tertulis di kertas.
    expect(html).toContain('LCD A');
    expect(html).toContain('Baterai Diam');
    expect(html).toContain('Ana');
  });

  it('target hanya dicetak untuk periode satu bulan kalender', () => {
    expect(doc({ target: { revenue: 10_000_000, serviceCount: 20, pace: null } })).not.toContain('Target Bulan Ini');
  });

  it('tanpa data break-even, struk Laba Rugi tidak dicetak (rentang tak sah)', () => {
    expect(doc()).not.toContain('Laba Rugi');
  });

  it('periode berjalan: struk Laba Rugi menulis jarak ke impas, bukan rugi', () => {
    const breakEven = computeBreakEven(
      {
        expenses: [{ date: '2026-11-01', category: 'Sewa', amount: 2_000_000, outletId: null }],
        from: '2026-11-01',
        to: '2026-11-30',
        today: '2026-11-14',
        rent: {},
        outletIds: ['o1'],
        startMonth: '2026-01',
      },
      800_000,
      [sale],
      [],
    );
    const html = doc({ breakEven, running: true });
    expect(html).toContain('Laba Rugi');
    expect(html).toContain('Kurang untuk impas');
    expect(html).not.toContain('Rugi usaha');
    expect(doc({ breakEven, running: false })).toContain('Rugi usaha');
  });
});

