import { describe, it, expect } from 'vitest';
import {
  buildBackup,
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
