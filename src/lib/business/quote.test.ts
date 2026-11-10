import { describe, it, expect } from 'vitest';
import type { QuoteRates, QuoteTier } from '@/data/types';
import {
  computeQuote,
  laborFor,
  quoteRatesIssues,
  roundUp,
  sanitizeQuoteRates,
  sellsPartsAtCost,
  EMPTY_QUOTE_RATES,
  type QuoteInput,
} from './quote';

const tier = (over: Partial<QuoteTier> = {}): QuoteTier => ({
  id: 't1',
  name: 'Ganti LCD',
  note: '',
  labor: 150_000,
  laborByCategory: {},
  warrantyPct: 10,
  highRisk: false,
  riskDpPct: null,
  riskNote: '',
  ...over,
});

const rates = (over: Partial<QuoteRates> = {}): QuoteRates => ({
  ...EMPTY_QUOTE_RATES,
  tiers: [tier()],
  partMarkupPct: 0,
  minPartProfit: 150_000,
  extras: [
    { id: 'ongkir', name: 'Ongkir part', kind: 'fixed', amount: 30_000, defaultOn: true },
    { id: 'qris', name: 'Admin QRIS', kind: 'percent', amount: 0.7, defaultOn: false },
  ],
  rounding: 0,
  dpPct: 50,
  ...over,
});

const input = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  rates: rates(),
  tierId: 't1',
  category: 'HP / Smartphone',
  stockParts: [],
  customParts: [{ id: 'c1', name: 'LCD iPhone 11', qty: 1, cost: 450_000 }],
  extraIds: ['ongkir'],
  ...over,
});

const sum = (r: { lines: { amount: number }[] }) => r.lines.reduce((a, l) => a + l.amount, 0);

describe('computeQuote: contoh price list Nuara', () => {
  // Sheet: (modal + ongkir) 480.000 + cover 10% 48.000 + jasa 150.000 + target 150.000.
  it('tanpa pembulatan = 828.000, sama persis dengan sheet', () => {
    const r = computeQuote(input())!;
    expect(r.total).toBe(828_000);
    expect(r.warrantyReserve).toBe(48_000);
    expect(r.partProfit).toBe(150_000);
    expect(sum(r)).toBe(r.total);
  });

  it('pembulatan 5.000 → 830.000; selisihnya masuk baris jasa', () => {
    const r = computeQuote(input({ rates: rates({ rounding: 5000 }) }))!;
    expect(r.rawTotal).toBe(828_000);
    expect(r.total).toBe(830_000);
    expect(r.roundingAdded).toBe(2_000);
    expect(r.lines.find((l) => l.kind === 'labor')!.amount).toBe(152_000);
    expect(sum(r)).toBe(830_000);
  });

  it('cover garansi dan target dilipat ke harga part; ongkir tampil di barisnya sendiri', () => {
    const r = computeQuote(input())!;
    expect(r.lines.map((l) => [l.kind, l.amount])).toEqual([
      ['customPart', 648_000],
      ['labor', 150_000],
      ['extra', 30_000],
    ]);
  });

  it('laba dipisah dari cadangan garansi', () => {
    const r = computeQuote(input())!;
    expect(r.cost).toBe(480_000);
    expect(r.profit).toBe(828_000 - 480_000 - 48_000);
    expect(r.profitRatio).toBeCloseTo(300_000 / 480_000);
  });
});

