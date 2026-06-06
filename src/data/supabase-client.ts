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

/**
 * Resolve the signed-in account's org membership. In cloud mode the org and
 * the "current employee" are derived from this (membership.id IS the employee
 * id used across the app), so login needs no PIN. Returns null when the user
 * has no org yet (→ onboarding wizard).
 */
export async function getMyMembership(): Promise<{ orgId: string; membershipId: string } | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data: u } = await c.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await c
    .from('memberships')
    .select('id, org_id')
    .eq('user_id', u.user.id)
    .eq('active', true)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return { orgId: data[0].org_id as string, membershipId: data[0].id as string };
}

/**
 * Cloud clock-in via the `clock_in` RPC. The server re-validates the geofence
 * (the real security boundary) and inserts the attendance row atomically.
 * Returns the new attendance id. Throws with the server's Indonesian message
 * (e.g. outside-radius) so the UI can surface it directly.
 */
export async function clockIn(args: {
  orgId: string;
  outletId: string;
  employeeId: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<string> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('clock_in', {
    p_org_id: args.orgId,
    p_outlet_id: args.outletId,
    p_employee_id: args.employeeId,
    p_lat: args.lat ?? null,
    p_lng: args.lng ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
