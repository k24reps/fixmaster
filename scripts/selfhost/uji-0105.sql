-- ============================================================
-- Uji coba migrasi 0105 (tanggal masuk tiket mundur khusus Pemilik) DI DATABASE
-- PRODUKSI, tanpa mengubah apa pun: satu transaksi yang diakhiri ROLLBACK.
-- Jalankan SESUDAH 0101 ada di server (tiket baru memotong unit di 0101).
--
-- Meniru aplikasi lewat peran `authenticated` dengan tiga identitas di toko
-- yang sama (owner sungguhan + admin dan karyawan tiruan yang dibuat di dalam
-- transaksi ini):
--   karyawan, admin : tiket biasa LOLOS; mundur 5 hari DITOLAK; maju 1 hari DITOLAK;
--                     selisih jam 10 menit LOLOS; 20 menit DITOLAK
--   owner           : mundur 5 hari dan 3 tahun LOLOS; maju 10 menit LOLOS; maju 1 hari DITOLAK
--   admin           : upsert tiket lama (UPDATE, created_at 5 hari lalu) LOLOS
--   RPC definer     : create_warranty_claim tidak terkena (current_user = pemilik fungsi)
-- Baris terakhir yang diharapkan:
--   NOTICE:  UJI 0105 LULUS
--
--   sudo docker cp 0105_service_intake_date_owner_only.sql supabase-db:/tmp/
--   sudo docker cp uji-0105.sql supabase-db:/tmp/
--   sudo docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/uji-0105.sql
-- ============================================================

begin;

\i /tmp/0105_service_intake_date_owner_only.sql

select m.user_id::text as uji_owner, m.org_id::text as uji_org
from memberships m
join organizations o on o.id = m.org_id
where m.role = 'owner' and m.active and m.deleted_at is null and o.plan_type <> 'suspended'
order by m.created_at
limit 1 \gset

-- Admin dan karyawan tiruan di toko itu (ikut di-rollback).
select gen_random_uuid()::text as uji_admin \gset
select gen_random_uuid()::text as uji_kar \gset
insert into auth.users (id, email) values
  (:'uji_admin'::uuid, 'uji0105-admin@example.com'),
  (:'uji_kar'::uuid, 'uji0105-karyawan@example.com');
insert into memberships (org_id, user_id, name, role, active) values
  (:'uji_org'::uuid, :'uji_admin'::uuid, 'Admin Uji 0105', 'admin', true),
  (:'uji_org'::uuid, :'uji_kar'::uuid, 'Karyawan Uji 0105', 'karyawan', true);

select set_config('uji.org', :'uji_org', true);
select set_config('uji.owner', :'uji_owner', true);
select set_config('uji.admin', :'uji_admin', true);
select set_config('uji.kar', :'uji_kar', true);

-- Satu pernyataan, hasilnya dicocokkan: ok/gagal dan, bila gagal, potongan pesan.
create function uji_0105_coba(p_nama text, p_uid text, p_at text, p_ok boolean, p_pesan text default null)
returns void language plpgsql as $$
declare
  v_ok boolean := true;
  v_msg text := '';
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  begin
    if p_at is null then
      insert into services (id, org_id, service_no, device, customer_name, status)
      values (gen_random_uuid(), current_setting('uji.org')::uuid,
              'U5-' || substr(gen_random_uuid()::text, 1, 8), 'Laptop Uji', 'Pelanggan Uji', 'diterima');
    else
      insert into services (id, org_id, service_no, device, customer_name, status, created_at)
      values (gen_random_uuid(), current_setting('uji.org')::uuid,
              'U5-' || substr(gen_random_uuid()::text, 1, 8), 'Laptop Uji', 'Pelanggan Uji', 'diterima',
              now() + p_at::interval);
    end if;
  exception when others then
    v_ok := false;
    v_msg := sqlerrm;
  end;
  assert v_ok = p_ok, format('%s: harapan %s, hasil %s (%s)', p_nama, p_ok, v_ok, v_msg);
  if p_pesan is not null then
    assert v_msg like '%' || p_pesan || '%', format('%s: pesan "%s" tidak memuat "%s"', p_nama, v_msg, p_pesan);
  end if;
  raise notice 'ok  %', p_nama;
