import { describe, it, expect } from 'vitest';
import type { QuoteRates } from '@/data/types';
import {
  computeQuote,
  emptyQuoteRates,
  quoteDefaults,
  quoteRatesIssues,
  quoteValue,
  sanitizeQuoteRates,
  QUOTE_LIMITS,
} from './quote';

describe('computeQuote: rumus sheet price list', () => {
  // Angka persis dari sheet pemilik.
  const sheet = computeQuote({ modal: 680_000, ongkir: 30_000, jasa: 150_000, coverPct: 10, targetProfit: 150_000 });

  it('subtotal modal + ongkir = 710.000', () => {
    expect(sheet.subtotal).toBe(710_000);
  });

  it('cover garansi 10% = 71.000', () => {
    expect(sheet.cover).toBe(71_000);
  });

  it('harga rekomendasi = 1.081.000', () => {
    expect(sheet.price).toBe(1_081_000);
  });

  it('profit estimasi = harga − subtotal = 371.000 (cover ikut dihitung)', () => {
    expect(sheet.profit).toBe(371_000);
    expect(sheet.profit).toBe(sheet.cover + 150_000 + 150_000);
  });

  it('markup = profit ÷ subtotal ≈ 52,3%', () => {
    expect(sheet.markup).toBeCloseTo(0.5225, 4);
  });

  it('cover dibulatkan ke rupiah', () => {
    const r = computeQuote({ modal: 333_333, ongkir: 0, jasa: 0, coverPct: 10, targetProfit: 0 });
    expect(r.cover).toBe(33_333);
    expect(r.price).toBe(366_666);
  });

  it('pekerjaan tanpa part dan ongkir: markup null, harga = jasa + target', () => {
    const r = computeQuote({ modal: 0, ongkir: 0, jasa: 75_000, coverPct: 10, targetProfit: 25_000 });
    expect(r).toEqual({
      subtotal: 0,
      coverPct: 10,
      cover: 0,
      jasa: 75_000,
      targetProfit: 25_000,
      price: 100_000,
      profit: 100_000,
      markup: null,
    });
  });

  it('nilai negatif, NaN, dan persen di atas 100 dijinakkan', () => {
    const r = computeQuote({ modal: -5, ongkir: Number.NaN, jasa: 10_000, coverPct: 250, targetProfit: Infinity });
    expect(r).toMatchObject({ subtotal: 0, coverPct: 100, cover: 0, targetProfit: 0, price: 10_000, markup: null });
    const full = computeQuote({ modal: 100_000, ongkir: 0, jasa: 0, coverPct: 250, targetProfit: 0 });
    expect(full.cover).toBe(100_000);
  });

  it('baris struk selalu berjumlah harga', () => {
    for (const input of [
      { modal: 680_000, ongkir: 30_000, jasa: 150_000, coverPct: 10, targetProfit: 150_000 },
      { modal: 123_457, ongkir: 9_999, jasa: 1, coverPct: 12.5, targetProfit: 77_777 },
    ]) {
      const r = computeQuote(input);
      expect(r.subtotal + r.cover + r.jasa + r.targetProfit).toBe(r.price);
    }
  });
});

