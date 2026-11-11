import {
  BASE_FONT_DOTS,
  BASE_LINE_DOTS,
  ROW_GAP_DOTS,
  STRONG_FONT_DOTS,
  STRONG_TRACKING_EM,
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

/** Celah antar segmen pita tahap (titik). Lebar tiap kolom label = (isi − 3 celah) / 4. */
export const GAUGE_GAP_DOTS = 8;

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
  .tagline { margin: ${px(8)} 0 0; font-weight: 700; }
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
  .no { font-size: ${px(STRONG_FONT_DOTS)}; font-weight: 700; letter-spacing: ${STRONG_TRACKING_EM}em; }
  /* Tabel hanya penanda semantik; tiap baris di-flex sendiri. Tata letak tabel
     otomatis membagi lebar kolom ke SEMUA baris: satu baris tumpuk yang panjang
     (sel selebar baris) menyempitkan kolom nilai baris lain sampai "s/d 10 Des
     2026" patah, padahal muat. Baris flex tak saling memengaruhi. */
  table, tbody { display: block; width: 100%; }
  tr { display: flex; break-inside: avoid; }
  td {
    padding: ${px(5)} 0;
    vertical-align: top;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  /* Label selebar isinya, tanpa patokan persen: yang muat berdampingan ditentukan
     di kode (fitsBeside), sisanya ditumpuk. Label tak pernah dipotong di tengah kata. */
  td:first-child { flex: 0 0 auto; white-space: nowrap; padding-right: ${px(ROW_GAP_DOTS)}; }
  td:last-child { flex: 1 1 0; min-width: 0; text-align: right; }
  .money td:last-child { font-weight: 700; }
  /* Baris tumpuk: satu sel selebar baris, label di atas nilai. Teks bebas rata kiri
     dan membungkus; nominal tetap rata kanan supaya angka sejajar dengan baris lain. */
  .stack td:first-child { white-space: normal; padding-right: 0; text-align: left; padding-top: ${px(8)}; padding-bottom: ${px(8)}; }
  .stack .k, .stack .v { display: block; }
  .stack .k { font-weight: 400; }
  .money .stack .v { text-align: right; font-weight: 700; }
  /* Barang struk: nama utuh, lalu "jumlah× harga" di kiri dan jumlah rupiah di kanan.
     Bila keduanya tak muat sebaris, rupiah turun dan tetap rata kanan. */
  .item td:first-child { white-space: normal; padding-right: 0; text-align: left; }
  .item .calc { display: flex; flex-wrap: wrap; justify-content: space-between; column-gap: ${px(ROW_GAP_DOTS)}; }
  .item .amt { margin-left: auto; font-weight: 700; }
  .strong td { padding-top: ${px(10)}; font-size: ${px(STRONG_FONT_DOTS)}; font-weight: 700; line-height: ${px(32)}; }
  .strong td:first-child { letter-spacing: ${STRONG_TRACKING_EM}em; }
  .strong .k { font-weight: 700; }
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
  /* Pita tahap siklus hidup. Empat segmen bergandengan; celah di antaranya jadi
     "tick" pada mistar. Dilewati = batang hitam 12 titik (garis tepi, bukan latar),
     belum = garis titik-titik 4 titik yang sejajar di tengah tinggi yang sama, supaya
     label di bawahnya tak naik-turun. Tahap saat ini = tebal + garis bawah. */
  .gauge { display: flex; gap: ${px(GAUGE_GAP_DOTS)}; margin: ${px(12)} 0 0; break-inside: avoid; }
  .step { flex: 1 1 0; min-width: 0; text-align: center; }
  .step .bar { display: block; height: ${px(12)}; }
  .step.on .bar { border-top: ${px(12)} solid #000; }
  .step.off .bar { height: ${px(8)}; margin-top: ${px(4)}; border-top: 2px dotted #000; }
  .step .nm { display: block; margin-top: ${px(6)}; }
  .step.cur .nm { font-weight: 700; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: ${px(4)}; }
  /* Kotak tanda tangan: bingkai kosong setinggi 72 titik (9mm), diisi dengan pulpen. */
  .sign { break-inside: avoid; }
  .sign-box { height: ${px(72)}; border: 2px solid #000; }
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
