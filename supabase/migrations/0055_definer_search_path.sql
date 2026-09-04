-- ============================================================
-- 0055_definer_search_path.sql
-- Menutup `set search_path` yang hilang di seluruh fungsi security definer.
--
-- Migrasi 0045 menuliskan aturannya sebagai standar proyek:
--
--   "`set search_path = public, pg_temp` (pola 0020) — permukaan definer
--    lintas-tenant tak boleh bisa dibajak lewat search_path"
--
-- Aturan itu ternyata hanya diterapkan pada 0045 ke atas. Saat audit absensi
-- (4 Sep 2026) dihitung ulang: dari 70 fungsi `security definer` di repo,
-- 64 tidak punya `set search_path` — termasuk process_sale, settle_service,
-- apply_payment, claim_invite, dan track_service.
--
-- Kenapa ini penting untuk fungsi DEFINER khususnya: fungsinya berjalan
-- dengan hak pemiliknya. Tanpa search_path tetap, pemanggil menentukan skema
-- mana yang dicari lebih dulu, sehingga sebuah tabel atau operator palsu di
-- skema yang bisa ditulis pemanggil dapat membajak apa yang dijalankan fungsi
-- itu — dengan hak superuser-nya, bukan hak pemanggil.
--
-- ------------------------------------------------------------
-- KENAPA ALTER, BUKAN MENULIS ULANG 64 FUNGSI
-- ------------------------------------------------------------
-- `alter function ... set search_path` hanya mengubah setelan, tidak
-- menyentuh badan fungsi sama sekali. Menyalin ulang 64 definisi justru
-- memasukkan risiko salin-tempel ke kode yang sudah jalan bertahun-tahun.
--
-- ------------------------------------------------------------
-- YANG SENGAJA DILEWATI
-- ------------------------------------------------------------
-- `proconfig is null` — fungsi yang SUDAH punya setelan sendiri tidak
-- disentuh. Ini bukan sekadar kerapian: `run_auto_backup` (0052) memakai
-- `search_path = public, vault, pg_temp`, dan menimpanya dengan pola umum
-- akan membuang `vault` dan mematikan backup otomatis.
--
-- `extensions` ikut dimasukkan karena Supabase menaruh pgcrypto, uuid-ossp,
-- dan kawan-kawan di sana; tanpa itu fungsi yang memanggil gen_random_uuid()
-- atau digest() tanpa kualifikasi akan berhenti bekerja.
--
-- ------------------------------------------------------------
-- BELUM DIUJI TERHADAP DATABASE
-- ------------------------------------------------------------
-- Migrasi ini disusun dari pembacaan kode, bukan dari eksekusi. Terapkan ke
-- STAGING lebih dulu, lalu jalankan suite integrasi (`tests/integration/`)
-- sebelum menyentuh produksi. Verifikasi setelahnya:
--
--   select p.proname, p.proconfig
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef and p.proconfig is null;
--
-- Hasilnya harus kosong.
-- ============================================================

do $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef            -- hanya security definer
      and p.proconfig is null    -- hanya yang belum punya setelan sendiri
    order by 1
  loop
    execute format(
      'alter function %s set search_path = public, extensions, pg_temp',
      r.sig
    );
    v_count := v_count + 1;
  end loop;
  raise notice 'search_path dipasang pada % fungsi security definer', v_count;
end;
$$;
