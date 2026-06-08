import { describe, it, expect } from 'vitest';
import { actionMeta, roleLabel, filterActivity, summarize } from './activity';
import type { ActivityLog } from '@/data/types';

function mk(over: Partial<ActivityLog>): ActivityLog {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    orgId: 'o1',
    outletId: null,
    actorId: 'm1',
    actorName: 'Budi',
    actorRole: 'karyawan',
    action: 'sale.create',
    entityType: 'sale',
    entityId: 's1',
    entityLabel: 'INV-0001',
    meta: {},
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}

describe('actionMeta', () => {
  it('maps known verbs to a label/icon/tone', () => {
    expect(actionMeta('sale.void').tone).toBe('danger');
    expect(actionMeta('sale.create').label).toBe('Penjualan baru');
  });
  it('falls back gracefully for unknown verbs', () => {
    expect(actionMeta('something.weird').label).toBe('Aktivitas');
  });
});

describe('roleLabel', () => {
  it('translates roles and handles null', () => {
    expect(roleLabel('owner')).toBe('Pemilik');
    expect(roleLabel('karyawan')).toBe('Karyawan');
    expect(roleLabel(null)).toBe('');
  });
});

describe('filterActivity', () => {
  const logs = [
    mk({ id: 'a', createdAt: '2026-06-01T10:00:00.000Z', actorRole: 'karyawan', action: 'sale.create', actorName: 'Budi' }),
    mk({ id: 'b', createdAt: '2026-06-02T10:00:00.000Z', actorRole: 'admin', action: 'income.delete', actorName: 'Sari', entityLabel: 'Penjualan INV-9' }),
    mk({ id: 'c', createdAt: '2026-06-03T10:00:00.000Z', actorRole: 'owner', action: 'sale.void', actorName: 'Owner', entityLabel: 'INV-0007' }),
    mk({ id: 'd', deletedAt: '2026-06-04T10:00:00.000Z' }),
  ];

  it('sorts newest-first and excludes soft-deleted', () => {
    const out = filterActivity(logs);
    expect(out.map((l) => l.id)).toEqual(['c', 'b', 'a']);
  });
  it('filters by role', () => {
    expect(filterActivity(logs, { role: 'admin' }).map((l) => l.id)).toEqual(['b']);
  });
  it('filters by action', () => {
    expect(filterActivity(logs, { action: 'sale.void' }).map((l) => l.id)).toEqual(['c']);
  });
  it('filters by query on name or entity label', () => {
    expect(filterActivity(logs, { query: 'budi' }).map((l) => l.id)).toEqual(['a']);
    expect(filterActivity(logs, { query: 'inv-0007' }).map((l) => l.id)).toEqual(['c']);
  });
  it('treats all as no filter', () => {
    expect(filterActivity(logs, { role: 'all', action: 'all' }).length).toBe(3);
  });
});

describe('summarize', () => {
  it('joins label and entity label', () => {
    expect(summarize(mk({ action: 'sale.void', entityLabel: 'INV-0007' }))).toBe('Batalkan penjualan · INV-0007');
  });
  it('omits separator when no entity label', () => {
    expect(summarize(mk({ action: 'auth.login', entityLabel: '' }))).toBe('Masuk');
  });
});
