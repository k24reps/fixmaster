-- ============================================================
-- Uji coba migrasi 0102 (kontak gerbang demo) DI DATABASE PRODUKSI, tanpa
-- mengubah apa pun: seluruh isi berkas ini berjalan dalam satu transaksi
-- yang diakhiri ROLLBACK, termasuk jadwal pg_cron yang dipasangnya.
--
-- Ia memasang 0102, lalu meniru pengunjung landing (peran anon) dari satu
-- alamat IP: mengisi gerbang, mengisi lagi dengan format nomor lain, mengirim
-- nomor salah, mengisi kolom jebakan, mencoba membaca tabel, dan mengirim
-- terus sampai batas per jaringan menolak. Baris terakhir yang diharapkan:
--   NOTICE:  UJI 0102 LULUS
--
-- Jalankan dari folder compose VPS (lihat Self-Hosting.md, "Rilis 0102"):
--   sudo docker cp 0102_demo_leads.sql supabase-db:/tmp/
--   sudo docker cp uji-0102.sql supabase-db:/tmp/
--   sudo docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/uji-0102.sql
-- ============================================================

begin;

\i /tmp/0102_demo_leads.sql

-- Alamat dokumentasi (RFC 5737), bukan pengunjung sungguhan.
select set_config('request.headers', '{"cf-connecting-ip":"203.0.113.77"}', true);

-- ---------- sebagai pengunjung (peran anon) ----------
set local role anon;

select submit_demo_lead('  Uji   Rilis  0102 ', '0899-0000-0102', 'hero', 'id', '');
select submit_demo_lead('Uji Rilis 0102 B', '+62 899 0000 0102', 'final', 'en', '');

do $$
begin
  begin
    perform submit_demo_lead('Uji Rilis', '12345', 'hero', 'id', '');
    raise exception 'GAGAL: nomor salah diterima';
  exception when others then
    if sqlerrm like 'GAGAL:%' then raise; end if;
  end;
  begin
    perform submit_demo_lead('https://spam.example', '089900000103', 'hero', 'id', '');
    raise exception 'GAGAL: nama berisi tautan diterima';
  exception when others then
    if sqlerrm like 'GAGAL:%' then raise; end if;
  end;
end $$;

-- Jebakan: jawabannya sukses, tetapi tidak ada yang ditulis.
select submit_demo_lead('Bot', '089900000104', 'hero', 'id', 'isi-bot');

do $$
begin
  begin
    perform 1 from demo_leads limit 1;
    raise exception 'GAGAL: anon bisa membaca demo_leads';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- Dua kiriman sah di atas sudah tercatat; batasnya 8 per 10 menit, jadi enam
-- nomor berikutnya lolos dan yang ketujuh ditolak.
do $$
begin
  for i in 1..6 loop
    perform submit_demo_lead('Uji Batas ' || i, '08990000020' || i, 'hero', 'id', '');
  end loop;
  begin
    perform submit_demo_lead('Uji Batas 7', '089900000207', 'hero', 'id', '');
    raise exception 'GAGAL: batas per jaringan tidak bekerja';
  exception when others then
    if sqlerrm like 'GAGAL:%' then raise; end if;
    if sqlerrm <> 'rate_limited' then raise; end if;
  end;
end $$;

reset role;

-- ---------- pemeriksaan akhir (postgres) ----------
do $$
begin
  assert (select count(*) from demo_leads where phone = '6289900000102') = 1,
    'satu nomor harus satu baris';
  assert (select visits from demo_leads where phone = '6289900000102') = 2,
    'kiriman ulang nomor yang sama harus menambah kunjungan';
  assert (select shop_name from demo_leads where phone = '6289900000102') = 'Uji Rilis 0102 B',
    'kiriman ulang harus memperbarui nama toko';
  assert (select shop_name from demo_leads where phone = '6289900000102') !~ '\s{2}',
    'spasi ganda di nama toko harus dirapikan';
  assert not exists (select 1 from demo_leads where phone in ('6289900000104', '6289900000207')),
    'jebakan dan kiriman yang ditolak tidak boleh tertulis';
  assert (select count(*) from demo_leads where phone like '62899000002%') = 6,
    'enam kiriman di bawah batas harus tertulis';
  assert has_function_privilege('anon', 'submit_demo_lead(text,text,text,text,text)', 'execute'),
    'anon harus bisa mengirim gerbang';
  assert not has_function_privilege('anon', 'admin_list_demo_leads()', 'execute'),
    'anon tidak boleh membaca daftar kontak';
  assert not has_function_privilege('authenticated', 'run_demo_lead_notify()', 'execute'),
    'pemicu notifikasi harus tertutup bagi klien';
  assert not has_function_privilege('anon', 'purge_demo_leads()', 'execute'),
    'pembersih harus tertutup bagi klien';
  assert (select count(*) from cron.job
          where jobname in ('fixmaster-demo-lead-notify', 'fixmaster-purge-demo-leads')) = 2,
    'dua jadwal pg_cron harus terpasang';
  raise notice 'UJI 0102 LULUS';
end $$;

rollback;
