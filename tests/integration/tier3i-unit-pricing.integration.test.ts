/**
 * TIER 3I — harga per unit masuk (migrasi 0101).
 *
 * Yang dijaga berkas ini:
 *   - toko baru mulai dari 50 unit dengan baris `grant` di buku saldo;
 *   - tiket yang DIBUAT aplikasi memotong satu unit, upsert yang berakhir
 *     sebagai UPDATE tidak (tiket disimpan lewat repository.put);
 *   - kolom unit_balance tidak bisa diubah klien lewat UPDATE organizations;
 *   - buku saldo hanya terbaca owner;
 *   - di batas minus (-20) tiket BARU ditolak, tiket lama tetap bisa diubah;
 *   - batal atau hapus dalam 10 menit mengembalikan unit, sekali saja;
 *   - hapus tiket: owner saja, hanya tiket bersih, tercatat di Log Aktivitas,
 *     dan hapus langsung lewat REST tidak lagi mungkin.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasConfig, setupTenants, teardownTenants, type TenantCtx } from './helpers';

const d = hasConfig ? describe : describe.skip;

let ctx: TenantCtx;

async function balanceOf(orgId: string): Promise<number> {
  const { data, error } = await ctx.admin
    .from('organizations')
    .select('unit_balance')
    .eq('id', orgId)
    .single();
  if (error) throw new Error(error.message);
  return data.unit_balance as number;
}

/** Tiket baru seperti yang dikirim aplikasi: upsert baris penuh. */
async function intake(label: string): Promise<{ id: string; error: string | null }> {
  const id = randomUUID();
  const { error } = await ctx.ownerA.client.from('services').upsert({
    id,
    org_id: ctx.orgA,
    service_no: `U-${ctx.runId}-${label}`,
    customer_name: 'Pelanggan Unit',
    device: 'Laptop Asus',
    status: 'diterima',
  });
  return { id, error: error?.message ?? null };
}

