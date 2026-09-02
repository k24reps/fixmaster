import { lazy, type ComponentType } from 'react';

/**
 * `React.lazy` yang tahan terhadap chunk basi setelah deploy.
 *
 * Masalahnya: build Vite memberi nama file ber-hash (`AuthPage-CrbeuAs-.js`).
 * Tab yang sudah dibuka SEBELUM deploy masih memegang index.html lama yang
 * menunjuk hash lama; begitu pengguna menekan tombol yang memicu import
 * dinamis, file itu sudah tidak ada di server dan import gagal. Terlihat di
 * produksi sebagai "Failed to fetch dynamically imported module".
 *
 * Perbaikannya adalah memuat ulang halaman sekali: index.html yang baru
 * menunjuk hash yang benar, dan pengguna melanjutkan seperti tidak terjadi
 * apa-apa. Yang TIDAK boleh terjadi adalah loop muat-ulang saat chunk-nya
 * memang hilang permanen (mis. deploy rusak), jadi percobaan dicatat dengan
 * cap waktu dan hanya diulang bila jeda dari percobaan terakhir cukup jauh.
 */

const RELOAD_KEY = 'fixmaster-chunk-reload';
/** Dua kegagalan dalam rentang ini dianggap loop, bukan chunk basi. */
const RELOAD_COOLDOWN_MS = 10_000;

/**
 * Pesan galat import dinamis berbeda-beda per mesin browser, jadi dicocokkan
 * dengan pola alih-alih satu string:
 *   Chrome/Edge  "Failed to fetch dynamically imported module: ..."
 *   Firefox      "error loading dynamically imported module"
 *   Safari       "Importing a module script failed."
 */
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
    message,
  );
}

/** Baca/tulis penanda; localStorage bisa melempar di mode privat. */
function lastReloadAt(): number {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
}
function markReload(): void {
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* mode privat: tanpa penanda, cooldown tak berlaku — tetap lebih baik
       daripada gagal total, dan browser sendiri membatasi reload beruntun. */
  }
}

/**
 * Bagian yang bisa diuji: jalankan `load`, dan bila gagal KARENA chunk basi,
 * muat ulang halaman sekali. Galat lain diteruskan apa adanya supaya bug
 * sungguhan tetap sampai ke error boundary, bukan disamarkan jadi reload.
 */
export function retryOnStaleChunk<T>(load: () => Promise<T>): Promise<T> {
  return load().catch((error: unknown) => {
    if (!isChunkLoadError(error)) throw error;
    if (Date.now() - lastReloadAt() < RELOAD_COOLDOWN_MS) throw error;
    markReload();
    window.location.reload();
    // Promise yang tidak pernah selesai: menahan React supaya tidak sempat
    // merender layar galat pada frame sebelum reload benar-benar jalan.
    return new Promise<T>(() => {});
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tanda tangan React.lazy sendiri memakai ComponentType<any>; menyempitkannya membuat pemanggil gagal type-check.
export function lazyChunk<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => retryOnStaleChunk(load));
}

/** Diekspor untuk pengujian; bukan bagian dari API yang dipakai komponen. */
export const __test = { isChunkLoadError, RELOAD_KEY, RELOAD_COOLDOWN_MS };
