-- ============================================================
-- FixMaster — 0065: Lunas/Batal owner/admin-only di database +
--                   klaim garansi per bagian
--
-- A. Aplikasi hanya mengizinkan owner/admin memindahkan tiket ke Lunas atau
--    Batal, tapi database tidak: karyawan bisa memanggil settle_service /
--    cancel_service langsung, bahkan meng-update `status` biasa lewat REST.
--    Trigger ini menutup SEMUA jalur sekaligus — RPC security definer tetap
--    membawa auth.uid() pemanggil, jadi RPC-nya ikut tertolak tanpa ditulis
--    ulang. Service role (auth.uid() null: backup/restore, skrip admin) lolos.
--
-- B. Klaim garansi sekarang memilih BAGIAN yang diklaim (jasa dan/atau part),
--    dan hanya bagian yang garansinya masih berlaku. Server memvalidasi ulang
--    tiap bagian terhadap tiket asli (tanggal dihitung server, bukan dipercaya
--    dari klien) dan menyimpannya di kolom `claimed_items` tiket klaim.
-- ============================================================

create or replace function services_guard_final_status()
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
  return new;
end;
$$;

drop trigger if exists services_guard_final_status on services;
create trigger services_guard_final_status
  before update of status on services
  for each row execute function services_guard_final_status();

alter table services add column if not exists claimed_items jsonb;

drop function if exists create_warranty_claim(uuid, uuid, text, text, text, text, numeric, uuid);

create or replace function create_warranty_claim(
  p_org_id uuid,
  p_origin_id uuid,
  p_service_no text,
  p_complaint text,
  p_by text,
  p_by_name text,
  p_loss_amount numeric default 0,
  p_loss_wallet_id uuid default null,
  p_claimed_items jsonb default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_origin services%rowtype;
  v_open text;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_it jsonb;
  v_item_name text;
  v_item_until date;
  v_items jsonb := '[]'::jsonb;
  v_loss numeric := coalesce(p_loss_amount, 0);
  v_balance numeric;
  v_claim_id uuid;
  v_claim_no text;
  v_now text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if coalesce(trim(p_complaint), '') = '' then raise exception 'Jelaskan keluhan klaim garansi'; end if;
  if jsonb_typeof(p_claimed_items) is distinct from 'array' or jsonb_array_length(p_claimed_items) = 0 then
    raise exception 'Pilih bagian yang diklaim';
  end if;

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

  -- Tiap bagian divalidasi terhadap tiket asli. Part dengan garansi per part
  -- (warrantyDays, 0060) memakai tanggalnya sendiri; part lama memakai tanggal
  -- garansi part tiket.
  for v_it in select * from jsonb_array_elements(p_claimed_items) loop
    if v_it->>'kind' = 'service' then
      v_item_name := 'Jasa servis';
      v_item_until := v_origin.warranty_service_until::date;
    else
      select sp->>'name',
             case when jsonb_typeof(sp->'warrantyDays') = 'number'
                  then nullif(sp->>'warrantyUntil', '')::date
                  else v_origin.warranty_parts_until::date end
        into v_item_name, v_item_until
        from jsonb_array_elements(coalesce(v_origin.spareparts, '[]'::jsonb)) sp
        where sp->>'name' = v_it->>'name'
        order by 2 desc nulls last
        limit 1;
    end if;
    if v_item_until is null or v_item_until < v_today then
      raise exception 'Garansi % sudah habis atau tidak ada', coalesce(v_it->>'name', 'bagian ini');
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', case when v_it->>'kind' = 'service' then 'service' else 'part' end,
      'name', v_item_name,
      'until', v_item_until
    ));
  end loop;

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
    claimed_items, archived, history
  ) values (
    p_org_id, v_origin.outlet_id, p_service_no, v_origin.customer_id, v_origin.customer_name,
    v_origin.customer_phone, v_origin.category, v_origin.device, trim(p_complaint),
    v_origin.accessories, 'diterima', v_origin.technician_id, v_origin.technician_name,
    0, 0, 0, '[]'::jsonb, false, p_origin_id, v_items, false,
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

grant execute on function create_warranty_claim(uuid, uuid, text, text, text, text, numeric, uuid, jsonb) to authenticated;
