import {
  BASE_FONT_DOTS,
  BASE_LINE_DOTS,
  TAIL_MM,
  dotsToPx,
  type PaperSpec,
} from '@/lib/business/receiptPaper';

/**
 * CSS nota & struk untuk gulungan termal. Warna literal di sini disengaja dan
 * dijelaskan di `@/lib/print`: dokumen cetak tidak mewarisi apa pun dari aplikasi.
 *
 * Semua ukuran huruf dan tinggi baris dituliskan dalam TITIK head 203 dpi
 * (`px()`), bukan angka px yang enak dilihat di layar. Huruf setinggi 11,5px
 * jatuh di 24,3 titik; head membulatkannya, dan garis tebal-tipis hurufnya
 * ikut bergeser. Pada kelipatan titik, hasilnya sama di setiap mesin.
 *
 * Semua tinta hitam #000. Head termal hanya punya dua keadaan; driver yang
 * memakai ambang 50% menghapus abu-abu (#555 hanya selamat lewat tepi
 * antialias, #8a8a8a lenyap seluruhnya). Hierarki dibangun dari bobot, ukuran,
 * dan jarak huruf, bukan dari terang-gelap.
 *
 * Monospace di sini juga bukan kostum "biar terlihat teknis": seluruh isi nota
 * adalah data dan nominal yang dibaca berkolom, persis kasus yang Mono Numbers
 * Rule maksudkan.
 */

/** Tinggi maksimum logo (titik): 16mm. Juga cadangan tinggi bila logo telat dimuat. */
export const LOGO_MAX_DOTS = 128;
export const LOGO_MAX_MM = Math.ceil((LOGO_MAX_DOTS * 25.4) / 203);

/**
 * Tumpukan font mono sistem. JetBrains Mono tidak termuat di jendela cetak
 * (halaman about:blank tidak mewarisi webfont aplikasi), dan tanpa tumpukan
 * yang eksplisit Chrome memilih apa saja. Urutan: yang tebal dan lebar sama
 * dulu; Courier New paling akhir karena goresannya terlalu tipis untuk head
 * termal.
 */
export const RECEIPT_MONO_STACK =
  "ui-monospace, 'Cascadia Mono', Consolas, 'Lucida Console', Menlo, 'DejaVu Sans Mono', 'Liberation Mono', 'Noto Sans Mono', 'Courier New', monospace";

const px = (dots: number) => `${dotsToPx(dots)}px`;

export function receiptStyle(paper: PaperSpec): string {
  const base = BASE_FONT_DOTS;
  const line = BASE_LINE_DOTS;
  return `
  /* Panjang halaman diganti skrip cetak setelah isi diukur: Chrome menolak "auto". */
  @page { size: ${paper.widthMm}mm 297mm; margin: 0; }
  * { box-sizing: border-box; }
  html { width: ${paper.widthMm}mm; margin: 0; background: #fff; }
  body {
    margin: 0 auto;
    padding: ${px(8)} ${px(paper.insetDots)} ${TAIL_MM}mm;
    width: ${paper.printablePx}px;
    color: #000;
    background: #fff;
    font-family: ${RECEIPT_MONO_STACK};
    font-size: ${px(base)};
    line-height: ${px(line)};
    overflow-wrap: anywhere;
    -webkit-font-smoothing: antialiased;
  }
  .brand { text-align: center; }
  .logo {
    max-width: ${px(192)};
    max-height: ${px(LOGO_MAX_DOTS)};
    margin: 0 auto ${px(12)};
    display: block;
    object-fit: contain;
  }
  .shop {
    margin: 0;
    font-size: ${px(30)};
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: ${px(36)};
  }
  .contact { margin: ${px(8)} 0 0; }
  /* Jahitan titik-titik, meneruskan bahasa "tepi terperforasi" dari aplikasi. Hitam
     pekat setebal 4 titik: abu-abu di bawah ambang 50% tidak dicetak sama sekali. */
  .seam { border: none; border-top: 2px dotted #000; margin: ${px(20)} 0; }
  .docline {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    column-gap: ${px(16)};
  }
  .kind { letter-spacing: 0.18em; font-weight: 700; }
  .no { font-size: ${px(26)}; font-weight: 700; letter-spacing: 0.04em; }
  table { width: 100%; border-collapse: collapse; }
  tr { break-inside: avoid; }
  td {
    padding: ${px(5)} 0;
    vertical-align: top;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  td:first-child { width: 38%; padding-right: ${px(16)}; }
  td:last-child { text-align: right; }
  .money td:last-child { font-weight: 700; }
  .strong td { padding-top: ${px(10)}; font-size: ${px(26)}; font-weight: 700; line-height: ${px(32)}; }
  .strong td:first-child { letter-spacing: 0.04em; }
  .block-label { letter-spacing: 0.18em; font-weight: 700; margin: 0 0 ${px(8)}; }
  .block { break-inside: avoid; }
  /* Penanda status dokumen: bingkai hitam 4 titik, bukan latar. Latar tidak ikut
     tercetak bila "background graphics" mati; garis tepi selalu tercetak. */
  .void-mark {
    margin: ${px(12)} 0 0;
    padding: ${px(6)} 0;
    border: 2px solid #000;
    text-align: center;
    font-size: ${px(30)};
    line-height: ${px(36)};
    font-weight: 700;
    letter-spacing: 0.3em;
    text-indent: 0.3em;
  }
  .reprint { margin: ${px(12)} 0 0; text-align: center; letter-spacing: 0.14em; }
  .reprint strong { letter-spacing: 0.18em; }
  tr.strike td { text-decoration: line-through; text-decoration-thickness: 2px; }
  .track { display: flex; gap: ${px(20)}; align-items: center; break-inside: avoid; }
  .track svg { flex: 0 0 auto; }
  .track-copy { min-width: 0; }
  .track-url { margin: ${px(6)} 0 0; }
  .note { white-space: pre-wrap; }
  .foot { text-align: center; }
  .by { text-align: center; letter-spacing: 0.14em; margin-top: ${px(20)}; }
`;
}
