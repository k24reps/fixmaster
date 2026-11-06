import { create } from 'zustand';

/**
 * Tampilan aplikasi: dua kenop terpisah, bukan zoom browser.
 *
 * - **Pembesaran** (`zoom`): properti CSS `zoom` di :root. Kenop aksesibilitas,
 *   default 100% di SEMUA perangkat. Di bawah 100% teks menembus Lantai 12px
 *   (DESIGN.md), jadi itu hanya terjadi atas pilihan pengguna dan UI
 *   menandainya.
 * - **Kerapatan** (`density`): atribut `data-density` di :root yang mengganti
 *   token jarak dan tinggi (tokens.css). Ukuran teks tidak disentuh, jadi Padat
 *   tidak pernah menembus lantai. Token Padat hanya aktif di `pointer: fine`:
 *   di layar sentuh target 44px adalah kontrak.
 *
 * Sampai 6 Nov 2026 keduanya satu kenop: perangkat bermouse otomatis disimpan
 * di 0.8, sehingga label 9,6px tepat di meja konter yang mau dilindungi lantai
 * itu. Lihat "Zoom jadi dua kenop" di Decisions & Bug Fixes.
 *
 * Mekanisme pembesaran memakai `zoom`, BUKAN `transform: scale()`. `zoom`
 * memicu reflow sungguhan sehingga teks tetap tajam dan layout memakai ruang
 * yang tersedia; `scale()` hanya melar-kecilkan hasil render (teks buram,
 * scrollbar salah, hit-area geser).
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
 * Lihat ServicesPage.module.css untuk contoh breakpoint yang memerlukan itu.
 */

export const ZOOM_LEVELS = [0.9, 1, 1.1, 1.25, 1.5] as const;
export type Zoom = (typeof ZOOM_LEVELS)[number];

export const DENSITIES = ['lapang', 'padat'] as const;
export type Density = (typeof DENSITIES)[number];

/**
 * Mulai level ini sidebar menciut ke rail. Media query tidak melihat zoom, jadi
 * di 150% pada layar 1366 sidebar lebar memakan 31% layar. AppLayout yang
 * menciutkannya, bukan CSS.
 */
export const RAIL_ZOOM = 1.25;

const ZOOM_KEY = 'fixmaster-zoom';
const DENSITY_KEY = 'fixmaster-density';
const DEFAULT_ZOOM: Zoom = 1;
const DEFAULT_DENSITY: Density = 'lapang';

function isZoom(v: number): v is Zoom {
  return (ZOOM_LEVELS as readonly number[]).includes(v);
}

function isDensity(v: unknown): v is Density {
  return (DENSITIES as readonly unknown[]).includes(v);
}

/** Di bawah 100% teks informasi jatuh di bawah 12px. */
export function isBelowTextFloor(zoom: number): boolean {
  return zoom < 1;
}

/**
 * Nilai 0.8 tersimpan hampir selalu tebakan otomatis versi lama, bukan pilihan,
 * tapi pemiliknya sudah terbiasa rapat. Padanan terdekat yang tidak menembus
 * lantai teks: 100% + Padat. Idempoten — kunci 0.8 dihapus setelah dipindah.
 */
function migrateLegacyZoom() {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(ZOOM_KEY) !== '0.8') return;
  window.localStorage.removeItem(ZOOM_KEY);
  if (!isDensity(window.localStorage.getItem(DENSITY_KEY))) {
    window.localStorage.setItem(DENSITY_KEY, 'padat');
  }
}

function readZoom(): Zoom {
  if (typeof window === 'undefined') return DEFAULT_ZOOM;
  migrateLegacyZoom();
  const raw = Number(window.localStorage.getItem(ZOOM_KEY));
  // Nilai asing (versi lama / localStorage yang diutak-atik) jatuh ke 100%
  // ketimbang memasang zoom liar yang bikin aplikasi tak terpakai.
  return isZoom(raw) ? raw : DEFAULT_ZOOM;
}

