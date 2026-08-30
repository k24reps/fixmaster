import { describe, expect, it } from 'vitest';
import { matchesOrganization, organizationNumber } from './operator';

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
});
