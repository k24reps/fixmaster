/**
 * TIER 2E — Absensi: gerbang clock_in/clock_out dan integritas jam kerja.
 *
 * `clock_in` adalah `security definer`, artinya ia MELEWATI RLS sepenuhnya.
 * Semua penjagaan di policy `attendance_ins` (0017/0028) tidak berlaku di
 * jalur itu, jadi guard eksplisit di dalam fungsi adalah satu-satunya
 * pertahanan — persis pola yang diuji tier2-rpc untuk RPC uang.
 *
 * Yang dijaga di sini (migrasi 0053/0054):
 *   - Buddy punching: karyawan tidak bisa mengabsenkan rekannya. Ini lubang
 *     yang membuat geofence tak berarti — cukup satu orang berdiri di dalam
 *     radius untuk mengabsenkan seluruh tim.
 *   - Lintas-tenant: org lain sama sekali tidak bisa disentuh.
 *   - Satu baris per hari (indeks unik 0054).
 *   - Jam server memakai WIB, bukan UTC. `now()` polos membuat check-in
 *     09:00 tersimpan sebagai "02:00".
 *   - `total_hours` dihitung DATABASE. Policy attendance_upd mengizinkan
 *     karyawan meng-UPDATE barisnya sendiri tanpa batas kolom, jadi tanpa
 *     trigger `attendance_enforce` angka jam kerja bisa dikarang lewat REST.
 *
 * Test GAGAL di berkas ini = celah nyata pada catatan upah.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasConfig, setupTenants, teardownTenants, type TenantCtx } from './helpers';

const d = hasConfig ? describe : describe.skip;

let ctx: TenantCtx;
let outletA = '';
/** Baris absensi karyawan A hari ini — dibuat test "absen sendiri". */
let selfRowId = '';

/** "HH:MM" → menit sejak tengah malam. */
const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Jam dinding WIB saat ini, dalam menit — pembanding independen dari SQL. */
const wibNowMinutes = (): number => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return toMinutes(parts);
};

beforeAll(async () => {
  if (!hasConfig) return;
  ctx = await setupTenants();
  // clock_in menuntut outlet yang sah milik org itu.
  const { data } = await ctx.admin
    .from('outlets')
    .select('id')
    .eq('org_id', ctx.orgA)
    .limit(1)
    .maybeSingle();
  if (data?.id) {
    outletA = data.id as string;
  } else {
    const { data: created, error } = await ctx.admin
      .from('outlets')
      .insert({ org_id: ctx.orgA, name: 'Uji Absensi', is_primary: true })
      .select('id')
      .single();
    if (error) throw new Error(`seed outlet: ${error.message}`);
    outletA = created.id as string;
  }

  // Tugaskan outlet ke staf. Ini BUKAN kerapian test: `auth_outlet_ids()`
  // (0024/0042) tidak punya fallback, jadi anggota tanpa penugasan tidak
  // melihat satu pun baris ber-outlet_id — termasuk absensinya sendiri.
  // Tanpa langkah ini, guard trigger di bawah tidak pernah dijalankan dan
  // testnya lulus karena alasan yang salah.
  for (const actor of [ctx.karyawanA, ctx.adminA]) {
    const { error } = await ctx.ownerA.client.rpc('set_member_outlets', {
      p_member_id: actor.membershipId,
      p_outlet_ids: [outletA],
    });
    if (error) throw new Error(`set_member_outlets: ${error.message}`);
  }
}, 120000);

afterAll(async () => {
  if (ctx) await teardownTenants(ctx);
}, 120000);

d('Tier 2E — clock_in: siapa boleh mengabsenkan siapa', () => {
  it('karyawan TIDAK bisa mengabsenkan rekannya (buddy punching)', async () => {
    // Lubang aslinya: RPC hanya memastikan p_employee_id ADA di org, bukan
    // bahwa ia adalah pemanggilnya.
    const { error } = await ctx.karyawanA.client.rpc('clock_in', {
      p_org_id: ctx.orgA,
      p_outlet_id: outletA,
      p_employee_id: ctx.adminA.membershipId,
      p_lat: null,
      p_lng: null,
    });
    expect(error).not.toBeNull();

    // Dan tidak ada baris yang lolos diam-diam.
    const { data } = await ctx.admin
      .from('attendance')
      .select('id')
      .eq('org_id', ctx.orgA)
      .eq('employee_id', ctx.adminA.membershipId);
    expect(data ?? []).toHaveLength(0);
  });

  it('owner org B TIDAK bisa clock_in ke org A (lintas-tenant)', async () => {
    const { error } = await ctx.ownerB.client.rpc('clock_in', {
      p_org_id: ctx.orgA,
      p_outlet_id: outletA,
      p_employee_id: ctx.karyawanA.membershipId,
      p_lat: null,
      p_lng: null,
    });
    expect(error).not.toBeNull();
  });

  it('karyawan BISA absen untuk dirinya sendiri', async () => {
    // Kontrol positif: tanpa ini, gerbang yang menolak SEMUA orang akan
    // terlihat sama suksesnya dengan gerbang yang benar.
    const { data, error } = await ctx.karyawanA.client.rpc('clock_in', {
      p_org_id: ctx.orgA,
      p_outlet_id: outletA,
      p_employee_id: ctx.karyawanA.membershipId,
      p_lat: null,
      p_lng: null,
    });
    expect(error).toBeNull();
    expect(typeof data).toBe('string');
    selfRowId = data as string;
  });

  it('mencatat jam WIB, bukan UTC', async () => {
    const { data } = await ctx.admin
      .from('attendance')
      .select('check_in, date')
      .eq('id', selfRowId)
      .single();
    expect(data?.check_in).toMatch(/^\d{2}:\d{2}$/);
    // Selisih ke jam dinding WIB harus beberapa menit, bukan tujuh jam.
    const drift = Math.abs(toMinutes(data!.check_in as string) - wibNowMinutes());
    expect(drift).toBeLessThanOrEqual(3);
  });

  it('menolak absen kedua di hari yang sama', async () => {
    const { error } = await ctx.karyawanA.client.rpc('clock_in', {
      p_org_id: ctx.orgA,
      p_outlet_id: outletA,
      p_employee_id: ctx.karyawanA.membershipId,
      p_lat: null,
      p_lng: null,
    });
    expect(error).not.toBeNull();
  });

  it('manager BOLEH mengabsenkan orang lain', async () => {
    // Pengecualian yang disengaja: owner mengabsenkan staf yang lupa.
    const { data, error } = await ctx.ownerA.client.rpc('clock_in', {
      p_org_id: ctx.orgA,
      p_outlet_id: outletA,
      p_employee_id: ctx.adminA.membershipId,
      p_lat: null,
      p_lng: null,
    });
    expect(error).toBeNull();
    expect(typeof data).toBe('string');
  });
});