describe('computeQuote: laba part = markup % atau target per pekerjaan, mana yang lebih besar', () => {
  it('markup kecil kalah oleh target', () => {
    const r = computeQuote(input({ rates: rates({ partMarkupPct: 20 }) }))!;
    expect(r.partProfit).toBe(150_000); // 20% × 450.000 = 90.000 < 150.000
  });

  it('markup besar mengalahkan target', () => {
    const r = computeQuote(input({ rates: rates({ partMarkupPct: 50 }) }))!;
    expect(r.partProfit).toBe(225_000);
  });

  it('target berlaku SEKALI per pekerjaan, bukan per part', () => {
    const r = computeQuote(
      input({
        customParts: [
          { id: 'a', name: 'LCD', qty: 1, cost: 300_000 },
          { id: 'b', name: 'Baterai', qty: 1, cost: 150_000 },
        ],
      }),
    )!;
    expect(r.partProfit).toBe(150_000);
    expect(r.total).toBe(828_000);
    // Cover + laba dibagi menurut modal: 2/3 dan 1/3 dari 198.000.
    const parts = r.lines.filter((l) => l.kind === 'customPart').map((l) => l.amount);
    expect(parts).toEqual([300_000 + 132_000, 150_000 + 66_000]);
  });

  it('jumlah unit dihitung', () => {
    const r = computeQuote(input({ customParts: [{ id: 'a', name: 'Sekrup', qty: 4, cost: 5_000 }], extraIds: [] }))!;
    expect(r.customCost).toBe(20_000);
  });

  it('tanpa part luar stok: tak ada cover garansi atau target laba', () => {
    const r = computeQuote(input({ customParts: [], extraIds: [] }))!;
    expect(r.warrantyReserve).toBe(0);
    expect(r.partProfit).toBe(0);
    expect(r.total).toBe(150_000);
  });

  it('part stok memakai harga jual Inventori apa adanya; modalnya ikut biaya', () => {
    const r = computeQuote(
      input({
        customParts: [],
        extraIds: [],
        stockParts: [{ itemId: 'i1', name: 'Baterai', qty: 2, sellPrice: 200_000, costPrice: 120_000 }],
      }),
    )!;
    expect(r.total).toBe(150_000 + 400_000);
    expect(r.cost).toBe(240_000);
    expect(r.profit).toBe(550_000 - 240_000);
  });
});

describe('computeQuote: biaya titipan', () => {
  it('biaya persen dihitung dari subtotal dan masuk biaya, bukan laba', () => {
    const r = computeQuote(input({ extraIds: ['ongkir', 'qris'] }))!;
    expect(r.lines.at(-1)).toMatchObject({ kind: 'extra', pct: 0.7, amount: 5_796 }); // 0,7% × 828.000
    expect(r.total).toBe(833_796);
    expect(r.cost).toBe(480_000 + 5_796);
  });

  it('biaya yang tak dicentang tak dihitung', () => {
    const r = computeQuote(input({ extraIds: [] }))!;
    expect(r.warrantyReserve).toBe(45_000);
    expect(r.lines.some((l) => l.kind === 'extra')).toBe(false);
  });
});

describe('computeQuote: DP', () => {
  it('DP % dari total, dibulatkan ke atas', () => {
    const r = computeQuote(input({ rates: rates({ rounding: 5000, dpPct: 70 }) }))!;
    expect(r.dp).toBe(585_000); // 70% × 830.000 = 581.000
    expect(r.dpRaised).toBe(false);
  });

  it('DP tak pernah di bawah modal part luar stok', () => {
    const r = computeQuote(input({ rates: rates({ rounding: 5000, dpPct: 30 }) }))!;
    expect(r.dp).toBe(450_000); // 30% × 830.000 = 249.000 < modal 450.000
    expect(r.dpRaised).toBe(true);
  });

  it('DP tak melebihi total', () => {
    const r = computeQuote(input({ rates: rates({ dpPct: 100, rounding: 10000 }) }))!;
    expect(r.dp).toBe(r.total);
  });

  it('tingkat berisiko memakai DP % sendiri dan membawa catatannya', () => {
    const risky = tier({ highRisk: true, riskDpPct: 80, riskNote: 'Data bisa hilang.' });
    const r = computeQuote(input({ rates: rates({ tiers: [risky], rounding: 5000 }) }))!;
    expect(r.highRisk).toBe(true);
    expect(r.riskNote).toBe('Data bisa hilang.');
    expect(r.dpPct).toBe(80);
    expect(r.dp).toBe(665_000); // 80% × 830.000 = 664.000
  });

  it('DP khusus diabaikan bila tanda risikonya mati', () => {
    const r = computeQuote(input({ rates: rates({ tiers: [tier({ riskDpPct: 80 })] }) }))!;
    expect(r.dpPct).toBe(50);
  });
});

describe('computeQuote: lain-lain', () => {
  it('tingkat tak dikenal → null', () => {
    expect(computeQuote(input({ tierId: 'x' }))).toBeNull();
  });

  it('angka rusak dari input staf tak merusak hitungan', () => {
    const r = computeQuote(
      input({ customParts: [{ id: 'a', name: 'LCD', qty: 0, cost: Number.NaN }], extraIds: [] }),
    )!;
    expect(r.customCost).toBe(0);
    expect(r.total).toBe(150_000);
  });
});

