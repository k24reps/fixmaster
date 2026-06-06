-- ============================================================
-- FixMaster — Fase 1B: enforce subscription on writes
-- Problem: when a subscription expires (past grace), the app could
-- still write (e.g. input income), because write policies only checked
-- is_org_member / is_org_manager — never is_org_active.
-- Fix: recreate the WRITE policies to also require is_org_active(org_id).
--   - SELECT policies are untouched → reads still work (data stays safe).
--   - invoices/memberships are NOT gated → paying + team mgmt still work.
--   - is_org_active() (migration 0009) is false only past the grace window,
--     so fresh trial orgs are unaffected.
-- Idempotent: drops each policy if present, then recreates it.
-- ============================================================

-- ---------- Manager-write config tables ----------
drop policy if exists outlets_write on outlets;
create policy outlets_write on outlets for all
  using (is_org_manager(org_id) and is_org_active(org_id))
  with check (is_org_manager(org_id) and is_org_active(org_id));

drop policy if exists suppliers_write on suppliers;
create policy suppliers_write on suppliers for all
  using (is_org_manager(org_id) and is_org_active(org_id))
  with check (is_org_manager(org_id) and is_org_active(org_id));

drop policy if exists wallets_write on wallets;
create policy wallets_write on wallets for all
  using (is_org_manager(org_id) and is_org_active(org_id))
  with check (is_org_manager(org_id) and is_org_active(org_id));

drop policy if exists po_write on purchase_orders;
create policy po_write on purchase_orders for all
  using (is_org_manager(org_id) and is_org_active(org_id))
  with check (is_org_manager(org_id) and is_org_active(org_id));

drop policy if exists templates_write on task_templates;
create policy templates_write on task_templates for all
  using (is_org_manager(org_id) and is_org_active(org_id))
  with check (is_org_manager(org_id) and is_org_active(org_id));

-- ---------- Member-write operational tables ----------
drop policy if exists customers_write on customers;
create policy customers_write on customers for all
  using (is_org_member(org_id) and is_org_active(org_id))
  with check (is_org_member(org_id) and is_org_active(org_id));

drop policy if exists inventory_write on inventory_items;
create policy inventory_write on inventory_items for all
  using (is_org_member(org_id) and is_org_active(org_id))
  with check (is_org_member(org_id) and is_org_active(org_id));

drop policy if exists services_write on services;
create policy services_write on services for all
  using (is_org_member(org_id) and is_org_active(org_id))
  with check (is_org_member(org_id) and is_org_active(org_id));

drop policy if exists sales_write on sales;
create policy sales_write on sales for all
  using (is_org_member(org_id) and is_org_active(org_id))
  with check (is_org_member(org_id) and is_org_active(org_id));

drop policy if exists task_inst_write on task_instances;
create policy task_inst_write on task_instances for all
  using (is_org_member(org_id) and is_org_active(org_id))
  with check (is_org_member(org_id) and is_org_active(org_id));

drop policy if exists attendance_write on attendance;
create policy attendance_write on attendance for all
  using (is_org_member(org_id) and is_org_active(org_id))
  with check (is_org_member(org_id) and is_org_active(org_id));

-- ---------- Manager-write financial tables ----------
drop policy if exists incomes_write on incomes;
create policy incomes_write on incomes for all
  using (is_org_manager(org_id) and is_org_active(org_id))
  with check (is_org_manager(org_id) and is_org_active(org_id));

drop policy if exists expenses_write on expenses;
create policy expenses_write on expenses for all
  using (is_org_manager(org_id) and is_org_active(org_id))
  with check (is_org_manager(org_id) and is_org_active(org_id));
