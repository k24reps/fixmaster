-- ============================================================
-- FixMaster — 0034: receive_goods_v2 + void_po (PO → Keuangan sync)
--
-- Latar: penerimaan barang PO (ReceiveModal) hanya menambah stok + ubah
-- status PO; TIDAK mencatat pengeluaran maupun memotong wallet. Akibatnya
-- belanja stok ke supplier tak pernah muncul di Keuangan (laba bersih
-- terlalu tinggi, saldo wallet tak mencerminkan kas keluar).
--
-- Migrasi ini (Opsi B — atomik, sejalan process_sale 0025 / settle_service
-- 0029 / record_down_payment 0030):
--   1. Tambah kolom `expenses.po_id` → meng-link expense ke PO (audit + void).
--   2. RPC `receive_goods_v2`: dalam satu transaksi → tambah stok, update PO,
--      catat Expense senilai barang yang diterima SAAT INI (partial = expense
--      terpisah), dan (opsional) potong saldo wallet.
--   3. RPC `void_po`: pembatalan otomatis → balikkan stok yang sudah diterima,
--      kembalikan saldo wallet, hapus expense ter-link, set status 'cancelled'.
--
-- Keputusan user (smoke test 19 Jun 2026):
--   Q1=(c) checkbox potong wallet (opsional); Q2=expense partial per terima;
--   Q3=void otomatis (bukan manual).
--
-- Prasyarat: 0023–0033. Idempotent & additif (create or replace + IF NOT EXISTS).
-- ============================================================

-- 1. Link expense → PO (nullable; on delete set null agar hapus PO tak hapus expense)
alter table expenses add column if not exists po_id uuid references purchase_orders(id) on delete set null;
create index if not exists idx_expenses_po on expenses(po_id);

-- 2. receive_goods_v2 — atomik: stok + PO + expense + (opsi) wallet
create or replace function receive_goods_v2(
  p_org_id uuid,
  p_po_id uuid,
  p_lines jsonb,
  p_deltas jsonb,
  p_status text,
  p_outlet_id uuid default null,
  p_wallet_id uuid default null,
  p_amount numeric default 0
) returns void
language plpgsql security definer as $$
declare
  v_delta jsonb;
  v_po_number text;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;

  select po_number into v_po_number from purchase_orders
    where id = p_po_id and org_id = p_org_id;
  if v_po_number is null then raise exception 'PO not found'; end if;

  -- Tambah stok per item yang diterima saat ini.
  for v_delta in select * from jsonb_array_elements(p_deltas)
  loop
    update inventory set stock = stock + (v_delta->>'delta')::numeric, updated_at = now()
      where id = (v_delta->>'itemId')::uuid and org_id = p_org_id;
  end loop;

  -- Update PO (lines cumulative receivedQty, status, received_at).
  update purchase_orders
    set lines = p_lines,
        status = p_status::po_status,
        received_at = case when p_status = 'received' then current_date else received_at end,
        updated_at = now()
    where id = p_po_id and org_id = p_org_id;

  -- Catat pengeluaran senilai barang yang masuk saat ini (partial-aware).
  if p_amount > 0 then
    insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description, po_id)
    values (p_org_id, p_outlet_id, current_date, 'Sparepart', p_amount, p_wallet_id,
            'Pembelian stok PO ' || v_po_number, p_po_id);

    -- Potong wallet hanya bila dibayar tunai (p_wallet_id diisi).
    if p_wallet_id is not null then
      update wallets set balance = balance - p_amount, updated_at = now()
        where id = p_wallet_id and org_id = p_org_id;
    end if;
  end if;
end;
$$;
grant execute on function receive_goods_v2(uuid, uuid, jsonb, jsonb, text, uuid, uuid, numeric) to authenticated;

-- 3. void_po — pembatalan otomatis: balikkan stok + wallet + hapus expense
create or replace function void_po(
  p_org_id uuid,
  p_po_id uuid,
  p_outlet_id uuid default null
) returns void
language plpgsql security definer as $$
declare
  v_line jsonb;
  v_exp record;
  v_lines jsonb;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;

  select lines into v_lines from purchase_orders where id = p_po_id and org_id = p_org_id;
  if v_lines is null then raise exception 'PO not found'; end if;

  -- Balikkan stok untuk qty yang sudah diterima.
  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    if (v_line->>'receivedQty')::numeric > 0 then
      update inventory set stock = stock - (v_line->>'receivedQty')::numeric, updated_at = now()
        where id = (v_line->>'itemId')::uuid and org_id = p_org_id;
    end if;
  end loop;

  -- Kembalikan saldo wallet untuk tiap expense ter-link, lalu hapus expense-nya.
  for v_exp in select id, amount, wallet_id from expenses
    where po_id = p_po_id and org_id = p_org_id
  loop
    if v_exp.wallet_id is not null then
      update wallets set balance = balance + v_exp.amount, updated_at = now()
        where id = v_exp.wallet_id and org_id = p_org_id;
    end if;
    delete from expenses where id = v_exp.id;
  end loop;

  -- Reset receivedQty tiap baris ke 0 & set status 'cancelled'.
  update purchase_orders
    set lines = (
      select jsonb_agg(jsonb_set(l, '{receivedQty}', '0'::jsonb))
      from jsonb_array_elements(v_lines) l
    ),
    status = 'cancelled',
    updated_at = now()
    where id = p_po_id and org_id = p_org_id;
end;
$$;
grant execute on function void_po(uuid, uuid, uuid) to authenticated;
