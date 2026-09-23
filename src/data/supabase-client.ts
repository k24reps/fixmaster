import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  computeBackoff,
  withJitter,
  isHealthDue,
  HEALTH_IDLE_MS,
} from '@/lib/business/realtime-timing';
import { mapAuthError } from '@/lib/business/authError';
import type { ServiceSummary } from '@/lib/business/dashboard';

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
  const { data, error } = await c.auth.signUp({ email, password });
  if (error) return { error: mapAuthError(error.message) };
  // With email confirmation disabled, signing up an ALREADY-registered email
  // succeeds but returns a user whose `identities` array is empty (Supabase's
  // enumeration guard). Surface it as "already registered" instead of the
  // misleading "account created, please log in".
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return { error: 'Email ini sudah terdaftar. Silakan masuk.' };
  }
  return { error: null };
}

/** Sign in with email + password. */
export async function authSignIn(email: string, password: string): Promise<AuthResult> {
  const c = getSupabase();
  if (!c) return { error: 'Supabase tidak terkonfigurasi' };
  const { error } = await c.auth.signInWithPassword({ email, password });
  return { error: error ? mapAuthError(error.message) : null };
}

/** Sign out the current account. */
export async function authSignOut(): Promise<AuthResult> {
  const c = getSupabase();
  if (!c) return { error: null };
  const { error } = await c.auth.signOut();
  return { error: error?.message ?? null };
}

/**
 * Send a password-reset email. `redirectTo` brings the user back to THIS app's
 * /reset-password screen (on whatever origin they requested from — prod, preview,
 * or local) instead of the project's default Site URL. The target origin must be
 * present in the Supabase dashboard's Auth redirect allow-list.
 */
