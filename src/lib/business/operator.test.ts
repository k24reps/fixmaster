import { describe, expect, it } from 'vitest';
import {
  accessRemainingLabel,
  expectedManualPayment,
  matchesOrganization,
  operatorMonthlyAmount,
  operatorPlanLabel,
  organizationNumber,
  projectedManualExpiry,
} from './operator';

const organization = {
  orgId: '6bd2e18f-36b0-4d3e-a347-498590abc012',
  name: 'Nuara Service',
};

describe('operator organization helpers', () => {
  it('membuat nomor organisasi stabil dari UUID', () => {
    expect(organizationNumber(organization.orgId)).toBe('ORG-6BD2E18F');
  });

  it('mencari lewat nama, nomor pendek, atau UUID penuh', () => {
    expect(matchesOrganization(organization, 'nuara')).toBe(true);
    expect(matchesOrganization(organization, 'org-6bd2')).toBe(true);
    expect(matchesOrganization(organization, '498590abc012')).toBe(true);
    expect(matchesOrganization(organization, 'konter lain')).toBe(false);
  });

  it('query kosong mempertahankan seluruh daftar', () => {
    expect(matchesOrganization(organization, '   ')).toBe(true);
  });

  it('menggunakan label paket yang dibaca klien', () => {
    expect(operatorPlanLabel('standard')).toBe('Solo');
    expect(operatorPlanLabel('enterprise')).toBe('Pro');
    expect(operatorPlanLabel('suspended')).toBe('Ditangguhkan');
  });

  it('menghitung total Solo dan Pro berskala outlet secara tepat', () => {
    expect(operatorMonthlyAmount('standard', 1)).toBe(99_000);
    expect(operatorMonthlyAmount('enterprise', 3)).toBe(249_000);
    expect(operatorMonthlyAmount('enterprise', 20)).toBe(349_000);
    expect(expectedManualPayment('enterprise', 3, 2)).toBe(498_000);
  });

  it('memproyeksikan expiry bulan kalender dengan clamp akhir bulan', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(projectedManualExpiry('2026-01-31T14:32:00.000Z', 1, now)).toBe(
      '2026-02-28T14:32:00.000Z',
    );
    expect(projectedManualExpiry(null, 2, now)).toBe('2026-03-01T00:00:00.000Z');
  });

  it('menjelaskan akses kedaluwarsa tanpa angka hari negatif', () => {
    expect(accessRemainingLabel(-5)).toBe('Kedaluwarsa 5 hari');
    expect(accessRemainingLabel(0)).toBe('Berakhir hari ini');
    expect(accessRemainingLabel(7)).toBe('7 hari lagi');
  });
});
