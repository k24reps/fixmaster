import { describe, expect, it } from 'vitest';
import {
  TERMS_PICKUP_DAYS_DEFAULT,
  TERMS_TEMPLATE_VERSION,
  currentTerms,
  isValidPickupDays,
  isValidTermsFee,
  readTerms,
  termsClauses,
  termsOf,
  termsSentenceText,
  termsToSave,
} from './serviceTerms';
import { translate } from '@/i18n';
import type { ServiceTerms } from '@/data/types';

const id = (k: Parameters<typeof translate>[1]) => translate('id', k);

describe('readTerms / currentTerms', () => {
  it('tanpa setelan: 60 hari, tanpa biaya, versi template', () => {
    expect(currentTerms(undefined)).toEqual({
      pickupDays: TERMS_PICKUP_DAYS_DEFAULT,
      storageFee: 0,
      checkFee: 0,
      extra: '',
      version: TERMS_TEMPLATE_VERSION,
    });
    expect(TERMS_PICKUP_DAYS_DEFAULT).toBe(60);
  });

  it('nilai asing dari jsonb jatuh ke bawaan, tak merusak S&K', () => {
    const t = readTerms({ pickupDays: '30', storageFee: -5, checkFee: Number.NaN, extra: 42, version: 'kemarin' });
    expect(t).toEqual(currentTerms(null));
    expect(readTerms({ pickupDays: 0 }).pickupDays).toBe(60);
    expect(readTerms({ pickupDays: 400 }).pickupDays).toBe(60);
    expect(readTerms({ pickupDays: 29.6 }).pickupDays).toBe(30);
  });

  it('ketentuan tambahan dibersihkan dan dipotong 400 huruf', () => {
    expect(readTerms({ extra: '  Satu\r\n\r\n\r\n\r\nDua  ' }).extra).toBe('Satu\n\nDua');
    expect(readTerms({ extra: 'x'.repeat(500) }).extra).toHaveLength(400);
  });

  it('versi toko yang lebih tua dari template ikut naik; salinan tiket tidak', () => {
    expect(currentTerms({ version: '2026-01-01' }).version).toBe(TERMS_TEMPLATE_VERSION);
    expect(readTerms({ version: '2026-01-01' }).version).toBe('2026-01-01');
    expect(currentTerms({ version: '2027-02-03' }).version).toBe('2027-02-03');
  });
});

describe('termsToSave', () => {
  const prev: ServiceTerms = { pickupDays: 60, storageFee: 0, checkFee: 0, extra: '', version: '2026-11-12' };

  it('isi berubah: versi jadi hari ini', () => {
    expect(termsToSave(prev, { pickupDays: 30 }, '2026-12-01')).toEqual({ ...prev, pickupDays: 30, version: '2026-12-01' });
  });

  it('isi sama: versi tetap, walau disimpan ulang', () => {
    expect(termsToSave(prev, { pickupDays: 60, storageFee: 0, checkFee: 0, extra: ' ' }, '2026-12-01')).toBe(prev);
  });

  it('jam perangkat mundur tak membuat versi lebih tua', () => {
    expect(termsToSave(prev, { checkFee: 50000 }, '2026-01-01').version).toBe('2026-11-12');
  });
});

describe('termsOf', () => {
  it('membaca salinan dari entri riwayat yang membawanya', () => {
    const terms = { ...currentTerms(null), pickupDays: 30 };
    expect(termsOf([{ terms }, {}])).toEqual(terms);
  });

  it('tiket lama tanpa salinan, atau tanpa riwayat: null', () => {
    expect(termsOf([{}, {}])).toBeNull();
    expect(termsOf(undefined)).toBeNull();
    expect(termsOf([])).toBeNull();
  });
});

describe('termsClauses', () => {
  const text = (t: ServiceTerms) =>
    termsClauses(t)
      .map((c) => `${id(c.title)}: ${c.body.map((s) => termsSentenceText(s, id)).join(' ')}`)
      .join('\n')
      .replace(/\u00a0/g, ' ');

  it('enam pasal berurutan', () => {
    expect(termsClauses(currentTerms(null)).map((c) => id(c.title))).toEqual([
      'Penerimaan dan biaya',
      'Data',
      'Pembatalan',
      'Garansi',
      'Pengambilan',
      'Batas pengambilan',
    ]);
  });

  it('bawaan: 60 hari, tanpa kalimat biaya simpan maupun biaya pengecekan', () => {
    const t = text(currentTerms(null));
    expect(t).toContain('paling lambat 60 hari setelah kami kabari unit selesai.');
    expect(t).not.toMatch(/biaya simpan|biaya pengecekan/);
  });

  it('biaya diisi: kalimatnya muncul dengan rupiah terformat', () => {
    const t = text({ ...currentTerms(null), storageFee: 5000, checkFee: 50000, pickupDays: 30 });
    expect(t).toContain('paling lambat 30 hari');
    expect(t).toContain('biaya simpan Rp 5.000 per hari');
    expect(t).toContain('biaya pengecekan Rp 50.000');
  });

  it('garansi: dihitung sejak dikabari selesai, dan human error tidak ditanggung', () => {
    const t = text(currentTerms(null));
    expect(t).toContain('sejak kami kabari unit selesai, bukan sejak unit diambil');
    expect(t).toContain('kesalahan pemakaian (human error)');
  });

  // UU 8/1999 Pasal 18: klausula pengalihan tanggung jawab batal demi hukum.
  it('tak ada klausul pelepas tanggung jawab di teks bawaan, id maupun en', () => {
    const t = text({ ...currentTerms(null), storageFee: 5000, checkFee: 50000 });
    expect(t).not.toMatch(/bukan tanggung jawab|tidak bertanggung jawab|menjadi milik/i);
    const en = termsClauses(currentTerms(null))
      .flatMap((c) => c.body.map((s) => termsSentenceText(s, (k) => translate('en', k))))
      .join(' ');
    expect(en).not.toMatch(/not (our )?responsib|becomes? (the )?property/i);
  });

  it('tak ada placeholder yang tertinggal', () => {
    expect(text({ ...currentTerms(null), storageFee: 5000, checkFee: 50000 })).not.toMatch(/\{\w+\}/);
  });
});

describe('isValidPickupDays / isValidTermsFee', () => {
  it('batas pengambilan 1 sampai 365 hari, bilangan bulat', () => {
    expect([1, 60, 365].every(isValidPickupDays)).toBe(true);
    expect([0, 366, 1.5, Number.NaN].some(isValidPickupDays)).toBe(false);
  });

  it('biaya 0 sampai Rp 10.000.000: di atasnya ditolak, bukan diam-diam jadi 0', () => {
    expect([0, 5000, 10_000_000].every(isValidTermsFee)).toBe(true);
    expect([-1, 10_000_001, 0.5].some(isValidTermsFee)).toBe(false);
    expect(readTerms({ storageFee: 20_000_000 }).storageFee).toBe(0);
  });
});

describe('termsSentenceText', () => {
  it('"Rp" tak terpisah dari angkanya di ujung baris', () => {
    expect(termsSentenceText({ key: 'terms.limit.fee', fee: 5000 }, id)).toContain('Rp\u00a05.000');
  });
});
