-- ============================================================
-- FixMaster — 0070: sisa audit Kasir, Inventori & Pelanggan
--
--  #13  Diskon kasir dibatasi: karyawan maksimal 10% dari subtotal,
--       lebih dari itu harus owner/admin. Dicek di server, bukan di layar.
--  #15  Pelanggan yang punya tiket servis / penjualan tidak bisa dihapus —
--       menghapusnya melepas riwayat dan statistiknya.
--  #17  Penjualan kasir bisa dikaitkan ke pelanggan (kolom + parameter RPC).
--  #19  Stok bisa dimiliki satu cabang: barang ber-outlet_id hanya boleh
--       dijual di cabang itu. Barang tanpa cabang (bawaan) tetap dipakai
--       bersama, jadi data lama tidak berubah perilakunya.
-- ============================================================

-- ---------- #17 penjualan → pelanggan ----------
alter table sales add column if not exists customer_id uuid references customers(id) on delete set null;
alter table sales add column if not exists customer_name text default '';
create index if not exists idx_sales_customer on sales(org_id, customer_id);

-- ---------- #13/#17/#19 process_sale ----------
-- Tanda tangan lama (9 argumen) dibuang supaya tidak ada dua fungsi bernama
-- sama yang membuat pemanggilan jadi ambigu.
drop function if exists process_sale(uuid, text, jsonb, jsonb, numeric, numeric, text, numeric, uuid);

