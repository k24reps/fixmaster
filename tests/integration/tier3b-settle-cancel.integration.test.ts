/**
 * TIER 3B — RPC split-settle & cancel oleh KARYAWAN (migrasi 0029).
 *
 * Membuktikan bahwa setelah 0028 (RLS per-outlet) mengunci tulis langsung ke
 * wallets/incomes/inventory (manager-only), karyawan TETAP bisa menyelesaikan
 * alur billing lewat RPC security-definer 0029:
 *   - settle_service(p_payments[]) → lunas + income per-leg (split payment),
 *     wallet dikredit; ditolak bila outlet di luar penugasan.
 *   - cancel_service → restore stok ter-deducted + refund DP + status batal.
 *
 * Self-contained: membuat org + 2 outlet + owner + karyawan + wallet +
 * inventory + service sendiri, lalu membersihkannya. Menembak STAGING.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasConfig, makeAdmin, createUser, signIn, type Actor } from './helpers';

const d = hasConfig ? describe : describe.skip;

interface Ctx {
  admin: SupabaseClient;
  orgId: string;
  outlet1: string;
  outlet2: string;
  karyawan: Actor;
  walletA: string;
  walletB: string;
  userIds: string[];
}

let ctx: Ctx;

beforeAll(async () => {
  if (!hasConfig) return;
  const admin = makeAdmin();
  const runId = Date.now().toString(36);
  const password = `Tst!${runId}Sc9`;
  const mk = (label: string) => `fmtest+${runId}-${label}@example.com`;

  const ownerEmail = mk('sc-owner');
  const karyawanEmail = mk('sc-kar');
  const ownerId = await createUser(admin, ownerEmail, password);
  const karyawanId = await createUser(admin, karyawanEmail, password);

  const ownerClient = await signIn(ownerEmail, password);
  const { data: orgId, error: eOrg } = await ownerClient.rpc('create_organization', {
    p_name: `OrgSettle-${runId}`,
    p_owner_name: 'Owner S',
  });
  if (eOrg || !orgId) throw new Error(`create_organization: ${eOrg?.message}`);

  const { data: o1 } = await admin
    .from('outlets')
    .insert({ org_id: orgId, name: 'Cabang Satu', is_primary: true })
    .select('id')
    .single();
  const { data: o2 } = await admin
    .from('outlets')
    .insert({ org_id: orgId, name: 'Cabang Dua', is_primary: false })
    .select('id')
    .single();

  const { data: mKar } = await admin
    .from('memberships')
    .insert({ org_id: orgId, user_id: karyawanId, name: 'Karyawan S', role: 'karyawan', active: true })
    .select('id')
    .single();
  await admin.from('membership_outlets').insert({ membership_id: mKar!.id, outlet_id: o1!.id, org_id: orgId });

  // Two wallets for split payment.
  const { data: wA } = await admin
    .from('wallets')
    .insert({ org_id: orgId, name: 'Tunai', balance: 0 })
    .select('id')
    .single();
  const { data: wB } = await admin
    .from('wallets')
    .insert({ org_id: orgId, name: 'QRIS', balance: 0 })
    .select('id')
    .single();

  const karyawanClient = await signIn(karyawanEmail, password);

  ctx = {
    admin,
    orgId: orgId as string,
    outlet1: o1!.id,
    outlet2: o2!.id,
    karyawan: { email: karyawanEmail, userId: karyawanId, membershipId: mKar!.id, client: karyawanClient },
    walletA: wA!.id,
    walletB: wB!.id,
    userIds: [ownerId, karyawanId],
  };
}, 120000);

afterAll(async () => {
  if (ctx) {
    await ctx.admin.from('organizations').delete().eq('id', ctx.orgId);
    for (const id of ctx.userIds) {
      try {
        await ctx.admin.auth.admin.deleteUser(id);
      } catch {
        /* best-effort */
      }
    }
  }
}, 120000);

