-- ============================================================
-- FixMaster — 0093: tiket Lunas & DP yang ditahan saat batal (28 Sep 2026)
--
-- A. update_service_parts: sparepart tiket Lunas hanya boleh diubah
--    owner/admin. Karyawan dulu bisa menambah part ke tiket yang sudah
--    dibayar, sehingga profitnya turun diam-diam. Isi fungsi disalin utuh
--    dari 0088 bagian B; hanya satu penjaga yang ditambahkan.
--
-- B. category_profit (Laba servis di Dashboard & Laporan): tiket batal ikut
--    bila uangnya tertinggal di toko. DP yang ditahan (DP − refund "Refund DP
--    servis <no>") jadi pendapatan; modal dadakan dan part yang tetap
--    terpakai jadi biaya. Tidak menambah jumlah unit — unitnya tidak selesai.
--    Cermin profitByDeviceCategory() di aplikasi.
--
-- Forward-only, tanpa perubahan struktur tabel.
-- ============================================================

-- ---------- A ----------
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
  -- 0093: tiket Lunas sudah dibayar — menambah part/modal di sana mengubah
  -- profit tiket yang sudah ditutup, jadi hanya owner/admin (koreksi).
  if v_service.status = 'lunas' and not is_org_manager(p_org_id) then
    raise exception 'Tiket sudah Lunas: hanya owner/admin yang bisa mengubah sparepartnya';
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

-- ---------- B ----------
create or replace function category_profit(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_outlet_id uuid default null
) returns table (
  category text,
  units bigint,
  revenue numeric,
  profit numeric
)
language sql stable security invoker
set search_path = public, pg_temp
as $$
  with done as (
    select
      coalesce(nullif(trim(s.category), ''), 'Lainnya') as category,
      coalesce(s.final_cost, 0) as final_cost,
      -- Modal tiket = seluruh baris biaya (sparepart inventori + biaya
      -- dadakan), cermin serviceProfit() di aplikasi.
      coalesce((
        select sum(coalesce((sp->>'qty')::numeric, 0) * coalesce((sp->>'costPrice')::numeric, 0))
        from jsonb_array_elements(
          case when jsonb_typeof(s.spareparts) = 'array' then s.spareparts else '[]'::jsonb end
        ) sp
      ), 0) as cost,
      coalesce(
        (select min((h->>'at')::timestamptz)
           from jsonb_array_elements(
             case when jsonb_typeof(s.history) = 'array' then s.history else '[]'::jsonb end
           ) h
          where h->>'status' in ('selesai', 'lunas')),
        s.updated_at
      ) as done_at
    from services s
    where s.org_id = p_org_id
      and s.deleted_at is null
      and s.status in ('selesai', 'lunas')
      and (p_outlet_id is null or s.outlet_id = p_outlet_id or s.outlet_id is null)
      -- Riwayat hanya bertambah lewat update: tiket yang tak tersentuh sejak
      -- sebelum rentang pasti selesai sebelum rentang (pola sama dgn 0063).
      and s.updated_at >= p_from
  ),
  cancelled as (
    select
      coalesce(nullif(trim(s.category), ''), 'Lainnya') as category,
      greatest(0, coalesce(s.down_payment, 0) - coalesce((
        select sum(e.amount) from expenses e
         where e.org_id = s.org_id and e.deleted_at is null
           and e.description = 'Refund DP servis ' || s.service_no
      ), 0)) as kept,
      -- Hanya biaya yang tetap ditanggung: modal dadakan + part yang tidak
      -- kembali ke rak (deducted), cermin heldCost().
      coalesce((
        select sum(coalesce((sp->>'qty')::numeric, 0) * coalesce((sp->>'costPrice')::numeric, 0))
        from jsonb_array_elements(
          case when jsonb_typeof(s.spareparts) = 'array' then s.spareparts else '[]'::jsonb end
        ) sp
        where sp->>'kind' = 'manual' or coalesce((sp->>'deducted')::boolean, false)
      ), 0) as cost,
      coalesce(
        (select max((h->>'at')::timestamptz)
           from jsonb_array_elements(
             case when jsonb_typeof(s.history) = 'array' then s.history else '[]'::jsonb end
           ) h
          where h->>'status' = 'batal'),
        s.updated_at
      ) as done_at
    from services s
    where s.org_id = p_org_id
      and s.deleted_at is null
      and s.status = 'batal'
      and (p_outlet_id is null or s.outlet_id = p_outlet_id or s.outlet_id is null)
      and s.updated_at >= p_from
  ),
  ticket_rows as (
    select category, 1 as unit, final_cost as revenue, final_cost - cost as profit
      from done where done_at >= p_from and done_at < p_to
    union all
    select category, 0, kept, kept - cost
      from cancelled
     where done_at >= p_from and done_at < p_to and (kept > 0 or cost > 0)
  )
  select category, sum(unit)::bigint, sum(revenue), sum(profit)
  from ticket_rows
  group by category
  order by 4 desc;
$$;
grant execute on function category_profit(uuid, timestamptz, timestamptz, uuid) to authenticated;
