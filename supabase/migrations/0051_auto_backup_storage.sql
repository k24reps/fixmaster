-- ============================================================
-- 0051_auto_backup_storage.sql
-- Auto-backup: bucket privat + jejak eksekusi.
--
-- Backup manual sudah ada sejak awal (unduh JSON dari Pengaturan), tapi ia
-- hanya mendarat di perangkat yang menekan tombolnya, dan pengingatnya
-- bawaannya `off`. Migrasi ini menyiapkan tempat bagi salinan otomatis yang
-- dijalankan server, sehingga toko tidak perlu ingat apa pun.
--
-- Path: `{orgId}/auto-<ISO timestamp>.json`
--   → org_id adalah segmen folder pertama, dipakai RLS di bawah, sama persis
--     dengan konvensi bucket `org-logos` (0014).
--
-- Isi file mengikuti format BackupFile v1 yang SUDAH ada (lihat
-- `src/lib/business/backup.ts`), termasuk kunci camelCase — supaya berkas
-- otomatis dan berkas manual dipulihkan lewat satu jalur yang sama.
-- ============================================================

-- ---------- 1) Bucket ----------
-- PRIVAT, tidak seperti org-logos. Isinya seluruh data toko; tidak boleh ada
-- URL publik yang bisa ditebak. Klien mengaksesnya lewat signed URL.
insert into storage.buckets (id, name, public)
values ('org-backups', 'org-backups', false)
on conflict (id) do nothing;

-- ---------- 2) RLS pada storage.objects ----------
-- Hanya OWNER (bukan admin) yang boleh menyentuh backup: berkas ini memuat
-- seluruh isi toko termasuk angka keuangan, jadi gerbangnya lebih rapat
-- daripada logo. Edge Function memakai service role dan melewati RLS.
drop policy if exists "org_backups_owner_read" on storage.objects;
create policy "org_backups_owner_read" on storage.objects
  for select
  using (
    bucket_id = 'org-backups'
    and is_org_owner((storage.foldername(name))[1]::uuid)
  );

-- Insert oleh owner tetap diizinkan supaya tombol "Backup sekarang" bisa
-- mengunggah salinan ke tempat yang sama dengan yang otomatis.
drop policy if exists "org_backups_owner_insert" on storage.objects;
create policy "org_backups_owner_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'org-backups'
    and is_org_owner((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "org_backups_owner_delete" on storage.objects;
create policy "org_backups_owner_delete" on storage.objects
  for delete
  using (
    bucket_id = 'org-backups'
    and is_org_owner((storage.foldername(name))[1]::uuid)
  );

-- ---------- 3) Jejak eksekusi ----------
-- Backup yang gagal diam-diam lebih buruk daripada tidak ada backup: pemilik
-- merasa terlindungi padahal tidak. Tiap percobaan dicatat, sukses maupun
-- gagal, dan kartu Pengaturan membacanya untuk menampilkan kondisi sebenarnya.
create table if not exists backup_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- 'ok' | 'failed'
  status text not null,
  -- Path objek di bucket; null saat gagal sebelum sempat mengunggah.
  object_path text,
  size_bytes bigint,
  record_count integer,
  error text,
  -- 'cron' (terjadwal) | 'manual' (tombol di Pengaturan)
  trigger text not null default 'cron'
);

create index if not exists backup_runs_org_started_idx
  on backup_runs (org_id, started_at desc);

alter table backup_runs enable row level security;

-- Owner hanya boleh MEMBACA jejaknya sendiri. Tidak ada policy insert/update
-- untuk pengguna: hanya service role (Edge Function) yang menulis, sehingga
-- riwayat ini tidak bisa dipalsukan dari klien.
drop policy if exists "backup_runs_owner_read" on backup_runs;
create policy "backup_runs_owner_read" on backup_runs
  for select
  using (is_org_owner(org_id));

comment on table backup_runs is
  'Jejak tiap percobaan auto-backup. Ditulis hanya oleh Edge Function auto-backup (service role); owner hanya membaca.';
