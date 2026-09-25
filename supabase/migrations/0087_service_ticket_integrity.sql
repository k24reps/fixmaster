-- ============================================================
-- FixMaster — 0087: integritas tiket servis (audit 25 Sep 2026, paket A)
--
-- A. Modal Dadakan lewat RPC atomik. Dulu browser menulis saldo wallet dulu,
--    lalu pengeluaran, lalu baris tiket — tiga tulisan terpisah, saldo dihitung
--    dari cache browser. Edit nominal/wallet bahkan SELALU gagal di langkah
--    kedua (expenses_guard_linked, 0071) setelah saldo terlanjur bergeser.
--
-- B. Penjaga baris tiket untuk tulisan langsung dari aplikasi (role
--    authenticated). Klien mengirim baris penuh dari salinan yang bisa basi,
--    jadi DP yang masuk di perangkat lain ikut tertimpa ke nilai lama.
--    RPC security definer berjalan sebagai pemilik fungsi (current_user bukan
--    'authenticated'), jadi settle/cancel/DP/koreksi/hapus-entri tetap bebas —
--    pola yang sama dengan inventory_guard_stock.
--      - down_payment hanya berubah lewat RPC (nilai dari klien diabaikan).
--      - final_cost tiket Lunas/Batal hanya berubah lewat RPC.
--      - status mengikuti TRANSITIONS di lib/business/services.ts; Lunas & Batal
--        hanya lewat settle_service / cancel_service. Menggantikan
--        services_guard_final_status (0065) yang hanya menjaga karyawan.
--
-- C. Stok yang dipegang tiket (spareparts `deducted`) hanya berubah lewat RPC
--    untuk SEMUA peran. 0066 membebaskan owner/admin, padahal salinan basi
--    mereka sama berbahayanya.
-- ============================================================

-- ---------- B. penjaga baris tiket ----------
create or replace function services_guard_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
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

drop trigger if exists services_guard_final_status on services;
drop function if exists services_guard_final_status();

drop trigger if exists services_guard_integrity on services;
create trigger services_guard_integrity
  before update on services
  for each row execute function services_guard_integrity();

-- ---------- C. stok tiket hanya lewat RPC, semua peran ----------
create or replace function services_guard_parts_held()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'authenticated'
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

-- ---------- A. Modal Dadakan ----------
create or replace function add_service_modal(
  p_org_id uuid,
  p_service_id uuid,
  p_name text,
  p_amount numeric,
  p_wallet_id uuid
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_svc services%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if v_name = '' then raise exception 'Isi keterangan modal'; end if;
  if coalesce(p_amount, 0) <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'Nominal modal harus rupiah bulat lebih dari 0';
  end if;

  select * into v_svc from services where id = p_service_id and org_id = p_org_id for update;
  if not found then raise exception 'Tiket servis tidak ditemukan'; end if;
  if not can_use_outlet(p_org_id, v_svc.outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if v_svc.status = 'batal' then raise exception 'Tiket yang dibatalkan tidak bisa diubah'; end if;

  update wallets set balance = balance - p_amount, updated_at = now()
    where id = p_wallet_id and org_id = p_org_id;
  if not found then raise exception 'Wallet tidak ditemukan'; end if;

  insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description)
  values (p_org_id, v_svc.outlet_id, current_date, 'Sparepart', p_amount, p_wallet_id,
          'Modal servis ' || v_svc.service_no || ' — ' || v_name)
  returning id into v_id;

  update services
    set spareparts = coalesce(spareparts, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'itemId', null, 'name', v_name, 'qty', 1, 'costPrice', p_amount, 'sellPrice', 0,
          'deducted', false, 'kind', 'manual', 'expenseId', v_id, 'walletId', p_wallet_id)),
        updated_at = now()
    where id = p_service_id;
  return v_id;
end;
$$;