describe('sanitizeQuoteRates', () => {
  it('kosong / rusak → empat kolom tanpa template', () => {
    for (const raw of [undefined, null, 'x', 42, [], {}]) {
      expect(sanitizeQuoteRates(raw)).toEqual(emptyQuoteRates());
    }
  });

  it('membersihkan nilai, memangkas nama, dan menjaga id unik', () => {
    const r = sanitizeQuoteRates({
      jasa: {
        chips: [
          { id: 'a', label: '  LCD  ', value: 150_000.4 },
          { id: 'a', label: 'X'.repeat(40), value: -10 },
          { label: 'Tanpa id', value: '5000' },
          'bukan objek',
        ],
        defaultId: 'a',
      },
      coverPct: { chips: [{ id: 'c', label: '', value: 12.345 }, { id: 'd', value: 180 }] },
    });
    expect(r.jasa.chips).toEqual([
      { id: 'a', label: 'LCD', value: 150_000 },
      { id: 'jasa-2-1', label: 'X'.repeat(QUOTE_LIMITS.label), value: 0 },
      { id: 'jasa-3', label: 'Tanpa id', value: 0 },
    ]);
    expect(r.jasa.defaultId).toBe('a');
    expect(r.coverPct.chips.map((c) => c.value)).toEqual([12.3, 100]);
    expect(r.ongkir).toEqual({ chips: [], defaultId: null });
  });

  it('default yang tak menunjuk chip mana pun jadi null', () => {
    const r = sanitizeQuoteRates({ ongkir: { chips: [{ id: 'a', label: 'Lokal', value: 15_000 }], defaultId: 'hilang' } });
    expect(r.ongkir.defaultId).toBeNull();
  });

  it(`paling banyak ${QUOTE_LIMITS.chips} template per kolom`, () => {
    const chips = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, label: `T${i}`, value: i * 1000 }));
    expect(sanitizeQuoteRates({ ongkir: { chips } }).ongkir.chips).toHaveLength(QUOTE_LIMITS.chips);
  });

  it('idempoten', () => {
    const once = sanitizeQuoteRates({ jasa: { chips: [{ label: 'LCD', value: 150_000 }], defaultId: 'jasa-1' } });
    expect(sanitizeQuoteRates(once)).toEqual(once);
  });

  it('bentuk lama (tingkat pekerjaan) dipetakan ke template', () => {
    const r = sanitizeQuoteRates({
      tiers: [
        { id: 't1', name: 'Ringan', labor: 50_000, warrantyPct: 0 },
        { id: 't2', name: 'Ganti LCD', labor: 150_000, warrantyPct: 10 },
        { id: 't3', name: 'Mesin', labor: 250_000, warrantyPct: 10 },
      ],
      extras: [
        { name: 'Ongkir part', kind: 'fixed', amount: 30_000 },
        { name: 'Admin QRIS', kind: 'percent', amount: 0.7 },
      ],
      partMarkupPct: 0,
      minPartProfit: 150_000,
      rounding: 1000,
      dpPct: 50,
    });
    expect(r.jasa.chips.map((c) => [c.label, c.value])).toEqual([
      ['Ringan', 50_000],
      ['Ganti LCD', 150_000],
      ['Mesin', 250_000],
    ]);
    expect(r.coverPct.chips.map((c) => c.value)).toEqual([0, 10]);
    expect(r.ongkir.chips.map((c) => [c.label, c.value])).toEqual([['Ongkir part', 30_000]]);
    expect(r.targetProfit.chips.map((c) => c.value)).toEqual([150_000]);
    expect(Object.values(r).every((p) => p.defaultId === null)).toBe(true);
  });

  it('bentuk baru tidak dianggap bentuk lama walau sisa field lama masih ada', () => {
    const r = sanitizeQuoteRates({ tiers: [{ name: 'Lama', labor: 1 }], jasa: { chips: [] } });
    expect(r.jasa.chips).toEqual([]);
  });
});

describe('quoteValue', () => {
  it('cover persen satu desimal 0–100, kolom lain rupiah bulat', () => {
    expect(quoteValue('coverPct', 10.06)).toBe(10.1);
    expect(quoteValue('coverPct', 101)).toBe(100);
    expect(quoteValue('jasa', 1500.6)).toBe(1501);
    expect(quoteValue('ongkir', -1)).toBe(0);
  });
});

describe('quoteRatesIssues', () => {
  const rates = (jasa: QuoteRates['jasa']['chips']): QuoteRates => ({ ...emptyQuoteRates(), jasa: { chips: jasa, defaultId: null } });

  it('nama kembar (beda huruf besar) ditolak', () => {
    const issues = quoteRatesIssues(rates([
      { id: 'a', label: 'LCD', value: 150_000 },
      { id: 'b', label: 'lcd ', value: 200_000 },
    ]));
    expect(issues).toEqual([{ field: 'jasa', index: 1 }]);
  });

  it('dua chip tanpa nama bernilai sama ditolak; nilai sama dengan nama beda boleh', () => {
    expect(quoteRatesIssues(rates([
      { id: 'a', label: '', value: 50_000 },
      { id: 'b', label: '', value: 50_000 },
    ]))).toEqual([{ field: 'jasa', index: 1 }]);
    expect(quoteRatesIssues(rates([
      { id: 'a', label: 'LCD', value: 150_000 },
      { id: 'b', label: 'Mesin', value: 150_000 },
    ]))).toEqual([]);
  });
});

describe('quoteDefaults', () => {
  it('chip default mengisi kolomnya; tanpa default kolom mulai dari 0', () => {
    const r = sanitizeQuoteRates({
      coverPct: { chips: [{ id: 's', label: 'Standar', value: 10 }], defaultId: 's' },
      jasa: { chips: [{ id: 'l', label: 'LCD', value: 150_000 }] },
    });
    expect(quoteDefaults(r)).toEqual({
      ongkir: { chipId: null, value: 0 },
      jasa: { chipId: null, value: 0 },
      coverPct: { chipId: 's', value: 10 },
      targetProfit: { chipId: null, value: 0 },
    });
  });
});
