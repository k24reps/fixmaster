-- ============================================================
-- FixMaster — 0064: sparepart servis & klaim garansi atomik
--
-- Temuan audit #13: stok sparepart servis dipotong klien dengan menulis ulang
-- baris inventori dari cache (`stock: cache - qty`) — penjualan kasir yang
-- bersamaan bisa tertimpa. Selain itu tulis inventori manager-only (0017), jadi
-- karyawan gagal menambah sparepart dengan pesan "langganan" yang menyesatkan.
-- Fix: update_service_parts menulis daftar sparepart DAN selisih stoknya dalam
-- satu transaksi. Selisih dihitung server dari baris inventori yang `deducted`
-- (lama vs baru), `stock = stock + delta` per baris terkunci, ditolak bila stok
-- kurang.
--
-- Temuan #12 & #16: klaim garansi ditulis klien dalam beberapa langkah; karyawan
-- berhasil membuat tiket klaim lalu gagal di pengeluaran kerugian (manager-only),
-- dan klaim ganda untuk tiket asli yang sama tidak dicegah.
-- Fix: create_warranty_claim — tiket klaim, catatan di tiket asli, dan kerugian
-- garansi (opsional) dalam satu transaksi; ditolak bila klaim lain untuk tiket
-- asli yang sama belum Lunas/Batal. Tiket asli dikunci, jadi dua klaim bersamaan
-- diantrikan.
-- ============================================================

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

  -- Stok yang "dipegang" tiket = qty baris inventori yang sudah dipotong.
  -- ponytail: klien masih bisa mengubah `deducted` lewat update biasa (sama
  -- seperti sebelum 0064 untuk cancel_service); kunci dengan trigger bila perlu.
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

  update services
    set spareparts = p_spareparts, updated_at = now()
    where id = p_service_id and org_id = p_org_id;
end;
$$;

grant execute on function update_service_parts(uuid, uuid, jsonb) to authenticated;

create or replace function create_warranty_claim(
  p_org_id uuid,
  p_origin_id uuid,
  p_service_no text,
  p_complaint text,
  p_by text,
  p_by_name text,
  p_loss_amount numeric default 0,
  p_loss_wallet_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_origin services%rowtype;
  v_open text;
  v_until date;
  v_loss numeric := coalesce(p_loss_amount, 0);
  v_balance numeric;
  v_claim_id uuid;
  v_claim_no text;
  v_now text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if coalesce(trim(p_complaint), '') = '' then raise exception 'Jelaskan keluhan klaim garansi'; end if;

  select * into v_origin from services
    where id = p_origin_id and org_id = p_org_id
    for update;
  if not found then raise exception 'Service not found'; end if;
  if not can_use_outlet(p_org_id, v_origin.outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if v_origin.status <> 'lunas' or v_origin.warranty_claim_of is not null then
    raise exception 'Tiket ini tidak bisa diklaim garansi';
  end if;
  v_until := greatest(v_origin.warranty_service_until::date, v_origin.warranty_parts_until::date);
  if v_until is null or v_until < (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Masa garansi tiket ini sudah habis';
  end if;

  select service_no into v_open from services
    where org_id = p_org_id and warranty_claim_of = p_origin_id and deleted_at is null
      and status not in ('lunas', 'batal')
    limit 1;
  if v_open is not null then
    raise exception 'Klaim % untuk tiket ini masih berjalan', v_open;
  end if;

  if v_loss < 0 then raise exception 'Nominal kerugian tidak valid'; end if;
  if v_loss > 0 then
    if p_loss_wallet_id is null then raise exception 'Pilih wallet sumber biaya garansi'; end if;
    select balance into v_balance from wallets
      where id = p_loss_wallet_id and org_id = p_org_id
      for update;
    if v_balance is null then raise exception 'Wallet tidak ditemukan'; end if;
    if v_balance < v_loss then raise exception 'Saldo wallet tidak cukup'; end if;
  end if;

  -- Nomor usulan klien; trigger 0061 menggantinya bila bentrok.
  insert into services (
    org_id, outlet_id, service_no, customer_id, customer_name, customer_phone,
    category, device, complaint, accessories, status, technician_id, technician_name,
    estimate_cost, final_cost, down_payment, spareparts, picked_up, warranty_claim_of,
    archived, history
  ) values (
    p_org_id, v_origin.outlet_id, p_service_no, v_origin.customer_id, v_origin.customer_name,
    v_origin.customer_phone, v_origin.category, v_origin.device, trim(p_complaint),
    v_origin.accessories, 'diterima', v_origin.technician_id, v_origin.technician_name,
    0, 0, 0, '[]'::jsonb, false, p_origin_id, false,
    jsonb_build_array(jsonb_build_object(
      'at', v_now, 'status', 'diterima', 'by', coalesce(p_by, ''), 'byName', coalesce(p_by_name, ''),
      'note', 'Klaim garansi dari ' || v_origin.service_no, 'internal', false
    ))
  )
  returning id, service_no into v_claim_id, v_claim_no;

  update services
    set history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'at', v_now, 'status', 'edit', 'by', coalesce(p_by, ''), 'byName', coalesce(p_by_name, ''),
          'note', 'Klaim garansi dibuka → ' || v_claim_no, 'internal', false
        )),
        updated_at = now()
    where id = p_origin_id and org_id = p_org_id;

  if v_loss > 0 then
    update wallets set balance = balance - v_loss, updated_at = now()
      where id = p_loss_wallet_id and org_id = p_org_id;
    insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description)
    values (p_org_id, v_origin.outlet_id, current_date, 'Garansi', v_loss, p_loss_wallet_id,
            'Kerugian garansi ' || v_claim_no || ' (asli ' || v_origin.service_no || ')');
  end if;

  return jsonb_build_object('id', v_claim_id, 'serviceNo', v_claim_no);
end;
$$;

grant execute on function create_warranty_claim(uuid, uuid, text, text, text, text, numeric, uuid) to authenticated;
