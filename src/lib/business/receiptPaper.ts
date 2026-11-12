/**
 * Kertas termal: dari lebar gulungan ke ukuran halaman dan ukuran isi.
 *
 * Nota dan struk dicetak lewat dialog cetak browser, jadi satu-satunya yang
 * bisa dikendalikan toko adalah dokumennya sendiri. Dokumen yang tidak
 * menyebut ukuran kertas diserahkan ke driver: Chrome memilih Letter/A4,
 * mengecilkan isi saat ada baris yang tak muat, dan margin bawaan 6mm
 * mendorong teks keluar dari pita cetak. Modul ini menyatakan ukuran itu
 * dalam TITIK head printer, bukan px layar, karena yang menentukan terbaca
 * atau tidaknya hasil cetak adalah kisi 203 dpi tempat huruf digambar.
 *
 * Murni: tidak menyentuh DOM, supaya batasnya bisa diuji tanpa browser.
 */

/** Lebar gulungan yang didukung, dalam mm. */
export const PAPER_WIDTHS = [58, 80] as const;
export type PaperWidth = (typeof PAPER_WIDTHS)[number];

/** Gulungan 58mm adalah printer konter yang paling umum. */
export const DEFAULT_PAPER_WIDTH: PaperWidth = 58;

/** Jenis `unknown` karena nilainya datang dari jsonb yang ditulis tangan. */
export function normalizePaperWidth(raw: unknown): PaperWidth {
  return raw === 80 || raw === '80' ? 80 : DEFAULT_PAPER_WIDTH;
}

/** Hampir semua head termal 58/80mm beresolusi 203 dpi (8 titik per mm). */
export const HEAD_DPI = 203;

/** Titik head → px CSS (1px = 1/96 inci). */
export function dotsToPx(dots: number): number {
  return Math.round(((dots * 96) / HEAD_DPI) * 1000) / 1000;
}

/** Titik head → mm. */
export function dotsToMm(dots: number): number {
  return Math.round(((dots * 25.4) / HEAD_DPI) * 100) / 100;
}

/**
 * Lebar head yang benar-benar mencetak: 384 titik (48mm) di gulungan 58mm,
 * 576 titik (72mm) di gulungan 80mm. Sisanya, sekitar 5mm di tiap tepi, adalah
 * kertas yang tak terjangkau head.
 */
const PRINTABLE_DOTS: Record<PaperWidth, number> = { 58: 384, 80: 576 };

/**
 * Tepi aman di dalam area cetak. Driver membulatkan, dan titik terluar head
 * sering lebih redup; teks yang menempel di sana kehilangan satu kolom piksel.
 */
const INSET_DOTS = 4;

/**
 * Tinggi huruf dasar. 20 titik adalah ukuran Font A printer ESC/POS (12x24
 * titik per sel), sehingga 384 titik memuat 32 huruf dan 576 titik memuat 48,
 * persis hitungan yang diharapkan orang yang biasa memegang struk termal.
 */
export const BASE_FONT_DOTS = 20;

/** Tinggi baris dasar, juga kelipatan titik supaya baris tidak jatuh di setengah titik. */
export const BASE_LINE_DOTS = 28;

/** Lebar sel huruf mono pada umumnya (Liberation, DejaVu, Droid, SF Mono). Consolas 0,55. */
export const MONO_ADVANCE_EM = 0.6;

export interface PaperSpec {
  /** Lebar gulungan (mm): nilai `@page size`. */
  widthMm: PaperWidth;
  /** Lebar head (titik), lalu dalam px CSS untuk lebar `<body>`. */
  printableDots: number;
  printablePx: number;
  /** Tepi aman tiap sisi (titik). */
  insetDots: number;
  insetPx: number;
  /** Lebar isi setelah tepi aman (titik). */
  contentDots: number;
  contentPx: number;
}

export function paperSpec(width: PaperWidth = DEFAULT_PAPER_WIDTH): PaperSpec {
  const printableDots = PRINTABLE_DOTS[width];
  return {
    widthMm: width,
    printableDots,
    printablePx: dotsToPx(printableDots),
    insetDots: INSET_DOTS,
    insetPx: dotsToPx(INSET_DOTS),
    contentDots: printableDots - 2 * INSET_DOTS,
    contentPx: dotsToPx(printableDots - 2 * INSET_DOTS),
  };
}

/**
 * Banyak huruf mono yang muat sebaris pada ukuran dasar. 31 di gulungan 58mm
 * dan 47 di 80mm untuk font berlebar 0,6em; Consolas (0,55em) memuat lebih
 * banyak, tak pernah lebih sedikit.
 */
