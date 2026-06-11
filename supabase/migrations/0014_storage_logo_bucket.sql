-- ============================================================
-- FixMaster — Object Storage: org logos
-- Move org logos out of the `organizations` row (previously a base64
-- data URL) into a dedicated Storage bucket. Keeps row payloads small
-- and serves logos via CDN. Scope: LOGO ONLY — device/service photos are
-- intentionally deferred (avoid storage bloat).
--
-- Path convention: `{orgId}/logo-<timestamp>.png`
--   → org_id is the first path segment, used by RLS below.
-- ============================================================

-- Public-read bucket (logos appear on print receipts + the public tracking
-- page, which have no auth session, so reads must be public).
insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

-- ---------- RLS on storage.objects for this bucket ----------
-- Reads: public (anyone) — handled by the bucket being public, but we add an
-- explicit select policy so signed/anon clients behave consistently.
-- NOTE: drop-if-exists membuat migrasi idempoten — aman di-apply ke environment
-- yang sudah punya policy ini (mis. di-set manual via Dashboard).
drop policy if exists "org_logos_public_read" on storage.objects;
create policy "org_logos_public_read" on storage.objects
  for select
  using (bucket_id = 'org-logos');

-- Writes/updates/deletes: only managers (owner/admin) of the org that owns
-- the path. The org id is the first folder segment of the object name.
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
