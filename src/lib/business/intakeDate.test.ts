import { describe, expect, it } from 'vitest';
import { backdatedHistoryEntry, resolveIntakeAt } from './intakeDate';
import { localDateOf } from '@/lib/time';

// Konstruktor lokal: tes lulus di zona waktu mana pun, seperti kode yang diuji.
const NOW = new Date(2026, 10, 25, 14, 30, 5, 123);

describe('resolveIntakeAt', () => {
  it('kosong = tiket biasa, waktunya persis saat dicatat', () => {
    const r = resolveIntakeAt('', NOW);
    expect(r).toEqual({ ok: true, at: NOW.toISOString(), backdated: false });
  });

  it('hari ini = tiket biasa, bukan catatan mundur', () => {
    const r = resolveIntakeAt('2026-11-25', NOW);
    expect(r).toEqual({ ok: true, at: NOW.toISOString(), backdated: false });
  });

  it('tanggal lampau: tanggalnya dipakai, jam dan menit mengikuti saat dicatat', () => {
    const r = resolveIntakeAt('2026-11-12', NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backdated).toBe(true);
    expect(localDateOf(r.at)).toBe('2026-11-12');
    const d = new Date(r.at);
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([14, 30, 5]);
    expect(new Date(r.at).getTime()).toBeLessThan(NOW.getTime());
  });

  it('melewati batas bulan dan tahun', () => {
    const early = new Date(2027, 0, 1, 0, 0, 10);
    const r = resolveIntakeAt('2026-12-31', early);
    expect(r.ok && localDateOf(r.at)).toBe('2026-12-31');
  });

  it('tanggal depan ditolak', () => {
    expect(resolveIntakeAt('2026-11-26', NOW)).toEqual({ ok: false, issue: 'future' });
    expect(resolveIntakeAt('2027-01-01', NOW)).toEqual({ ok: false, issue: 'future' });
  });

  it.each(['abc', '25-11-2026', '2026-1-5', '2026-02-30', '2026-13-01', '0001-01-01'])(
    'format tak sah ditolak: %s',
    (bad) => {
      expect(resolveIntakeAt(bad, NOW)).toEqual({ ok: false, issue: 'format' });
    },
  );
});

describe('backdatedHistoryEntry', () => {
  const intakeAt = resolveIntakeAt('2026-11-12', NOW);
  const entry = backdatedHistoryEntry(
    intakeAt.ok ? intakeAt.at : '',
    NOW.toISOString(),
    { id: 'emp-1', name: 'Pemilik' },
  );

  it('internal dan memakai waktu sebenarnya, supaya urut sesudah "Unit diterima"', () => {
    expect(entry.status).toBe('edit');
    expect(entry.internal).toBe(true);
    expect(entry.at).toBe(NOW.toISOString());
    expect(intakeAt.ok && intakeAt.at < entry.at).toBe(true);
  });

  it('menyebut tanggal masuk dan tanggal dicatat', () => {
    expect(entry.note).toBe(
      'Tanggal masuk dicatat mundur oleh Pemilik: 12 Nov 2026 (dicatat 25 Nov 2026)',
    );
    expect(entry.by).toBe('emp-1');
    expect(entry.byName).toBe('Pemilik');
  });
});