d('Tier 3B — settle_service split + cancel_service (RPC 0029)', () => {
  it('karyawan BISA settle split (2 wallet) untuk outlet yang ditugaskan', async () => {
    const no = `SVC-SET-${Date.now().toString(36)}`;
    const { data: svc } = await ctx.admin
      .from('services')
      .insert({ org_id: ctx.orgId, service_no: no, device: 'iPhone', status: 'selesai', outlet_id: ctx.outlet1, final_cost: 300000 })
      .select('id')
      .single();

    const { error } = await ctx.karyawan.client.rpc('settle_service', {
      p_org_id: ctx.orgId,
      p_service_id: svc!.id,
      p_payments: [
        { walletId: ctx.walletA, amount: 200000 },
        { walletId: ctx.walletB, amount: 100000 },
      ],
      p_history: [],
      p_outlet_id: ctx.outlet1,
    });
    expect(error).toBeNull();

    // Verify via admin: status lunas, 2 income legs ber-nomor, wallet dikredit.
    const { data: svcRow } = await ctx.admin.from('services').select('status').eq('id', svc!.id).single();
    expect(svcRow!.status).toBe('lunas');

    const { data: incomes } = await ctx.admin
      .from('incomes')
      .select('amount, wallet_id, description')
      .eq('service_id', svc!.id);
    expect((incomes ?? []).length).toBe(2);
    expect(incomes!.every((i) => i.description === `Pelunasan servis ${no}`)).toBe(true);
    expect(incomes!.reduce((s, i) => s + Number(i.amount), 0)).toBe(300000);

    const { data: wa } = await ctx.admin.from('wallets').select('balance').eq('id', ctx.walletA).single();
    expect(Number(wa!.balance)).toBe(200000);
  });

  it('karyawan TIDAK bisa settle untuk outlet di luar penugasan (Outlet 2)', async () => {
    const no = `SVC-DENY-${Date.now().toString(36)}`;
    const { data: svc } = await ctx.admin
      .from('services')
      .insert({ org_id: ctx.orgId, service_no: no, device: 'Tab', status: 'selesai', outlet_id: ctx.outlet2, final_cost: 50000 })
      .select('id')
      .single();

    const { error } = await ctx.karyawan.client.rpc('settle_service', {
      p_org_id: ctx.orgId,
      p_service_id: svc!.id,
      p_payments: [{ walletId: ctx.walletA, amount: 50000 }],
      p_history: [],
      p_outlet_id: ctx.outlet2,
    });
    expect(error).not.toBeNull(); // ditolak: outlet bukan penugasannya
  });

  it('karyawan BISA cancel_service: restore stok + refund DP + status batal', async () => {
    const no = `SVC-CXL-${Date.now().toString(36)}`;
    // Inventory item with stock already deducted by 2.
    const { data: item } = await ctx.admin
      .from('inventory_items')
      .insert({ org_id: ctx.orgId, outlet_id: ctx.outlet1, name: 'LCD', stock: 8, cost_price: 100000, sell_price: 150000 })
      .select('id')
      .single();

    // Service with a deducted sparepart + a DP of 75k already booked.
    const { data: svc } = await ctx.admin
      .from('services')
      .insert({
        org_id: ctx.orgId,
        service_no: no,
        device: 'Laptop',
        status: 'pengerjaan',
        outlet_id: ctx.outlet1,
        final_cost: 0,
        down_payment: 75000,
        spareparts: [{ itemId: item!.id, name: 'LCD', qty: 2, costPrice: 100000, sellPrice: 150000, deducted: true }],
      })
      .select('id')
      .single();
    await ctx.admin.from('wallets').update({ balance: 75000 }).eq('id', ctx.walletA);
    await ctx.admin.from('incomes').insert({
      org_id: ctx.orgId,
      outlet_id: ctx.outlet1,
      date: new Date().toISOString().slice(0, 10),
      category: 'Servis',
      amount: 75000,
      wallet_id: ctx.walletA,
      description: `DP servis ${no}`,
      service_id: svc!.id,
    });

    const { error } = await ctx.karyawan.client.rpc('cancel_service', {
      p_org_id: ctx.orgId,
      p_service_id: svc!.id,
      p_history: [],
      p_outlet_id: ctx.outlet1,
    });
    expect(error).toBeNull();

    // Stock restored 8 → 10.
    const { data: itemRow } = await ctx.admin.from('inventory_items').select('stock').eq('id', item!.id).single();
    expect(itemRow!.stock).toBe(10);

    // DP income removed + wallet reversed back to 75000 - 75000 = 0.
    const { data: dpIncomes } = await ctx.admin
      .from('incomes')
      .select('id')
      .eq('service_id', svc!.id)
      .eq('description', `DP servis ${no}`);
    expect((dpIncomes ?? []).length).toBe(0);
    const { data: wa } = await ctx.admin.from('wallets').select('balance').eq('id', ctx.walletA).single();
    expect(Number(wa!.balance)).toBe(0);

    // Service is batal, DP zeroed, sparepart un-deducted.
    const { data: svcRow } = await ctx.admin
      .from('services')
      .select('status, down_payment, spareparts')
      .eq('id', svc!.id)
      .single();
    expect(svcRow!.status).toBe('batal');
    expect(Number(svcRow!.down_payment)).toBe(0);
    expect((svcRow!.spareparts as { deducted: boolean }[])[0].deducted).toBe(false);
  });
});
