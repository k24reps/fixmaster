import { describe, it, expect } from 'vitest';
import {
  toWaNumber,
  waLink,
  interpolate,
  trackingUrl,
  serviceReceiptLines,
  serviceVars,
  DEFAULT_WA_TEMPLATES,
  WA_TEMPLATE_VARS,
} from './notify';
import type { Service, Organization } from '@/data/types';

/** Minimal Service builder — hanya field yang diuji yang perlu di-override. */
const svc = (over: Partial<Service>): Service => ({
  id: 's1', orgId: 'o1', outletId: null, serviceNo: 'FM-1', customerId: 'c1',
  customerName: 'Andi', customerPhone: '08', category: 'Laptop', device: 'X',
  complaint: '', accessories: '', status: 'selesai', technicianId: null, technicianName: '',
  estimateCost: 0, finalCost: 0, downPayment: 0,
  spareparts: [], warrantyServiceUntil: null, warrantyPartsUntil: null, pickedUp: false,
  pickedUpAt: null, warrantyClaimOf: null, history: [], archived: false,
  createdAt: '', updatedAt: '', deletedAt: null,
  ...over,
});

describe('toWaNumber', () => {
  it('converts leading 0 to 62', () => {
    expect(toWaNumber('081234567890')).toBe('6281234567890');
  });
  it('keeps existing 62 prefix', () => {
    expect(toWaNumber('6281234567890')).toBe('6281234567890');
  });
  it('strips formatting', () => {
    expect(toWaNumber('+62 812-3456-7890')).toBe('6281234567890');
  });
  it('prefixes 62 when no recognizable prefix', () => {
    expect(toWaNumber('81234')).toBe('6281234');
  });
});

describe('waLink', () => {
  it('builds an encoded wa.me link', () => {
    const link = waLink('08123', 'Halo dunia');
    expect(link).toBe('https://wa.me/628123?text=Halo%20dunia');
  });
});

describe('interpolate', () => {
  it('replaces known placeholders', () => {
    expect(interpolate('Halo {nama}, no {no}', { nama: 'Andi', no: 'FM-1' })).toBe('Halo Andi, no FM-1');
  });
  it('leaves unknown placeholders intact', () => {
    expect(interpolate('Hi {x}', { y: '1' })).toBe('Hi {x}');
  });
});

describe('trackingUrl', () => {
  it('builds an encoded tracking URL', () => {
    const url = trackingUrl('https://app.test', 'org 1', 'FM-1');
    expect(url).toBe('https://app.test/track?org=org%201&no=FM-1');
  });
});

