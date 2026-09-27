-- ============================================================
-- 0091 — Tanggal transaksi keuangan dijaga (critique Keuangan, 27 Sep 2026)
--
-- record_finance_entry (0071) tidak pernah memanggil assert_open_month, dan tak
-- satu pun fungsi menolak tanggal masa depan. Terukur di demo:
--   * entri 15 Agustus diterima → laporan bulan lalu berubah diam-diam, dan
--     barisnya langsung terkunci (tak bisa diedit/dihapus);
--   * entri 10 Januari 2027 memotong saldo Tunai tetapi tidak tampil di buku kas
--     mana pun (jendela tarik berhenti di akhir bulan berjalan).
-- Saldo wallet ≠ buku kas yang terlihat. Sekarang tanggal catat/ubah wajib di
-- [awal bulan ini, hari ini] (Asia/Jakarta).
--
-- Juga: pemasukan manual berkategori Servis/Penjualan ditolak — pelunasan tiket
-- dan penjualan Kasir sudah mencatatnya sendiri (dobel hitung).
--
-- assert_open_month TIDAK diubah: ia juga menjaga hapus/batal baris lama, dan
-- baris masa depan yang sudah terlanjur ada harus tetap bisa dihapus.
-- ============================================================

create or replace function assert_entry_date(p_date date)
returns void
language plpgsql stable
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
begin
  perform assert_open_month(p_date, 'Transaksi');
  if p_date > current_date then
    raise exception 'Tanggal transaksi tidak boleh di masa depan';
  end if;
end;
$$;

create or replace function record_finance_entry(
  p_org_id uuid,
  p_kind text,
  p_date date,
  p_category text,
  p_amount numeric,
  p_wallet_id uuid,
  p_description text default '',
  p_outlet_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_id uuid;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  perform 1 from wallets where id = p_wallet_id and org_id = p_org_id;
  if not found then raise exception 'Wallet tidak ditemukan'; end if;
  perform assert_entry_date(coalesce(p_date, current_date));
  -- Pelunasan tiket & penjualan Kasir sudah mencatat pemasukannya sendiri;
  -- kategori ini dari Keuangan = dihitung dua kali.
  if p_kind = 'income' and p_category in ('Servis', 'Penjualan') then
    raise exception 'Pemasukan Servis dan Penjualan tercatat otomatis dari tiket dan Kasir — pilih kategori lain';
  end if;

  if p_kind = 'income' then
    insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, service_id)
    values (p_org_id, p_outlet_id, coalesce(p_date, current_date), p_category, p_amount,
            p_wallet_id, coalesce(p_description, ''), null)
    returning id into v_id;
    update wallets set balance = balance + p_amount, updated_at = now()
      where id = p_wallet_id and org_id = p_org_id;
  elsif p_kind = 'expense' then
    insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description)
    values (p_org_id, p_outlet_id, coalesce(p_date, current_date), p_category, p_amount,
            p_wallet_id, coalesce(p_description, ''))
    returning id into v_id;
    update wallets set balance = balance - p_amount, updated_at = now()
      where id = p_wallet_id and org_id = p_org_id;
  else
    raise exception 'Jenis transaksi tidak valid';
  end if;

  return v_id;
end;
$$;

grant execute on function record_finance_entry(uuid, text, date, text, numeric, uuid, text, uuid) to authenticated;

create or replace function update_finance_entry(
  p_org_id uuid,
  p_kind text,
  p_id uuid,
  p_date date,
  p_category text,
  p_amount numeric,
  p_wallet_id uuid,
  p_description text default ''
) returns void
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_inc incomes%rowtype;
  v_exp expenses%rowtype;
  v_old_wallet uuid;
  v_old_amount numeric;
  v_sign int;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  perform 1 from wallets where id = p_wallet_id and org_id = p_org_id;
  if not found then raise exception 'Wallet tidak ditemukan'; end if;
  perform assert_entry_date(coalesce(p_date, current_date));

  if p_kind = 'income' then
    select * into v_inc from incomes where id = p_id and org_id = p_org_id for update;
    if not found then raise exception 'Transaksi tidak ditemukan'; end if;
    if v_inc.service_id is not null or v_inc.sale_id is not null then
      raise exception 'Pemasukan ini berasal dari tiket servis atau penjualan. Ubah dari halaman asalnya.';
    end if;
    perform assert_open_month(v_inc.date, 'Transaksi');
    v_old_wallet := v_inc.wallet_id;
    v_old_amount := v_inc.amount;
    v_sign := 1;

    update incomes
      set date = coalesce(p_date, date), category = p_category, amount = p_amount,
          wallet_id = p_wallet_id, description = coalesce(p_description, ''), updated_at = now()
      where id = p_id and org_id = p_org_id;
  elsif p_kind = 'expense' then
    select * into v_exp from expenses where id = p_id and org_id = p_org_id for update;
    if not found then raise exception 'Transaksi tidak ditemukan'; end if;
    if v_exp.po_id is not null or v_exp.description like 'Modal servis %' then
      raise exception 'Pengeluaran ini terikat Purchase Order atau tiket servis. Ubah dari halaman asalnya.';
    end if;
    perform assert_open_month(v_exp.date, 'Transaksi');
    v_old_wallet := v_exp.wallet_id;
    v_old_amount := v_exp.amount;
    v_sign := -1;

    update expenses
      set date = coalesce(p_date, date), category = p_category, amount = p_amount,
          wallet_id = p_wallet_id, description = coalesce(p_description, ''), updated_at = now()
      where id = p_id and org_id = p_org_id;
  else
    raise exception 'Jenis transaksi tidak valid';
  end if;

  -- Saldo: tarik nilai lama dari wallet lama, terapkan nilai baru di wallet baru.
  update wallets set balance = balance - v_sign * v_old_amount, updated_at = now()
    where id = v_old_wallet and org_id = p_org_id;
  update wallets set balance = balance + v_sign * p_amount, updated_at = now()
    where id = p_wallet_id and org_id = p_org_id;
end;
$$;

grant execute on function update_finance_entry(uuid, text, uuid, date, text, numeric, uuid, text) to authenticated;
