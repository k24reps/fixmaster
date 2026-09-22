import { toast } from '@/stores/toast';
import { demoGuard } from '@/stores/demo';

/**
 * Jendela cetak di browser — SATU-SATUNYA bagian pencetakan yang menyentuh DOM,
 * sejajar dengan `@/lib/csv` untuk unduhan CSV.
 *
 * Dokumen cetak dibuka lewat `window.open` sebagai halaman terpisah, jadi ia
 * tidak bisa menjangkau `tokens.css` maupun webfont aplikasi: setiap pemanggil
 * membawa `style`-nya sendiri, dan itulah satu-satunya tempat di produk yang
 * boleh menulis warna literal. Bukan pelanggaran Token-Only Rule, melainkan
 * konsekuensi media — tinta di kertas tidak punya tema gelap dan tidak punya
 * `var()`.
 *
 * Dipakai nota servis & struk penjualan (kertas termal 58mm) dan laporan PDF
 * (A4). Yang berbeda hanya `style` dan `body`; mekaniknya — penjaga demo,
 * popup yang diblokir, dan pemicu cetak — sama untuk ketiganya.
 */

/** Escape user/org text before injecting into the print window markup. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface PrintWindowOptions {
  /** Pesan penjaga mode demo; cetak dimatikan di sana. */
  demoMessage: string;
  /** Judul dokumen — tampil sebagai nama bawaan berkas PDF hasil "Simpan sebagai PDF". */
  title: string;
  /** CSS lengkap dokumen (tidak ada yang diwarisi dari aplikasi). */
  style: string;
  /** Isi `<body>`. */
  body: string;
  width?: number;
  height?: number;
}

/**
 * Buka dokumen cetak di jendela baru dan panggil dialog cetak browser.
 * Dari dialog itu pengguna bisa memilih "Simpan sebagai PDF" — itulah jalur
 * PDF-nya: teks tetap vektor dan bisa dicari, tanpa menambah pustaka PDF.
 *
 * Mengembalikan `false` bila dokumennya TIDAK jadi dibuka (mode demo, atau
 * popup diblokir) supaya pemanggil tidak memberi petunjuk lanjutan tentang
 * jendela yang tidak pernah muncul.
 */
export function openPrintWindow(o: PrintWindowOptions): boolean {
  if (demoGuard(o.demoMessage)) return false;
  const win = window.open('', '_blank', `width=${o.width ?? 380},height=${o.height ?? 640}`);
  if (!win) {
    toast.error('Popup diblokir browser');
    return false;
  }

  win.document.write(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"/>
<title>${escapeHtml(o.title)}</title>
<style>${o.style}</style>
</head><body>
${o.body}
<script>
  // Logo toko bisa berupa URL Storage yang lambat. window.onload sudah
  // menunggu gambar, tapi jaringan yang menggantung tidak boleh menyandera
  // dialog cetak — mana pun yang lebih dulu, itu yang jalan.
  var done = false;
  function go() { if (!done) { done = true; window.print(); } }
  window.onload = go;
  setTimeout(go, 3000);
</script>
</body></html>`);
  win.document.close();
  return true;
}
