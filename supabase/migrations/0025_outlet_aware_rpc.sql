-- ============================================================
-- FixMaster — 0025: process_sale & settle_service sadar-outlet
-- Bagian dari RILIS 1 (EXPAND) — di-apply bersama 0023/0024.
--
-- Latar: UI POS & pelunasan servis selama ini menulis saldo wallet
-- LANGSUNG dari klien (repository.put('wallets')), padahal RLS
-- wallets_write = manager-only (0010) dan inventory_write juga
-- manager-only (0017). Akibatnya KARYAWAN tak bisa menuntaskan
-- penjualan/pelunasan di cloud. RPC security-definer ini (sudah ada
-- sejak 0003) MEM-BYPASS RLS dengan aman + atomik; kita sambungkan
-- dari klien dan tambah kesadaran outlet:
--   - sales/incomes/services dicatat dengan outlet_id,
--   - incomes.sale_id diisi → void_sale (0018) deterministik,
--   - validasi: outlet harus org yang sama; bila bukan manager,
--     outlet wajib ∈ auth_outlet_ids() (0024). Bila p_outlet_id null
--     → diterima (record org-wide), tetap aman.
--
-- Idempotent (create or replace). Expand-only. Uji di staging dulu.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: validasi outlet untuk pemanggil pada satu org.
-- true bila: outlet null (org-wide), ATAU manager, ATAU outlet
-- termasuk outlet org ini DAN (manager / outlet ∈ auth_outlet_ids()).
-- ------------------------------------------------------------
create or replace function can_use_outlet(p_org uuid, p_outlet uuid)
returns boolean language sql security definer stable as $$
  select
    p_outlet is null
    or is_org_manager(p_org)
    or (
      exists (select 1 from outlets o where o.id = p_outlet and o.org_id = p_org)
      and p_outlet in (select auth_outlet_ids())
    );
$$;
grant execute on function can_use_outlet(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- process_sale (recreate dari 0003): + p_outlet_id, + sale_id pada
-- income, + validasi outlet. Tanda tangan LAMA dipertahankan via
-- default null agar pemanggil lama tetap jalan.
-- ------------------------------------------------------------
create or replace function process_sale(
  p_org_id uuid,
  p_sale_no text,
  p_lines jsonb,        -- [{itemId, name, qty, sellPrice, costPrice}]
  p_payments jsonb,     -- [{walletId, amount}]
  p_subtotal numeric,
  p_discount numeric,
  p_discount_type text,
  p_total numeric,
  p_outlet_id uuid default null
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
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
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

  insert into sales (org_id, outlet_id, sale_no, date, lines, subtotal, discount, discount_type, total, payments, cashier_id, cashier_name)
  values (p_org_id, p_outlet_id, p_sale_no, current_date, p_lines, p_subtotal, p_discount, p_discount_type, p_total, p_payments, v_member.id, v_member.name)
  returning id into v_sale_id;

  -- Deduct stock per line.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    update inventory_items
      set stock = stock - (v_line->>'qty')::int, updated_at = now()
      where id = (v_line->>'itemId')::uuid and org_id = p_org_id;
  end loop;

  -- Credit wallets + record income per payment allocation. Description tetap
  -- 'Penjualan <no>' agar fallback void_sale (0018) tetap cocok; sale_id diisi
  -- untuk pembalikan deterministik.
  for v_payment in select * from jsonb_array_elements(p_payments) loop
    update wallets
      set balance = balance + (v_payment->>'amount')::numeric, updated_at = now()
      where id = (v_payment->>'walletId')::uuid and org_id = p_org_id;
    insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, sale_id)
    values (p_org_id, p_outlet_id, current_date, 'Penjualan', (v_payment->>'amount')::numeric,
            (v_payment->>'walletId')::uuid, 'Penjualan ' || p_sale_no, v_sale_id);
  end loop;

  return v_sale_id;
end;
$$;

-- ------------------------------------------------------------
-- settle_service (recreate dari 0003): + p_outlet_id pada income +
-- validasi outlet. Tanda tangan lama dipertahankan via default null.
-- ------------------------------------------------------------
create or replace function settle_service(
  p_org_id uuid,
  p_service_id uuid,
  p_wallet_id uuid,
  p_amount numeric,
  p_history jsonb,
  p_outlet_id uuid default null
) returns void
language plpgsql security definer as $$
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;

  update services
    set status = 'lunas', history = p_history, updated_at = now()
    where id = p_service_id and org_id = p_org_id;

  update wallets
    set balance = balance + p_amount, updated_at = now()
    where id = p_wallet_id and org_id = p_org_id;

  insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, service_id)
  values (p_org_id, p_outlet_id, current_date, 'Servis', p_amount, p_wallet_id,
          'Pelunasan servis', p_service_id);
end;
$$;
