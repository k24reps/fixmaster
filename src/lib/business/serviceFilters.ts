import type { Service } from '@/data/types';
import { addDays, daysBetween, localDateOf } from '@/lib/time';
import { AWAITING_PICKUP_STATUSES } from './services';

// "Lunas" sengaja tidak ada: chip status Lunas sudah menyaring hal yang sama.
export type PaymentFilter = 'all' | 'unpaid' | 'dp';
export type DateFilter = 'all' | 'last7' | 'thisMonth' | 'custom';
export type ServiceSort = 'newest' | 'oldest';

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
  return ['service_no', 'customer_name', 'customer_phone', 'device', 'complaint']
    .map((column) => `${column}.ilike."%${clean}%"`)
    .join(',');
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
 * Urutan daftar. Tiket tuntas TIDAK dipaksa ke dasar: ia sudah tersembunyi
 * secara default, jadi saat sengaja ditampilkan ia ikut urutan yang dipilih —
 * "Terbaru" berarti murni menurut tanggal masuk, tuntas maupun belum.
 */
export function compareServices(
  a: Pick<Service, 'createdAt'>,
  b: Pick<Service, 'createdAt'>,
  sort: ServiceSort,
): number {
  if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
  return b.createdAt.localeCompare(a.createdAt);
}