create or replace function process_sale(
  p_org_id uuid,
  p_sale_no text,
  p_lines jsonb,
  p_payments jsonb,
  p_subtotal numeric,
  p_discount numeric,
  p_discount_type text,
  p_total numeric,
  p_outlet_id uuid default null,
  p_customer_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_sale_id uuid;
  v_line jsonb;
  v_payment jsonb;
  v_item record;
  v_member memberships%rowtype;
  v_prefix text;
  v_seq int;
  v_sale_no text;
  v_lines jsonb := '[]'::jsonb;
  v_found int := 0;
  v_subtotal numeric := 0;
  v_discount numeric;
  v_discount_cap numeric;
  v_total numeric;
  v_paid numeric := 0;
  v_amount numeric;
  v_customer_name text := '';
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  select * into v_member from memberships where user_id = auth.uid() and org_id = p_org_id;

  if p_customer_id is not null then
    select name into v_customer_name from customers
      where id = p_customer_id and org_id = p_org_id and deleted_at is null;
    if v_customer_name is null then raise exception 'Pelanggan tidak ditemukan'; end if;
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Keranjang kosong';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line->'qty') is distinct from 'number'
       or (v_line->>'qty')::numeric <= 0
       or (v_line->>'qty')::numeric <> trunc((v_line->>'qty')::numeric) then
      raise exception 'Jumlah barang tidak valid';
    end if;
  end loop;

  -- Baris barang yang sama digabung dulu (dua baris qty=stok tak boleh lolos
  -- masing-masing), dikunci berurutan id, harga & HPP dari inventori.
  for v_item in
    select i.id, i.name, i.stock, i.sell_price, i.cost_price, i.outlet_id, q.qty, q.first_ord
    from (
      select (l->>'itemId')::uuid as item_id, sum((l->>'qty')::numeric) as qty, min(ord) as first_ord
      from jsonb_array_elements(p_lines) with ordinality as t(l, ord)
      group by 1
    ) q
    join inventory_items i on i.id = q.item_id and i.org_id = p_org_id and i.deleted_at is null
    order by i.id
    for update of i
  loop
    -- #19: barang yang dimiliki satu cabang tidak boleh dijual dari cabang lain.
    -- outlet_id kosong = stok bersama (perilaku bawaan sebelum 0070).
    if v_item.outlet_id is not null and v_item.outlet_id is distinct from p_outlet_id then
      raise exception 'Barang % milik cabang lain', v_item.name;
    end if;
    if v_item.stock < v_item.qty then
      raise exception 'Stok % tidak cukup (tersisa %)', v_item.name, v_item.stock;
    end if;
    v_found := v_found + 1;
    v_subtotal := v_subtotal + v_item.sell_price * v_item.qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'itemId', v_item.id, 'name', v_item.name, 'qty', v_item.qty,
      'sellPrice', v_item.sell_price, 'costPrice', v_item.cost_price, '_ord', v_item.first_ord
    ));
  end loop;
  if v_found <> (select count(distinct l->>'itemId') from jsonb_array_elements(p_lines) l) then
    raise exception 'Barang tidak ditemukan di inventori';
  end if;
  select jsonb_agg(e - '_ord' order by (e->>'_ord')::int) into v_lines
    from jsonb_array_elements(v_lines) e;

  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_subtotal);
  -- #13: diskon besar adalah uang toko yang keluar tanpa jejak persetujuan.
  -- Karyawan dibatasi 10% dari subtotal; owner/admin bebas.
  if not is_org_manager(p_org_id) then
    v_discount_cap := round(v_subtotal * 0.10);
    if v_discount > v_discount_cap then
      raise exception 'Diskon melebihi batas karyawan (maksimal %). Minta owner/admin untuk diskon lebih besar.', v_discount_cap;
    end if;
  end if;
  v_total := v_subtotal - v_discount;
  if p_total is null or round(p_total) <> round(v_total) then
    raise exception 'Harga barang berubah — muat ulang kasir lalu proses lagi (total terbaru %)', v_total;
  end if;

  for v_payment in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    v_amount := (v_payment->>'amount')::numeric;
    if v_amount is null or v_amount < 0 then raise exception 'Nominal pembayaran tidak valid'; end if;
    v_paid := v_paid + v_amount;
  end loop;
  if round(v_paid) <> round(v_total) then
    raise exception 'Total pembayaran (%) harus sama dengan total transaksi (%)', v_paid, v_total;
  end if;

  -- Nomor penjualan server-side (0025/0039).
  v_prefix := split_part(p_sale_no, '-', 1);
  perform pg_advisory_xact_lock(hashtext(p_org_id::text || ':sale:' || v_prefix));
  select coalesce(max((regexp_replace(sale_no, '^.*-', ''))::int), 0) + 1
    into v_seq
    from sales
    where org_id = p_org_id and sale_no ~ ('^' || v_prefix || '-\d+$');
  v_sale_no := v_prefix || '-' || lpad(v_seq::text, 4, '0');

  insert into sales (org_id, outlet_id, sale_no, date, lines, subtotal, discount, discount_type, total,
                     payments, cashier_id, cashier_name, customer_id, customer_name)
  values (p_org_id, p_outlet_id, v_sale_no, current_date, v_lines, v_subtotal, v_discount,
          case when p_discount_type = 'percent' then 'percent' else 'amount' end,
          v_total, coalesce(p_payments, '[]'::jsonb), v_member.id, v_member.name,
          p_customer_id, v_customer_name)
  returning id into v_sale_id;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    update inventory_items
      set stock = stock - (v_line->>'qty')::int, updated_at = now()
      where id = (v_line->>'itemId')::uuid and org_id = p_org_id;
  end loop;

  for v_payment in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    v_amount := (v_payment->>'amount')::numeric;
    continue when v_amount = 0;
    update wallets
      set balance = balance + v_amount, updated_at = now()
      where id = (v_payment->>'walletId')::uuid and org_id = p_org_id;
    if not found then raise exception 'Wallet tidak ditemukan'; end if;
    insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, sale_id)
    values (p_org_id, p_outlet_id, current_date, 'Penjualan', v_amount,
            (v_payment->>'walletId')::uuid, 'Penjualan ' || v_sale_no, v_sale_id);
  end loop;

  return v_sale_id;
end;
$$;

-- ---------- #15 pelanggan bertiket tidak bisa dihapus ----------
create or replace function customers_block_delete_with_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_services int;
  v_sales int;
begin
  select count(*) into v_services from services
    where org_id = old.org_id and customer_id = old.id and deleted_at is null;
  select count(*) into v_sales from sales
    where org_id = old.org_id and customer_id = old.id and deleted_at is null;
  if v_services + v_sales > 0 then
    raise exception
      'Pelanggan "%" punya % tiket servis dan % penjualan — menghapusnya memutus riwayat itu. Perbarui datanya saja.',
      old.name, v_services, v_sales;
  end if;
  return old;
end;
$$;

drop trigger if exists customers_block_delete_with_history on customers;
create trigger customers_block_delete_with_history
  before delete on customers
  for each row execute function customers_block_delete_with_history();
