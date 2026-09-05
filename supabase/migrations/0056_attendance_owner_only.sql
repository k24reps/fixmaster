-- ============================================================
-- 0056_attendance_owner_only.sql
-- Absensi jadi urusan PEMILIK, bukan siapa pun yang berperan manager.
--
-- Sampai migrasi ini, `is_org_manager()` — yang mencakup admin — membuka
-- seluruh absensi toko: membaca riwayat semua orang, mengubahnya,
-- menghapusnya, dan mengabsenkan orang lain. Admin memang manager untuk
-- servis, stok, dan supplier. Kehadiran rekan kerja bukan urusan
-- operasional; itu urusan ketenagakerjaan, dan yang menggaji hanya satu
-- orang.
--
-- UI-nya sudah dirapikan lebih dulu, tapi itu hanya gerbang tampilan: admin
-- yang memanggil REST langsung tetap melihat dan mengubah segalanya. File ini
-- yang menjadikannya batas sungguhan.
--
-- ------------------------------------------------------------
-- YANG TETAP TERBUKA, DAN KENAPA
-- ------------------------------------------------------------
-- Baris HARI INI tetap bisa dibaca semua anggota. Papan "Kehadiran Hari Ini"
-- adalah papan shift: siapa yang sedang jaga adalah informasi kerja biasa,
-- dan tim perlu melihatnya tanpa harus bertanya. Yang sensitif adalah POLA
-- sepanjang periode — siapa sering telat, siapa sering absen — dan itu kini
-- benar-benar tertutup untuk semua kecuali pemilik.
--
-- Tanggalnya memakai fm_local_now() (WIB, lihat 0053), bukan current_date
-- yang UTC. Kalau tidak, papan shift akan berganti hari jam 07:00 pagi.
--
-- ------------------------------------------------------------
-- YANG HILANG DARI ADMIN — konsekuensi nyata, bukan efek samping
-- ------------------------------------------------------------
--   * Tidak lagi bisa membetulkan check-out staf yang lupa. Hanya pemilik.
--   * Tidak lagi bisa mengabsenkan orang lain.
--   * Tidak lagi bisa mengubah jam/status pada barisnya SENDIRI — sama
--     seperti karyawan. Ini disengaja: admin yang bisa menulis ulang jam
--     kerjanya sendiri adalah lubang yang sama persis dengan yang ditutup
--     0053 untuk karyawan.
--   * Masih bisa check-in dan check-out untuk dirinya sendiri seperti biasa.
-- ============================================================

-- ------------------------------------------------------------
-- 1) SELECT — pemilik melihat semua; sisanya barisnya sendiri + hari ini
-- ------------------------------------------------------------
drop policy if exists attendance_select on attendance;
create policy attendance_select on attendance for select
  using (
    is_org_member(org_id)
    and (
      is_org_owner(org_id)
      or is_self_membership(employee_id, org_id)
      or date = (fm_local_now())::date
    )
  );

-- ------------------------------------------------------------
-- 2) INSERT — diri sendiri, atau pemilik mewakili
-- ------------------------------------------------------------
-- Syarat outlet dari 0028 dipertahankan untuk yang bukan pemilik, supaya
-- karyawan tidak mencatat absensi ke cabang yang bukan tempatnya.
drop policy if exists attendance_ins on attendance;
create policy attendance_ins on attendance for insert
  with check (
    is_org_active(org_id)
    and (is_org_owner(org_id) or is_self_membership(employee_id, org_id))
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );

-- ------------------------------------------------------------
-- 3) UPDATE — diri sendiri (untuk menutup shift), atau pemilik
-- ------------------------------------------------------------
-- Baris "diri sendiri" tetap ada karena jalur check-out tanpa geofence
-- menulis langsung. Yang boleh diubahnya dibatasi trigger di bawah.
drop policy if exists attendance_upd on attendance;
create policy attendance_upd on attendance for update
  using (
    is_org_active(org_id)
    and (is_org_owner(org_id) or is_self_membership(employee_id, org_id))
  )
  with check (
    is_org_active(org_id)
    and (is_org_owner(org_id) or is_self_membership(employee_id, org_id))
  );

-- ------------------------------------------------------------
-- 4) DELETE — pemilik saja
-- ------------------------------------------------------------
drop policy if exists attendance_del on attendance;
create policy attendance_del on attendance for delete
  using (is_org_owner(org_id) and is_org_active(org_id));

-- ------------------------------------------------------------
-- 5) Trigger — pengecualiannya kini pemilik, bukan manager
-- ------------------------------------------------------------
-- Sama persis dengan 0053 kecuali satu baris: is_org_manager → is_org_owner.
-- Ditulis ulang utuh, bukan ditambal, supaya definisi yang berlaku selalu
-- terbaca lengkap di satu tempat.
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

  -- --- selain pemilik, hanya boleh MENUTUP shift sendiri ---
  -- 0053 menuliskan is_org_manager di sini, sehingga admin lolos dan bisa
  -- menulis ulang jam kerjanya sendiri — lubang yang sama yang ditutup untuk
  -- karyawan, hanya berpindah satu peran ke atas.
  if tg_op = 'UPDATE' and not is_org_owner(new.org_id) then
    if new.check_in    is distinct from old.check_in
       or new.date        is distinct from old.date
       or new.status      is distinct from old.status
       or new.employee_id is distinct from old.employee_id
       or new.outlet_id   is distinct from old.outlet_id then
      raise exception 'Hanya pemilik yang boleh mengubah absensi';
    end if;
    if old.check_out is not null and new.check_out is distinct from old.check_out then
      raise exception 'Jam keluar sudah tercatat';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function attendance_enforce is
  'Menghitung ulang total_hours dan membatasi non-pemilik hanya menutup shift sendiri.';

-- ------------------------------------------------------------
-- 6) clock_in / clock_out — pengecualiannya kini pemilik
-- ------------------------------------------------------------
-- Hanya baris penjaga yang berubah dari 0053; sisanya identik.
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
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  if not (is_self_membership(p_employee_id, p_org_id) or is_org_owner(p_org_id)) then
    raise exception 'Hanya bisa absen untuk diri sendiri';
  end if;

  select * into v_emp from memberships where id = p_employee_id and org_id = p_org_id;
  if not found then raise exception 'Employee not found'; end if;

  select * into v_outlet from outlets where id = p_outlet_id and org_id = p_org_id;
  if not found then raise exception 'Outlet not found'; end if;

  if exists (
    select 1 from attendance
    where org_id = p_org_id and employee_id = p_employee_id
      and date = v_today and deleted_at is null
  ) then
    raise exception 'Sudah tercatat absen hari ini';
  end if;

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
  if not (is_self_membership(v_att.employee_id, v_att.org_id) or is_org_owner(v_att.org_id)) then
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

  update attendance set check_out = v_out where id = p_attendance_id
  returning total_hours into v_hours;

  return v_hours;
end;
$$;

grant execute on function clock_in(uuid, uuid, uuid, double precision, double precision) to authenticated;
grant execute on function clock_out(uuid, double precision, double precision) to authenticated;
