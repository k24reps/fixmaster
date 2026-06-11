import { LocalAdapter } from './local-adapter';
import { SupabaseAdapter } from './supabase-adapter';
import { isSupabaseConfigured } from './supabase-client';
import type { Repository } from './repository';

/**
 * The active repository implementation. Both adapters satisfy the same
 * `Repository` contract, so feature code never changes:
 *   - Supabase configured (prod, env vars set) → cloud + RLS + realtime.
 *   - Otherwise (local dev / demo)              → IndexedDB, offline-first.
 */
function createRepository(): Repository {
  if (isSupabaseConfigured) {
    try {
      return new SupabaseAdapter();
    } catch {
      // Fall through to local if client init fails.
    }
  }
  return new LocalAdapter();
}

/**
 * Exported as a mutable live-binding (not `const`) so the public landing-page
 * demo can temporarily swap in an in-memory adapter at runtime via
 * {@link installRepository}, then restore the real one with
 * {@link resetRepository}. ES module live-bindings mean every importer that
 * reads `repository` at call-time automatically sees the active instance —
 * feature code (useCollection, session store, etc.) needs no changes.
 *
 * Outside the demo this is exactly the adapter chosen by `createRepository()`.
 */
export let repository: Repository = createRepository();

/** The real (default) repository, kept so the demo can restore it on exit. */
const defaultRepository = repository;

/**
 * Swap the active repository (demo only). Releases any resources held by the
 * outgoing instance first. Pass an `InMemoryAdapter` to enter demo mode.
 */
export function installRepository(next: Repository): void {
  if (repository !== next) repository.dispose?.();
  repository = next;
}

/** Restore the real repository after the demo unmounts. */
export function resetRepository(): void {
  if (repository !== defaultRepository) repository.dispose?.();
  repository = defaultRepository;
}

/** Whether the app is running against the cloud backend. */
export { isSupabaseConfigured };
