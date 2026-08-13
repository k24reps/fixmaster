-- ============================================================
-- FixMaster — GoPay notification listener (billing)
--
-- A GoPay notification carries only an AMOUNT and a timestamp — no order id.
-- So the amount itself is the correlator, which means among OPEN gopay
-- invoices it must be globally unique. That is enforced by a partial unique
-- index (below): the database rejects a duplicate, so there is no app-level
-- check-then-insert race.
--
-- This is the ONLY payment path — the hosted gateways (duitku/fersaku) were
-- removed. Their historical invoice rows stay readable and are untouched here.
--
-- Flow:
--   start_gopay_invoice()  → pending invoice with a unique amount (base + 0..999)
--   [customer pays that exact amount to the GoPay merchant QR]
--   gopay-listener Edge Function → claim_gopay_payment(amount) → apply_payment
--
-- Stale pendings are expired on demand (30 min) so their amounts return to
-- the pool. No cron needed — both entry points sweep first.
-- Idempotent.
-- ============================================================

-- The amount is the only correlator, so it must be unique among OPEN gopay
-- invoices. Partial index: paid/expired/canceled rows and other providers
-- (duitku/fersaku/mock) are unaffected and may repeat amounts freely.
create unique index if not exists uq_invoices_gopay_open_amount
  on invoices (amount)
  where status = 'pending' and provider = 'gopay';

-- ---------- expire_stale_gopay_invoices ----------
-- Releases amounts held by abandoned invoices. Called by both entry points
-- rather than a scheduled job (one less moving part to operate).
create or replace function expire_stale_gopay_invoices()
returns void
language plpgsql security definer as $$
begin
  update invoices
  set status = 'expired'
  where provider = 'gopay'
    and status = 'pending'
    and created_at < now() - interval '30 minutes';
end;
$$;

-- Internal helper: never callable by a logged-in user.
revoke execute on function expire_stale_gopay_invoices() from public;

-- ---------- start_gopay_invoice ----------
-- Owner starts/renews a subscription paid via the GoPay QR. Mirrors
-- start_subscription as hardened in 0016 (OWNER-only + supersede old pendings)
-- and adds the unique-amount suffix. Returns the id AND the exact amount the
-- customer must transfer — paying a different amount will not correlate.
create or replace function start_gopay_invoice(p_plan plan_type, p_amount numeric)
returns table (invoice_id uuid, exact_amount numeric)
language plpgsql security definer as $$
declare
  v_org uuid;
  v_amount numeric;
  v_id uuid;
begin
  -- OWNER-only, matching start_subscription since 0016 (billing is owner-only;
  -- admins must not be able to open invoices).
  select org_id into v_org from memberships
  where user_id = auth.uid() and active = true and role = 'owner'
  limit 1;
  if v_org is null then raise exception 'Forbidden'; end if;

  if p_amount is null or p_amount < 1 then
    raise exception 'Nominal tidak valid';
  end if;

  perform expire_stale_gopay_invoices();

  -- Supersede this org's older pendings (same rule as 0016). Doubly important
  -- here: every open gopay invoice reserves a claimable amount, so letting
  -- them stack would leave several live amounts any of which could be paid.
  update invoices set status = 'canceled'
  where org_id = v_org and status = 'pending';

  -- Let the unique index arbitrate: try suffixes until one is accepted.
  -- 1000 slots vs a handful of concurrent invoices → collides essentially
  -- never, and a collision just costs one retry.
  for i in 1..50 loop
    v_amount := floor(p_amount) + floor(random() * 1000);
    begin
      insert into invoices (org_id, plan, amount, status, provider, period_start, period_end)
      values (v_org, p_plan, v_amount, 'pending', 'gopay', now(), now() + interval '1 month')
      returning id into v_id;
      invoice_id := v_id;
      exact_amount := v_amount;
      return next;
      return;
    exception when unique_violation then
      -- Amount already held by another open invoice — try another suffix.
    end;
  end loop;

  raise exception 'Tidak bisa mendapat nominal unik, coba lagi';
end;
$$;

-- ---------- claim_gopay_payment ----------
-- Called ONLY by the gopay-listener Edge Function (service_role). Matches an
-- incoming amount to exactly one open gopay invoice and applies it.
--
-- SECURITY: deliberately NOT granted to `authenticated`. It marks an invoice
-- paid with no proof beyond the amount, so any logged-in user able to call it
-- could self-extend their plan by guessing their own invoice amount — which
-- they know. Service role only.
--
-- `for update skip locked` makes concurrent notifications safe: the second one
-- cannot claim the row the first is already applying.
create or replace function claim_gopay_payment(p_amount numeric)
returns uuid
language plpgsql security definer as $$
declare
  v_id uuid;
begin
  perform expire_stale_gopay_invoices();

  select id into v_id
  from invoices
  where provider = 'gopay'
    and status = 'pending'
    and amount = p_amount
  limit 1
  for update skip locked;

  if v_id is null then
    return null;  -- no open invoice for this amount (unrelated incoming money)
  end if;

  perform apply_payment(v_id);
  return v_id;
end;
$$;

revoke execute on function claim_gopay_payment(numeric) from public;

-- Managers create their own invoice; only the service role may claim one.
grant execute on function start_gopay_invoice(plan_type, numeric) to authenticated;
grant execute on function claim_gopay_payment(numeric) to service_role;
grant execute on function expire_stale_gopay_invoices() to service_role;
