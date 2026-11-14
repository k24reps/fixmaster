import { repository } from '@/data';
import { fetchServiceReceivables, fetchCategoryProfit } from '@/data/supabase-client';
import {
  agingFromRows,
  receivablesAging,
  profitByDeviceCategory,
  cancelDate,
  completionDate,
  awaitingPickup,
  type Receivable,
  type CategoryProfit,
  type PickupWait,
} from '@/lib/business/reports';
import { visibleServices } from '@/lib/business/services';
import type { Service } from '@/data/types';
import { addDays, localDayStartISO, isInRange } from '@/lib/time';
import { useSessionStore } from '@/stores/session';
import { isCloudMode } from '@/stores/demo';
import { useDerivedQuery } from './useCollection';

const NO_RECEIVABLES: Receivable[] = [];
const NO_CATEGORIES: CategoryProfit[] = [];
const NO_SERVICES: Service[] = [];
const NO_PICKUPS: PickupWait[] = [];
/** Batas tiket belum tuntas yang diambil untuk "menunggu diambil" (Dashboard: 60). */
const OPEN_LIMIT = 500;

/**
 * Piutang servis: keadaan SEKARANG, bukan besaran periode. Dulu dihitung dari
 * tiket yang dibuat pada periode yang sedang dilihat, sehingga tiket tiga bulan
 * lalu yang belum lunas — justru yang paling perlu ditagih — tidak pernah
 * muncul. Cloud menghitungnya dari seluruh tabel lewat RPC (0074).
 */
export function useReceivables() {
  const orgId = useSessionStore((s) => s.org?.id ?? null);
  const outletId = useSessionStore((s) => s.activeOutletId);

  return useDerivedQuery(
    ['collection', 'services', outletId, 'receivables'],
    async () => {
      if (isCloudMode() && orgId) {
        return agingFromRows(await fetchServiceReceivables({ orgId, outletId }));
      }
      return receivablesAging(await repository.list('services'));
    },
    NO_RECEIVABLES,
  );
}

/**
 * Laba per kategori perangkat menurut tanggal SELESAI — definisi periode yang
 * sama dengan Performa Teknisi (0063). Sebelumnya kartu ini memakai tanggal
 * tiket MASUK, jadi dua kartu bertetangga menjawab pertanyaan berbeda dengan
 * label periode yang sama.
 */
export function useCategoryProfit(from: string, to: string) {
  const orgId = useSessionStore((s) => s.org?.id ?? null);
  const outletId = useSessionStore((s) => s.activeOutletId);

  return useDerivedQuery(
    ['collection', 'services', outletId, 'categoryProfit', from, to],
    async () => {
      const start = localDayStartISO(from);
      const end = localDayStartISO(addDays(to, 1));
      if (isCloudMode() && orgId) {
        return fetchCategoryProfit({ orgId, from: start, to: end, outletId });
      }
      const services = await repository.list('services');
      // Lokal/demo: himpunan yang sama, disaring dengan aturan yang sama.
      const done = services.filter((s) => {
        const at = s.status === 'batal' ? cancelDate(s) : completionDate(s);
        return at !== null && isInRange(at, from, to);
      });
      return profitByDeviceCategory(done);
    },
    NO_CATEGORIES,
  );
}

/**
 * Tiket yang SELESAI dalam periode (tanggal lokal `completedAt`, atau riwayat
 * di adapter lokal) — himpunan yang sama dengan Laba per Kategori. Dipakai
 * kartu Mutu Servis dan Performa Teknisi, yang butuh part tiap tiket untuk
 * menghitung laba. Cloud memfilter di server lewat kolom `completed_at`
 * (0080), jadi tidak terpotong batas 1000 baris daftar servis.
 */
export function useCompletedServices(from: string, to: string) {
  const outletId = useSessionStore((s) => s.activeOutletId);

  return useDerivedQuery(
    ['collection', 'services', outletId, 'completedRange', from, to],
    async () => {
      const inRange = (s: Service) => {
        const at = completionDate(s);
        return at !== null && isInRange(at, from, to);
      };
      if (isCloudMode()) {
        const rows = await repository.listByDateRange(
          'services',
          'completedAt',
          localDayStartISO(from),
          localDayStartISO(addDays(to, 1)),
        );
        return rows.filter(inRange);
      }
      // Lokal/demo: baris lama tak membawa completedAt; completionDate membaca riwayat.
      return (await repository.list('services')).filter(inRange);
    },
    NO_SERVICES,
  );
}

/**
 * Unit yang sudah selesai atau batal tapi belum diambil: keadaan SEKARANG,
 * berapa pun umur tiketnya — seperti piutang, yang paling tua justru yang
 * paling perlu dihubungi. Cloud memakai kueri tiket belum tuntas yang sama
 * dengan Dashboard (`openOnly`), bukan daftar 1000 tiket terbaru.
 */
export function useAwaitingPickup() {
  const outletId = useSessionStore((s) => s.activeOutletId);

  return useDerivedQuery(
    ['collection', 'services', outletId, 'awaitingPickup'],
    async () => {
      const rows = repository.queryServices
        ? await repository.queryServices({ openOnly: true, visibleOnly: true, limit: OPEN_LIMIT })
        : visibleServices(await repository.list('services'));
      return awaitingPickup(rows);
    },
    NO_PICKUPS,
  );
}