describe('DEFAULT_WA_TEMPLATES', () => {
  // Placeholder salah ketik = pesan ke pelanggan bocor "{no_service}" mentah.
  it('only uses known placeholders', () => {
    for (const [key, tpl] of Object.entries(DEFAULT_WA_TEMPLATES)) {
      const used = [...tpl.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const unknown = used.filter((v) => !(WA_TEMPLATE_VARS as readonly string[]).includes(v));
      expect(unknown, `template "${key}"`).toEqual([]);
    }
  });
});

describe('serviceReceiptLines', () => {
  it('includes core fields', () => {
    const lines = serviceReceiptLines(svc({}));
    const labels = lines.map((l) => l.label);
    expect(labels).toContain('No. Servis');
    expect(labels).toContain('Perangkat');
  });
  // Regresi: nota pernah mencetak timestamp ISO mentah ke tangan pelanggan.
  it('memformat tanggal masuk, bukan mencetak timestamp mentah', () => {
    const lines = serviceReceiptLines(svc({ createdAt: '2026-09-02T09:12:00.000Z' }));
    const tanggal = lines.find((l) => l.label === 'Tanggal');
    expect(tanggal?.value).not.toMatch(/Tdd:/);
    expect(tanggal?.value).toMatch(/Sep 2026$/);
  });

  it('adds DP + remaining when DP present', () => {
    const lines = serviceReceiptLines(svc({ finalCost: 500000, downPayment: 200000 }));
    const remaining = lines.find((l) => l.label === 'Sisa');
    expect(remaining?.value).toContain('300.000');
  });
});

describe('serviceVars', () => {
  const org = { name: 'Toko Servis' } as Organization;

  it('{biaya} maps to finalCost, {estimasi} to estimateCost (not swapped)', () => {
    const vars = serviceVars(svc({ finalCost: 500000, estimateCost: 300000 }), org);
    expect(vars.biaya).toContain('500.000');
    expect(vars.estimasi).toContain('300.000');
  });
});
describe('serviceVars — baris opsional', () => {
  const org = { name: 'Toko Servis', address: 'Jl. Merdeka 12' } as Organization;

  it('tanpa DP hanya menulis satu baris total', () => {
    const v = serviceVars(svc({ finalCost: 1500000 }), org);
    expect(v.rincian_bayar).toBe('Total biaya: *Rp 1.500.000*');
  });

  // Cacat aslinya: pesan "selesai" menyebut TOTAL, jadi pelanggan yang sudah
  // bayar DP datang membawa uang yang salah.
  it('dengan DP menebalkan sisa, bukan total', () => {
    const v = serviceVars(svc({ finalCost: 1500000, downPayment: 500000 }), org);
    expect(v.rincian_bayar).toContain('Sudah dibayar (DP): Rp 500.000');
    expect(v.rincian_bayar).toContain('*Sisa dibayar saat pengambilan: Rp 1.000.000*');
  });

  // Tiket belum ditutup: biaya akhir masih 0, tapi DP sudah masuk.
  it('tanpa biaya akhir hanya menyebut DP yang sudah masuk', () => {
    const v = serviceVars(svc({ finalCost: 0, downPayment: 200000 }), org);
    expect(v.rincian_bayar).toBe('Sudah dibayar (DP): *Rp 200.000*');
  });

  it('sisa tidak pernah negatif walau DP melebihi total', () => {
    const v = serviceVars(svc({ finalCost: 100000, downPayment: 300000 }), org);
    expect(v.rincian_bayar).toContain('Rp 0');
    expect(v.rincian_bayar).not.toContain('-');
  });

  it('baris opsional kosong total ketika datanya tidak ada', () => {
    // Belum Selesai: garansi belum ditetapkan, jadi bloknya kosong total.
    const v = serviceVars(svc({ status: 'pengerjaan' }), { name: 'Toko Servis' } as Organization);
    expect(v.keluhan).toBe('');
    expect(v.kelengkapan).toBe('');
    expect(v.alamat).toBe('');
    expect(v.garansi).toBe('');
  });

  it('baris opsional membawa newline sendiri ketika terisi', () => {
    const v = serviceVars(svc({ complaint: 'Layar mati', accessories: 'Charger' }), org);
    expect(v.keluhan).toBe('\nKeluhan: Layar mati');
    expect(v.kelengkapan).toBe('\nKelengkapan: Charger');
    expect(v.alamat).toBe('\nAlamat: Jl. Merdeka 12');
  });

  it('garansi memformat kedua tanggal, termasuk saat cloud mengirim timestamp', () => {
    const v = serviceVars(
      svc({ warrantyServiceUntil: '2026-10-02', warrantyPartsUntil: '2026-12-02T00:00:00Z' }),
      org,
    );
    expect(v.garansi).toContain('Garansi jasa s/d *2 Okt 2026*');
    expect(v.garansi).toContain('Garansi sparepart s/d *2 Des 2026*');
  });

  it('garansi per sparepart, dan 0 hari tertulis "tanpa garansi" di pesan & nota', () => {
    const s = svc({
      warrantyServiceUntil: null,
      warrantyPartsUntil: '2026-12-02',
      spareparts: [
        { itemId: 'i1', name: 'Baterai', qty: 1, costPrice: 1, sellPrice: 2, deducted: true, warrantyDays: 90, warrantyUntil: '2026-12-02' },
        { itemId: null, name: 'Lem', qty: 1, costPrice: 1, sellPrice: 0, deducted: false, kind: 'manual', warrantyDays: 0, warrantyUntil: null },
      ],
    });
    const v = serviceVars(s, org);
    expect(v.garansi).toContain('Garansi jasa: tanpa garansi');
    expect(v.garansi).toContain('Garansi Baterai s/d *2 Des 2026*');
    expect(v.garansi).toContain('Garansi Lem: tanpa garansi');
    expect(v.garansi).not.toContain('Garansi sparepart');

    const garansi = serviceReceiptLines(s).filter((l) => l.group === 'garansi');
    expect(garansi.map((l) => [l.label, l.value])).toEqual([
      ['Jasa', 'Tanpa garansi'],
      ['Baterai', 's/d 2 Des 2026'],
      ['Lem', 'Tanpa garansi'],
    ]);
  });

  // Rendering nyata: tidak boleh ada baris kosong beruntun dari variabel
  // yang menghilang, dan tidak boleh ada placeholder tersisa.
  it('template selesai merender rapi tanpa data opsional', () => {
    const v = { ...serviceVars(svc({ finalCost: 90000 }), { name: 'Toko' } as Organization), tautan: 'x' };
    const out = interpolate(DEFAULT_WA_TEMPLATES.selesai, v);
    expect(out).not.toMatch(/\{\w+\}/);
    expect(out).not.toMatch(/\n\n\n/);
  });
});
