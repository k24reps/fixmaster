import { describe, it, expect } from 'vitest';
import {
  overheadForRange,
  grossProfit,
  overheadFetchFrom,
  overheadFetchTo,
  expenseGroupOf,
  breakEvenVerdict,
  computeBreakEven,
} from './overhead';

const ex = (date: string, category: string, amount: number, outletId: string | null = null) => ({
  date,
  category: category as never,
  amount,
  outletId,
});
const base = { rent: {}, outletIds: ['o1'], startMonth: '2026-05' };

// Jun–Agu tercatat penuh; Agustus ada bonus + servis AC.
const history = [
  ex('2026-06-01', 'Sewa', 5e6), ex('2026-06-30', 'Gaji', 8e6), ex('2026-06-10', 'Operasional', 1.8e6),
  ex('2026-07-01', 'Sewa', 5e6), ex('2026-07-31', 'Gaji', 8e6), ex('2026-07-10', 'Operasional', 2.1e6),
  ex('2026-08-01', 'Sewa', 5e6), ex('2026-08-31', 'Gaji', 9.5e6), ex('2026-08-10', 'Operasional', 2.6e6),
  ex('2026-08-12', 'Sparepart', 4e6), ex('2026-08-13', 'Prive', 3e6),
];

describe('overheadForRange', () => {
  it('bulan lewat = realisasi; sparepart & prive tidak ikut', () => {
    const r = overheadForRange({ ...base, expenses: history, from: '2026-08-01', to: '2026-08-31', today: '2026-09-20' });
    expect(r?.total).toBeCloseTo(17.1e6);
    expect(r?.basis).toBe('actual');
  });

  it('bulan berjalan: tercatat apa adanya, beban rutin yang belum dibayar diestimasi, tanpa porsi', () => {
    const sep = [...history, ex('2026-09-01', 'Sewa', 5e6), ex('2026-09-05', 'Operasional', 2.4e6)];
    const r = overheadForRange({ ...base, expenses: sep, from: '2026-09-01', to: '2026-09-30', today: '2026-09-20' })!;
    // Sewa 5 (tercatat) · Gaji rata-rata 8,5 (belum dibayar → est.) · Operasional 2,4 (tercatat)
    expect(r.basis).toBe('estimate');
    expect(r.byCategory.Gaji).toBeCloseTo(8.5e6);
    expect(r.estimated).toEqual(['Gaji']);
    expect(r.total).toBeCloseTo(15.9e6);
    expect(r.prorated).toBe(false);
  });

  it('gaji sudah lunas bulan ini tidak diganti rata-rata (kasus 12,9 jt vs 13,75 jt)', () => {
    const hist = [ex('2026-07-05', 'Gaji', 13e6), ex('2026-08-05', 'Gaji', 14.5e6), ex('2026-09-05', 'Gaji', 12.9e6)];
    const r = overheadForRange({ ...base, expenses: hist, from: '2026-09-01', to: '2026-09-30', today: '2026-09-29' })!;
    expect(r.byCategory.Gaji).toBe(12.9e6);
    expect(r.estimated).toEqual([]);
  });

  it('penampung lama tidak diestimasi: Operasional di riwayat + Listrik & Air bulan ini tidak dobel', () => {
    const hist = [ex('2026-08-10', 'Operasional', 1.2e6), ex('2026-09-10', 'Listrik & Air', 1.2e6)];
    const r = overheadForRange({ ...base, expenses: hist, from: '2026-09-01', to: '2026-09-30', today: '2026-09-29' })!;
    expect(r.total).toBe(1.2e6);
  });

  it('seminggu di bulan lewat = realisasi × 7/31', () => {
    const r = overheadForRange({ ...base, expenses: history, from: '2026-08-14', to: '2026-08-20', today: '2026-09-20' });
    expect(r?.total).toBeCloseTo((17.1e6 * 7) / 31);
    expect(r?.prorated).toBe(true);
  });

  it('bulan pertama tanpa riwayat = yang sudah dicatat saja, ditandai belum lengkap', () => {
    const r = overheadForRange({
      ...base, startMonth: '2026-09',
      expenses: [ex('2026-09-01', 'Sewa', 5e6)], from: '2026-09-01', to: '2026-09-30', today: '2026-09-15',
    })!;
    expect(r.basis).toBe('partial');
    expect(r.total).toBe(5e6);
  });

  it('bulan mulai tidak ikut rata-rata; tanpa catatan = total 0', () => {
    const r = overheadForRange({
      ...base, startMonth: '2026-08',
      expenses: history, from: '2026-09-01', to: '2026-09-30', today: '2026-09-20',
    })!;
    expect(r.total).toBe(0);
    expect(r.basis).toBe('partial');
  });

  it('sewa tahunan diratakan ÷ 12 dan catatan sewanya tidak dihitung dobel', () => {
    const r = overheadForRange({
      ...base,
      rent: { o1: { mode: 'tahunan', yearly: 24e6 } },
      expenses: [ex('2026-08-01', 'Sewa', 24e6, 'o1'), ex('2026-08-31', 'Gaji', 8e6)],
      from: '2026-08-01', to: '2026-08-31', today: '2026-09-20',
    });
    expect(r?.byCategory.Sewa).toBeCloseTo(2e6);
    expect(r?.total).toBeCloseTo(10e6);
  });

  it('hari mendatang tidak menanggung overhead; bulan lalu tanpa gaji ditandai', () => {
    const noPay = history.filter((e) => !(e.category === 'Gaji' && e.date.startsWith('2026-08')));
    const r = overheadForRange({ ...base, expenses: noPay, from: '2026-09-01', to: '2026-09-30', today: '2026-09-10' })!;
    expect(r.missingPayroll).toBe(true);
    // Sejak tanggal 1: sewa bulan ini (belum dicatat) diestimasi utuh, tidak diporsi.
    expect(r.byCategory.Sewa).toBeCloseTo(5e6);
  });

  it('jendela pengambilan: 3 bulan sebelum sampai akhir bulan', () => {
    expect(overheadFetchFrom('2026-09-14')).toBe('2026-06-01');
    expect(overheadFetchTo('2026-02-03')).toBe('2026-02-28');
  });
});

