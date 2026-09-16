-- ============================================================
-- FixMaster — 0071: audit Supplier & Keuangan
--
--  #1   Pengeluaran milik PO / "Modal servis" tidak bisa diubah dari Keuangan:
--       PO & stoknya tidak ikut berubah, lalu pembatalan PO mengembalikan
--       nominal yang sudah diedit.
--  #2   Catat & ubah transaksi keuangan jadi satu transaksi server (baris +
--       saldo), seperti hapus (0068). Dulu dua penulisan terpisah: gagal di
--       tengah membuat buku kas dan saldo berbeda diam-diam.
--  #13  Ubah & hapus transaksi hanya untuk bulan berjalan — sama seperti
--       pembatalan penjualan (0069). Bulan lalu dikoreksi dengan entri baru.
--  #3   void_po: cek langganan, tolak bila stok jadi minus, tolak bila
--       pengeluarannya sudah masuk bulan lalu, dan diam bila sudah dibatalkan.
--  #4   receive_goods_v2: barang yang sudah dihapus TIDAK dilewati diam-diam.
--  #5   Nomor PO ditetapkan server (advisory lock), bukan dihitung aplikasi
--       dari daftar yang terpotong 1000 baris.
--  #11  PO masih bisa diperbaiki selama belum ada barang yang diterima.
--  #12  PO dicap ke cabang, seperti pengeluarannya.
--  #14  Qty PO wajib bilangan bulat > 0.
-- ============================================================

-- ---------- #13 penjaga bulan berjalan ----------
create or replace function assert_open_month(p_date date, p_what text)
returns void
language plpgsql stable
set search_path = public, pg_temp
as $$
begin
  if p_date < date_trunc('month', current_date)::date then
    raise exception '% bulan lalu tidak bisa diubah atau dihapus — laporan bulan itu sudah berjalan. Catat koreksinya sebagai transaksi bulan ini.', p_what;
  end if;
end;
$$;

-- ---------- #1 pengeluaran terkait PO / servis dikunci ----------
create or replace function expenses_guard_linked()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Fungsi server (security definer) memakai peran pemilik fungsi, jadi
  -- receive_goods_v2 / void_po / delete_finance_entry tetap bebas bekerja.
  if current_user = 'authenticated'
     and (old.po_id is not null or old.description like 'Modal servis %')
     and (new.amount is distinct from old.amount
          or new.wallet_id is distinct from old.wallet_id
          or new.date is distinct from old.date
          or new.po_id is distinct from old.po_id) then
    raise exception 'Pengeluaran ini terikat %. Ubah dari halaman asalnya, bukan dari Keuangan.',
      case when old.po_id is not null then 'Purchase Order' else 'tiket servis' end;
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_guard_linked on expenses;
create trigger expenses_guard_linked
  before update on expenses
  for each row execute function expenses_guard_linked();

-- ---------- #2 catat transaksi keuangan (baris + saldo, satu transaksi) ----------
create or replace function record_finance_entry(
  p_org_id uuid,
  p_kind text,
  p_date date,
  p_category text,
  p_amount numeric,
  p_wallet_id uuid,
  p_description text default '',
  p_outlet_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_id uuid;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  perform 1 from wallets where id = p_wallet_id and org_id = p_org_id;
  if not found then raise exception 'Wallet tidak ditemukan'; end if;

  if p_kind = 'income' then
    insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, service_id)
    values (p_org_id, p_outlet_id, coalesce(p_date, current_date), p_category, p_amount,
            p_wallet_id, coalesce(p_description, ''), null)
    returning id into v_id;
    update wallets set balance = balance + p_amount, updated_at = now()
      where id = p_wallet_id and org_id = p_org_id;
  elsif p_kind = 'expense' then
    insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description)
    values (p_org_id, p_outlet_id, coalesce(p_date, current_date), p_category, p_amount,
            p_wallet_id, coalesce(p_description, ''))
    returning id into v_id;
    update wallets set balance = balance - p_amount, updated_at = now()
      where id = p_wallet_id and org_id = p_org_id;
  else
    raise exception 'Jenis transaksi tidak valid';
  end if;

  return v_id;
end;
$$;

grant execute on function record_finance_entry(uuid, text, date, text, numeric, uuid, text, uuid) to authenticated;

