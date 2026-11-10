import type { Service, ServiceStatus } from '@/data/types';
import { addDays, daysBetween, localDateOf } from '@/lib/time';
import { AWAITING_PICKUP_STATUSES } from './services';
import type { TranslationKey } from '@/i18n';

// "Lunas" sengaja tidak ada: chip status Lunas sudah menyaring hal yang sama.
export type PaymentFilter = 'all' | 'unpaid' | 'dp';
export type DateFilter = 'all' | 'last7' | 'thisMonth' | 'custom';
/**
 * Satu nilai datar per (kolom, arah), bukan {kolom, arah}: ia dipakai apa adanya
 * oleh dropdown, ingatan daftar (sessionStorage), dan judul kolom. 'newest' dan
 * 'oldest' tetap bernama lama supaya ingatan yang sudah tersimpan tetap sah.
 */
export type ServiceSort =
  | 'newest'
  | 'oldest'
  | 'customerAsc'
  | 'customerDesc'
  | 'statusAsc'
  | 'statusDesc'
  | 'costAsc'
  | 'costDesc';

/** Kolom Daftar yang bisa diurutkan lewat judulnya. 'date' = judul "No. Servis" (tanggal masuk). */
export type ServiceSortColumn = 'date' | 'customer' | 'status' | 'cost';

/** Semua nilai sah, urut seperti di dropdown. Sumber tunggal bagi koersi ingatan daftar. */
export const SERVICE_SORTS: readonly ServiceSort[] = [
  'newest',
  'oldest',
  'customerAsc',
  'customerDesc',
  'statusAsc',
  'statusDesc',
  'costAsc',
  'costDesc',
];

/** Kunci teks tiap urutan, untuk dropdown dan pembaca layar. */
export const SORT_LABEL_KEY: Record<ServiceSort, TranslationKey> = {
  newest: 'services.sortNewest',
  oldest: 'services.sortOldest',
  customerAsc: 'services.sortCustomerAsc',
  customerDesc: 'services.sortCustomerDesc',
  statusAsc: 'services.sortStatusAsc',
  statusDesc: 'services.sortStatusDesc',
  costAsc: 'services.sortCostAsc',
  costDesc: 'services.sortCostDesc',
};

/** [klik pertama, klik kedua] tiap kolom. */
const COLUMN_SORTS: Record<ServiceSortColumn, readonly [ServiceSort, ServiceSort]> = {
  date: ['newest', 'oldest'],
  customer: ['customerAsc', 'customerDesc'],
  status: ['statusAsc', 'statusDesc'],
  cost: ['costAsc', 'costDesc'],
};

/**
 * Urutan berikutnya saat judul kolom diklik. Kolom lain → urutan pertamanya;
 * pertama → kedua; kedua → kembali ke 'newest' (bawaan), kecuali tanggal yang
 * memang hanya dua keadaan (Terbaru ⇄ Terlama) dan tak punya "tanpa urutan".
 */
export function nextSort(current: ServiceSort, column: ServiceSortColumn): ServiceSort {
  const [first, second] = COLUMN_SORTS[column];
  if (current === first) return second;
  if (current === second) return column === 'date' ? first : 'newest';
  return first;
}

/** Arah urutan pada kolom itu, bagi penanda di judul. 'none' = urutan sekarang bukan milik kolom ini. */
export function sortDirectionOn(
  current: ServiceSort,
  column: ServiceSortColumn,
): 'ascending' | 'descending' | 'none' {
  const [first, second] = COLUMN_SORTS[column];
  if (current !== first && current !== second) return 'none';
  // Tanggal: Terbaru = menurun (tanggal terbesar di atas). Kolom lain: klik pertama = menaik.
  const ascendingFirst = column !== 'date';
  return (current === first) === ascendingFirst ? 'ascending' : 'descending';
}

/**
 * Urutan alur kerja, dari unit baru masuk sampai tutup buku. Batal di dasar:
 * ia bukan tahap yang dilalui, melainkan jalan keluar. Tes memastikan tak ada
 * status yang terlewat bila yang baru ditambahkan.
 */
