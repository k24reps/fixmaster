import { describe, it, expect } from 'vitest';
import { normalizePhone, findByPhone, checkDuplicate, planCsvImport } from './customers';
import type { Customer } from '@/data/types';

const mk = (over: Partial<Customer>): Customer => ({
  id: over.id ?? 'c1',
  orgId: 'o1',
  outletId: null,
  name: over.name ?? 'Andi',
  phone: over.phone ?? '08123456789',
  email: '',
  address: '',
  note: '',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

describe('normalizePhone', () => {
  it('strips non-digits', () => {
    expect(normalizePhone('0812-3456-789')).toBe('08123456789');
  });
  it('unifies 62 prefix to 0', () => {
    expect(normalizePhone('+62 812 3456 789')).toBe('08123456789');
    expect(normalizePhone('62812')).toBe('0812');
  });
});

describe('findByPhone', () => {
  const list = [mk({ id: 'c1', phone: '08123456789' })];
  it('matches across formatting differences', () => {
    expect(findByPhone(list, '+62 812-3456-789')?.id).toBe('c1');
  });
  it('excludes a given id', () => {
    expect(findByPhone(list, '08123456789', 'c1')).toBeNull();
  });
});

describe('checkDuplicate', () => {
  const list = [mk({ id: 'c1', name: 'Andi', phone: '08123456789' })];
  it('blocks same phone with different name', () => {
    const r = checkDuplicate(list, { name: 'Budi', phone: '08123456789' });
    expect(r.ok).toBe(false);
  });
  it('allows same phone with same name', () => {
    const r = checkDuplicate(list, { name: 'Andi', phone: '08123456789' });
    expect(r.ok).toBe(true);
  });
  it('allows a brand new phone', () => {
    const r = checkDuplicate(list, { name: 'Citra', phone: '08999999999' });
    expect(r.ok).toBe(true);
  });
});

describe('planCsvImport', () => {
  const existing = [mk({ id: 'c1', name: 'Andi', phone: '08123456789' })];
  it('classifies add / update / skip correctly', () => {
    const result = planCsvImport(existing, [
      { name: 'Budi', phone: '08555' }, // new → add
      { name: 'Andi Baru', phone: '08123456789' }, // exists, diff name → update
      { name: 'Andi', phone: '+628123456789' }, // exists, same name → skip
      { name: '', phone: '08777' }, // invalid → skip
    ]);
    expect(result.toAdd).toHaveLength(1);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.skipped).toBe(2);
  });
  it('dedups repeated phones within the same import', () => {
    const result = planCsvImport([], [
      { name: 'X', phone: '0811' },
      { name: 'Y', phone: '0811' },
    ]);
    expect(result.toAdd).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });
});
