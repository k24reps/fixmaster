-- ============================================================
-- FixMaster — Schema reconciliation (Fase 0D)
-- The TS entity types (src/data/types.ts) drifted ahead of the initial
-- cloud schema. The Supabase adapter maps EVERY entity field to a column,
-- so any missing column makes upserts fail at runtime. This migration
-- brings the cloud schema in line with the entities. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Soft-delete tombstone — BaseEntity carries `deletedAt` on every
--    record, so every domain table needs `deleted_at`.
-- ------------------------------------------------------------
alter table outlets          add column if not exists deleted_at timestamptz;
alter table customers        add column if not exists deleted_at timestamptz;
alter table suppliers        add column if not exists deleted_at timestamptz;
alter table inventory_items  add column if not exists deleted_at timestamptz;
alter table wallets          add column if not exists deleted_at timestamptz;
alter table services         add column if not exists deleted_at timestamptz;
alter table sales            add column if not exists deleted_at timestamptz;
alter table incomes          add column if not exists deleted_at timestamptz;
alter table expenses         add column if not exists deleted_at timestamptz;
alter table attendance       add column if not exists deleted_at timestamptz;
alter table purchase_orders  add column if not exists deleted_at timestamptz;
alter table task_templates   add column if not exists deleted_at timestamptz;
alter table task_instances   add column if not exists deleted_at timestamptz;
alter table memberships      add column if not exists deleted_at timestamptz;

-- ------------------------------------------------------------
-- 2) Missing outlet_id (branch scope) — entities send outletId.
-- ------------------------------------------------------------
alter table suppliers       add column if not exists outlet_id uuid references outlets(id) on delete set null;
alter table wallets         add column if not exists outlet_id uuid references outlets(id) on delete set null;
alter table task_templates  add column if not exists outlet_id uuid references outlets(id) on delete set null;
alter table memberships     add column if not exists outlet_id uuid references outlets(id) on delete set null;

-- ------------------------------------------------------------
-- 3) memberships: Employee entity carries updated_at.
-- ------------------------------------------------------------
alter table memberships add column if not exists updated_at timestamptz not null default now();

-- ------------------------------------------------------------
-- 4) services: warranty/pickup model drifted. Replace single
--    warranty_until with split service/parts warranties + pickup +
--    warranty-claim linkage. Old column kept (nullable) for safety.
-- ------------------------------------------------------------
alter table services add column if not exists warranty_service_until date;
alter table services add column if not exists warranty_parts_until   date;
alter table services add column if not exists picked_up        boolean not null default false;
alter table services add column if not exists picked_up_at     timestamptz;
alter table services add column if not exists warranty_claim_of uuid references services(id) on delete set null;

-- ------------------------------------------------------------
-- Notes (not blocking, tracked for later):
-- - supabase-adapter.setScope ignores outletId, so cloud branch
--   filtering returns all org records. Acceptable for MVP; revisit
--   when multi-outlet billing lands (Fase 1).
-- - memberships has no pin_hash by design (Option B: employees are
--   auth users; PIN only exists in local mode).
-- ------------------------------------------------------------