export const STATUS_FLOW: readonly ServiceStatus[] = [
  'diterima',
  'diagnosa',
  'konfirmasi',
  'tunggu',
  'pengerjaan',
  'selesai',
  'lunas',
  'batal',
];

type Person = { id: string; name: string };

const digitsOf = (v: string) => v.replace(/\D/g, '');

/**
 * Cari no. servis, pelanggan, perangkat, keluhan, dan nomor HP. Pelanggan yang
 * menelepon menyebut nomornya ("0812-3456…"), jadi nomor dicocokkan tanpa tanda
 * baca — tapi hanya bila kuerinya memang terlihat seperti nomor, supaya "FM-0001"
 * tidak ikut mencocokkan HP yang kebetulan mengandung 0001.
 */
export function matchesQuery(
  s: Pick<Service, 'serviceNo' | 'customerName' | 'device' | 'complaint' | 'customerPhone'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const looksLikePhone = /^[\d\s+().-]+$/.test(q) && digitsOf(q).length >= 3;
  return (
    s.serviceNo.toLowerCase().includes(q) ||
    s.customerName.toLowerCase().includes(q) ||
    s.device.toLowerCase().includes(q) ||
    (s.complaint ?? '').toLowerCase().includes(q) ||
    (looksLikePhone && digitsOf(s.customerPhone ?? '').includes(digitsOf(q)))
  );
}

/**
 * Filter `or(...)` PostgREST untuk mencari tiket di server, dipakai menu Servis
 * saat daftarnya terpotong. Karakter sintaks filter dibuang supaya kata kunci
 * tidak bisa menyisipkan filter lain. null bila kata kuncinya kosong.
 */
