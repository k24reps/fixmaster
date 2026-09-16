import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/data';
import { fetchServiceReceivables, fetchCategoryProfit } from '@/data/supabase-client';
import {
  agingFromRows,
  receivablesAging,
  profitByDeviceCategory,
  completionDate,
  type Receivable,
  type CategoryProfit,
} from '@/lib/business/reports';
import { addDays, localDayStartISO, isInRange } from '@/lib/time';
import { useSessionStore } from '@/stores/session';
import { isCloudMode } from '@/stores/demo';
import { invalidateCollection } from './useCollection';

const NO_RECEIVABLES: Receivable[] = [];
const NO_CATEGORIES: CategoryProfit[] = [];

/**
 * Piutang servis: keadaan SEKARANG, bukan besaran periode. Dulu dihitung dari
 * tiket yang dibuat pada periode yang sedang dilihat, sehingga tiket tiga bulan
 * lalu yang belum lunas — justru yang paling perlu ditagih — tidak pernah
 * muncul. Cloud menghitungnya dari seluruh tabel lewat RPC (0074).
 */
export function useReceivables() {
  const queryClient = useQueryClient();
  const orgId = useSessionStore((s) => s.org?.id ?? null);
  const outletId = useSessionStore((s) => s.activeOutletId);

  const query = useQuery({
    queryKey: ['collection', 'services', outletId, 'receivables'],
    queryFn: async () => {
      if (isCloudMode() && orgId) {
        return agingFromRows(await fetchServiceReceivables({ orgId, outletId }));
      }
      return receivablesAging(await repository.list('services'));
    },
  });

  useEffect(
    () => repository.subscribe((changed) => invalidateCollection(queryClient, changed)),
    [queryClient],
  );

  return {
    data: query.data ?? NO_RECEIVABLES,
    loading: query.isPending,
    refreshing: query.isFetching && !query.isPending,
    error: query.error instanceof Error ? query.error : null,
    updatedAt: query.dataUpdatedAt,
    refetch: query.refetch,
  };
}

/**
 * Laba per kategori perangkat menurut tanggal SELESAI — definisi periode yang
 * sama dengan Performa Teknisi (0063). Sebelumnya kartu ini memakai tanggal
 * tiket MASUK, jadi dua kartu bertetangga menjawab pertanyaan berbeda dengan
 * label periode yang sama.
 */
export function useCategoryProfit(from: string, to: string) {
  const queryClient = useQueryClient();
  const orgId = useSessionStore((s) => s.org?.id ?? null);
  const outletId = useSessionStore((s) => s.activeOutletId);

  const query = useQuery({
    queryKey: ['collection', 'services', outletId, 'categoryProfit', from, to],
    queryFn: async () => {
      const start = localDayStartISO(from);
      const end = localDayStartISO(addDays(to, 1));
      if (isCloudMode() && orgId) {
        return fetchCategoryProfit({ orgId, from: start, to: end, outletId });
      }
      const services = await repository.list('services');
      // Lokal/demo: himpunan yang sama, disaring dengan aturan yang sama.
      const done = services.filter((s) => {
        const at = completionDate(s);
        return at !== null && isInRange(at, from, to);
      });
      return profitByDeviceCategory(done);
    },
  });

  useEffect(
    () => repository.subscribe((changed) => invalidateCollection(queryClient, changed)),
    [queryClient],
  );

  return {
    data: query.data ?? NO_CATEGORIES,
    loading: query.isPending,
    refreshing: query.isFetching && !query.isPending,
    error: query.error instanceof Error ? query.error : null,
    updatedAt: query.dataUpdatedAt,
    refetch: query.refetch,
  };
}
