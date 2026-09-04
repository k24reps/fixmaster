-- ============================================================
-- 0052_auto_backup_schedule.sql
-- Menjadwalkan Edge Function `auto-backup` tiap malam.
--
-- Inilah bagian yang membuat fiturnya benar-benar OTOMATIS: aplikasi web tidak
-- bisa menjalankan tugas terjadwal saat ditutup, jadi pemicunya harus datang
-- dari server. pg_cron menyalakannya, pg_net mengirim HTTP-nya.
--
-- ------------------------------------------------------------
-- DUA LANGKAH MANUAL SEBELUM MIGRASI INI BERGUNA
-- ------------------------------------------------------------
--   1) Rahasia di sisi fungsi:
--        supabase secrets set BACKUP_CRON_SECRET="<acak, >=32 karakter>"
--
--   2) Rahasia yang sama + URL proyek di Vault, supaya cron bisa mengirimnya
--      tanpa menaruh rahasia sebagai teks biasa di definisi job:
--        select vault.create_secret('<rahasia sama persis>', 'backup_cron_secret');
--        select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--
-- Tanpa keduanya job tetap berjalan tapi fungsi membalas 403, dan itu akan
-- terlihat di `cron.job_run_details` — gagal berisik, bukan diam-diam.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- Pemanggil ----------
-- Dibungkus fungsi (bukan SQL mentah di definisi job) supaya rahasianya dibaca
-- dari Vault saat eksekusi, bukan tersimpan dalam teks jadwal.
create or replace function run_auto_backup()
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'backup_cron_secret';

  if v_url is null or v_secret is null then
    raise exception 'auto-backup: project_url / backup_cron_secret belum ada di Vault';
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/auto-backup',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := '{}'::jsonb,
    -- Backup seluruh org bisa lama; beri ruang sebelum pg_net menyerah.
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function run_auto_backup() from public, anon, authenticated;

-- ---------- Jadwal ----------
-- 18:00 UTC = 01:00 WIB — konter sudah tutup, dan datanya adalah data hari
-- yang baru selesai, bukan hari yang sedang berjalan.
select cron.unschedule('fixmaster-auto-backup')
  where exists (select 1 from cron.job where jobname = 'fixmaster-auto-backup');

select cron.schedule(
  'fixmaster-auto-backup',
  '0 18 * * *',
  $$ select run_auto_backup(); $$
);

comment on function run_auto_backup is
  'Dipanggil pg_cron tiap malam; mengirim POST ke Edge Function auto-backup dengan rahasia dari Vault.';
