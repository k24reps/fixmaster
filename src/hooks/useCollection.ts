import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { repository } from '@/data';
import type { CollectionName, EntityMap } from '@/data/repository';
import { useSessionStore } from '@/stores/session';

const queuedInvalidations = new WeakMap<QueryClient, Set<string>>();

/**
 * One invalidation per collection per tick, however many hooks listen.
 *
 * Every mounted hook subscribes, and `repository.notify()` calls them all in
 * one synchronous loop. Invalidating once per listener made TanStack cancel and
 * restart the same fetch for each hook — but `queryFn` ignores the abort
 * signal, so every cancelled request still downloaded the whole table. Sidebar
 * and MobileBottomNav mount together on nearly every page, so one change on
 * the Dashboard cost three full `services` pulls (measured in the test).
 */
export function invalidateCollection(queryClient: QueryClient, collection: string): void {
  let queued = queuedInvalidations.get(queryClient);
  if (!queued) queuedInvalidations.set(queryClient, (queued = new Set()));
  if (queued.has(collection)) return;
  queued.add(collection);
  queueMicrotask(() => {
    queued.delete(collection);
    void queryClient.invalidateQueries({ queryKey: ['collection', collection] });
  });
}

/**
 * A query DERIVED from a collection: a server aggregate (RPC) in cloud mode, the
 * same figure computed from `repository.list` locally. Same contract as
 * `useCollection` — key under ['collection', name, …] so repository changes
 * invalidate it, and the caller gets the identical loading/refreshing shape.
 *
 * Exists because every aggregate hook (ringkasan servis, piutang, laba per
 * kategori, statistik pelanggan) repeated this body verbatim, and the one copy
 * that forgot the subscription refreshed only because a sibling hook on the same
 * page happened to install one.
 */
export function useDerivedQuery<T>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  fallback: T,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn, enabled });

  useEffect(() => {
    if (!enabled) return;
    return repository.subscribe((changed) => invalidateCollection(queryClient, changed));
  }, [queryClient, enabled]);

  return {
    data: query.data ?? fallback,
    loading: enabled && query.isPending,
    refreshing: query.isFetching && !query.isPending,
    error: query.error instanceof Error ? query.error : null,
    updatedAt: query.dataUpdatedAt,
    refetch: query.refetch,
  };
}

/**
 * Subscribe a React component to a repository collection via TanStack Query.
 * The query fetches the collection; a repository change-subscription
 * invalidates the matching query so the UI re-fetches automatically.
 * Adapter-agnostic (IndexedDB now, Supabase later).
 *
 * `enabled: false` skips BOTH the fetch and the change-subscription, so the
 * collection costs nothing until it's actually needed. Use it for components
 * that are always mounted but only need data on demand (see GlobalSearch):
 * `list()` pulls whole tables, so an always-on query is paid for on every page
 * and re-paid on every realtime change, even when nobody looks at it.
 */
export function useCollection<K extends CollectionName>(
  collection: K,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const queryClient = useQueryClient();
  // Including the active outlet in the key makes switching branches refetch
  // automatically (the repository is already re-scoped by setActiveOutlet).
  const activeOutletId = useSessionStore((s) => s.activeOutletId);

  const query = useQuery({
    queryKey: ['collection', collection, activeOutletId],
    queryFn: () => repository.list(collection),
    // NOTE: use placeholderData (not initialData). initialData is treated as
    // already-fetched/fresh data, which — combined with the global staleTime —
    // suppresses the mount fetch and leaves the UI empty until staleTime
    // elapses. placeholderData shows [] while the real fetch runs on mount.
    placeholderData: [] as EntityMap[K][],
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;
    // Effect only sets up an external subscription (no synchronous setState).
    // Invalidate WHATEVER collection changed, not just this hook's: a page that
    // isn't mounted (Keuangan, Dashboard) keeps its cached query "fresh" for the
    // whole staleTime otherwise, so a refund booked from the service detail page
    // stayed invisible there for minutes. Inactive queries are only marked stale
    // (no fetch until they mount again), and invalidateCollection still collapses
    // every listener into one invalidation per collection per tick.
    const unsub = repository.subscribe((changed) => {
      invalidateCollection(queryClient, changed);
    });
    return unsub;
  }, [queryClient, enabled]);

  return {
    data: query.data ?? [],
    // `placeholderData: []` prevents undefined at call sites, but it must not
    // make an empty placeholder look like verified business data. Keep the
    // explicit loading signal true until the first real response arrives.
    loading: enabled && (query.isPending || query.isPlaceholderData),
    refreshing: query.isFetching && !query.isPending && !query.isPlaceholderData,
    error: query.error instanceof Error ? query.error : null,
    updatedAt: query.dataUpdatedAt,
    refetch: query.refetch,
  };
}
