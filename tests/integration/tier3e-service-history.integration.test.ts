/**
 * TIER 3E — Riwayat servis append-only (0058) + daftar servis ringan.
 *
 * Daftar servis di cloud tidak lagi memuat `history` (≈78% ukuran tiap baris
 * di produksi — sumber egress terbesar). Konsekuensinya klien menambah riwayat
 * dari baris yang TIDAK membawa riwayat lama, jadi kalau database masih
 * menerima `history = <isi kiriman>`, satu klik status akan menghapus seluruh
 * jejak audit tiket. Berkas ini membuktikan hal itu tidak bisa terjadi, dan
 * sekaligus menutup dua lubang lama: entri hilang saat dua perangkat menulis
 * bersamaan, dan jejak audit yang bisa ditulis ulang lewat REST.
 *
 * Test GAGAL di berkas ini = riwayat tiket bisa hilang.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasConfig, setupTenants, teardownTenants, type TenantCtx } from './helpers';
import { SERVICE_LIST_COLUMNS } from '@/data/types';

const d = hasConfig ? describe : describe.skip;

let ctx: TenantCtx;
let serviceId = '';
/** Catatan riwayat awal dari setupTenants. */
const SEEDED = ['CATATAN-RAHASIA-INTERNAL', 'Unit diterima'];

const entry = (note: string) => ({
  at: new Date().toISOString(),
  status: 'edit',
  by: '',
  byName: 'Uji',
  note,
  internal: false,
});

const notes = async (): Promise<string[]> => {
  const { data, error } = await ctx.admin
    .from('services')
    .select('history')
    .eq('id', serviceId)
    .single();
  if (error) throw new Error(error.message);
  return (data.history as { note: string }[]).map((h) => h.note);
};

/** Tulis history sebagai karyawan; pastikan baris benar-benar terkena (bukan disaring RLS). */
const writeHistory = async (history: unknown) => {
  const { data, error } = await ctx.karyawanA.client
    .from('services')
    .update({ history })
    .eq('id', serviceId)
    .select('id');
  return { error, touched: data?.length ?? 0 };
};

beforeAll(async () => {
  if (!hasConfig) return;
  ctx = await setupTenants();
  const { data, error } = await ctx.admin
    .from('services')
    .select('id')
    .eq('org_id', ctx.orgA)
    .eq('service_no', ctx.serviceANo)
    .single();
  if (error) throw new Error(`seed service: ${error.message}`);
  serviceId = data.id as string;
}, 120000);

afterAll(async () => {
  if (ctx) await teardownTenants(ctx);
}, 120000);

d('Tier 3E — history hanya bisa ditambah', () => {
  it('prasyarat: karyawan memang bisa meng-UPDATE tiket ini', async () => {
    // Tanpa ini, test "tidak terhapus" di bawah bisa lulus hanya karena RLS
    // menyaring barisnya.
    const { error, touched } = await writeHistory([]);
    expect(error).toBeNull();
    expect(touched).toBe(1);
  });

  it('mengirim array kosong TIDAK menghapus riwayat', async () => {
    await writeHistory([]);
    expect(await notes()).toEqual(SEEDED);
  });

  it('mengirim entri baru saja → ditambahkan di belakang, riwayat lama utuh', async () => {
    // Bentuk yang dikirim aplikasi baru: baris daftar tidak membawa history.
    const { error } = await writeHistory([entry('A')]);
    expect(error).toBeNull();
    expect(await notes()).toEqual([...SEEDED, 'A']);
  });

  it('dua perangkat dari salinan lama yang sama → entri keduanya bertahan', async () => {
    const { data } = await ctx.admin.from('services').select('history').eq('id', serviceId).single();
    const stale = data!.history as unknown[];
    await writeHistory([...stale, entry('B')]);
    await writeHistory([...stale, entry('C')]); // dulu: menimpa B
    const got = await notes();
    expect(got).toContain('B');
    expect(got).toContain('C');
    expect(got.slice(0, 3)).toEqual([...SEEDED, 'A']);
  });

  it('entri lama tidak bisa ditulis ulang lewat REST', async () => {
    const { error } = await writeHistory([{ internal: false, note: 'DIPALSUKAN' }]);
    expect(error).toBeNull();
    const got = await notes();
    expect(got.slice(0, 2)).toEqual(SEEDED);
  });

  it('isi yang bukan array ditolak', async () => {
    const { error } = await writeHistory({ note: 'bukan array' });
    expect(error).not.toBeNull();
  });

  it('settle_service dengan p_history berisi entri baru saja mempertahankan riwayat', async () => {
    const before = await notes();
    await ctx.admin.from('services').update({ status: 'selesai' }).eq('id', serviceId);
    const { error } = await ctx.karyawanA.client.rpc('settle_service', {
      p_org_id: ctx.orgA,
      p_service_id: serviceId,
      p_payments: [],
      p_history: [entry('LUNAS')],
      p_outlet_id: null,
    });
    expect(error).toBeNull();
    expect(await notes()).toEqual([...before, 'LUNAS']);
  });
});

d('Tier 3E — daftar servis ringan', () => {
  it('SERVICE_LIST_COLUMNS = semua kolom services kecuali history', async () => {
    // Kolom baru di tabel yang lupa ditambahkan ke daftar akan hilang diam-diam
    // dari setiap layar yang memakai list(). Test ini yang menangkapnya.
    const { data, error } = await ctx.admin.from('services').select('*').eq('id', serviceId).single();
    expect(error).toBeNull();
    const expected = Object.keys(data!).filter((k) => k !== 'history').sort();
    expect(SERVICE_LIST_COLUMNS.split(',').sort()).toEqual(expected);
  });

  it('karyawan bisa membaca daftar dengan kolom itu', async () => {
    const { data, error } = await ctx.karyawanA.client
      .from('services')
      .select(SERVICE_LIST_COLUMNS)
      .eq('id', serviceId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).not.toHaveProperty('history');
  });
});
