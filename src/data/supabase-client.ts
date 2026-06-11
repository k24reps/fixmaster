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

/**
 * Cloud void of a POS sale via the `void_sale` RPC (manager-only, atomic):
 * restores stock, reverses wallet balances, deletes linked income rows, and
 * marks the sale voided (row retained for audit). Throws the server's
 * Indonesian message on failure (e.g. non-manager).
 */
export async function voidSale(saleId: string, reason: string): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('void_sale', {
    p_sale_id: saleId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

/** Public tracking lookup result (safe fields only — no internal history). */
export interface TrackServiceResult {
  serviceNo: string;
  device: string;
  category: string;
  status: string;
  orgName: string;
  /** History entries already filtered server-side to non-internal only. */
  publicHistory: { status: string; at: string; note?: string; internal?: boolean }[];
}

/**
 * Public, no-login service tracking via the `track_service` RPC. This RPC is
 * `security definer` and granted to `anon`, so it works for customers opening
 * the link on any device/browser — UNLIKE a direct `services` table read,
 * which RLS (`services_select` = is_org_member) blocks for anonymous visitors.
 * The RPC also returns only safe fields + internal-filtered history, and is
 * throttled server-side (60/min per org). Returns null when not found.
 */
export async function trackService(
  orgId: string,
  serviceNo: string,
): Promise<TrackServiceResult | null> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('track_service', {
    p_org_id: orgId,
    p_service_no: serviceNo,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    serviceNo: row.service_no,
    device: row.device,
    category: row.category,
    status: row.status,
    orgName: row.org_name,
    publicHistory: (row.public_history ?? []) as TrackServiceResult['publicHistory'],
  };
}

// ============================================================
// Team management (Fase 1A). Invitations use the "pending-invite +
// claim" model: a manager creates a pending_invites row; the invitee
// signs up with that email; claim_invite() links them to the org.
// All mutations go through security-definer RPCs (manager-checked).
// ============================================================

export interface PendingInvite {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  claimedAt: string | null;
}

/** Manager creates a pending invite for an email + role. */
export async function inviteMember(args: {
  orgId: string;
  email: string;
  name: string;
  role: string;
}): Promise<PendingInvite> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c
    .from('pending_invites')
    .upsert(
      {
        org_id: args.orgId,
        email: args.email.trim().toLowerCase(),
        name: args.name.trim(),
        role: args.role,
        invited_by: (await c.auth.getUser()).data.user?.id ?? null,
        claimed_at: null,
      },
      { onConflict: 'org_id,email' },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    orgId: data.org_id,
    email: data.email,
    name: data.name,
    role: data.role,
    createdAt: data.created_at,
    claimedAt: data.claimed_at,
  };
}

/** List outstanding (unclaimed) invites for an org. */
export async function listPendingInvites(orgId: string): Promise<PendingInvite[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c
    .from('pending_invites')
    .select('*')
    .eq('org_id', orgId)
    .is('claimed_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    id: d.id,
    orgId: d.org_id,
    email: d.email,
    name: d.name,
    role: d.role,
    createdAt: d.created_at,
    claimedAt: d.claimed_at,
  }));
}

/** Revoke an outstanding invite. */
export async function revokeInvite(inviteId: string): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.from('pending_invites').delete().eq('id', inviteId);
  if (error) throw new Error(error.message);
}

/**
 * Claim a pending invite for the signed-in account. Called right after a new
 * signup; returns the joined org id, or null when there is no matching invite.
 */
export async function claimInvite(): Promise<string | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.rpc('claim_invite');
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/** Manager changes a member's role (refuses to demote the last owner). */
export async function setMemberRole(memberId: string, role: string): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('set_member_role', { p_member_id: memberId, p_role: role });
  if (error) throw new Error(error.message);
}

/** Manager deactivates a member (refuses the last active owner). */
export async function deactivateMember(memberId: string): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('deactivate_member', { p_member_id: memberId });
  if (error) throw new Error(error.message);
}

// ============================================================
// Billing (Fase 1B). QRIS is one-shot, so subscriptions generate an
// invoice per cycle. start_subscription creates a pending invoice;
// the Mayar Edge Function fills qris_url; the webhook (or a mock
// confirm) calls apply_payment to extend the plan. All via RPC.
// ============================================================

export interface Invoice {
  id: string;
  orgId: string;
  plan: string;
  amount: number;
  status: 'pending' | 'paid' | 'expired' | 'canceled';
  provider: string;
  providerRef: string | null;
  qrisUrl: string | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  paidAt: string | null;
}

