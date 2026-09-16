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
import { SERVICE_LIST_COLUMNS } from '@/data/types';
import { serviceSearchFilter } from '@/lib/business/serviceFilters';

const d = hasConfig ? describe : describe.skip;

interface Ctx {
  admin: SupabaseClient;
  orgId: string;
  outlet1: string;
  outlet2: string;
  ownerClient: SupabaseClient;
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
    ownerClient,
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
  it('owner BISA settle split (2 wallet)', async () => {
    const no = `SVC-SET-${Date.now().toString(36)}`;
    const { data: svc } = await ctx.admin
      .from('services')
      .insert({ org_id: ctx.orgId, service_no: no, device: 'iPhone', status: 'selesai', outlet_id: ctx.outlet1, final_cost: 300000 })
      .select('id')
      .single();

    const { error } = await ctx.ownerClient.rpc('settle_service', {
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

  it('0065: karyawan TIDAK bisa melunasi/membatalkan — lewat RPC maupun update status langsung', async () => {
    const no = `SVC-DENY-${Date.now().toString(36)}`;
    const { data: svc } = await ctx.admin
      .from('services')
      .insert({ org_id: ctx.orgId, service_no: no, device: 'Tab', status: 'selesai', outlet_id: ctx.outlet1, final_cost: 50000 })
      .select('id')
      .single();

    const settleRes = await ctx.karyawan.client.rpc('settle_service', {
      p_org_id: ctx.orgId,
      p_service_id: svc!.id,
      p_payments: [{ walletId: ctx.walletA, amount: 50000 }],
      p_history: [],
      p_outlet_id: ctx.outlet1,
    });
    expect(settleRes.error).not.toBeNull();
    const cancelRes = await ctx.karyawan.client.rpc('cancel_service', {
      p_org_id: ctx.orgId,
      p_service_id: svc!.id,
      p_history: [],
      p_outlet_id: ctx.outlet1,
      p_refund_amount: 0,
      p_refund_wallet_id: null,
    });
    expect(cancelRes.error).not.toBeNull();
    await ctx.karyawan.client.from('services').update({ status: 'lunas' }).eq('id', svc!.id);

    const { data: row } = await ctx.admin.from('services').select('status').eq('id', svc!.id).single();
    expect(row!.status).toBe('selesai');
    const { data: incomes } = await ctx.admin.from('incomes').select('id').eq('service_id', svc!.id);
    expect(incomes ?? []).toHaveLength(0);

    // Status kerja biasa tetap boleh untuk karyawan (buka lagi dari Selesai).
    const { error: reopenErr } = await ctx.karyawan.client.from('services').update({ status: 'pengerjaan' }).eq('id', svc!.id);
    expect(reopenErr).toBeNull();
  });

  it('owner BISA cancel_service dengan refund DP PARSIAL: expense refund + income DP tetap', async () => {
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
    const { data: wBefore } = await ctx.admin.from('wallets').select('balance').eq('id', ctx.walletA).single();
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

    // Refund only 50k of the 75k DP (shop keeps 25k, e.g. diagnosis fee).
    const { error } = await ctx.ownerClient.rpc('cancel_service', {
      p_org_id: ctx.orgId,
      p_service_id: svc!.id,
      p_history: [],
      p_outlet_id: ctx.outlet1,
      p_refund_amount: 50000,
      p_refund_wallet_id: ctx.walletA,
    });
    expect(error).toBeNull();

    // Stock restored 8 → 10.
    const { data: itemRow } = await ctx.admin.from('inventory_items').select('stock').eq('id', item!.id).single();
    expect(itemRow!.stock).toBe(10);

    // DP income KEPT (audit intact).
    const { data: dpIncomes } = await ctx.admin
      .from('incomes')
      .select('amount')
      .eq('service_id', svc!.id)
      .eq('description', `DP servis ${no}`);
    expect((dpIncomes ?? []).length).toBe(1);

    // Refund booked as an expense.
    const { data: refundExp } = await ctx.admin
      .from('expenses')
      .select('amount')
      .eq('org_id', ctx.orgId)
      .eq('description', `Refund DP servis ${no}`);
    expect((refundExp ?? []).length).toBe(1);
    expect(Number(refundExp![0].amount)).toBe(50000);

    // Wallet debited only by the refund (delta = -50k), not the full DP.
    const { data: wAfter } = await ctx.admin.from('wallets').select('balance').eq('id', ctx.walletA).single();
    expect(Number(wAfter!.balance) - Number(wBefore!.balance)).toBe(-50000);

    // Service is batal, sparepart un-deducted (down_payment left as-is).
    const { data: svcRow } = await ctx.admin
      .from('services')
      .select('status, spareparts')
      .eq('id', svc!.id)
      .single();
    expect(svcRow!.status).toBe('batal');
    expect((svcRow!.spareparts as { deducted: boolean }[])[0].deducted).toBe(false);
  });

  it('owner BISA cancel_service tanpa refund (refund 0): tak ada expense, wallet utuh', async () => {
    const no = `SVC-CXL0-${Date.now().toString(36)}`;
    const { data: svc } = await ctx.admin
      .from('services')
      .insert({ org_id: ctx.orgId, service_no: no, device: 'Hp', status: 'diagnosa', outlet_id: ctx.outlet1, final_cost: 0, down_payment: 30000 })
      .select('id')
      .single();
    const { data: wBefore } = await ctx.admin.from('wallets').select('balance').eq('id', ctx.walletA).single();

    const { error } = await ctx.ownerClient.rpc('cancel_service', {
      p_org_id: ctx.orgId,
      p_service_id: svc!.id,
      p_history: [],
      p_outlet_id: ctx.outlet1,
      p_refund_amount: 0,
      p_refund_wallet_id: null,
    });
    expect(error).toBeNull();

    // No refund expense, wallet unchanged (shop keeps the whole DP).
    const { data: refundExp } = await ctx.admin
      .from('expenses').select('id').eq('org_id', ctx.orgId).eq('description', `Refund DP servis ${no}`);
    expect((refundExp ?? []).length).toBe(0);
    const { data: wAfter } = await ctx.admin.from('wallets').select('balance').eq('id', ctx.walletA).single();
    expect(Number(wAfter!.balance) - Number(wBefore!.balance)).toBe(0);

    const { data: svcRow } = await ctx.admin.from('services').select('status').eq('id', svc!.id).single();
    expect(svcRow!.status).toBe('batal');
  });

  it('karyawan BISA record_down_payment: income DP + kredit wallet + akumulasi DP', async () => {
    const no = `SVC-DP-${Date.now().toString(36)}`;
    const { data: svc } = await ctx.admin
      .from('services')
      .insert({ org_id: ctx.orgId, service_no: no, device: 'iPad', status: 'diagnosa', outlet_id: ctx.outlet1, final_cost: 0, down_payment: 0 })
      .select('id')
      .single();
    const { data: wBefore } = await ctx.admin.from('wallets').select('balance').eq('id', ctx.walletB).single();

    const { error } = await ctx.karyawan.client.rpc('record_down_payment', {
      p_org_id: ctx.orgId,
      p_service_id: svc!.id,
      p_wallet_id: ctx.walletB,
      p_amount: 100000,
      p_outlet_id: ctx.outlet1,
    });
    expect(error).toBeNull();

    // Income 'DP servis <no>' tercatat, ter-tag outlet & service.
    const { data: dpIncomes } = await ctx.admin
      .from('incomes')
      .select('amount, description')
      .eq('service_id', svc!.id)
      .eq('description', `DP servis ${no}`);
    expect((dpIncomes ?? []).length).toBe(1);
    expect(Number(dpIncomes![0].amount)).toBe(100000);

    // Wallet bertambah 100k (delta — tak bergantung urutan test).
    const { data: wAfter } = await ctx.admin.from('wallets').select('balance').eq('id', ctx.walletB).single();
    expect(Number(wAfter!.balance) - Number(wBefore!.balance)).toBe(100000);

    // down_payment service terakumulasi.
    const { data: svcRow } = await ctx.admin.from('services').select('down_payment').eq('id', svc!.id).single();
    expect(Number(svcRow!.down_payment)).toBe(100000);
  });

  it('karyawan TIDAK bisa record_down_payment untuk outlet di luar penugasan', async () => {
    const no = `SVC-DPDENY-${Date.now().toString(36)}`;
    const { data: svc } = await ctx.admin
      .from('services')
      .insert({ org_id: ctx.orgId, service_no: no, device: 'Hp', status: 'diagnosa', outlet_id: ctx.outlet2, final_cost: 0, down_payment: 0 })
      .select('id')
      .single();

    const { error } = await ctx.karyawan.client.rpc('record_down_payment', {
      p_org_id: ctx.orgId,
      p_service_id: svc!.id,
      p_wallet_id: ctx.walletA,
      p_amount: 50000,
      p_outlet_id: ctx.outlet2,
    });
    expect(error).not.toBeNull(); // ditolak: outlet bukan penugasannya
  });

  // ---- 0061: integritas uang & nomor tiket ----
  const seedService = async (over: Record<string, unknown>) => {
    const { data, error } = await ctx.admin
      .from('services')
      .insert({
        org_id: ctx.orgId,
        service_no: `SVC-INT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        device: 'Hp',
        outlet_id: ctx.outlet1,
        final_cost: 0,
        down_payment: 0,
        ...over,
      })
      .select('id, service_no')
      .single();
    if (error) throw new Error(`seed service: ${error.message}`);
    return data as { id: string; service_no: string };
  };
  const settle = (serviceId: string, payments: { walletId: string; amount: number }[], finalCost?: number) =>
    ctx.ownerClient.rpc('settle_service', {
      p_org_id: ctx.orgId,
      p_service_id: serviceId,
      p_payments: payments,
      p_history: [],
      p_outlet_id: ctx.outlet1,
      ...(finalCost === undefined ? {} : { p_final_cost: finalCost }),
    });

  it('0061: settle kedua kali DITOLAK — pemasukan tidak tercatat dua kali', async () => {
    const svc = await seedService({ status: 'selesai', final_cost: 100000 });
    expect((await settle(svc.id, [{ walletId: ctx.walletA, amount: 100000 }])).error).toBeNull();
    expect((await settle(svc.id, [{ walletId: ctx.walletA, amount: 100000 }])).error).not.toBeNull();
    const { data: incomes } = await ctx.admin.from('incomes').select('amount').eq('service_id', svc.id);
    expect((incomes ?? []).length).toBe(1);
  });

  it('0061: settle DITOLAK bila tiket belum Selesai', async () => {
    const svc = await seedService({ status: 'pengerjaan', final_cost: 50000 });
    expect((await settle(svc.id, [{ walletId: ctx.walletA, amount: 50000 }])).error).not.toBeNull();
    const { data: row } = await ctx.admin.from('services').select('status').eq('id', svc.id).single();
    expect(row!.status).toBe('pengerjaan');
  });

  it('0061: settle DITOLAK bila total pembayaran ≠ sisa tagihan (dihitung server)', async () => {
    const svc = await seedService({ status: 'selesai', final_cost: 100000, down_payment: 30000 });
    // Sisa tagihan 70.000; klien mengirim 100.000.
    expect((await settle(svc.id, [{ walletId: ctx.walletA, amount: 100000 }])).error).not.toBeNull();
    const { data: row } = await ctx.admin.from('services').select('status').eq('id', svc.id).single();
    expect(row!.status).toBe('selesai'); // tidak tersimpan setengah
  });

  it('0061: settle menulis biaya final + status dalam satu panggilan', async () => {
    const svc = await seedService({ status: 'selesai', final_cost: 0 });
    const { error } = await settle(svc.id, [{ walletId: ctx.walletB, amount: 120000 }], 120000);
    expect(error).toBeNull();
    const { data: row } = await ctx.admin.from('services').select('status, final_cost').eq('id', svc.id).single();
    expect(row!.status).toBe('lunas');
    expect(Number(row!.final_cost)).toBe(120000);
  });

  it('0061: cancel DITOLAK untuk tiket yang sudah Lunas', async () => {
    const svc = await seedService({ status: 'lunas', final_cost: 80000 });
    const { error } = await ctx.ownerClient.rpc('cancel_service', {
      p_org_id: ctx.orgId,
      p_service_id: svc.id,
      p_history: [],
      p_outlet_id: ctx.outlet1,
      p_refund_amount: 0,
      p_refund_wallet_id: null,
    });
    expect(error).not.toBeNull();
    const { data: row } = await ctx.admin.from('services').select('status').eq('id', svc.id).single();
    expect(row!.status).toBe('lunas');
  });

  it('0061: DP DITOLAK untuk tiket yang sudah Batal', async () => {
    const svc = await seedService({ status: 'batal' });
    const { error } = await ctx.karyawan.client.rpc('record_down_payment', {
      p_org_id: ctx.orgId,
      p_service_id: svc.id,
      p_wallet_id: ctx.walletA,
      p_amount: 10000,
      p_outlet_id: ctx.outlet1,
    });
    expect(error).not.toBeNull();
  });

  it('0061: nomor bentrok dengan tiket cabang lain → server memberi nomor berikutnya', async () => {
    const prefix = `T${Date.now().toString(36).toUpperCase()}`;
    // Tiket Outlet 2 — tidak terlihat oleh karyawan Outlet 1.
    await seedService({ service_no: `${prefix}-0001`, outlet_id: ctx.outlet2, status: 'diterima' });
    const { data, error } = await ctx.karyawan.client
      .from('services')
      .insert({ org_id: ctx.orgId, service_no: `${prefix}-0001`, device: 'Laptop', status: 'diterima', outlet_id: ctx.outlet1 })
      .select('service_no')
      .single();
    expect(error).toBeNull();
    expect(data!.service_no).toBe(`${prefix}-0002`);
  });

  it('0062: kelebihan DP dikembalikan saat pelunasan, maksimal selisihnya, dan tidak bisa dua kali', async () => {
    await ctx.admin.from('wallets').update({ balance: 500000 }).eq('id', ctx.walletB);
    const svc = await seedService({ status: 'selesai', final_cost: 70000, down_payment: 100000 });
    const call = (refund: number) =>
      ctx.ownerClient.rpc('settle_service', {
        p_org_id: ctx.orgId,
        p_service_id: svc.id,
        p_payments: [],
        p_history: [],
        p_outlet_id: ctx.outlet1,
        p_refund_amount: refund,
        p_refund_wallet_id: ctx.walletB,
      });
    expect((await call(40000)).error).not.toBeNull(); // kelebihan hanya 30.000
    expect((await call(30000)).error).toBeNull();
    const { data: row } = await ctx.admin.from('services').select('status').eq('id', svc.id).single();
    expect(row!.status).toBe('lunas');
    const { data: exp } = await ctx.admin
      .from('expenses')
      .select('amount')
      .eq('org_id', ctx.orgId)
      .eq('description', `Refund kelebihan DP servis ${svc.service_no}`);
    expect((exp ?? []).map((e) => Number(e.amount))).toEqual([30000]);
    expect((await call(30000)).error).not.toBeNull(); // tidak dua kali
  });

  it('0061: nomor servis tidak berubah lewat update', async () => {
    const svc = await seedService({ status: 'diterima' });
    await ctx.admin.from('services').update({ service_no: `${svc.service_no}-UBAH` }).eq('id', svc.id);
    const { data: row } = await ctx.admin.from('services').select('service_no').eq('id', svc.id).single();
    expect(row!.service_no).toBe(svc.service_no);
  });

  // ---- 0063: koreksi biaya & ringkasan servis ----
  const correct = (client: SupabaseClient, serviceId: string, finalCost: number, walletId: string) =>
    client.rpc('correct_service_cost', {
      p_org_id: ctx.orgId,
      p_service_id: serviceId,
      p_final_cost: finalCost,
      p_wallet_id: walletId,
      p_history: [],
    });
  const balanceOf = async (walletId: string) =>
    Number((await ctx.admin.from('wallets').select('balance').eq('id', walletId).single()).data!.balance);

  it('0063: koreksi biaya membukukan selisihnya saja; pelunasan lama tetap di tanggalnya', async () => {
    await ctx.admin.from('wallets').update({ balance: 0 }).eq('id', ctx.walletA);
    const svc = await seedService({ status: 'selesai', final_cost: 100000 });
    expect((await settle(svc.id, [{ walletId: ctx.walletA, amount: 100000 }])).error).toBeNull();
    // Pelunasan bulan lalu — tanggalnya tidak boleh ikut pindah ke hari koreksi.
    await ctx.admin.from('incomes').update({ date: '2026-01-15' }).eq('service_id', svc.id);

    expect((await correct(ctx.karyawan.client, svc.id, 150000, ctx.walletA)).error).not.toBeNull(); // manager-only
    expect((await correct(ctx.ownerClient, svc.id, 150000, ctx.walletA)).error).toBeNull();

    const { data: incomes } = await ctx.admin
      .from('incomes')
      .select('amount, date, description')
      .eq('service_id', svc.id)
      .order('amount');
    expect(incomes!.map((i) => [Number(i.amount), i.description])).toEqual([
      [50000, `Koreksi biaya servis ${svc.service_no}`],
      [100000, `Pelunasan servis ${svc.service_no}`],
    ]);
    expect(incomes![1].date).toBe('2026-01-15');
    expect(await balanceOf(ctx.walletA)).toBe(150000);
    const { data: row } = await ctx.admin.from('services').select('final_cost').eq('id', svc.id).single();
    expect(Number(row!.final_cost)).toBe(150000);
  });

  it('0063: koreksi turun = refund dari wallet; ditolak bila saldo kurang atau tiket belum Lunas', async () => {
    const svc = await seedService({ status: 'lunas', final_cost: 200000 });
    await ctx.admin.from('wallets').update({ balance: 10000 }).eq('id', ctx.walletB);
    expect((await correct(ctx.ownerClient, svc.id, 120000, ctx.walletB)).error).not.toBeNull(); // saldo < 80.000
    await ctx.admin.from('wallets').update({ balance: 100000 }).eq('id', ctx.walletB);
    expect((await correct(ctx.ownerClient, svc.id, 120000, ctx.walletB)).error).toBeNull();
    expect(await balanceOf(ctx.walletB)).toBe(20000);
    const { data: exp } = await ctx.admin
      .from('expenses')
      .select('amount')
      .eq('org_id', ctx.orgId)
      .eq('description', `Koreksi biaya servis ${svc.service_no}`);
    expect((exp ?? []).map((e) => Number(e.amount))).toEqual([80000]);

    const open = await seedService({ status: 'selesai', final_cost: 50000 });
    expect((await correct(ctx.ownerClient, open.id, 60000, ctx.walletB)).error).not.toBeNull();
  });

  it('0063: service_summary menghitung semua tiket cabang sendiri; teknisi per periode tanpa klaim garansi', async () => {
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    type Summary = {
      total: number;
      confirmation: number;
      leaderboard: { key: string; name: string; completed: number; revenue: number }[];
    };
    const summary = async () => {
      const { data, error } = await ctx.karyawan.client.rpc('service_summary', {
        p_org_id: ctx.orgId,
        p_outlet_id: null,
        p_from: from,
        p_to: to,
      });
      expect(error).toBeNull();
      return data as Summary;
    };
    const before = await summary();
    const tech = `Teknisi-${Date.now().toString(36)}`;
    const history = [{ status: 'selesai', at: new Date().toISOString() }];
    const paid = await seedService({ status: 'lunas', final_cost: 90000, technician_name: tech, history });
    await seedService({ status: 'selesai', final_cost: 40000, technician_name: tech, history }); // belum bayar: dihitung, nilainya tidak
    await seedService({ status: 'lunas', final_cost: 0, technician_name: tech, warranty_claim_of: paid.id, history });
    await seedService({
      status: 'lunas',
      final_cost: 70000,
      technician_name: tech,
      history: [{ status: 'selesai', at: '2026-01-10T03:00:00Z' }], // selesai di luar periode
    });
    await seedService({ status: 'konfirmasi', outlet_id: ctx.outlet2 }); // cabang lain: tak terlihat karyawan

    const after = await summary();
    expect(after.total - before.total).toBe(4);
    expect(after.confirmation).toBe(before.confirmation);
    expect(after.leaderboard.find((t) => t.name === tech)).toEqual({ key: tech, name: tech, completed: 2, revenue: 90000 });
  });

  // ---- 0064: sparepart servis & klaim garansi ----
  it('0064: karyawan menambah & menghapus sparepart — stok ikut, ditolak bila stok kurang', async () => {
    const { data: item } = await ctx.admin
      .from('inventory_items')
      .insert({ org_id: ctx.orgId, outlet_id: ctx.outlet1, name: 'Baterai', stock: 3, cost_price: 50000, sell_price: 90000 })
      .select('id')
      .single();
    const svc = await seedService({ status: 'pengerjaan' });
    const line = (qty: number) => ({
      itemId: item!.id,
      name: 'Baterai',
      qty,
      costPrice: 50000,
      sellPrice: 90000,
      deducted: true,
      kind: 'inventory',
    });
    const parts = (spareparts: unknown[]) =>
      ctx.karyawan.client.rpc('update_service_parts', {
        p_org_id: ctx.orgId,
        p_service_id: svc.id,
        p_spareparts: spareparts,
      });
    const stock = async () =>
      Number((await ctx.admin.from('inventory_items').select('stock').eq('id', item!.id).single()).data!.stock);

    expect((await parts([line(2)])).error).toBeNull();
    expect(await stock()).toBe(1);
    expect((await parts([line(2), line(5)])).error).not.toBeNull(); // butuh 5 lagi, stok tinggal 1
    expect(await stock()).toBe(1); // tidak tersimpan setengah

    // Kasir menjual 1 di sela-sela: server menulis selisih, jadi penjualan itu tidak tertimpa.
    await ctx.admin.from('inventory_items').update({ stock: 0 }).eq('id', item!.id);
    expect((await parts([])).error).toBeNull();
    expect(await stock()).toBe(2);
    const { data: row } = await ctx.admin.from('services').select('spareparts').eq('id', svc.id).single();
    expect(row!.spareparts).toEqual([]);
  });

  it('0064: klaim garansi karyawan atomik (tiket + kerugian); klaim kedua ditolak selama masih berjalan', async () => {
    await ctx.admin.from('wallets').update({ balance: 100000 }).eq('id', ctx.walletA);
    const until = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const origin = await seedService({ status: 'lunas', final_cost: 300000, warranty_service_until: until });
    const claim = (loss: number) =>
      ctx.karyawan.client.rpc('create_warranty_claim', {
        p_org_id: ctx.orgId,
        p_origin_id: origin.id,
        p_service_no: `KLM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        p_complaint: 'Mati lagi',
        p_by: ctx.karyawan.membershipId,
        p_by_name: 'Karyawan S',
        p_loss_amount: loss,
        p_loss_wallet_id: ctx.walletA,
        p_claimed_items: [{ kind: 'service', name: 'Jasa servis' }],
      });

    expect((await claim(500000)).error).not.toBeNull(); // saldo kurang → tidak ada yang tersimpan
    const { data: none } = await ctx.admin.from('services').select('id').eq('warranty_claim_of', origin.id);
    expect(none ?? []).toHaveLength(0);

    const { data, error } = await claim(40000);
    expect(error).toBeNull();
    const created = data as { id: string; serviceNo: string };
    const { data: claimRow } = await ctx.admin
      .from('services')
      .select('status, warranty_claim_of')
      .eq('id', created.id)
      .single();
    expect(claimRow).toMatchObject({ status: 'diterima', warranty_claim_of: origin.id });
    expect(await balanceOf(ctx.walletA)).toBe(60000);
    const { data: exp } = await ctx.admin
      .from('expenses')
      .select('amount')
      .eq('org_id', ctx.orgId)
      .eq('description', `Kerugian garansi ${created.serviceNo} (asli ${origin.service_no})`);
    expect((exp ?? []).map((e) => Number(e.amount))).toEqual([40000]);

    expect((await claim(0)).error).not.toBeNull(); // klaim pertama belum selesai
    await ctx.admin.from('services').update({ status: 'lunas' }).eq('id', created.id);
    expect((await claim(0)).error).toBeNull(); // sudah selesai → boleh klaim lagi
  });

  it('0065: klaim hanya untuk bagian yang masih bergaransi; bagian tersimpan dengan tanggal dari server', async () => {
    const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const origin = await seedService({
      status: 'lunas',
      final_cost: 500000,
      warranty_service_until: day(-1), // jasa sudah habis
      warranty_parts_until: day(90),
      spareparts: [
        { itemId: null, name: 'Baterai', qty: 1, costPrice: 0, sellPrice: 0, deducted: false, warrantyDays: 90, warrantyUntil: day(90) },
        { itemId: null, name: 'LCD', qty: 1, costPrice: 0, sellPrice: 0, deducted: false, warrantyDays: 7, warrantyUntil: day(-2) },
      ],
    });
    const claim = (items: unknown) =>
      ctx.karyawan.client.rpc('create_warranty_claim', {
        p_org_id: ctx.orgId,
        p_origin_id: origin.id,
        p_service_no: `KLM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        p_complaint: 'Cepat habis',
        p_by: ctx.karyawan.membershipId,
        p_by_name: 'Karyawan S',
        p_claimed_items: items,
      });

    expect((await claim([])).error).not.toBeNull(); // wajib pilih
    expect((await claim([{ kind: 'part', name: 'LCD' }])).error).not.toBeNull(); // garansi LCD habis
    expect((await claim([{ kind: 'service', name: 'Jasa servis' }])).error).not.toBeNull(); // garansi jasa habis

    const { data, error } = await claim([{ kind: 'part', name: 'Baterai', until: '2099-01-01' }]);
    expect(error).toBeNull();
    const { data: row } = await ctx.admin
      .from('services')
      .select('claimed_items')
      .eq('id', (data as { id: string }).id)
      .single();
    expect(row!.claimed_items).toEqual([{ kind: 'part', name: 'Baterai', until: day(90) }]);
  });

  it('0066: karyawan tidak bisa mengubah stok yang dipegang tiket lewat update/insert biasa', async () => {
    const held = [
      { itemId: '00000000-0000-0000-0000-000000000001', name: 'LCD', qty: 1, costPrice: 0, sellPrice: 0, deducted: true, kind: 'inventory' },
    ];
    const svc = await seedService({ status: 'pengerjaan', spareparts: [] });

    // Menandai "sudah dipotong" tanpa stok benar-benar dipotong → ditolak.
    const { error: updErr } = await ctx.karyawan.client.from('services').update({ spareparts: held }).eq('id', svc.id);
    expect(updErr).not.toBeNull();
    const { data: row } = await ctx.admin.from('services').select('spareparts').eq('id', svc.id).single();
    expect(row!.spareparts).toEqual([]);

    // Tiket baru yang langsung "memegang" stok → ditolak.
    const { error: insErr } = await ctx.karyawan.client.from('services').insert({
      org_id: ctx.orgId,
      service_no: `SVC-HLD-${Date.now().toString(36)}`,
      device: 'Hp',
      status: 'diterima',
      outlet_id: ctx.outlet1,
      spareparts: held,
    });
    expect(insErr).not.toBeNull();

    // Baris modal (tanpa stok) tetap boleh lewat update biasa.
    const { error: okErr } = await ctx.karyawan.client
      .from('services')
      .update({ spareparts: [{ itemId: null, name: 'Ongkir', qty: 1, costPrice: 10000, sellPrice: 0, deducted: false, kind: 'manual' }] })
      .eq('id', svc.id);
    expect(okErr).toBeNull();
  });

  it('pencarian arsip servis: kata kunci & rentang tanggal lolos sintaks PostgREST (queryServices)', async () => {
    const tag = `Arsip${Date.now().toString(36)}`;
    const svc = await seedService({ status: 'diterima', customer_name: `Budi (${tag}), "Tes"`, device: 'Laptop' });
    // Rantai yang sama dengan SupabaseAdapter.queryServices.
    const search = (term: string, from?: string) => {
      let q = ctx.karyawan.client
        .from('services')
        .select(SERVICE_LIST_COLUMNS)
        .eq('org_id', ctx.orgId)
        .is('deleted_at', null)
        .or(`outlet_id.eq.${ctx.outlet1},outlet_id.is.null`);
      const filter = serviceSearchFilter(term);
      if (filter) q = q.or(filter);
      if (from) q = q.gte('created_at', from);
      return q.order('created_at', { ascending: false }).limit(50);
    };

    const hit = await search(tag.toLowerCase());
    expect(hit.error).toBeNull();
    expect((hit.data ?? []).map((r) => (r as unknown as { id: string }).id)).toEqual([svc.id]);

    // Karakter sintaks filter di kata kunci dibuang: tidak error, tidak menyisipkan filter.
    const odd = await search(`${tag}),outlet_id.is.null,"x`);
    expect(odd.error).toBeNull();

    const later = await search(tag, new Date(Date.now() + 86400000).toISOString());
    expect(later.error).toBeNull();
    expect(later.data ?? []).toHaveLength(0);

    // Nomor HP dicari tanpa pemisah → tetap ketemu walau tersimpan dengan tanda hubung.
    const phone = `0877-${String(Date.now()).slice(-4)}-${Math.floor(Math.random() * 9000) + 1000}`;
    const byPhone = await seedService({ status: 'diterima', customer_phone: phone, device: 'Tablet' });
    const phoneHit = await search(phone.replace(/\D/g, ''));
    expect(phoneHit.error).toBeNull();
    expect((phoneHit.data ?? []).map((r) => (r as unknown as { id: string }).id)).toContain(byPhone.id);
  });

  it('0068: hapus transaksi keuangan atomik — koreksi, pelunasan & refund koreksi; karyawan ditolak', async () => {
    await ctx.admin.from('wallets').update({ balance: 0 }).eq('id', ctx.walletA);
    await ctx.admin.from('wallets').update({ balance: 0 }).eq('id', ctx.walletB);
    const del = (client: SupabaseClient, kind: string, id: string) =>
      client.rpc('delete_finance_entry', { p_org_id: ctx.orgId, p_kind: kind, p_id: id });
    const statusOf = async (id: string) =>
      (await ctx.admin.from('services').select('status, final_cost').eq('id', id).single()).data as {
        status: string;
        final_cost: number;
      };

    const svc = await seedService({ status: 'selesai', final_cost: 300000 });
    const incomesOf = async () =>
      (await ctx.admin.from('incomes').select('id, description').eq('service_id', svc.id)).data ?? [];
    expect(
      (await settle(svc.id, [
        { walletId: ctx.walletA, amount: 200000 },
        { walletId: ctx.walletB, amount: 100000 },
      ])).error,
    ).toBeNull();
    expect((await correct(ctx.ownerClient, svc.id, 350000, ctx.walletA)).error).toBeNull(); // +50.000

    // Selisih koreksi dihapus → biaya final kembali, pelunasan tetap.
    const corr = (await incomesOf()).find((i) => i.description.startsWith('Koreksi'))!;
    expect((await del(ctx.karyawan.client, 'income', corr.id)).error).not.toBeNull(); // owner/admin saja
    expect((await del(ctx.ownerClient, 'income', corr.id)).error).toBeNull();
    let row = await statusOf(svc.id);
    expect([row.status, Number(row.final_cost)]).toEqual(['lunas', 300000]);
    expect(await balanceOf(ctx.walletA)).toBe(200000);

    // Satu kaki pelunasan dihapus → SEMUA kaki dibalik & tiket kembali Selesai.
    expect((await del(ctx.ownerClient, 'income', (await incomesOf())[0].id)).error).toBeNull();
    expect(await incomesOf()).toHaveLength(0);
    row = await statusOf(svc.id);
    expect(row.status).toBe('selesai');
    expect([await balanceOf(ctx.walletA), await balanceOf(ctx.walletB)]).toEqual([0, 0]);

    // Refund koreksi (pengeluaran) dihapus → biaya final naik lagi.
    const paid = await seedService({ status: 'lunas', final_cost: 200000 });
    await ctx.admin.from('wallets').update({ balance: 100000 }).eq('id', ctx.walletB);
    expect((await correct(ctx.ownerClient, paid.id, 150000, ctx.walletB)).error).toBeNull();
    const { data: refund } = await ctx.admin
      .from('expenses')
      .select('id')
      .eq('org_id', ctx.orgId)
      .eq('description', `Koreksi biaya servis ${paid.service_no}`)
      .single();
    expect((await del(ctx.ownerClient, 'expense', refund!.id)).error).toBeNull();
    expect(Number((await statusOf(paid.id)).final_cost)).toBe(200000);
    expect(await balanceOf(ctx.walletB)).toBe(100000);
  });

  // ---- 0069: kasir, inventori & pelanggan ----
  const seedItem = async (over: Record<string, unknown>) => {
    const { data, error } = await ctx.admin
      .from('inventory_items')
      .insert({
        org_id: ctx.orgId,
        outlet_id: ctx.outlet1,
        name: `Item ${Math.random().toString(36).slice(2, 6)}`,
        stock: 5,
        cost_price: 6000,
        sell_price: 10000,
        ...over,
      })
      .select('id')
      .single();
    if (error) throw new Error(`seed item: ${error.message}`);
    return data!.id as string;
  };
  const stockOf = async (id: string) =>
    Number((await ctx.admin.from('inventory_items').select('stock').eq('id', id).single()).data!.stock);
  const sale = (lines: unknown[], total: number, payments: unknown[]) =>
    ctx.karyawan.client.rpc('process_sale', {
      p_org_id: ctx.orgId,
      p_sale_no: 'INV-0001',
      p_lines: lines,
      p_payments: payments,
      p_subtotal: total,
      p_discount: 0,
      p_discount_type: 'amount',
      p_total: total,
      p_outlet_id: ctx.outlet1,
    });

  it('0069: process_sale menolak qty tidak valid, baris ganda, harga/total & pembayaran yang tidak cocok', async () => {
    await ctx.admin.from('wallets').update({ balance: 0 }).eq('id', ctx.walletA);
    const item = await seedItem({ stock: 5 });
    const line = (qty: number, sellPrice = 10000) => ({ itemId: item, name: 'X', qty, sellPrice, costPrice: 1 });
    const pay = (amount: number) => [{ walletId: ctx.walletA, amount }];

    expect((await sale([line(-5)], -50000, [])).error).not.toBeNull(); // qty negatif
    expect((await sale([line(1.5)], 15000, pay(15000))).error).not.toBeNull(); // pecahan
    expect((await sale([line(3), line(3)], 60000, pay(60000))).error).not.toBeNull(); // 6 > stok 5
    expect((await sale([line(2, 1)], 2, pay(2))).error).not.toBeNull(); // harga dipalsukan
    expect((await sale([line(2)], 20000, pay(10000))).error).not.toBeNull(); // bayar kurang
    expect(
      (await sale([line(2)], 20000, [{ walletId: crypto.randomUUID(), amount: 20000 }])).error,
    ).not.toBeNull(); // wallet bukan milik toko
    expect(await stockOf(item)).toBe(5);

    const ok = await sale([line(1), line(1)], 20000, pay(20000));
    expect(ok.error).toBeNull();
    expect(await stockOf(item)).toBe(3);
    const { data: row } = await ctx.admin.from('sales').select('lines, total').eq('id', ok.data as string).single();
    expect(Number(row!.total)).toBe(20000);
    expect(
      (row!.lines as { qty: number; sellPrice: number; costPrice: number }[]).map((l) => [
        Number(l.qty),
        Number(l.sellPrice),
        Number(l.costPrice),
      ]),
    ).toEqual([[2, 10000, 6000]]); // digabung, harga & HPP dari inventori
    expect(await balanceOf(ctx.walletA)).toBe(20000);
  });

  it('0069: void_sale sekali saja & bukan penjualan bulan lalu; karyawan tak bisa ubah/tambah penjualan langsung', async () => {
    await ctx.admin.from('wallets').update({ balance: 0 }).eq('id', ctx.walletA);
    const item = await seedItem({ stock: 4 });
    const made = await sale(
      [{ itemId: item, name: 'X', qty: 2, sellPrice: 10000, costPrice: 6000 }],
      20000,
      [{ walletId: ctx.walletA, amount: 20000 }],
    );
    expect(made.error).toBeNull();
    const saleId = made.data as string;

    await ctx.karyawan.client.from('sales').update({ voided: true, total: 1 }).eq('id', saleId);
    const row = (await ctx.admin.from('sales').select('voided, total').eq('id', saleId).single()).data!;
    expect([row.voided, Number(row.total)]).toEqual([false, 20000]);
    const fake = await ctx.karyawan.client.from('sales').insert({
      org_id: ctx.orgId,
      outlet_id: ctx.outlet1,
      sale_no: `FAKE-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      total: 999,
    });
    expect(fake.error).not.toBeNull();

    const voidIt = () => ctx.ownerClient.rpc('void_sale', { p_sale_id: saleId, p_reason: 'salah input' });
    expect((await voidIt()).error).toBeNull();
    expect((await voidIt()).error).toBeNull(); // kedua kalinya tidak membalik lagi
    expect(await stockOf(item)).toBe(4);
    expect(await balanceOf(ctx.walletA)).toBe(0);

    const { data: old } = await ctx.admin
      .from('sales')
      .insert({ org_id: ctx.orgId, outlet_id: ctx.outlet1, sale_no: `OLD-${Date.now()}`, date: '2026-01-15', total: 5000 })
      .select('id')
      .single();
    expect((await ctx.ownerClient.rpc('void_sale', { p_sale_id: old!.id, p_reason: 'x' })).error).not.toBeNull();
  });

  it('0069: stok tak bisa ditimpa lewat update biasa; koreksi stok lewat selisih; barang terhapus tak bikin tiket macet', async () => {
    const item = await seedItem({ stock: 5 });
    await ctx.ownerClient.from('inventory_items').update({ stock: 99, name: 'Nama Baru' }).eq('id', item);
    const { data: inv } = await ctx.admin.from('inventory_items').select('stock, name').eq('id', item).single();
    expect([Number(inv!.stock), inv!.name]).toEqual([5, 'Nama Baru']);

    const adjust = (client: SupabaseClient, delta: number) =>
      client.rpc('adjust_inventory_stock', { p_org_id: ctx.orgId, p_item_id: item, p_delta: delta });
    expect((await adjust(ctx.karyawan.client, 3)).error).not.toBeNull(); // owner/admin saja
    expect((await adjust(ctx.ownerClient, 3)).data).toBe(8);
    expect((await adjust(ctx.ownerClient, -100)).error).not.toBeNull();

    const svc = await seedService({ status: 'pengerjaan', spareparts: [] });
    const held = [{ itemId: item, name: 'Nama Baru', qty: 2, costPrice: 6000, sellPrice: 10000, deducted: true, kind: 'inventory' }];
    const parts = (sp: unknown[]) =>
      ctx.karyawan.client.rpc('update_service_parts', { p_org_id: ctx.orgId, p_service_id: svc.id, p_spareparts: sp });
    expect((await parts(held)).error).toBeNull();
    await ctx.admin.from('inventory_items').delete().eq('id', item);
    expect((await parts([])).error).toBeNull();
  });

  it('0069: No. HP pelanggan unik, sinkron nama ke tiket, statistik dari server, HPP rata-rata saat terima barang', async () => {
    const digits = String(Date.now()).slice(-8);
    const { data: cust, error: cErr } = await ctx.karyawan.client
      .from('customers')
      .insert({ org_id: ctx.orgId, name: 'Rina', phone: `0857-${digits}` })
      .select('id')
      .single();
    expect(cErr).toBeNull();
    const dup = await ctx.karyawan.client.from('customers').insert({ org_id: ctx.orgId, name: 'Rina', phone: `+62857${digits}` });
    expect(dup.error).not.toBeNull();

    const svc = await seedService({ status: 'lunas', final_cost: 150000, customer_id: cust!.id, customer_name: 'Rina', category: 'Laptop' });
    await seedService({ status: 'batal', final_cost: 90000, customer_id: cust!.id, customer_name: 'Rina', category: 'Laptop' });
    await ctx.admin.from('customers').update({ name: 'Rina Wati' }).eq('id', cust!.id);
    expect(
      (await ctx.karyawan.client.rpc('sync_customer_to_services', { p_org_id: ctx.orgId, p_customer_id: cust!.id })).error,
    ).toBeNull();
    const { data: svcRow } = await ctx.admin.from('services').select('customer_name, status').eq('id', svc.id).single();
    expect(svcRow).toMatchObject({ customer_name: 'Rina Wati', status: 'lunas' });

    const { data: stats, error: sErr } = await ctx.karyawan.client.rpc('customer_service_stats', { p_org_id: ctx.orgId });
    expect(sErr).toBeNull();
    const mine = (stats as { customer_id: string; services: number; paid_total: number; categories: string[] }[]).find(
      (s) => s.customer_id === cust!.id,
    )!;
    expect([Number(mine.services), Number(mine.paid_total), mine.categories]).toEqual([1, 150000, ['Laptop']]);

    const item = await seedItem({ stock: 10, cost_price: 5000 });
    const { data: po, error: poErr } = await ctx.admin
      .from('purchase_orders')
      .insert({
        org_id: ctx.orgId,
        po_number: `PO-${Date.now().toString(36)}`,
        status: 'ordered',
        lines: [{ itemId: item, name: 'X', qty: 10, costPrice: 7000, receivedQty: 0 }],
      })
      .select('id')
      .single();
    expect(poErr).toBeNull();
    const { error: rErr } = await ctx.ownerClient.rpc('receive_goods_v2', {
      p_org_id: ctx.orgId,
      p_po_id: po!.id,
      p_lines: [{ itemId: item, name: 'X', qty: 10, costPrice: 7000, receivedQty: 10 }],
      p_deltas: [{ itemId: item, delta: 10 }],
      p_status: 'received',
      p_outlet_id: ctx.outlet1,
      p_wallet_id: null,
      p_amount: 0,
    });
    expect(rErr).toBeNull();
    const { data: after } = await ctx.admin.from('inventory_items').select('stock, cost_price').eq('id', item).single();
    expect([Number(after!.stock), Number(after!.cost_price)]).toEqual([20, 6000]);
  });

  it('owner (manager) BISA transfer_wallet: saldo pindah antar wallet', async () => {
    // Seed walletA with a known balance, then move 40k → walletB.
    await ctx.admin.from('wallets').update({ balance: 100000 }).eq('id', ctx.walletA);
    const { data: aBefore } = await ctx.admin.from('wallets').select('balance').eq('id', ctx.walletA).single();
    const { data: bBefore } = await ctx.admin.from('wallets').select('balance').eq('id', ctx.walletB).single();

    const { error } = await ctx.ownerClient.rpc('transfer_wallet', {
      p_org_id: ctx.orgId,
      p_from_wallet_id: ctx.walletA,
      p_to_wallet_id: ctx.walletB,
      p_amount: 40000,
    });
    expect(error).toBeNull();

    const { data: aAfter } = await ctx.admin.from('wallets').select('balance').eq('id', ctx.walletA).single();
    const { data: bAfter } = await ctx.admin.from('wallets').select('balance').eq('id', ctx.walletB).single();
    expect(Number(aAfter!.balance) - Number(aBefore!.balance)).toBe(-40000);
    expect(Number(bAfter!.balance) - Number(bBefore!.balance)).toBe(40000);
  });

  it('transfer_wallet ditolak bila saldo tidak cukup', async () => {
    await ctx.admin.from('wallets').update({ balance: 1000 }).eq('id', ctx.walletA);
    const { error } = await ctx.ownerClient.rpc('transfer_wallet', {
      p_org_id: ctx.orgId,
      p_from_wallet_id: ctx.walletA,
      p_to_wallet_id: ctx.walletB,
      p_amount: 999999,
    });
    expect(error).not.toBeNull();
  });

  it('transfer_wallet ditolak bila wallet asal = tujuan', async () => {
    const { error } = await ctx.ownerClient.rpc('transfer_wallet', {
      p_org_id: ctx.orgId,
      p_from_wallet_id: ctx.walletA,
      p_to_wallet_id: ctx.walletA,
      p_amount: 1000,
    });
    expect(error).not.toBeNull();
  });

  it('karyawan TIDAK bisa transfer_wallet (manager-only)', async () => {
    await ctx.admin.from('wallets').update({ balance: 100000 }).eq('id', ctx.walletA);
    const { error } = await ctx.karyawan.client.rpc('transfer_wallet', {
      p_org_id: ctx.orgId,
      p_from_wallet_id: ctx.walletA,
      p_to_wallet_id: ctx.walletB,
      p_amount: 1000,
    });
    expect(error).not.toBeNull(); // ditolak: bukan manager
  });

  // ---- 0070: diskon, pelanggan & stok per cabang ----
  const saleWith = (client: SupabaseClient, over: Record<string, unknown>) =>
    client.rpc('process_sale', {
      p_org_id: ctx.orgId,
      p_sale_no: 'INV-0001',
      p_lines: [],
      p_payments: [],
      p_subtotal: 0,
      p_discount: 0,
      p_discount_type: 'amount',
      p_total: 0,
      p_outlet_id: ctx.outlet1,
      ...over,
    });

  it('0070: diskon karyawan dibatasi 10%, manager bebas', async () => {
    const item = await seedItem({ stock: 10, sell_price: 10000 });
    const line = (qty: number) => [{ itemId: item, name: 'X', qty, sellPrice: 10000, costPrice: 1 }];
    const pay = (amount: number) => [{ walletId: ctx.walletA, amount }];

    // Subtotal 100.000 → batas karyawan 10.000.
    const over = await saleWith(ctx.karyawan.client, {
      p_lines: line(10), p_discount: 20000, p_total: 80000, p_payments: pay(80000),
    });
    expect(over.error).not.toBeNull();
    expect(await stockOf(item)).toBe(10); // tak ada stok terpotong

    const ok = await saleWith(ctx.karyawan.client, {
      p_lines: line(10), p_discount: 10000, p_total: 90000, p_payments: pay(90000),
    });
    expect(ok.error).toBeNull();

    // Manager boleh diskon besar atas barang yang sama.
    const item2 = await seedItem({ stock: 10, sell_price: 10000 });
    const big = await saleWith(ctx.ownerClient, {
      p_lines: [{ itemId: item2, name: 'X', qty: 10, sellPrice: 10000, costPrice: 1 }],
      p_discount: 50000, p_total: 50000, p_payments: pay(50000),
    });
    expect(big.error).toBeNull();
  });

  it('0070: barang milik cabang lain tidak bisa dijual; stok bersama tetap bisa', async () => {
    const pay = (amount: number) => [{ walletId: ctx.walletA, amount }];
    const other = await seedItem({ stock: 5, sell_price: 10000, outlet_id: ctx.outlet2 });
    const shared = await seedItem({ stock: 5, sell_price: 10000, outlet_id: null });

    const wrong = await saleWith(ctx.ownerClient, {
      p_lines: [{ itemId: other, name: 'X', qty: 1, sellPrice: 10000, costPrice: 1 }],
      p_total: 10000, p_payments: pay(10000),
    });
    expect(wrong.error).not.toBeNull();
    expect(await stockOf(other)).toBe(5);

    const okShared = await saleWith(ctx.ownerClient, {
      p_lines: [{ itemId: shared, name: 'X', qty: 1, sellPrice: 10000, costPrice: 1 }],
      p_total: 10000, p_payments: pay(10000),
    });
    expect(okShared.error).toBeNull();
    expect(await stockOf(shared)).toBe(4);
  });

  it('0070: penjualan menyimpan pelanggan, dan pelanggan bertiket tidak bisa dihapus', async () => {
    const item = await seedItem({ stock: 3, sell_price: 10000 });
    const { data: cust } = await ctx.admin
      .from('customers')
      .insert({ org_id: ctx.orgId, name: 'Pembeli Tetap', phone: `08${Date.now().toString().slice(-9)}` })
      .select('id')
      .single();

    const sold = await saleWith(ctx.karyawan.client, {
      p_lines: [{ itemId: item, name: 'X', qty: 1, sellPrice: 10000, costPrice: 1 }],
      p_total: 10000,
      p_payments: [{ walletId: ctx.walletA, amount: 10000 }],
      p_customer_id: cust!.id,
    });
    expect(sold.error).toBeNull();
    const { data: row } = await ctx.admin
      .from('sales')
      .select('customer_id, customer_name')
      .eq('id', sold.data as string)
      .single();
    expect([row!.customer_id, row!.customer_name]).toEqual([cust!.id, 'Pembeli Tetap']);

    // Punya penjualan → dihapus ditolak (service role pun kena trigger).
    const blocked = await ctx.admin.from('customers').delete().eq('id', cust!.id);
    expect(blocked.error).not.toBeNull();

    // Pelanggan tanpa riwayat tetap bisa dihapus.
    const { data: fresh } = await ctx.admin
      .from('customers')
      .insert({ org_id: ctx.orgId, name: 'Sekali Lewat', phone: `07${Date.now().toString().slice(-9)}` })
      .select('id')
      .single();
    expect((await ctx.admin.from('customers').delete().eq('id', fresh!.id)).error).toBeNull();

    // Pelanggan tak dikenal ditolak.
    const ghost = await saleWith(ctx.karyawan.client, {
      p_lines: [{ itemId: item, name: 'X', qty: 1, sellPrice: 10000, costPrice: 1 }],
      p_total: 10000,
      p_payments: [{ walletId: ctx.walletA, amount: 10000 }],
      p_customer_id: crypto.randomUUID(),
    });
    expect(ghost.error).not.toBeNull();
  });

  // ---- 0071: supplier & keuangan ----
  const today = () => new Date().toISOString().slice(0, 10);
  const lastMonthDay = () => {
    const d = new Date();
    d.setDate(1);
    d.setDate(0); // hari terakhir bulan lalu
    return d.toISOString().slice(0, 10);
  };
  const seedSupplier = async () => {
    const { data } = await ctx.admin
      .from('suppliers')
      .insert({ org_id: ctx.orgId, name: `Supplier ${Math.random().toString(36).slice(2, 6)}` })
      .select('id')
      .single();
    return data!.id as string;
  };
  const makePo = (supplierId: string, lines: unknown[]) =>
    ctx.ownerClient.rpc('create_purchase_order', {
      p_org_id: ctx.orgId,
      p_supplier_id: supplierId,
      p_lines: lines,
      p_note: '',
      p_outlet_id: ctx.outlet1,
    });

  it('0071: transaksi keuangan atomik; bulan lalu terkunci; karyawan ditolak', async () => {
    await ctx.admin.from('wallets').update({ balance: 0 }).eq('id', ctx.walletA);

    const rec = await ctx.ownerClient.rpc('record_finance_entry', {
      p_org_id: ctx.orgId, p_kind: 'expense', p_date: today(), p_category: 'Operasional',
      p_amount: 50000, p_wallet_id: ctx.walletA, p_description: 'Uji 0071', p_outlet_id: ctx.outlet1,
    });
    expect(rec.error).toBeNull();
    expect(await balanceOf(ctx.walletA)).toBe(-50000);

    const upd = await ctx.ownerClient.rpc('update_finance_entry', {
      p_org_id: ctx.orgId, p_kind: 'expense', p_id: rec.data as string, p_date: today(),
      p_category: 'Operasional', p_amount: 20000, p_wallet_id: ctx.walletA, p_description: 'Diubah',
    });
    expect(upd.error).toBeNull();
    expect(await balanceOf(ctx.walletA)).toBe(-20000); // sekali kurang, bukan dobel

    // Karyawan bukan manager: keuangan ditolak.
    const staff = await ctx.karyawan.client.rpc('record_finance_entry', {
      p_org_id: ctx.orgId, p_kind: 'income', p_date: today(), p_category: 'Lainnya',
      p_amount: 1000, p_wallet_id: ctx.walletA, p_description: '', p_outlet_id: ctx.outlet1,
    });
    expect(staff.error).not.toBeNull();

    // Bulan lalu: ubah & hapus ditolak.
    const { data: old } = await ctx.admin
      .from('expenses')
      .insert({
        org_id: ctx.orgId, outlet_id: ctx.outlet1, date: lastMonthDay(), category: 'Operasional',
        amount: 1000, wallet_id: ctx.walletA, description: 'Bulan lalu',
      })
      .select('id')
      .single();
    const updOld = await ctx.ownerClient.rpc('update_finance_entry', {
      p_org_id: ctx.orgId, p_kind: 'expense', p_id: old!.id, p_date: lastMonthDay(),
      p_category: 'Operasional', p_amount: 5000, p_wallet_id: ctx.walletA, p_description: '',
    });
    expect(updOld.error).not.toBeNull();
    const delOld = await ctx.ownerClient.rpc('delete_finance_entry', {
      p_org_id: ctx.orgId, p_kind: 'expense', p_id: old!.id,
    });
    expect(delOld.error).not.toBeNull();
  });

  it('0071: pengeluaran milik PO tidak bisa diubah/dihapus dari Keuangan', async () => {
    const supplier = await seedSupplier();
    const item = await seedItem({ stock: 0, cost_price: 1000 });
    const po = await makePo(supplier, [{ itemId: item, qty: 2, costPrice: 1000 }]);
    expect(po.error).toBeNull();
    const poId = (po.data as { id: string }).id;

    const recv = await ctx.ownerClient.rpc('receive_goods_v2', {
      p_org_id: ctx.orgId, p_po_id: poId,
      p_lines: [{ itemId: item, name: 'X', qty: 2, costPrice: 1000, receivedQty: 2 }],
      p_deltas: [{ itemId: item, delta: 2 }],
      p_status: 'received', p_outlet_id: ctx.outlet1, p_wallet_id: ctx.walletA, p_amount: 2000,
    });
    expect(recv.error).toBeNull();

    const { data: exp } = await ctx.admin
      .from('expenses').select('id').eq('po_id', poId).single();
    // Tulis langsung (lolos RLS manager) tetap ditolak trigger.
    const edit = await ctx.ownerClient.from('expenses').update({ amount: 1 }).eq('id', exp!.id);
    expect(edit.error).not.toBeNull();
    const del = await ctx.ownerClient.rpc('delete_finance_entry', {
      p_org_id: ctx.orgId, p_kind: 'expense', p_id: exp!.id,
    });
    expect(del.error).not.toBeNull();
  });

  it('0071: PO — nomor dari server, qty bulat, dan terkunci setelah barang masuk', async () => {
    const supplier = await seedSupplier();
    const item = await seedItem({ stock: 0, cost_price: 1000 });

    expect((await makePo(supplier, [{ itemId: item, qty: 2.5, costPrice: 1000 }])).error).not.toBeNull();
    expect((await makePo(supplier, [{ itemId: item, qty: 0, costPrice: 1000 }])).error).not.toBeNull();

    const ok = await makePo(supplier, [{ itemId: item, qty: 3, costPrice: 1000 }]);
    expect(ok.error).toBeNull();
    const po = ok.data as { id: string; poNumber: string };
    expect(po.poNumber).toMatch(/^PO-\d{4}$/);

    const edit = await ctx.ownerClient.rpc('update_purchase_order', {
      p_org_id: ctx.orgId, p_po_id: po.id, p_supplier_id: supplier,
      p_lines: [{ itemId: item, qty: 5, costPrice: 1200 }], p_note: 'revisi',
    });
    expect(edit.error).toBeNull();

    await ctx.ownerClient.rpc('receive_goods_v2', {
      p_org_id: ctx.orgId, p_po_id: po.id,
      p_lines: [{ itemId: item, name: 'X', qty: 5, costPrice: 1200, receivedQty: 5 }],
      p_deltas: [{ itemId: item, delta: 5 }],
      p_status: 'received', p_outlet_id: ctx.outlet1, p_wallet_id: null, p_amount: 0,
    });
    const editAfter = await ctx.ownerClient.rpc('update_purchase_order', {
      p_org_id: ctx.orgId, p_po_id: po.id, p_supplier_id: supplier,
      p_lines: [{ itemId: item, qty: 9, costPrice: 1200 }], p_note: '',
    });
    expect(editAfter.error).not.toBeNull();
  });

  it('0071: batal PO ditolak bila stok sudah terpakai; terima barang menolak item terhapus', async () => {
    const supplier = await seedSupplier();
    const item = await seedItem({ stock: 0, cost_price: 1000 });
    const po = (await makePo(supplier, [{ itemId: item, qty: 5, costPrice: 1000 }])).data as { id: string };
    await ctx.ownerClient.rpc('receive_goods_v2', {
      p_org_id: ctx.orgId, p_po_id: po.id,
      p_lines: [{ itemId: item, name: 'X', qty: 5, costPrice: 1000, receivedQty: 5 }],
      p_deltas: [{ itemId: item, delta: 5 }],
      p_status: 'received', p_outlet_id: ctx.outlet1, p_wallet_id: null, p_amount: 0,
    });
    expect(await stockOf(item)).toBe(5);

    // Empat terpakai → membatalkan PO akan membuat stok minus.
    await ctx.ownerClient.rpc('adjust_inventory_stock', {
      p_org_id: ctx.orgId, p_item_id: item, p_delta: -4,
    });
    const blocked = await ctx.ownerClient.rpc('void_po', {
      p_org_id: ctx.orgId, p_po_id: po.id, p_outlet_id: ctx.outlet1,
    });
    expect(blocked.error).not.toBeNull();
    expect(await stockOf(item)).toBe(1); // tidak jadi minus

    // Barang dihapus dari inventori → penerimaan menolak, bukan lewat diam-diam.
    const gone = await seedItem({ stock: 0, cost_price: 1000 });
    const po2 = (await makePo(supplier, [{ itemId: gone, qty: 2, costPrice: 1000 }])).data as { id: string };
    await ctx.admin.from('inventory_items').delete().eq('id', gone);
    const recv = await ctx.ownerClient.rpc('receive_goods_v2', {
      p_org_id: ctx.orgId, p_po_id: po2.id,
      p_lines: [{ itemId: gone, name: 'X', qty: 2, costPrice: 1000, receivedQty: 2 }],
      p_deltas: [{ itemId: gone, delta: 2 }],
      p_status: 'received', p_outlet_id: ctx.outlet1, p_wallet_id: null, p_amount: 0,
    });
    expect(recv.error).not.toBeNull();
  });

  // ---- 0072: transfer & supplier ----
  it('0072: supplier — nomor ganda ditolak, dan supplier ber-PO tidak bisa dihapus', async () => {
    const phone = `08${Date.now().toString().slice(-9)}`;
    const { data: first } = await ctx.admin
      .from('suppliers')
      .insert({ org_id: ctx.orgId, name: 'Supplier Satu', phone })
      .select('id')
      .single();

    // Nomor sama (format berbeda) → ditolak trigger.
    const dup = await ctx.ownerClient
      .from('suppliers')
      .insert({ org_id: ctx.orgId, name: 'Supplier Dua', phone: `+62${phone.slice(1)}` });
    expect(dup.error).not.toBeNull();

    // Belum punya PO → boleh dihapus.
    const { data: spare } = await ctx.admin
      .from('suppliers')
      .insert({ org_id: ctx.orgId, name: 'Supplier Sekali Pakai' })
      .select('id')
      .single();
    expect((await ctx.admin.from('suppliers').delete().eq('id', spare!.id)).error).toBeNull();

    // Punya PO → ditolak, supaya riwayat PO tidak kehilangan nama supplier.
    const item = await seedItem({ stock: 0, cost_price: 1000 });
    const po = await ctx.ownerClient.rpc('create_purchase_order', {
      p_org_id: ctx.orgId, p_supplier_id: first!.id,
      p_lines: [{ itemId: item, qty: 1, costPrice: 1000 }], p_note: '', p_outlet_id: ctx.outlet1,
    });
    expect(po.error).toBeNull();
    const blocked = await ctx.admin.from('suppliers').delete().eq('id', first!.id);
    expect(blocked.error).not.toBeNull();
  });

  it('0072: admin membaca jejak transfer di log, tapi tidak aktivitas lain', async () => {
    const runId = Date.now().toString(36);
    const email = `fmtest+${runId}-adm@example.com`;
    const password = `Tst!${runId}Ad9`;
    const userId = await createUser(ctx.admin, email, password);
    ctx.userIds.push(userId); // dibersihkan afterAll bersama yang lain
    await ctx.admin
      .from('memberships')
      .insert({ org_id: ctx.orgId, user_id: userId, name: 'Admin Uji', role: 'admin', active: true });
    const adminClient = await signIn(email, password);

    await ctx.admin.from('activity_logs').insert([
      {
        org_id: ctx.orgId, actor_name: 'Owner', action: 'wallet.transfer',
        entity_type: 'wallet', entity_label: 'Tunai → QRIS', meta: { amount: 1000 },
      },
      {
        org_id: ctx.orgId, actor_name: 'Owner', action: 'sale.create',
        entity_type: 'sale', entity_label: 'INV-9999', meta: {},
      },
    ]);

    const { data: rows, error } = await adminClient
      .from('activity_logs')
      .select('action')
      .eq('org_id', ctx.orgId);
    expect(error).toBeNull();
    const actions = (rows ?? []).map((r) => r.action as string);
    expect(actions).toContain('wallet.transfer');
    expect(actions).not.toContain('sale.create');

    // Karyawan tetap tidak melihat apa pun.
    const { data: staffRows } = await ctx.karyawan.client
      .from('activity_logs')
      .select('action')
      .eq('org_id', ctx.orgId);
    expect(staffRows ?? []).toHaveLength(0);
  });

  // ---- 0073/0074: jejak audit & laporan ----
  it('0073: pelaku log ditetapkan server, bukan yang dikirim klien', async () => {
    const label = `uji-0073-${Date.now().toString(36)}`;
    const forged = await ctx.karyawan.client.from('activity_logs').insert({
      org_id: ctx.orgId,
      actor_name: 'Owner Palsu',
      actor_role: 'owner',
      action: 'auth.login',
      entity_type: 'test',
      entity_label: label,
    });
    expect(forged.error).toBeNull();

    const { data: row } = await ctx.admin
      .from('activity_logs')
      .select('actor_name, actor_role, actor_id')
      .eq('org_id', ctx.orgId)
      .eq('entity_label', label)
      .single();
    expect(row!.actor_name).toBe('Karyawan S');
    expect(row!.actor_role).toBe('karyawan');
    expect(row!.actor_id).toBe(ctx.karyawan.membershipId);
  });

  it('0073: pembatalan penjualan, hapus transaksi & transfer dicatat database sendiri', async () => {
    const logsFor = async (action: string) => {
      const { data } = await ctx.admin
        .from('activity_logs')
        .select('entity_id, meta')
        .eq('org_id', ctx.orgId)
        .eq('action', action);
      return data ?? [];
    };

    // Penjualan → dibatalkan.
    await ctx.admin.from('wallets').update({ balance: 0 }).eq('id', ctx.walletA);
    const item = await seedItem({ stock: 3, sell_price: 10000 });
    const sold = await ctx.karyawan.client.rpc('process_sale', {
      p_org_id: ctx.orgId, p_sale_no: 'INV-0001',
      p_lines: [{ itemId: item, name: 'X', qty: 1, sellPrice: 10000, costPrice: 1 }],
      p_payments: [{ walletId: ctx.walletA, amount: 10000 }],
      p_subtotal: 10000, p_discount: 0, p_discount_type: 'amount', p_total: 10000,
      p_outlet_id: ctx.outlet1,
    });
    expect(sold.error).toBeNull();
    const saleId = sold.data as string;
    expect((await ctx.ownerClient.rpc('void_sale', { p_sale_id: saleId, p_reason: 'uji' })).error).toBeNull();
    expect((await logsFor('sale.void')).some((l) => l.entity_id === saleId)).toBe(true);

    // Pengeluaran → dihapus.
    const rec = await ctx.ownerClient.rpc('record_finance_entry', {
      p_org_id: ctx.orgId, p_kind: 'expense', p_date: today(), p_category: 'Operasional',
      p_amount: 5000, p_wallet_id: ctx.walletA, p_description: 'Uji log', p_outlet_id: ctx.outlet1,
    });
    expect(rec.error).toBeNull();
    expect((await ctx.ownerClient.rpc('delete_finance_entry', {
      p_org_id: ctx.orgId, p_kind: 'expense', p_id: rec.data as string,
    })).error).toBeNull();
    expect((await logsFor('expense.delete')).some((l) => l.entity_id === (rec.data as string))).toBe(true);

    // Transfer saldo.
    await ctx.admin.from('wallets').update({ balance: 100000 }).eq('id', ctx.walletA);
    expect((await ctx.ownerClient.rpc('transfer_wallet', {
      p_org_id: ctx.orgId, p_from_wallet_id: ctx.walletA, p_to_wallet_id: ctx.walletB, p_amount: 25000,
    })).error).toBeNull();
    expect((await logsFor('wallet.transfer')).length).toBeGreaterThan(0);
  });

  it('0074: piutang dari seluruh tabel, dan laba per kategori menurut tanggal selesai', async () => {
    const no = `SVC-R-${Date.now().toString(36)}`;
    const old = new Date();
    old.setMonth(old.getMonth() - 3);
    const doneAt = old.toISOString();
    await ctx.admin.from('services').insert({
      org_id: ctx.orgId, outlet_id: ctx.outlet1, service_no: no, device: 'HP', category: 'HP',
      status: 'selesai', final_cost: 300000, down_payment: 100000, customer_name: 'Pelanggan Lama',
      spareparts: [{ itemId: null, name: 'LCD', qty: 1, costPrice: 50000, sellPrice: 0, deducted: true }],
      history: [{ at: doneAt, status: 'selesai', by: '', byName: 'Sistem', note: '', internal: false }],
      created_at: doneAt,
    });

    // Tiket ini dibuat & selesai TIGA BULAN lalu — dulu tak pernah muncul di
    // laporan piutang, karena laporannya hanya melihat tiket periode berjalan.
    const receivables = await ctx.ownerClient.rpc('service_receivables', {
      p_org_id: ctx.orgId, p_outlet_id: null,
    });
    expect(receivables.error).toBeNull();
    const mine = (receivables.data as { service_no: string; outstanding: number }[]).find(
      (r) => r.service_no === no,
    );
    expect(mine).toBeTruthy();
    expect(Number(mine!.outstanding)).toBe(200000);

    // Laba masuk ke bulan SELESAI-nya, bukan bulan ini.
    const winFrom = new Date(old.getFullYear(), old.getMonth(), 1).toISOString();
    const winTo = new Date(old.getFullYear(), old.getMonth() + 1, 1).toISOString();
    const cats = await ctx.ownerClient.rpc('category_profit', {
      p_org_id: ctx.orgId, p_from: winFrom, p_to: winTo, p_outlet_id: null,
    });
    expect(cats.error).toBeNull();
    const hp = (cats.data as { category: string; profit: number; revenue: number }[]).find(
      (c) => c.category === 'HP',
    );
    expect(hp).toBeTruthy();
    expect(Number(hp!.profit)).toBe(250000); // 300.000 − 50.000 modal
  });

  // ---- 0076: bukti absensi & cakupan log ----
  it('0076: absensi — tanggal depan ditolak, baris non-hadir dikosongkan, lokasi tersimpan', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const future = await ctx.admin.from('attendance').insert({
      org_id: ctx.orgId, outlet_id: ctx.outlet1, employee_id: ctx.karyawan.membershipId,
      employee_name: 'Karyawan S', date: tomorrow.toISOString().slice(0, 10), status: 'hadir',
      check_in: '08:00',
    });
    expect(future.error).not.toBeNull();

    // Izin kemarin: jam yang terlanjur dikirim dibersihkan server.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const { data: izin, error: izinErr } = await ctx.admin
      .from('attendance')
      .insert({
        org_id: ctx.orgId, outlet_id: ctx.outlet1, employee_id: ctx.karyawan.membershipId,
        employee_name: 'Karyawan S', date: yesterday.toISOString().slice(0, 10), status: 'izin',
        check_in: '08:00', check_out: '17:00',
      })
      .select('check_in, check_out, total_hours')
      .single();
    expect(izinErr).toBeNull();
    expect(izin!.check_in).toBeNull();
    expect(izin!.check_out).toBeNull();
    expect(Number(izin!.total_hours)).toBe(0);

    // Lokasi ikut tersimpan saat absen masuk.
    const clocked = await ctx.karyawan.client.rpc('clock_in', {
      p_org_id: ctx.orgId, p_outlet_id: ctx.outlet1, p_employee_id: ctx.karyawan.membershipId,
      p_lat: -6.9, p_lng: 107.6,
    });
    expect(clocked.error).toBeNull();
    const { data: row } = await ctx.admin
      .from('attendance')
      .select('check_in_lat, check_in_lng')
      .eq('id', clocked.data as string)
      .single();
    expect(Number(row!.check_in_lat)).toBeCloseTo(-6.9, 5);
    expect(Number(row!.check_in_lng)).toBeCloseTo(107.6, 5);
  });

  it('0076: pangkas log — pemilik saja, minimal 90 hari, dan tercatat', async () => {
    expect((await ctx.karyawan.client.rpc('purge_activity_logs', {
      p_org_id: ctx.orgId, p_keep_days: 365,
    })).error).not.toBeNull();
    expect((await ctx.ownerClient.rpc('purge_activity_logs', {
      p_org_id: ctx.orgId, p_keep_days: 30,
    })).error).not.toBeNull();

    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const label = `lama-${Date.now().toString(36)}`;
    await ctx.admin.from('activity_logs').insert({
      org_id: ctx.orgId, actor_name: 'Lama', action: 'auth.login',
      entity_type: 'test', entity_label: label, created_at: twoYearsAgo.toISOString(),
    });

    const purged = await ctx.ownerClient.rpc('purge_activity_logs', {
      p_org_id: ctx.orgId, p_keep_days: 365,
    });
    expect(purged.error).toBeNull();
    expect(Number(purged.data)).toBeGreaterThan(0);

    const { data: gone } = await ctx.admin
      .from('activity_logs').select('id').eq('org_id', ctx.orgId).eq('entity_label', label);
    expect(gone ?? []).toHaveLength(0);

    // Pemangkasannya sendiri meninggalkan jejak.
    const { data: trace } = await ctx.admin
      .from('activity_logs').select('id').eq('org_id', ctx.orgId).eq('action', 'activity.purge');
    expect((trace ?? []).length).toBeGreaterThan(0);
  });

  // ---- 0077: kuota paket, penjaga hapus, jejak pemulihan ----
  it('0077: kuota paket dijaga server — outlet, wallet, dan undangan', async () => {
    const { data: before } = await ctx.admin
      .from('organizations').select('plan_type, plan_expired_at').eq('id', ctx.orgId).single();
    // Paket Solo: 1 pengguna, 1 outlet, 2 wallet. Org uji sudah punya 2 outlet
    // dan 2 wallet (dibuat service-role, yang memang dikecualikan).
    const far = new Date();
    far.setFullYear(far.getFullYear() + 1);
    await ctx.admin
      .from('organizations')
      .update({ plan_type: 'standard', plan_expired_at: far.toISOString() })
      .eq('id', ctx.orgId);

    try {
      const outlet = await ctx.ownerClient
        .from('outlets').insert({ org_id: ctx.orgId, name: 'Cabang Ketiga' });
      expect(outlet.error).not.toBeNull();

      const wallet = await ctx.ownerClient
        .from('wallets').insert({ org_id: ctx.orgId, name: 'Kas Ketiga', balance: 0 });
      expect(wallet.error).not.toBeNull();

      const invite = await ctx.ownerClient.rpc('create_invite', {
        p_org_id: ctx.orgId,
        p_email: `fmtest+kuota-${Date.now().toString(36)}@example.com`,
        p_name: 'Calon Anggota',
        p_role: 'karyawan',
        p_outlet_ids: [],
      });
      expect(invite.error).not.toBeNull();
    } finally {
      await ctx.admin
        .from('organizations')
        .update({
          plan_type: before!.plan_type,
          plan_expired_at: before!.plan_expired_at,
        })
        .eq('id', ctx.orgId);
    }
  });

  it('0077: wallet & cabang tidak bisa dihapus saat masih dipakai', async () => {
    const { data: wallet } = await ctx.ownerClient
      .from('wallets')
      .insert({ org_id: ctx.orgId, name: `Kas Uji ${Date.now().toString(36)}`, balance: 0 })
      .select('id')
      .single();

    // Saldo nol & belum dipakai → boleh hilang.
    expect((await ctx.ownerClient.from('wallets').delete().eq('id', wallet!.id)).error).toBeNull();

    // Masih memegang saldo → ditolak.
    const { data: funded } = await ctx.ownerClient
      .from('wallets')
      .insert({ org_id: ctx.orgId, name: `Kas Isi ${Date.now().toString(36)}`, balance: 0 })
      .select('id')
      .single();
    await ctx.admin.from('wallets').update({ balance: 50000 }).eq('id', funded!.id);
    expect((await ctx.ownerClient.from('wallets').delete().eq('id', funded!.id)).error).not.toBeNull();

    // Cabang utama tidak bisa dihapus.
    await ctx.admin.from('outlets').update({ is_primary: true }).eq('id', ctx.outlet1);
    expect((await ctx.ownerClient.from('outlets').delete().eq('id', ctx.outlet1)).error).not.toBeNull();
  });

  it('0077: pemulihan data mempertahankan jejak audit dan mencatat dirinya', async () => {
    const label = `sebelum-restore-${Date.now().toString(36)}`;
    await ctx.admin.from('activity_logs').insert({
      org_id: ctx.orgId, actor_name: 'Uji', action: 'auth.login',
      entity_type: 'test', entity_label: label,
    });

    const restored = await ctx.ownerClient.rpc('restore_org_data', {
      p_org_id: ctx.orgId,
      p_payload: {},
    });
    expect(restored.error).toBeNull();

    // Jejak lama TIDAK ikut terhapus — dulu seluruh log org dibuang.
    const { data: kept } = await ctx.admin
      .from('activity_logs').select('id').eq('org_id', ctx.orgId).eq('entity_label', label);
    expect(kept ?? []).toHaveLength(1);

    // Dan pemulihannya sendiri tercatat.
    const { data: trace } = await ctx.admin
      .from('activity_logs').select('id').eq('org_id', ctx.orgId).eq('action', 'data.restore');
    expect((trace ?? []).length).toBeGreaterThan(0);
  });
});
