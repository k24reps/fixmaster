-- ============================================================
-- FixMaster — Row Level Security policies
-- Every table is org-scoped. Members can read their org's data;
-- managers (owner/admin) get full write; staff get scoped writes.
-- This makes roles a REAL security boundary (FixNova fix #3).
-- ============================================================

-- Enable RLS everywhere.
alter table organizations    enable row level security;
alter table memberships      enable row level security;
alter table outlets          enable row level security;
alter table customers        enable row level security;
alter table suppliers        enable row level security;
alter table inventory_items  enable row level security;
alter table wallets          enable row level security;
alter table services         enable row level security;
alter table sales            enable row level security;
alter table incomes          enable row level security;
alter table expenses         enable row level security;
alter table attendance       enable row level security;
alter table purchase_orders  enable row level security;
alter table task_templates   enable row level security;
alter table task_instances   enable row level security;

-- ---------- organizations ----------
create policy org_select on organizations
  for select using (is_org_member(id));
create policy org_update on organizations
  for update using (is_org_manager(id));
-- Insert handled by the create_organization RPC (security definer).

-- ---------- memberships ----------
create policy mbr_select on memberships
  for select using (is_org_member(org_id));
create policy mbr_manage on memberships
  for all using (is_org_manager(org_id)) with check (is_org_manager(org_id));

-- ---------- Generic org-scoped tables: member read, manager write ----------
-- outlets, suppliers, wallets: manager-managed config.
create policy outlets_select on outlets for select using (is_org_member(org_id));
create policy outlets_write  on outlets for all   using (is_org_manager(org_id)) with check (is_org_manager(org_id));

create policy suppliers_select on suppliers for select using (is_org_member(org_id));
create policy suppliers_write  on suppliers for all   using (is_org_manager(org_id)) with check (is_org_manager(org_id));

create policy wallets_select on wallets for select using (is_org_member(org_id));
create policy wallets_write  on wallets for all   using (is_org_manager(org_id)) with check (is_org_manager(org_id));

create policy po_select on purchase_orders for select using (is_org_member(org_id));
create policy po_write  on purchase_orders for all   using (is_org_manager(org_id)) with check (is_org_manager(org_id));

create policy templates_select on task_templates for select using (is_org_member(org_id));
create policy templates_write  on task_templates for all   using (is_org_manager(org_id)) with check (is_org_manager(org_id));

-- ---------- Operational tables: any active member may read + write ----------
-- customers, inventory, services, sales, task_instances, attendance.
create policy customers_select on customers for select using (is_org_member(org_id));
create policy customers_write  on customers for all   using (is_org_member(org_id)) with check (is_org_member(org_id));

create policy inventory_select on inventory_items for select using (is_org_member(org_id));
create policy inventory_write  on inventory_items for all   using (is_org_member(org_id)) with check (is_org_member(org_id));

create policy services_select on services for select using (is_org_member(org_id));
create policy services_write  on services for all   using (is_org_member(org_id)) with check (is_org_member(org_id));

create policy sales_select on sales for select using (is_org_member(org_id));
create policy sales_write  on sales for all   using (is_org_member(org_id)) with check (is_org_member(org_id));

create policy task_inst_select on task_instances for select using (is_org_member(org_id));
create policy task_inst_write  on task_instances for all   using (is_org_member(org_id)) with check (is_org_member(org_id));

create policy attendance_select on attendance for select using (is_org_member(org_id));
create policy attendance_write  on attendance for all   using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- Financial tables: manager-only (sensitive) ----------
-- incomes/expenses contain financial data; restrict writes to managers.
create policy incomes_select on incomes for select using (is_org_member(org_id));
create policy incomes_write  on incomes for all   using (is_org_manager(org_id)) with check (is_org_manager(org_id));

create policy expenses_select on expenses for select using (is_org_member(org_id));
create policy expenses_write  on expenses for all   using (is_org_manager(org_id)) with check (is_org_manager(org_id));
