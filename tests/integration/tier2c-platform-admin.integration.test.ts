/**
 * TIER 2c — Admin platform & permukaan lintas-tenant (migration 0045).
 *
 * Ini SATU-SATUNYA permukaan lintas-tenant di sistem: satu bug gating dan data
 * seluruh klien bocor sekaligus. Karena itu tesnya dua sisi — ditolak harus
 * benar-benar error DAN tanpa perubahan state; diizinkan harus benar-benar
 * bekerja lintas org.
 *
 * Asersi terpenting di file ini: **owner sebuah org BUKAN admin platform.**
 * Kalau suatu hari gating longgar, itulah baris yang gagal lebih dulu.
 *
 * Sekaligus menutup celah lama: sebelum ini tak ada satu pun tes untuk
 * claim_gopay_payment / start_gopay_invoice — lubang anon-execute yang
 * diperbaiki 0044 ditemukan lewat probe manual, bukan oleh suite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasConfig, makeAnon, setupTenants, teardownTenants, type TenantCtx } from './helpers';

const d = hasConfig ? describe : describe.skip;

d('Tier 2c — admin platform (lintas-tenant)', () => {
  let ctx: TenantCtx;

  beforeAll(async () => {
    ctx = await setupTenants();
  }, 120_000);

  afterAll(async () => {
    // Lepas hak admin dulu, lalu bongkar tenant.
    if (ctx) {
      await ctx.admin.from('platform_admins').delete().eq('user_id', ctx.ownerA.userId);
      await teardownTenants(ctx);
    }
  }, 120_000);

  // ---------- Penolakan: sebelum siapa pun jadi admin ----------

  it('anon DITOLAK admin_list_orgs', async () => {
    const { error } = await makeAnon().rpc('admin_list_orgs');
    expect(error).not.toBeNull();
  });

  it('anon DITOLAK admin_unpaid_gopay', async () => {
    const { error } = await makeAnon().rpc('admin_unpaid_gopay');
    expect(error).not.toBeNull();
  });

  it('karyawan DITOLAK admin_list_orgs', async () => {
    const { error } = await ctx.karyawanA.client.rpc('admin_list_orgs');
    expect(error).not.toBeNull();
  });

  it('OWNER org BUKAN admin platform — DITOLAK admin_list_orgs', async () => {
    // Asersi paling penting: hak tertinggi di dalam sebuah org tidak boleh
    // memberi akses apa pun ke org lain.
    const { error } = await ctx.ownerA.client.rpc('admin_list_orgs');
    expect(error).not.toBeNull();
  });

  it('owner org DITOLAK admin_unpaid_gopay', async () => {
    const { error } = await ctx.ownerA.client.rpc('admin_unpaid_gopay');
    expect(error).not.toBeNull();
  });

  it('is_platform_admin() false untuk user biasa', async () => {
    const { data, error } = await ctx.ownerA.client.rpc('is_platform_admin');
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it('tabel platform_admins tidak terbaca lewat REST (RLS nol policy)', async () => {
    const { data } = await ctx.ownerA.client.from('platform_admins').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  // ---------- Promosi jadi admin, lalu jalur yang sah ----------

  it('setelah dipromosikan: admin_list_orgs sukses dan memuat KEDUA org', async () => {
    // Bootstrap sengaja lewat service_role — tidak ada jalur self-promote.
    const { error: ePromote } = await ctx.admin.from('platform_admins').insert({
      user_id: ctx.ownerA.userId,
      email: ctx.ownerA.email,
      note: 'integration test',
    });
    expect(ePromote).toBeNull();

    const { data: isAdmin } = await ctx.ownerA.client.rpc('is_platform_admin');
    expect(isAdmin).toBe(true);

    const { data, error } = await ctx.ownerA.client.rpc('admin_list_orgs');
    expect(error).toBeNull();

    const ids = ((data ?? []) as { org_id: string }[]).map((r) => r.org_id);
    // Bukti lintas-tenant: org B bukan milik ownerA, tapi tetap terlihat.
    expect(ids).toContain(ctx.orgA);
    expect(ids).toContain(ctx.orgB);
  });

  it('admin_list_orgs mengembalikan jumlah agregat, TANPA isi bisnis klien', async () => {
    const { data } = await ctx.ownerA.client.rpc('admin_list_orgs');
    const rowB = ((data ?? []) as Record<string, unknown>[]).find((r) => r.org_id === ctx.orgB);
    expect(rowB).toBeDefined();

    // Metadata + jumlah yang dijanjikan ada.
    expect(rowB).toHaveProperty('org_name');
    expect(rowB).toHaveProperty('org_plan');
    expect(typeof rowB?.user_count).toBe('number');
    expect(typeof rowB?.sale_count).toBe('number');

    // Batas privasi ditegakkan: tak ada kolom yang membawa isi bisnis klien.
    for (const leaked of ['customers', 'services', 'revenue', 'total', 'balance', 'phone']) {
      expect(Object.keys(rowB ?? {})).not.toContain(leaked);
    }
  });

  it('admin platform BISA apply_payment invoice org LAIN (rekonsiliasi lintas-tenant)', async () => {
    // Invoice milik org B, dibuat oleh ownerB.
    const { data: invId, error: eInv } = await ctx.ownerB.client.rpc('start_subscription', {
      p_plan: 'standard',
      p_amount: 0,
    });
    expect(eInv).toBeNull();

    // ownerA (kini admin platform) menerima pembayaran org B.
    const { error } = await ctx.ownerA.client.rpc('apply_payment', { p_invoice_id: invId });
    expect(error).toBeNull();

    const { data: inv } = await ctx.admin
      .from('invoices')
      .select('status')
      .eq('id', invId)
      .single();
    expect(inv?.status).toBe('paid');
  });

  it('non-admin TIDAK bisa apply_payment invoice org lain; invoice tetap pending', async () => {
    const { data: invId, error: eInv } = await ctx.ownerB.client.rpc('start_subscription', {
      p_plan: 'standard',
      p_amount: 0,
    });
    expect(eInv).toBeNull();

    // karyawanA: bukan owner org B, bukan admin platform.
    const { error } = await ctx.karyawanA.client.rpc('apply_payment', { p_invoice_id: invId });
    expect(error).not.toBeNull();

    const { data: inv } = await ctx.admin
      .from('invoices')
      .select('status')
      .eq('id', invId)
      .single();
    expect(inv?.status).toBe('pending');
  });
});

// ---------- Regresi 0044: RPC listener GoPay hanya untuk service_role ----------
// Lubang ini (anon bisa mengeksekusi claim_gopay_payment) lolos dari review
// kode dan baru ketemu lewat probe manual ke staging. Sekarang dijaga suite.
d('Tier 2c — regresi grant listener GoPay (0044)', () => {
  let ctx: TenantCtx;

  beforeAll(async () => {
    ctx = await setupTenants();
  }, 120_000);

  afterAll(async () => {
    if (ctx) await teardownTenants(ctx);
  }, 120_000);

  it('anon DITOLAK claim_gopay_payment', async () => {
    const { error } = await makeAnon().rpc('claim_gopay_payment', { p_amount: 1 });
    expect(error).not.toBeNull();
  });

  it('user login biasa DITOLAK claim_gopay_payment', async () => {
    const { error } = await ctx.ownerA.client.rpc('claim_gopay_payment', { p_amount: 1 });
    expect(error).not.toBeNull();
  });

  it('anon DITOLAK expire_stale_gopay_invoices', async () => {
    const { error } = await makeAnon().rpc('expire_stale_gopay_invoices');
    expect(error).not.toBeNull();
  });

  it('start_gopay_invoice: karyawan ditolak, owner menghasilkan nominal unik', async () => {
    const { error: eDenied } = await ctx.karyawanA.client.rpc('start_gopay_invoice', {
      p_plan: 'standard',
      p_amount: 99000,
    });
    expect(eDenied).not.toBeNull();

    const { data, error } = await ctx.ownerA.client.rpc('start_gopay_invoice', {
      p_plan: 'standard',
      p_amount: 99000,
    });
    expect(error).toBeNull();

    const row = (Array.isArray(data) ? data[0] : data) as { exact_amount: number } | undefined;
    const amount = Number(row?.exact_amount);
    // Sufiks acak 0..999 di atas harga dasar — inilah korelator pembayaran.
    expect(amount).toBeGreaterThanOrEqual(99000);
    expect(amount).toBeLessThan(100000);
  });
});
