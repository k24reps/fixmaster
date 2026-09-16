-- ============================================================
-- FixMaster — 0069: audit Kasir, Inventori & Pelanggan
--
--  #1/#2  process_sale: qty harus bilangan bulat > 0, baris barang yang sama
--         digabung sebelum cek stok, harga & HPP diambil dari inventori (bukan
--         klien), total & jumlah pembayaran harus cocok, wallet harus milik toko.
--  #5     sales: insert/update langsung hanya manager (kasir lewat process_sale).
--  #6     void_sale: baris dikunci, cabang & langganan dicek, hanya penjualan
--         bulan berjalan (laporan bulan lalu tidak berubah).
--  #7     Tanggal transaksi fungsi server memakai WIB, bukan tanggal UTC.
--  #3     Stok tidak bisa ditulis ulang lewat update biasa (form edit bisa basi);
--         koreksi stok lewat adjust_inventory_stock (selisih, atomik).
--  #8     update_service_parts tidak macet saat barangnya sudah dihapus.
--  #4     sync_customer_to_services: nama & HP pelanggan ke tiket, kolom itu saja.
--  #10    No. HP pelanggan unik per toko (dinormalkan 0/62).
--  #11    customer_service_stats: statistik per pelanggan dari SEMUA tiket.
--  #12    receive_goods_v2: HPP rata-rata tertimbang saat barang diterima.
-- ============================================================

