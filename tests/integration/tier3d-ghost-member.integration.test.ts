/**
 * TIER 3D — anggota ter-soft-delete tak boleh punya akses (migrasi 0042).
 *
 * Bug lapangan (produksi, 31 Jul 2026): satu baris memberships berada di
 * keadaan mustahil `active = true` + `deleted_at` terisi. UI menyembunyikannya
 * (list() menyaring deleted_at), tapi RLS tetap memberi akses penuh (helper
 * hanya cek active). Seorang anggota berperan `owner` jadi tak terlihat di
 * layar pemilik padahal masih menguasai seluruh data toko — dan undangan baru
 * untuknya macet selamanya di "menunggu pendaftaran".
 *
 * Tes ini membuat baris hantu itu SENGAJA (lewat service role) lalu menuntut:
 *   1. aksesnya mati (RLS helper ikut menyaring deleted_at),
 *   2. klaim undangan MEMBERSIHKAN deleted_at, bukan meninggalkan hantu baru,
 *   3. rejoin mengadopsi peran dari undangan (owner lama -> admin),
 *   4. anggota yang MASIH aktif tak berubah perannya karena klaim.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasConfig, setupTenants, teardownTenants, signIn, type TenantCtx } from './helpers';

const d = hasConfig ? describe : describe.skip;

d('Tier 3D — ghost member: soft-deleted keeps no access (0042)', () => {
  let ctx: TenantCtx;

  beforeAll(async () => {
    ctx = await setupTenants();
  }, 60_000);

  afterAll(async () => {
    if (ctx) await teardownTenants(ctx);
  });

  /** Jadikan karyawanA "hantu": terhapus, tapi active tetap true. */
  const makeGhost = async () => {
    const { error } = await ctx.admin
      .from('memberships')
      .update({ active: true, deleted_at: new Date().toISOString() })
      .eq('user_id', ctx.karyawanA.userId)
      .eq('org_id', ctx.orgA);
    expect(error).toBeNull();
  };

  const readMembership = async () => {
    const { data } = await ctx.admin
      .from('memberships')
      .select('role, active, deleted_at')
      .eq('user_id', ctx.karyawanA.userId)
      .eq('org_id', ctx.orgA)
      .single();
    return data as { role: string; active: boolean; deleted_at: string | null };
  };

  it('revokes data access once the membership is soft-deleted', async () => {
    // Baris nyata milik orgA, supaya "tak terlihat" benar-benar berarti
    // ditutup RLS — bukan sekadar tabel yang kebetulan kosong.
    const { data: cust, error: cErr } = await ctx.ownerA.client
      .from('customers')
      .insert({ org_id: ctx.orgA, name: `Ghost Probe ${ctx.runId}` })
      .select('id')
      .single();
    expect(cErr).toBeNull();
    const custId = (cust as { id: string }).id;

    // Sebelum dihapus: anggota aktif MELIHAT baris itu.
    const before = await ctx.karyawanA.client.from('customers').select('id').eq('id', custId);
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(1);

    await makeGhost();

    // Sesi lamanya masih hidup, tapi RLS harus menutup akses SEKARANG.
    // Kalau helper masih hanya cek `active`, baris ini tetap terlihat = bug.
    const after = await ctx.karyawanA.client.from('customers').select('id').eq('id', custId);
    expect(after.data ?? []).toHaveLength(0);
  });

  it('claiming an invite un-deletes the row instead of leaving a new ghost', async () => {
    await makeGhost();

    // Owner mengundang ulang email yang sama sebagai ADMIN.
    const { error: invErr } = await ctx.ownerA.client.rpc('create_invite', {
      p_org_id: ctx.orgA,
      p_email: ctx.karyawanA.email,
      p_name: 'Karyawan Kembali',
      p_role: 'admin',
      p_outlet_ids: [],
    });
    expect(invErr).toBeNull();

    // Sesi segar (mirip user login ulang), lalu klaim.
    const fresh = await signIn(ctx.karyawanA.email, ctx.password);
    const { data: claimedOrg, error: claimErr } = await fresh.rpc('claim_invite');
    expect(claimErr).toBeNull();
    expect(claimedOrg).toBe(ctx.orgA);

    const row = await readMembership();
    expect(row.deleted_at).toBeNull(); // hantu dibersihkan
    expect(row.active).toBe(true);
    expect(row.role).toBe('admin'); // peran mengikuti undangan saat rejoin

    // Undangan tak lagi tertunda -> hilang dari daftar "menunggu pendaftaran".
    const { data: pending } = await ctx.ownerA.client
      .from('pending_invites')
      .select('id')
      .eq('org_id', ctx.orgA)
      .is('claimed_at', null)
      .ilike('email', ctx.karyawanA.email);
    expect(pending ?? []).toEqual([]);

    // Aksesnya pulih.
    const after = await fresh.from('customers').select('id');
    expect(after.error).toBeNull();
  });

  it('does NOT re-role a member who is still active (owner lockout guard)', async () => {
    // ownerA masih aktif. Undangan berperan karyawan untuk dirinya sendiri
    // tak boleh menurunkan perannya — kalau bisa, toko kehilangan owner.
    const { error: invErr } = await ctx.ownerA.client.rpc('create_invite', {
      p_org_id: ctx.orgA,
      p_email: ctx.ownerA.email,
      p_name: 'Turun Peran',
      p_role: 'karyawan',
      p_outlet_ids: [],
    });
    expect(invErr).toBeNull();

    const fresh = await signIn(ctx.ownerA.email, ctx.password);
    const { error: claimErr } = await fresh.rpc('claim_invite');
    expect(claimErr).toBeNull();

    const { data } = await ctx.admin
      .from('memberships')
      .select('role')
      .eq('user_id', ctx.ownerA.userId)
      .eq('org_id', ctx.orgA)
      .single();
    expect((data as { role: string }).role).toBe('owner');
  });
});
