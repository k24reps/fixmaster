/**
 * TIER 3K — batas 100 unit per cabang per bulan (migrasi 0103).
 *
 * Yang dijaga berkas ini:
 *   - setelah 100 unit dipotong bulan ini di satu cabang, tiket berikutnya di
 *     cabang itu dicatat `capped` (0 unit) dan saldo tidak berubah;
 *   - cabang lain (di sini: tiket tanpa cabang) tetap dipotong;
 *   - unit_month_usage hanya untuk owner dan melaporkan dibayar/gratis.
 *
 * Supaya tidak membuat 100 tiket, 99 baris pemakaian tiruan disisipkan lewat
 * service role. Baris itu ikut terhapus saat teardown menghapus toko uji.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasConfig, setupTenants, teardownTenants, type TenantCtx } from './helpers';

const d = hasConfig ? describe : describe.skip;

let ctx: TenantCtx;
let outletId: string;

async function balanceOf(orgId: string): Promise<number> {
  const { data, error } = await ctx.admin
    .from('organizations')
    .select('unit_balance')
    .eq('id', orgId)
    .single();
  if (error) throw new Error(error.message);
  return data.unit_balance as number;
}

async function intake(label: string, outlet: string | null): Promise<string> {
  const id = randomUUID();
  const { error } = await ctx.ownerA.client.from('services').upsert({
    id,
    org_id: ctx.orgA,
    outlet_id: outlet,
    service_no: `CAP-${ctx.runId}-${label}`,
    customer_name: 'Pelanggan Batas',
    device: 'Printer Epson',
    status: 'diterima',
  });
  if (error) throw new Error(error.message);
  return id;
}

d('tier3k — batas bulanan per cabang (0103)', () => {
  beforeAll(async () => {
    ctx = await setupTenants();
    const existing = await ctx.admin
      .from('outlets')
      .select('id')
      .eq('org_id', ctx.orgA)
      .is('deleted_at', null)
      .limit(1);
    if (existing.data?.[0]) {
      outletId = existing.data[0].id as string;
    } else {
      const created = await ctx.admin
        .from('outlets')
        .insert({ org_id: ctx.orgA, name: 'Cabang Batas', is_primary: true })
        .select('id')
        .single();
      if (created.error) throw new Error(created.error.message);
      outletId = created.data.id as string;
    }
    const rows = Array.from({ length: 99 }, () => ({
      org_id: ctx.orgA,
      kind: 'usage',
      units: -1,
      balance_after: 0,
      service_id: randomUUID(),
      service_no: 'CAP-TIRUAN',
      outlet_id: outletId,
    }));
    const seeded = await ctx.admin.from('unit_ledger').insert(rows);
    if (seeded.error) throw new Error(seeded.error.message);
  }, 120_000);

  afterAll(async () => {
    if (ctx) await teardownTenants(ctx);
  }, 120_000);

  it('unit ke-100 dipotong, berikutnya gratis di cabang yang sama', async () => {
    const start = await balanceOf(ctx.orgA);
    await intake('A', outletId);
    expect(await balanceOf(ctx.orgA)).toBe(start - 1);

    const b = await intake('B', outletId);
    expect(await balanceOf(ctx.orgA)).toBe(start - 1);
    const { data } = await ctx.admin.from('unit_ledger').select('kind, units').eq('service_id', b);
    expect(data).toEqual([{ kind: 'capped', units: 0 }]);
  });

  it('batasnya per cabang: tiket tanpa cabang tetap dipotong', async () => {
    const start = await balanceOf(ctx.orgA);
    await intake('C', null);
    expect(await balanceOf(ctx.orgA)).toBe(start - 1);
  });

  it('unit_month_usage untuk owner saja', async () => {
    const own = await ctx.ownerA.client.rpc('unit_month_usage', { p_org_id: ctx.orgA });
    expect(own.error).toBeNull();
    const branch = (own.data as { outlet_id: string; paid_units: number; capped_units: number }[]).find(
      (row) => row.outlet_id === outletId,
    );
    expect(branch?.paid_units).toBe(100);
    expect(branch?.capped_units).toBe(1);

    const other = await ctx.ownerB.client.rpc('unit_month_usage', { p_org_id: ctx.orgA });
    expect(other.error?.message).toMatch(/Forbidden/);
  });
});
