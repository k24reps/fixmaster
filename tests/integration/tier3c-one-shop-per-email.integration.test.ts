/**
 * TIER 3C — Satu email = satu toko (migrasi 0033).
 *
 * Membuktikan RPC create_invite menegakkan aturan "satu email hanya boleh
 * tergabung/diundang di satu toko":
 *   - tolak email yang sudah jadi anggota AKTIF di toko lain,
 *   - tolak email yang punya undangan TERTUNDA di toko lain,
 *   - izinkan undangan baru / re-invite di toko sendiri,
 *   - hanya manager yang boleh mengundang.
 *
 * Memakai harness setupTenants (orgA: owner+admin+karyawan, orgB: owner) di
 * STAGING, lalu membersihkannya.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasConfig,
  setupTenants,
  teardownTenants,
  type TenantCtx,
} from './helpers';

const d = hasConfig ? describe : describe.skip;

d('Tier 3C — one shop per email (create_invite, 0033)', () => {
  let ctx: TenantCtx;

  beforeAll(async () => {
    ctx = await setupTenants();
  }, 60_000);

  afterAll(async () => {
    if (ctx) await teardownTenants(ctx);
  });

  it('rejects inviting an email that is an ACTIVE member of another org', async () => {
    // karyawanA is an active member of org A. Owner B must not invite them.
    const { error } = await ctx.ownerB.client.rpc('create_invite', {
      p_org_id: ctx.orgB,
      p_email: ctx.karyawanA.email,
      p_name: 'Pindah Toko',
      p_role: 'karyawan',
      p_outlet_ids: [],
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/anggota toko lain/i);
  });

  it('allows a fresh email to be invited, then blocks the SAME email in another org', async () => {
    const fresh = `fmtest+${ctx.runId}-cross@example.com`;

    // Org A invites a brand-new email → ok.
    const { data: okData, error: okErr } = await ctx.ownerA.client.rpc('create_invite', {
      p_org_id: ctx.orgA,
      p_email: fresh,
      p_name: 'Calon A',
      p_role: 'karyawan',
      p_outlet_ids: [],
    });
    expect(okErr).toBeNull();
    expect(okData?.org_id).toBe(ctx.orgA);

    // Org B tries the same email (now PENDING in A) → blocked.
    const { error: blockErr } = await ctx.ownerB.client.rpc('create_invite', {
      p_org_id: ctx.orgB,
      p_email: fresh,
      p_name: 'Calon B',
      p_role: 'karyawan',
      p_outlet_ids: [],
    });
    expect(blockErr).not.toBeNull();
    expect(blockErr?.message).toMatch(/diundang ke toko lain/i);
  });

  it('allows re-inviting the same email within the SAME org (upsert)', async () => {
    const reuse = `fmtest+${ctx.runId}-reinvite@example.com`;
    const first = await ctx.ownerA.client.rpc('create_invite', {
      p_org_id: ctx.orgA,
      p_email: reuse,
      p_name: 'Awal',
      p_role: 'karyawan',
      p_outlet_ids: [],
    });
    expect(first.error).toBeNull();

    // Re-invite with a changed role in the same org → still ok (no duplicate).
    const second = await ctx.ownerA.client.rpc('create_invite', {
      p_org_id: ctx.orgA,
      p_email: reuse,
      p_name: 'Revisi',
      p_role: 'admin',
      p_outlet_ids: [],
    });
    expect(second.error).toBeNull();
    expect(second.data?.role).toBe('admin');
    expect(second.data?.name).toBe('Revisi');
  });

  it('forbids a non-manager (karyawan) from creating an invite', async () => {
    const { error } = await ctx.karyawanA.client.rpc('create_invite', {
      p_org_id: ctx.orgA,
      p_email: `fmtest+${ctx.runId}-bykaryawan@example.com`,
      p_name: 'Tak Boleh',
      p_role: 'karyawan',
      p_outlet_ids: [],
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/forbidden/i);
  });
});