d('tier3i — harga per unit (0101)', () => {
  beforeAll(async () => {
    ctx = await setupTenants();
  }, 120_000);

  afterAll(async () => {
    if (ctx) await teardownTenants(ctx);
  }, 120_000);

  it('toko baru mulai dari 50 unit dengan baris kuota gratis', async () => {
    expect(await balanceOf(ctx.orgB)).toBe(50);
    const { data } = await ctx.admin
      .from('unit_ledger')
      .select('kind, units, balance_after')
      .eq('org_id', ctx.orgB);
    expect(data).toEqual([{ kind: 'grant', units: 50, balance_after: 50 }]);
  });

  it('tiket baru memotong satu unit; upsert ulang baris yang sama tidak', async () => {
    const before = await balanceOf(ctx.orgA);
    const created = await intake('A1');
    expect(created.error).toBeNull();
    expect(await balanceOf(ctx.orgA)).toBe(before - 1);

    const { error } = await ctx.ownerA.client.from('services').upsert({
      id: created.id,
      org_id: ctx.orgA,
      service_no: `U-${ctx.runId}-A1`,
      customer_name: 'Pelanggan Unit',
      device: 'Laptop Asus ROG',
      status: 'diterima',
    });
    expect(error).toBeNull();
    expect(await balanceOf(ctx.orgA)).toBe(before - 1);

    const { data: usage } = await ctx.admin
      .from('unit_ledger')
      .select('units, service_no')
      .eq('service_id', created.id);
    expect(usage).toEqual([{ units: -1, service_no: `U-${ctx.runId}-A1` }]);
  });

  it('klien tidak bisa mengubah unit_balance lewat UPDATE organizations', async () => {
    const before = await balanceOf(ctx.orgA);
    await ctx.ownerA.client.from('organizations').update({ unit_balance: 9999 }).eq('id', ctx.orgA);
    expect(await balanceOf(ctx.orgA)).toBe(before);
  });

  it('buku saldo terbaca owner, tidak oleh admin atau karyawan', async () => {
    const owner = await ctx.ownerA.client.from('unit_ledger').select('id').eq('org_id', ctx.orgA);
    expect((owner.data ?? []).length).toBeGreaterThan(0);
    for (const actor of [ctx.adminA, ctx.karyawanA]) {
      const { data } = await actor.client.from('unit_ledger').select('id').eq('org_id', ctx.orgA);
      expect(data ?? []).toHaveLength(0);
    }
    const insert = await ctx.ownerA.client
      .from('unit_ledger')
      .insert({ org_id: ctx.orgA, kind: 'adjust', units: 100, balance_after: 0 });
    expect(insert.error).not.toBeNull();
  });

  it('batal dalam 10 menit mengembalikan unit', async () => {
    const created = await intake('CANCEL');
    expect(created.error).toBeNull();
    const before = await balanceOf(ctx.orgA);

    const { error } = await ctx.ownerA.client.rpc('cancel_service', {
      p_org_id: ctx.orgA,
      p_service_id: created.id,
      p_history: [{ status: 'batal', note: 'salah input' }],
    });
    expect(error).toBeNull();
    expect(await balanceOf(ctx.orgA)).toBe(before + 1);

    const { data: refund } = await ctx.admin
      .from('unit_ledger')
      .select('units')
      .eq('service_id', created.id)
      .eq('kind', 'refund');
    expect(refund).toEqual([{ units: 1 }]);
  });

  it('hapus tiket: owner saja, hanya yang bersih, tercatat, dan unit kembali', async () => {
    const created = await intake('DEL');
    expect(created.error).toBeNull();

    for (const actor of [ctx.adminA, ctx.karyawanA]) {
      const { error } = await actor.client.rpc('delete_service_ticket', {
        p_org_id: ctx.orgA,
        p_service_id: created.id,
      });
      expect(error).not.toBeNull();
    }

    // Hapus langsung lewat REST tidak punya policy lagi: baris tetap ada.
    await ctx.ownerA.client.from('services').delete().eq('id', created.id);
    const still = await ctx.admin.from('services').select('id').eq('id', created.id);
    expect(still.data).toHaveLength(1);

    const before = await balanceOf(ctx.orgA);
    const { data, error } = await ctx.ownerA.client.rpc('delete_service_ticket', {
      p_org_id: ctx.orgA,
      p_service_id: created.id,
    });
    expect(error).toBeNull();
    expect(data).toEqual({ refunded: true });
    expect(await balanceOf(ctx.orgA)).toBe(before + 1);

    const gone = await ctx.admin.from('services').select('id').eq('id', created.id);
    expect(gone.data).toHaveLength(0);

    const { data: log } = await ctx.admin
      .from('activity_logs')
      .select('action, entity_label')
      .eq('org_id', ctx.orgA)
      .eq('entity_id', created.id);
    expect(log).toEqual([{ action: 'service.delete', entity_label: `U-${ctx.runId}-DEL` }]);
  });

  it('tiket yang sudah menerima DP tidak bisa dihapus', async () => {
    const created = await intake('PAID');
    expect(created.error).toBeNull();
    await ctx.admin.from('services').update({ down_payment: 50_000 }).eq('id', created.id);

    const { error } = await ctx.ownerA.client.rpc('delete_service_ticket', {
      p_org_id: ctx.orgA,
      p_service_id: created.id,
    });
    expect(error?.message).toMatch(/pembayaran/);
  });

  it('di batas minus tiket BARU ditolak, tiket lama tetap bisa diubah', async () => {
    const existing = await intake('OLD');
    expect(existing.error).toBeNull();

    // service_role melewati penjaga kolom; hanya untuk menyiapkan keadaan uji.
    await ctx.admin.from('organizations').update({ unit_balance: -20 }).eq('id', ctx.orgA);

    const blocked = await intake('BLOCKED');
    expect(blocked.error).toMatch(/Saldo unit habis/);
    expect(await balanceOf(ctx.orgA)).toBe(-20);

    const { error } = await ctx.ownerA.client
      .from('services')
      .update({ complaint: 'Masih dikerjakan' })
      .eq('id', existing.id);
    expect(error).toBeNull();

    await ctx.admin.from('organizations').update({ unit_balance: 50 }).eq('id', ctx.orgA);
  });
});
