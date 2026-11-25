/**
 * TIER 3L — tanggal masuk tiket mundur hanya untuk Pemilik (migrasi 0105).
 *
 * Form hanya menampilkan kolom "Tanggal masuk" untuk Pemilik, tetapi
 * `created_at` ditulis klien langsung ke tabel. Berkas ini membuktikan server
 * yang menegakkannya, bukan UI:
 *   - Pemilik boleh mencatat tiket baru bertanggal lampau, tidak boleh ke depan;
 *   - Admin dan karyawan tidak bisa membuat tiket bertanggal lampau lewat REST;
 *   - tiket biasa (tanpa `created_at`, jam server) tetap jalan untuk semua peran;
 *   - menyimpan ulang tiket lama (upsert yang berakhir sebagai UPDATE) tidak
 *     tersangkut penjaga, karena `created_at` tiket lama memang lampau.
 *
 * Test GAGAL di berkas ini = peran selain Pemilik bisa mengubah tanggal masuk.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasConfig, setupTenants, teardownTenants, type Actor, type TenantCtx } from './helpers';

const d = hasConfig ? describe : describe.skip;

let ctx: TenantCtx;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

/** Tiket baru seperti yang dikirim aplikasi: upsert baris penuh. */
async function intake(
  actor: Actor,
  label: string,
  createdAt?: string,
): Promise<{ id: string; error: string | null }> {
  const id = randomUUID();
  const { error } = await actor.client.from('services').upsert({
    id,
    org_id: ctx.orgA,
    service_no: `T-${ctx.runId}-${label}`,
    customer_name: 'Pelanggan Tanggal',
    device: 'Laptop Asus',
    status: 'diterima',
    ...(createdAt ? { created_at: createdAt } : {}),
  });
  return { id, error: error?.message ?? null };
}

async function storedCreatedAt(id: string): Promise<string | null> {
  const { data } = await ctx.admin.from('services').select('created_at').eq('id', id).maybeSingle();
  return (data?.created_at as string | undefined) ?? null;
}

d('tier3l — tanggal masuk tiket mundur khusus Pemilik (0105)', () => {
  let ownerBackdatedId = '';
  const ownerBackdatedAt = daysAgo(30);

  beforeAll(async () => {
    ctx = await setupTenants();
  }, 120_000);

  afterAll(async () => {
    if (ctx) await teardownTenants(ctx);
  }, 120_000);

  it('Pemilik mencatat tiket bertanggal lampau: tersimpan apa adanya', async () => {
    const r = await intake(ctx.ownerA, 'own-back', ownerBackdatedAt);
    expect(r.error).toBeNull();
    ownerBackdatedId = r.id;
    const stored = await storedCreatedAt(r.id);
    expect(stored).not.toBeNull();
    expect(Math.abs(new Date(stored as string).getTime() - new Date(ownerBackdatedAt).getTime())).toBeLessThan(1000);
  });

  it('Pemilik tidak bisa mencatat tiket bertanggal di masa depan', async () => {
    const r = await intake(ctx.ownerA, 'own-future', daysAhead(1));
    expect(r.error).toMatch(/masa depan/i);
    expect(await storedCreatedAt(r.id)).toBeNull();
  });

  it('Admin tidak bisa membuat tiket bertanggal lampau lewat REST', async () => {
    const r = await intake(ctx.adminA, 'adm-back', daysAgo(5));
    expect(r.error).toMatch(/hanya bisa diatur Pemilik/i);
    expect(await storedCreatedAt(r.id)).toBeNull();
  });

  it('karyawan tidak bisa membuat tiket bertanggal lampau lewat REST', async () => {
    const r = await intake(ctx.karyawanA, 'kar-back', daysAgo(5));
    expect(r.error).toMatch(/hanya bisa diatur Pemilik/i);
    expect(await storedCreatedAt(r.id)).toBeNull();
  });

  it('admin dan karyawan tidak bisa membuat tiket bertanggal di masa depan', async () => {
    const a = await intake(ctx.adminA, 'adm-future', daysAhead(1));
    const k = await intake(ctx.karyawanA, 'kar-future', daysAhead(1));
    expect(a.error).toMatch(/hanya bisa diatur Pemilik/i);
    expect(k.error).toMatch(/hanya bisa diatur Pemilik/i);
  });

  it('tiket biasa tanpa created_at tetap jalan untuk semua peran', async () => {
    for (const [actor, label] of [
      [ctx.ownerA, 'own-now'],
      [ctx.adminA, 'adm-now'],
      [ctx.karyawanA, 'kar-now'],
    ] as const) {
      const r = await intake(actor, label);
      expect(r.error, label).toBeNull();
      const stored = await storedCreatedAt(r.id);
      expect(Math.abs(Date.now() - new Date(stored as string).getTime())).toBeLessThan(60_000);
    }
  });

  it('menyimpan ulang tiket lama (UPDATE) oleh admin tidak tersangkut penjaga', async () => {
    expect(ownerBackdatedId).not.toBe('');
    const { error } = await ctx.adminA.client.from('services').upsert({
      id: ownerBackdatedId,
      org_id: ctx.orgA,
      service_no: `T-${ctx.runId}-own-back`,
      customer_name: 'Pelanggan Tanggal',
      device: 'Laptop Asus (diperbarui)',
      status: 'diterima',
      created_at: ownerBackdatedAt,
    });
    expect(error?.message ?? null).toBeNull();
    const { data } = await ctx.admin.from('services').select('device').eq('id', ownerBackdatedId).single();
    expect(data?.device).toBe('Laptop Asus (diperbarui)');
  });
});