-- ---------- #1/#2 process_sale ----------
create or replace function process_sale(
  p_org_id uuid,
  p_sale_no text,
  p_lines jsonb,
  p_payments jsonb,
  p_subtotal numeric,
  p_discount numeric,
  p_discount_type text,
  p_total numeric,
  p_outlet_id uuid default null
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
  v_total numeric;
  v_paid numeric := 0;
  v_amount numeric;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  select * into v_member from memberships where user_id = auth.uid() and org_id = p_org_id;

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
    select i.id, i.name, i.stock, i.sell_price, i.cost_price, q.qty, q.first_ord
    from (
      select (l->>'itemId')::uuid as item_id, sum((l->>'qty')::numeric) as qty, min(ord) as first_ord
      from jsonb_array_elements(p_lines) with ordinality as t(l, ord)
      group by 1
    ) q
    join inventory_items i on i.id = q.item_id and i.org_id = p_org_id and i.deleted_at is null
    order by i.id
    for update of i
  loop
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

  insert into sales (org_id, outlet_id, sale_no, date, lines, subtotal, discount, discount_type, total, payments, cashier_id, cashier_name)
  values (p_org_id, p_outlet_id, v_sale_no, current_date, v_lines, v_subtotal, v_discount,
          case when p_discount_type = 'percent' then 'percent' else 'amount' end,
          v_total, coalesce(p_payments, '[]'::jsonb), v_member.id, v_member.name)
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

-- ---------- #6 void_sale ----------
create or replace function void_sale(p_sale_id uuid, p_reason text default '')
returns void
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_sale sales%rowtype;
  v_line jsonb;
  v_inc record;
begin
  -- Dikunci: dua pembatalan bersamaan diantrikan, yang kedua melihat voided=true.
  select * into v_sale from sales where id = p_sale_id for update;
  if not found then raise exception 'Penjualan tidak ditemukan'; end if;
  if not is_org_manager(v_sale.org_id) then
    raise exception 'Hanya manager yang dapat membatalkan penjualan';
  end if;
  if not is_org_active(v_sale.org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(v_sale.org_id, v_sale.outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if v_sale.voided then return; end if;
  if v_sale.date < date_trunc('month', current_date)::date then
    raise exception 'Penjualan bulan lalu tidak bisa dibatalkan — laporan bulan itu sudah berjalan. Catat pengembaliannya sebagai pengeluaran.';
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(v_sale.lines, '[]'::jsonb)) loop
    update inventory_items
      set stock = stock + (v_line->>'qty')::int, updated_at = now()
      where id = (v_line->>'itemId')::uuid and org_id = v_sale.org_id;
  end loop;

  for v_inc in
    select id, wallet_id, amount from incomes
    where org_id = v_sale.org_id
      and (
        sale_id = p_sale_id
        or (sale_id is null and category = 'Penjualan' and description = 'Penjualan ' || v_sale.sale_no)
      )
  loop
    if v_inc.wallet_id is not null then
      update wallets set balance = balance - v_inc.amount, updated_at = now()
        where id = v_inc.wallet_id and org_id = v_sale.org_id;
    end if;
    delete from incomes where id = v_inc.id;
  end loop;

  update sales
    set voided = true, voided_reason = coalesce(p_reason, ''), updated_at = now()
    where id = p_sale_id;
end;
$$;

-- ---------- #5 sales: tulis langsung manager saja ----------
drop policy if exists sales_ins on sales;
create policy sales_ins on sales for insert
  with check (
    is_org_manager(org_id) and is_org_active(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists sales_upd on sales;
create policy sales_upd on sales for update
  using (
    is_org_manager(org_id) and is_org_active(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  )
  with check (
    is_org_manager(org_id) and is_org_active(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );

-- ---------- #7 tanggal transaksi WIB ----------
alter function settle_service(uuid, uuid, jsonb, jsonb, uuid, numeric, numeric, uuid) set timezone = 'Asia/Jakarta';
alter function record_down_payment(uuid, uuid, uuid, numeric, uuid) set timezone = 'Asia/Jakarta';
alter function cancel_service(uuid, uuid, jsonb, uuid, numeric, uuid) set timezone = 'Asia/Jakarta';
alter function correct_service_cost(uuid, uuid, numeric, uuid, jsonb) set timezone = 'Asia/Jakarta';
alter function create_warranty_claim(uuid, uuid, text, text, text, text, numeric, uuid, jsonb) set timezone = 'Asia/Jakarta';

-- ---------- #3 stok hanya bergerak lewat fungsi server ----------
create or replace function inventory_guard_stock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Update langsung dari aplikasi (role authenticated) menulis ulang SELURUH baris
  -- dari form yang bisa sudah basi — penjualan di sela-sela tertimpa. Stok hanya
  -- berubah di fungsi server (security definer, current_user = pemilik fungsi).
  if current_user = 'authenticated' and new.stock is distinct from old.stock then
    new.stock := old.stock;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_guard_stock on inventory_items;
create trigger inventory_guard_stock
  before update of stock on inventory_items
  for each row execute function inventory_guard_stock();

create or replace function adjust_inventory_stock(
  p_org_id uuid,
  p_item_id uuid,
  p_delta integer
) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_stock integer;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  update inventory_items
    set stock = stock + coalesce(p_delta, 0), updated_at = now()
    where id = p_item_id and org_id = p_org_id and stock + coalesce(p_delta, 0) >= 0
    returning stock into v_stock;
  if not found then
    if not exists (select 1 from inventory_items where id = p_item_id and org_id = p_org_id) then
      raise exception 'Item inventory tidak ditemukan';
    end if;
    raise exception 'Stok tidak boleh negatif';
  end if;
  return v_stock;
end;
$$;

grant execute on function adjust_inventory_stock(uuid, uuid, integer) to authenticated;

-- ---------- #8 update_service_parts (0066) toleran barang terhapus ----------
create or replace function update_service_parts(
  p_org_id uuid,
  p_service_id uuid,
  p_spareparts jsonb
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_service services%rowtype;
  v_item record;
  v_name text;
  v_stock numeric;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if jsonb_typeof(p_spareparts) <> 'array' then raise exception 'Daftar sparepart tidak valid'; end if;

  select * into v_service from services
    where id = p_service_id and org_id = p_org_id
    for update;
  if not found then raise exception 'Service not found'; end if;
  if not can_use_outlet(p_org_id, v_service.outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if v_service.status = 'batal' then
    raise exception 'Tiket yang dibatalkan tidak bisa diubah sparepartnya';
  end if;

  for v_item in
    with held_old as (
      select (sp->>'itemId')::uuid as item_id, sum((sp->>'qty')::numeric) as qty
      from jsonb_array_elements(coalesce(v_service.spareparts, '[]'::jsonb)) sp
      where coalesce((sp->>'deducted')::boolean, false)
        and coalesce(sp->>'kind', '') <> 'manual'
        and coalesce(sp->>'itemId', '') <> ''
      group by 1
    ),
    held_new as (
      select (sp->>'itemId')::uuid as item_id, sum((sp->>'qty')::numeric) as qty
      from jsonb_array_elements(p_spareparts) sp
      where coalesce((sp->>'deducted')::boolean, false)
        and coalesce(sp->>'kind', '') <> 'manual'
        and coalesce(sp->>'itemId', '') <> ''
      group by 1
    )
    select coalesce(o.item_id, n.item_id) as item_id,
           coalesce(o.qty, 0) - coalesce(n.qty, 0) as delta
    from held_old o
    full join held_new n on n.item_id = o.item_id
    where coalesce(o.qty, 0) <> coalesce(n.qty, 0)
    order by 1
  loop
    update inventory_items
      set stock = stock + v_item.delta, updated_at = now()
      where id = v_item.item_id and org_id = p_org_id
        and stock + v_item.delta >= 0;
    if not found then
      select name, stock into v_name, v_stock
        from inventory_items where id = v_item.item_id and org_id = p_org_id;
      -- Barang sudah dihapus dari inventori: stok yang dikembalikan tak punya
      -- tujuan, jadi dilewati — baris sparepart di tiket tetap bisa dihapus.
      continue when v_name is null and v_item.delta > 0;
      if v_name is null then raise exception 'Item inventory tidak ditemukan'; end if;
      raise exception 'Stok % hanya %, tidak cukup', v_name, v_stock;
    end if;
  end loop;

  perform set_config('fixmaster.parts_rpc', 'on', true);
  update services
    set spareparts = p_spareparts, updated_at = now()
    where id = p_service_id and org_id = p_org_id;
end;
$$;

-- ---------- #4 nama & HP pelanggan ke tiket ----------
create or replace function sync_customer_to_services(p_org_id uuid, p_customer_id uuid)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_phone text;
  v_count integer;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  select name, coalesce(phone, '') into v_name, v_phone
    from customers where id = p_customer_id and org_id = p_org_id;
  if v_name is null then raise exception 'Pelanggan tidak ditemukan'; end if;

  -- Hanya dua kolom ini: status, sparepart, dan riwayat tiket tidak disentuh.
  update services
    set customer_name = v_name, customer_phone = v_phone, updated_at = now()
    where org_id = p_org_id and customer_id = p_customer_id
      and (customer_name is distinct from v_name or customer_phone is distinct from v_phone);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function sync_customer_to_services(uuid, uuid) to authenticated;

-- ---------- #10 No. HP pelanggan unik per toko ----------
create or replace function normalize_phone(p_phone text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case when d like '62%' then '0' || substr(d, 3) else d end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) digits;
$$;

create or replace function customers_unique_phone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_norm text := normalize_phone(new.phone);
  v_name text;
begin
  if v_norm = '' or new.deleted_at is not null then return new; end if;
  -- Upsert klien juga menembakkan trigger INSERT untuk baris yang sudah ada.
  if tg_op = 'INSERT' and exists (select 1 from customers where id = new.id) then return new; end if;
  -- Nomor tidak berubah: data ganda lama tidak menghalangi edit lain.
  if tg_op = 'UPDATE' and normalize_phone(old.phone) = v_norm then return new; end if;

  select name into v_name from customers
    where org_id = new.org_id and id <> new.id and deleted_at is null
      and normalize_phone(phone) = v_norm
    limit 1;
  if v_name is not null then
    raise exception 'No. HP sudah terdaftar atas nama "%"', v_name;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_unique_phone on customers;
create trigger customers_unique_phone
  before insert or update of phone on customers
  for each row execute function customers_unique_phone();

-- ---------- #11 statistik pelanggan dari semua tiket ----------
create or replace function customer_service_stats(p_org_id uuid)
returns table (customer_id uuid, services bigint, paid_total numeric, categories text[])
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select s.customer_id,
         count(*) filter (where s.status <> 'batal'),
         coalesce(sum(s.final_cost) filter (where s.status = 'lunas'), 0),
         array_remove(array_agg(distinct nullif(trim(s.category), '')), null)
  from services s
  where s.org_id = p_org_id and s.deleted_at is null and s.customer_id is not null
  group by s.customer_id;
$$;

grant execute on function customer_service_stats(uuid) to authenticated;

-- ---------- #12 receive_goods_v2: HPP rata-rata tertimbang ----------
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
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_delta jsonb;
  v_po_number text;
  v_qty numeric;
  v_unit numeric;
  v_stock integer;
  v_cost numeric;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;

  select po_number into v_po_number from purchase_orders
    where id = p_po_id and org_id = p_org_id;
  if v_po_number is null then raise exception 'PO not found'; end if;

  for v_delta in select * from jsonb_array_elements(p_deltas) loop
    v_qty := (v_delta->>'delta')::numeric;
    select stock, cost_price into v_stock, v_cost from inventory_items
      where id = (v_delta->>'itemId')::uuid and org_id = p_org_id
      for update;
    continue when not found;
    v_unit := null;
    select nullif(l->>'costPrice', '')::numeric into v_unit
      from jsonb_array_elements(p_lines) l
      where l->>'itemId' = v_delta->>'itemId'
      limit 1;
    update inventory_items
      set stock = stock + v_qty,
          -- HPP rata-rata tertimbang: (stok lama × HPP lama + qty masuk × harga beli) / stok baru.
          cost_price = case
            when v_qty <= 0 or v_unit is null then cost_price
            when v_stock <= 0 then v_unit
            else round((v_stock * v_cost + v_qty * v_unit) / (v_stock + v_qty), 2)
          end,
          updated_at = now()
      where id = (v_delta->>'itemId')::uuid and org_id = p_org_id;
  end loop;

  update purchase_orders
    set lines = p_lines,
        status = p_status::po_status,
        received_at = case when p_status = 'received' then current_date else received_at end,
        updated_at = now()
    where id = p_po_id and org_id = p_org_id;

  if p_amount > 0 then
    insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description, po_id)
    values (p_org_id, p_outlet_id, current_date, 'Sparepart', p_amount, p_wallet_id,
            'Pembelian stok PO ' || v_po_number, p_po_id);
    if p_wallet_id is not null then
      update wallets set balance = balance - p_amount, updated_at = now()
        where id = p_wallet_id and org_id = p_org_id;
    end if;
  end if;
end;
$$;
