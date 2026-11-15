-- ============================================================
-- Uji coba migrasi 0103 (batas 100 unit per cabang per bulan) DI DATABASE
-- PRODUKSI, tanpa mengubah apa pun: satu transaksi yang diakhiri ROLLBACK.
-- Jalankan SESUDAH 0101 ada di server (0102 tidak dibutuhkan).
--
-- Supaya tidak perlu membuat 100 tiket, uji ini menyisipkan 99 baris
-- pemakaian tiruan bulan ini untuk satu cabang (plus satu baris bulan lalu
-- yang tidak boleh terhitung), lalu meniru aplikasi sebagai owner:
--   A (cabang X)      → dipotong, cabang X genap 100 unit
--   B (cabang X)      → gratis (`capped`), saldo tidak berubah
--   C (tanpa cabang)  → dipotong: batasnya per cabang
--   batalkan A        → unit kembali, cabang X turun ke 99
--   D (cabang X)      → dipotong lagi
-- Baris terakhir yang diharapkan:
--   NOTICE:  UJI 0103 LULUS
--
--   sudo docker cp 0103_unit_monthly_cap.sql supabase-db:/tmp/
--   sudo docker cp uji-0103.sql supabase-db:/tmp/
--   sudo docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/uji-0103.sql
-- ============================================================

begin;

\i /tmp/0103_unit_monthly_cap.sql

-- Owner aktif pertama dan tokonya. Toko tanpa cabang mendapat satu cabang
-- uji di dalam transaksi ini (ikut di-rollback).
select m.user_id::text as uji_uid, m.org_id::text as uji_org, o.unit_balance as uji_saldo
from memberships m
join organizations o on o.id = m.org_id
where m.role = 'owner' and m.active and m.deleted_at is null and o.plan_type <> 'suspended'
order by m.created_at
limit 1 \gset

insert into outlets (org_id, name, is_primary)
select :'uji_org', 'Cabang Uji 0103', true
where not exists (select 1 from outlets where org_id = :'uji_org' and deleted_at is null);

select id::text as uji_outlet from outlets
where org_id = :'uji_org' and deleted_at is null
order by is_primary desc, created_at
limit 1 \gset

select set_config('uji.org', :'uji_org', true);
select set_config('uji.outlet', :'uji_outlet', true);
select set_config('uji.saldo', :'uji_saldo', true);
select set_config('request.jwt.claims',
  json_build_object('sub', :'uji_uid', 'role', 'authenticated')::text, true);

-- Pemakaian tiruan: 99 unit bulan ini + 1 unit bulan lalu di cabang X. Baris
-- lama yang sudah ada bulan ini ikut dihitung, jadi tiruan dikurangi dulu.
do $$
declare
  v_org uuid := current_setting('uji.org')::uuid;
  v_outlet uuid := current_setting('uji.outlet')::uuid;
  v_need int := 99 - unit_paid_this_month(current_setting('uji.org')::uuid, current_setting('uji.outlet')::uuid);
begin
  assert v_need >= 0, 'cabang uji sudah lewat 99 unit bulan ini; pilih toko lain';
  insert into unit_ledger (org_id, kind, units, balance_after, service_id, service_no, outlet_id, created_at)
  select v_org, 'usage', -1, 0, gen_random_uuid(), 'UJI-TIRUAN', v_outlet, unit_month_start() + interval '1 minute'
  from generate_series(1, v_need);
  insert into unit_ledger (org_id, kind, units, balance_after, service_id, service_no, outlet_id, created_at)
  values (v_org, 'usage', -1, 0, gen_random_uuid(), 'UJI-BULAN-LALU', v_outlet, unit_month_start() - interval '1 day');
  assert unit_paid_this_month(v_org, v_outlet) = 99, 'tiruan harus menghasilkan 99 unit bulan ini';
end $$;

-- ---------- sebagai aplikasi (peran authenticated) ----------
set local role authenticated;

insert into services (id, org_id, outlet_id, service_no, device, customer_name, status)
values ('00000000-0000-4000-8000-00000010300a', :'uji_org', :'uji_outlet', 'UJI-0103-A', 'Uji batas', 'Uji', 'diterima');
insert into services (id, org_id, outlet_id, service_no, device, customer_name, status)
values ('00000000-0000-4000-8000-00000010300b', :'uji_org', :'uji_outlet', 'UJI-0103-B', 'Uji batas', 'Uji', 'diterima');
insert into services (id, org_id, outlet_id, service_no, device, customer_name, status)
values ('00000000-0000-4000-8000-00000010300c', :'uji_org', null, 'UJI-0103-C', 'Uji batas', 'Uji', 'diterima');

do $$
declare
  v_start int := current_setting('uji.saldo')::int;
begin
  assert (select unit_balance from organizations where id = current_setting('uji.org')::uuid) = v_start - 2,
    'A dan C dipotong, B gratis karena batas cabang';
end $$;

-- Batal lewat jalur aplikasi (status Batal hanya boleh lewat RPC ini).
select cancel_service(:'uji_org', '00000000-0000-4000-8000-00000010300a', '[]'::jsonb, :'uji_outlet');

insert into services (id, org_id, outlet_id, service_no, device, customer_name, status)
values ('00000000-0000-4000-8000-00000010300d', :'uji_org', :'uji_outlet', 'UJI-0103-D', 'Uji batas', 'Uji', 'diterima');

create temp table uji_bulan on commit drop as
select * from unit_month_usage(:'uji_org');

reset role;

-- ---------- pemeriksaan akhir (postgres) ----------
do $$
declare
  v_org uuid := current_setting('uji.org')::uuid;
  v_outlet uuid := current_setting('uji.outlet')::uuid;
  v_start int := current_setting('uji.saldo')::int;
begin
  assert (select kind from unit_ledger where service_id = '00000000-0000-4000-8000-00000010300b') = 'capped',
    'B harus tercatat sebagai capped';
  assert (select units from unit_ledger where service_id = '00000000-0000-4000-8000-00000010300b') = 0,
    'capped bernilai 0 unit';
  assert (select outlet_id from unit_ledger where service_id = '00000000-0000-4000-8000-00000010300a' and kind = 'refund') = v_outlet,
    'pengembalian ikut cabang pemakaiannya';
  assert (select count(*) from unit_ledger where service_id = '00000000-0000-4000-8000-00000010300d' and kind = 'usage') = 1,
    'sesudah A dibatalkan, D dipotong lagi';
  assert (select unit_balance from organizations where id = v_org) = v_start - 2,
    'saldo akhir: A dikembalikan, C dan D dipotong';
  assert unit_paid_this_month(v_org, v_outlet) = 100, 'cabang X genap 100 unit bulan ini';
  assert unit_paid_this_month(v_org, null) >= 1, 'tiket tanpa cabang punya hitungan sendiri';
  assert (select paid_units from uji_bulan where outlet_id = v_outlet) = 100,
    'unit_month_usage: cabang X 100 unit dibayar';
  assert (select capped_units from uji_bulan where outlet_id = v_outlet) >= 1,
    'unit_month_usage: cabang X punya tiket gratis';
  assert not has_function_privilege('anon', 'unit_month_usage(uuid)', 'execute'),
    'anon tidak boleh membaca pemakaian bulanan';
  assert not has_function_privilege('authenticated', 'unit_paid_this_month(uuid,uuid)', 'execute'),
    'pembantu hitungan tertutup bagi klien';
  raise notice 'UJI 0103 LULUS';
end $$;

rollback;
