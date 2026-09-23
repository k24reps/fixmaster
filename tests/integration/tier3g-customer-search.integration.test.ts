/**
 * TIER 3G — pencarian pelanggan sisi server tidak boleh melewatkan siapa pun.
 *
 * Pelanggan dulu ditarik SATU TABEL PENUH (`FULL_LIST`) karena dua kebutuhan:
 * kotak saran, dan pemeriksaan duplikat sebelum membuat pelanggan baru.
 * Keduanya kini query bertarget — dan di situ letak bahayanya.
 *
 * `normalizePhone` memetakan awalan `62` → `0`, jadi "+62 812-3456" dan
 * "0812 3456" adalah ORANG YANG SAMA. Database menyimpan nomor MENTAH, dan
 * `ilike` bekerja pada string mentah itu. Kalau filter hanya mencari satu
 * bentuk, ia gagal menemukan pelanggan yang sudah ada dan alur simpan servis
 * membuat DUPLIKAT — persis bug yang membuat `FULL_LIST` ada.
 *
 * Test GAGAL di berkas ini = pelanggan ganda mulai bermunculan.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasConfig, setupTenants, teardownTenants, type TenantCtx } from './helpers';
import { phoneLookupFilter, customerSearchFilter, findByPhone } from '@/lib/business/customers';

const d = hasConfig ? describe : describe.skip;

let ctx: TenantCtx;
const ids: string[] = [];

/** Satu orang yang sama, ditulis dengan empat gaya berbeda. */
const WRITINGS = ['0812000111', '+62 812-000-111', '0812 000 111', '62812000111'];

d('tier3g — pencarian pelanggan', () => {
  beforeAll(async () => {
    ctx = await setupTenants();
    // Empat baris, tiap satu memakai penulisan berbeda untuk nomor yang sama.
    for (const phone of WRITINGS) {
      const { data } = await ctx.admin
        .from('customers')
        .insert({ org_id: ctx.orgA, name: `Uji ${phone}`, phone })
        .select('id')
        .single();
      if (data) ids.push(data.id as string);
    }
  }, 120_000);

  afterAll(async () => {
    if (ids.length) await ctx.admin.from('customers').delete().in('id', ids);
    await teardownTenants(ctx);
  }, 60_000);

  it('menemukan SETIAP penulisan, apa pun bentuk yang dicari', async () => {
    // Inti anti-duplikat: cari dengan bentuk apa pun, semua baris harus terjaring.
    for (const query of WRITINGS) {
      const filter = phoneLookupFilter(query);
      expect(filter, `tidak ada filter untuk "${query}"`).not.toBeNull();
      const { data, error } = await ctx.ownerA.client
        .from('customers')
        .select('*')
        .eq('org_id', ctx.orgA)
        .is('deleted_at', null)
        .or(filter!)
        .limit(50);
      expect(error).toBeNull();
      const found = (data ?? []).map((r) => r.id as string);
      for (const id of ids) {
        expect(found, `mencari "${query}" melewatkan baris ${id}`).toContain(id);
      }
    }
  });

  it('findByPhone tetap yang memutuskan, dan setuju dengan hasil server', async () => {
    const filter = phoneLookupFilter('0812000111')!;
    const { data } = await ctx.ownerA.client
      .from('customers')
      .select('*')
      .eq('org_id', ctx.orgA)
      .is('deleted_at', null)
      .or(filter)
      .limit(50);
    const rows = (data ?? []).map((r) => ({ id: r.id as string, phone: r.phone as string }));
    // Server memberi SUPERSET; fungsi murni yang menyaring persis.
    expect(findByPhone(rows, '+62 812-000-111')).not.toBeNull();
  });

  it('pencarian nama tidak membocorkan org lain', async () => {
    // 'Pelanggan B' hanya ada di org B (helpers). Owner A tidak boleh melihatnya.
    const filter = customerSearchFilter('Pelanggan B')!;
    const { data } = await ctx.ownerA.client
      .from('customers')
      .select('id')
      .eq('org_id', ctx.orgA)
      .or(filter)
      .limit(50);
    expect((data ?? []).map((r) => r.id)).not.toContain(ctx.custBId);
  });
});
