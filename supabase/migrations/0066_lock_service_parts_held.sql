-- ============================================================
-- FixMaster — 0066: stok yang "dipegang" tiket hanya berubah lewat RPC
--
-- Sisa celah 0064: `deducted` pada baris sparepart bisa diubah lewat update
-- biasa. Karyawan bisa menandai part "sudah dipotong" tanpa stok benar-benar
-- dipotong (atau membuat tiket yang langsung memegang stok), lalu memanggil
-- update_service_parts untuk "mengembalikan" stok yang tak pernah diambil —
-- stok inventori menggelembung.
--
-- Fix: trigger membandingkan stok yang dipegang tiket (qty baris inventori yang
-- `deducted`, per item) sebelum & sesudah. Bagi karyawan, perubahan itu hanya
-- boleh terjadi di dalam update_service_parts (penanda transaksi-lokal
-- `fixmaster.parts_rpc`). Owner/admin & service role tidak dibatasi — pembatalan
-- (cancel_service) sudah owner/admin-only sejak 0065.
-- ============================================================

create or replace function service_parts_held(p_parts jsonb)
returns jsonb
language sql immutable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb)
  from (
    select sp->>'itemId' as item_id, sum((sp->>'qty')::numeric) as qty
    from jsonb_array_elements(case when jsonb_typeof(p_parts) = 'array' then p_parts else '[]'::jsonb end) sp
    where coalesce((sp->>'deducted')::boolean, false)
      and coalesce(sp->>'kind', '') <> 'manual'
      and coalesce(sp->>'itemId', '') <> ''
    group by 1
  ) held;
$$;

create or replace function services_guard_parts_held()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or is_org_manager(new.org_id)
     or current_setting('fixmaster.parts_rpc', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Upsert klien (INSERT ... ON CONFLICT) menembakkan trigger INSERT juga untuk
    -- tiket yang sudah ada; baris itu diperiksa oleh cabang UPDATE.
    if service_parts_held(new.spareparts) <> '{}'::jsonb
       and not exists (select 1 from services where id = new.id) then
      raise exception 'Sparepart dari stok hanya bisa ditambahkan lewat halaman detail servis';
    end if;
  elsif service_parts_held(new.spareparts) is distinct from service_parts_held(old.spareparts) then
    raise exception 'Data sparepart tiket berubah di perangkat lain — muat ulang lalu coba lagi';
  end if;
  return new;
end;
$$;

drop trigger if exists services_guard_parts_held on services;
create trigger services_guard_parts_held
  before insert or update of spareparts on services
  for each row execute function services_guard_parts_held();

-- Sama dengan 0064, ditambah penanda yang meloloskan trigger di atas.
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
    order by 1 -- urutan tetap → dua transaksi tak saling deadlock
  loop
    update inventory_items
      set stock = stock + v_item.delta, updated_at = now()
      where id = v_item.item_id and org_id = p_org_id
        and stock + v_item.delta >= 0;
    if not found then
      select name, stock into v_name, v_stock
        from inventory_items where id = v_item.item_id and org_id = p_org_id;
      if v_name is null then raise exception 'Item inventory tidak ditemukan'; end if;
      raise exception 'Stok % hanya %, tidak cukup', v_name, v_stock;
    end if;
  end loop;

  -- Transaksi-lokal: hanya perubahan sparepart DI SINI yang lolos trigger 0066.
  perform set_config('fixmaster.parts_rpc', 'on', true);
  update services
    set spareparts = p_spareparts, updated_at = now()
    where id = p_service_id and org_id = p_org_id;
end;
$$;

grant execute on function update_service_parts(uuid, uuid, jsonb) to authenticated;
