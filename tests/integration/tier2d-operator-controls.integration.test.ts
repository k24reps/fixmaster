/**
 * TIER 2d — Kontrol operator yang MENULIS (migration 0046).
 *
 * `tier2c` menguji operator boleh MELIHAT lintas-tenant. File ini menguji
 * operator boleh MENGUBAH — suspend, promo, catatan — dan bahwa yang bukan
 * operator tidak bisa.
 *
 * Dua asersi yang paling menentukan:
 *  1. owner org LAIN tidak bisa men-suspend siapa pun (gerbang lintas-tenant)
 *  2. setiap aksi tulis MENINGGALKAN JEJAK di operator_actions
 *
 * Nomor 2 bukan sekadar "fitur log jalan". Promo tidak punya bukti pendamping
 * (tak ada uang, tak ada webhook); kalau jejaknya tidak tertulis, informasinya
 * hilang permanen dan bulan-yang-dibayar tak bisa lagi dibedakan dari
 * bulan-yang-diberikan.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasConfig, makeAnon, setupTenants, teardownTenants, type TenantCtx } from './helpers';

const d = hasConfig ? describe : describe.skip;

d('Tier 2d — kontrol operator (tulis)', () => {
  let ctx: TenantCtx;

  beforeAll(async () => {
    ctx = await setupTenants();
  }, 120_000);

  afterAll(async () => {
    if (ctx) {
      await ctx.admin.from('operator_actions').delete().eq('org_id', ctx.orgB);
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

  it('owner org lain DITOLAK memberi promo', async () => {
    const { error } = await ctx.ownerA.client.rpc('admin_apply_promo', {
      p_org_id: ctx.orgB,
      p_promo: 'Founding member',
      p_days: 60,
      p_reason: 'iseng',
    });
    expect(error).not.toBeNull();
  });

  it('anon DITOLAK membaca jejak operator', async () => {
    const { error } = await makeAnon().rpc('admin_list_operator_actions', { p_limit: 10 });
    expect(error).not.toBeNull();
  });

  it('tabel operator_actions tidak terbaca lewat REST', async () => {
    const { data } = await ctx.ownerA.client.from('operator_actions').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('promosi admin, lalu suspend org lain BERHASIL + tercatat', async () => {
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

  it('promo ke org suspended ditolak (aksesnya tetap mati)', async () => {
    const { error } = await ctx.ownerA.client.rpc('admin_apply_promo', {
      p_org_id: ctx.orgB,
      p_promo: 'Founding member',
      p_days: 60,
      p_reason: 'mitra pilot',
    });
    expect(error).not.toBeNull();
  });

  it('aktifkan kembali BERHASIL + tercatat', async () => {
    const { error } = await ctx.ownerA.client.rpc('admin_reactivate_org', {
      p_org_id: ctx.orgB,
      p_plan: 'standard',
      p_reason: 'sudah bayar',
    });
    expect(error).toBeNull();

    const { data: org } = await ctx.admin
      .from('organizations')
      .select('plan_type')
      .eq('id', ctx.orgB)
      .single();
    expect(org?.plan_type).toBe('standard');

    const { data: trail } = await ctx.admin
      .from('operator_actions')
      .select('action')
      .eq('org_id', ctx.orgB)
      .eq('action', 'reactivate');
    expect(trail?.length).toBe(1);
  });

  it('promo memperpanjang expiry + tercatat lengkap dengan durasinya', async () => {
    const { data: before } = await ctx.admin
      .from('organizations')
      .select('plan_expired_at')
      .eq('id', ctx.orgB)
      .single();

    const { data: newExpiry, error } = await ctx.ownerA.client.rpc('admin_apply_promo', {
      p_org_id: ctx.orgB,
      p_promo: 'Founding member',
      p_days: 60,
      p_reason: 'mitra pilot',
    });
    expect(error).toBeNull();
    expect(newExpiry).toBeTruthy();

    const { data: after } = await ctx.admin
      .from('organizations')
      .select('plan_expired_at')
      .eq('id', ctx.orgB)
      .single();
    const beforeMs = before?.plan_expired_at ? Date.parse(before.plan_expired_at) : Date.now();
    expect(Date.parse(after!.plan_expired_at!)).toBeGreaterThan(beforeMs);

    const { data: trail } = await ctx.admin
      .from('operator_actions')
      .select('action,detail')
      .eq('org_id', ctx.orgB)
      .eq('action', 'promo');
    expect(trail?.length).toBe(1);
    expect((trail?.[0].detail as { hari: number }).hari).toBe(60);
    expect((trail?.[0].detail as { promo: string }).promo).toBe('Founding member');
  });

  it('durasi promo di luar 1-365 ditolak', async () => {
    const { error } = await ctx.ownerA.client.rpc('admin_apply_promo', {
      p_org_id: ctx.orgB,
      p_promo: 'Founding member',
      p_days: 400,
      p_reason: 'kebanyakan',
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

  it('admin_list_orgs memuat kolom scorecard', async () => {
    const { data } = await ctx.ownerA.client.rpc('admin_list_orgs');
    const rowB = ((data ?? []) as Record<string, unknown>[]).find((r) => r.org_id === ctx.orgB);
    expect(rowB).toHaveProperty('activation_hours');
    expect(typeof rowB?.weeks_active).toBe('number');
    expect(rowB!.modules_used as number).toBeGreaterThanOrEqual(0);
    expect(rowB!.modules_used as number).toBeLessThanOrEqual(4);
  });

  it('jejak terbaca lewat admin_list_operator_actions', async () => {
    const { data, error } = await ctx.ownerA.client.rpc('admin_list_operator_actions', {
      p_limit: 50,
    });
    expect(error).toBeNull();
    const acts = ((data ?? []) as { action: string }[]).map((r) => r.action);
    expect(acts).toContain('suspend');
    expect(acts).toContain('reactivate');
    expect(acts).toContain('promo');
  });
});
