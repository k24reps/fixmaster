import { repository } from '@/data';
import { fetchServiceSummary } from '@/data/supabase-client';
import { serviceSummary, type ServiceSummary } from '@/lib/business/dashboard';
import { addDays, localDayStartISO } from '@/lib/time';
import { useSessionStore } from '@/stores/session';
import { isCloudMode } from '@/stores/demo';
import { useDerivedQuery } from './useCollection';

/**
 * Ringkasan servis (hitungan status, nilai Lunas, performa teknisi) dari SELURUH
 * tiket. Daftar servis cloud dipotong 1000 baris terbaru, jadi di cloud dihitung
 * server (0063); lokal & demo menghitung dari data di memori. `from`/`to` =
 * tanggal lokal inklusif. Kuncinya di bawah ['collection', 'services'], jadi ikut
 * di-invalidate setiap kali servis berubah.
 */
export function useServiceSummary(from: string, to: string) {
  const orgId = useSessionStore((s) => s.org?.id ?? null);
  const outletId = useSessionStore((s) => s.activeOutletId);

  return useDerivedQuery<ServiceSummary | null>(
    ['collection', 'services', outletId, 'summary', from, to],
    async () => {
      const start = localDayStartISO(from);
      const end = localDayStartISO(addDays(to, 1));
      if (isCloudMode() && orgId) {
        return fetchServiceSummary({ orgId, outletId, from: start, to: end });
      }
      return serviceSummary(await repository.list('services'), start, end);
    },
    null,
  );
}