export function charsPerLine(
  spec: PaperSpec,
  advanceEm: number = MONO_ADVANCE_EM,
  fontDots: number = BASE_FONT_DOTS,
): number {
  return Math.floor(spec.contentDots / (fontDots * advanceEm));
}

/** Tinggi huruf baris TOTAL dan nomor dokumen (titik), satu tingkat di atas huruf dasar. */
export const STRONG_FONT_DOTS = 26;

/** Jarak huruf label baris TOTAL (em); mengurangi jumlah huruf yang muat. */
export const STRONG_TRACKING_EM = 0.04;

/**
 * Sela antara kolom label dan kolom nilai pada satu baris (titik). Sama dengan
 * `padding-right` sel label di `receiptStyle`; kalau salah satunya berubah, ubah
 * keduanya.
 */
export const ROW_GAP_DOTS = 16;

/**
 * Apakah label dan nilai muat BERDAMPINGAN di satu baris. Bila tidak, baris
 * ditumpuk: label di atas, nilai utuh di bawahnya. Kolom label tak lagi dipatok
 * persentase (dulu 38%): nilai pendek tak perlu menunggu kolom yang kosong,
 * nilai panjang (IMEI ganda 31 huruf, keluhan dua kalimat) tak lagi terdorong
 * ke kolom sempit yang membelah kata.
 *
 * Dihitung dalam huruf mono (`MONO_ADVANCE_EM`), bukan dengan mengukur DOM:
 * dokumen cetak disusun sebagai string sinkron sebelum jendela dibuka, dan
 * hanya hitungan murni yang bisa diuji. Satu huruf cadangan menutup font yang
 * lebih lebar dari 0,6em. `[...teks]` menghitung huruf sungguhan (emoji bukan
 * dua); `.length` menghitung unit UTF-16.
 *
 * `labelTrackingEm` untuk baris yang labelnya diberi jarak huruf (baris TOTAL).
 */
export function fitsBeside(
  label: string,
  value: string,
  spec: PaperSpec,
  fontDots: number = BASE_FONT_DOTS,
  labelTrackingEm = 0,
): boolean {
  const glyph = fontDots * MONO_ADVANCE_EM;
  const labelDots = [...label].length * (glyph + fontDots * labelTrackingEm);
  const valueDots = [...value].length * glyph;
  return labelDots + ROW_GAP_DOTS + valueDots + glyph <= spec.contentDots;
}

/**
 * Lebar satu modul QR (titik) yang diincar: 6 titik = 0,75 mm. Modul 4 titik
 * (0,5 mm) membuat kode lacak hanya ±16 mm dan kadang gagal dipindai, karena
 * tepi tiap titik termal sedikit meleber dan memakan modul putih di sebelahnya.
 */
export const QR_MODULE_DOTS = 6;

/** Zona sunyi QR (modul) di tiap sisi, sesuai spesifikasi. Kode berdiri di barisnya sendiri. */
export const QR_QUIET_MODULES = 4;

/**
 * Lebar modul QR untuk simbol `modules`×`modules` di kertas ini: `QR_MODULE_DOTS`
 * bila simbol plus zona sunyi muat selebar isi, selain itu turun ke ukuran yang
 * muat. Hanya bilangan GENAP: sisi simbol plus zona sunyi selalu ganjil (17 + 4v
 * + 8), jadi modul genap membuat sisa ruang genap dan kode yang dirata-tengah
 * jatuh tepat di titik, tidak di setengah titik yang membuat tepinya kabur.
 */
export function qrModuleDots(modules: number, spec: PaperSpec): number {
  const side = modules + 2 * QR_QUIET_MODULES;
  for (let dots = QR_MODULE_DOTS; dots > 2; dots -= 2) if (side * dots <= spec.contentDots) return dots;
  return 2;
}

/**
 * Pita kosong di bawah baris terakhir: tempat gulungan disobek atau dipotong
 * tanpa memotong baris terakhir.
 */
export const TAIL_MM = 6;

/**
 * Tinggi halaman (mm) untuk isi setinggi `contentHeightPx`. Dibulatkan KE ATAS
 * plus 1mm, karena halaman yang lebih pendek dari isinya membuang satu baris
 * ke halaman kedua yang hampir kosong, dan itu satu potong kertas terbuang.
 * `extraMm` untuk gambar yang belum selesai dimuat saat tinggi diukur.
 */
export function pageHeightMm(contentHeightPx: number, extraMm = 0): number {
  const mm = (Math.max(0, contentHeightPx) * 25.4) / 96;
  return Math.ceil(mm + extraMm) + 1;
}

/** Selisih rapat antara ukuran px dan kisi titik: 0 berarti tepat di kelipatan titik. */
export function dotRemainder(px: number): number {
  const dots = (px * HEAD_DPI) / 96;
  return Math.abs(dots - Math.round(dots));
}
