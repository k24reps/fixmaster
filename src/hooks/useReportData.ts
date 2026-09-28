import { repository } from '@/data';
import { fetchServiceReceivables, fetchCategoryProfit } from '@/data/supabase-client';
import {
  agingFromRows,
  receivablesAging,
  profitByDeviceCategory,
  cancelDate,
  completionDate,
  type Receivable,
  type CategoryProfit,
} from '@/lib/business/reports';
import { addDays, localDayStartISO, isInRange } from '@/lib/time';
import { useSessionStore } from '@/stores/session';
import { isCloudMode } from '@/stores/demo';
import { useDerivedQuery } from './useCollection';

const NO_RECEIVABLES: Receivable[] = [];
const NO_CATEGORIES: CategoryProfit[] = [];

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