d('Tier 2E — jam kerja tidak bisa dikarang', () => {
  it('total_hours yang dikirim klien DITIMPA hitungan database', async () => {
    // attendance_upd mengizinkan karyawan menulis barisnya sendiri tanpa
    // batas kolom, jadi ini jalur PATCH yang benar-benar terbuka lewat REST.
    const res = await ctx.karyawanA.client
      .from('attendance')
      .update({ total_hours: 99 })
      .eq('id', selfRowId)
      .select('id');
    expect(res.error).toBeNull();
    // Wajib: tanpa ini, RLS yang menyaring baris akan terlihat sama suksesnya
    // dengan trigger yang menimpa nilainya.
    expect(res.data ?? []).toHaveLength(1);

    const { data } = await ctx.admin
      .from('attendance')
      .select('total_hours')
      .eq('id', selfRowId)
      .single();
    // Belum ada check_out → nol jam, bukan 99.
    expect(Number(data?.total_hours)).toBe(0);
  });

  it('karyawan melihat barisnya sendiri (prasyarat uji trigger)', async () => {
    // Kalau ini nol, guard trigger di bawah tidak pernah dijalankan dan
    // test-testnya akan lulus karena RLS menyaring, bukan karena guardnya.
    const { data } = await ctx.karyawanA.client
      .from('attendance')
      .select('id')
      .eq('id', selfRowId);
    expect(data ?? []).toHaveLength(1);
  });

  it('karyawan TIDAK bisa mengubah jam masuknya sendiri', async () => {
    const { error } = await ctx.karyawanA.client
      .from('attendance')
      .update({ check_in: '05:00' })
      .eq('id', selfRowId);
    expect(error).not.toBeNull();

    const { data } = await ctx.admin
      .from('attendance')
      .select('check_in')
      .eq('id', selfRowId)
      .single();
    expect(data?.check_in).not.toBe('05:00');
  });

  it('karyawan TIDAK bisa mengubah statusnya sendiri', async () => {
    const { error } = await ctx.karyawanA.client
      .from('attendance')
      .update({ status: 'izin' })
      .eq('id', selfRowId);
    expect(error).not.toBeNull();

    const { data } = await ctx.admin
      .from('attendance')
      .select('status')
      .eq('id', selfRowId)
      .single();
    expect(data?.status).toBe('hadir');
  });

  it('clock_out mengisi jam keluar dan menghitung total di server', async () => {
    const { data, error } = await ctx.karyawanA.client.rpc('clock_out', {
      p_attendance_id: selfRowId,
      p_lat: null,
      p_lng: null,
    });
    expect(error).toBeNull();
    expect(Number(data)).toBeGreaterThanOrEqual(0);

    const { data: row } = await ctx.admin
      .from('attendance')
      .select('check_out, total_hours')
      .eq('id', selfRowId)
      .single();
    expect(row?.check_out).toMatch(/^\d{2}:\d{2}$/);
    expect(Number(row?.total_hours)).toBe(Number(data));
  });

  it('clock_out kedua ditolak (shift sudah ditutup)', async () => {
    const { error } = await ctx.karyawanA.client.rpc('clock_out', {
      p_attendance_id: selfRowId,
      p_lat: null,
      p_lng: null,
    });
    expect(error).not.toBeNull();
  });

  it('karyawan lain TIDAK bisa menutup shift orang', async () => {
    const { error } = await ctx.ownerB.client.rpc('clock_out', {
      p_attendance_id: selfRowId,
      p_lat: null,
      p_lng: null,
    });
    expect(error).not.toBeNull();
  });
});
