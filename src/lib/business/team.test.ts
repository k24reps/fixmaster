import { describe, it, expect } from 'vitest';
import {
  isValidInviteEmail,
  activeOwnerCount,
  canDeactivate,
  canChangeRole,
} from './team';

const owner = { id: 'o1', role: 'owner' as const, active: true };
const owner2 = { id: 'o2', role: 'owner' as const, active: true };
const admin = { id: 'a1', role: 'admin' as const, active: true };
const staff = { id: 's1', role: 'karyawan' as const, active: true };

describe('isValidInviteEmail', () => {
  it('accepts a normal email', () => {
    expect(isValidInviteEmail('budi@toko.com')).toBe(true);
    expect(isValidInviteEmail('  budi@toko.com  ')).toBe(true);
  });
  it('rejects malformed emails', () => {
    expect(isValidInviteEmail('budi')).toBe(false);
    expect(isValidInviteEmail('budi@toko')).toBe(false);
    expect(isValidInviteEmail('budi @toko.com')).toBe(false);
    expect(isValidInviteEmail('')).toBe(false);
  });
});

describe('activeOwnerCount', () => {
  it('counts only active owners', () => {
    expect(activeOwnerCount([owner, owner2, admin, staff])).toBe(2);
    expect(activeOwnerCount([owner, { ...owner2, active: false }])).toBe(1);
  });
});

describe('canDeactivate', () => {
  it('refuses the last active owner', () => {
    expect(canDeactivate(owner, [owner, admin, staff])).toBe(false);
  });
  it('allows an owner when another active owner exists', () => {
    expect(canDeactivate(owner, [owner, owner2])).toBe(true);
  });
  it('allows non-owners', () => {
    expect(canDeactivate(admin, [owner, admin, staff])).toBe(true);
    expect(canDeactivate(staff, [owner, staff])).toBe(true);
  });
  it('refuses an already-inactive member', () => {
    expect(canDeactivate({ ...staff, active: false }, [owner, staff])).toBe(false);
  });
});

describe('canChangeRole', () => {
  it('refuses demoting the last owner', () => {
    expect(canChangeRole(owner, 'admin', [owner, admin])).toBe(false);
  });
  it('allows demoting an owner when another owner exists', () => {
    expect(canChangeRole(owner, 'admin', [owner, owner2])).toBe(true);
  });
  it('allows promoting a staff to admin', () => {
    expect(canChangeRole(staff, 'admin', [owner, staff])).toBe(true);
  });
  it('refuses a no-op role change', () => {
    expect(canChangeRole(admin, 'admin', [owner, admin])).toBe(false);
  });
});