-- ---------- #2/#13 ubah transaksi keuangan ----------
create or replace function update_finance_entry(
  p_org_id uuid,
  p_kind text,
  p_id uuid,
  p_date date,
  p_category text,
  p_amount numeric,
  p_wallet_id uuid,
  p_description text default ''
) returns void
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_inc incomes%rowtype;
  v_exp expenses%rowtype;
  v_old_wallet uuid;
  v_old_amount numeric;
  v_sign int;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  perform 1 from wallets where id = p_wallet_id and org_id = p_org_id;
  if not found then raise exception 'Wallet tidak ditemukan'; end if;
  perform assert_open_month(coalesce(p_date, current_date), 'Transaksi');

  if p_kind = 'income' then
    select * into v_inc from incomes where id = p_id and org_id = p_org_id for update;
    if not found then raise exception 'Transaksi tidak ditemukan'; end if;
    if v_inc.service_id is not null or v_inc.sale_id is not null then
      raise exception 'Pemasukan ini berasal dari tiket servis atau penjualan. Ubah dari halaman asalnya.';
    end if;
    perform assert_open_month(v_inc.date, 'Transaksi');
    v_old_wallet := v_inc.wallet_id;
    v_old_amount := v_inc.amount;
    v_sign := 1;

    update incomes
      set date = coalesce(p_date, date), category = p_category, amount = p_amount,
          wallet_id = p_wallet_id, description = coalesce(p_description, ''), updated_at = now()
      where id = p_id and org_id = p_org_id;
  elsif p_kind = 'expense' then
    select * into v_exp from expenses where id = p_id and org_id = p_org_id for update;
    if not found then raise exception 'Transaksi tidak ditemukan'; end if;
    if v_exp.po_id is not null or v_exp.description like 'Modal servis %' then
      raise exception 'Pengeluaran ini terikat Purchase Order atau tiket servis. Ubah dari halaman asalnya.';
    end if;
    perform assert_open_month(v_exp.date, 'Transaksi');
    v_old_wallet := v_exp.wallet_id;
    v_old_amount := v_exp.amount;
    v_sign := -1;

    update expenses
      set date = coalesce(p_date, date), category = p_category, amount = p_amount,
          wallet_id = p_wallet_id, description = coalesce(p_description, ''), updated_at = now()
      where id = p_id and org_id = p_org_id;
  else
    raise exception 'Jenis transaksi tidak valid';
  end if;

  -- Saldo: tarik nilai lama dari wallet lama, terapkan nilai baru di wallet baru.
  update wallets set balance = balance - v_sign * v_old_amount, updated_at = now()
    where id = v_old_wallet and org_id = p_org_id;
  update wallets set balance = balance + v_sign * p_amount, updated_at = now()
    where id = p_wallet_id and org_id = p_org_id;
end;
$$;

grant execute on function update_finance_entry(uuid, text, uuid, date, text, numeric, uuid, text) to authenticated;

