-- ============================================================
-- FixMaster — 0061: integritas uang & nomor tiket servis
--
-- Temuan audit Dashboard & Servis:
--
--  1) Pelunasan/pembatalan tidak atomik. Klien menyimpan status Lunas/Batal
--     LEBIH DULU, baru memanggil RPC uang. Bila RPC gagal (koneksi, langganan,
--     outlet), tiket tertinggal Lunas tanpa pemasukan atau Batal tanpa stok
--     kembali/refund — dan tak bisa diulang karena statusnya terminal.
--     Fix: settle_service menerima p_final_cost dan menulis status + biaya final
--     + riwayat + uang dalam satu transaksi; klien baru tidak lagi menyimpan
--     status lebih dulu (cancel_service sudah menulis status sendiri).
--
--  2) RPC uang tidak memeriksa status tiket dan memercayai nominal klien:
--     settle bisa dipanggil dua kali (pemasukan ganda), total pembayaran tak
--     dicocokkan dengan sisa tagihan, cancel bisa membatalkan tiket Lunas, DP
--     bisa dicatat ke tiket Lunas/Batal.
--     Fix: kunci baris tiket (FOR UPDATE), validasi status, hitung sisa tagihan
--     di server, tolak pelunasan/refund yang sudah pernah dibukukan.
--
--     KOMPATIBEL dengan klien lama (yang menyimpan status dulu): settle masih
--     menerima status 'lunas' dan cancel masih menerima 'batal', ASALKAN
--     pelunasan/refund-nya belum pernah tercatat. Jadi migrasi ini boleh
--     mendahului deploy frontend tanpa merusak pelunasan.
--
--  3) Nomor servis dihitung klien dari daftar yang terfilter outlet & tanpa
--     tiket terhapus, sedangkan unique(org_id, service_no) berlaku org-wide →
--     "Gagal menyimpan servis" di toko multi-outlet / dua kasir bersamaan.
--     Fix: trigger BEFORE INSERT (security definer, melihat semua outlet)
--     memberi nomor berikutnya bila usulan klien bentrok, di bawah advisory
--     lock per (org, prefix). Nomor tidak bisa diubah setelah dibuat, supaya
--     upsert dari klien yang masih memegang nomor usulan lama tak menimpanya.
--
-- Juga: overload settle_service lama dari 0003 (5 argumen) tidak pernah
-- di-drop — tanpa cek langganan/outlet/nominal negatif. Dibuang di sini.
--
-- Hak akses tidak berubah: RPC tetap boleh dipanggil anggota org (tier 3B).
-- ============================================================

drop function if exists settle_service(uuid, uuid, uuid, numeric, jsonb);
drop function if exists cancel_service(uuid, uuid, jsonb, uuid);
-- Signature settle_service berubah (+p_final_cost): drop lalu buat ulang.
drop function if exists settle_service(uuid, uuid, jsonb, jsonb, uuid);

