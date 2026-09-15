-- ============================================================
-- FixMaster — 0062: refund kelebihan DP saat pelunasan
--
-- Temuan audit #4: biaya final boleh lebih kecil dari DP, dan kelebihannya
-- hilang tanpa catatan — sisa tagihan dijepit 0, tidak ada refund.
-- (Contoh: DP 300.000, biaya final 250.000 → 50.000 milik pelanggan tak tercatat.)
--
-- Fix: settle_service menerima refund kelebihan DP (p_refund_amount,
-- p_refund_wallet_id) dan membukukannya di TRANSAKSI YANG SAMA dengan status,
-- biaya final, riwayat, dan pemasukan (lanjutan 0061). Model sama dengan refund
-- DP saat pembatalan (0031): income DP tetap, refund dicatat sebagai pengeluaran
-- ('Refund kelebihan DP servis <no>'); sisa yang tidak dikembalikan jadi
-- pendapatan toko.
--
-- Guard: refund 0..kelebihan, wallet dikunci & saldo cukup, dan refund kelebihan
-- untuk tiket yang sama tidak bisa dicatat dua kali.
--
-- Parameter baru ber-default null, jadi panggilan 0061 (tanpa refund) tetap cocok.
-- ============================================================

drop function if exists settle_service(uuid, uuid, jsonb, jsonb, uuid, numeric);

create or replace function settle_service(
  p_org_id uuid,
  p_service_id uuid,
  p_payments jsonb,
  p_history jsonb,
  p_outlet_id uuid default null,
  p_final_cost numeric default null,
  p_refund_amount numeric default null,
  p_refund_wallet_id uuid default null
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
  v_excess numeric;
  v_refund numeric := coalesce(p_refund_amount, 0);
  v_wallet_balance numeric;
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

  -- Sisa tagihan & kelebihan DP dihitung di server, bukan dipercaya dari klien.
  v_final := coalesce(p_final_cost, v_service.final_cost, 0);
  v_due := greatest(0, v_final - coalesce(v_service.down_payment, 0));
  v_excess := greatest(0, coalesce(v_service.down_payment, 0) - v_final);

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

  if v_refund < 0 then raise exception 'Nominal refund tidak boleh negatif'; end if;
  if v_refund > v_excess then
    raise exception 'Refund melebihi kelebihan DP (%)', v_excess;
  end if;
  if v_refund > 0 then
    if exists (
      select 1 from expenses
      where org_id = p_org_id and description = 'Refund kelebihan DP servis ' || v_service.service_no
    ) then
      raise exception 'Refund kelebihan DP tiket ini sudah dicatat';
    end if;
    if p_refund_wallet_id is null then raise exception 'Wallet refund wajib dipilih'; end if;
    select balance into v_wallet_balance
      from wallets where id = p_refund_wallet_id and org_id = p_org_id for update;
    if v_wallet_balance is null then raise exception 'Wallet refund tidak ditemukan'; end if;
    if v_wallet_balance < v_refund then raise exception 'Saldo wallet refund tidak cukup'; end if;
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

  if v_refund > 0 then
    update wallets set balance = balance - v_refund, updated_at = now()
      where id = p_refund_wallet_id and org_id = p_org_id;
    insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description)
    values (p_org_id, v_service.outlet_id, current_date, 'Lainnya', v_refund,
            p_refund_wallet_id, 'Refund kelebihan DP servis ' || v_service.service_no);
  end if;
end;
$$;

grant execute on function settle_service(uuid, uuid, jsonb, jsonb, uuid, numeric, numeric, uuid) to authenticated;
