import { fmtDate, localDateOf, localDateStr, parseISODate } from '@/lib/time';
import type { ServiceHistoryEntry } from '@/data/types';

/**
 * Tanggal masuk tiket yang dicatat mundur oleh Pemilik (tiket baru saja, bukan
 * tahap berikutnya: Selesai, Lunas, DP, dan pembayaran tetap memakai waktu
 * sebenarnya, supaya Buku Kas dan Laporan tidak ikut bergeser).
 *
 * Hanya TANGGAL yang dipilih. Jam dan menit mengikuti saat dicatat, sehingga
 * entri "Unit diterima" tetap bertanggal sama dengan `createdAt` dan urutan
 * riwayat masuk akal: entri catatan mundur (waktu sebenarnya) selalu sesudahnya.
 */
export type IntakeDateIssue = 'format' | 'future';

export type IntakeAt =
  | { ok: true; at: string; backdated: boolean }
  | { ok: false; issue: IntakeDateIssue };

export function resolveIntakeAt(date: string, now: Date = new Date()): IntakeAt {
  const today = localDateStr(now);
  // Kosong atau hari ini = tiket biasa, waktunya persis saat dicatat.
  if (!date || date === today) return { ok: true, at: now.toISOString(), backdated: false };

  const picked = parseISODate(date);
  // parseISODate menormalkan tanggal mustahil (2026-02-30 jadi 2 Maret) dan
  // tahun 0-99 menjadi 19xx; yang tidak kembali ke string yang sama ditolak.
  if (!picked || localDateStr(picked) !== date) return { ok: false, issue: 'format' };
  // Perbandingan string aman: keduanya YYYY-MM-DD berpanjang tetap.
  if (date > today) return { ok: false, issue: 'future' };

  const at = new Date(
    picked.getFullYear(),
    picked.getMonth(),
    picked.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds(),
  );
  return { ok: true, at: at.toISOString(), backdated: true };
}

/**
 * Entri riwayat internal untuk tiket yang dicatat mundur. Riwayat append-only
 * dan tersimpan sebagai data tetap (bukan terjemahan), jadi teksnya literal.
 * `at` = waktu sebenarnya tiket dicatat; entri "Unit diterima" membawa tanggal
 * mundur, sehingga selisihnya terbaca jelas oleh Pemilik. Internal: tidak tampil
 * di halaman lacak pelanggan.
 */
export function backdatedHistoryEntry(
  intakeAt: string,
  recordedAt: string,
  by: { id: string; name: string },
): ServiceHistoryEntry {
  return {
    at: recordedAt,
    status: 'edit',
    by: by.id,
    byName: by.name,
    note: `Tanggal masuk dicatat mundur oleh Pemilik: ${fmtDate(localDateOf(intakeAt))} (dicatat ${fmtDate(localDateOf(recordedAt))})`,
    internal: true,
  };
}
