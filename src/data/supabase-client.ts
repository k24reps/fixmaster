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

// ============================================================
// Auth helpers — thin wrappers so the store/UI never touch the
// raw client. All return a normalized { error } shape on failure.
// ============================================================

export interface AuthResult {
  /** Human-readable error message, or null on success. */
  error: string | null;
}

/** Register a new account (the future org owner). */
export async function authSignUp(email: string, password: string): Promise<AuthResult> {
  const c = getSupabase();
  if (!c) return { error: 'Supabase tidak terkonfigurasi' };
  const { error } = await c.auth.signUp({ email, password });
  return { error: error?.message ?? null };
}

/** Sign in with email + password. */
export async function authSignIn(email: string, password: string): Promise<AuthResult> {
  const c = getSupabase();
  if (!c) return { error: 'Supabase tidak terkonfigurasi' };
  const { error } = await c.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

/** Sign out the current account. */
export async function authSignOut(): Promise<AuthResult> {
  const c = getSupabase();
  if (!c) return { error: null };
  const { error } = await c.auth.signOut();
  return { error: error?.message ?? null };
}

/** Send a password-reset email. */
export async function authResetPassword(email: string): Promise<AuthResult> {
  const c = getSupabase();
  if (!c) return { error: 'Supabase tidak terkonfigurasi' };
  const { error } = await c.auth.resetPasswordForEmail(email);
  return { error: error?.message ?? null };
}
