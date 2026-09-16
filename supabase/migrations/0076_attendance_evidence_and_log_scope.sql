-- ============================================================
-- FixMaster — 0076: bukti absensi & cakupan log
--
--  #13  Absensi tanggal MASA DEPAN masih bisa ditulis lewat REST (klien
--       membatasinya, server tidak). Absensi yang belum terjadi tak punya arti.
--  #14  Baris izin/sakit/alpha tetap menyimpan jam masuk/keluar lama. Tampilan
--       sudah jujur, tapi datanya membawa angka yang tak dipakai siapa pun —
--       dan sekali ekspor, angka itu ikut keluar tanpa konteks.
--  #15  Lokasi absen tidak pernah disimpan, bahkan saat geofence aktif. Yang
--       tersisa hanya "lolos/tidak" pada detik itu; saat ada sengketa, tidak
--       ada apa pun yang bisa ditunjukkan.
--  #16  Log aktivitas tumbuh selamanya. Pemangkasan kini tersedia sebagai
--       tindakan pemilik yang tercatat, bukan penghapusan diam-diam.
--  #17  Cabang pada baris log diisi cabang AKTIF penulisnya, bukan cabang
--       objek yang diubah. Pencatat server kini mengambilnya dari barisnya.
-- ============================================================

-- ---------- #15 kolom bukti lokasi ----------
alter table attendance add column if not exists check_in_lat double precision;
alter table attendance add column if not exists check_in_lng double precision;
alter table attendance add column if not exists check_out_lat double precision;
alter table attendance add column if not exists check_out_lng double precision;

-- ---------- #13/#14 penjaga baris absensi ----------
-- Sama dengan 0056, ditambah dua aturan di depan.
create or replace function attendance_enforce()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_min numeric;
begin
  -- #13: absensi tanggal masa depan tidak punya arti — dan kalau lolos, rekap
  -- gaji periode berjalan ikut menghitung hari yang belum terjadi.
  if new.date > fm_local_now()::date then
    raise exception 'Tanggal absensi tidak boleh melewati hari ini';
  end if;

  -- #14: izin/sakit/alpha bukan shift. Jam yang terlanjur terisi dibersihkan
  -- di sini, supaya tidak ada baris yang menyimpan angka yang diabaikan semua
  -- pembacanya.
  if new.status <> 'hadir' then
    new.check_in := null;
    new.check_out := null;
    new.check_in_lat := null;
    new.check_in_lng := null;
    new.check_out_lat := null;
    new.check_out_lng := null;
  end if;

  -- --- total_hours dihitung DATABASE, bukan dikirim klien ---
  if new.check_in is null or new.check_out is null then
    new.total_hours := 0;
  else
    begin
      v_min := extract(epoch from (new.check_out::time - new.check_in::time)) / 60;
      if v_min < 0 then v_min := v_min + 1440; end if;
      new.total_hours := round((v_min / 60)::numeric, 2);
    exception when others then
      new.total_hours := 0;
    end;
  end if;

  -- --- selain pemilik, hanya boleh MENUTUP shift sendiri ---
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
  'Menghitung ulang total_hours, menolak tanggal masa depan, mengosongkan jam pada baris non-hadir, dan membatasi non-pemilik hanya menutup shift sendiri.';

-- ---------- #15 clock_in menyimpan lokasi ----------
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

  -- Lokasi ikut disimpan (bila dikirim): saat ada sengketa jam kerja, inilah
  -- satu-satunya bukti selain angka jam itu sendiri.
  insert into attendance (org_id, outlet_id, employee_id, employee_name, date, status,
                          check_in, note, check_in_lat, check_in_lng)
  values (p_org_id, p_outlet_id, p_employee_id, v_emp.name, v_today, 'hadir',
          to_char(fm_local_now(), 'HH24:MI'), '', p_lat, p_lng)
  returning id into v_att_id;

  return v_att_id;
end;
$$;

