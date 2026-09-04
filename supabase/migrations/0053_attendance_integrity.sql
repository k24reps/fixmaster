-- ============================================================
-- 0053_attendance_integrity.sql
-- Absensi: tutup jalur pintas RPC, dan buat jam kerja tidak bisa dikarang.
--
-- Latar: `clock_in` (0004) adalah `security definer`, artinya ia MELEWATI RLS
-- sepenuhnya. Semua penjagaan yang ditulis rapi di policy `attendance_ins`
-- (0017/0028) — hanya diri sendiri atau manager, org harus aktif — tidak
-- pernah berlaku di jalur itu. Yang tersisa hanya "apakah pemanggil anggota
-- org ini", yang berarti seorang teknisi bisa mengabsenkan rekannya sambil
-- berdiri di dalam radius geofence. Geofence dibangun persis untuk mencegah
-- itu; RPC-nya membuka pintu belakang.
--
-- Yang diperbaiki di sini:
--   1. Zona waktu — now() polos itu UTC. Check-in 09:00 WIB tersimpan sebagai
--      "02:00", dan tanggalnya meleset sehari untuk shift sebelum 07:00 WIB.
--   2. `clock_in` — cek diri-sendiri/manager, cek langganan aktif, tolak
--      absen ganda, dan `set search_path` (pola 0045).
--   3. `clock_out` — RPC baru. Sebelumnya pulang ditulis langsung dari klien
--      tanpa geofence dan tanpa jam server: masuk dijaga, pulang tidak.
--   4. Trigger — `total_hours` SELALU dihitung ulang oleh database, dan
--      karyawan hanya boleh menutup shift-nya sendiri, bukan menulis ulang
--      jamnya. Tanpa ini geofence hanya menjaga detik insert; barisnya bisa
--      di-PATCH sesudahnya lewat REST.
--
-- Indeks unik satu-baris-per-hari sengaja DIPISAH ke 0054: ia bisa gagal
-- kalau data lama sudah punya duplikat, dan kegagalan itu tidak boleh ikut
-- membatalkan pengerasan di file ini.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Waktu operasional
-- ------------------------------------------------------------
-- Semua toko FixMaster ada di Indonesia. WIB dipakai sebagai acuan tunggal
-- supaya jam & tanggal yang disimpan server identik dengan yang dilihat kasir
-- di layar. Kalau nanti ada tenant di WITA/WIT, ini tempatnya diubah menjadi
-- kolom per-organisasi — satu fungsi, bukan tujuh pemanggilan now().
create or replace function fm_local_now()
returns timestamp
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'Asia/Jakarta');
$$;

comment on function fm_local_now is
  'Waktu lokal operasional (WIB). Dipakai RPC absensi supaya jam server = jam layar.';

-- ------------------------------------------------------------
-- 1) Trigger integritas
-- ------------------------------------------------------------
create or replace function attendance_enforce()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_min numeric;
begin
  -- --- total_hours dihitung DATABASE, bukan dikirim klien ---
  -- Klien tetap mengirimkannya (adapter menulis baris utuh), tapi nilainya
  -- selalu ditimpa. Ini yang membuat angkanya tidak bisa dikarang lewat REST.
  -- Rumusnya sengaja meniru calcHours() di src/lib/time.ts, termasuk asumsi
  -- shift semalaman saat jam keluar lebih kecil dari jam masuk.
  if new.check_in is null or new.check_out is null then
    new.total_hours := 0;
  else
    begin
      v_min := extract(epoch from (new.check_out::time - new.check_in::time)) / 60;
      if v_min < 0 then v_min := v_min + 1440; end if;
      new.total_hours := round((v_min / 60)::numeric, 2);
    exception when others then
      -- Baris lama bisa memuat jam tak terbaca (dulu inputnya teks bebas).
      -- Jangan menghalangi update-nya — cukup jangan mengarang jam kerja.
      new.total_hours := 0;
    end;
  end if;

  -- --- karyawan hanya boleh MENUTUP shift-nya sendiri ---
  if tg_op = 'UPDATE' and not is_org_manager(new.org_id) then
    if new.check_in    is distinct from old.check_in
       or new.date        is distinct from old.date
       or new.status      is distinct from old.status
       or new.employee_id is distinct from old.employee_id
       or new.outlet_id   is distinct from old.outlet_id then
      raise exception 'Hanya manager yang boleh mengubah absensi';
    end if;
    if old.check_out is not null and new.check_out is distinct from old.check_out then
      raise exception 'Jam keluar sudah tercatat';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists attendance_enforce_trg on attendance;
create trigger attendance_enforce_trg
  before insert or update on attendance
  for each row execute function attendance_enforce();

comment on function attendance_enforce is
  'Menghitung ulang total_hours dan membatasi karyawan hanya menutup shift sendiri. Geofence menjaga detik insert; trigger ini menjaga sisanya.';

