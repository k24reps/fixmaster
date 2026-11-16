-- ============================================================
-- Uji coba migrasi 0104 (saringan nomor asal-asalan di gerbang demo) DI
-- DATABASE PRODUKSI, tanpa mengubah apa pun: seluruh isi berkas ini berjalan
-- dalam satu transaksi yang diakhiri ROLLBACK.
--
-- Ia memasang 0104, mencocokkan demo_lead_phone_plausible dengan tabel kasus
-- yang sama dengan demoLead.test.ts, lalu meniru pengunjung landing (peran
-- anon): nomor wajar dan nomor cantik diterima, nomor nol, deret urut, dan
-- awalan bukan operator ditolak dengan hint demo_lead_phone, dan pembantu
-- saringan tidak bisa dipanggil langsung. Baris terakhir yang diharapkan:
--   NOTICE:  UJI 0104 LULUS
--
-- Jalankan dari folder compose VPS (lihat Self-Hosting.md, "Rilis 0104"):
--   sudo docker cp 0104_demo_lead_phone_plausible.sql supabase-db:/tmp/
--   sudo docker cp uji-0104.sql supabase-db:/tmp/
--   sudo docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/uji-0104.sql
-- ============================================================

begin;

\i /tmp/0104_demo_lead_phone_plausible.sql

-- Tanpa header IP: batas per jaringan dilewati, pagar keseluruhan tetap jalan.
select set_config('request.headers', '', true);

do $$
declare
  v_case record;
begin
  for v_case in
    select * from (values
      ('6281247193305', true), ('6285722904417', true), ('6283811027764', true),
      ('6289655210038', true), ('6288190342216', true), ('628197765102', true),
      ('6281288888888', true), ('628111111111', true), ('6289900000102', true),
      ('6281200000000', false), ('6281234567890', false), ('628123456789', false),
      ('6285712345678', false), ('628987654321', false), ('6284522904417', false),
      ('6287022904417', false), ('6289022904417', false)
    ) as t(phone, expected)
  loop
    if demo_lead_phone_plausible(v_case.phone) is distinct from v_case.expected then
      raise exception 'GAGAL: demo_lead_phone_plausible(%) seharusnya %', v_case.phone, v_case.expected;
    end if;
  end loop;
end $$;

-- ---------- sebagai pengunjung (peran anon) ----------
set local role anon;

select submit_demo_lead('Uji Rilis 0104', '0812-4719-3305', 'hero', 'id', '');
select submit_demo_lead('Uji Rilis 0104 Cantik', '0812-8888-8888', 'final', 'id', '');

do $$
declare
  v_phone text;
begin
  foreach v_phone in array array['0812-0000-0000', '0812-3456-7890', '0857-1234-5678', '0845-2290-4417'] loop
    begin
      perform submit_demo_lead('Uji Rilis 0104', v_phone, 'hero', 'id', '');
      raise exception 'GAGAL: nomor % diterima', v_phone;
    exception when others then
      if sqlerrm like 'GAGAL:%' then raise; end if;
      if sqlstate <> '22023' then
        raise exception 'GAGAL: nomor % ditolak dengan kode % (%), bukan 22023', v_phone, sqlstate, sqlerrm;
      end if;
    end;
  end loop;

  begin
    perform demo_lead_phone_plausible('6281247193305');
    raise exception 'GAGAL: anon bisa memanggil demo_lead_phone_plausible';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;

do $$
begin
  if (select count(*) from demo_leads where phone in ('6281247193305', '6281288888888')) <> 2 then
    raise exception 'GAGAL: dua kiriman sah tidak tercatat';
  end if;
  if exists (select 1 from demo_leads where phone in ('6281200000000', '6281234567890', '6285712345678', '6284522904417')) then
    raise exception 'GAGAL: nomor asal-asalan tercatat';
  end if;
  raise notice 'UJI 0104 LULUS';
end $$;

rollback;
