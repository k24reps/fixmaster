/**
 * TIER 1 — Isolasi tenant & matriks peran (RLS server).
 *
 * Membuktikan bahwa Row Level Security benar-benar menjadi batas keamanan:
 *   - Tenant A tidak bisa membaca / menulis / menghapus data Tenant B.
 *   - Karyawan tidak bisa membaca keuangan (incomes/expenses) atau menulis
 *     tabel manager-only (inventory, wallets, dst).
 *   - Hard-delete tabel operasional = manager-only.
 *
 * Fase "tests-only": test yang GAGAL = bukti celah keamanan, bukan untuk
 * langsung diperbaiki. Lihat laporan temuan di artifact.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasConfig, setupTenants, teardownTenants, type TenantCtx } from './helpers';

const d = hasConfig ? describe : describe.skip;

let ctx: TenantCtx;

beforeAll(async () => {
  if (!hasConfig) return;
  ctx = await setupTenants();
}, 120000);

afterAll(async () => {
  if (ctx) await teardownTenants(ctx);
}, 120000);

d('Tier 1 — Isolasi tenant (cross-tenant read/write)', () => {
  it('karyawan A TIDAK bisa membaca customers milik org B', async () => {
    const { data, error } = await ctx.karyawanA.client
      .from('customers')
      .select('id')
      .eq('id', ctx.custBId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0); // RLS menyaring baris org lain
  });

  it('owner A TIDAK bisa membaca sales milik org B', async () => {
    const { data } = await ctx.ownerA.client.from('sales').select('id').eq('id', ctx.saleBId);
    expect(data ?? []).toHaveLength(0);
  });

  it('owner A TIDAK bisa INSERT customer ke org B', async () => {
    const { error } = await ctx.ownerA.client
      .from('customers')
      .insert({ org_id: ctx.orgB, name: 'Penyusup', phone: '0812' });
    expect(error).not.toBeNull(); // ditolak with check
  });

  it('owner A TIDAK bisa UPDATE customer milik org B', async () => {
    const { data } = await ctx.ownerA.client
      .from('customers')
      .update({ name: 'Diretas' })
      .eq('id', ctx.custBId)
      .select('id');
    expect(data ?? []).toHaveLength(0); // tak ada baris terpengaruh
  });

  it('owner A TIDAK bisa DELETE sales milik org B', async () => {
    await ctx.ownerA.client.from('sales').delete().eq('id', ctx.saleBId);
    // Verifikasi via admin: baris B harus masih ada.
    const { data } = await ctx.admin.from('sales').select('id').eq('id', ctx.saleBId);
    expect(data ?? []).toHaveLength(1);
  });

  it('owner A TIDAK bisa membaca organizations milik org B', async () => {
    const { data } = await ctx.ownerA.client.from('organizations').select('id').eq('id', ctx.orgB);
    expect(data ?? []).toHaveLength(0);
  });
});

d('Tier 1 — Matriks peran (karyawan vs manager)', () => {
  it('karyawan TIDAK bisa membaca incomes (keuangan manager-only)', async () => {
    const { data } = await ctx.karyawanA.client.from('incomes').select('id').eq('org_id', ctx.orgA);
    expect(data ?? []).toHaveLength(0); // 0016: incomes_select manager-only
  });

  it('manager (owner) BISA membaca incomes org-nya', async () => {
    const { data, error } = await ctx.ownerA.client
      .from('incomes')
      .select('id')
      .eq('org_id', ctx.orgA);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('karyawan TIDAK bisa membaca expenses', async () => {
    const { data } = await ctx.karyawanA.client.from('expenses').select('id').eq('org_id', ctx.orgA);
    expect(data ?? []).toHaveLength(0);
  });

  it('karyawan TIDAK bisa INSERT inventory (manager-only sejak 0017)', async () => {
    const { error } = await ctx.karyawanA.client
      .from('inventory_items')
      .insert({ org_id: ctx.orgA, name: 'Sparepart Selundupan', stock: 1 });
    expect(error).not.toBeNull();
  });

  it('karyawan TIDAK bisa INSERT income', async () => {
    const { error } = await ctx.karyawanA.client
      .from('incomes')
      .insert({ org_id: ctx.orgA, date: '2026-01-01', amount: 1, category: 'Lainnya' });
    expect(error).not.toBeNull();
  });

  it('karyawan TIDAK bisa hard-DELETE customer (manager-only sejak 0017)', async () => {
    // Seed customer A via admin lebih dulu.
    const { data: c } = await ctx.admin
      .from('customers')
      .insert({ org_id: ctx.orgA, name: 'Cust A del', phone: '0813' })
      .select('id')
      .single();
    await ctx.karyawanA.client.from('customers').delete().eq('id', c!.id);
    const { data } = await ctx.admin.from('customers').select('id').eq('id', c!.id);
    expect(data ?? []).toHaveLength(1); // masih ada → delete ditolak
  });

  it('karyawan BISA INSERT customer (operasional, member-write)', async () => {
    const { error } = await ctx.karyawanA.client
      .from('customers')
      .insert({ org_id: ctx.orgA, name: 'Cust by Karyawan', phone: '0814' });
    expect(error).toBeNull();
  });
});
