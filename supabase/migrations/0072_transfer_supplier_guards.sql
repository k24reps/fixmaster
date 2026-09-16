-- ============================================================
-- FixMaster — 0072: sisa audit Supplier & Keuangan
--
--  #16  transfer_wallet: cek langganan aktif (toko kedaluwarsa masih bisa
--       memindahkan saldo) + search_path dikunci seperti fungsi lain.
--  #15  Manager boleh membaca baris transfer di log aktivitas. Transfer tidak
--       punya tabel sendiri, jadi log itulah satu-satunya jejaknya — dan
--       admin selama ini melihat tab Transfer kosong.
--  #17  Supplier yang punya purchase order tidak bisa dihapus: PO lamanya akan
--       kehilangan nama supplier (tampil "—").
--  #18  No. telepon supplier unik per toko (dinormalkan 0/62), seperti
--       pelanggan di 0069.
-- ============================================================

-- ---------- #16 transfer_wallet ----------
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
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if p_from_wallet_id = p_to_wallet_id then
    raise exception 'Wallet asal & tujuan sama';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Nominal harus lebih dari 0';
  end if;

  -- Kunci wallet asal & validasi saldo + kepemilikan org.
  select balance into v_from_balance
    from wallets where id = p_from_wallet_id and org_id = p_org_id for update;
  if v_from_balance is null then raise exception 'Wallet asal tidak ditemukan'; end if;
  if v_from_balance < p_amount then raise exception 'Saldo tidak cukup'; end if;

  perform 1 from wallets where id = p_to_wallet_id and org_id = p_org_id;
  if not found then raise exception 'Wallet tujuan tidak ditemukan'; end if;

  update wallets set balance = balance - p_amount, updated_at = now()
    where id = p_from_wallet_id and org_id = p_org_id;
  update wallets set balance = balance + p_amount, updated_at = now()
    where id = p_to_wallet_id and org_id = p_org_id;
end;
$$;

-- ---------- #15 manager boleh melihat jejak transfer ----------
-- Log aktivitas tetap milik owner; SATU pengecualian: baris transfer saldo,
-- karena transfer tak membukukan baris kas mana pun, jadi tanpa ini Buku Kas
-- seorang admin menyembunyikan perpindahan uang yang benar-benar terjadi.
drop policy if exists activity_select on activity_logs;
create policy activity_select on activity_logs for select
  using (
    is_org_owner(org_id)
    or (is_org_manager(org_id) and action = 'wallet.transfer')
  );

-- ---------- #17 supplier dengan PO tidak bisa dihapus ----------
create or replace function suppliers_block_delete_with_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_po int;
begin
  select count(*) into v_po from purchase_orders
    where org_id = old.org_id and supplier_id = old.id;
  if v_po > 0 then
    raise exception
      'Supplier "%" punya % purchase order — menghapusnya membuat riwayat PO itu kehilangan nama supplier. Perbarui datanya saja.',
      old.name, v_po;
  end if;
  return old;
end;
$$;

drop trigger if exists suppliers_block_delete_with_history on suppliers;
create trigger suppliers_block_delete_with_history
  before delete on suppliers
  for each row execute function suppliers_block_delete_with_history();

-- ---------- #18 No. telepon supplier unik per toko ----------
create or replace function suppliers_unique_phone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_norm text := normalize_phone(new.phone);
  v_name text;
begin
  if v_norm = '' or new.deleted_at is not null then return new; end if;
  -- Upsert klien juga menembakkan trigger INSERT untuk baris yang sudah ada.
  if tg_op = 'INSERT' and exists (select 1 from suppliers where id = new.id) then return new; end if;
  -- Nomor tidak berubah: data ganda lama tidak menghalangi edit lain.
  if tg_op = 'UPDATE' and normalize_phone(old.phone) = v_norm then return new; end if;

  select name into v_name from suppliers
    where org_id = new.org_id and id <> new.id and deleted_at is null
      and normalize_phone(phone) = v_norm
    limit 1;
  if v_name is not null then
    raise exception 'No. telepon sudah terdaftar atas supplier "%"', v_name;
  end if;
  return new;
end;
$$;

drop trigger if exists suppliers_unique_phone on suppliers;
create trigger suppliers_unique_phone
  before insert or update of phone on suppliers
  for each row execute function suppliers_unique_phone();