-- ---------- #15 clock_out menyimpan lokasi ----------
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

  update attendance
    set check_out = v_out, check_out_lat = p_lat, check_out_lng = p_lng
    where id = p_attendance_id
  returning total_hours into v_hours;

  return v_hours;
end;
$$;

-- ---------- #17 pencatat server membawa cabang barisnya ----------
drop function if exists fm_log(uuid, text, text, text, text, jsonb);

create or replace function fm_log(
  p_org_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_label text,
  p_meta jsonb default '{}'::jsonb,
  p_outlet_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member memberships%rowtype;
begin
  select * into v_member from memberships
    where user_id = auth.uid() and org_id = p_org_id;

  insert into activity_logs (org_id, outlet_id, actor_id, actor_name, actor_role, action,
                             entity_type, entity_id, entity_label, meta)
  values (p_org_id, p_outlet_id, v_member.id, coalesce(v_member.name, 'Sistem'), v_member.role,
          p_action, p_entity_type, p_entity_id, coalesce(p_label, ''),
          coalesce(p_meta, '{}'::jsonb));
end;
$$;

revoke all on function fm_log(uuid, text, text, text, text, jsonb, uuid) from public;

-- Cabang diambil dari baris yang berubah, bukan dari layar penulisnya.
create or replace function sales_log_void()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(old.voided, false) = false and coalesce(new.voided, false) = true then
    perform fm_log(new.org_id, 'sale.void', 'sale', new.id::text, new.sale_no,
                   jsonb_build_object('total', new.total, 'reason', coalesce(new.voided_reason, '')),
                   new.outlet_id);
  end if;
  return new;
end;
$$;

create or replace function po_log_void()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if old.status is distinct from 'cancelled'::po_status and new.status = 'cancelled'::po_status then
    perform fm_log(new.org_id, 'po.void', 'purchaseOrder', new.id::text, new.po_number,
                   jsonb_build_object('poId', new.id), new.outlet_id);
  end if;
  return new;
end;
$$;

create or replace function incomes_log_delete()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform fm_log(old.org_id, 'income.delete', 'income', old.id::text,
                 coalesce(nullif(old.description, ''), old.category),
                 jsonb_build_object('amount', old.amount, 'category', old.category, 'date', old.date),
                 old.outlet_id);
  return old;
end;
$$;

create or replace function expenses_log_delete()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform fm_log(old.org_id, 'expense.delete', 'expense', old.id::text,
                 coalesce(nullif(old.description, ''), old.category),
                 jsonb_build_object('amount', old.amount, 'category', old.category, 'date', old.date),
                 old.outlet_id);
  return old;
end;
$$;

-- ---------- #16 pemangkasan log, sebagai tindakan pemilik yang tercatat ----------
-- Tabel ini append-only dan tumbuh selamanya. Pemangkasan sengaja TIDAK
-- otomatis: menghapus jejak audit diam-diam di belakang pemilik adalah hal
-- terakhir yang boleh dilakukan sistem audit. Jadi ia jadi tindakan sadar,
-- berlantai 90 hari, dan pemangkasannya sendiri ikut tercatat.
create or replace function purge_activity_logs(
  p_org_id uuid,
  p_keep_days integer default 365
) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
  v_cutoff timestamptz;
begin
  if not is_org_owner(p_org_id) then raise exception 'Hanya pemilik yang boleh memangkas log'; end if;
  if coalesce(p_keep_days, 0) < 90 then
    raise exception 'Minimal menyimpan 90 hari terakhir';
  end if;
  v_cutoff := now() - make_interval(days => p_keep_days);

  delete from activity_logs where org_id = p_org_id and created_at < v_cutoff;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    perform fm_log(p_org_id, 'activity.purge', 'activity', null,
                   v_deleted || ' event sebelum ' || to_char(v_cutoff at time zone 'Asia/Jakarta', 'DD Mon YYYY'),
                   jsonb_build_object('deleted', v_deleted, 'keepDays', p_keep_days));
  end if;
  return v_deleted;
end;
$$;

grant execute on function purge_activity_logs(uuid, integer) to authenticated;
