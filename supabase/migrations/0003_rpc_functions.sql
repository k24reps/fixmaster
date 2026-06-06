-- ============================================================
-- FixMaster — Atomic RPC functions
-- Multi-table mutations run server-side in ONE transaction, avoiding
-- the lost-update problem of client-side whole-array writes (FixNova #2).
-- Also a public tracking RPC that exposes ONLY safe fields.
-- ============================================================

-- ------------------------------------------------------------
-- create_organization: bootstrap a new org + owner membership.
-- Runs as security definer so the very first insert (before any
-- membership exists) is permitted, then wires up the owner.
-- ------------------------------------------------------------
create or replace function create_organization(
  p_name text,
  p_owner_name text,
  p_address text default '',
  p_phone text default '',
  p_service_prefix text default 'FM'
) returns uuid
language plpgsql security definer as $$
declare
  new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into organizations (name, address, phone, service_prefix, plan_type, trial_started_at, plan_expired_at)
  values (p_name, p_address, p_phone, p_service_prefix, 'trial', now(), now() + interval '14 days')
  returning id into new_org_id;

  insert into memberships (org_id, user_id, name, role, active)
  values (new_org_id, auth.uid(), p_owner_name, 'owner', true);

  return new_org_id;
end;
$$;

-- ------------------------------------------------------------
-- process_sale: create a sale, deduct stock, and credit wallets +
-- record income — atomically. Validates stock under a row lock.
-- ------------------------------------------------------------
create or replace function process_sale(
  p_org_id uuid,
  p_sale_no text,
  p_lines jsonb,        -- [{itemId, name, qty, sellPrice, costPrice}]
  p_payments jsonb,     -- [{walletId, amount}]
  p_subtotal numeric,
  p_discount numeric,
  p_discount_type text,
  p_total numeric
) returns uuid
language plpgsql security definer as $$
declare
  v_sale_id uuid;
  v_line jsonb;
  v_payment jsonb;
  v_item inventory_items%rowtype;
  v_member memberships%rowtype;
begin
  if not is_org_member(p_org_id) then
    raise exception 'Forbidden';
  end if;
  select * into v_member from memberships where user_id = auth.uid() and org_id = p_org_id;

  -- Validate + lock stock rows.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from inventory_items
      where id = (v_line->>'itemId')::uuid and org_id = p_org_id for update;
    if not found then raise exception 'Item not found: %', v_line->>'itemId'; end if;
    if v_item.stock < (v_line->>'qty')::int then
      raise exception 'Insufficient stock for %', v_item.name;
    end if;
  end loop;

  insert into sales (org_id, sale_no, date, lines, subtotal, discount, discount_type, total, payments, cashier_id, cashier_name)
  values (p_org_id, p_sale_no, current_date, p_lines, p_subtotal, p_discount, p_discount_type, p_total, p_payments, v_member.id, v_member.name)
  returning id into v_sale_id;

  -- Deduct stock per line.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    update inventory_items
      set stock = stock - (v_line->>'qty')::int, updated_at = now()
      where id = (v_line->>'itemId')::uuid and org_id = p_org_id;
  end loop;

  -- Credit wallets + record income per payment allocation.
  for v_payment in select * from jsonb_array_elements(p_payments) loop
    update wallets
      set balance = balance + (v_payment->>'amount')::numeric, updated_at = now()
      where id = (v_payment->>'walletId')::uuid and org_id = p_org_id;
    insert into incomes (org_id, date, category, amount, wallet_id, description)
    values (p_org_id, current_date, 'Penjualan', (v_payment->>'amount')::numeric,
            (v_payment->>'walletId')::uuid, 'Penjualan ' || p_sale_no);
  end loop;

  return v_sale_id;
end;
$$;

-- ------------------------------------------------------------
-- settle_service: mark a service 'lunas', record income, credit wallet.
-- ------------------------------------------------------------
create or replace function settle_service(
  p_org_id uuid,
  p_service_id uuid,
  p_wallet_id uuid,
  p_amount numeric,
  p_history jsonb
) returns void
language plpgsql security definer as $$
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;

  update services
    set status = 'lunas', history = p_history, updated_at = now()
    where id = p_service_id and org_id = p_org_id;

  update wallets
    set balance = balance + p_amount, updated_at = now()
    where id = p_wallet_id and org_id = p_org_id;

  insert into incomes (org_id, date, category, amount, wallet_id, description, service_id)
  values (p_org_id, current_date, 'Servis', p_amount, p_wallet_id,
          'Pelunasan servis', p_service_id);
end;
$$;

-- ------------------------------------------------------------
-- receive_goods: apply PO receipts to stock + update PO status atomically.
-- ------------------------------------------------------------
create or replace function receive_goods(
  p_org_id uuid,
  p_po_id uuid,
  p_lines jsonb,        -- updated lines with receivedQty
  p_deltas jsonb,       -- [{itemId, delta}]
  p_status po_status
) returns void
language plpgsql security definer as $$
declare
  v_delta jsonb;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;

  for v_delta in select * from jsonb_array_elements(p_deltas) loop
    update inventory_items
      set stock = stock + (v_delta->>'delta')::int, updated_at = now()
      where id = (v_delta->>'itemId')::uuid and org_id = p_org_id;
  end loop;

  update purchase_orders
    set lines = p_lines, status = p_status,
        received_at = case when p_status = 'received' then current_date else received_at end,
        updated_at = now()
    where id = p_po_id and org_id = p_org_id;
end;
$$;

-- ------------------------------------------------------------
-- track_service (PUBLIC): look up a service by org + number, returning
-- ONLY safe fields + non-internal history. Callable by anon role.
-- ------------------------------------------------------------
create or replace function track_service(p_org_id uuid, p_service_no text)
returns table (
  service_no text,
  device text,
  category text,
  status service_status,
  org_name text,
  public_history jsonb
)
language sql security definer stable as $$
  select
    s.service_no,
    s.device,
    s.category,
    s.status,
    o.name as org_name,
    coalesce(
      (select jsonb_agg(h) from jsonb_array_elements(s.history) h
       where coalesce((h->>'internal')::boolean, false) = false),
      '[]'::jsonb
    ) as public_history
  from services s
  join organizations o on o.id = s.org_id
  where s.org_id = p_org_id
    and lower(s.service_no) = lower(p_service_no)
  limit 1;
$$;

-- Allow anonymous + authenticated callers to use the public tracker only.
grant execute on function track_service(uuid, text) to anon, authenticated;
