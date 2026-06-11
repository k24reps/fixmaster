import { describe, it, expect } from 'vitest';
import { roleAllows, isManager, isOwner, planAllows, withinOutletQuota, outletTierFor, priceForOutlets, PLANS } from './plans';

describe('roleAllows', () => {
  it('owner can do everything', () => {
    expect(roleAllows('owner', '*')).toBe(true);
    expect(roleAllows('owner', 'finance.view')).toBe(true);
    expect(roleAllows('owner', 'reports.view')).toBe(true);
    expect(roleAllows('owner', 'anything.at.all')).toBe(true);
  });

  it('admin has operational + financial read, but NOT reports (owner-only) nor the owner wildcard', () => {
    expect(roleAllows('admin', 'finance.view')).toBe(true);
    expect(roleAllows('admin', 'reports.view')).toBe(false);
    expect(roleAllows('admin', 'services.write')).toBe(true);
    expect(roleAllows('admin', '*')).toBe(false);
  });

  it('karyawan cannot view finance/reports', () => {
    expect(roleAllows('karyawan', 'finance.view')).toBe(false);
    expect(roleAllows('karyawan', 'reports.view')).toBe(false);
  });

  it('karyawan keeps scoped operational writes', () => {
    expect(roleAllows('karyawan', 'services.write')).toBe(true);
    expect(roleAllows('karyawan', 'pos.sell')).toBe(true);
    expect(roleAllows('karyawan', 'attendance.self')).toBe(true);
    // but not org-wide attendance write
    expect(roleAllows('karyawan', 'attendance.write')).toBe(false);
  });
});

describe('isManager', () => {
  it('is true for owner and admin only', () => {
    expect(isManager('owner')).toBe(true);
    expect(isManager('admin')).toBe(true);
    expect(isManager('karyawan')).toBe(false);
  });
});

describe('isOwner', () => {
  it('is true for owner only', () => {
    expect(isOwner('owner')).toBe(true);
    expect(isOwner('admin')).toBe(false);
    expect(isOwner('karyawan')).toBe(false);
  });
});

describe('planAllows', () => {
  it('Solo (standard) is core-ops only: no suppliers/attendance/tasks/multi-outlet/logo/waTemplates/export', () => {
    for (const f of ['suppliers', 'attendance', 'tasks', 'multiOutlet', 'logo', 'waTemplates', 'exportImport'] as const) {
      expect(planAllows('standard', f)).toBe(false);
    }
    // ...but it keeps the core operating loop.
    for (const f of ['services', 'customers', 'pos', 'inventory', 'finance', 'reports'] as const) {
      expect(planAllows('standard', f)).toBe(true);
    }
  });
  it('Pro (enterprise) unlocks everything Solo lacks', () => {
    for (const f of ['suppliers', 'attendance', 'tasks', 'multiOutlet', 'logo', 'waTemplates', 'exportImport'] as const) {
      expect(planAllows('enterprise', f)).toBe(true);
    }
  });
});

describe('plan user quota', () => {
  it('Solo is single-user; Pro is unlimited', () => {
    expect(PLANS.standard.maxUsers).toBe(1);
    expect(PLANS.enterprise.maxUsers).toBe(-1);
  });
});

describe('outlet quota helpers', () => {
  it('Solo fits 1 outlet, not 2; Pro is unlimited', () => {
    expect(withinOutletQuota('standard', 1)).toBe(true);
    expect(withinOutletQuota('standard', 2)).toBe(false);
    expect(withinOutletQuota('enterprise', 50)).toBe(true);
  });
  it('suggests cheapest tier that fits; Pro now covers any count', () => {
    expect(outletTierFor(1)).toBe('standard');
    expect(outletTierFor(5)).toBe('enterprise');
    expect(outletTierFor(999)).toBe('enterprise');
  });
});

describe('priceForOutlets (Pro per-outlet add-on)', () => {
  it('includes 2 outlets in the base price', () => {
    expect(priceForOutlets(1)).toBe(149000);
    expect(priceForOutlets(2)).toBe(149000);
  });
  it('adds Rp50rb per extra outlet', () => {
    expect(priceForOutlets(3)).toBe(199000);
    expect(priceForOutlets(4)).toBe(249000);
  });
  it('caps at the Rp299rb ceiling', () => {
    expect(priceForOutlets(5)).toBe(299000);
    expect(priceForOutlets(100)).toBe(299000);
  });
});