-- ------------------------------------------------------------
-- 2) clock_in — diperketat
-- ------------------------------------------------------------
create or replace function clock_in(
  p_org_id uuid,
  p_outlet_id uuid,
  p_employee_id uuid,
  p_lat double precision default null,
  p_lng double precision default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_outlet outlets%rowtype;
  v_dist double precision;
  v_att_id uuid;
  v_emp memberships%rowtype;
  v_today date := fm_local_now()::date;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;

  -- Langganan: policy attendance_ins sudah mensyaratkan ini, tapi definer
  -- melewatinya. 0039 menambahkan cek yang sama ke RPC uang; clock_in dari
  -- 0004 tidak pernah ikut ditinjau.
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  -- Inti perbaikannya: RPC dulu hanya memastikan p_employee_id ADA di org,
  -- bukan bahwa ia adalah pemanggilnya. Satu karyawan bisa mengabsenkan
  -- seluruh tim dari dalam radius.
  if not (is_self_membership(p_employee_id, p_org_id) or is_org_manager(p_org_id)) then
    raise exception 'Hanya bisa absen untuk diri sendiri';
  end if;

  select * into v_emp from memberships where id = p_employee_id and org_id = p_org_id;
  if not found then raise exception 'Employee not found'; end if;

  select * into v_outlet from outlets where id = p_outlet_id and org_id = p_org_id;
  if not found then raise exception 'Outlet not found'; end if;

  -- Satu baris per karyawan per hari. Entri manual di klien sudah menjaga ini
  -- sejak awal; jalur otomatis tidak, sehingga dua perangkat menghasilkan dua
  -- baris dan rekap bulanan yang menggelembung.
  if exists (
    select 1 from attendance
    where org_id = p_org_id and employee_id = p_employee_id
      and date = v_today and deleted_at is null
  ) then
    raise exception 'Sudah tercatat absen hari ini';
  end if;

  -- Geofence (hanya saat outlet punya lat/lng + radius positif).
  if v_outlet.lat is not null and v_outlet.lng is not null
     and v_outlet.geofence_radius_m is not null and v_outlet.geofence_radius_m > 0 then
    if p_lat is null or p_lng is null then
      raise exception 'Lokasi wajib untuk absensi di outlet ini';
    end if;
    v_dist := 6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat - v_outlet.lat) / 2), 2) +
      cos(radians(v_outlet.lat)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - v_outlet.lng) / 2), 2)
    ));
    if v_dist > v_outlet.geofence_radius_m then
      raise exception 'Di luar radius absensi (% m dari % m)',
        round(v_dist), v_outlet.geofence_radius_m;
    end if;
  end if;

  insert into attendance (org_id, outlet_id, employee_id, employee_name, date, status, check_in, note)
  values (p_org_id, p_outlet_id, p_employee_id, v_emp.name, v_today, 'hadir',
          to_char(fm_local_now(), 'HH24:MI'), '')
  returning id into v_att_id;

  return v_att_id;
end;
$$;

comment on function clock_in is
  'Absen masuk dengan validasi geofence server-side. Hanya untuk diri sendiri (manager boleh mewakili), org harus aktif, satu baris per hari.';

-- ------------------------------------------------------------
-- 3) clock_out — baru
-- ------------------------------------------------------------
-- Masuk dijaga GPS + server; pulang dulu ditulis langsung dari klien, dari
-- mana saja, dengan jam perangkat sendiri. Asimetri itu membuat separuh
-- catatan jam kerja tidak bisa dipercaya.
create or replace function clock_out(
  p_attendance_id uuid,
  p_lat double precision default null,
  p_lng double precision default null
) returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_att attendance%rowtype;
  v_outlet outlets%rowtype;
  v_dist double precision;
  v_hours numeric;
  v_out text := to_char(fm_local_now(), 'HH24:MI');
begin
  select * into v_att from attendance where id = p_attendance_id;
  if not found then raise exception 'Absensi tidak ditemukan'; end if;

  if not is_org_member(v_att.org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(v_att.org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not (is_self_membership(v_att.employee_id, v_att.org_id) or is_org_manager(v_att.org_id)) then
    raise exception 'Hanya bisa absen untuk diri sendiri';
  end if;

  if v_att.check_in is null then raise exception 'Belum ada jam masuk'; end if;
  if v_att.check_out is not null then raise exception 'Jam keluar sudah tercatat'; end if;

  if v_att.outlet_id is not null then
    select * into v_outlet from outlets where id = v_att.outlet_id;
    if found and v_outlet.lat is not null and v_outlet.lng is not null
       and v_outlet.geofence_radius_m is not null and v_outlet.geofence_radius_m > 0 then
      if p_lat is null or p_lng is null then
        raise exception 'Lokasi wajib untuk absensi di outlet ini';
      end if;
      v_dist := 6371000 * 2 * asin(sqrt(
        power(sin(radians(p_lat - v_outlet.lat) / 2), 2) +
        cos(radians(v_outlet.lat)) * cos(radians(p_lat)) *
        power(sin(radians(p_lng - v_outlet.lng) / 2), 2)
      ));
      if v_dist > v_outlet.geofence_radius_m then
        raise exception 'Di luar radius absensi (% m dari % m)',
          round(v_dist), v_outlet.geofence_radius_m;
      end if;
    end if;
  end if;

  -- total_hours tidak diisi di sini: trigger attendance_enforce yang
  -- menghitungnya, supaya hanya ada SATU rumus jam kerja di seluruh sistem.
  update attendance set check_out = v_out where id = p_attendance_id
  returning total_hours into v_hours;

  return v_hours;
end;
$$;

comment on function clock_out is
  'Absen pulang dengan geofence + jam server, cermin dari clock_in. total_hours dihitung trigger.';

revoke all on function fm_local_now() from public;
grant execute on function fm_local_now() to authenticated;
grant execute on function clock_in(uuid, uuid, uuid, double precision, double precision) to authenticated;
grant execute on function clock_out(uuid, double precision, double precision) to authenticated;
