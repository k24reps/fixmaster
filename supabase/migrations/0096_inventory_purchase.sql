-- 0096 — Pembelian stok dari Inventori dalam satu langkah (29 Sep 2026).
--
-- Tanpa Supplier (fitur Pro), toko mencatat belanja stok dalam dua langkah
-- terpisah: ubah angka stok di Inventori (koreksi, harga modal ditimpa manual)
-- lalu catat pengeluaran Sparepart di Keuangan. Langkah kedua mudah terlupa atau
-- tercatat dua kali, dan harga modal yang ditimpa ikut menaikkan modal stok lama.
--
-- purchase_inventory_stock menambah stok, merata-rata harga modal (rumus sama
-- dengan receive_goods_v2, 0069), dan — bila wallet dipilih — mencatat
-- pengeluaran Sparepart + memotong saldo, semuanya dalam satu transaksi.
-- Tanpa wallet = pembayarannya sudah dicatat di tempat lain (stok & modal saja).

create or replace function purchase_inventory_stock(
  p_org_id uuid,
  p_item_id uuid,
  p_qty integer,
  p_unit_cost numeric,
  p_outlet_id uuid default null,
  p_wallet_id uuid default null
) returns integer
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_stock integer;
  v_cost numeric;
  v_name text;
  v_amount numeric;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if coalesce(p_qty, 0) <= 0 then raise exception 'Jumlah pembelian harus lebih dari 0'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Harga beli tidak valid'; end if;

  select stock, cost_price, name into v_stock, v_cost, v_name from inventory_items
    where id = p_item_id and org_id = p_org_id
    for update;
  if not found then raise exception 'Item inventory tidak ditemukan'; end if;

  update inventory_items
    set stock = stock + p_qty,
        -- HPP rata-rata tertimbang: (stok lama × HPP lama + qty × harga beli) / stok baru.
        cost_price = case
          when v_stock <= 0 then p_unit_cost
          else round((v_stock * v_cost + p_qty * p_unit_cost) / (v_stock + p_qty), 2)
        end,
        updated_at = now()
    where id = p_item_id and org_id = p_org_id
    returning stock into v_stock;

  v_amount := p_qty * p_unit_cost;
  if p_wallet_id is not null and v_amount > 0 then
    -- Cabang wallet vs cabang pengeluaran dijaga trigger assert_wallet_outlet (0095).
    insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description)
    values (p_org_id, p_outlet_id, current_date, 'Sparepart', v_amount, p_wallet_id,
            'Pembelian stok ' || v_name || ' ×' || p_qty);
    update wallets set balance = balance - v_amount, updated_at = now()
      where id = p_wallet_id and org_id = p_org_id;
    if not found then raise exception 'Wallet tidak ditemukan'; end if;
  end if;

  return v_stock;
end;
$$;

revoke all on function purchase_inventory_stock(uuid, uuid, integer, numeric, uuid, uuid) from public;
grant execute on function purchase_inventory_stock(uuid, uuid, integer, numeric, uuid, uuid) to authenticated;
