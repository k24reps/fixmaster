/**
 * Helper murni untuk halaman lacak publik. Dipisah dari komponennya supaya
 * kalimat yang dibaca pelanggan bisa diuji tanpa merender apa pun. Kalimatnya
 * tinggal di kamus i18n; helper ini hanya memilih kuncinya.
 */
import type { TranslationKey } from '@/i18n';
import { interpolate } from './notify';

/**
 * "Lalu saya harus apa?" — pertanyaan yang selama ini tidak dijawab halaman
 * lacak. Statusnya saja tidak cukup: "Selesai" tanpa kelanjutan membuat orang
 * menunggu dikabari, padahal unitnya sudah bisa diambil.
 *
 * `tone` memisahkan tiga sikap yang berbeda secara visual: `action` menuntut
 * pelanggan bergerak, `wait` justru menenangkan (tidak ada yang perlu
 * dilakukan), `done` menutup perkara.
 */
export interface NextStep {
  tone: 'action' | 'wait' | 'done';
  textKey: TranslationKey;
}

export function nextStepFor(status: string, pickedUp: boolean): NextStep {
  // Sudah diambil menang atas status apa pun: tiket 'selesai' yang unitnya
  // sudah di tangan pelanggan tidak boleh lagi menyuruh datang ke toko.
  if (pickedUp)
    return { tone: 'done', textKey: 'tracking.next.pickedUp' };

  switch (status) {
    case 'selesai':
    case 'lunas':
      return { tone: 'action', textKey: 'tracking.next.ready' };
    case 'konfirmasi':
      return { tone: 'action', textKey: 'tracking.next.confirm' };
    case 'batal':
      return { tone: 'action', textKey: 'tracking.next.cancelled' };
    case 'tunggu':
      return { tone: 'wait', textKey: 'tracking.next.waitingParts' };
    default:
      return { tone: 'wait', textKey: 'tracking.next.inProgress' };
  }
}

/**
 * "Ada perkembangan gak?" dijawab kebaruannya, bukan tanggalnya. Tanggal
 * absolut tetap tampil di timeline, jadi di atas 7 hari helper ini menyerah
 * (null) daripada mengulang informasi yang sama dengan kata lain.
 *
 * `t` diterima sebagai argumen (bukan `useT`) agar helper tetap murni.
 */
export function relativeSince(
  iso: string,
  t: (key: TranslationKey) => string,
  now: number = Date.now(),
): string | null {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  const diff = now - at;
  // Jam perangkat pelanggan bisa lebih lambat dari server; anggap saja baru.
  if (diff < 60_000) return t('tracking.justNow');
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return interpolate(t('tracking.minutesAgo'), { n: String(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return interpolate(t('tracking.hoursAgo'), { n: String(hours) });
  const days = Math.floor(hours / 24);
  if (days === 1) return t('tracking.yesterday');
  if (days <= 7) return interpolate(t('tracking.daysAgo'), { n: String(days) });
  return null;
}

// ---------------------------------------------------------------------------
// Kode lacak (0100)

/**
 * 10 karakter Crockford base32, dibuat server (`gen_track_code()`, 0100); klien
 * hanya memeriksa bentuknya. Tanpa I, L, O, U: pada kertas termal yang pudar I/L
 * dan 1, serta O dan 0, paling sering tertukar, jadi huruf itu tak pernah
 * dipakai dan dibaca sebagai angkanya saat diketik.
 */
const TRACK_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;

/**
 * Yang diketik atau dipindai pelanggan menjadi kode baku, atau null bila bukan
 * kode. Cermin normalisasi `track_service_by_code`: huruf kecil, spasi, tanda
 * hubung, serta I, L, dan O yang terbaca dari kertas tetap menemukan tiketnya.
 */
export function normalizeTrackCode(input: string): string | null {
  const code = input
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  return TRACK_CODE_RE.test(code) ? code : null;
}
