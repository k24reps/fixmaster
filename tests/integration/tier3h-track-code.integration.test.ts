/**
 * TIER 3H — kode lacak acak per tiket dan jejak cetak (migrasi 0100).
 *
 * `track_service` (0003/0060) menerima org + nomor servis. Nomor itu berurutan
 * (FM-0001, FM-0002, ...) dan id toko tercetak di QR setiap nota, jadi siapa pun
 * yang memegang satu nota bisa menebak tiket pelanggan lain. 0100 memberi tiap
 * tiket kode acak 10 karakter (50 bit) dan RPC publik yang hanya menerima kode.
 *
 * Yang dijaga berkas ini:
 *   - kode hanya bisa dibuat/dibaca anggota toko itu sendiri, dan stabil;
 *   - anon hanya punya `track_service_by_code`, dan isinya sama amannya dengan
 *     `track_service` (tanpa riwayat internal, tanpa harga);
 *   - tabel `service_tracking` dan fungsi pembantunya tertutup bagi klien;
 *   - batas 30 permintaan per menit per IP benar-benar menyala (uji terakhir).
 *
 * Uji terakhir menghabiskan kuota IP mesin ini selama satu menit. Menjalankan
 * ulang berkas ini dalam semenit membuat uji pencarian anon gagal dengan 429;
 * tunggu dulu.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasConfig, setupTenants, teardownTenants, makeAnon, type TenantCtx } from './helpers';

const d = hasConfig ? describe : describe.skip;

const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;

interface MetaRow {
  track_code: string;
  print_count: number;
  last_printed_at: string | null;
  last_printed_kind: string | null;
}

let ctx: TenantCtx;
let serviceAId: string;
let code: string;

const first = <T,>(data: unknown): T | undefined =>
  (Array.isArray(data) ? data[0] : data) as T | undefined;

d('tier3h — kode lacak dan jejak cetak (0100)', () => {
  beforeAll(async () => {
    ctx = await setupTenants();
    const { data, error } = await ctx.admin
      .from('services')
      .select('id')
      .eq('org_id', ctx.orgA)
      .eq('service_no', ctx.serviceANo)
      .single();
    if (error || !data) throw new Error(`service A tidak ditemukan: ${error?.message}`);
    serviceAId = data.id as string;
  }, 120_000);

  afterAll(async () => {
    if (ctx) await teardownTenants(ctx);
  }, 120_000);

  it('anggota toko mendapat kode berformat Crockford base32, dan kodenya stabil', async () => {
    const a = await ctx.ownerA.client.rpc('service_tracking_meta', {
      p_org_id: ctx.orgA,
      p_service_id: serviceAId,
    });
    expect(a.error).toBeNull();
    const row = first<MetaRow>(a.data);
    expect(row?.track_code).toMatch(CODE_RE);
    expect(row?.print_count).toBe(0);
    code = row!.track_code;

    // Karyawan toko yang sama melihat kode yang sama, bukan membuat kode kedua.
    const b = await ctx.karyawanA.client.rpc('service_tracking_meta', {
      p_org_id: ctx.orgA,
      p_service_id: serviceAId,
    });
    expect(b.error).toBeNull();
    expect(first<MetaRow>(b.data)?.track_code).toBe(code);
  });

  it('toko lain tidak bisa membaca kode tiket ini', async () => {
    const asOrgA = await ctx.ownerB.client.rpc('service_tracking_meta', {
      p_org_id: ctx.orgA,
      p_service_id: serviceAId,
    });
    expect(asOrgA.error, 'pemilik toko B membaca kode toko A').not.toBeNull();

    // Menyamar lewat org sendiri: tiketnya harus milik org yang disebut.
    const viaOwnOrg = await ctx.ownerB.client.rpc('service_tracking_meta', {
      p_org_id: ctx.orgB,
      p_service_id: serviceAId,
    });
    expect(viaOwnOrg.error, 'tiket toko A terbaca lewat org B').not.toBeNull();
  });

  it('anon tidak bisa membaca kode maupun mencatat cetakan', async () => {
    const anon = makeAnon();
    const meta = await anon.rpc('service_tracking_meta', {
      p_org_id: ctx.orgA,
      p_service_id: serviceAId,
    });
    expect(meta.error).not.toBeNull();
    const mark = await anon.rpc('mark_service_printed', {
      p_org_id: ctx.orgA,
      p_service_id: serviceAId,
      p_kind: 'intake',
    });
    expect(mark.error).not.toBeNull();
  });

  it('mencatat cetakan menaikkan hitungan dan menyimpan jenis terakhir', async () => {
    const one = await ctx.karyawanA.client.rpc('mark_service_printed', {
      p_org_id: ctx.orgA,
      p_service_id: serviceAId,
      p_kind: 'intake',
    });
    expect(one.error).toBeNull();
    expect(first<MetaRow>(one.data)).toMatchObject({
      track_code: code,
      print_count: 1,
      last_printed_kind: 'intake',
    });
    expect(first<MetaRow>(one.data)?.last_printed_at).toBeTruthy();

    const two = await ctx.ownerA.client.rpc('mark_service_printed', {
      p_org_id: ctx.orgA,
      p_service_id: serviceAId,
      p_kind: 'service',
    });
    expect(first<MetaRow>(two.data)).toMatchObject({ print_count: 2, last_printed_kind: 'service' });

    const bad = await ctx.ownerA.client.rpc('mark_service_printed', {
      p_org_id: ctx.orgA,
      p_service_id: serviceAId,
      p_kind: 'struk',
    });
    expect(bad.error).not.toBeNull();
  });

  it('anon menemukan tiket lewat kode, juga dalam huruf kecil bertanda hubung', async () => {
    const anon = makeAnon();
    const exact = await anon.rpc('track_service_by_code', { p_code: code });
    expect(exact.error).toBeNull();
    expect(first<{ service_no: string }>(exact.data)?.service_no).toBe(ctx.serviceANo);

    const typed = `${code.slice(0, 5)}-${code.slice(5)}`.toLowerCase();
    const loose = await anon.rpc('track_service_by_code', { p_code: typed });
    expect(first<{ service_no: string }>(loose.data)?.service_no).toBe(ctx.serviceANo);
  });

  it('hasil lewat kode sama amannya dengan track_service: tanpa riwayat internal dan harga', async () => {
    const { data } = await makeAnon().rpc('track_service_by_code', { p_code: code });
    const row = first<Record<string, unknown>>(data);
    expect(row).toBeTruthy();
    expect(JSON.stringify(row?.public_history)).not.toContain('CATATAN-RAHASIA-INTERNAL');
    expect(JSON.stringify(row)).not.toMatch(/costPrice|sellPrice|cost_price|sell_price|final_cost/);
    // Kode tidak memantulkan id toko maupun id tiket.
    expect(JSON.stringify(row)).not.toContain(ctx.orgA);
    expect(JSON.stringify(row)).not.toContain(serviceAId);
  });

  it('kode tak terdaftar atau berbentuk salah: nol baris, bukan galat', async () => {
    const anon = makeAnon();
    const unknown = code === '0000000000' ? '0000000001' : '0000000000';
    for (const p_code of [unknown, 'FM-0001', '', 'x'.repeat(200)]) {
      const r = await anon.rpc('track_service_by_code', { p_code });
      expect(r.error, p_code).toBeNull();
      expect(r.data ?? [], p_code).toHaveLength(0);
    }
  });

  it('tabel service_tracking dan pembantunya tertutup bagi klien', async () => {
    const anon = makeAnon();
    const anonRead = await anon.from('service_tracking').select('track_code');
    expect(anonRead.data ?? []).toHaveLength(0);
    // Anggota toko pun hanya lewat RPC: tabelnya tanpa policy.
    const ownerRead = await ctx.ownerA.client.from('service_tracking').select('track_code');
    expect(ownerRead.data ?? []).toHaveLength(0);

    expect((await anon.rpc('gen_track_code')).error).not.toBeNull();
    const ensure = await ctx.ownerA.client.rpc('service_tracking_ensure', {
      p_org_id: ctx.orgA,
      p_service_id: serviceAId,
    });
    expect(ensure.error, 'pembantu internal bisa dipanggil klien').not.toBeNull();
  });

  // Gagal di sini berarti header IP (cf-connecting-ip / x-forwarded-for) tidak
  // sampai ke PostgREST, sehingga batas per IP diam-diam mati. Kode 50 bit tetap
  // tak terjangkau penebakan, tapi temuan ini perlu dicatat di vault.
  it('lebih dari 30 permintaan per menit dari satu IP dibalas 429', async () => {
    const anon = makeAnon();
    let limited: { status: number; code: string | undefined } | null = null;
    for (let i = 0; i < 40 && !limited; i++) {
      const r = await anon.rpc('track_service_by_code', { p_code: code });
      if (r.error) limited = { status: r.status, code: r.error.code };
    }
    expect(limited, 'batas per IP tidak menyala').not.toBeNull();
    expect(limited!.status === 429 || limited!.code === 'PT429').toBe(true);
  }, 60_000);
});
