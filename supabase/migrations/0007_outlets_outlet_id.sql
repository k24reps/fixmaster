-- ============================================================
-- FixMaster — outlets.outlet_id reconcile (Fase 0D.2)
-- The Outlet entity extends BaseEntity, which carries `outletId`. The
-- Supabase adapter maps EVERY entity field to a column, so without an
-- `outlet_id` column on `outlets` the cloud upsert fails — which broke
-- "tambah outlet" in Settings. The value is always NULL for an outlet
-- (an outlet does not belong to a branch); the column exists purely to
-- satisfy the uniform BaseEntity ↔ adapter contract. Idempotent.
-- ============================================================

alter table outlets add column if not exists outlet_id uuid references outlets(id) on delete set null;
