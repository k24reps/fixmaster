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
  const svc = (over: Partial<Service>): Service => ({
    id: 's1', orgId: 'o1', outletId: null, serviceNo: 'FM-1', customerId: 'c1',
    customerName: 'Andi', customerPhone: '08', category: 'Laptop', device: 'X',
    complaint: '', accessories: '', status: 'selesai', technicianId: null, technicianName: '',
    estimateCost: over.estimateCost ?? 0, finalCost: over.finalCost ?? 0, downPayment: over.downPayment ?? 0,
    spareparts: [], warrantyServiceUntil: null, warrantyPartsUntil: null, pickedUp: false, pickedUpAt: null, warrantyClaimOf: null, history: [], archived: false,
    createdAt: '', updatedAt: '', deletedAt: null,
  });
  it('includes core fields', () => {
    const lines = serviceReceiptLines(svc({}));
    const labels = lines.map((l) => l.label);
    expect(labels).toContain('No. Servis');
    expect(labels).toContain('Perangkat');
  });
  it('adds DP + remaining when DP present', () => {
    const lines = serviceReceiptLines(svc({ finalCost: 500000, downPayment: 200000 }));
    const remaining = lines.find((l) => l.label === 'Sisa');
    expect(remaining?.value).toContain('300.000');
  });
});

describe('serviceVars', () => {
  const svc = (over: Partial<Service>): Service => ({
    id: 's1', orgId: 'o1', outletId: null, serviceNo: 'FM-1', customerId: 'c1',
    customerName: 'Andi', customerPhone: '08', category: 'Laptop', device: 'X',
    complaint: '', accessories: '', status: 'selesai', technicianId: null, technicianName: '',
    estimateCost: over.estimateCost ?? 0, finalCost: over.finalCost ?? 0, downPayment: over.downPayment ?? 0,
    spareparts: [], warrantyServiceUntil: null, warrantyPartsUntil: null, pickedUp: false, pickedUpAt: null, warrantyClaimOf: null, history: [], archived: false,
    createdAt: '', updatedAt: '', deletedAt: null,
  });
  const org = { name: 'Toko Servis' } as Organization;

  it('{biaya} maps to finalCost, {estimasi} to estimateCost (not swapped)', () => {
    const vars = serviceVars(svc({ finalCost: 500000, estimateCost: 300000 }), org);
    expect(vars.biaya).toContain('500.000');
    expect(vars.estimasi).toContain('300.000');
  });
});
