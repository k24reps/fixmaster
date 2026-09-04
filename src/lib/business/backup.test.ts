import { describe, it, expect } from 'vitest';
import {
  prunableBackups,
  buildBackup,
  buildRestorePayload,
  serializeBackup,
  parseBackup,
  countRecords,
  backupFilename,
  isBackupDue,
  BACKUP_APP,
  BACKUP_VERSION,
} from './backup';

describe('buildBackup + serialize', () => {
  it('captures collections, org, and metadata', () => {
    const now = new Date('2026-06-07T00:00:00.000Z');
    const b = buildBackup({ customers: [{ id: 'c1' }] }, { id: 'o1' }, 'o1', now);
    expect(b.app).toBe(BACKUP_APP);
    expect(b.version).toBe(BACKUP_VERSION);
    expect(b.exportedAt).toBe('2026-06-07T00:00:00.000Z');
    expect(b.orgId).toBe('o1');
    expect(b.collections.customers).toHaveLength(1);
    expect(b.organization).toEqual({ id: 'o1' });
    // round-trips through JSON
    expect(JSON.parse(serializeBackup(b))).toEqual(b);
  });
});

describe('parseBackup', () => {
  it('accepts a valid backup', () => {
    const b = buildBackup({ sales: [] }, null, 'o1');
    const res = parseBackup(serializeBackup(b));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.backup.collections.sales).toEqual([]);
  });

  it('rejects invalid JSON', () => {
    const res = parseBackup('{not json');
    expect(res.ok).toBe(false);
  });

  it('rejects a non-FixMaster file', () => {
    const res = parseBackup(JSON.stringify({ app: 'other', version: 1, collections: {} }));
    expect(res).toEqual({ ok: false, error: 'File ini bukan backup FixMaster.' });
  });

  it('rejects a newer incompatible version', () => {
    const res = parseBackup(
      JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION + 1, collections: {} }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('versi lebih baru');
  });

  it('rejects when collections are missing', () => {
    const res = parseBackup(JSON.stringify({ app: BACKUP_APP, version: 1 }));
    expect(res.ok).toBe(false);
  });
});

describe('countRecords', () => {
  it('sums across all collections', () => {
    const b = buildBackup({ a: [1, 2], b: [3], c: [] }, null, null);
    expect(countRecords(b)).toBe(3);
  });
});

describe('buildRestorePayload (cloud)', () => {
  it('maps collections to snake_case tables and converts field keys', () => {
    const b = buildBackup(
      {
        customers: [{ id: 'c1', orgId: 'o1', customerName: 'Andi' }],
        inventory: [{ id: 'i1', minStock: 2, sellPrice: 100 }],
        purchaseOrders: [{ id: 'p1', poNumber: 'PO-1' }],
      },
      { id: 'o1' },
      'o1',
    );
    const payload = buildRestorePayload(b);
    // collection name → table name
    expect(payload.inventory_items).toBeDefined();
    expect(payload.purchase_orders).toBeDefined();
    // field keys converted to snake_case
    expect(payload.customers[0]).toEqual({ id: 'c1', org_id: 'o1', customer_name: 'Andi' });
    expect(payload.inventory_items[0]).toEqual({ id: 'i1', min_stock: 2, sell_price: 100 });
  });

  it('NEVER includes memberships/employees or the org profile', () => {
    const b = buildBackup(
      { employees: [{ id: 'e1', name: 'Owner' }], customers: [{ id: 'c1' }] },
      { id: 'o1', planType: 'enterprise', isDemo: true },
      'o1',
    );
    const payload = buildRestorePayload(b);
    // employees → memberships excluded entirely
    expect(payload.memberships).toBeUndefined();
    expect(payload.employees).toBeUndefined();
    // no organization key anywhere
    expect(payload.organizations).toBeUndefined();
    expect(payload.organization).toBeUndefined();
    // domain data still present
    expect(payload.customers).toHaveLength(1);
  });

  it('skips empty or missing collections', () => {
    const b = buildBackup({ customers: [], sales: undefined as never }, null, 'o1');
    const payload = buildRestorePayload(b);
    expect(payload.customers).toBeUndefined();
    expect(payload.sales).toBeUndefined();
  });
});

describe('backupFilename', () => {
  it('includes the date', () => {
    expect(backupFilename(new Date('2026-06-07T10:00:00Z'))).toBe('fixmaster-backup-2026-06-07.json');
  });
});

describe('isBackupDue', () => {
  const now = new Date('2026-06-07T12:00:00Z');

  it('is never due when off', () => {
    expect(isBackupDue(null, 'off', now)).toBe(false);
    expect(isBackupDue('2020-01-01T00:00:00Z', 'off', now)).toBe(false);
  });

  it('is due when never backed up and a frequency is set', () => {
    expect(isBackupDue(null, 'daily', now)).toBe(true);
    expect(isBackupDue(null, 'weekly', now)).toBe(true);
  });

  it('is due once the interval has elapsed', () => {
    // 2 days ago vs daily → due; vs weekly → not due
    const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000).toISOString();
    expect(isBackupDue(twoDaysAgo, 'daily', now)).toBe(true);
    expect(isBackupDue(twoDaysAgo, 'weekly', now)).toBe(false);
  });

  it('is not due within the interval', () => {
    const hoursAgo = new Date(now.getTime() - 3 * 3_600_000).toISOString();
    expect(isBackupDue(hoursAgo, 'daily', now)).toBe(false);
  });

  it('treats an unparseable date as due', () => {
    expect(isBackupDue('not-a-date', 'weekly', now)).toBe(true);
  });
});
describe('prunableBackups (retensi auto-backup)', () => {
  // Nama objek memuat ISO timestamp, jadi urutan leksikografis = urutan waktu.
  // Seluruh strategi retensi bergantung pada sifat itu.
  const name = (iso: string) => `auto-${iso.replace(/[:.]/g, '-')}.json`;
  const days = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      name(new Date(Date.UTC(2026, 8, i + 1, 18)).toISOString()),
    );

  it('tidak membuang apa pun selama belum melewati kuota', () => {
    expect(prunableBackups(days(7), 7)).toEqual([]);
    expect(prunableBackups(days(3), 7)).toEqual([]);
    expect(prunableBackups([], 7)).toEqual([]);
  });

  it('membuang yang TERLAMA, bukan yang terbaru', () => {
    const all = days(9);
    const stale = prunableBackups(all, 7);
    expect(stale).toHaveLength(2);
    // 1 dan 2 September adalah dua yang tertua.
    expect(stale).toContain(all[0]);
    expect(stale).toContain(all[1]);
    expect(stale).not.toContain(all[8]);
  });

  it('tidak peduli urutan masukan — Storage tidak menjamin urutan list', () => {
    const all = days(9);
    const shuffled = [all[4], all[8], all[0], all[6], all[1], all[7], all[2], all[5], all[3]];
    expect(prunableBackups(shuffled, 7).sort()).toEqual([all[0], all[1]].sort());
  });

  it('tidak mengubah array asli', () => {
    const all = days(9);
    const copy = [...all];
    prunableBackups(all, 7);
    expect(all).toEqual(copy);
  });

  // keep = 0 berarti hapus semua. Bukan konfigurasi yang dipakai, tapi kalau
  // suatu saat RETENTION salah diset nol, ia harus berperilaku terduga.
  it('keep 0 memangkas semuanya', () => {
    expect(prunableBackups(days(3), 0)).toHaveLength(3);
  });
});