-- ---------- #13 hapus transaksi: kunci bulan berjalan ----------
-- Sama dengan 0068, ditambah assert_open_month + penolakan pengeluaran milik PO.
create or replace function delete_finance_entry(
  p_org_id uuid,
  p_kind text,
  p_id uuid
) returns void
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_inc incomes%rowtype;
  v_exp expenses%rowtype;
  v_svc services%rowtype;
  v_has_svc boolean := false;
  v_is_dp boolean := false;
  v_is_settle boolean := false;
  v_is_correction boolean := false;
  v_revert boolean := false;
  v_corr_desc text := '';
  v_next_dp numeric;
  v_next_final numeric;
  v_note text;
  v_no text;
  v_now text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  if p_kind = 'income' then
    select * into v_inc from incomes where id = p_id and org_id = p_org_id for update;
    if not found then raise exception 'Transaksi tidak ditemukan'; end if;
    perform assert_open_month(v_inc.date, 'Transaksi');

    if v_inc.category = 'Servis' and v_inc.service_id is not null then
      select * into v_svc from services
        where id = v_inc.service_id and org_id = p_org_id
        for update;
      v_has_svc := found;
    end if;
    if v_has_svc then
      v_is_dp := v_inc.description = 'DP servis ' || v_svc.service_no;
      v_is_settle := v_inc.description = 'Pelunasan servis ' || v_svc.service_no;
      v_corr_desc := 'Koreksi biaya servis ' || v_svc.service_no;
      v_is_correction := v_inc.description = v_corr_desc;
      v_revert := v_svc.status = 'lunas' and not v_is_dp and not v_is_correction;
    end if;

    with removed as (
      delete from incomes i
      where i.org_id = p_org_id
        and (i.id = p_id
             or (v_is_settle and i.service_id = v_inc.service_id and i.description = v_inc.description)
             or (v_revert and i.service_id = v_inc.service_id and i.description = v_corr_desc))
      returning i.wallet_id, i.amount
    )
    update wallets w
      set balance = w.balance - r.total, updated_at = now()
      from (select wallet_id, sum(amount) as total from removed group by wallet_id) r
      where w.id = r.wallet_id and w.org_id = p_org_id;

    if v_revert then
      with removed as (
        delete from expenses e
        where e.org_id = p_org_id and e.description = v_corr_desc
        returning e.wallet_id, e.amount
      )
      update wallets w
        set balance = w.balance + r.total, updated_at = now()
        from (select wallet_id, sum(amount) as total from removed group by wallet_id) r
        where w.id = r.wallet_id and w.org_id = p_org_id;
    end if;

    if v_has_svc then
      v_next_dp := case when v_is_dp
        then greatest(0, coalesce(v_svc.down_payment, 0) - v_inc.amount)
        else v_svc.down_payment end;
      v_next_final := case when v_is_correction
        then greatest(0, coalesce(v_svc.final_cost, 0) - v_inc.amount)
        else v_svc.final_cost end;
      if v_revert
         or v_next_dp is distinct from v_svc.down_payment
         or v_next_final is distinct from v_svc.final_cost then
        v_note := case
          when v_revert then 'Pelunasan dibatalkan (pemasukan dihapus)'
          when v_is_correction then 'Koreksi biaya ' || fmt_rp(v_inc.amount)
            || ' dihapus dari keuangan: biaya final ' || fmt_rp(v_svc.final_cost) || ' → ' || fmt_rp(v_next_final)
          else 'DP ' || fmt_rp(v_inc.amount) || ' dihapus dari keuangan'
        end;
        update services
          set status = case when v_revert then 'selesai' else status end,
              down_payment = v_next_dp,
              final_cost = v_next_final,
              history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'at', v_now,
                'status', case when v_revert then 'selesai' else 'edit' end,
                'by', '', 'byName', 'Sistem', 'note', v_note, 'internal', not v_revert
              )),
              updated_at = now()
          where id = v_svc.id;
      end if;
    end if;

  elsif p_kind = 'expense' then
    select * into v_exp from expenses where id = p_id and org_id = p_org_id for update;
    if not found then raise exception 'Transaksi tidak ditemukan'; end if;
    perform assert_open_month(v_exp.date, 'Transaksi');
    if v_exp.po_id is not null then
      raise exception 'Pengeluaran ini milik Purchase Order — batalkan PO-nya dari menu Supplier.';
    end if;

    delete from expenses where id = p_id;
    update wallets set balance = balance + v_exp.amount, updated_at = now()
      where id = v_exp.wallet_id and org_id = p_org_id;

    if v_exp.description like 'Koreksi biaya servis %' then
      v_no := substring(v_exp.description from length('Koreksi biaya servis ') + 1);
      select * into v_svc from services
        where org_id = p_org_id and service_no = v_no
        for update;
      if found then
        update services
          set final_cost = coalesce(final_cost, 0) + v_exp.amount,
              history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'at', v_now, 'status', 'edit', 'by', '', 'byName', 'Sistem',
                'note', 'Refund koreksi biaya ' || fmt_rp(v_exp.amount) || ' dihapus dari keuangan: biaya final '
                  || fmt_rp(v_svc.final_cost) || ' → ' || fmt_rp(coalesce(v_svc.final_cost, 0) + v_exp.amount),
                'internal', true
              )),
              updated_at = now()
          where id = v_svc.id;
      end if;
    end if;

  else
    raise exception 'Jenis transaksi tidak valid';
  end if;
end;
$$;

