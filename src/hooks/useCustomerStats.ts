import { useQuery } from '@tanstack/react-query';
import { repository } from '@/data';
import { fetchCustomerServiceStats } from '@/data/supabase-client';
import { customerServiceStats, type CustomerStat } from '@/lib/business/customers';
import { isCloudMode } from '@/stores/demo';
import { useSessionStore } from '@/stores/session';
import type { Service } from '@/data/types';

const NO_STATS = new Map<string, CustomerStat>();
const NO_SERVICES: Service[] = [];

/**
 * Statistik servis per pelanggan dari SEMUA tiket. Daftar servis cloud dipotong
 * 1000 tiket terbaru, jadi di cloud dihitung server (customer_service_stats,
 * 0069). Kunci di bawah ['collection', 'services'] → ikut diperbarui saat servis berubah.
 */
export function useCustomerStats() {
  const orgId = useSessionStore((s) => s.org?.id ?? null);
  const query = useQuery({
    queryKey: ['collection', 'services', 'customerStats', orgId],
    queryFn: async () => {
      if (isCloudMode() && orgId) {
        const rows = await fetchCustomerServiceStats(orgId);
        return new Map(rows.map(({ customerId, ...stat }) => [customerId, stat] as const));
      }
      return customerServiceStats(await repository.list('services'));
    },
  });
  return {
    data: query.data ?? NO_STATS,
    loading: query.isPending,
    error: query.error instanceof Error ? query.error : null,
    refetch: query.refetch,
  };
}

/** Semua tiket satu pelanggan — dari server di cloud, bukan hanya 1000 tiket terbaru. */
export function useCustomerServices(customerId: string | null) {
  const query = useQuery({
    queryKey: ['collection', 'services', 'customer', customerId],
    queryFn: async () =>
      repository.queryServices
        ? repository.queryServices({ customerId: customerId ?? '', limit: 1000 })
        : (await repository.list('services')).filter((s) => s.customerId === customerId),
    enabled: !!customerId,
  });
  return {
    data: query.data ?? NO_SERVICES,
    loading: !!customerId && query.isPending,
    error: query.error instanceof Error ? query.error : null,
    refetch: query.refetch,
  };
}