create or replace function update_service_modal(
  p_org_id uuid,
  p_service_id uuid,
  p_expense_id uuid,
  p_name text,
  p_amount numeric,
  p_wallet_id uuid
) returns void
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_svc services%rowtype;
  v_exp expenses%rowtype;
  v_has_exp boolean;
  v_name text := btrim(coalesce(p_name, ''));
  v_money boolean;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if v_name = '' then raise exception 'Isi keterangan modal'; end if;
  if coalesce(p_amount, 0) <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'Nominal modal harus rupiah bulat lebih dari 0';
  end if;

  select * into v_svc from services where id = p_service_id and org_id = p_org_id for update;
  if not found then raise exception 'Tiket servis tidak ditemukan'; end if;
  if not can_use_outlet(p_org_id, v_svc.outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if v_svc.status = 'batal' then raise exception 'Tiket yang dibatalkan tidak bisa diubah'; end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_svc.spareparts, '[]'::jsonb)) sp
    where sp->>'kind' = 'manual' and sp->>'expenseId' = p_expense_id::text
  ) then
    raise exception 'Baris modal tidak ditemukan — muat ulang lalu coba lagi';
  end if;

  select * into v_exp from expenses where id = p_expense_id and org_id = p_org_id for update;
  v_has_exp := found;
  -- Pengeluarannya sudah dihapus dari Keuangan (saldo sudah dikembalikan di sana):
  -- nilai baru dibukukan ulang sebagai pengeluaran hari ini.
  v_money := not v_has_exp or v_exp.amount <> p_amount or v_exp.wallet_id <> p_wallet_id;
  if v_has_exp and v_money then
    perform assert_open_month(v_exp.date, 'Modal servis');
  end if;

  if v_money then
    perform wallet_transfer_lock(p_org_id, array[p_wallet_id, v_exp.wallet_id]);
    perform 1 from wallets where id = p_wallet_id and org_id = p_org_id;
    if not found then raise exception 'Wallet tidak ditemukan'; end if;
    if v_has_exp then
      update wallets set balance = balance + v_exp.amount, updated_at = now()
        where id = v_exp.wallet_id and org_id = p_org_id;
    end if;
    update wallets set balance = balance - p_amount, updated_at = now()
      where id = p_wallet_id and org_id = p_org_id;
  end if;

  if v_has_exp then
    update expenses
      set amount = p_amount, wallet_id = p_wallet_id,
          description = 'Modal servis ' || v_svc.service_no || ' — ' || v_name, updated_at = now()
      where id = p_expense_id;
  else
    insert into expenses (id, org_id, outlet_id, date, category, amount, wallet_id, description)
    values (p_expense_id, p_org_id, v_svc.outlet_id, current_date, 'Sparepart', p_amount, p_wallet_id,
            'Modal servis ' || v_svc.service_no || ' — ' || v_name);
  end if;

  update services
    set spareparts = (
          select jsonb_agg(
            case when sp->>'kind' = 'manual' and sp->>'expenseId' = p_expense_id::text
                 then sp || jsonb_build_object('name', v_name, 'costPrice', p_amount, 'walletId', p_wallet_id)
                 else sp end
            order by i)
          from jsonb_array_elements(v_svc.spareparts) with ordinality as t(sp, i)
        ),
        updated_at = now()
    where id = p_service_id;
end;
$$;

create or replace function remove_service_modal(
  p_org_id uuid,
  p_service_id uuid,
  p_expense_id uuid
) returns void
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_svc services%rowtype;
  v_exp expenses%rowtype;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  select * into v_svc from services where id = p_service_id and org_id = p_org_id for update;
  if not found then raise exception 'Tiket servis tidak ditemukan'; end if;
  if not can_use_outlet(p_org_id, v_svc.outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if v_svc.status = 'batal' then raise exception 'Tiket yang dibatalkan tidak bisa diubah'; end if;

  select * into v_exp from expenses where id = p_expense_id and org_id = p_org_id for update;
  if found then
    perform assert_open_month(v_exp.date, 'Modal servis');
    delete from expenses where id = p_expense_id;
    update wallets set balance = balance + v_exp.amount, updated_at = now()
      where id = v_exp.wallet_id and org_id = p_org_id;
  end if;

  update services
    set spareparts = coalesce((
          select jsonb_agg(sp order by i)
          from jsonb_array_elements(v_svc.spareparts) with ordinality as t(sp, i)
          where not (sp->>'kind' = 'manual' and sp->>'expenseId' = p_expense_id::text)
        ), '[]'::jsonb),
        updated_at = now()
    where id = p_service_id;
end;
$$;

revoke all on function add_service_modal(uuid, uuid, text, numeric, uuid) from public, anon;
revoke all on function update_service_modal(uuid, uuid, uuid, text, numeric, uuid) from public, anon;
revoke all on function remove_service_modal(uuid, uuid, uuid) from public, anon;
grant execute on function add_service_modal(uuid, uuid, text, numeric, uuid) to authenticated;
grant execute on function update_service_modal(uuid, uuid, uuid, text, numeric, uuid) to authenticated;
grant execute on function remove_service_modal(uuid, uuid, uuid) to authenticated;
