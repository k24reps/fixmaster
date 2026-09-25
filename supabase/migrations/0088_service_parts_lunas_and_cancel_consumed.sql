-- ============================================================
-- FixMaster — 0088: sparepart tiket servis (audit 25 Sep 2026, paket B)
--
-- A. Perbaikan 0087: services_guard_integrity melewatkan semua RPC security
--    definer, sehingga penjagaan "Lunas/Batal hanya owner/admin" dari 0065 ikut
--    hilang untuk settle_service / cancel_service yang dipanggil karyawan langsung
--    lewat API (aplikasi sendiri tidak menampilkan tombolnya). RPC membawa
--    auth.uid() pemanggil, jadi cek peran ditaruh SEBELUM pintas current_user.
--
-- B. Tiket Lunas: sparepart yang sudah terpasang dan dibayar tidak bisa lagi
--    dikembalikan ke stok (hapus baris / kurangi qty). Menambah part tetap boleh.
--
-- C. Batal dengan part terpakai: cancel_service menerima indeks baris sparepart
--    yang TIDAK dikembalikan ke stok (terpasang di unit, rusak saat dipasang).
--    Baris itu tetap `deducted`, jadi terbaca "Terpakai" di tiket batal.
-- ============================================================

-- ---------- A ----------
create or replace function services_guard_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('lunas', 'batal')
     and auth.uid() is not null
     and not is_org_manager(new.org_id) then
    raise exception 'Hanya owner/admin yang bisa melunasi atau membatalkan tiket';
  end if;

  if current_user <> 'authenticated' then
    return new;
  end if;

  new.down_payment := old.down_payment;
  if old.status in ('lunas', 'batal') then
    new.final_cost := old.final_cost;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('lunas', 'batal') then
      raise exception 'Lunas dan Batal hanya lewat tombol pelunasan/pembatalan. Muat ulang halaman lalu coba lagi.';
    end if;
    if not (old.status, new.status) in (
      ('diterima', 'diagnosa'),
      ('diagnosa', 'konfirmasi'),
      ('konfirmasi', 'tunggu'), ('konfirmasi', 'pengerjaan'),
      ('tunggu', 'pengerjaan'),
      ('pengerjaan', 'selesai'),
      ('selesai', 'pengerjaan')
    ) then
      raise exception 'Status tiket sudah berubah di perangkat lain (sekarang %). Muat ulang halaman lalu coba lagi.', old.status;
    end if;
  end if;
  return new;
end;
$$;

-- ---------- B ----------
-- Sama dengan 0069, ditambah penolakan pengembalian stok untuk tiket Lunas.
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
    if v_service.status = 'lunas' and v_item.delta > 0 then
      raise exception 'Tiket sudah Lunas: sparepart yang terpasang tidak bisa dikembalikan ke stok';
    end if;
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

-- ---------- C ----------
-- Parameter baru → fungsi lama dibuang: dua versi berdampingan membuat panggilan
-- bernama 6 argumen jadi ambigu. Klien lama tetap jalan (p_keep_parts default).
drop function if exists cancel_service(uuid, uuid, jsonb, uuid, numeric, uuid);

create or replace function cancel_service(
  p_org_id uuid,
  p_service_id uuid,
  p_history jsonb,
  p_outlet_id uuid default null,
  p_refund_amount numeric default null,
  p_refund_wallet_id uuid default null,
  p_keep_parts int[] default null
) returns void
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_service services%rowtype;
  v_sp jsonb;
  v_i int;
  v_keep int[] := coalesce(p_keep_parts, '{}');
  v_refund numeric := coalesce(p_refund_amount, 0);
  v_wallet_balance numeric;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  select * into v_service from services
    where id = p_service_id and org_id = p_org_id
    for update;
  if not found then raise exception 'Service not found'; end if;
  if not can_use_outlet(p_org_id, v_service.outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if v_service.status = 'lunas' then
    raise exception 'Tiket yang sudah Lunas tidak bisa dibatalkan';
  end if;

  if v_refund < 0 then raise exception 'Nominal refund tidak boleh negatif'; end if;
  if v_refund > coalesce(v_service.down_payment, 0) then
    raise exception 'Refund melebihi DP yang diterima';
  end if;
  -- 'batal' diterima untuk klien lama (status disimpan dulu), tapi refund
  -- yang sudah dibukukan tidak boleh diulang.
  if v_refund > 0 and v_service.status = 'batal' and exists (
    select 1 from expenses
    where org_id = p_org_id and description = 'Refund DP servis ' || v_service.service_no
  ) then
    raise exception 'Refund DP tiket ini sudah dicatat';
  end if;

  -- Indeks 0-based milik baris sparepart tiket yang dikunci di atas.
  foreach v_i in array v_keep loop
    v_sp := v_service.spareparts -> v_i;
    if v_sp is null
       or not coalesce((v_sp->>'deducted')::boolean, false)
       or coalesce(v_sp->>'kind', '') = 'manual'
       or coalesce(v_sp->>'itemId', '') = '' then
      raise exception 'Daftar sparepart tiket berubah — muat ulang lalu coba lagi';
    end if;
  end loop;

  -- Stok dikembalikan untuk baris `deducted` yang tidak ditandai terpakai; baris
  -- itu dibalik ke false, jadi pembatalan ulang tidak mengembalikan dua kali.
  for v_sp, v_i in
    select t.sp, (t.i - 1)::int
    from jsonb_array_elements(coalesce(v_service.spareparts, '[]'::jsonb)) with ordinality as t(sp, i)
  loop
    if coalesce((v_sp->>'deducted')::boolean, false)
       and coalesce(v_sp->>'itemId', '') <> ''
       and not (v_i = any(v_keep)) then
      update inventory_items
        set stock = stock + (v_sp->>'qty')::int, updated_at = now()
        where id = (v_sp->>'itemId')::uuid and org_id = p_org_id;
    end if;
  end loop;

  if v_refund > 0 then
    if p_refund_wallet_id is null then raise exception 'Wallet refund wajib dipilih'; end if;
    select balance into v_wallet_balance
      from wallets where id = p_refund_wallet_id and org_id = p_org_id for update;
    if v_wallet_balance is null then raise exception 'Wallet refund tidak ditemukan'; end if;
    if v_wallet_balance < v_refund then raise exception 'Saldo wallet refund tidak cukup'; end if;

    update wallets set balance = balance - v_refund, updated_at = now()
      where id = p_refund_wallet_id and org_id = p_org_id;
    insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description)
    values (p_org_id, v_service.outlet_id, current_date, 'Lainnya', v_refund,
            p_refund_wallet_id, 'Refund DP servis ' || v_service.service_no);
  end if;

  update services
    set status = 'batal',
        history = p_history,
        spareparts = (
          select coalesce(jsonb_agg(
            case when coalesce((sp->>'deducted')::boolean, false) and not ((i - 1)::int = any(v_keep))
                 then jsonb_set(sp, '{deducted}', 'false'::jsonb)
                 else sp end
            order by i
          ), '[]'::jsonb)
          from jsonb_array_elements(coalesce(v_service.spareparts, '[]'::jsonb)) with ordinality as t(sp, i)
        ),
        updated_at = now()
    where id = p_service_id and org_id = p_org_id;
end;
$$;

revoke all on function cancel_service(uuid, uuid, jsonb, uuid, numeric, uuid, int[]) from public, anon;
grant execute on function cancel_service(uuid, uuid, jsonb, uuid, numeric, uuid, int[]) to authenticated;
