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

export const repository: Repository = createRepository();

/** Whether the app is running against the cloud backend. */
export { isSupabaseConfigured };
