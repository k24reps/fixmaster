-- ============================================================
-- FixMaster — Initial Schema (relational, RLS-secured)
-- Fixes FixNova weaknesses:
--   #1 JSONB key-value blob   → proper relational tables + indexes
--   #2 lost-update concurrency → per-row writes + atomic RPCs
--   #3 UI-only role enforcement → Row Level Security on every table
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
create type role_type as enum ('owner', 'admin', 'karyawan');
create type plan_type as enum ('free', 'standard', 'enterprise', 'trial', 'suspended');
create type service_status as enum (
  'diterima', 'diagnosa', 'konfirmasi', 'tunggu', 'pengerjaan', 'selesai', 'lunas', 'batal'
);
create type po_status as enum ('draft', 'ordered', 'partial', 'received', 'cancelled');
create type recurrence_type as enum ('once', 'daily', 'weekly', 'monthly');
create type assignee_type as enum ('role', 'employee', 'outlet');
create type task_status as enum ('pending', 'done', 'skipped');

-- ============================================================
-- CORE: organizations + memberships
-- A user (auth.uid) belongs to an org with a role. This membership
-- table is the backbone of every RLS policy.
-- ============================================================
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text default '',
  phone text default '',
  logo_data_url text,
  service_prefix text default 'FM',
  plan_type plan_type not null default 'trial',
  trial_started_at timestamptz,
  plan_expired_at timestamptz,
  max_outlets int default 5,
  max_users int default -1,
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role role_type not null default 'karyawan',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index idx_memberships_user on memberships(user_id);
create index idx_memberships_org on memberships(org_id);

-- ============================================================
-- Helper functions for RLS (security definer to avoid recursion)
-- ============================================================
create or replace function auth_org_ids()
returns setof uuid language sql security definer stable as $$
  select org_id from memberships where user_id = auth.uid() and active = true;
$$;

create or replace function auth_role_in(target_org uuid)
returns role_type language sql security definer stable as $$
  select role from memberships where user_id = auth.uid() and org_id = target_org and active = true;
$$;

create or replace function is_org_member(target_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and org_id = target_org and active = true
  );
$$;

create or replace function is_org_manager(target_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and org_id = target_org and active = true
      and role in ('owner', 'admin')
  );
$$;

-- ============================================================
-- DOMAIN TABLES (one concern each — no JSONB blobs)
-- ============================================================
create table outlets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text default '',
  is_primary boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_outlets_org on outlets(org_id);

create table customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete set null,
  name text not null,
  phone text default '',
  email text default '',
  address text default '',
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_customers_org on customers(org_id);
create index idx_customers_phone on customers(org_id, phone);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  phone text default '',
  email text default '',
  address text default '',
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_suppliers_org on suppliers(org_id);

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete set null,
  name text not null,
  category text default '',
  sku text default '',
  stock int not null default 0,
  min_stock int not null default 0,
  cost_price numeric(14,2) not null default 0,
  sell_price numeric(14,2) not null default 0,
  supplier_id uuid references suppliers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_inventory_org on inventory_items(org_id);

create table wallets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  balance numeric(14,2) not null default 0,
  sort_order int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_wallets_org on wallets(org_id);

create table services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete set null,
  service_no text not null,
  customer_id uuid references customers(id) on delete set null,
  customer_name text default '',
  customer_phone text default '',
  category text default '',
  device text default '',
  complaint text default '',
  accessories text default '',
  status service_status not null default 'diterima',
  technician_id uuid references memberships(id) on delete set null,
  technician_name text default '',
  estimate_cost numeric(14,2) default 0,
  final_cost numeric(14,2) default 0,
  down_payment numeric(14,2) default 0,
  spareparts jsonb not null default '[]',   -- line items: small, bounded array
  history jsonb not null default '[]',       -- audit trail: append-only
  warranty_until date,
  archived boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, service_no)
);
create index idx_services_org on services(org_id);
create index idx_services_status on services(org_id, status);

create table sales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete set null,
  sale_no text not null,
  date date not null,
  lines jsonb not null default '[]',
  subtotal numeric(14,2) default 0,
  discount numeric(14,2) default 0,
  discount_type text default 'amount',
  total numeric(14,2) default 0,
  payments jsonb not null default '[]',
  cashier_id uuid references memberships(id) on delete set null,
  cashier_name text default '',
  voided boolean default false,
  voided_reason text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, sale_no)
);
create index idx_sales_org on sales(org_id);

create table incomes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete set null,
  date date not null,
  category text default 'Lainnya',
  amount numeric(14,2) not null,
  wallet_id uuid references wallets(id) on delete set null,
  description text default '',
  service_id uuid references services(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_incomes_org on incomes(org_id, date);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete set null,
  date date not null,
  category text default 'Lainnya',
  amount numeric(14,2) not null,
  wallet_id uuid references wallets(id) on delete set null,
  description text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_expenses_org on expenses(org_id, date);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete set null,
  employee_id uuid references memberships(id) on delete cascade,
  employee_name text default '',
  date date not null,
  status text default 'hadir',
  check_in text,
  check_out text,
  total_hours numeric(6,2) default 0,
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_attendance_org on attendance(org_id, date);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete set null,
  po_number text not null,
  supplier_id uuid references suppliers(id) on delete set null,
  status po_status not null default 'draft',
  lines jsonb not null default '[]',
  ordered_at date,
  received_at date,
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, po_number)
);
create index idx_po_org on purchase_orders(org_id);

-- Internal Tasks (NEW — not in FixNova)
create table task_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text default '',
  recurrence recurrence_type not null default 'daily',
  weekdays int[] default '{}',
  month_days int[] default '{}',
  once_date date,
  assignee_type assignee_type not null default 'role',
  assignee_role role_type,
  assignee_employee_id uuid references memberships(id) on delete set null,
  assignee_outlet_id uuid references outlets(id) on delete set null,
  active boolean default true,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_task_templates_org on task_templates(org_id);

create table task_instances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  outlet_id uuid references outlets(id) on delete set null,
  template_id uuid references task_templates(id) on delete cascade,
  title text not null,
  description text default '',
  due_date date not null,
  status task_status not null default 'pending',
  completed_at timestamptz,
  completed_by_id uuid references memberships(id) on delete set null,
  completed_by_name text default '',
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, due_date)
);
create index idx_task_instances_org on task_instances(org_id, due_date);
