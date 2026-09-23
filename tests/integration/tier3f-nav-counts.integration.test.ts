/**
 * TIER 3F — `nav_counts` (0081) harus setuju dengan perhitungan klien.
 *
 * Rel diagnostik di Sidebar + MobileBottomNav dulu menarik services, inventory,
 * dan purchase_orders UTUH hanya untuk beberapa bilangan — dibayar di SETIAP
 * halaman. RPC ini menggantikannya, tapi itu berarti aturan yang sama kini
 * hidup di DUA tempat: SQL di sini, dan TypeScript di `useNavSignals`.
 *
 * Test GAGAL di berkas ini = badge rel nav menampilkan angka yang berbeda dari
 * halamannya sendiri. Itu persis kegagalan yang diperingatkan komentar
 * `visibleInstances` (lib/business/tasks.ts) — badge "7" dengan dua baris.
 *
 * Juga menjaga isolasi: RPC ini SECURITY INVOKER, jadi RLS harus membuat org B
 * tidak terhitung di angka org A.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasConfig, setupTenants, teardownTenants, type TenantCtx } from './helpers';
import { isActive } from '@/lib/business/services';
import type { NavCounts } from '@/data/types';

const d = hasConfig ? describe : describe.skip;

let ctx: TenantCtx;

/** Hitung ulang dari baris mentah, memakai aturan TypeScript yang sama. */
async function expectedFromRows(orgId: string) {
  const [services, inventory, pos] = await Promise.all([
    ctx.admin.from('services').select('status, deleted_at').eq('org_id', orgId),
    ctx.admin.from('inventory_items').select('stock, min_stock, deleted_at').eq('org_id', orgId),
    ctx.admin.from('purchase_orders').select('status, deleted_at').eq('org_id', orgId),
  ]);
  const live = <T extends { deleted_at: string | null }>(r: { data: T[] | null }) =>
    (r.data ?? []).filter((x) => x.deleted_at === null);

  const s = live(services as { data: { status: string; deleted_at: string | null }[] });
  const i = live(
    inventory as { data: { stock: number; min_stock: number; deleted_at: string | null }[] },
  );
  const p = live(pos as { data: { status: string; deleted_at: string | null }[] });

  return {
    servicesActive: s.filter((x) => isActive(x.status as never)).length,
    servicesAwaitingConfirm: s.some((x) => x.status === 'konfirmasi'),
    inventoryOut: i.filter((x) => x.stock <= 0).length,
    inventoryLow: i.filter((x) => x.stock > 0 && x.stock <= x.min_stock).length,
    poOpen: p.filter((x) => x.status === 'ordered' || x.status === 'partial').length,
  };
}

d('tier3f — nav_counts', () => {
  beforeAll(async () => {
    ctx = await setupTenants();
  }, 120_000);
  afterAll(async () => {
    await teardownTenants(ctx);
  }, 60_000);

  it('cocok dengan perhitungan klien untuk org pemanggil', async () => {
    const { data, error } = await ctx.ownerA.client.rpc('nav_counts', { p_outlet_id: null });
    expect(error).toBeNull();
    const counts = data as NavCounts;
    expect(counts).toMatchObject(await expectedFromRows(ctx.orgA));
  });

  it('tidak membocorkan org lain (RLS lewat security invoker)', async () => {
    const a = (await ctx.ownerA.client.rpc('nav_counts', { p_outlet_id: null }))
      .data as NavCounts;
    const b = (await ctx.ownerB.client.rpc('nav_counts', { p_outlet_id: null }))
      .data as NavCounts;
    // Keduanya hanya boleh melihat datanya sendiri; angkanya dihitung terpisah.
    expect(a).toMatchObject(await expectedFromRows(ctx.orgA));
    expect(b).toMatchObject(await expectedFromRows(ctx.orgB));
  });

  it('karyawan mendapat angka yang sama dengan owner di org yang sama', async () => {
    // Ketiga tabel ini dibaca semua anggota aktif (0002), jadi rel nav harus
    // menunjukkan angka yang sama — bukan nol karena kebijakan yang meleset.
    const owner = (await ctx.ownerA.client.rpc('nav_counts', { p_outlet_id: null }))
      .data as NavCounts;
    const staff = (await ctx.karyawanA.client.rpc('nav_counts', { p_outlet_id: null }))
      .data as NavCounts;
    expect(staff).toEqual(owner);
  });
});
