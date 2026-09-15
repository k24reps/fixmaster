-- ============================================================
-- FixMaster — 0063: koreksi biaya atomik + ringkasan servis di server
--
-- Temuan audit #5: Koreksi Biaya menghapus semua pemasukan 'Pelunasan servis'
-- lalu membukukan ulang tertanggal HARI INI (pendapatan bulan lalu pindah ke
-- bulan ini), ditulis klien langkah demi langkah sehingga bisa gagal setengah.
-- Fix: correct_service_cost membukukan SELISIHNYA saja, hari ini, dalam satu
-- transaksi: biaya naik → pemasukan, turun → pengeluaran (refund) dari wallet
-- yang dipilih. Pelunasan lama tidak disentuh.
--
-- Temuan #10 & #11: angka menu Servis/Dashboard dihitung dari daftar yang
-- dipotong 1000 tiket terbaru, dan papan teknisi sepanjang masa, per nama,
-- termasuk tiket belum dibayar & klaim garansi. service_summary menghitung dari
-- SEMUA tiket (security invoker → RLS cabang tetap berlaku). Performa teknisi =
-- tiket yang selesai dikerjakan dalam rentang, per technician_id, nilainya hanya
-- dari yang Lunas, tanpa klaim garansi.
-- ============================================================

create or replace function correct_service_cost(
  p_org_id uuid,
  p_service_id uuid,
  p_final_cost numeric,
  p_wallet_id uuid,
  p_history jsonb
) returns numeric
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_service services%rowtype;
  v_delta numeric;
  v_balance numeric;
  v_desc text;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  select * into v_service from services
    where id = p_service_id and org_id = p_org_id
    for update;
  if not found then raise exception 'Service not found'; end if;
  if not can_use_outlet(p_org_id, v_service.outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if v_service.status <> 'lunas' then
    raise exception 'Koreksi biaya hanya untuk tiket Lunas';
  end if;
  if p_final_cost is null or p_final_cost < 0 then
    raise exception 'Biaya final tidak valid';
  end if;

  v_delta := p_final_cost - coalesce(v_service.final_cost, 0);
  if v_delta = 0 then return 0; end if;

  if p_wallet_id is null then raise exception 'Wallet wajib dipilih'; end if;
  select balance into v_balance from wallets
    where id = p_wallet_id and org_id = p_org_id
    for update;
  if v_balance is null then raise exception 'Wallet tidak ditemukan'; end if;
  if v_delta < 0 and v_balance < -v_delta then
    raise exception 'Saldo wallet tidak cukup untuk mengembalikan selisih';
  end if;

  v_desc := 'Koreksi biaya servis ' || v_service.service_no;

  update services
    set final_cost = p_final_cost, history = p_history, updated_at = now()
    where id = p_service_id and org_id = p_org_id;
  update wallets
    set balance = balance + v_delta, updated_at = now()
    where id = p_wallet_id and org_id = p_org_id;

  if v_delta > 0 then
    insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, service_id)
    values (p_org_id, v_service.outlet_id, current_date, 'Servis', v_delta, p_wallet_id, v_desc, p_service_id);
  else
    insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description)
    values (p_org_id, v_service.outlet_id, current_date, 'Lainnya', -v_delta, p_wallet_id, v_desc);
  end if;

  return v_delta;
end;
$$;

grant execute on function correct_service_cost(uuid, uuid, numeric, uuid, jsonb) to authenticated;

create or replace function service_summary(
  p_org_id uuid,
  p_outlet_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  with scoped as (
    -- Sama dengan daftar di aplikasi: cabang aktif + baris tanpa cabang.
    select * from services
    where org_id = p_org_id
      and deleted_at is null
      and (p_outlet_id is null or outlet_id = p_outlet_id or outlet_id is null)
  ),
  done as (
    select
      coalesce(s.technician_id::text, s.technician_name) as tech_key,
      s.technician_name,
      s.status,
      coalesce(s.final_cost, 0) as final_cost,
      -- Selesai dikerjakan = entri riwayat Selesai/Lunas pertama.
      coalesce(
        (select min((h->>'at')::timestamptz)
           from jsonb_array_elements(
             case when jsonb_typeof(s.history) = 'array' then s.history else '[]'::jsonb end
           ) h
          where h->>'status' in ('selesai', 'lunas')),
        s.updated_at
      ) as done_at
    from scoped s
    where s.status in ('selesai', 'lunas')
      and s.warranty_claim_of is null
      and coalesce(s.technician_name, '') <> ''
      -- Riwayat hanya bertambah lewat update, jadi tiket yang tak berubah sejak
      -- sebelum rentang pasti selesai sebelum rentang — tak perlu dibuka riwayatnya.
      and s.updated_at >= p_from
  ),
  board as (
    select
      tech_key,
      (array_agg(technician_name order by done_at desc))[1] as name,
      count(*) as completed,
      coalesce(sum(final_cost) filter (where status = 'lunas'), 0) as revenue
    from done
    where done_at >= p_from and done_at < p_to
    group by tech_key
    order by completed desc, revenue desc
    limit 5
  )
  select jsonb_build_object(
    'total', count(*),
    'unfinished', count(*) filter (where status not in ('selesai', 'lunas', 'batal')),
    'in_process', count(*) filter (where status not in ('selesai', 'lunas', 'batal', 'diterima')),
    'confirmation', count(*) filter (where status = 'konfirmasi'),
    'awaiting_pickup', count(*) filter (
      where not coalesce(picked_up, false) and status in ('selesai', 'lunas', 'batal')
    ),
    'done', count(*) filter (where status in ('selesai', 'lunas')),
    'lunas_value', coalesce(sum(final_cost) filter (where status = 'lunas'), 0),
    'units_in', count(*) filter (where created_at >= p_from and created_at < p_to),
    'leaderboard', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('key', tech_key, 'name', name, 'completed', completed, 'revenue', revenue)
          order by completed desc, revenue desc
        ),
        '[]'::jsonb
      )
      from board
    )
  )
  from scoped
  where not coalesce(archived, false);
$$;

grant execute on function service_summary(uuid, uuid, timestamptz, timestamptz) to authenticated;
