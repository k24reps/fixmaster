import { useQuery } from '@tanstack/react-query';
import { repository } from '@/data';
import type { Service, ServiceHistoryEntry } from '@/data/types';

/**
 * A ticket's audit trail. Cloud service lists omit `history` (≈78% of every
 * row — see supabase-adapter), so the screens that SHOW the trail fetch that
 * one row. Local lists carry it inline and skip the fetch.
 *
 * Keyed under ['collection', 'services'] so the realtime invalidation that
 * refreshes the list refreshes this too.
 */
export function useServiceHistory(service: Service | null): ServiceHistoryEntry[] {
  const inline = service?.history;
  const id = service?.id ?? '';
  const { data } = useQuery({
    queryKey: ['collection', 'services', 'history', id],
    queryFn: async () => (await repository.get('services', id))?.history ?? [],
    enabled: !!id && !inline,
  });
  return inline ?? data ?? [];
}
