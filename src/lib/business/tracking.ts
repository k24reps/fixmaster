/**
 * Helper murni untuk halaman lacak publik. Dipisah dari komponennya supaya
 * kalimat yang dibaca pelanggan bisa diuji tanpa merender apa pun.
 */

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
  text: string;
}

export function nextStepFor(status: string, pickedUp: boolean): NextStep {
  // Sudah diambil menang atas status apa pun: tiket 'selesai' yang unitnya
  // sudah di tangan pelanggan tidak boleh lagi menyuruh datang ke toko.
  if (pickedUp)
    return {
      tone: 'done',
      text: 'Unit sudah diambil dari toko. Tidak ada lagi yang perlu Anda lakukan.',
    };

  switch (status) {
    case 'selesai':
    case 'lunas':
      return {
        tone: 'action',
        text: 'Perbaikan sudah selesai. Unit siap diambil di toko pada jam operasional — tunjukkan nomor servis ini saat pengambilan.',
      };
    case 'konfirmasi':
      return {
        tone: 'action',
        text: 'Menunggu persetujuan Anda atas estimasi biaya. Hubungi toko untuk melanjutkan atau membatalkan pengerjaan.',
      };
    case 'batal':
      return {
        tone: 'action',
        text: 'Pengerjaan dihentikan. Unit bisa diambil kembali di toko — hubungi toko bila ingin penjelasan lebih dulu.',
      };
    case 'tunggu':
      return {
        tone: 'wait',
        text: 'Pengerjaan menunggu sparepart tiba. Tidak ada yang perlu Anda lakukan — toko akan mengabari begitu berlanjut.',
      };
    default:
      return {
        tone: 'wait',
        text: 'Unit sedang ditangani teknisi. Tidak ada yang perlu Anda lakukan — buka halaman ini lagi nanti untuk perkembangan terbaru.',
      };
  }
}

/**
 * "Ada perkembangan gak?" dijawab kebaruannya, bukan tanggalnya. Tanggal
 * absolut tetap tampil di timeline, jadi di atas 7 hari helper ini menyerah
 * (null) daripada mengulang informasi yang sama dengan kata lain.
 */
export function relativeSince(iso: string, now: number = Date.now()): string | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = now - t;
  // Jam perangkat pelanggan bisa lebih lambat dari server; anggap saja baru.
  if (diff < 60_000) return 'baru saja';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'kemarin';
  if (days <= 7) return `${days} hari lalu`;
  return null;
}