function readDensity(): Density {
  if (typeof window === 'undefined') return DEFAULT_DENSITY;
  migrateLegacyZoom();
  const raw = window.localStorage.getItem(DENSITY_KEY);
  return isDensity(raw) ? raw : DEFAULT_DENSITY;
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

function applyDensity(density: Density) {
  if (typeof document === 'undefined') return;
  if (density === DEFAULT_DENSITY) delete document.documentElement.dataset.density;
  else document.documentElement.dataset.density = density;
}

/**
 * Hanya pilihan yang menyimpang dari default yang ditulis. Kembali ke standar
 * menghapus kuncinya, supaya perubahan default kelak sampai ke perangkat ini.
 */
function persist(key: string, value: string, isDefault: boolean) {
  if (isDefault) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
}

interface ZoomState {
  zoom: Zoom;
  density: Density;
  setZoom: (zoom: Zoom) => void;
  /** Geser satu tingkat; berhenti di ujung (tidak memutar balik). */
  stepZoom: (dir: 1 | -1) => void;
  resetZoom: () => void;
  setDensity: (density: Density) => void;
  /**
   * Sesi tampilan sementara (demo publik, landing): menyematkan default —
   * 100% dan Lapang — supaya pengunjung melihat produk persis seperti pengguna
   * baru. Kontrol tetap bekerja selama sesi tetapi tidak menimpa preferensi
   * tersimpan. Panggil fungsi cleanup untuk memulihkan tampilan sebelumnya.
   */
  beginTransientView: () => () => void;
}

let transientBefore: { zoom: Zoom; density: Density } | null = null;

export const useZoomStore = create<ZoomState>((set, get) => ({
  zoom: readZoom(),
  density: readDensity(),
  setZoom: (zoom) => {
    applyZoom(zoom);
    if (transientBefore === null) persist(ZOOM_KEY, String(zoom), zoom === DEFAULT_ZOOM);
    set({ zoom });
  },
  stepZoom: (dir) => {
    const i = ZOOM_LEVELS.indexOf(get().zoom);
    const next = ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, i + dir))];
    if (next !== get().zoom) get().setZoom(next);
  },
  resetZoom: () => {
    if (get().zoom !== DEFAULT_ZOOM) get().setZoom(DEFAULT_ZOOM);
  },
  setDensity: (density) => {
    applyDensity(density);
    if (transientBefore === null)
      persist(DENSITY_KEY, density, density === DEFAULT_DENSITY);
    set({ density });
  },
  beginTransientView: () => {
    // Satu shell per document. Guard ini menjaga cleanup idempoten tanpa
    // membuat sesi bertumpuk yang sulit dipulihkan.
    if (transientBefore !== null) return () => undefined;
    transientBefore = { zoom: get().zoom, density: get().density };
    applyZoom(DEFAULT_ZOOM);
    applyDensity(DEFAULT_DENSITY);
    set({ zoom: DEFAULT_ZOOM, density: DEFAULT_DENSITY });

    let active = true;
    return () => {
      if (!active || transientBefore === null) return;
      active = false;
      const previous = transientBefore;
      transientBefore = null;
      applyZoom(previous.zoom);
      applyDensity(previous.density);
      set(previous);
    };
  },
}));

/** Pasang tampilan tersimpan sebelum React render, supaya tak ada lonjakan ukuran. */
export function initZoom() {
  applyZoom(readZoom());
  applyDensity(readDensity());
}

/**
 * Pintasan pembesaran: Ctrl+Alt (Cmd+Option di Mac) + = / − / 0. Ctrl+= polos
 * sengaja tidak direbut — itu zoom browser, alat yang diandalkan pengguna
 * low-vision. Alt+Shift juga dihindari: di Windows itu pengganti bahasa input.
 * Mengembalikan arah langkah, 0 untuk reset, atau null bila bukan pintasan.
 */
export function zoomShortcut(
  e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'code'>,
): 1 | -1 | 0 | null {
  if (!e.altKey || !(e.ctrlKey || e.metaKey)) return null;
  switch (e.code) {
    case 'Equal':
    case 'NumpadAdd':
      return 1;
    case 'Minus':
    case 'NumpadSubtract':
      return -1;
    case 'Digit0':
    case 'Numpad0':
      return 0;
    default:
      return null;
  }
}