export async function authResetPassword(email: string): Promise<AuthResult> {
  const c = getSupabase();
  if (!c) return { error: 'Supabase tidak terkonfigurasi' };
  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/reset-password`
      : undefined;
  const { error } = await c.auth.resetPasswordForEmail(
    email,
    redirectTo ? { redirectTo } : undefined,
  );
  return { error: error ? mapAuthError(error.message) : null };
}

/**
 * Set a new password for the user in an active recovery session (after they
 * land on /reset-password from the email link). supabase-js parses the recovery
 * token from the URL on load (detectSessionInUrl) and emits PASSWORD_RECOVERY,
 * establishing a temporary session that authorizes this update.
 */
export async function authUpdatePassword(newPassword: string): Promise<AuthResult> {
  const c = getSupabase();
  if (!c) return { error: 'Supabase tidak terkonfigurasi' };
  const { error } = await c.auth.updateUser({ password: newPassword });
  return { error: error ? mapAuthError(error.message) : null };
}

/**
 * Resolve the signed-in account's org membership. In cloud mode the org and
 * the "current employee" are derived from this (membership.id IS the employee
 * id used across the app), so login needs no PIN. Returns null when the user
 * has no org yet (→ onboarding wizard).
 */
export async function getMyMembership(): Promise<{
  orgId: string;
  membershipId: string;
  outletIds: string[];
} | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data: u } = await c.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await c
    .from('memberships')
    .select('id, org_id')
    .eq('user_id', u.user.id)
    .eq('active', true)
    // Anggota yang sudah dihapus TIDAK dihitung punya toko — kalau dihitung,
    // baris hantu (active=true + deleted_at terisi) membuat bootstrap berhenti
    // di sini dan claim_invite tak pernah dipanggil, sehingga undangan macet
    // di "menunggu pendaftaran" selamanya. Cocokkan dengan filter list().
    .is('deleted_at', null)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const membershipId = data[0].id as string;
  // Resolve assigned outlets (Level 2 scoping). Empty = treated as no
  // restriction at the UI layer (manager, or pre-assignment staff).
  let outletIds: string[] = [];
  const { data: mo } = await c
    .from('membership_outlets')
    .select('outlet_id')
    .eq('membership_id', membershipId);
  if (mo) outletIds = mo.map((r) => r.outlet_id as string);
  return { orgId: data[0].org_id as string, membershipId, outletIds };
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
 * Cloud clock-out via the `clock_out` RPC. Mirror of `clockIn`: the same
 * geofence is re-checked, the timestamp comes from the server clock, and
 * `total_hours` is computed by the database trigger — never sent from here.
 * Returns the hours the server recorded. Throws the server's Indonesian
 * message (already out of radius, shift already closed, …).
 */
export async function clockOut(args: {
  attendanceId: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<number> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('clock_out', {
    p_attendance_id: args.attendanceId,
    p_lat: args.lat ?? null,
    p_lng: args.lng ?? null,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
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
  /** Store contact, so customers know who/where to reach. No pricing exposed. */
  orgPhone: string;
  orgAddress: string;
  orgLogoUrl: string | null;
  /** Owner-written note shown on the public tracking page (settings.publicNote). */
  orgNote: string;
  /** Warranty validity for a finished job (date strings, or null if unset). */
  warrantyServiceUntil: string | null;
  warrantyPartsUntil: string | null;
  /** Garansi per sparepart (0060): nama + tanggal akhir, null = tanpa garansi. Tanpa harga. */
  partWarranties: { name: string; until: string | null }[];
  pickedUp: boolean;
  /** History entries already filtered server-side to non-internal only. */
  publicHistory: { status: string; at: string; note?: string; internal?: boolean }[];
}

/**
 * Public, no-login service tracking via the `track_service` RPC. This RPC is
 * `security definer` and granted to `anon`, so it works for customers opening
 * the link on any device/browser — UNLIKE a direct `services` table read,
 * which RLS (`services_select` = is_org_member) blocks for anonymous visitors.
 * The RPC also returns only safe fields + internal-filtered history, store
 * contact, and warranty info (NO pricing), and is throttled server-side
 * (60/min per org). Returns null when not found.
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
    orgPhone: row.org_phone ?? '',
    orgAddress: row.org_address ?? '',
    orgLogoUrl: row.org_logo_url ?? null,
    orgNote: (row.org_public_note ?? '') as string,
    warrantyServiceUntil: row.warranty_service_until ?? null,
    warrantyPartsUntil: row.warranty_parts_until ?? null,
    // Kosong sampai migrasi 0060 diterapkan; halaman lacak lalu memakai tanggal tunggal.
    partWarranties: (row.part_warranties ?? []) as TrackServiceResult['partWarranties'],
    pickedUp: row.picked_up ?? false,
    publicHistory: (row.public_history ?? []) as TrackServiceResult['publicHistory'],
  };
}

/**
 * Cloud POS checkout via the `process_sale` RPC (atomic, security-definer):
 * validates + locks stock, inserts the sale, deducts stock, credits wallets,
 * and records income — all server-side. This is the ONLY write path that lets
 * a staff cashier complete a sale in cloud mode (direct wallet/inventory writes
 * are manager-only under RLS). `outletId` tags the sale + income to a branch.
 * Returns the new sale id and the number the server assigned.
 */
export async function processSale(args: {
  orgId: string;
  saleNo: string;
  lines: unknown[];
  payments: unknown[];
  subtotal: number;
  discount: number;
  discountType: string;
  total: number;
  outletId: string | null;
  /** Pelanggan yang dikaitkan ke transaksi ini (0070); null = pembeli umum. */
  customerId?: string | null;
}): Promise<{ id: string; saleNo: string }> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('process_sale', {
    p_org_id: args.orgId,
    p_sale_no: args.saleNo,
    p_lines: args.lines,
    p_payments: args.payments,
    p_subtotal: args.subtotal,
    p_discount: args.discount,
    p_discount_type: args.discountType,
    p_total: args.total,
    p_outlet_id: args.outletId,
    p_customer_id: args.customerId ?? null,
  });
  if (error) throw new Error(error.message);
  const id = data as string;
  // Nomor ditetapkan server (bisa berbeda dari usulan saat bentrok) — ambil yang tersimpan.
  const { data: row } = await c.from('sales').select('sale_no').eq('id', id).maybeSingle();
  return { id, saleNo: (row?.sale_no as string | undefined) ?? args.saleNo };
}

/**
 * Koreksi stok manual (0069, owner/admin): SELISIH diterapkan di atas stok
 * terkini secara atomik, bukan menulis ulang angka dari form yang bisa basi.
 * Mengembalikan stok baru.
 */
export async function adjustInventoryStock(args: {
  orgId: string;
  itemId: string;
  delta: number;
}): Promise<number> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('adjust_inventory_stock', {
    p_org_id: args.orgId,
    p_item_id: args.itemId,
    p_delta: args.delta,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

/** Salin nama & HP pelanggan ke tiket-tiketnya (0069) — hanya dua kolom itu. */
export async function syncCustomerToServices(args: { orgId: string; customerId: string }): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('sync_customer_to_services', {
    p_org_id: args.orgId,
    p_customer_id: args.customerId,
  });
  if (error) throw new Error(error.message);
}

/** Statistik servis per pelanggan dari SEMUA tiket (0069). */
export async function fetchCustomerServiceStats(
  orgId: string,
): Promise<{ customerId: string; count: number; paidTotal: number; categories: string[] }[]> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('customer_service_stats', { p_org_id: orgId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    customerId: String(r.customer_id),
    count: Number(r.services),
    paidTotal: Number(r.paid_total),
    categories: (r.categories as string[] | null) ?? [],
  }));
}

/**
 * Cloud service settlement via the `settle_service` RPC (atomic): marks the
 * service 'lunas', credits the wallet, and records income — server-side so a
 * staff member can settle without manager-only wallet writes. `outletId` tags
 * the income to the service's branch.
 */
export async function settleService(args: {
  orgId: string;
  serviceId: string;
  /** Split payment legs: one or more wallets each receiving part of the bill. */
  payments: { walletId: string; amount: number }[];
  history: unknown[];
  outletId: string | null;
  /**
   * Biaya final yang ditetapkan saat pelunasan (0061). RPC menulis status,
   * biaya final, riwayat, dan uang dalam satu transaksi, dan menghitung ulang
   * sisa tagihan dari angka ini — klien tidak menyimpan status lebih dulu.
   */
  finalCost?: number;
  /** Refund kelebihan DP (DP > biaya final), dibukukan di transaksi yang sama (0062). */
  refundAmount?: number;
  refundWalletId?: string | null;
}): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('settle_service', {
    p_org_id: args.orgId,
    p_service_id: args.serviceId,
    p_payments: args.payments,
    p_history: args.history,
    p_outlet_id: args.outletId,
    p_final_cost: args.finalCost ?? null,
    // Hanya dikirim bila ada refund, supaya pelunasan biasa tetap cocok dengan RPC 0061.
    ...(args.refundAmount
      ? { p_refund_amount: args.refundAmount, p_refund_wallet_id: args.refundWalletId ?? null }
      : {}),
  });
  if (error) throw new Error(error.message);
}

/**
 * Cloud service cancellation via the `cancel_service` RPC (atomic): restores
 * deducted inventory stock, optionally refunds a CHOSEN amount of the DP, and
 * sets the service to 'batal' — all server-side so a staff member can cancel
 * without manager-only wallet/inventory writes (RLS 0010/0017/0028).
 *
 * Refund model (0031): the DP income ('DP servis <no>') is KEPT (the money did
 * come in — audit stays intact); the refunded portion is booked as an EXPENSE
 * ('Refund DP servis <no>') from `refundWalletId`. Whatever the shop retains
 * (e.g. a diagnosis fee) becomes net income automatically. Pass refundAmount=0
 * (or omit) to keep the whole DP.
 */
export async function cancelService(args: {
  orgId: string;
  serviceId: string;
  history: unknown[];
  outletId: string | null;
  refundAmount?: number;
  refundWalletId?: string | null;
}): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('cancel_service', {
    p_org_id: args.orgId,
    p_service_id: args.serviceId,
    p_history: args.history,
    p_outlet_id: args.outletId,
    p_refund_amount: args.refundAmount ?? 0,
    p_refund_wallet_id: args.refundWalletId ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Cloud down-payment via the `record_down_payment` RPC (atomic): inserts the DP
 * income ('DP servis <no>'), credits the wallet, and accumulates the service's
 * down_payment — server-side so a staff member can take a DP without
 * manager-only wallet/income writes (RLS 0010/0028). `outletId` tags the income
 * to the service's branch.
 */
export async function recordDownPayment(args: {
  orgId: string;
  serviceId: string;
  walletId: string;
  amount: number;
  outletId: string | null;
}): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('record_down_payment', {
    p_org_id: args.orgId,
    p_service_id: args.serviceId,
    p_wallet_id: args.walletId,
    p_amount: args.amount,
    p_outlet_id: args.outletId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Koreksi biaya final tiket Lunas via `correct_service_cost` (0063, owner/admin).
 * Hanya SELISIHNYA yang dibukukan hari ini (naik → pemasukan, turun → refund
 * dari `walletId`) bersama biaya final & riwayat dalam satu transaksi. Pelunasan
 * lama tidak disentuh, jadi laporan bulan sebelumnya tetap.
 */
export async function correctServiceCost(args: {
  orgId: string;
  serviceId: string;
  finalCost: number;
  walletId: string;
  history: unknown[];
}): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('correct_service_cost', {
    p_org_id: args.orgId,
    p_service_id: args.serviceId,
    p_final_cost: args.finalCost,
    p_wallet_id: args.walletId,
    p_history: args.history,
  });
  if (error) throw new Error(error.message);
}

/**
 * Tulis daftar sparepart tiket + stok inventori dalam satu transaksi via
 * `update_service_parts` (0064). Server menghitung selisih stok dari baris yang
 * `deducted` dan mengunci baris inventori, jadi aman terhadap penjualan kasir
 * yang bersamaan — dan karyawan tak butuh akses tulis inventori.
 */
export async function updateServiceParts(args: {
  orgId: string;
  serviceId: string;
  spareparts: unknown[];
}): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('update_service_parts', {
    p_org_id: args.orgId,
    p_service_id: args.serviceId,
    p_spareparts: args.spareparts,
  });
  if (error) throw new Error(error.message);
}

/**
 * Buka klaim garansi via `create_warranty_claim` (0064): tiket klaim, catatan di
 * tiket asli, dan kerugian garansi (opsional) dalam satu transaksi. Ditolak bila
 * klaim lain untuk tiket asli yang sama masih berjalan.
 */
export async function createWarrantyClaim(args: {
  orgId: string;
  originId: string;
  serviceNo: string;
  complaint: string;
  by: string;
  byName: string;
  lossAmount: number;
  lossWalletId: string | null;
  /** Bagian yang diklaim ({kind, name}); tanggal garansinya divalidasi & diisi server (0065). */
  claimedItems: { kind: 'service' | 'part'; name: string }[];
}): Promise<{ id: string; serviceNo: string }> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('create_warranty_claim', {
    p_org_id: args.orgId,
    p_origin_id: args.originId,
    p_service_no: args.serviceNo,
    p_complaint: args.complaint,
    p_by: args.by,
    p_by_name: args.byName,
    p_loss_amount: args.lossAmount,
    p_loss_wallet_id: args.lossWalletId,
    p_claimed_items: args.claimedItems,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; serviceNo: string };
}

/**
 * Hapus satu transaksi Keuangan via `delete_finance_entry` (0068, owner/admin):
 * saldo wallet, baris terkait (semua kaki pelunasan, koreksinya), dan tiket
 * servis (status, DP, biaya final, riwayat) dibalik dalam satu transaksi.
 */
export async function deleteFinanceEntry(args: {
  orgId: string;
  kind: 'income' | 'expense';
  id: string;
}): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('delete_finance_entry', {
    p_org_id: args.orgId,
    p_kind: args.kind,
    p_id: args.id,
  });
  if (error) throw new Error(error.message);
}

/**
 * Ringkasan servis dari SELURUH tiket via `service_summary` (0063). Daftar
 * servis cloud dipotong 1000 baris terbaru, jadi hitungan tak boleh dari sana.
 * `from`/`to` = batas timestamp [from, to).
 */
export async function fetchServiceSummary(args: {
  orgId: string;
  outletId: string | null;
  from: string;
  to: string;
}): Promise<ServiceSummary> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('service_summary', {
    p_org_id: args.orgId,
    p_outlet_id: args.outletId,
    p_from: args.from,
    p_to: args.to,
  });
  if (error) throw new Error(error.message);
  const r = data as Record<string, unknown>;
  return {
    total: Number(r.total),
    unfinished: Number(r.unfinished),
    inProcess: Number(r.in_process),
    confirmation: Number(r.confirmation),
    awaitingPickup: Number(r.awaiting_pickup),
    done: Number(r.done),
    lunasValue: Number(r.lunas_value),
    unitsIn: Number(r.units_in),
    leaderboard: ((r.leaderboard ?? []) as Record<string, unknown>[]).map((t) => ({
      key: String(t.key),
      name: String(t.name),
      completed: Number(t.completed),
      revenue: Number(t.revenue),
    })),
  };
}

/**
 * Cloud PO receiving via `receive_goods_v2` (atomic, 0034): adds stock, updates
 * the PO, records a partial-aware Expense ('Pembelian stok PO <no>'), and
 * optionally debits a wallet (cash purchase) — all server-side. Keeps Finance
 * in sync with stock purchases. `amount` is the value received in THIS event.
 */
/**
 * Catat pemasukan/pengeluaran manual (0071): baris ledger + saldo wallet dalam
 * SATU transaksi server. Dulu dua penulisan terpisah dari browser — gagal di
 * tengah membuat buku kas dan saldo berbeda tanpa pesan apa pun.
 */
export async function recordFinanceEntry(args: {
  orgId: string;
  kind: 'income' | 'expense';
  date: string;
  category: string;
  amount: number;
  walletId: string;
  description: string;
  outletId: string | null;
}): Promise<string> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('record_finance_entry', {
    p_org_id: args.orgId,
    p_kind: args.kind,
    p_date: args.date,
    p_category: args.category,
    p_amount: args.amount,
    p_wallet_id: args.walletId,
    p_description: args.description,
    p_outlet_id: args.outletId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Ubah transaksi keuangan manual + rekonsiliasi saldo, satu transaksi (0071). */
export async function updateFinanceEntry(args: {
  orgId: string;
  kind: 'income' | 'expense';
  id: string;
  date: string;
  category: string;
  amount: number;
  walletId: string;
  description: string;
}): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('update_finance_entry', {
    p_org_id: args.orgId,
    p_kind: args.kind,
    p_id: args.id,
    p_date: args.date,
    p_category: args.category,
    p_amount: args.amount,
    p_wallet_id: args.walletId,
    p_description: args.description,
  });
  if (error) throw new Error(error.message);
}

/**
 * Pangkas log aktivitas lama (0076). Sengaja tindakan sadar pemilik, bukan
 * pembersihan otomatis: sistem audit tidak boleh menghapus jejaknya sendiri di
 * belakang pemiliknya. Minimal menyimpan 90 hari; pemangkasannya ikut tercatat.
 */
export async function purgeActivityLogs(args: {
  orgId: string;
  keepDays: number;
}): Promise<number> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('purge_activity_logs', {
    p_org_id: args.orgId,
    p_keep_days: args.keepDays,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/**
 * Piutang: servis selesai yang masih ada sisa, dari SELURUH tabel (0074).
 * Daftar servis di Laporan hanya memuat tiket yang dibuat pada periode yang
 * dilihat — piutang justru keadaan sekarang, dan yang paling tua pasti di luar
 * jendela itu.
 */
export async function fetchServiceReceivables(args: {
  orgId: string;
  outletId: string | null;
}): Promise<{ serviceId: string; serviceNo: string; customerName: string; outstanding: number; since: string }[]> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('service_receivables', {
    p_org_id: args.orgId,
    p_outlet_id: args.outletId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    serviceId: String(r.service_id),
    serviceNo: String(r.service_no ?? ''),
    customerName: String(r.customer_name ?? ''),
    outstanding: Number(r.outstanding ?? 0),
    since: String(r.since ?? '').slice(0, 10),
  }));
}

/** Laba per kategori perangkat menurut tanggal SELESAI (0074), sama seperti leaderboard. */
export async function fetchCategoryProfit(args: {
  orgId: string;
  from: string;
  to: string;
  outletId: string | null;
}): Promise<{ category: string; count: number; revenue: number; profit: number }[]> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('category_profit', {
    p_org_id: args.orgId,
    p_from: args.from,
    p_to: args.to,
    p_outlet_id: args.outletId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    category: String(r.category ?? 'Lainnya'),
    count: Number(r.units ?? 0),
    revenue: Number(r.revenue ?? 0),
    profit: Number(r.profit ?? 0),
  }));
}

/** Buat PO dengan nomor yang ditetapkan server (0071). */
export async function createPurchaseOrder(args: {
  orgId: string;
  supplierId: string;
  lines: unknown[];
  note: string;
  outletId: string | null;
}): Promise<{ id: string; poNumber: string }> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('create_purchase_order', {
    p_org_id: args.orgId,
    p_supplier_id: args.supplierId,
    p_lines: args.lines,
    p_note: args.note,
    p_outlet_id: args.outletId,
  });
  if (error) throw new Error(error.message);
  const row = data as { id: string; poNumber: string };
  return { id: row.id, poNumber: row.poNumber };
}

/** Perbaiki PO selama belum ada barang yang diterima (0071). */
export async function updatePurchaseOrder(args: {
  orgId: string;
  poId: string;
  supplierId: string;
  lines: unknown[];
  note: string;
}): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('update_purchase_order', {
    p_org_id: args.orgId,
    p_po_id: args.poId,
    p_supplier_id: args.supplierId,
    p_lines: args.lines,
    p_note: args.note,
  });
  if (error) throw new Error(error.message);
}

export async function receiveGoodsWithFinance(args: {
  orgId: string;
  poId: string;
  lines: unknown[];
  deltas: unknown[];
  status: string;
  outletId: string | null;
  walletId: string | null;
  amount: number;
}): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('receive_goods_v2', {
    p_org_id: args.orgId,
    p_po_id: args.poId,
    p_lines: args.lines,
    p_deltas: args.deltas,
    p_status: args.status,
    p_outlet_id: args.outletId,
    p_wallet_id: args.walletId,
    p_amount: args.amount,
  });
  if (error) throw new Error(error.message);
}

/**
 * Cloud PO void via `void_po` (atomic, 0034): reverses received stock, refunds
 * wallet balances for linked expenses, deletes those expenses, and sets the PO
 * to 'cancelled'. Used for automatic, clean cancellation of a received PO.
 */
export async function voidPurchaseOrder(args: {
  orgId: string;
  poId: string;
  outletId: string | null;
}): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('void_po', {
    p_org_id: args.orgId,
    p_po_id: args.poId,
    p_outlet_id: args.outletId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Cloud wallet-to-wallet transfer via the `transfer_wallet` RPC (atomic,
 * manager-only). Moves funds between two wallets in the same org without
 * booking income/expense (a transfer is neither profit nor loss, so it must
 * not distort reports). Server validates manager role, distinct wallets,
 * positive amount, and sufficient balance.
 */
export async function transferWallet(args: {
  orgId: string;
  fromWalletId: string;
  toWalletId: string;
  amount: number;
}): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('transfer_wallet', {
    p_org_id: args.orgId,
    p_from_wallet_id: args.fromWalletId,
    p_to_wallet_id: args.toWalletId,
    p_amount: args.amount,
  });
  if (error) throw new Error(error.message);
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
  /** Batas klaim undangan (0078). Lewat dari ini, undangannya ditolak server. */
  expiresAt: string | null;
}

/** Manager creates a pending invite for an email + role (+ assigned outlets). */
export async function inviteMember(args: {
  orgId: string;
  email: string;
  name: string;
  role: string;
  outletIds?: string[];
}): Promise<PendingInvite> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  // Go through the create_invite RPC (security definer) rather than a direct
  // upsert: it enforces one-shop-per-email by rejecting emails already an active
  // member or pending invite in ANOTHER org (a cross-org check RLS hides from
  // the client). Throws the server's Indonesian message on rejection.
  const { data, error } = await c.rpc('create_invite', {
    p_org_id: args.orgId,
    p_email: args.email.trim().toLowerCase(),
    p_name: args.name.trim(),
    p_role: args.role,
    p_outlet_ids: args.outletIds ?? [],
  });
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    orgId: data.org_id,
    email: data.email,
    name: data.name,
    role: data.role,
    createdAt: data.created_at,
    claimedAt: data.claimed_at,
    expiresAt: data.expires_at ?? null,
  };
}

/** Manager sets the outlets a member is assigned to (replaces the set). */
export async function setMemberOutlets(
  memberId: string,
  outletIds: string[],
): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('set_member_outlets', {
    p_member_id: memberId,
    p_outlet_ids: outletIds,
  });
  if (error) throw new Error(error.message);
}

/** List a member's assigned outlet ids. */
export async function getMemberOutlets(memberId: string): Promise<string[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c
    .from('membership_outlets')
    .select('outlet_id')
    .eq('membership_id', memberId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.outlet_id as string);
}

/**
 * Fetch all member->outlet assignments for an org in one query, keyed by
 * membership_id. Used by the team list to show each member's branches at a
 * glance without an N+1 query per row.
 */
export async function getOrgMemberOutlets(
  orgId: string,
): Promise<Record<string, string[]>> {
  const c = getSupabase();
  if (!c) return {};
  const { data, error } = await c
    .from('membership_outlets')
    .select('membership_id, outlet_id')
    .eq('org_id', orgId);
  if (error) throw new Error(error.message);
  const map: Record<string, string[]> = {};
  for (const r of data ?? []) {
    const mid = r.membership_id as string;
    (map[mid] ??= []).push(r.outlet_id as string);
  }
  return map;
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
    expiresAt: d.expires_at ?? null,
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
  const { error } = await c.rpc('set_member_role', {
    p_member_id: memberId,
    p_role: role,
  });
  if (error) throw new Error(error.message);
}

/** Manager deactivates a member (refuses the last active owner). */
export async function deactivateMember(memberId: string): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('deactivate_member', { p_member_id: memberId });
  if (error) throw new Error(error.message);
}

/**
 * Owner soft-deletes an inactive member (sets deleted_at).
 * Guards (enforced server-side):
 * - Caller must be org owner.
 * - Target member must already be inactive (active = false).
 * - Cannot delete self.
 * Historical data (activity logs, services, etc.) remains intact.
 */
export async function deleteMember(memberId: string): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('delete_member', { p_member_id: memberId });
  if (error) throw new Error(error.message);
}

// ============================================================
// Billing history. Since 0047 clients only read invoices; a platform operator
// creates paid manual_whatsapp rows through adminConfirmManualPayment.
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

// ============================================================
// Dashboard operator (LINTAS-TENANT — migration 0045).
//
// Ini satu-satunya jalur di klien yang membaca data di luar org sendiri.
// Semuanya lewat RPC `security definer` yang di-gate `is_platform_admin()` di
// server; TIDAK ADA service key di browser, dan repository/useCollection tidak
// dipakai karena SupabaseAdapter single-tenant secara konstruksi.
//
// Yang diekspos hanya METADATA + JUMLAH AGREGAT, bukan isi bisnis klien.
// ============================================================

/** Apakah user yang login adalah admin platform (vendor FixMaster). */
export async function isPlatformAdmin(): Promise<boolean> {
  const c = getSupabase();
  if (!c) return false;
  const { data, error } = await c.rpc('is_platform_admin');
  // Bukan admin / RPC belum ter-deploy → perlakukan sebagai bukan admin.
  // Fail-closed: jangan pernah membuka dashboard karena error.
  if (error) return false;
  return data === true;
}

/** Satu baris ringkasan per org klien. Jumlah saja, tanpa isi bisnis. */
export interface AdminOrgRow {
  orgId: string;
  name: string;
  plan: string;
  expiresAt: string | null;
  registeredAt: string;
  isDemo: boolean;
  outletCount: number;
  userCount: number;
  serviceCount: number;
  lastActivityAt: string | null;
  lastPaidAt: string | null;
  lastPaidReference: string | null;
  /** Catatan internal vendor. Tidak pernah terlihat klien. */
  note: string;
}

function toAdminOrg(d: Record<string, unknown>): AdminOrgRow {
  return {
    orgId: d.org_id as string,
    name: (d.org_name as string) ?? '',
    plan: d.org_plan as string,
    expiresAt: (d.expires_at as string | null) ?? null,
    registeredAt: d.registered_at as string,
    isDemo: Boolean(d.demo),
    outletCount: Number(d.outlet_count ?? 0),
    userCount: Number(d.user_count ?? 0),
    serviceCount: Number(d.service_count ?? 0),
    lastActivityAt: (d.last_activity_at as string | null) ?? null,
    lastPaidAt: (d.last_paid_at as string | null) ?? null,
    lastPaidReference: (d.last_paid_reference as string | null) ?? null,
    note: (d.note as string) ?? '',
  };
}

/** Daftar semua org klien, paling dekat jatuh tempo di atas. Admin-only. */
export async function adminListOrgs(): Promise<AdminOrgRow[]> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('admin_list_orgs');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toAdminOrg);
}

/**
 * Kontrol operator (migration 0046). SETIAP fungsi tulis di bawah dicatat ke
 * `operator_actions` oleh RPC-nya sendiri — pencatatan bukan tanggung jawab
 * pemanggil, supaya tidak bisa lupa. Lihat header 0046.
 */

/** Tangguhkan org: RLS memblokir seluruh operasi tulis mereka. Alasan wajib. */
export async function adminSuspendOrg(orgId: string, reason: string): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('admin_suspend_org', {
    p_org_id: orgId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

/**
 * Record a verified WhatsApp payment and extend access atomically. The RPC
 * creates a paid invoice and an operator audit row; the browser never edits
 * subscription dates directly.
 */
export async function adminConfirmManualPayment(
  orgId: string,
  plan: string,
  months: number,
  amount: number,
  reference: string,
  reason: string,
): Promise<string> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('admin_confirm_manual_payment', {
    p_org_id: orgId,
    p_plan: plan,
    p_months: months,
    p_amount: amount,
    p_reference: reference,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Simpan catatan internal vendor tentang sebuah klien. */
export async function adminSetClientNote(orgId: string, note: string): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('admin_set_client_note', {
    p_org_id: orgId,
    p_note: note,
  });
  if (error) throw new Error(error.message);
}

/**
 * Permanently erase an organization and every tenant row that cascades from it.
 * Auth users are deliberately retained; the server writes an immutable operator
 * audit row before deleting the organization.
 */
export async function adminDeleteOrganization(
  orgId: string,
  confirmation: string,
  reason: string,
): Promise<void> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { error } = await c.rpc('admin_delete_org', {
    p_org_id: orgId,
    p_confirmation: confirmation,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

/** Satu baris jejak aksi operator. */
export interface OperatorAction {
  id: string;
  orgName: string;
  actorEmail: string;
  action: string;
  reason: string;
  detail: Record<string, unknown>;
  actedAt: string;
}

export async function adminListOperatorActions(limit = 50): Promise<OperatorAction[]> {
  const c = getSupabase();
  if (!c) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await c.rpc('admin_list_operator_actions', { p_limit: limit });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((d) => ({
    id: d.action_id as string,
    orgName: (d.org_name as string) ?? '',
    actorEmail: (d.actor_email as string) ?? '',
    action: d.action as string,
    reason: (d.reason as string) ?? '',
    detail: (d.detail as Record<string, unknown>) ?? {},
    actedAt: d.acted_at as string,
  }));
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

/** Connection status surfaced to the UI (badge) and used to drive resync. */
export type RealtimeStatus = 'connecting' | 'live' | 'offline';

/**
 * Subscribe to realtime changes for a set of DOMAIN tables in one org, on a
 * single channel. Fires `onChange(table)` for every insert/update/delete on a
 * row belonging to this org, so other devices can refetch the affected
 * collection (multi-cashier live sync). RLS still applies on the stream, and
 * an explicit `org_id=eq.<orgId>` filter scopes each listener. Requires the
 * tables to be in the `supabase_realtime` publication (migration 0021).
 *
 * RESILIENCE (the FixNova lesson, adapted): a Supabase channel can die silently
 * after sleep / network drop and never recover, leaving a device stale with no
 * signal. So this:
 *   - reports status via `onStatus` ('connecting' | 'live' | 'offline'),
 *   - auto-reconnects with exponential backoff + jitter on
 *     CHANNEL_ERROR / TIMED_OUT / CLOSED,
 *   - runs a health-check that force-reconnects a "zombie" channel (no events
 *     for HEALTH_IDLE_MS while not joined).
 * The caller (SupabaseAdapter) uses the 'offline'→'live' transition to trigger
 * a full resync (refetch every collection), since events may have been missed.
 *
 * Returns an unsubscribe function (no-op when unconfigured).
 */
export function subscribeOrgTables(
  orgId: string,
  tables: readonly string[],
  onChange: (table: string) => void,
  onStatus?: (status: RealtimeStatus) => void,
): () => void {
  const c = getSupabase();
  if (!c || !orgId || tables.length === 0) return () => {};

  let channel: ReturnType<SupabaseClient['channel']> | null = null;
  let attempt = 0;
  let lastEventAt = Date.now();
  let disposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let healthTimer: ReturnType<typeof setInterval> | null = null;

  const setStatus = (s: RealtimeStatus) => {
    if (!disposed) onStatus?.(s);
  };

  const teardownChannel = () => {
    if (channel) {
      // Kosongkan DULU: removeChannel bisa memanggil callback 'CLOSED' secara
      // sinkron, dan penjaga `channel !== ch` di bawah harus sudah berlaku.
      const old = channel;
      channel = null;
      void c.removeChannel(old);
    }
  };

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer) return;
    const delay = withJitter(computeBackoff(attempt));
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (disposed) return;
    teardownChannel();
    setStatus('connecting');
    let ch = c.channel(`org-domain:${orgId}`);
    for (const table of tables) {
      // `organizations` is keyed by `id`; every domain table is keyed by
      // `org_id`. Filtering the wrong column silently yields zero events.
      const filter = table === 'organizations' ? `id=eq.${orgId}` : `org_id=eq.${orgId}`;
      ch = ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        (payload) => {
          lastEventAt = Date.now();
          onChange((payload.table as string) ?? table);
        },
      );
    }
    channel = ch;
    ch.subscribe((status) => {
      // removeChannel() memanggil callback kanal LAMA dengan 'CLOSED'. Tanpa
      // penjaga ini, tiap reconnect membuang kanal lama → CLOSED → reconnect
      // lagi → 'live' → notifyAll: putaran tanpa akhir yang menarik ulang semua
      // koleksi (terukur 23 Sep 2026: 145× daftar servis dalam 3 menit).
      if (disposed || channel !== ch) return;
      lastEventAt = Date.now();
      if (status === 'SUBSCRIBED') {
        attempt = 0;
        setStatus('live');
      } else if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        setStatus('offline');
        scheduleReconnect();
      }
    });
  };

  // Health-check: a channel that has gone silent past the idle window AND is no
  // longer joined is a zombie → force a reconnect. A joined-but-silent channel
  // is normal (no writes happening), so we leave it alone.
  healthTimer = setInterval(() => {
    if (disposed) return;
    const joined = channel?.state === 'joined';
    if (!joined && isHealthDue(lastEventAt, Date.now())) {
      setStatus('offline');
      teardownChannel();
      scheduleReconnect();
    }
  }, HEALTH_IDLE_MS);

  connect();

  return () => {
    disposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (healthTimer) clearInterval(healthTimer);
    teardownChannel();
  };
}