describe('grossProfit', () => {
  it('laba servis + laba jual − garansi & refund', () => {
    const sales = [{ total: 1e6, lines: [{ qty: 2, costPrice: 300e3 }] }];
    const exps = [ex('2026-09-01', 'Garansi', 100e3), ex('2026-09-01', 'Gaji', 5e6), ex('2026-09-02', 'Refund Penjualan', 50e3)];
    expect(grossProfit(2e6, sales, exps)).toBe(2e6 + 400e3 - 150e3);
  });
});

describe('kelompok & vonis break-even', () => {
  it('kategori dikelompokkan menurut perlakuannya', () => {
    expect(expenseGroupOf('Gaji')).toBe('overhead');
    expect(expenseGroupOf('Garansi')).toBe('direct');
    expect(expenseGroupOf('Sparepart')).toBe('stock');
    expect(expenseGroupOf('Prive')).toBe('owner');
  });
  it('empat kondisi kas × break-even', () => {
    expect(breakEvenVerdict(1, 1)).toBe('healthy');
    expect(breakEvenVerdict(1, -1)).toBe('thin');
    expect(breakEvenVerdict(-1, 1)).toBe('tied');
    expect(breakEvenVerdict(-1, -1)).toBe('loss');
  });
  it('computeBreakEven: surplus = laba kotor − overhead', () => {
    const r = computeBreakEven(
      { ...base, expenses: history, from: '2026-08-01', to: '2026-08-31', today: '2026-09-20' },
      20e6, [], [],
    )!;
    expect(r.surplus).toBeCloseTo(20e6 - 17.1e6);
    expect(r.pct).toBeCloseTo(20e6 / 17.1e6);
  });
});

describe('kategori akuntansi rinci (29 Sep 2026)', () => {
  it('listrik masuk overhead, ongkir beban langsung, aset & kasbon bukan beban', () => {
    expect(expenseGroupOf('Listrik & Air')).toBe('overhead');
    expect(expenseGroupOf('Ongkos Kirim')).toBe('direct');
    expect(expenseGroupOf('Peralatan & Inventaris')).toBe('asset');
    expect(expenseGroupOf('Kasbon Karyawan')).toBe('receivable');
    expect(expenseGroupOf('Selisih Kas Kurang')).toBe('overhead');
    expect(expenseGroupOf('Pajak, Retribusi & Iuran')).toBe('overhead');
    // Refund DP / koreksi biaya sudah dihitung di laba servis: bukan overhead, bukan beban langsung.
    expect(expenseGroupOf('Refund Servis')).toBe('contra');
    expect(
      overheadForRange({ ...base, expenses: [ex('2026-08-05', 'Refund Servis', 50e3)], from: '2026-08-01', to: '2026-08-31', today: '2026-09-20' })!.total,
    ).toBe(0);
    expect(grossProfit(100e3, [], [ex('2026-08-05', 'Refund Servis', 50e3)])).toBe(100e3);
    const r = overheadForRange({
      ...base,
      expenses: [
        ex('2026-08-05', 'Listrik & Air', 1.2e6),
        ex('2026-08-06', 'Peralatan & Inventaris', 2.5e6),
        ex('2026-08-07', 'Kasbon Karyawan', 500e3),
        ex('2026-08-08', 'Ongkos Kirim', 50e3),
      ],
      from: '2026-08-01', to: '2026-08-31', today: '2026-09-20',
    })!;
    expect(r.total).toBe(1.2e6);
    expect(r.byCategory['Listrik & Air']).toBe(1.2e6);
    expect(grossProfit(1e6, [], [ex('2026-08-08', 'Ongkos Kirim', 50e3)])).toBe(950e3);
  });
});
