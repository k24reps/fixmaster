-- ============================================================
-- FixMaster — fixed_costs table (Fase 0D)
-- The local EntityMap has `fixedCosts` but the initial cloud schema
-- omitted it, so the Supabase adapter's TABLE mapping pointed at a
-- non-existent table. This adds it, RLS-secured like other financial
-- config (member read, manager write).
-- ============================================================

create table if not exists fixed_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete set null,
  name text not null,
  amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_fixed_costs_org on fixed_costs(org_id);

alter table fixed_costs enable row level security;

create policy fixed_costs_select on fixed_costs
  for select using (is_org_member(org_id));
create policy fixed_costs_write on fixed_costs
  for all using (is_org_manager(org_id)) with check (is_org_manager(org_id));
