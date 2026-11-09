import {
  parseListSnapshot,
  type ServiceListSnapshot,
  type ServiceListView,
} from '@/lib/business/serviceListView';

/**
 * Ingatan Daftar Servis per tab (sessionStorage): hidup selama tab terbuka,
 * hilang saat ditutup, dan tak pernah terbawa ke perangkat lain. Semua akses
 * dibungkus try/catch — mode privat atau kuota penuh hanya berarti daftar
 * tidak mengingat, bukan halaman yang rusak.
 */
const KEY = 'fm.services.listView.v1';

// Salinan di memori: tulis sering (tiap ketikan, tiap gulir) tanpa membaca
// ulang JSON, dan tetap jalan bila sessionStorage tak tersedia.
let live: ServiceListSnapshot | null | undefined;

export function readListSnapshot(): ServiceListSnapshot | null {
  if (live !== undefined) return live;
  try {
    live = parseListSnapshot(sessionStorage.getItem(KEY));
  } catch {
    live = null;
  }
  return live;
}

function persist() {
  try {
    if (live) sessionStorage.setItem(KEY, JSON.stringify(live));
  } catch {
    /* kuota/izin: ingatan tetap di memori sampai tab dimuat ulang */
  }
}

/**
 * Catat saringan terkini. Gulir ikut terbawa hanya bila entri riwayatnya sama;
 * entri baru dimulai dari puncak, sesuai kenyataan di layar.
 */
export function saveListView(owner: string, entryKey: string, view: ServiceListView) {
  const prev = readListSnapshot();
  const same = prev?.owner === owner && prev.entryKey === entryKey;
  live = { owner, entryKey, savedAt: Date.now(), scrollTop: same ? prev.scrollTop : 0, view };
  persist();
}

export function saveListScroll(top: number) {
  const prev = readListSnapshot();
  if (!prev) return;
  live = { ...prev, savedAt: Date.now(), scrollTop: Math.max(0, Math.round(top)) };
  persist();
}

/**
 * Wadah gulir isi halaman. Aplikasi menggulir dokumennya; demo menjalankan
 * aplikasi nyata di dalam wadahnya sendiri (lihat AppLayout, yang mereset
 * keduanya tiap rute) — jadi cari leluhur `#konten` yang benar-benar menggulir.
 */
export function findScroller(): HTMLElement | null {
  let el = document.getElementById('konten')?.parentElement ?? null;
  while (el) {
    const overflowY = getComputedStyle(el).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return null;
}

export const readScroll = () => (findScroller()?.scrollTop ?? window.scrollY);

export function writeScroll(top: number) {
  const scroller = findScroller();
  if (scroller) scroller.scrollTop = top;
  else window.scrollTo({ top, behavior: 'auto' });
}