-- ---------- #4 terima barang: item hilang TIDAK dilewati diam-diam ----------
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
  v_po_status po_status;
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

  select po_number, status into v_po_number, v_po_status from purchase_orders
    where id = p_po_id and org_id = p_org_id
    for update;
  if v_po_number is null then raise exception 'PO not found'; end if;
  if v_po_status = 'cancelled' then
    raise exception 'PO % sudah dibatalkan — buat PO baru untuk penerimaan ini', v_po_number;
  end if;

  for v_delta in select * from jsonb_array_elements(p_deltas) loop
    v_qty := (v_delta->>'delta')::numeric;
    select stock, cost_price into v_stock, v_cost from inventory_items
      where id = (v_delta->>'itemId')::uuid and org_id = p_org_id
      for update;
    -- Dulu baris ini dilewati diam-diam: PO jadi "Diterima Lengkap" dan uangnya
    -- keluar, tapi stoknya tak pernah bertambah.
    if not found then
      raise exception 'Barang di PO % sudah dihapus dari inventori — kembalikan barangnya atau batalkan PO ini', v_po_number;
    end if;
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

-- ---------- #3 batalkan PO ----------
create or replace function void_po(
  p_org_id uuid,
  p_po_id uuid,
  p_outlet_id uuid default null
) returns void
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_po purchase_orders%rowtype;
  v_line jsonb;
  v_exp record;
  v_stock integer;
  v_name text;
  v_qty numeric;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;

  select * into v_po from purchase_orders where id = p_po_id and org_id = p_org_id for update;
  if not found then raise exception 'PO not found'; end if;
  if v_po.status = 'cancelled' then return; end if;

  -- Pengeluarannya sudah masuk bulan lalu → laporan bulan itu sudah berjalan.
  perform 1 from expenses
    where po_id = p_po_id and org_id = p_org_id
      and date < date_trunc('month', current_date)::date;
  if found then
    raise exception 'Pengeluaran PO % sudah masuk bulan lalu — laporan bulan itu sudah berjalan. Catat pengembaliannya sebagai transaksi bulan ini.', v_po.po_number;
  end if;

  -- Stok dicek DULU untuk seluruh baris: membatalkan PO yang barangnya sudah
  -- terjual akan membuat stok minus, dan itu berbohong lebih parah daripada gagal.
  for v_line in select * from jsonb_array_elements(coalesce(v_po.lines, '[]'::jsonb)) loop
    v_qty := coalesce((v_line->>'receivedQty')::numeric, 0);
    continue when v_qty <= 0;
    select stock, name into v_stock, v_name from inventory_items
      where id = (v_line->>'itemId')::uuid and org_id = p_org_id
      for update;
    -- Barang sudah dihapus: tak ada stok yang perlu (atau bisa) dibalik.
    continue when v_stock is null;
    if v_stock < v_qty then
      raise exception 'Stok % tinggal % dari % yang diterima — sebagian sudah terpakai, jadi PO ini tidak bisa dibatalkan. Sesuaikan lewat koreksi stok di Inventori.',
        v_name, v_stock, v_qty;
    end if;
  end loop;

  for v_line in select * from jsonb_array_elements(coalesce(v_po.lines, '[]'::jsonb)) loop
    v_qty := coalesce((v_line->>'receivedQty')::numeric, 0);
    continue when v_qty <= 0;
    update inventory_items set stock = stock - v_qty, updated_at = now()
      where id = (v_line->>'itemId')::uuid and org_id = p_org_id;
  end loop;

  for v_exp in select id, amount, wallet_id from expenses
    where po_id = p_po_id and org_id = p_org_id
  loop
    if v_exp.wallet_id is not null then
      update wallets set balance = balance + v_exp.amount, updated_at = now()
        where id = v_exp.wallet_id and org_id = p_org_id;
    end if;
    delete from expenses where id = v_exp.id;
  end loop;

  update purchase_orders
    set lines = (
      select coalesce(jsonb_agg(jsonb_set(l, '{receivedQty}', '0'::jsonb)), '[]'::jsonb)
      from jsonb_array_elements(coalesce(v_po.lines, '[]'::jsonb)) l
    ),
    status = 'cancelled',
    received_at = null,
    updated_at = now()
    where id = p_po_id and org_id = p_org_id;
end;
$$;

