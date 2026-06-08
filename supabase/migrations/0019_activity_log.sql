-- ============================================================
-- FixMaster — 0019: Activity Log (audit trail, owner-only read)
-- Menjawab kebutuhan: owner ingin melihat log aktivitas tiap role.
--   - Tabel append-only `activity_logs`: siapa (actor) melakukan apa
--     (action) pada entitas apa (entity), kapan.
--   - RLS: setiap member boleh INSERT (mencatat aksinya sendiri);
--     hanya OWNER yang boleh SELECT (baca seluruh jejak org).
--   - TANPA policy UPDATE/DELETE → immutable untuk integritas audit.
--     (PostgREST/klien tak bisa mengubah/menghapus baris log.)
-- Mengikuti konvensi BaseEntity (created_at/updated_at/deleted_at)
-- agar kompatibel dengan repository adapter (local + cloud).
-- Expand-only, idempotent. Diuji di staging dulu.
-- ============================================================

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete set null,
  actor_id uuid references memberships(id) on delete set null,
  actor_name text not null default '',
  actor_role role_type,
  action text not null,
  entity_type text default '',
  entity_id text,
  entity_label text default '',
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_activity_org_created on activity_logs(org_id, created_at desc);

alter table activity_logs enable row level security;

-- INSERT: any active org member may record their own activity. Not gated on
-- is_org_active() so the audit trail keeps capturing even past grace.
drop policy if exists activity_insert on activity_logs;
create policy activity_insert on activity_logs for insert
  with check (is_org_member(org_id));

-- SELECT: owner-only. Admin & karyawan cannot read the trail.
drop policy if exists activity_select on activity_logs;
create policy activity_select on activity_logs for select
  using (is_org_owner(org_id));

-- No UPDATE / DELETE policies → append-only (immutable audit).
