/** The slice of useCollection / useCollectionRange a load state needs. */
export interface LoadQuery {
  loading: boolean;
  error: Error | null;
  refetch: () => unknown;
}

/**
 * True while any query is still loading or has failed — i.e. while an empty
 * list is not a fact yet. Pages check this BEFORE their EmptyState: otherwise
 * "Belum ada sparepart" shows during the first load and after a failed fetch,
 * and an owner can re-enter data that already exists.
 */
export function loadPending(...queries: LoadQuery[]): boolean {
  return queries.some((q) => q.loading || q.error !== null);
}
