import { useState } from 'react';

/**
 * Mengisi ulang state form sebuah modal setiap kali ia DIBUKA.
 *
 * Modal di aplikasi ini tidak pernah di-unmount — `open` hanya menyembunyikannya,
 * sehingga `useState` di dalamnya tetap memegang isian terakhir. Karena itu
 * pengisian ulang harus dipicu sendiri, dan itulah yang dilakukan hook ini.
 *
 * ------------------------------------------------------------
 * BUG YANG MELAHIRKANNYA
 * ------------------------------------------------------------
 * Tiap modal dulu menyimpan `lastKey` sendiri dan membandingkannya dengan
 * kunci saat ini (`editing?.id ?? 'new'`). Pola itu benar untuk berpindah
 * antar record, tapi bocor pada kasus yang paling sering terjadi:
 *
 *   1. Buka "Servis Baru"  → kunci 'new', form dikosongkan, lastKey = 'new'
 *   2. Simpan, modal tutup → lastKey MASIH 'new'
 *   3. Buka "Servis Baru"  → kunci masih 'new', tidak ada yang berubah,
 *                            form tetap berisi input servis sebelumnya
 *
 * Membuka record yang sama dua kali berturut-turut lebih buruk lagi: perubahan
 * yang tadi dibatalkan ikut hidup kembali seolah tersimpan.
 *
 * Kuncinya: melepas `lastKey` saat modal TERTUTUP. Hanya satu baris — dan
 * justru itu sebabnya ia layak tinggal di satu tempat. Enam modal menyalin
 * pola lamanya tanpa baris itu; satu-satunya yang punya (WarrantyClaimModal)
 * mendapatkannya dari perbaikan yang tidak pernah kembali ke saudaranya.
 *
 * ------------------------------------------------------------
 * PEMAKAIAN
 * ------------------------------------------------------------
 *   useResetOnOpen(open, editing?.id ?? 'new', () => {
 *     setName(editing?.name ?? '');
 *     setPhone(editing?.phone ?? '');
 *   });
 *
 * `key` boleh `null` saat data yang dibutuhkan belum siap (misalnya modal
 * terbuka sebelum record-nya termuat) — hook menunggu sampai kuncinya ada.
 *
 * `reset` dipanggil SAAT RENDER, bukan di dalam efek. Ini pola resmi React
 * untuk menyesuaikan state terhadap perubahan props: React membuang hasil
 * render itu dan langsung mengulangnya dengan nilai baru, jadi tidak ada
 * kedipan satu frame berisi data lama seperti kalau memakai useEffect.
 */
export function useResetOnOpen(
  open: boolean,
  key: string | null | undefined,
  reset: () => void,
): void {
  const [lastKey, setLastKey] = useState<string | null>(null);

  // `!= null` longgar dengan sengaja: menangkap undefined juga, yang mudah
  // muncul dari `record?.id` tanpa `?? null` di sisi pemanggil.
  if (open && key != null && lastKey !== key) {
    setLastKey(key);
    reset();
  } else if (!open && lastKey !== null) {
    // Inti perbaikannya. Tanpa baris ini, membuka kembali kunci yang sama
    // tidak dianggap perubahan dan form tidak pernah dibersihkan.
    setLastKey(null);
  }
}
