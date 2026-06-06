import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client singleton. Reads credentials from Vite env vars:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 * The anon key is safe to ship to the browser — RLS enforces access.
 * Returns null when unconfigured so the app can fall back to local-first.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  if (!url || !anonKey) return null;
  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

/** Whether Supabase is configured (controls local-first vs cloud mode). */
export const isSupabaseConfigured = Boolean(url && anonKey);