-- ---------- #14 validasi baris PO (dipakai buat & ubah PO) ----------
-- Qty wajib bilangan bulat > 0 (stok kolom integer; "2,5 pcs" dulu dibulatkan
-- diam-diam saat barang diterima), harga beli tidak minus, dan nama barang
-- diambil dari inventori — bukan dari kiriman klien.
create or replace function po_lines_checked(p_org_id uuid, p_lines jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_line jsonb;
  v_item record;
  v_lines jsonb := '[]'::jsonb;
  v_found int := 0;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Tambahkan minimal 1 barang';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line->'qty') is distinct from 'number'
       or (v_line->>'qty')::numeric <= 0
       or (v_line->>'qty')::numeric <> trunc((v_line->>'qty')::numeric) then
      raise exception 'Qty barang harus bilangan bulat lebih dari 0';
    end if;
    if coalesce((v_line->>'costPrice')::numeric, 0) < 0 then
      raise exception 'Harga beli tidak boleh minus';
    end if;
  end loop;

  for v_item in
    select i.id, i.name, q.qty, q.cost, q.first_ord
    from (
      select (l->>'itemId')::uuid as item_id,
             sum((l->>'qty')::numeric) as qty,
             max(coalesce((l->>'costPrice')::numeric, 0)) as cost,
             min(ord) as first_ord
      from jsonb_array_elements(p_lines) with ordinality as t(l, ord)
      group by 1
    ) q
    join inventory_items i on i.id = q.item_id and i.org_id = p_org_id and i.deleted_at is null
    order by q.first_ord
  loop
    v_found := v_found + 1;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'itemId', v_item.id, 'name', v_item.name, 'qty', v_item.qty,
      'costPrice', v_item.cost, 'receivedQty', 0
    ));
  end loop;

  if v_found <> (select count(distinct l->>'itemId') from jsonb_array_elements(p_lines) l) then
    raise exception 'Barang tidak ditemukan di inventori';
  end if;
  return v_lines;
end;
$$;

-- ---------- #5/#12/#14 buat PO (nomor dari server) ----------
create or replace function create_purchase_order(
  p_org_id uuid,
  p_supplier_id uuid,
  p_lines jsonb,
  p_note text default '',
  p_outlet_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_id uuid;
  v_lines jsonb;
  v_seq int;
  v_po_number text;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;

  perform 1 from suppliers where id = p_supplier_id and org_id = p_org_id and deleted_at is null;
  if not found then raise exception 'Supplier tidak ditemukan'; end if;

  v_lines := po_lines_checked(p_org_id, p_lines);

  -- Nomor PO server-side (pola sama dengan process_sale 0069).
  perform pg_advisory_xact_lock(hashtext(p_org_id::text || ':po:PO'));
  select coalesce(max((regexp_replace(po_number, '^.*-', ''))::int), 0) + 1
    into v_seq
    from purchase_orders
    where org_id = p_org_id and po_number ~ '^PO-\d+$';
  v_po_number := 'PO-' || lpad(v_seq::text, 4, '0');

  insert into purchase_orders (org_id, outlet_id, po_number, supplier_id, status, lines, ordered_at, note)
  values (p_org_id, p_outlet_id, v_po_number, p_supplier_id, 'ordered', v_lines, current_date,
          coalesce(p_note, ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'poNumber', v_po_number);
end;
$$;

grant execute on function create_purchase_order(uuid, uuid, jsonb, text, uuid) to authenticated;

-- ---------- #11 perbaiki PO selama belum ada barang masuk ----------
create or replace function update_purchase_order(
  p_org_id uuid,
  p_po_id uuid,
  p_supplier_id uuid,
  p_lines jsonb,
  p_note text default ''
) returns void
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_po purchase_orders%rowtype;
  v_received numeric;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  select * into v_po from purchase_orders where id = p_po_id and org_id = p_org_id for update;
  if not found then raise exception 'PO not found'; end if;
  if v_po.status = 'cancelled' then raise exception 'PO yang dibatalkan tidak bisa diubah'; end if;

  select coalesce(sum((l->>'receivedQty')::numeric), 0) into v_received
    from jsonb_array_elements(coalesce(v_po.lines, '[]'::jsonb)) l;
  if v_received > 0 then
    raise exception 'PO % sudah menerima barang — batalkan PO lalu buat yang baru bila pesanannya berubah', v_po.po_number;
  end if;

  perform 1 from suppliers where id = p_supplier_id and org_id = p_org_id and deleted_at is null;
  if not found then raise exception 'Supplier tidak ditemukan'; end if;

  update purchase_orders
    set supplier_id = p_supplier_id,
        lines = po_lines_checked(p_org_id, p_lines),
        note = coalesce(p_note, ''),
        updated_at = now()
    where id = p_po_id and org_id = p_org_id;
end;
$$;

grant execute on function update_purchase_order(uuid, uuid, uuid, jsonb, text) to authenticated;
