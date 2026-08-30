/**
 * TIER 2d — Kontrol operator yang MENULIS (migration 0046-0049).
 *
 * `tier2c` menguji operator boleh MELIHAT lintas-tenant. File ini menguji
 * operator boleh MENGUBAH — suspend, pembayaran manual, catatan, penghapusan — dan
 * bahwa yang bukan operator tidak bisa.
 *
 * Dua asersi yang paling menentukan:
 *  1. owner org LAIN tidak bisa men-suspend siapa pun (gerbang lintas-tenant)
 *  2. setiap aksi tulis MENINGGALKAN JEJAK di operator_actions
 *
 * Nomor 2 bukan sekadar "fitur log jalan". Pembayaran manual tidak punya
 * webhook; audit RPC adalah bukti penghubung antara invoice, operator, dan
 * konfirmasi yang diterima lewat WhatsApp.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasConfig,
  makeAnon,
  setupTenants,
  teardownTenants,
  type TenantCtx,
} from './helpers';
import { organizationNumber } from '@/lib/business/operator';

const d = hasConfig ? describe : describe.skip;

d('Tier 2d — kontrol operator (tulis)', () => {
  let ctx: TenantCtx;

  beforeAll(async () => {
    ctx = await setupTenants();
  }, 120_000);

  afterAll(async () => {
    if (ctx) {
      await ctx.admin.from('operator_actions').delete().eq('actor_id', ctx.ownerA.userId);
      await ctx.admin
        .from('invoices')
        .delete()
        .eq('org_id', ctx.orgB)
        .eq('provider', 'manual_whatsapp');
      await ctx.admin.from('client_notes').delete().eq('org_id', ctx.orgB);
      await ctx.admin.from('platform_admins').delete().eq('user_id', ctx.ownerA.userId);
      await teardownTenants(ctx);
    }
  }, 120_000);

  it('anon DITOLAK admin_suspend_org', async () => {
    const { error } = await makeAnon().rpc('admin_suspend_org', {
      p_org_id: ctx.orgB,
      p_reason: 'iseng',
    });
    expect(error).not.toBeNull();
  });

  it('OWNER org lain DITOLAK men-suspend', async () => {
    const { error } = await ctx.ownerA.client.rpc('admin_suspend_org', {
      p_org_id: ctx.orgB,
      p_reason: 'iseng',
    });
    expect(error).not.toBeNull();

    const { data: org } = await ctx.admin
      .from('organizations')
      .select('plan_type')
      .eq('id', ctx.orgB)
      .single();
    expect(org?.plan_type).not.toBe('suspended');
  });

  it('owner org lain DITOLAK mengonfirmasi pembayaran manual', async () => {
    const { error } = await ctx.ownerA.client.rpc('admin_confirm_manual_payment', {
      p_org_id: ctx.orgB,
      p_plan: 'standard',
      p_months: 1,
      p_amount: 99_000,
      p_reference: 'PALSU',
      p_reason: 'belum admin',
    });
    expect(error).not.toBeNull();
  });

  it('owner org lain DITOLAK menghapus organisasi', async () => {
    const { error } = await ctx.ownerA.client.rpc('admin_delete_org', {
      p_org_id: ctx.orgB,
      p_confirmation: organizationNumber(ctx.orgB),
      p_reason: 'bukan operator',
    });
    expect(error).not.toBeNull();
  });

  it('anon DITOLAK membaca jejak operator', async () => {
    const { error } = await makeAnon().rpc('admin_list_operator_actions', {
      p_limit: 10,
    });
    expect(error).not.toBeNull();
  });

  it('tabel operator_actions tidak terbaca lewat REST', async () => {
    const { data } = await ctx.ownerA.client.from('operator_actions').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('admin dapat menangguhkan org lain + aksinya tercatat', async () => {
    await ctx.admin.from('platform_admins').insert({
      user_id: ctx.ownerA.userId,
      email: ctx.ownerA.email,
      note: 'integration test',
    });

    const { error } = await ctx.ownerA.client.rpc('admin_suspend_org', {
      p_org_id: ctx.orgB,
      p_reason: 'menunggak 12 hari',
    });
    expect(error).toBeNull();

    const { data: org } = await ctx.admin
      .from('organizations')
      .select('plan_type')
      .eq('id', ctx.orgB)
      .single();
    expect(org?.plan_type).toBe('suspended');

    const { data: trail } = await ctx.admin
      .from('operator_actions')
      .select('action,reason,actor_email')
      .eq('org_id', ctx.orgB)
      .eq('action', 'suspend');
    expect(trail?.length).toBe(1);
    expect(trail?.[0].reason).toBe('menunggak 12 hari');
    expect(trail?.[0].actor_email).toBe(ctx.ownerA.email);
  });

  it('suspend TANPA alasan ditolak', async () => {
    const { error } = await ctx.ownerA.client.rpc('admin_suspend_org', {
      p_org_id: ctx.orgA,
      p_reason: '   ',
    });
    expect(error).not.toBeNull();
  });

  it('aktivasi kembali bebas DIHAPUS; org tetap ditangguhkan', async () => {
    const { error } = await ctx.ownerA.client.rpc('admin_reactivate_org', {
      p_org_id: ctx.orgB,
      p_plan: 'standard',
      p_reason: 'sudah bayar',
    });
    expect(error).not.toBeNull();

    const { data: org } = await ctx.admin
      .from('organizations')
      .select('plan_type')
      .eq('id', ctx.orgB)
      .single();
    expect(org?.plan_type).toBe('suspended');
  });

  it('pembayaran manual dengan nominal tidak sesuai DITOLAK', async () => {
    const { error } = await ctx.ownerA.client.rpc('admin_confirm_manual_payment', {
      p_org_id: ctx.orgB,
      p_plan: 'enterprise',
      p_months: 2,
      p_amount: 99_000,
      p_reference: 'NOMINAL-SALAH',
      p_reason: 'uji guard nominal',
    });
    expect(error).not.toBeNull();

    const { count } = await ctx.admin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.orgB)
      .eq('provider_ref', 'NOMINAL-SALAH');
    expect(count).toBe(0);
  });

  it('pembayaran manual membuat invoice paid, memperpanjang expiry, dan tercatat', async () => {
    const { data: before } = await ctx.admin
      .from('organizations')
      .select('plan_expired_at')
      .eq('id', ctx.orgB)
      .single();

    const { data: newExpiry, error } = await ctx.ownerA.client.rpc(
      'admin_confirm_manual_payment',
      {
        p_org_id: ctx.orgB,
        p_plan: 'enterprise',
        p_months: 2,
        p_amount: 398_000,
        p_reference: 'RIFAN 29/08 14:32',
        p_reason: 'bukti transfer diverifikasi via WhatsApp',
      },
    );
    expect(error).toBeNull();
    expect(newExpiry).toBeTruthy();

    const { data: after } = await ctx.admin
      .from('organizations')
      .select('plan_expired_at')
      .eq('id', ctx.orgB)
      .single();
    const beforeMs = before?.plan_expired_at
      ? Date.parse(before.plan_expired_at)
      : Date.now();
    expect(Date.parse(after!.plan_expired_at!)).toBeGreaterThan(beforeMs);

    const { data: trail } = await ctx.admin
      .from('operator_actions')
      .select('action,detail')
      .eq('org_id', ctx.orgB)
      .eq('action', 'payment_manual');
    expect(trail?.length).toBe(1);
    expect((trail?.[0].detail as { bulan: number }).bulan).toBe(2);
    expect((trail?.[0].detail as { referensi: string }).referensi).toBe(
      'RIFAN 29/08 14:32',
    );

    const { data: invoices } = await ctx.admin
      .from('invoices')
      .select('status,provider,provider_ref,amount,plan')
      .eq('org_id', ctx.orgB)
      .eq('provider', 'manual_whatsapp');
    expect(invoices).toHaveLength(1);
    expect(invoices?.[0]).toMatchObject({
      status: 'paid',
      provider: 'manual_whatsapp',
      provider_ref: 'RIFAN 29/08 14:32',
      plan: 'enterprise',
    });
    expect(Number(invoices?.[0].amount)).toBe(398_000);

    const { data: retriedExpiry, error: retryError } = await ctx.ownerA.client.rpc(
      'admin_confirm_manual_payment',
      {
        p_org_id: ctx.orgB,
        p_plan: 'enterprise',
        p_months: 2,
        p_amount: 398_000,
        p_reference: 'RIFAN 29/08 14:32',
        p_reason: 'retry setelah timeout',
      },
    );
    expect(retryError).toBeNull();
    expect(retriedExpiry).toBe(newExpiry);
    const { count } = await ctx.admin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.orgB)
      .eq('provider_ref', 'RIFAN 29/08 14:32');
    expect(count).toBe(1);
  });

  it('pembayaran manual tanpa referensi atau durasi valid ditolak', async () => {
    const { error } = await ctx.ownerA.client.rpc('admin_confirm_manual_payment', {
      p_org_id: ctx.orgB,
      p_plan: 'standard',
      p_months: 13,
      p_amount: 99_000,
      p_reference: ' ',
      p_reason: 'invalid',
    });
    expect(error).not.toBeNull();
  });

  it('catatan klien tersimpan dan muncul di admin_list_orgs', async () => {
    const { error } = await ctx.ownerA.client.rpc('admin_set_client_note', {
      p_org_id: ctx.orgB,
      p_note: 'bingung di alur DP',
    });
    expect(error).toBeNull();

    const { data } = await ctx.ownerA.client.rpc('admin_list_orgs');
    const rowB = ((data ?? []) as { org_id: string; note: string }[]).find(
      (r) => r.org_id === ctx.orgB,
    );
    expect(rowB?.note).toBe('bingung di alur DP');
  });

  it('admin_list_orgs memuat tanggal daftar dan tidak lagi memuat retensi/modul', async () => {
    const { data } = await ctx.ownerA.client.rpc('admin_list_orgs');
    const rowB = ((data ?? []) as Record<string, unknown>[]).find(
      (r) => r.org_id === ctx.orgB,
    );
    expect(rowB).toHaveProperty('registered_at');
    expect(rowB).toHaveProperty('last_paid_reference');
    expect(rowB).not.toHaveProperty('activation_hours');
    expect(rowB).not.toHaveProperty('sale_count');
    expect(rowB).not.toHaveProperty('pending_invoices');
    expect(rowB).not.toHaveProperty('weeks_active');
    expect(rowB).not.toHaveProperty('modules_used');
  });

  it('jejak terbaca lewat admin_list_operator_actions', async () => {
    const { data, error } = await ctx.ownerA.client.rpc('admin_list_operator_actions', {
      p_limit: 50,
    });
    expect(error).toBeNull();
    const acts = ((data ?? []) as { action: string }[]).map((r) => r.action);
    expect(acts).toContain('suspend');
    expect(acts).toContain('payment_manual');
  });

  it('hapus organisasi wajib nomor tepat dan menyisakan jejak audit', async () => {
    const { error: mismatchError } = await ctx.ownerA.client.rpc('admin_delete_org', {
      p_org_id: ctx.orgB,
      p_confirmation: 'ORG-SALAH',
      p_reason: 'permintaan pemilik diverifikasi',
    });
    expect(mismatchError).not.toBeNull();

    const { data: before } = await ctx.admin
      .from('organizations')
      .select('id,name')
      .eq('id', ctx.orgB)
      .single();
    expect(before?.id).toBe(ctx.orgB);

    const { error } = await ctx.ownerA.client.rpc('admin_delete_org', {
      p_org_id: ctx.orgB,
      p_confirmation: organizationNumber(ctx.orgB),
      p_reason: 'permintaan pemilik diverifikasi',
    });
    expect(error).toBeNull();

    const { data: deleted } = await ctx.admin
      .from('organizations')
      .select('id')
      .eq('id', ctx.orgB);
    expect(deleted).toHaveLength(0);

    const { data: trail } = await ctx.admin
      .from('operator_actions')
      .select('org_id,org_name,action,reason,detail')
      .eq('actor_id', ctx.ownerA.userId)
      .eq('action', 'delete_org')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(trail).toMatchObject({
      org_id: null,
      org_name: before?.name,
      action: 'delete_org',
      reason: 'permintaan pemilik diverifikasi',
    });
    expect((trail?.detail as { org_number: string }).org_number).toBe(
      organizationNumber(ctx.orgB),
    );
  });
});
