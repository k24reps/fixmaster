/**
 * TIER 2c — Admin platform & permukaan lintas-tenant (migration 0045-0047).
 *
 * Ini SATU-SATUNYA permukaan lintas-tenant di sistem: satu bug gating dan data
 * seluruh klien bocor sekaligus. Karena itu tesnya dua sisi — ditolak harus
 * benar-benar error DAN tanpa perubahan state; diizinkan harus benar-benar
 * bekerja lintas org.
 *
 * Asersi terpenting di file ini: **owner sebuah org BUKAN admin platform.**
 * Kalau suatu hari gating longgar, itulah baris yang gagal lebih dulu.
 *
 * Sejak 0047 seluruh jalur billing self-service dicabut. Pembayaran manual
 * diuji bersama kontrol tulis operator di tier2d.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasConfig,
  makeAnon,
  setupTenants,
  teardownTenants,
  type TenantCtx,
} from './helpers';

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

  it('owner tidak dapat membuat invoice self-service', async () => {
    const { error } = await ctx.ownerA.client.rpc('start_subscription', {
      p_plan: 'standard',
      p_amount: 99_000,
    });
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
    const rowB = ((data ?? []) as Record<string, unknown>[]).find(
      (r) => r.org_id === ctx.orgB,
    );
    expect(rowB).toBeDefined();

    // Metadata + jumlah yang dijanjikan ada.
    expect(rowB).toHaveProperty('org_name');
    expect(rowB).toHaveProperty('org_plan');
    expect(typeof rowB?.user_count).toBe('number');
    expect(typeof rowB?.outlet_count).toBe('number');
    expect(typeof rowB?.service_count).toBe('number');
    expect(rowB).not.toHaveProperty('sale_count');
    // 0084: nomor telepon TOKO (Profil Usaha) = metadata klien, kontak vendor.
    expect(typeof rowB?.org_phone).toBe('string');

    // Batas privasi ditegakkan: tak ada kolom yang membawa isi bisnis klien —
    // termasuk nomor PELANGGAN milik klien (`phone`, `customer_phone`).
    for (const leaked of [
      'customers',
      'services',
      'revenue',
      'total',
      'balance',
      'phone',
      'customer_phone',
    ]) {
      expect(Object.keys(rowB ?? {})).not.toContain(leaked);
    }
  });
});
