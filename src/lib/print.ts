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
 * Dipakai nota servis & struk penjualan (kertas termal 58/80mm) dan laporan PDF
 * (A4). Yang berbeda hanya `style` dan `body`; mekaniknya — penjaga demo,
 * popup yang diblokir, pemicu cetak, dan bilah kontrol layar-saja — sama untuk
 * ketiganya.
 */

/** Escape user/org text before injecting into the print window markup. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Teks bilah kontrol jendela cetak. Dokumen cetak tak punya React maupun kamus,
 * jadi pemanggil menerjemahkannya lebih dulu (`openPrintWindow` yang melakukannya).
 */
export interface PrintControls {
  /** Nama bilah untuk pembaca layar. */
  label: string;
  again: string;
  close: string;
  /** Tampil bila browser menolak `window.close()`: tombol "Tutup" tak boleh mati tanpa kabar. */
  closeFailed: string;
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
  /**
   * Bilah "Cetak lagi / Tutup", hanya di layar. Tanpa ini dokumen tak punya
   * bilah, dan dengan `roll: null` ia diabaikan (tanpa skrip, tombolnya mati).
   */
  controls?: PrintControls;
}

export interface PrintWindowOptions extends Omit<PrintDocumentOptions, 'roll' | 'controls'> {
  /** Pesan penjaga mode demo; cetak dimatikan di sana. */
  demoMessage: string;
  roll?: { widthMm: number; logoMm: number };
  width?: number;
  height?: number;
}

/**
 * CSS bilah kontrol. Dua aturan di sini menjaga tinggi gulungan:
 *
 * 1. Bilah `position: fixed`, jadi tak ikut tinggi `<body>` — itu yang diukur
 *    `fit()` di `printScript` untuk menulis `@page { size: <lebar>mm <tinggi>mm }`.
 *    Bilah di aliran dokumen akan menambah tinggi kertas sepanjang bilahnya.
 * 2. Ruang agar bilah tak menutup ekor nota dipesan di `html`, bukan `body`,
 *    karena `getBoundingClientRect()` body mencakup padding body.
 *
 * `@media print { display: none !important }` mencegah bilah tercetak, termasuk
 * bila gaya pemanggil kebetulan menimpa `display`. Warna literal di sini sah
 * dengan alasan yang sama seperti gaya nota: dokumen cetak tak punya token.
 */
export const PRINT_CONTROLS_STYLE = `
  .fm-printbar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
    padding: 12px 12px calc(12px + env(safe-area-inset-bottom));
    background: #111; color: #fff;
    font: 700 13px/1.2 ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;
    letter-spacing: 0.04em;
  }
  /* Tepi atas bilah berpenggaris: tick-gauge Bench, bukan garis pemisah polos. */
  .fm-printbar::before {
    content: ''; position: absolute; left: 0; right: 0; top: -6px; height: 6px;
    background: repeating-linear-gradient(90deg, #111 0 1px, transparent 1px 8px);
  }
  .fm-printbar .fm-printrow { display: flex; gap: 8px; }
  .fm-printbar button {
    flex: 1 1 0; min-height: 44px; padding: 0 14px; border-radius: 3px; cursor: pointer;
    font: inherit; letter-spacing: inherit; color: #fff; background: transparent; border: 1px solid #8a8a8a;
  }
  .fm-printbar button:hover { border-color: #fff; }
  .fm-printbar .fm-printagain { color: #111; background: #f5a623; border-color: #c0750a; }
  .fm-printbar .fm-printagain:hover { background: #f7b733; border-color: #c0750a; }
  .fm-printbar button:focus-visible { outline: 2px solid #f7b733; outline-offset: 2px; }
  /* Kosong = tinggi nol tapi tetap ada di pohon aksesibilitas, supaya pembaca layar
     mengumumkan teksnya saat terisi (display: none membuang pengumuman itu). */
  .fm-printbar .fm-printmsg { margin: 0 0 8px; font-size: 12px; font-weight: 400; color: #f7b733; }
  .fm-printbar .fm-printmsg:empty { margin: 0; }
  @media screen { html { padding-bottom: calc(68px + env(safe-area-inset-bottom)); } }
  @media print { .fm-printbar { display: none !important; } }
`;

function controlsMarkup(c: PrintControls): string {
  return `<div class="fm-printbar" role="group" aria-label="${escapeHtml(c.label)}">
<p class="fm-printmsg" id="fm-printmsg" role="status" data-failed="${escapeHtml(c.closeFailed)}"></p>
<div class="fm-printrow">
<button type="button" class="fm-printagain" id="fm-printagain">${escapeHtml(c.again)}</button>
<button type="button" id="fm-printclose">${escapeHtml(c.close)}</button>
</div>
</div>`;
}

/**
 * Skrip pemicu cetak. Dipisah dari `buildPrintDocument` supaya bisa diuji:
 * ukuran halamannya adalah satu-satunya bagian dokumen yang dihitung di jendela.
 * `controls` = dokumen membawa bilah, jadi tombolnya perlu dihubungkan.
 */
