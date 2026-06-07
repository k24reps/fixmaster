-- ============================================================
-- FixMaster — Fase 1B: Billing & Langganan (invoice-based / QRIS)
-- QRIS is one-shot, so subscriptions = generate an invoice each cycle,
-- the org pays via QRIS, a provider webhook marks it paid and extends
-- plan_expired_at. The Mayar provider call lives in an Edge Function;
-- this migration only models the data + the atomic state transitions.
-- Idempotent.
-- ============================================================

do $$ begin
  create type invoice_status as enum ('pending', 'paid', 'expired', 'canceled');
exception when duplicate_object then null; end $$;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  plan plan_type not null,
  amount numeric(12,2) not null default 0,
  status invoice_status not null default 'pending',
  provider text not null default 'mock',     -- 'mayar' | 'mock'
  provider_ref text,                          -- external invoice id
  qris_url text,                              -- payment QR (from provider)
  period_start timestamptz not null default now(),
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists idx_invoices_org on invoices(org_id);
create index if not exists idx_invoices_status on invoices(status);

alter table invoices enable row level security;

-- Members may read their org's invoices; only managers create/cancel them.
drop policy if exists invoices_select on invoices;
create policy invoices_select on invoices
  for select using (is_org_member(org_id));
drop policy if exists invoices_manage on invoices;
create policy invoices_manage on invoices
  for all using (is_org_manager(org_id)) with check (is_org_manager(org_id));

-- ---------- is_org_active ----------
-- True when the org may perform writes: not suspended, plan not past its
-- grace window. Mirrors the client billing.ts policy (GRACE_DAYS = 3).
-- Outlet-quota is enforced separately at outlet-creation time.
create or replace function is_org_active(p_org_id uuid)
returns boolean
language plpgsql security definer stable as $$
declare
  v_plan plan_type;
  v_expiry timestamptz;
begin
  select plan_type, plan_expired_at into v_plan, v_expiry
  from organizations where id = p_org_id;
  if v_plan is null then return false; end if;
  if v_plan = 'suspended' then return false; end if;
  -- Trial / paid: active until 3 days past expiry (grace).
  if v_expiry is not null and now() > v_expiry + interval '3 days' then
    return false;
  end if;
  return true;
end;
$$;

-- ---------- start_subscription ----------
-- Manager starts/renews a subscription: creates a pending invoice for one
-- billing cycle. Returns the invoice id. The Edge Function fills provider_ref
-- + qris_url after calling Mayar (mock leaves them null).
create or replace function start_subscription(p_plan plan_type, p_amount numeric default 0)
returns uuid
language plpgsql security definer as $$
declare
  v_org uuid;
  v_invoice uuid;
begin
  -- Caller's org (must be a manager of exactly the org they belong to).
  select org_id into v_org from memberships
  where user_id = auth.uid() and active = true and role in ('owner','admin')
  limit 1;
  if v_org is null then raise exception 'Forbidden'; end if;

  insert into invoices (org_id, plan, amount, status, period_start, period_end)
  values (v_org, p_plan, p_amount, 'pending', now(), now() + interval '1 month')
  returning id into v_invoice;

  return v_invoice;
end;
$$;

-- ---------- apply_payment ----------
-- Marks an invoice paid and extends the org's plan. Called by the webhook
-- (service role) or a manager confirming a mock payment. Idempotent: a
-- second call on an already-paid invoice is a no-op.
create or replace function apply_payment(p_invoice_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_org uuid;
  v_plan plan_type;
  v_end timestamptz;
  v_status invoice_status;
  v_current_expiry timestamptz;
begin
  select org_id, plan, period_end, status into v_org, v_plan, v_end, v_status
  from invoices where id = p_invoice_id;
  if v_org is null then raise exception 'Invoice not found'; end if;
  if v_status = 'paid' then return; end if;  -- idempotent

  update invoices set status = 'paid', paid_at = now() where id = p_invoice_id;

  -- Extend from the later of now() or the current expiry, so paying early
  -- does not lose remaining days.
  select plan_expired_at into v_current_expiry from organizations where id = v_org;
  update organizations
  set plan_type = v_plan,
      plan_expired_at = greatest(coalesce(v_current_expiry, now()), now()) + interval '1 month'
  where id = v_org;
end;
$$;

grant execute on function is_org_active(uuid) to authenticated;
grant execute on function start_subscription(plan_type, numeric) to authenticated;
grant execute on function apply_payment(uuid) to authenticated;
