import { describe, it, expect } from 'vitest';
import { nextStepFor, normalizeTrackCode, relativeSince } from './tracking';

describe('nextStepFor', () => {
  // Cacat aslinya: halaman menyuruh datang ke toko untuk unit yang sudah
  // dibawa pulang, karena `pickedUp` diambil dari server lalu diabaikan.
  it('unit yang sudah diambil tidak lagi disuruh datang ke toko', () => {
    const step = nextStepFor('selesai', true);
    expect(step.tone).toBe('done');
    expect(step.text).not.toMatch(/diambil di toko/);
  });

  it('selesai dan lunas sama-sama mengajak mengambil unit', () => {
    for (const s of ['selesai', 'lunas']) {
      const step = nextStepFor(s, false);
      expect(step.tone).toBe('action');
      expect(step.text).toMatch(/siap diambil/);
    }
  });

  it('konfirmasi dan batal menuntut pelanggan bergerak', () => {
    expect(nextStepFor('konfirmasi', false).tone).toBe('action');
    expect(nextStepFor('batal', false).tone).toBe('action');
  });

  it('status dalam proses justru menenangkan', () => {
    for (const s of ['diterima', 'diagnosa', 'pengerjaan', 'tunggu']) {
      const step = nextStepFor(s, false);
      expect(step.tone).toBe('wait');
      expect(step.text).toMatch(/tidak ada yang perlu Anda lakukan/i);
    }
  });

  it('status tak dikenal tidak pernah kosong', () => {
    expect(nextStepFor('entah-apa', false).text.length).toBeGreaterThan(10);
  });
});

describe('relativeSince', () => {
  const now = Date.parse('2026-09-02T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('membaca rentang menit, jam, dan hari', () => {
    expect(relativeSince(ago(30_000), now)).toBe('baru saja');
    expect(relativeSince(ago(5 * 60_000), now)).toBe('5 menit lalu');
    expect(relativeSince(ago(3 * 3_600_000), now)).toBe('3 jam lalu');
    expect(relativeSince(ago(26 * 3_600_000), now)).toBe('kemarin');
    expect(relativeSince(ago(3 * 86_400_000), now)).toBe('3 hari lalu');
  });

  // Di atas 7 hari, tanggal absolut di timeline sudah lebih informatif.
  it('menyerah di atas seminggu dan pada tanggal rusak', () => {
    expect(relativeSince(ago(9 * 86_400_000), now)).toBeNull();
    expect(relativeSince('bukan-tanggal', now)).toBeNull();
  });

  // Jam HP pelanggan sering lebih lambat dari server.
  it('waktu di masa depan tetap dibaca sebagai baru', () => {
    expect(relativeSince(new Date(now + 60_000).toISOString(), now)).toBe('baru saja');
  });
});

describe('normalizeTrackCode', () => {
  it('menerima kode baku apa adanya', () => {
    expect(normalizeTrackCode('7K3M9QXR2D')).toBe('7K3M9QXR2D');
  });

  // Pelanggan mengetik dari kertas: huruf kecil, spasi, dan tanda hubung
  // tetap menemukan tiketnya.
  it('huruf kecil, spasi, dan tanda hubung dirapikan', () => {
    expect(normalizeTrackCode(' 7k3m9-qxr2d ')).toBe('7K3M9QXR2D');
    expect(normalizeTrackCode('7K3M 9QXR 2D')).toBe('7K3M9QXR2D');
  });

  // Di kertas termal yang pudar O/0 dan I/L/1 tertukar; alfabetnya tak memakai
  // I, L, O, jadi ketiganya dibaca sebagai angka.
  it('O dibaca 0, I dan L dibaca 1', () => {
    expect(normalizeTrackCode('OK3M9QXR2D')).toBe('0K3M9QXR2D');
    expect(normalizeTrackCode('IK3M9QXRLD')).toBe('1K3M9QXR1D');
  });

  it('panjang atau huruf yang salah bukan kode', () => {
    expect(normalizeTrackCode('')).toBeNull();
    expect(normalizeTrackCode('7K3M9QXR2')).toBeNull();
    expect(normalizeTrackCode('7K3M9QXR2DA')).toBeNull();
    // U tidak ada di Crockford base32.
    expect(normalizeTrackCode('7K3M9QXR2U')).toBeNull();
    expect(normalizeTrackCode('FM-0001')).toBeNull();
    expect(normalizeTrackCode('7K3M9QXR2/')).toBeNull();
  });
});
