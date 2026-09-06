import { describe, it, expect } from 'vitest';
import {
  trendMode,
  trendSeries,
  transactionRows,
  profitByDeviceCategory,
  sparepartUsage,
  restockSuggestions,
  serviceFunnel,
  completionDate,
  avgTurnaroundDays,
  ratioDelta,
  periodComparison,
  previousWindow,
  outletComparison,
  receivablesAging,
} from './reports';
import type {
  Service,
  InventoryItem,
  ServiceSparepart,
  IncomeCategory,
  ExpenseCategory,
} from '@/data/types';

const inc = (
  date: string,
  amount: number,
  over: Partial<{
    category: IncomeCategory;
    description: string;
    outletId: string | null;
  }> = {},
) => ({
  date,
  amount,
  category: 'Servis' as IncomeCategory,
  description: '',
  outletId: null as string | null,
  ...over,
});
const exp = (
  date: string,
  amount: number,
  over: Partial<{
    category: ExpenseCategory;
    description: string;
    outletId: string | null;
  }> = {},
) => ({
  date,
  amount,
  category: 'Sparepart' as ExpenseCategory,
  description: '',
  outletId: null as string | null,
  ...over,
});

const part = (over: Partial<ServiceSparepart>): ServiceSparepart => ({
  itemId: over.itemId ?? 'i1',
  name: over.name ?? 'LCD',
  qty: over.qty ?? 1,
  costPrice: over.costPrice ?? 50000,
  sellPrice: over.sellPrice ?? 80000,
  deducted: over.deducted ?? true,
  kind: over.kind ?? 'inventory',
});

const svc = (over: Partial<Service>): Service => ({
  id: over.id ?? 's1',
  orgId: 'o1',
  outletId: over.outletId ?? null,
  serviceNo: over.serviceNo ?? 'FM-0001',
  customerId: 'c1',
  customerName: over.customerName ?? 'Budi',
  customerPhone: '08',
  category: over.category ?? 'HP',
  device: 'iPhone',
  complaint: '',
  accessories: '',
  status: over.status ?? 'selesai',
  technicianId: null,
  technicianName: over.technicianName ?? 'Andi',
  estimateCost: over.estimateCost ?? 0,
  finalCost: over.finalCost ?? 100000,
  downPayment: over.downPayment ?? 0,
  spareparts: over.spareparts ?? [],
  warrantyServiceUntil: null,
  warrantyPartsUntil: null,
  pickedUp: false,
  pickedUpAt: null,
  warrantyClaimOf: null,
  history: over.history ?? [],
  archived: false,
  createdAt: over.createdAt ?? '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  deletedAt: null,
});

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: over.id ?? 'i1',
  orgId: 'o1',
  outletId: null,
  name: over.name ?? 'LCD',
  category: 'Layar',
  sku: 'SKU1',
  stock: over.stock ?? 5,
  minStock: over.minStock ?? 2,
  costPrice: 50000,
  sellPrice: 80000,
  supplierId: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

describe('trendMode', () => {
  it('uses daily buckets for short ranges', () => {
    expect(trendMode('2026-06-01', '2026-06-30')).toBe('day');
  });
  it('uses weekly buckets for medium ranges', () => {
    expect(trendMode('2026-01-01', '2026-04-01')).toBe('week');
  });
  it('uses monthly buckets for long ranges', () => {
    expect(trendMode('2025-01-01', '2026-01-01')).toBe('month');
  });
});

describe('trendSeries', () => {
  it('buckets income and expense by day', () => {
    const series = trendSeries(
      [inc('2026-06-01', 100), inc('2026-06-01', 50), inc('2026-06-03', 200)],
      [exp('2026-06-02', 30)],
      '2026-06-01',
      '2026-06-03',
    );
    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({ income: 150, expense: 0, net: 150 });
    expect(series[1]).toMatchObject({ income: 0, expense: 30, net: -30 });
    expect(series[2]).toMatchObject({ income: 200, expense: 0, net: 200 });
  });
  it('groups into months for long ranges', () => {
    const series = trendSeries(
      [inc('2025-01-15', 100), inc('2025-03-10', 200)],
      [],
      '2025-01-01',
      '2026-01-01',
    );
    expect(series).toHaveLength(13);
    expect(series[0].income).toBe(100);
    expect(series[2].income).toBe(200);
  });
});

describe('transactionRows', () => {
  it('signs amounts and sorts newest first', () => {
    const rows = transactionRows([inc('2026-06-01', 100)], [exp('2026-06-05', 40)]);
    expect(rows[0]).toMatchObject({
      date: '2026-06-05',
      type: 'Pengeluaran',
      amount: -40,
    });
    expect(rows[1]).toMatchObject({ date: '2026-06-01', type: 'Pemasukan', amount: 100 });
  });
});

