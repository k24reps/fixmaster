-- ============================================================
-- 0085_backup_email.sql
-- Email backup MINGGUAN ke owner tiap toko: tautan unduh yang kedaluwarsa
-- 7 hari ke salinan otomatis terbaru di bucket `org-backups` (0051/0052).
--
-- Keputusan pemilik (24 Sep 2026): tautan, bukan lampiran — berkasnya tetap
-- di server, email yang bocor setelah seminggu tak berisi apa-apa, dan tak ada
-- batas ukuran lampiran (backup toko terbesar sudah 2.5 MB dalam 3 bulan).
-- Seminggu sekali, bukan tiap malam, supaya tidak menjadi spam.
--
-- Rantainya sama dengan auto-backup: pg_cron → run_backup_email() → rahasia
-- dari Vault → POST ke Edge Function `backup-email` dengan x-cron-secret yang
-- SAMA (backup_cron_secret). Toko bisa mematikannya dari Pengaturan
-- (organizations.settings.backupEmail = false); tanpa nilai = aktif.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- Jejak pengiriman ----------
-- Tabel terpisah dari backup_runs: kartu "Backup otomatis" membaca baris
-- terbaru backup_runs sebagai status backup, dan email bukan backup.
create table if not exists backup_email_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  sent_at timestamptz not null default now(),
  -- 'sent' | 'failed' | 'skipped' | 'dry_run'
  status text not null,
  -- Penerima dicatat untuk audit; hanya owner org itu yang bisa membacanya.
  recipients text[] not null default '{}',
  object_path text,
  link_expires_at timestamptz,
  -- ID pesan dari penyedia email (Resend), untuk menelusuri pengiriman.
  provider_id text,
  error text
);

create index if not exists backup_email_runs_org_sent_idx
  on backup_email_runs (org_id, sent_at desc);

alter table backup_email_runs enable row level security;

-- Sama seperti backup_runs: owner hanya MEMBACA; hanya service role yang menulis.
drop policy if exists "backup_email_runs_owner_read" on backup_email_runs;
create policy "backup_email_runs_owner_read" on backup_email_runs
  for select
  using (is_org_owner(org_id));

comment on table backup_email_runs is
  'Jejak tiap email backup mingguan. Ditulis hanya oleh Edge Function backup-email (service role); owner hanya membaca.';

-- ---------- Pemanggil ----------
create or replace function run_backup_email()
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
    raise exception 'backup-email: project_url / backup_cron_secret belum ada di Vault';
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/backup-email',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function run_backup_email() from public, anon, authenticated;

-- ---------- Jadwal ----------
-- Senin 00:00 UTC = 07:00 WIB: sebelum toko buka, dan enam jam setelah backup
-- malam (18:00 UTC) — jadi salinan yang ditautkan selalu yang terbaru.
select cron.unschedule('fixmaster-backup-email')
  where exists (select 1 from cron.job where jobname = 'fixmaster-backup-email');

select cron.schedule(
  'fixmaster-backup-email',
  '0 0 * * 1',
  $$ select run_backup_email(); $$
);

comment on function run_backup_email is
  'Dipanggil pg_cron tiap Senin; POST ke Edge Function backup-email dengan rahasia dari Vault.';
