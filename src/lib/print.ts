import { translate } from '@/i18n';
import { toast } from '@/stores/toast';
import { demoGuard } from '@/stores/demo';
import { useSettingsStore } from '@/stores/settings';

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

export interface PrintDocumentOptions {
  /** Judul dokumen — tampil sebagai nama bawaan berkas PDF hasil "Simpan sebagai PDF". */
  title: string;
  /** CSS lengkap dokumen (tidak ada yang diwarisi dari aplikasi). */
  style: string;
  /** Isi `<body>`. */
  body: string;
  /** Bahasa dokumen (atribut `lang`). */
  lang?: string;
  /**
   * Gulungan: tinggi halaman disesuaikan dengan isi tepat sebelum `print()`.
   * Chrome mengabaikan `@page { size: 58mm auto }` (jatuh ke Letter) dan
   * `size: 58mm` saja berarti persegi 58x58, jadi satu-satunya jalan ke
   * "panjang secukupnya" adalah mengukur lalu menulis `size: <lebar>mm <tinggi>mm`.
   * `logoMm` = cadangan tinggi bila logo belum selesai dimuat saat diukur.
   * `null` = tanpa cetak otomatis (pratinjau di iframe).
   */
  roll?: { widthMm: number; logoMm: number } | null;
}

export interface PrintWindowOptions extends Omit<PrintDocumentOptions, 'roll'> {
  /** Pesan penjaga mode demo; cetak dimatikan di sana. */
  demoMessage: string;
  roll?: { widthMm: number; logoMm: number };
  width?: number;
  height?: number;
}

/**
 * Skrip pemicu cetak. Dipisah dari `buildPrintDocument` supaya bisa diuji:
 * ukuran halamannya adalah satu-satunya bagian dokumen yang dihitung di jendela.
 */
export function printScript(roll: PrintDocumentOptions['roll']): string {
  const fit = roll
    ? `
  function fit() {
    // Ukur isi di jendela ini, bukan perkiraan: wrap teks tergantung font mono
    // yang tersedia di mesin kasir.
    var h = document.body.getBoundingClientRect().height;
    var extra = 0;
    for (var i = 0; i < document.images.length; i++) {
      if (!document.images[i].complete) extra = ${roll.logoMm};
    }
    var mm = Math.ceil(h * 25.4 / 96 + extra) + 1;
    var s = document.createElement('style');
    s.textContent = '@page{size:${roll.widthMm}mm ' + mm + 'mm;margin:0}';
    document.head.appendChild(s);
  }`
    : '';
  return `
  // Logo toko bisa berupa URL Storage yang lambat. window.onload sudah
  // menunggu gambar, tapi jaringan yang menggantung tidak boleh menyandera
  // dialog cetak: mana pun yang lebih dulu, itu yang jalan.
  var done = false;${fit}
  function go() { if (!done) { done = true; ${roll ? 'fit(); ' : ''}window.print(); } }
  window.onload = go;
  setTimeout(go, 3000);
`;
}

/**
 * Dokumen cetak lengkap sebagai string. Dipakai jendela cetak DAN pratinjau di
 * Pengaturan, sehingga yang dilihat pemilik toko adalah HTML yang persis sama
 * dengan yang dikirim ke printer. `roll: null` membuang skrip cetak.
 */
export function buildPrintDocument(o: PrintDocumentOptions): string {
  const script = o.roll === null ? '' : `<script>${printScript(o.roll)}</script>`;
  return `<!doctype html>
<html lang="${o.lang ?? 'id'}"><head><meta charset="utf-8"/>
<title>${escapeHtml(o.title)}</title>
<style>${o.style}</style>
</head><body>
${o.body}
${script}
</body></html>`;
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
    toast.error(translate(useSettingsStore.getState().language, 'print.popupBlocked'));
    return false;
  }

  win.document.write(buildPrintDocument(o));
  win.document.close();
  return true;
}