describe('profitByDeviceCategory', () => {
  it('groups realized services by category with profit', () => {
    const result = profitByDeviceCategory([
      svc({
        category: 'HP',
        finalCost: 200000,
        spareparts: [part({ qty: 1, costPrice: 50000 })],
      }),
      svc({ id: 's2', category: 'HP', status: 'lunas', finalCost: 100000 }),
      svc({ id: 's3', category: 'Laptop', finalCost: 300000 }),
      svc({ id: 's4', category: 'HP', status: 'pengerjaan', finalCost: 999999 }), // excluded
    ]);
    const hp = result.find((r) => r.category === 'HP')!;
    expect(hp.count).toBe(2);
    expect(hp.revenue).toBe(300000);
    expect(hp.profit).toBe(250000); // (200k-50k) + 100k
  });
});

describe('sparepartUsage', () => {
  it('aggregates qty and cost per part name', () => {
    const result = sparepartUsage([
      svc({ spareparts: [part({ name: 'LCD', qty: 2, costPrice: 50000 })] }),
      svc({
        id: 's2',
        spareparts: [
          part({ name: 'LCD', qty: 1, costPrice: 50000 }),
          part({ name: 'Baterai', qty: 4, costPrice: 30000 }),
        ],
      }),
    ]);
    expect(result[0]).toMatchObject({ name: 'Baterai', qty: 4 });
    expect(result.find((r) => r.name === 'LCD')).toMatchObject({ qty: 3, cost: 150000 });
  });
});

describe('restockSuggestions', () => {
  it('returns items at or below min stock, neediest first', () => {
    const result = restockSuggestions([
      item({ id: 'a', stock: 5, minStock: 2 }), // ok
      item({ id: 'b', stock: 1, minStock: 2 }),
      item({ id: 'c', stock: 0, minStock: 1 }),
    ]);
    expect(result.map((i) => i.id)).toEqual(['c', 'b']);
  });
});

describe('serviceFunnel', () => {
  it('counts services per status in workflow order, dropping zeros', () => {
    const result = serviceFunnel([
      svc({ status: 'diterima' }),
      svc({ id: 's2', status: 'pengerjaan' }),
      svc({ id: 's3', status: 'pengerjaan' }),
    ]);
    expect(result.map((s) => s.status)).toEqual(['diterima', 'pengerjaan']);
    expect(result[1].count).toBe(2);
  });
});

describe('completionDate / avgTurnaroundDays', () => {
  const withHistory = svc({
    createdAt: '2026-06-01T00:00:00.000Z',
    history: [
      {
        at: '2026-06-05T10:00:00.000Z',
        status: 'selesai',
        by: 'e1',
        byName: 'A',
        note: '',
        internal: false,
      },
    ],
  });
  it('reads completion date from history', () => {
    expect(completionDate(withHistory)).toBe('2026-06-05');
  });
  it('averages intake→completion spans', () => {
    const other = svc({
      id: 's2',
      createdAt: '2026-06-01T00:00:00.000Z',
      history: [
        {
          at: '2026-06-03T00:00:00.000Z',
          status: 'selesai',
          by: 'e',
          byName: 'A',
          note: '',
          internal: false,
        },
      ],
    });
    expect(avgTurnaroundDays([withHistory, other])).toBe(3); // (4 + 2) / 2
  });
  it('returns 0 when nothing completed', () => {
    expect(avgTurnaroundDays([svc({ history: [] })])).toBe(0);
  });
});

describe('ratioDelta', () => {
  it('computes growth fraction', () => {
    expect(ratioDelta(150, 100)).toBeCloseTo(0.5);
    expect(ratioDelta(50, 100)).toBeCloseTo(-0.5);
  });
  it('guards divide-by-zero', () => {
    expect(ratioDelta(0, 0)).toBe(0);
  });

  it('mengembalikan null saat tidak ada dasar pembanding', () => {
    // Dulu ini `1`, yang tampil sebagai "+100,0%" dan tidak bisa dibedakan
    // dari pertumbuhan dua kali lipat sungguhan. Periode setelah periode mati
    // jadi terbaca seperti kabar baik.
    expect(ratioDelta(100, 0)).toBeNull();
  });

  it('kehancuran ke nol tetap dilaporkan sebagai -100%', () => {
    // Arah sebaliknya HARUS tetap berupa angka: ada dasarnya, dan kabar
    // buruknya justru yang paling perlu terbaca (PRODUCT.md, Prinsip 4).
    expect(ratioDelta(0, 100)).toBeCloseTo(-1);
  });
});