end $$;
grant execute on function uji_0105_coba(text, text, text, boolean, text) to authenticated;

set local role authenticated;

-- karyawan dan admin
select uji_0105_coba('karyawan: tiket biasa', current_setting('uji.kar'), null, true);
select uji_0105_coba('karyawan: selisih jam 10 menit ke belakang', current_setting('uji.kar'), '-10 minutes', true);
select uji_0105_coba('karyawan: mundur 20 menit ditolak', current_setting('uji.kar'), '-20 minutes', false, 'hanya bisa diatur Pemilik');
select uji_0105_coba('karyawan: mundur 5 hari ditolak', current_setting('uji.kar'), '-5 days', false, 'hanya bisa diatur Pemilik');
select uji_0105_coba('karyawan: maju 1 hari ditolak', current_setting('uji.kar'), '1 day', false, 'hanya bisa diatur Pemilik');
select uji_0105_coba('admin: tiket biasa', current_setting('uji.admin'), null, true);
select uji_0105_coba('admin: mundur 5 hari ditolak', current_setting('uji.admin'), '-5 days', false, 'hanya bisa diatur Pemilik');
select uji_0105_coba('admin: maju 1 hari ditolak', current_setting('uji.admin'), '1 day', false, 'hanya bisa diatur Pemilik');

-- owner
select uji_0105_coba('owner: tiket biasa', current_setting('uji.owner'), null, true);
select uji_0105_coba('owner: mundur 5 hari', current_setting('uji.owner'), '-5 days', true);
select uji_0105_coba('owner: mundur 3 tahun', current_setting('uji.owner'), '-3 years', true);
select uji_0105_coba('owner: maju 10 menit (selisih jam)', current_setting('uji.owner'), '10 minutes', true);
select uji_0105_coba('owner: maju 1 hari ditolak', current_setting('uji.owner'), '1 day', false, 'masa depan');

-- Upsert yang berakhir sebagai UPDATE oleh admin pada tiket bertanggal lampau.
do $$
declare
  v_id uuid := gen_random_uuid();
  v_org uuid := current_setting('uji.org')::uuid;
  v_old timestamptz := now() - interval '5 days';
  v_device text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('uji.owner'), 'role', 'authenticated')::text, true);
  insert into services (id, org_id, service_no, device, customer_name, status, created_at)
  values (v_id, v_org, 'U5-UPSERT', 'Laptop Lama', 'Pelanggan Uji', 'diterima', v_old);

  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('uji.admin'), 'role', 'authenticated')::text, true);
  insert into services (id, org_id, service_no, device, customer_name, status, created_at)
  values (v_id, v_org, 'U5-UPSERT', 'Laptop Diperbarui', 'Pelanggan Uji', 'diterima', v_old)
  on conflict (id) do update set device = excluded.device;

  select device into v_device from services where id = v_id;
  assert v_device = 'Laptop Diperbarui', 'upsert admin pada tiket lama harus berakhir sebagai UPDATE';
  assert (select created_at from services where id = v_id) = v_old, 'created_at tiket lama tidak berubah';
  raise notice 'ok  admin: upsert tiket lama (UPDATE) lolos';
end $$;

reset role;

-- Jalur security definer (pola create_warranty_claim): bukan tulisan langsung aplikasi.
create function uji_0105_definer() returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into services (id, org_id, service_no, device, customer_name, status, created_at)
  values (gen_random_uuid(), current_setting('uji.org')::uuid, 'U5-DEFINER', 'Laptop', 'Pelanggan Uji', 'diterima',
          now() - interval '5 days');
end $$;
grant execute on function uji_0105_definer() to authenticated;
set local role authenticated;
select uji_0105_definer();
reset role;
do $$ begin raise notice 'ok  RPC security definer: mundur 5 hari tidak terkena penjaga'; end $$;

do $$ begin raise notice 'UJI 0105 LULUS'; end $$;

rollback;
