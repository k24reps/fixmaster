import { create } from 'zustand';

/**
 * Zoom aplikasi — preferensi pengguna, bukan zoom browser.
 *
 * Memakai properti CSS `zoom` pada :root, BUKAN `transform: scale()`.
 * `zoom` memicu reflow sungguhan sehingga teks tetap tajam dan layout
 * memakai ruang yang tersedia; `scale()` hanya melar-kecilkan hasil render
 * (teks buram, scrollbar salah, hit-area geser).
 *
 * >>> JEBAKAN YANG WAJIB DIINGAT <<<
 * `zoom` TIDAK menggeser media query. Terukur pada viewport 1152px:
 * `zoom: 0.8` menaikkan ruang layout <main> dari 858px ke 1146px, tetapi
 * `matchMedia('(max-width: 1415px)')` tetap true. Media query ber-satuan `em`
 * pun tidak menolong — `em` di media query selalu resolve ke font-size awal,
 * bukan ke root. Artinya breakpoint apa pun yang harus mengikuti zoom HARUS
 * ditulis sebagai `@container`, karena container query mengukur elemen dalam
 * koordinat layout yang sudah ter-zoom (terverifikasi: di zoom 0.8 container
 * benar melaporkan MUAT saat media query masih melaporkan SEMPIT).
 * Lihat ServicesPage.module.css untuk satu-satunya breakpoint yang sejauh ini
 * benar-benar memerlukan itu.
 */

export const ZOOM_LEVELS = [0.8, 0.9, 1, 1.1, 1.25] as const;
export type Zoom = (typeof ZOOM_LEVELS)[number];

const STORAGE_KEY = 'fixmaster-zoom';
const DEFAULT: Zoom = 1;

function isZoom(v: number): v is Zoom {
  return (ZOOM_LEVELS as readonly number[]).includes(v);
}

function getInitialZoom(): Zoom {
  if (typeof window === 'undefined') return DEFAULT;
  const raw = Number(window.localStorage.getItem(STORAGE_KEY));
  // Nilai asing (dari versi lama / localStorage yang diutak-atik) jatuh ke 100%
  // ketimbang memasang zoom liar yang bikin aplikasi tak terpakai.
  return isZoom(raw) ? raw : DEFAULT;
}

function applyZoom(zoom: Zoom) {
  if (typeof document === 'undefined') return;
  // 100% dikosongkan, bukan ditulis '1': menyisakan properti `zoom` membuat
  // :root jadi containing block dan bisa mengubah perilaku position: fixed.
  document.documentElement.style.zoom = zoom === 1 ? '' : String(zoom);
  // Unit viewport (100dvh dst.) ikut terskala zoom. `--zoom` membuat CSS bisa
  // membaginya kembali lewat `--app-vh`.
  document.documentElement.style.setProperty('--zoom', String(zoom));
}

interface ZoomState {
  zoom: Zoom;
  setZoom: (zoom: Zoom) => void;
  /**
   * Mulai sesi zoom sementara (mis. public demo). Selama sesi aktif, kontrol
   * zoom tetap bekerja tetapi tidak menimpa preferensi tersimpan. Panggil
   * fungsi cleanup yang dikembalikan untuk memulihkan zoom sebelumnya.
   */
  beginTransientZoom: (zoom: Zoom) => () => void;
  /** Geser satu tingkat; berhenti di ujung (tidak memutar balik). */
  stepZoom: (dir: 1 | -1) => void;
}

let transientZoomBefore: Zoom | null = null;

export const useZoomStore = create<ZoomState>((set, get) => ({
  zoom: getInitialZoom(),
  setZoom: (zoom) => {
    applyZoom(zoom);
    if (transientZoomBefore === null) {
      window.localStorage.setItem(STORAGE_KEY, String(zoom));
    }
    set({ zoom });
  },
  beginTransientZoom: (zoom) => {
    // Demo hanya punya satu shell per document. Guard ini menjaga cleanup
    // idempotent tanpa membuat sesi bertumpuk yang sulit dipulihkan.
    if (transientZoomBefore !== null) return () => undefined;
    transientZoomBefore = get().zoom;
    applyZoom(zoom);
    set({ zoom });

    let active = true;
    return () => {
      if (!active || transientZoomBefore === null) return;
      active = false;
      const previous = transientZoomBefore;
      transientZoomBefore = null;
      applyZoom(previous);
      set({ zoom: previous });
    };
  },
  stepZoom: (dir) => {
    const i = ZOOM_LEVELS.indexOf(get().zoom);
    const next = ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, i + dir))];
    if (next !== get().zoom) get().setZoom(next);
  },
}));

/** Pasang zoom tersimpan sebelum React render, supaya tak ada lonjakan ukuran. */
export function initZoom() {
  applyZoom(getInitialZoom());
}

/**
 * Kerapatan awal untuk shell APLIKASI, dipanggil sekali saat AppLayout mount.
 *
 * Sengaja TIDAK di `initZoom()`: itu berjalan untuk seluruh dokumen. Landing
 * dan demo publik menyematkan kerapatan kelas perangkat sebagai zoom sementara
 * (lihat deviceDensityZoom), jadi zoom tersimpan dari app tidak bocor ke sana.
 *
 * `pointer: fine` = ada mouse = meja kerja. Kerapatan dasar produk ini
 * dibentuk ergonomi counter (kontrol 44px, baris 54px, lantai teks 12px) dan
 * terlalu lapang untuk monitor, jadi di sana tampilan dimulai padat. Terukur
 * di 1440x900: kanvas 826px -> 1051px, dashboard 1,76 -> 1,39 layar.
 *
 * Padat berarti SEMUANYA ikut mengecil, teks termasuk (label mono 12px ->
 * 9,6px). Itu keputusan produk yang disengaja untuk skenario meja kerja —
 * lihat "Lantai 12px" di DESIGN.md. Pengguna yang butuh lebih besar menaikkan
 * lewat kontrol zoom, yang tetap pembesar murni.
 *
 * Sentuh (`coarse`) tetap 100%: skenario teknisi di meja penerimaan yang
 * dilindungi hit-area 44px dan jarak baca lengan, dan memadatkannya akan
 * menggerus target sentuh sekaligus keterbacaan di bawah lampu toko.
 *
 * Preferensi yang sudah tersimpan SELALU menang. Nilai yang dipilih di sini
 * ikut disimpan supaya keputusannya terjadi sekali per perangkat, bukan
 * lonjakan ukuran di tiap kali app dibuka.
 *
 * Sesi zoom sementara juga menang: demo publik menyematkan 100% sebelum shell
 * mount supaya presentasinya sama untuk semua orang, dan default perangkat
 * tidak boleh menimpanya.
 */
export function applyDeviceDensityDefault() {
  if (typeof window === 'undefined') return;
  if (transientZoomBefore !== null) return;
  if (isZoom(Number(window.localStorage.getItem(STORAGE_KEY)))) return;
  useZoomStore.getState().setZoom(deviceDensityZoom());
}

/**
 * Kerapatan yang pantas untuk kelas perangkat ini, tanpa menyentuh preferensi
 * tersimpan. Dipakai app shell lewat {@link applyDeviceDensityDefault} dan
 * oleh demo publik, yang menyematkannya sebagai zoom sementara — demo harus
 * memperlihatkan tampilan aplikasi yang SEBENARNYA di perangkat pengunjung.
 */
export function deviceDensityZoom(): Zoom {
  if (typeof window === 'undefined') return 1;
  return window.matchMedia?.('(pointer: fine)').matches ? 0.8 : 1;
}
