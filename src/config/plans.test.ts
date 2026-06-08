import { describe, it, expect } from 'vitest';
import { roleAllows, isManager, isOwner, planAllows, withinOutletQuota, outletTierFor } from './plans';

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
  it('free excludes finance; enterprise includes it', () => {
    expect(planAllows('free', 'finance')).toBe(false);
    expect(planAllows('enterprise', 'finance')).toBe(true);
  });
});

describe('outlet quota helpers', () => {
  it('standard fits 1 outlet, not 2', () => {
    expect(withinOutletQuota('standard', 1)).toBe(true);
    expect(withinOutletQuota('standard', 2)).toBe(false);
  });
  it('suggests cheapest tier that fits', () => {
    expect(outletTierFor(1)).toBe('standard');
    expect(outletTierFor(5)).toBe('enterprise');
    expect(outletTierFor(999)).toBeNull();
  });
});