describe('periodComparison', () => {
  it('compares against the preceding equal-length window', () => {
    // Current window 06-08..06-14 (span 6) → previous window 06-01..06-07.
    const incomes = [inc('2026-06-10', 200), inc('2026-06-03', 100)];
    const result = periodComparison(incomes, [], '2026-06-08', '2026-06-14');
    expect(result.current.income).toBe(200);
    expect(result.previous.income).toBe(100);
    expect(result.incomeDelta).toBeCloseTo(1); // 100 → 200 = +100%
  });

  it('mengaku tidak punya dasar saat periode lalu kosong', () => {
    // Regresi yang ditemukan saat kritik: pemanggil hanya mengambil periode
    // terpilih, jadi `previous` selalu nol dan chip di layar cuma bisa 0%
    // atau +100%. Fungsinya benar; yang salah adalah datanya tidak diberikan.
    const result = periodComparison(
      [inc('2026-06-10', 200)],
      [],
      '2026-06-08',
      '2026-06-14',
    );
    expect(result.previous.income).toBe(0);
    expect(result.incomeDelta).toBeNull();
  });

  it('menghitung jendela pembanding yang sama panjang', () => {
    expect(previousWindow('2026-06-08', '2026-06-14')).toEqual(['2026-06-01', '2026-06-07']);
  });
});

describe('outletComparison', () => {
  it('groups by outlet and labels null as Tanpa Cabang', () => {
    const result = outletComparison(
      [
        inc('2026-06-01', 100, { outletId: 'A' }),
        inc('2026-06-01', 50, { outletId: null }),
      ],
      [exp('2026-06-01', 20, { outletId: 'A' })],
      [{ id: 'A', name: 'Cabang Pusat' }],
      '2026-06-01',
      '2026-06-30',
    );
    const pusat = result.find((r) => r.outletId === 'A')!;
    expect(pusat).toMatchObject({
      name: 'Cabang Pusat',
      income: 100,
      expense: 20,
      net: 80,
    });
    expect(result.find((r) => r.name === 'Tanpa Cabang')).toMatchObject({ income: 50 });
  });
});

describe('receivablesAging', () => {
  it('lists completed services with outstanding balance, aged', () => {
    const today = new Date('2026-06-20T00:00:00.000Z');
    const result = receivablesAging(
      [
        svc({
          status: 'selesai',
          finalCost: 200000,
          downPayment: 50000,
          history: [
            {
              at: '2026-06-18T00:00:00.000Z',
              status: 'selesai',
              by: 'e',
              byName: 'A',
              note: '',
              internal: false,
            },
          ],
        }),
        svc({ id: 's2', status: 'selesai', finalCost: 100000, downPayment: 100000 }), // paid → excluded
        svc({ id: 's3', status: 'pengerjaan', finalCost: 100000, downPayment: 0 }), // not done → excluded
      ],
      today,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ outstanding: 150000, bucket: '0-7' });
  });
  it('buckets older debts as 31+', () => {
    const today = new Date('2026-06-20T00:00:00.000Z');
    const result = receivablesAging(
      [
        svc({
          status: 'selesai',
          finalCost: 100000,
          downPayment: 0,
          createdAt: '2026-04-01T00:00:00.000Z',
          history: [],
        }),
      ],
      today,
    );
    expect(result[0].bucket).toBe('31+');
  });
});

describe('capital flows are excluded from every reporting aggregate', () => {
  const modal = inc('2026-06-10', 13500000, { category: 'Modal' });
  const prive = exp('2026-06-10', 9000000, { category: 'Prive' });

  it('trendSeries: owner money never enters the trend', () => {
    const clean = trendSeries(
      [inc('2026-06-10', 100)],
      [exp('2026-06-10', 40)],
      '2026-06-01',
      '2026-06-30',
    );
    const withCapital = trendSeries(
      [inc('2026-06-10', 100), modal],
      [exp('2026-06-10', 40), prive],
      '2026-06-01',
      '2026-06-30',
    );
    expect(withCapital).toEqual(clean);
  });

  it('periodComparison: deltas unaffected by an injection', () => {
    const clean = periodComparison(
      [inc('2026-06-10', 200)],
      [],
      '2026-06-08',
      '2026-06-14',
    );
    const withCapital = periodComparison(
      [inc('2026-06-10', 200), modal],
      [],
      '2026-06-08',
      '2026-06-14',
    );
    expect(withCapital).toEqual(clean);
  });

  it('outletComparison: injection into a branch does not inflate its net', () => {
    const result = outletComparison(
      [
        inc('2026-06-01', 100, { outletId: 'A' }),
        inc('2026-06-01', 13500000, { outletId: 'A', category: 'Modal' }),
      ],
      [exp('2026-06-01', 20, { outletId: 'A' })],
      [{ id: 'A', name: 'Cabang Pusat' }],
      '2026-06-01',
      '2026-06-30',
    );
    expect(result.find((r) => r.outletId === 'A')).toMatchObject({
      income: 100,
      expense: 20,
      net: 80,
    });
  });

  // Daftar transaksi mentah HARUS tetap menampilkannya — itu bukan ringkasan
  // laba, dan menyembunyikannya bikin saldo tak ada penjelasnya.
  it('transactionRows: still lists capital rows', () => {
    const rows = transactionRows([inc('2026-06-10', 100), modal], [prive]);
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.category === 'Modal')).toBe(true);
    expect(rows.some((r) => r.category === 'Prive')).toBe(true);
  });
});
