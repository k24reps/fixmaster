-- Aturan RLS storage.objects dari migrasi 0014 (org-logos) dan 0051 (org-backups).
-- Tidak ikut pindah karena restore hanya mencakup skema public. Aman diulang.
begin;
set local search_path = public, storage;
drop policy if exists "org_logos_public_read" on storage.objects;
create policy "org_logos_public_read" on storage.objects
  for select
  using (bucket_id = 'org-logos');

drop policy if exists "org_logos_manager_insert" on storage.objects;
create policy "org_logos_manager_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'org-logos'
    and is_org_manager((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "org_logos_manager_update" on storage.objects;
create policy "org_logos_manager_update" on storage.objects
  for update
  using (
    bucket_id = 'org-logos'
    and is_org_manager((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'org-logos'
    and is_org_manager((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "org_logos_manager_delete" on storage.objects;
create policy "org_logos_manager_delete" on storage.objects
  for delete
  using (
    bucket_id = 'org-logos'
    and is_org_manager((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "org_backups_owner_read" on storage.objects;
create policy "org_backups_owner_read" on storage.objects
  for select
  using (
    bucket_id = 'org-backups'
    and is_org_owner((storage.foldername(name))[1]::uuid)
  );

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

select count(*) as jumlah_policy_storage from pg_policies where schemaname = 'storage';
commit;
