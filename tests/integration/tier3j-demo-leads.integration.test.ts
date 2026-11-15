/**
 * TIER 3J — kontak gerbang demo landing (migrasi 0102).
 *
 * Yang dijaga berkas ini:
 *   - anon hanya bisa MENULIS lewat `submit_demo_lead`; nomor dinormalisasi ke
 *     62xxxxxxxxxx, nomor yang sama memperbarui satu baris;
 *   - nomor atau nama toko yang tidak sah ditolak dengan hint yang dibaca
 *     klien (`demo_lead_phone` / `demo_lead_name`);
 *   - kolom jebakan tidak menulis apa pun tetapi tetap menjawab sukses;
 *   - tabel `demo_leads` dan RPC operator tertutup bagi anon dan bagi pengguna
 *     biasa; pemicu notifikasi dan pembersih tidak bisa dipanggil klien.
 *
 * Batas per jaringan (8 kiriman per 10 menit) TIDAK diuji di sini: berkas ini
 * mengirim empat kali, dan menguji batasnya akan memblokir IP mesin uji selama
 * sepuluh menit. Batas itu diuji `scripts/selfhost/uji-0102.sql`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasConfig, setupTenants, teardownTenants, makeAnon, type TenantCtx } from './helpers';

const d = hasConfig ? describe : describe.skip;

// Nomor 0899-0000-xxxx: rentang yang tidak dipakai pelanggan sungguhan.
const PHONE_LOCAL = '0899-0000-3101';
const PHONE_NORMAL = '6289900003101';

let ctx: TenantCtx;

d('tier3j — kontak gerbang demo (0102)', () => {
  beforeAll(async () => {
    ctx = await setupTenants();
  }, 120_000);

  afterAll(async () => {
    if (ctx) {
      await ctx.admin.from('demo_leads').delete().in('phone', [PHONE_NORMAL, '6289900003102']);
      await teardownTenants(ctx);
    }
  }, 120_000);

  it('anon mengisi gerbang; nomor yang sama memperbarui satu baris', async () => {
    const anon = makeAnon();
    const first = await anon.rpc('submit_demo_lead', {
      p_shop_name: '  Uji   Gerbang ',
      p_phone: PHONE_LOCAL,
      p_source: 'hero',
      p_locale: 'id',
      p_trap: '',
    });
    expect(first.error).toBeNull();

    const again = await anon.rpc('submit_demo_lead', {
      p_shop_name: 'Uji Gerbang Dua',
      p_phone: '+62 899 0000 3101',
      p_source: 'final',
      p_locale: 'en',
      p_trap: '',
    });
    expect(again.error).toBeNull();

    const { data, error } = await ctx.admin
      .from('demo_leads')
      .select('shop_name, phone, source, locale, visits')
      .eq('phone', PHONE_NORMAL);
    expect(error).toBeNull();
    expect(data).toEqual([
      { shop_name: 'Uji Gerbang Dua', phone: PHONE_NORMAL, source: 'final', locale: 'en', visits: 2 },
    ]);
  });

  it('nomor dan nama toko yang tidak sah ditolak dengan hint untuk klien', async () => {
    const anon = makeAnon();
    const phone = await anon.rpc('submit_demo_lead', {
      p_shop_name: 'Uji Gerbang',
      p_phone: '021 555 1234',
      p_source: 'hero',
      p_locale: 'id',
      p_trap: '',
    });
    expect(phone.error?.hint).toBe('demo_lead_phone');

    const name = await anon.rpc('submit_demo_lead', {
      p_shop_name: 'https://spam.example',
      p_phone: '0899-0000-3102',
      p_source: 'hero',
      p_locale: 'id',
      p_trap: '',
    });
    expect(name.error?.hint).toBe('demo_lead_name');
  });

  it('kolom jebakan menjawab sukses tanpa menulis', async () => {
    const anon = makeAnon();
    const res = await anon.rpc('submit_demo_lead', {
      p_shop_name: 'Bot',
      p_phone: '0899-0000-3102',
      p_source: 'hero',
      p_locale: 'id',
      p_trap: 'https://bot.example',
    });
    expect(res.error).toBeNull();
    const { data } = await ctx.admin.from('demo_leads').select('id').eq('phone', '6289900003102');
    expect(data).toEqual([]);
  });

  it('daftar kontak tertutup bagi anon dan pengguna biasa', async () => {
    const anonRead = await makeAnon().from('demo_leads').select('id').limit(1);
    expect(anonRead.data ?? []).toEqual([]);

    const ownerRead = await ctx.ownerA.client.from('demo_leads').select('id').limit(1);
    expect(ownerRead.data ?? []).toEqual([]);

    const list = await ctx.ownerA.client.rpc('admin_list_demo_leads');
    expect(list.error?.message).toMatch(/Forbidden/);

    const notify = await ctx.ownerA.client.rpc('run_demo_lead_notify');
    expect(notify.error).not.toBeNull();

    const purge = await makeAnon().rpc('purge_demo_leads');
    expect(purge.error).not.toBeNull();
  });
});