export function serviceSearchFilter(term: string): string | null {
  const clean = term.replace(/[,()*%"\\]/g, ' ').trim();
  if (!clean) return null;
  const filters = ['service_no', 'customer_name', 'customer_phone', 'device', 'complaint'].map(
    (column) => `${column}.ilike."%${clean}%"`,
  );
  // Nomor HP tersimpan dengan pemisah apa saja ("0812-3456", "0812 3456"):
  // cocokkan digitnya berurutan. Bisa kelebihan cocok — hasilnya tetap disaring
  // matchesQuery di klien, yang membandingkan digit secara utuh.
  const digits = term.replace(/\D/g, '');
  if (/^[\d\s+().-]+$/.test(term.trim()) && digits.length >= 3) {
    filters.push(`customer_phone.ilike."%${digits.split('').join('%')}%"`);
  }
  return filters.join(',');
}

/**
 * `filter`: 'all' | 'me' | 'none' | id karyawan. Tiket lama (dan data contoh)
 * kadang hanya menyimpan nama teknisi tanpa id, jadi nama jadi cadangan.
 */
export function matchesTechnician(
  s: Pick<Service, 'technicianId' | 'technicianName'>,
  filter: string,
  people: Person[],
  me: Person | null | undefined,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return !s.technicianId && !(s.technicianName ?? '').trim();
  const person = filter === 'me' ? me : people.find((p) => p.id === filter);
  if (!person) return false;
  return s.technicianId ? s.technicianId === person.id : s.technicianName === person.name;
}

/** Belum lunas = belum lunas dan tidak batal; sudah DP = ada DP tapi belum lunas. */
export function matchesPayment(s: Pick<Service, 'status' | 'downPayment'>, filter: PaymentFilter): boolean {
  if (filter === 'all') return true;
  if (s.status === 'lunas' || s.status === 'batal') return false;
  return filter === 'unpaid' || s.downPayment > 0;
}

/** Rentang tanggal masuk (inklusif) untuk tiap pilihan; null = tanpa batas. */
export function createdRange(
  filter: DateFilter,
  today: string,
  custom: { from: string; to: string },
): { from: string; to: string } | null {
  if (filter === 'last7') return { from: addDays(today, -6), to: today };
  if (filter === 'thisMonth') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (filter === 'custom' && custom.from && custom.to) {
    return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
  }
  return null;
}

/** Hari tanpa aktivitas sebelum tiket dianggap tertahan. */
export const STALL_DAYS = { konfirmasi: 2, progress: 3, pickup: 7 } as const;

const IN_PROGRESS: Service['status'][] = ['diterima', 'diagnosa', 'tunggu', 'pengerjaan'];

/**
 * Berapa hari tiket tertahan, atau null. Daftar servis tidak memuat riwayat,
 * jadi yang diukur adalah aktivitas TERAKHIR (`updatedAt`), bukan lamanya di
 * status sekarang — karena itu labelnya "tanpa aktivitas", bukan klaim durasi.
 */
export function stalledDays(
  s: Pick<Service, 'status' | 'pickedUp' | 'updatedAt'>,
  today: string,
): number | null {
  const idle = Math.abs(daysBetween(localDateOf(s.updatedAt), today));
  if (s.status === 'konfirmasi') return idle >= STALL_DAYS.konfirmasi ? idle : null;
  if (IN_PROGRESS.includes(s.status)) return idle >= STALL_DAYS.progress ? idle : null;
  if (!s.pickedUp && AWAITING_PICKUP_STATUSES.includes(s.status)) {
    return idle >= STALL_DAYS.pickup ? idle : null;
  }
  return null;
}

/**
 * Nominal yang tampil di kolom Biaya: biaya final, atau estimasi selama biaya
 * final belum ditetapkan (aturan yang sama dengan `renderCost` di Daftar). 0 =
 * kolomnya kosong.
 */
export function listedCost(s: Pick<Service, 'finalCost' | 'estimateCost'>): number {
  if (s.finalCost > 0) return s.finalCost;
  return s.estimateCost > 0 ? s.estimateCost : 0;
}

type SortFields = Pick<Service, 'createdAt' | 'customerName' | 'status' | 'finalCost' | 'estimateCost'>;

const flowRank = (status: ServiceStatus): number => {
  const i = STATUS_FLOW.indexOf(status);
  return i === -1 ? STATUS_FLOW.length : i;
};

/**
 * Urutan daftar. Tiket tuntas TIDAK dipaksa ke dasar: ia sudah tersembunyi
 * secara default, jadi saat sengaja ditampilkan ia ikut urutan yang dipilih —
 * "Terbaru" berarti murni menurut tanggal masuk, tuntas maupun belum.
 *
 * Kolom lain: seri selalu jatuh ke Terbaru, sehingga urutannya tetap sama tiap
 * render (Array.sort stabil, tapi seri antar sumber data tak boleh bergantung
 * pada urutan muatnya). Nilai KOSONG (nama pelanggan kosong, biaya 0) selalu di
 * dasar, apa pun arahnya: "tanpa biaya" bukan yang termurah dan nama kosong
 * bukan "A", jadi membalik arah tak menaikkan baris kosong ke puncak.
 */
export function compareServices(a: SortFields, b: SortFields, sort: ServiceSort): number {
  const newestFirst = b.createdAt.localeCompare(a.createdAt);
  switch (sort) {
    case 'oldest':
      return a.createdAt.localeCompare(b.createdAt);
    case 'customerAsc':
    case 'customerDesc': {
      const an = a.customerName.trim();
      const bn = b.customerName.trim();
      if (!an !== !bn) return an ? -1 : 1;
      const order = an.localeCompare(bn, 'id', { sensitivity: 'base', numeric: true });
      return (sort === 'customerAsc' ? order : -order) || newestFirst;
    }
    case 'statusAsc':
    case 'statusDesc': {
      const order = flowRank(a.status) - flowRank(b.status);
      return (sort === 'statusAsc' ? order : -order) || newestFirst;
    }
    case 'costAsc':
    case 'costDesc': {
      const ac = listedCost(a);
      const bc = listedCost(b);
      if (!ac !== !bc) return ac ? -1 : 1;
      const order = ac - bc;
      return (sort === 'costAsc' ? order : -order) || newestFirst;
    }
    default:
      return newestFirst;
  }
}
