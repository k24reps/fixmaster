/**
 * TIER 3 — Penegakan scope per-outlet (RLS 0028 / Level 2).
 *
 * Membuktikan bahwa setelah 0028 di-apply, penguncian cabang BENAR-BENAR
 * ditegakkan server-side (bukan hanya filter tampilan klien):
 *   - Karyawan yang ditugaskan ke Outlet 1 BISA membaca data Outlet 1.
 *   - Karyawan TIDAK bisa membaca data Outlet 2 (cabang lain).
 *   - Karyawan TETAP bisa membaca data org-wide (outlet_id NULL / bersama).
 *   - Manager (owner) melihat SEMUA cabang (Model A).
 *   - Karyawan tak bisa INSERT service ber-stempel cabang lain (with check).
 *
 * Self-contained: membuat org + 2 outlet + owner + karyawan sendiri, lalu
 * membersihkannya. Menembak STAGING, tidak pernah produksi.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  hasConfig,
  makeAdmin,
  createUser,
  signIn,
  type Actor,
} from './helpers';

const d = hasConfig ? describe : describe.skip;

interface OutletCtx {
  admin: SupabaseClient;
  orgId: string;
  outlet1: string;
  outlet2: string;
  owner: Actor;
  karyawan: Actor;
  svc1Id: string;
  svc2Id: string;
  svcNullId: string;
  userIds: string[];
}

let ctx: OutletCtx;

beforeAll(async () => {
  if (!hasConfig) return;
  const admin = makeAdmin();
  const runId = Date.now().toString(36);
  const password = `Tst!${runId}Ou9`;
  const mk = (label: string) => `fmtest+${runId}-${label}@example.com`;

  const ownerEmail = mk('o-owner');
  const karyawanEmail = mk('o-kar');
  const ownerId = await createUser(admin, ownerEmail, password);
  const karyawanId = await createUser(admin, karyawanEmail, password);

  // Org via owner (bootstraps owner membership).
  const ownerClient = await signIn(ownerEmail, password);
  const { data: orgId, error: eOrg } = await ownerClient.rpc('create_organization', {
    p_name: `OrgOutlet-${runId}`,
    p_owner_name: 'Owner O',
  });
  if (eOrg || !orgId) throw new Error(`create_organization: ${eOrg?.message}`);

  // Two outlets (service_role).
  const { data: o1 } = await admin
    .from('outlets')
    .insert({ org_id: orgId, name: 'Cabang Satu', is_primary: true })
    .select('id')
    .single();
  const { data: o2 } = await admin
    .from('outlets')
    .insert({ org_id: orgId, name: 'Cabang Dua', is_primary: false })
    .select('id')
    .single();

  // Karyawan membership, assigned to outlet 1 ONLY.
  const { data: mKar } = await admin
    .from('memberships')
    .insert({ org_id: orgId, user_id: karyawanId, name: 'Karyawan O', role: 'karyawan', active: true })
    .select('id')
    .single();
  await admin.from('membership_outlets').insert({
    membership_id: mKar!.id,
    outlet_id: o1!.id,
    org_id: orgId,
  });

  // Seed services: one per outlet + one org-wide (null).
  const seedSvc = async (outletId: string | null, no: string) => {
    const { data } = await admin
      .from('services')
      .insert({ org_id: orgId, service_no: no, device: 'iPhone', status: 'diterima', outlet_id: outletId })
      .select('id')
      .single();
    return data!.id as string;
  };
  const svc1Id = await seedSvc(o1!.id, `SVC-${runId}-O1`);
  const svc2Id = await seedSvc(o2!.id, `SVC-${runId}-O2`);
  const svcNullId = await seedSvc(null, `SVC-${runId}-NULL`);

  const karyawanClient = await signIn(karyawanEmail, password);

  ctx = {
    admin,
    orgId: orgId as string,
    outlet1: o1!.id,
    outlet2: o2!.id,
    owner: { email: ownerEmail, userId: ownerId, membershipId: null, client: ownerClient },
    karyawan: { email: karyawanEmail, userId: karyawanId, membershipId: mKar!.id, client: karyawanClient },
    svc1Id,
    svc2Id,
    svcNullId,
    userIds: [ownerId, karyawanId],
  };
}, 120000);

afterAll(async () => {
  if (ctx) {
    await ctx.admin.from('organizations').delete().eq('id', ctx.orgId);
    for (const id of ctx.userIds) {
      try {
        await ctx.admin.auth.admin.deleteUser(id);
      } catch {
        /* best-effort */
      }
    }
  }
}, 120000);

d('Tier 3 — Outlet scope (RLS 0028)', () => {
  it('karyawan BISA membaca service di cabang yang ditugaskan (Outlet 1)', async () => {
    const { data, error } = await ctx.karyawan.client.from('services').select('id').eq('id', ctx.svc1Id);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  it('karyawan TIDAK bisa membaca service di cabang lain (Outlet 2)', async () => {
    const { data } = await ctx.karyawan.client.from('services').select('id').eq('id', ctx.svc2Id);
    expect(data ?? []).toHaveLength(0); // RLS menyaring cabang yang tak ditugaskan
  });

  it('karyawan TETAP bisa membaca service org-wide (outlet_id NULL / bersama)', async () => {
    const { data } = await ctx.karyawan.client.from('services').select('id').eq('id', ctx.svcNullId);
    expect(data ?? []).toHaveLength(1);
  });

  it('manager (owner) BISA membaca SEMUA cabang (Model A)', async () => {
    const { data } = await ctx.owner.client
      .from('services')
      .select('id')
      .in('id', [ctx.svc1Id, ctx.svc2Id, ctx.svcNullId]);
    expect((data ?? []).length).toBe(3);
  });

  it('karyawan TIDAK bisa INSERT service ber-stempel cabang lain (Outlet 2)', async () => {
    const { error } = await ctx.karyawan.client.from('services').insert({
      org_id: ctx.orgId,
      service_no: `SVC-INTRUDER-${Date.now().toString(36)}`,
      device: 'Selundupan',
      status: 'diterima',
      outlet_id: ctx.outlet2,
    });
    expect(error).not.toBeNull(); // ditolak with check (outlet bukan miliknya)
  });

  it('karyawan BISA INSERT service ke cabang yang ditugaskan (Outlet 1)', async () => {
    const { error } = await ctx.karyawan.client.from('services').insert({
      org_id: ctx.orgId,
      service_no: `SVC-OK-${Date.now().toString(36)}`,
      device: 'Sah',
      status: 'diterima',
      outlet_id: ctx.outlet1,
    });
    expect(error).toBeNull();
  });
});