function toInvoice(d: Record<string, unknown>): Invoice {
  return {
    id: d.id as string,
    orgId: d.org_id as string,
    plan: d.plan as string,
    amount: Number(d.amount),
    status: d.status as Invoice['status'],
    provider: d.provider as string,
    providerRef: (d.provider_ref as string | null) ?? null,
    qrisUrl: (d.qris_url as string | null) ?? null,
    periodStart: d.period_start as string,
    periodEnd: d.period_end as string,
    createdAt: d.created_at as string,
    paidAt: (d.paid_at as string | null) ?? null,
  };
}

/** Start/renew a subscription: creates a pending invoice, returns its id. */
export async function startSubscription(plan: string, amount: number): Promise<string> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('start_subscription', { p_plan: plan, p_amount: amount });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Mark an invoice paid (mock-payment confirm; in production the Mayar webhook
 * calls the same RPC server-side). Extends the org's plan atomically.
 */
export async function applyPayment(invoiceId: string): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('apply_payment', { p_invoice_id: invoiceId });
  if (error) throw new Error(error.message);
}

/** Cancel a pending invoice (manager-only). No-op if not pending. */
export async function cancelInvoice(invoiceId: string): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('cancel_invoice', { p_invoice_id: invoiceId });
  if (error) throw new Error(error.message);
}

/** List an org's invoices, newest first. */
export async function listInvoices(orgId: string): Promise<Invoice[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c
    .from('invoices')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toInvoice);
}

/**
 * Create a real QRIS payment invoice via the `create-invoice` Edge Function
 * (Fersaku). Returns the hosted checkout link. The payment provider's secret
 * key lives only in the Edge Function — never in the browser. Throws if the
 * function is not deployed/configured, so callers can fall back to the mock
 * flow.
 */
export async function createPaymentInvoice(
  plan: string,
  amount: number,
  redirectUrl?: string,
): Promise<{ invoiceId: string; link: string }> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.functions.invoke('create-invoice', {
    body: { plan, amount, redirectUrl },
  });
  if (error) throw new Error(error.message);
  if (!data?.link) throw new Error(data?.error ?? 'Gagal membuat invoice pembayaran');
  return { invoiceId: data.invoiceId as string, link: data.link as string };
}

/**
 * Permanently delete the signed-in account's auth credential (email +
 * password record) via the `delete-account` Edge Function. The function
 * verifies the caller's JWT server-side and deletes only THEIR own id, using
 * the service-role key that must never reach the browser.
 *
 * Call this AFTER erasing tenant data (repository.clearAll). Throws if the
 * function isn't deployed/reachable, so the caller can fall back to a
 * data-erasure-only flow.
 */
export async function deleteAccountCredential(): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.functions.invoke('delete-account', { body: {} });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error ?? 'Gagal menghapus akun');
}

/**
 * Subscribe to realtime billing changes for one org. Fires `onChange` whenever
 * an `invoices` row for this org or the `organizations` row itself changes
 * (e.g. the webhook marks an invoice paid/expired and extends the plan). RLS
 * still applies on the realtime stream, so only rows the user may read are
 * delivered. Requires tables to be in the `supabase_realtime` publication
 * (migration 0012). Returns an unsubscribe function (no-op when unconfigured).
 */
export function subscribeOrgBilling(orgId: string, onChange: () => void): () => void {
  const c = getSupabase();
  if (!c || !orgId) return () => {};
  const channel = c
    .channel(`billing:${orgId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'invoices', filter: `org_id=eq.${orgId}` },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'organizations', filter: `id=eq.${orgId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void c.removeChannel(channel);
  };
}

/**
 * Subscribe to realtime changes for a set of DOMAIN tables in one org, on a
 * single channel. Fires `onChange(table)` for every insert/update/delete on a
 * row belonging to this org, so other devices can refetch the affected
 * collection (multi-cashier live sync). RLS still applies on the stream, and
 * an explicit `org_id=eq.<orgId>` filter scopes each listener. Requires the
 * tables to be in the `supabase_realtime` publication (migration 0021).
 * Returns an unsubscribe function (no-op when unconfigured).
 */
export function subscribeOrgTables(
  orgId: string,
  tables: readonly string[],
  onChange: (table: string) => void,
): () => void {
  const c = getSupabase();
  if (!c || !orgId || tables.length === 0) return () => {};
  let channel = c.channel(`org-domain:${orgId}`);
  for (const table of tables) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `org_id=eq.${orgId}` },
      (payload) => onChange((payload.table as string) ?? table),
    );
  }
  channel.subscribe();
  return () => {
    void c.removeChannel(channel);
  };
}
