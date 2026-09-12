import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/data';
import type { CollectionName, EntityMap } from '@/data/repository';
import { useSessionStore } from '@/stores/session';
import { invalidateCollection } from './useCollection';

/**
 * Like {@link useCollection}, but fetches ONLY rows whose `dateField` is within
 * [from, to] — the date filter runs in the query, so time-series pages never
 * pull the whole history (which silently truncated at the PostgREST row cap).
 *
 * Realtime stays automatic: the repository change-subscription invalidates by
 * the `['collection', name]` prefix, which also matches these ranged keys.
 *
 * For a `date` column pass 'YYYY-MM-DD' bounds. For a timestamp field like
 * `createdAt`, pass widened bounds (see rangeForTimestamp) and keep any exact
 * local-date filter client-side.
 */
export function useCollectionRange<K extends CollectionName>(
  collection: K,
  dateField: keyof EntityMap[K] & string,
  from: string,
  to: string,
) {
  const queryClient = useQueryClient();
  const activeOutletId = useSessionStore((s) => s.activeOutletId);

  const query = useQuery({
    queryKey: ['collection', collection, activeOutletId, dateField, from, to],
    queryFn: () => repository.listByDateRange(collection, dateField, from, to),
    placeholderData: [] as EntityMap[K][],
  });

  useEffect(() => {
    const unsub = repository.subscribe((changed) => {
      // Prefix match invalidates every ranged variant of this collection.
      if (changed === collection) invalidateCollection(queryClient, changed);
    });
    return unsub;
  }, [collection, queryClient]);

  return {
    data: query.data ?? [],
    loading: query.isPending || query.isPlaceholderData,
    refreshing: query.isFetching && !query.isPending && !query.isPlaceholderData,
    error: query.error instanceof Error ? query.error : null,
    updatedAt: query.dataUpdatedAt,
    refetch: query.refetch,
  };
}

/**
 * Widen a local date range [from, to] into inclusive timestamp bounds for a
 * `createdAt`-style column. `createdAt` is UTC but the app groups by LOCAL
 * date, so a naive `>= from 00:00 UTC` would drop early-morning-WIB rows.
 * Padding ±1 day guarantees no in-range row is missed; the caller's existing
 * `localDateOf` filter trims the extra edge rows. Returns [fromTs, toTs].
 */
export function rangeForTimestamp(from: string, to: string): [string, string] {
  const pad = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  return [`${pad(from, -1)}T00:00:00.000Z`, `${pad(to, 1)}T23:59:59.999Z`];
}
