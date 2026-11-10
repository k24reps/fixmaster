import type { ServiceStatus } from '@/data/types';
import { SERVICE_SORTS, type DateFilter, type PaymentFilter, type ServiceSort } from './serviceFilters';
import { STATUS_LABELS } from './services';

/**
 * Konteks Daftar Servis: apa yang sedang dicari/disaring, dan sejauh mana
 * digulir. Membuka tiket lalu kembali ke daftar dulu mengembalikan kotak cari
 * kosong dan daftar di puncak — padahal tiket dibuka justru di tengah
 * pekerjaan ("cari Andi, buka tiketnya, cek, balik"). Modul ini murni; sesi
 * penyimpanannya ada di `features/services/listMemory.ts`.
 */
/**
 * Baris yang dirender sekaligus. Sebelumnya halaman ini menggambar SELURUH
 * tiket sejak toko berdiri — untuk bengkel yang sudah lama jalan itu ribuan
 * baris, dan browser-nya tersendat. Pola tombol "Tampilkan lebih banyak" sama
 * dengan Keuangan (FinancePage); potongannya 50, bukan 100, karena satu tiket
 * servis jauh lebih padat daripada satu baris transaksi.
 */
export const LIST_PAGE_SIZE = 50;

/**
 * Batas waras untuk `limit` yang dibaca dari penyimpanan, bukan batas fitur:
 * sama dengan max_rows PostgREST, jadi satu hasil arsip tak pernah lebih
 * panjang. Nilai rusak yang besar tak boleh membuat daftar merender ribuan baris.
 */
export const MAX_LIST_LIMIT = 1000;

export interface ServiceListView {
  /** Berapa baris yang sudah "ditampilkan lebih banyak"; kelipatan LIST_PAGE_SIZE. */
  limit: number;
  query: string;
  status: ServiceStatus | 'all';
  category: string;
  pickup: 'all' | 'awaiting';
  tech: string;
  payment: PaymentFilter;
  date: DateFilter;
  from: string;
  to: string;
  stalledOnly: boolean;
  sort: ServiceSort;
  hideClosed: boolean;
}

export const EMPTY_LIST_VIEW: ServiceListView = {
  limit: LIST_PAGE_SIZE,
  query: '',
  status: 'all',
  category: 'all',
  pickup: 'all',
  tech: 'all',
  payment: 'all',
  date: 'all',
  from: '',
  to: '',
  stalledOnly: false,
  sort: 'newest',
  hideClosed: false,
};

export interface ServiceListSnapshot {
  /** Outlet + pengguna: filter teknisi milik satu orang tak boleh bocor ke orang lain. */
  owner: string;
  /** `location.key` entri riwayat tempat daftar ini dipasang. */
  entryKey: string;
  savedAt: number;
  scrollTop: number;
  view: ServiceListView;
}

/**
 * Seberapa lama ingatan daftar dipercaya. Interupsi di meja servis hitungan
 * menit; "Andi" yang dicari kemarin sore bukan konteks, melainkan jebakan
 * ("tiket saya hilang?").
 */
export const LIST_MEMORY_MS = 30 * 60_000;

/** Parameter URL yang berarti "buka daftar dengan saringan ini" (tautan Dashboard). */
const FILTER_PARAMS = ['status', 'pickup', 'tech', 'date', 'open'] as const;

