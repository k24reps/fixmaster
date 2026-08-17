import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/data';
import type { CollectionName, EntityMap } from '@/data/repository';
import { useSessionStore } from '@/stores/session';

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
    const unsub = repository.subscribe((changed) => {
      if (changed === collection) {
        void queryClient.invalidateQueries({ queryKey: ['collection', changed] });
      }
    });
    return unsub;
  }, [collection, queryClient, enabled]);

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
