import { describe, expect, it } from 'vitest';
import {
  daysUntilBlocked,
  matchesOrganization,
  operatorPlanLabel,
  organizationNumber,
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

  it('mencari lewat nomor telepon toko, apa pun penulisannya', () => {
    const withPhone = { ...organization, phone: '+62 821-1821-8747' };
    expect(matchesOrganization(withPhone, '082118218747')).toBe(true);
    expect(matchesOrganization(withPhone, '0821 1821')).toBe(true);
    expect(matchesOrganization(withPhone, '8747')).toBe(true);
    expect(matchesOrganization(withPhone, '999')).toBe(false); // < 4 digit
    expect(matchesOrganization(withPhone, '5555')).toBe(false);
    expect(matchesOrganization(organization, '0821')).toBe(false); // tanpa nomor
  });

  it('query kosong mempertahankan seluruh daftar', () => {
    expect(matchesOrganization(organization, '   ')).toBe(true);
  });

  it('hanya membedakan toko aktif dan yang ditangguhkan', () => {
    expect(operatorPlanLabel('standard')).toBe('Aktif');
    expect(operatorPlanLabel('trial')).toBe('Aktif');
    expect(operatorPlanLabel('suspended')).toBe('Ditangguhkan');
  });

  it('memperkirakan hari sampai tiket baru tertahan dari laju 30 hari', () => {
    // 60 unit sebulan = 2 unit/hari; saldo 10 dengan batas -20 = 30 unit ruang.
    expect(daysUntilBlocked(10, 60, -20)).toBe(15);
    expect(daysUntilBlocked(-20, 60, -20)).toBe(0);
    expect(daysUntilBlocked(40, 0, -20)).toBeNull();
  });
});
