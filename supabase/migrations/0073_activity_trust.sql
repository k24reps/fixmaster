-- ============================================================
-- FixMaster — 0073: jejak audit yang bisa dipercaya
--
--  #4  Log aktivitas bisa dipalsukan siapa pun: aturan tulisnya cuma
--      "anggota toko", sedangkan nama pelaku, peran, aksi, dan waktu semuanya
--      dikirim dari browser. Sekarang pelakunya DITETAPKAN server dari sesi
--      yang memanggil — baris atas nama orang lain tidak mungkin lagi dibuat.
--
--  #5  Tindakan di server tidak mencatat dirinya sendiri: log ditulis browser
--      SETELAH RPC berhasil, jadi jaringan yang putus di detik itu menghapus
--      jejaknya, dan perubahan lewat REST langsung tidak pernah tercatat.
--      Empat peristiwa uang paling berat kini dicatat oleh database sendiri:
--      pembatalan penjualan, pembatalan PO, penghapusan transaksi keuangan,
--      dan transfer saldo.
-- ============================================================

-- ---------- #4 pelaku log ditetapkan server ----------
create or replace function activity_stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member memberships%rowtype;
begin
  -- Fungsi server (security definer) menulis lewat fm_log dengan identitas
  -- yang sudah ia pastikan sendiri, jadi hanya penulisan dari aplikasi
  -- (role authenticated) yang distempel ulang di sini.
  if current_user <> 'authenticated' then return new; end if;

  select * into v_member from memberships
    where user_id = auth.uid() and org_id = new.org_id;
  if not found then raise exception 'Forbidden'; end if;

  new.actor_id := v_member.id;
  new.actor_name := v_member.name;
  new.actor_role := v_member.role;
  -- Waktu kejadian juga milik server: jam perangkat tidak menentukan urutan
  -- peristiwa di jejak audit.
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists activity_stamp_actor on activity_logs;
create trigger activity_stamp_actor
  before insert on activity_logs
  for each row execute function activity_stamp_actor();

-- ---------- #5 database mencatat peristiwa uang sendiri ----------
-- Dipanggil trigger di bawah DAN oleh transfer_wallet. Pelakunya diambil dari
-- sesi pemanggil; kalau tidak ada (skrip service-role, pemulihan data), baris
-- tetap dicatat sebagai 'Sistem' alih-alih hilang.
create or replace function fm_log(
  p_org_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_label text,
  p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member memberships%rowtype;
begin
  select * into v_member from memberships
    where user_id = auth.uid() and org_id = p_org_id;

  insert into activity_logs (org_id, actor_id, actor_name, actor_role, action,
                             entity_type, entity_id, entity_label, meta)
  values (p_org_id, v_member.id, coalesce(v_member.name, 'Sistem'), v_member.role,
          p_action, p_entity_type, p_entity_id, coalesce(p_label, ''),
          coalesce(p_meta, '{}'::jsonb));
end;
$$;

-- Penjualan dibatalkan (lewat RPC maupun REST langsung).
create or replace function sales_log_void()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(old.voided, false) = false and coalesce(new.voided, false) = true then
    perform fm_log(new.org_id, 'sale.void', 'sale', new.id::text, new.sale_no,
                   jsonb_build_object('total', new.total, 'reason', coalesce(new.voided_reason, '')));
  end if;
  return new;
end;
$$;

drop trigger if exists sales_log_void on sales;
create trigger sales_log_void
  after update of voided on sales
  for each row execute function sales_log_void();

-- PO dibatalkan.
create or replace function po_log_void()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status is distinct from 'cancelled'::po_status and new.status = 'cancelled'::po_status then
    perform fm_log(new.org_id, 'po.void', 'purchaseOrder', new.id::text, new.po_number,
                   jsonb_build_object('poId', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists po_log_void on purchase_orders;
create trigger po_log_void
  after update of status on purchase_orders
  for each row execute function po_log_void();

-- Transaksi keuangan dihapus. Dicatat SETELAH baris hilang, jadi nominal dan
-- keterangannya tetap terbaca di jejak meski datanya sudah tidak ada.
create or replace function incomes_log_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform fm_log(old.org_id, 'income.delete', 'income', old.id::text,
                 coalesce(nullif(old.description, ''), old.category),
                 jsonb_build_object('amount', old.amount, 'category', old.category, 'date', old.date));
  return old;
end;
$$;

drop trigger if exists incomes_log_delete on incomes;
create trigger incomes_log_delete
  after delete on incomes
  for each row execute function incomes_log_delete();

create or replace function expenses_log_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform fm_log(old.org_id, 'expense.delete', 'expense', old.id::text,
                 coalesce(nullif(old.description, ''), old.category),
                 jsonb_build_object('amount', old.amount, 'category', old.category, 'date', old.date));
  return old;
end;
$$;

drop trigger if exists expenses_log_delete on expenses;
create trigger expenses_log_delete
  after delete on expenses
  for each row execute function expenses_log_delete();

-- ---------- transfer saldo mencatat dirinya sendiri ----------
-- Transfer tidak membukukan baris kas apa pun, jadi log inilah satu-satunya
-- jejaknya (lihat 0072). Karena itu ia tidak boleh bergantung pada browser
-- yang masih hidup sesudah RPC-nya selesai.
create or replace function transfer_wallet(
  p_org_id uuid,
  p_from_wallet_id uuid,
  p_to_wallet_id uuid,
  p_amount numeric
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_from_balance numeric;
  v_from_name text;
  v_to_name text;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if p_from_wallet_id = p_to_wallet_id then
    raise exception 'Wallet asal & tujuan sama';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Nominal harus lebih dari 0';
  end if;

  select balance, name into v_from_balance, v_from_name
    from wallets where id = p_from_wallet_id and org_id = p_org_id for update;
  if v_from_balance is null then raise exception 'Wallet asal tidak ditemukan'; end if;
  if v_from_balance < p_amount then raise exception 'Saldo tidak cukup'; end if;

  select name into v_to_name from wallets where id = p_to_wallet_id and org_id = p_org_id;
  if v_to_name is null then raise exception 'Wallet tujuan tidak ditemukan'; end if;

  update wallets set balance = balance - p_amount, updated_at = now()
    where id = p_from_wallet_id and org_id = p_org_id;
  update wallets set balance = balance + p_amount, updated_at = now()
    where id = p_to_wallet_id and org_id = p_org_id;

  perform fm_log(p_org_id, 'wallet.transfer', 'wallet', p_from_wallet_id::text,
                 v_from_name || ' → ' || v_to_name,
                 jsonb_build_object('amount', p_amount, 'toWalletId', p_to_wallet_id));
end;
$$;

revoke all on function fm_log(uuid, text, text, text, text, jsonb) from public;
