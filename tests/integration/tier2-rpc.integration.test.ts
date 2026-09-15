/**
 * TIER 2 — RPC, eskalasi peran, dan gerbang billing.
 *
 * Menguji lapis RPC security-definer (yang BYPASS RLS, jadi guard eksplisit
 * di dalam fungsi adalah satu-satunya pertahanan) + privilege khusus:
 *   - void_sale / receive_goods → manager-only.
 *   - set_member_role / deactivate_member → manager; owner-only utk role owner.
 *   - billing self-service → tidak tersedia sejak 0047.
 *   - restore_org_data → owner-only + org dipaksa (anti lintas-tenant).
 *   - track_service (publik) → hanya field aman, history internal tersembunyi.
 *
 * Fase "tests-only": test GAGAL = bukti celah. Lihat laporan temuan.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasConfig,
  setupTenants,
  teardownTenants,
  makeAnon,
  type TenantCtx,
} from './helpers';

const d = hasConfig ? describe : describe.skip;

let ctx: TenantCtx;

beforeAll(async () => {
  if (!hasConfig) return;
  ctx = await setupTenants();
}, 120000);

afterAll(async () => {
  if (ctx) await teardownTenants(ctx);
}, 120000);

d('Tier 2 — RPC privilege (manager/owner gates)', () => {
  it('karyawan TIDAK bisa void_sale (manager-only)', async () => {
    const { error } = await ctx.karyawanA.client.rpc('void_sale', {
      p_sale_id: ctx.saleAId,
      p_reason: 'iseng',
    });
    expect(error).not.toBeNull();
  });

  it('owner A TIDAK bisa void_sale milik org B (cross-tenant)', async () => {
    const { error } = await ctx.ownerA.client.rpc('void_sale', {
      p_sale_id: ctx.saleBId,
      p_reason: 'x',
    });
    expect(error).not.toBeNull();
    // Pastikan sale B tidak ter-void.
    const { data } = await ctx.admin
      .from('sales')
      .select('voided')
      .eq('id', ctx.saleBId)
      .single();
    expect(data?.voided).toBe(false);
  });

  it('karyawan TIDAK bisa set_member_role (eskalasi diri ke admin)', async () => {
    const { error } = await ctx.karyawanA.client.rpc('set_member_role', {
      p_member_id: ctx.karyawanA.membershipId,
      p_role: 'admin',
    });
    expect(error).not.toBeNull();
    const { data } = await ctx.admin
      .from('memberships')
      .select('role')
      .eq('id', ctx.karyawanA.membershipId)
      .single();
    expect(data?.role).toBe('karyawan'); // tetap karyawan
  });

  it('admin A TIDAK bisa mengangkat dirinya jadi owner (owner-only, 0016)', async () => {
    const { error } = await ctx.adminA.client.rpc('set_member_role', {
      p_member_id: ctx.adminA.membershipId,
      p_role: 'owner',
    });
    expect(error).not.toBeNull();
    const { data } = await ctx.admin
      .from('memberships')
      .select('role')
      .eq('id', ctx.adminA.membershipId)
      .single();
    expect(data?.role).toBe('admin');
  });

  it('admin A TIDAK bisa menurunkan OWNER A (owner-only)', async () => {
    const { error } = await ctx.adminA.client.rpc('set_member_role', {
      p_member_id: ctx.ownerA.membershipId,
      p_role: 'karyawan',
    });
    expect(error).not.toBeNull();
    const { data } = await ctx.admin
      .from('memberships')
      .select('role')
      .eq('id', ctx.ownerA.membershipId)
      .single();
    expect(data?.role).toBe('owner');
  });
});

d('Tier 2 — Eskalasi via PostgREST langsung (direct write)', () => {
  it('karyawan TIDAK bisa UPDATE role-nya sendiri via tabel memberships', async () => {
    const { data } = await ctx.karyawanA.client
      .from('memberships')
      .update({ role: 'owner' })
      .eq('id', ctx.karyawanA.membershipId)
      .select('id');
    expect(data ?? []).toHaveLength(0);
    const { data: check } = await ctx.admin
      .from('memberships')
      .select('role')
      .eq('id', ctx.karyawanA.membershipId)
      .single();
    expect(check?.role).toBe('karyawan');
  });

  it('admin A TIDAK bisa UPDATE plan_type org via tabel organizations (trigger guard 0016)', async () => {
    await ctx.adminA.client
      .from('organizations')
      .update({ plan_type: 'enterprise' })
      .eq('id', ctx.orgA);
    const { data } = await ctx.admin
      .from('organizations')
      .select('plan_type')
      .eq('id', ctx.orgA)
      .single();
    expect(data?.plan_type).not.toBe('enterprise'); // dipertahankan ke nilai lama
  });
});

d('Tier 2 — Billing gates', () => {
  it('owner pun TIDAK bisa membuat invoice self-service sejak 0047', async () => {
    const { error } = await ctx.ownerA.client.rpc('start_subscription', {
      p_plan: 'standard',
      p_amount: 99_000,
    });
    expect(error).not.toBeNull();
  });

  it('gerbang is_org_active: org kedaluwarsa (lewat grace) TIDAK bisa menulis', async () => {
    // Paksa org A kedaluwarsa via admin (service_role bypass trigger plan lock).
    const past = new Date(Date.now() - 10 * 864e5).toISOString();
    await ctx.admin
      .from('organizations')
      .update({ plan_type: 'trial', plan_expired_at: past })
      .eq('id', ctx.orgA);

    const { error } = await ctx.ownerA.client
      .from('customers')
      .insert({ org_id: ctx.orgA, name: 'Setelah Expired', phone: '0815' });
    expect(error).not.toBeNull(); // is_org_active() = false → tulis terblokir

    // Pulihkan agar tes lain (urutan tak dijamin) tak terdampak.
    const future = new Date(Date.now() + 14 * 864e5).toISOString();
    await ctx.admin
      .from('organizations')
      .update({ plan_expired_at: future })
      .eq('id', ctx.orgA);
  });
});

d('Tier 2 — restore_org_data (owner-only + anti lintas-tenant)', () => {
  it('karyawan TIDAK bisa restore_org_data', async () => {
    const { error } = await ctx.karyawanA.client.rpc('restore_org_data', {
      p_org_id: ctx.orgA,
      p_payload: {},
    });
    expect(error).not.toBeNull();
  });

  it('owner A TIDAK bisa restore data ke org B', async () => {
    const { error } = await ctx.ownerA.client.rpc('restore_org_data', {
      p_org_id: ctx.orgB,
      p_payload: {},
    });
    expect(error).not.toBeNull();
  });
});

d('Tier 2 — track_service (publik, anon) membocorkan hanya field aman', () => {
  it('anon BISA melihat status tapi TIDAK melihat history internal', async () => {
    const anon = makeAnon();
    const { data, error } = await anon.rpc('track_service', {
      p_org_id: ctx.orgA,
      p_service_no: ctx.serviceANo,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    const row = (data as Array<{ public_history: unknown; device: string }>)[0];
    expect(row).toBeTruthy();
    const serialized = JSON.stringify(row.public_history);
    expect(serialized).not.toContain('CATATAN-RAHASIA-INTERNAL'); // internal disaring
    // 0060: garansi per sparepart ikut dikirim, tapi hanya nama + tanggal — tanpa harga.
    expect(Array.isArray((row as unknown as { part_warranties: unknown }).part_warranties)).toBe(true);
    const whole = JSON.stringify(row);
    expect(whole).not.toMatch(/costPrice|sellPrice|cost_price|sell_price|final_cost/);
  });

  it('anon TIDAK bisa SELECT tabel services langsung', async () => {
    const anon = makeAnon();
    const { data } = await anon.from('services').select('id').eq('org_id', ctx.orgA);
    expect(data ?? []).toHaveLength(0); // RLS: anon bukan member
  });
});
