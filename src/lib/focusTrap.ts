/**
 * Elemen yang bisa menerima fokus lewat Tab. Satu daftar untuk semua
 * perangkap fokus (Modal, laci sidebar), supaya keduanya tak berselisih soal
 * apa yang "terjangkau".
 */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Ke indeks mana fokus harus dilompatkan saat Tab ditekan di dalam perangkap
 * fokus; `null` = biarkan browser berjalan sendiri (Tab di tengah daftar).
 *
 * `index` adalah posisi elemen yang sedang fokus di daftar tabbable, atau -1
 * bila ia di luar daftar (wadahnya sendiri, atau elemen di luar perangkap).
 * Dari luar, Tab masuk ke ujung yang searah arahnya, jadi fokus tak bisa
 * bocor ke halaman di belakang laci. Daftar kosong ditangani pemanggil
 * (batalkan Tab), bukan di sini.
 */
export function trapTarget(count: number, index: number, shift: boolean): number | null {
  if (count <= 0) return null;
  if (index < 0) return shift ? count - 1 : 0;
  if (!shift && index === count - 1) return 0;
  if (shift && index === 0) return count - 1;
  return null;
}
