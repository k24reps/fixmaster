-- ============================================================
-- Uji coba migrasi 0101 (harga per unit) DI DATABASE PRODUKSI, tanpa
-- mengubah apa pun: seluruh isi berkas ini berjalan dalam satu transaksi
-- yang diakhiri ROLLBACK.
--
-- Ia memasang 0101, lalu meniru aplikasi sebagai owner toko pertama:
-- membuat tiket, menyimpannya ulang (upsert), mencoba mengubah saldo dari
-- klien, mencoba memanggil fungsi pemotong langsung, lalu menghapus tiketnya.
-- Bila satu pemeriksaan gagal, psql berhenti (ON_ERROR_STOP) dan transaksi
-- batal dengan sendirinya. Baris terakhir yang diharapkan:
--   NOTICE:  UJI 0101 LULUS
--
-- Jalankan dari folder compose VPS (lihat Self-Hosting.md, "Rilis 0101"):
--   sudo docker cp 0101_unit_pricing.sql supabase-db:/tmp/
--   sudo docker cp uji-0101.sql supabase-db:/tmp/
--   sudo docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/uji-0101.sql
-- ============================================================

begin;

\i /tmp/0101_unit_pricing.sql

-- Owner aktif pertama dan tokonya. Toko mana pun boleh: semuanya di-rollback.
select m.user_id::text as uji_uid, m.org_id::text as uji_org
from memberships m
join organizations o on o.id = m.org_id
where m.role = 'owner' and m.active and m.deleted_at is null and o.plan_type <> 'suspended'
order by m.created_at
limit 1 \gset

select set_config('uji.org', :'uji_org', true);
select set_config('request.jwt.claims',
  json_build_object('sub', :'uji_uid', 'role', 'authenticated')::text, true);

do $$
begin
  assert (select unit_balance from organizations where id = current_setting('uji.org')::uuid) = 50,
    'saldo awal toko lama harus 50';
  assert exists (select 1 from unit_ledger
                 where org_id = current_setting('uji.org')::uuid and kind = 'grant'),
    'baris kuota gratis harus ada';
end $$;

-- ---------- sebagai aplikasi (peran authenticated) ----------
set local role authenticated;

insert into services (id, org_id, service_no, device, customer_name, status)
values ('00000000-0000-4000-8000-000000000101', :'uji_org', 'UJI-0101-DRYRUN',
        'Uji migrasi', 'Uji', 'diterima');

insert into services (id, org_id, service_no, device, customer_name, status)
values ('00000000-0000-4000-8000-000000000101', :'uji_org', 'UJI-0101-DRYRUN',
        'Uji migrasi diubah', 'Uji', 'diterima')
on conflict (id) do update set device = excluded.device;

update organizations set unit_balance = 9999 where id = :'uji_org';

do $$
begin
  begin
    perform charge_service_unit(current_setting('uji.org')::uuid,
                                '00000000-0000-4000-8000-000000000101', 'X');
    raise exception 'GAGAL: charge_service_unit bisa dipanggil langsung';
  exception when others then
    if sqlerrm like 'GAGAL:%' then raise; end if;
  end;
end $$;

do $$
begin
  assert (select unit_balance from organizations where id = current_setting('uji.org')::uuid) = 49,
    'tiket baru harus memotong tepat 1 unit (upsert ulang dan UPDATE klien tidak boleh mengubahnya)';
end $$;

select delete_service_ticket(:'uji_org', '00000000-0000-4000-8000-000000000101') as hasil_hapus;

reset role;

-- ---------- pemeriksaan akhir (postgres) ----------
do $$
declare
  v_org uuid := current_setting('uji.org')::uuid;
  v_id uuid := '00000000-0000-4000-8000-000000000101';
begin
  assert (select count(*) from unit_ledger where service_id = v_id and kind = 'usage') = 1,
    'pemakaian harus tercatat tepat sekali';
  assert (select count(*) from unit_ledger where service_id = v_id and kind = 'refund') = 1,
    'hapus dalam 10 menit harus mengembalikan unit tepat sekali';
  assert (select unit_balance from organizations where id = v_org) = 50,
    'saldo harus kembali 50 sesudah hapus';
  assert not exists (select 1 from services where id = v_id),
    'tiket harus terhapus';
  assert exists (select 1 from activity_logs where entity_id = v_id::text and action = 'service.delete'),
    'penghapusan harus tercatat di Log Aktivitas';
  assert not has_function_privilege('anon', 'charge_service_unit(uuid,uuid,text)', 'execute'),
    'anon tidak boleh mengeksekusi charge_service_unit';
  assert not has_function_privilege('authenticated', 'unit_ledger_apply(uuid,text,int,uuid,text,numeric,text,text,text)', 'execute'),
    'unit_ledger_apply harus tertutup bagi klien';
  raise notice 'UJI 0101 LULUS';
end $$;

rollback;