-- ------------------------------------------------------------
-- settle_service: atomik, tervalidasi, tidak bisa dua kali.
-- ------------------------------------------------------------
create or replace function settle_service(
  p_org_id uuid,
  p_service_id uuid,
  p_payments jsonb,
  p_history jsonb,
  p_outlet_id uuid default null,
  p_final_cost numeric default null
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_service services%rowtype;
  v_payment jsonb;
  v_amount numeric;
  v_total numeric := 0;
  v_final numeric;
  v_due numeric;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  -- Kunci baris: dua pelunasan bersamaan diantrikan; yang kedua melihat hasil yang pertama.
  select * into v_service from services
    where id = p_service_id and org_id = p_org_id
    for update;
  if not found then raise exception 'Service not found'; end if;
  if not can_use_outlet(p_org_id, v_service.outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;

  -- Hanya dari Selesai. 'lunas' diterima untuk klien lama yang menyimpan status
  -- lebih dulu, tapi pelunasan yang sudah dibukukan tidak boleh diulang.
  if v_service.status not in ('selesai', 'lunas') then
    raise exception 'Tiket harus berstatus Selesai untuk dilunasi';
  end if;
  if exists (
    select 1 from incomes
    where org_id = p_org_id and service_id = p_service_id
      and description = 'Pelunasan servis ' || v_service.service_no
  ) then
    raise exception 'Tiket ini sudah dilunasi';
  end if;
  if v_service.status = 'lunas' and p_final_cost is not null
     and p_final_cost <> coalesce(v_service.final_cost, 0) then
    raise exception 'Tiket sudah Lunas; ubah biaya lewat Koreksi Biaya';
  end if;
  if p_final_cost is not null and p_final_cost < 0 then
    raise exception 'Biaya final tidak valid';
  end if;

  -- Sisa tagihan dihitung di server, bukan dipercaya dari klien.
  v_final := coalesce(p_final_cost, v_service.final_cost, 0);
  v_due := greatest(0, v_final - coalesce(v_service.down_payment, 0));
  for v_payment in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    v_amount := (v_payment->>'amount')::numeric;
    if v_amount is null or v_amount < 0 then
      raise exception 'Nominal pembayaran tidak valid';
    end if;
    v_total := v_total + v_amount;
  end loop;
  if v_total <> v_due then
    raise exception 'Total pembayaran (%) harus sama dengan sisa tagihan (%)', v_total, v_due;
  end if;

  update services
    set status = 'lunas', final_cost = v_final, history = p_history, updated_at = now()
    where id = p_service_id and org_id = p_org_id;

  for v_payment in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    v_amount := (v_payment->>'amount')::numeric;
    continue when v_amount = 0;
    update wallets
      set balance = balance + v_amount, updated_at = now()
      where id = (v_payment->>'walletId')::uuid and org_id = p_org_id;
    if not found then raise exception 'Wallet tidak ditemukan'; end if;
    insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, service_id)
    values (p_org_id, v_service.outlet_id, current_date, 'Servis', v_amount,
            (v_payment->>'walletId')::uuid, 'Pelunasan servis ' || v_service.service_no, p_service_id);
  end loop;
end;
$$;

grant execute on function settle_service(uuid, uuid, jsonb, jsonb, uuid, numeric) to authenticated;

-- ------------------------------------------------------------
-- record_down_payment: tolak tiket Lunas/Batal.
-- ------------------------------------------------------------
create or replace function record_down_payment(
  p_org_id uuid,
  p_service_id uuid,
  p_wallet_id uuid,
  p_amount numeric,
  p_outlet_id uuid default null
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_service services%rowtype;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal DP harus lebih dari 0'; end if;

  select * into v_service from services
    where id = p_service_id and org_id = p_org_id
    for update;
  if not found then raise exception 'Service not found'; end if;
  if not can_use_outlet(p_org_id, v_service.outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if v_service.status in ('lunas', 'batal') then
    raise exception 'DP tidak bisa dicatat untuk tiket yang sudah Lunas atau Batal';
  end if;

  update wallets set balance = balance + p_amount, updated_at = now()
    where id = p_wallet_id and org_id = p_org_id;
  if not found then raise exception 'Wallet tidak ditemukan'; end if;

  insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, service_id)
  values (p_org_id, v_service.outlet_id, current_date, 'Servis', p_amount, p_wallet_id,
          'DP servis ' || v_service.service_no, p_service_id);

  update services set down_payment = down_payment + p_amount, updated_at = now()
    where id = p_service_id and org_id = p_org_id;
end;
$$;

-- ------------------------------------------------------------
-- cancel_service: tolak tiket Lunas; refund tidak bisa dua kali.
-- ------------------------------------------------------------
create or replace function cancel_service(
  p_org_id uuid,
  p_service_id uuid,
  p_history jsonb,
  p_outlet_id uuid default null,
  p_refund_amount numeric default null,
  p_refund_wallet_id uuid default null
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_service services%rowtype;
  v_sp jsonb;
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

  -- Stok hanya dikembalikan untuk baris yang masih `deducted`; baris itu lalu
  -- dibalik ke false, jadi pembatalan ulang tidak mengembalikan stok dua kali.
  for v_sp in select * from jsonb_array_elements(coalesce(v_service.spareparts, '[]'::jsonb)) loop
    if coalesce((v_sp->>'deducted')::boolean, false)
       and coalesce(v_sp->>'itemId', '') <> '' then
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
            case when coalesce((sp->>'deducted')::boolean, false)
                 then jsonb_set(sp, '{deducted}', 'false'::jsonb)
                 else sp end
          ), '[]'::jsonb)
          from jsonb_array_elements(coalesce(v_service.spareparts, '[]'::jsonb)) sp
        ),
        updated_at = now()
    where id = p_service_id and org_id = p_org_id;
end;
$$;

-- ------------------------------------------------------------
-- Nomor servis: dijaga server.
-- ------------------------------------------------------------
create or replace function services_assign_service_no()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix text;
  v_next bigint;
begin
  if tg_op = 'UPDATE' then
    -- Nomor tidak berubah setelah dibuat.
    new.service_no := old.service_no;
    return new;
  end if;

  -- Upsert baris yang sudah ada juga memicu BEFORE INSERT; biarkan jalur UPDATE-nya.
  if exists (select 1 from services where id = new.id) then
    return new;
  end if;

  v_prefix := regexp_replace(new.service_no, '-[0-9]+$', '');
  -- Antrikan pembuatan tiket per (org, prefix) sampai transaksi selesai, lalu
  -- periksa bentrok terhadap SEMUA outlet dan tiket terhapus.
  perform pg_advisory_xact_lock(hashtext(new.org_id::text || ':service:' || v_prefix));
  if not exists (
    select 1 from services where org_id = new.org_id and service_no = new.service_no
  ) then
    return new;
  end if;

  select coalesce(max(substr(service_no, length(v_prefix) + 2)::bigint), 0) + 1
    into v_next
    from services
    where org_id = new.org_id
      and left(service_no, length(v_prefix) + 1) = v_prefix || '-'
      and substr(service_no, length(v_prefix) + 2) ~ '^[0-9]+$';
  new.service_no := v_prefix || '-' || lpad(v_next::text, greatest(4, length(v_next::text)), '0');
  return new;
end;
$$;

drop trigger if exists services_assign_service_no on services;
create trigger services_assign_service_no
  before insert on services
  for each row execute function services_assign_service_no();

drop trigger if exists services_keep_service_no on services;
create trigger services_keep_service_no
  before update of service_no on services
  for each row execute function services_assign_service_no();