describe('laborFor', () => {
  const t = tier({ labor: 150_000, laborByCategory: { Laptop: 250_000 } });
  it('memakai tarif kategori bila ada', () => expect(laborFor(t, 'Laptop')).toBe(250_000));
  it('jatuh ke tarif tingkat', () => expect(laborFor(t, 'Printer')).toBe(150_000));
});

describe('roundUp', () => {
  it('ke atas ke kelipatan', () => {
    expect(roundUp(828_000, 5000)).toBe(830_000);
    expect(roundUp(830_000, 5000)).toBe(830_000);
    expect(roundUp(830_001, 10000)).toBe(840_000);
  });
  it('0 = tanpa pembulatan', () => expect(roundUp(828_123, 0)).toBe(828_123));
});

describe('sanitizeQuoteRates', () => {
  it('kosong/rusak → tarif kosong, tanpa harga bawaan', () => {
    for (const raw of [undefined, null, 'x', [], 42]) {
      expect(sanitizeQuoteRates(raw)).toEqual(EMPTY_QUOTE_RATES);
    }
  });

  it('membersihkan angka, teks, dan pilihan yang tak sah', () => {
    const r = sanitizeQuoteRates({
      tiers: [
        { id: 'a', name: '  Ringan ', labor: 50_000.4, warrantyPct: 250, laborByCategory: { Laptop: 90_000, '': 1, HP: -5 } },
        { name: '' },
        'bukan objek',
        { id: 'a', name: 'Berat', labor: -1, highRisk: true, riskDpPct: 70, riskNote: 'x'.repeat(400) },
      ],
      extras: [{ name: 'Ongkir', kind: 'aneh', amount: 20_000 }, { name: 'QRIS', kind: 'percent', amount: 0.705 }],
      rounding: 2500,
      dpPct: 150,
      partMarkupPct: -10,
      minPartProfit: '100000',
    });
    expect(r.tiers).toHaveLength(2);
    expect(r.tiers[0]).toMatchObject({ id: 'a', name: 'Ringan', labor: 50_000, warrantyPct: 100, laborByCategory: { Laptop: 90_000 } });
    expect(r.tiers[1].id).not.toBe('a'); // id kembar diganti
    expect(r.tiers[1]).toMatchObject({ labor: 0, highRisk: true, riskDpPct: 70 });
    expect(r.tiers[1].riskNote).toHaveLength(280);
    expect(r.extras[0]).toMatchObject({ kind: 'fixed', amount: 20_000, defaultOn: false });
    expect(r.extras[1]).toMatchObject({ kind: 'percent', amount: 0.71 });
    expect(r.rounding).toBe(1000);
    expect(r.dpPct).toBe(100);
    expect(r.partMarkupPct).toBe(0);
    expect(r.minPartProfit).toBe(0);
  });

  it('DP 0 yang disengaja tetap 0', () => {
    expect(sanitizeQuoteRates({ dpPct: 0 }).dpPct).toBe(0);
  });

  it('tarif yang sudah bersih tidak berubah', () => {
    const clean = rates({ rounding: 5000 });
    expect(sanitizeQuoteRates(clean)).toEqual(clean);
  });
});

describe('quoteRatesIssues', () => {
  it('menolak nama kosong, nama kembar, dan tingkat berisiko tanpa catatan', () => {
    const issues = quoteRatesIssues(
      rates({
        tiers: [
          tier({ id: 'a', name: 'Ringan' }),
          tier({ id: 'b', name: ' ringan ' }),
          tier({ id: 'c', name: '' }),
          tier({ id: 'd', name: 'Board', highRisk: true, riskNote: '  ' }),
        ],
        extras: [{ id: 'e', name: '', kind: 'fixed', amount: 0, defaultOn: false }],
      }),
    );
    expect(issues).toEqual([
      { code: 'tierDuplicate', index: 1 },
      { code: 'tierName', index: 2 },
      { code: 'riskNote', index: 3 },
      { code: 'extraName', index: 0 },
    ]);
  });

  it('tarif yang sah tak punya masalah', () => {
    expect(quoteRatesIssues(rates())).toEqual([]);
  });
});

describe('sellsPartsAtCost', () => {
  it('markup 0 dan target 0 → part dijual seharga modal', () => {
    expect(sellsPartsAtCost(rates({ minPartProfit: 0 }))).toBe(true);
    expect(sellsPartsAtCost(rates())).toBe(false);
  });
});
