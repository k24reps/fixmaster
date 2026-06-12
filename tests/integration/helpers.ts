/**
 * Integration test harness for RLS / RPC security checks against the
 * STAGING Supabase project. Uses two kinds of client:
 *   - anon client + a real user JWT  → mimics the browser (RLS applies)
 *   - service_role admin client      → seed/teardown only (bypasses RLS)
 *
 * Credentials are read from `.env.test.local` at the repo root (gitignored
 * via `*.local`). The service_role key MUST NOT carry a VITE_ prefix.
 *
 * These tests CREATE and DELETE real users + orgs on staging, then clean up.
 * They never touch production.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(): Record<string, string> {
  const out: Record<string, string> = {};
  let text: string;
  try {
    text = readFileSync(resolve(process.cwd(), '.env.test.local'), 'utf8');
  } catch {
    return out;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = loadEnvFile();
export const SUPABASE_URL =
  env.VITE_SUPABASE_URL ?? env.TEST_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
export const ANON_KEY =
  env.VITE_SUPABASE_ANON_KEY ?? env.TEST_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
export const SERVICE_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const hasConfig = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY);

const opts = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function makeAnon(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, opts);
}
export function makeAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, opts);
}

export interface Actor {
  email: string;
  userId: string;
  membershipId: string | null;
  client: SupabaseClient;
}

export interface TenantCtx {
  admin: SupabaseClient;
  runId: string;
  password: string;
  orgA: string;
  orgB: string;
  ownerA: Actor;
  adminA: Actor;
  karyawanA: Actor;
  ownerB: Actor;
  // Seeded row ids
  custBId: string;
  saleAId: string;
  saleBId: string;
  serviceANo: string;
}

export async function createUser(admin: SupabaseClient, email: string, password: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

export async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const c = makeAnon();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

/** Create 2 orgs (A with owner+admin+karyawan, B with owner) + seed rows. */
export async function setupTenants(): Promise<TenantCtx> {
  const admin = makeAdmin();
  const runId = Date.now().toString(36);
  const password = `Tst!${runId}Aa9`;
  const mk = (label: string) => `fmtest+${runId}-${label}@example.com`;

  const ownerAEmail = mk('ownera');
  const adminAEmail = mk('admina');
  const karyawanAEmail = mk('karyawana');
  const ownerBEmail = mk('ownerb');

  const ownerAId = await createUser(admin, ownerAEmail, password);
  const adminAId = await createUser(admin, adminAEmail, password);
  const karyawanAId = await createUser(admin, karyawanAEmail, password);
  const ownerBId = await createUser(admin, ownerBEmail, password);

  // Org A via ownerA (RPC bootstraps owner membership).
  const ownerAClient = await signIn(ownerAEmail, password);
  const { data: orgA, error: eA } = await ownerAClient.rpc('create_organization', {
    p_name: `OrgA-${runId}`,
    p_owner_name: 'Owner A',
  });
  if (eA || !orgA) throw new Error(`create_organization A: ${eA?.message}`);
  const { data: omA } = await ownerAClient
    .from('memberships')
    .select('id')
    .eq('org_id', orgA)
    .eq('user_id', ownerAId)
    .single();

  // Org B via ownerB.
  const ownerBClient = await signIn(ownerBEmail, password);
  const { data: orgB, error: eB } = await ownerBClient.rpc('create_organization', {
    p_name: `OrgB-${runId}`,
    p_owner_name: 'Owner B',
  });
  if (eB || !orgB) throw new Error(`create_organization B: ${eB?.message}`);

  // Add admin + karyawan to org A via service_role (bypasses RLS for seeding).
  const { data: mAdmin } = await admin
    .from('memberships')
    .insert({ org_id: orgA, user_id: adminAId, name: 'Admin A', role: 'admin', active: true })
    .select('id')
    .single();
  const { data: mKar } = await admin
    .from('memberships')
    .insert({ org_id: orgA, user_id: karyawanAId, name: 'Karyawan A', role: 'karyawan', active: true })
    .select('id')
    .single();

  const adminAClient = await signIn(adminAEmail, password);
  const karyawanAClient = await signIn(karyawanAEmail, password);

  // ---- Seed rows (service_role) ----
  const today = new Date().toISOString().slice(0, 10);
  const { data: custB } = await admin
    .from('customers')
    .insert({ org_id: orgB, name: 'Pelanggan B', phone: '0811' })
    .select('id')
    .single();
  const { data: saleA } = await admin
    .from('sales')
    .insert({ org_id: orgA, sale_no: `S-${runId}-A1`, date: today, total: 1000, lines: [], payments: [] })
    .select('id')
    .single();
  const { data: saleB } = await admin
    .from('sales')
    .insert({ org_id: orgB, sale_no: `S-${runId}-B1`, date: today, total: 1000, lines: [], payments: [] })
    .select('id')
    .single();
  await admin
    .from('incomes')
    .insert({ org_id: orgA, date: today, category: 'Servis', amount: 5000 });
  const serviceANo = `SVC-${runId}-A1`;
  await admin.from('services').insert({
    org_id: orgA,
    service_no: serviceANo,
    device: 'iPhone 12',
    status: 'diterima',
    history: [
      { internal: true, note: 'CATATAN-RAHASIA-INTERNAL' },
      { internal: false, note: 'Unit diterima' },
    ],
  });

  return {
    admin,
    runId,
    password,
    orgA: orgA as string,
    orgB: orgB as string,
    ownerA: { email: ownerAEmail, userId: ownerAId, membershipId: omA?.id ?? null, client: ownerAClient },
    adminA: { email: adminAEmail, userId: adminAId, membershipId: mAdmin?.id ?? null, client: adminAClient },
    karyawanA: { email: karyawanAEmail, userId: karyawanAId, membershipId: mKar?.id ?? null, client: karyawanAClient },
    ownerB: { email: ownerBEmail, userId: ownerBId, membershipId: null, client: ownerBClient },
    custBId: custB?.id as string,
    saleAId: saleA?.id as string,
    saleBId: saleB?.id as string,
    serviceANo,
  };
}

export async function teardownTenants(ctx: TenantCtx): Promise<void> {
  // Cascade deletes memberships + all org-scoped data.
  await ctx.admin.from('organizations').delete().eq('id', ctx.orgA);
  await ctx.admin.from('organizations').delete().eq('id', ctx.orgB);
  for (const id of [ctx.ownerA.userId, ctx.adminA.userId, ctx.karyawanA.userId, ctx.ownerB.userId]) {
    try {
      await ctx.admin.auth.admin.deleteUser(id);
    } catch {
      /* best-effort cleanup */
    }
  }
}