const STATUSES = Object.keys(STATUS_LABELS) as ServiceStatus[];
const PAYMENTS: PaymentFilter[] = ['all', 'unpaid', 'dp'];
const DATES: DateFilter[] = ['all', 'last7', 'thisMonth', 'custom'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_QUERY = 200;

/**
 * Tampilan yang diminta tautan (`?status=`, `?pickup=awaiting`, `?tech=me`,
 * `?date=month`, `?open=1`), atau null bila URL tak membawa saringan. `?new=1`
 * sengaja bukan saringan: ia hanya membuka modal Servis Baru.
 */
export function viewFromParams(params: URLSearchParams): ServiceListView | null {
  if (!FILTER_PARAMS.some((k) => params.has(k))) return null;
  const status = params.get('status');
  return {
    ...EMPTY_LIST_VIEW,
    status: STATUSES.includes(status as ServiceStatus) ? (status as ServiceStatus) : 'all',
    pickup: params.get('pickup') === 'awaiting' ? 'awaiting' : 'all',
    tech: params.get('tech') === 'me' ? 'me' : 'all',
    date: params.get('date') === 'month' ? 'thisMonth' : 'all',
    hideClosed: params.get('open') === '1',
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

const str = (v: unknown, fallback: string, max = 120) =>
  typeof v === 'string' ? v.slice(0, max) : fallback;

/** Ingatan lama (sebelum `limit` dicatat) dan nilai rusak jatuh ke satu halaman. */
const limitOf = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(MAX_LIST_LIMIT, Math.max(LIST_PAGE_SIZE, Math.round(v)))
    : LIST_PAGE_SIZE;

/**
 * Baca ingatan dari teks tersimpan. Setiap kolom dipaksa ke nilai sah, jadi
 * nilai rusak/usang (status yang sudah dihapus, JSON terpotong) jatuh ke
 * bawaan — tidak pernah melempar dan tak pernah menyaring daftar jadi kosong.
 */
export function parseListSnapshot(raw: string | null): ServiceListSnapshot | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || !isRecord(data.view)) return null;
  if (typeof data.owner !== 'string' || typeof data.entryKey !== 'string') return null;
  if (typeof data.savedAt !== 'number' || !Number.isFinite(data.savedAt)) return null;
  const v = data.view;
  const scroll = typeof data.scrollTop === 'number' && Number.isFinite(data.scrollTop) ? data.scrollTop : 0;
  return {
    owner: data.owner,
    entryKey: data.entryKey,
    savedAt: data.savedAt,
    scrollTop: Math.max(0, scroll),
    view: {
      limit: limitOf(v.limit),
      query: str(v.query, '', MAX_QUERY),
      status: pick<ServiceStatus | 'all'>(v.status, ['all', ...STATUSES], 'all'),
      category: str(v.category, 'all'),
      pickup: pick(v.pickup, ['all', 'awaiting'], 'all'),
      tech: str(v.tech, 'all'),
      payment: pick(v.payment, PAYMENTS, 'all'),
      date: pick(v.date, DATES, 'all'),
      from: typeof v.from === 'string' && DAY.test(v.from) ? v.from : '',
      to: typeof v.to === 'string' && DAY.test(v.to) ? v.to : '',
      stalledOnly: v.stalledOnly === true,
      // Nilai lama ('newest'/'oldest') tetap sah; nilai asing/usang jatuh ke Terbaru.
      sort: pick(v.sort, SERVICE_SORTS, 'newest'),
      hideClosed: v.hideClosed === true,
    },
  };
}

/**
 * Tampilan awal daftar saat dipasang. Urutan keputusan:
 * 1. Tautan membawa saringan (Dashboard) pada entri riwayat BARU → saringan
 *    itu menang, tanpa gulir: tombol "Tiket saya" harus selalu membuka itu.
 * 2. Ada ingatan segar milik pengguna yang sama → pulihkan (kotak cari,
 *    saringan, urutan, gulir). Ini juga berlaku untuk tombol Kembali peramban
 *    ke entri berparameter yang sama (`entryKey` sama), sehingga "Dashboard →
 *    Tiket saya → buka tiket → Kembali" tidak membuang apa yang diketik.
 * 3. Selain itu → bersih.
 */
export function resolveListView(o: {
  snapshot: ServiceListSnapshot | null;
  owner: string;
  entryKey: string;
  params: URLSearchParams;
  now: number;
}): { view: ServiceListView; scrollTop: number } {
  const fromUrl = viewFromParams(o.params);
  const mine =
    o.snapshot && o.snapshot.owner === o.owner && o.now - o.snapshot.savedAt <= LIST_MEMORY_MS
      ? o.snapshot
      : null;
  if (fromUrl && mine?.entryKey !== o.entryKey) return { view: fromUrl, scrollTop: 0 };
  if (mine) return { view: mine.view, scrollTop: mine.scrollTop };
  return { view: EMPTY_LIST_VIEW, scrollTop: 0 };
}

export type ScrollRestoreStep = 'wait' | 'restore' | 'skip';

/**
 * Kapan posisi gulir boleh dipulihkan. Gulir yang ditulis ke halaman yang masih
 * pendek tersangkut di ujung bawahnya dan tak pernah naik lagi, jadi baris yang
 * dulu mengisi halaman harus sudah ada: jendela dimuat DAN arsip yang diminta
 * pencarian/rentang tanggal sudah tiba (di daftar cloud, baris dari arsip bisa
 * jauh lebih banyak daripada yang ada di jendela). Banyaknya baris yang dirender
 * ikut `limit` yang dipulihkan, jadi tak perlu ditunggu terpisah.
 *
 * - `wait`: belum waktunya.
 * - `restore`: tulis posisi sekarang.
 * - `skip`: semuanya sudah termuat tapi daftarnya kosong; tak ada yang bisa
 *   digulir, dan posisi lama tak boleh meloncat saat pengguna mengganti saringan
 *   dan baris baru muncul.
 */
export function scrollRestoreStep(o: {
  loading: boolean;
  archivePending: boolean;
  rowCount: number;
}): ScrollRestoreStep {
  if (o.loading || o.archivePending) return 'wait';
  return o.rowCount > 0 ? 'restore' : 'skip';
}