export function printScript(roll: PrintDocumentOptions['roll'], controls = false): string {
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
    // Satu <style> yang ditulis ulang, bukan ditambah: "Cetak lagi" mengukur lagi.
    var s = document.getElementById('fm-page');
    if (!s) { s = document.createElement('style'); s.id = 'fm-page'; document.head.appendChild(s); }
    s.textContent = '@page{size:${roll.widthMm}mm ' + mm + 'mm;margin:0}';
  }`
    : '';
  const wire = controls
    ? `
  // Tombol di sini punya tindakan pengguna, jadi print() lewat klik tak kena
  // pembatasan "print() tanpa gestur" yang bisa menahan pemicu otomatis di ponsel.
  document.getElementById('fm-printagain').onclick = function () { ${roll ? 'fit(); ' : ''}window.print(); };
  document.getElementById('fm-printclose').onclick = function () {
    window.close();
    // Browser yang menolak close() tak melempar galat, ia diam. Bila jendela masih
    // ada sesudah jeda, kabari pengguna; bila sudah menutup, timer ini tak pernah jalan.
    setTimeout(function () {
      var m = document.getElementById('fm-printmsg');
      if (!window.closed) m.textContent = m.getAttribute('data-failed');
    }, 300);
  };`
    : '';
  return `
  // Logo toko bisa berupa URL Storage yang lambat. window.onload sudah
  // menunggu gambar, tapi jaringan yang menggantung tidak boleh menyandera
  // dialog cetak: mana pun yang lebih dulu, itu yang jalan.
  var done = false;${fit}
  function go() { if (!done) { done = true; ${roll ? 'fit(); ' : ''}window.print(); } }
  window.onload = go;
  setTimeout(go, 3000);${wire}
`;
}

/**
 * Dokumen cetak lengkap sebagai string. Dipakai jendela cetak DAN pratinjau di
 * Pengaturan, sehingga yang dilihat pemilik toko adalah HTML yang persis sama
 * dengan yang dikirim ke printer. `roll: null` membuang skrip cetak.
 */
export function buildPrintDocument(o: PrintDocumentOptions): string {
  const withBar = !!o.controls && o.roll !== null;
  const script = o.roll === null ? '' : `<script>${printScript(o.roll, withBar)}</script>`;
  // Tanpa meta viewport, Chrome Android menata jendela baru selebar 980px lalu
  // mengecilkannya: tombol 44px jadi ±16px. Hanya dipasang bersama bilah, karena
  // tata letak layar nota tak berubah (badannya ber-`max-width`, bukan lebar viewport).
  const viewport = withBar ? '\n<meta name="viewport" content="width=device-width,initial-scale=1"/>' : '';
  const barStyle = withBar ? `\n<style>${PRINT_CONTROLS_STYLE}</style>` : '';
  // Tanpa bilah, HTML-nya sama byte-per-byte dengan sebelum bilah ada.
  const bar = withBar && o.controls ? `\n${controlsMarkup(o.controls)}` : '';
  return `<!doctype html>
<html lang="${o.lang ?? 'id'}"><head><meta charset="utf-8"/>${viewport}
<title>${escapeHtml(o.title)}</title>
<style>${o.style}</style>${barStyle}
</head><body>
${o.body}${bar}
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
 *
 * Keputusan penutupan: jendela TIDAK menutup sendiri. Jalan keluarnya adalah
 * bilah "Cetak lagi / Tutup" (`PRINT_CONTROLS_STYLE`), yang bekerja lewat klik
 * pengguna dan tak bergantung pada perilaku dialog cetak tiap platform.
 *
 * - `afterprint` + `window.close()` ditolak. Di Chrome desktop `print()` menahan
 *   skrip sampai dialog selesai, jadi `afterprint` datang sesudahnya. Di Safari iOS
 *   dan Chrome Android itu BELUM TERUJI di sini: bila `afterprint` datang saat
 *   lembar cetak baru terbuka, `close()` menutup tab sebelum pengguna sempat
 *   mencetak, dan pengguna kehilangan nota tanpa jalan kembali. Kerugiannya lebih
 *   besar dari tab yang menganggur.
 * - `iframe` tersembunyi + `contentWindow.print()` ditolak. Ia menggeser seluruh
 *   jalur cetak yang sudah terukur (lebar tata letak untuk `fit()`, nama berkas
 *   PDF dari `<title>`, perilaku `@page` per platform) demi masalah yang cukup
 *   ditutup bilah, dan tak satu pun dari itu bisa diuji di Android atau iOS.
 */
export function openPrintWindow(o: PrintWindowOptions): boolean {
  if (demoGuard(o.demoMessage)) return false;
  const lang = useSettingsStore.getState().language;
  const win = window.open('', '_blank', `width=${o.width ?? 380},height=${o.height ?? 640}`);
  if (!win) {
    toast.error(translate(lang, 'print.popupBlocked'));
    return false;
  }

  // Jendela ini tak menutup sendiri (lihat "Keputusan penutupan" di atas), jadi
  // setelah dialog cetak dibatalkan pengguna butuh jalan keluar yang terlihat.
  const controls: PrintControls = {
    label: translate(lang, 'print.controls'),
    again: translate(lang, 'print.again'),
    close: translate(lang, 'print.close'),
    closeFailed: translate(lang, 'print.closeFailed'),
  };
  win.document.write(buildPrintDocument({ ...o, controls }));
  win.document.close();
  return true;
}
