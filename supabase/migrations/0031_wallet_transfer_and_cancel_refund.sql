-- ============================================================
-- FixMaster — 0031: transfer_wallet (RPC) + cancel_service refund parsial
--
-- A. transfer_wallet (BARU): pindah saldo antar wallet dalam satu org,
--    atomik & manager-only (wallet = manager-only sejak 0016). TIDAK membuat
--    income/expense — transfer bukan untung/rugi, jadi tak mendistorsi laporan.
--
-- B. cancel_service (RECREATE): ubah dari refund-penuh-otomatis → refund PILIHAN
--    (parsial). Model akuntansi baru:
--      - Income 'DP servis <no>' DIPERTAHANKAN (uang memang pernah masuk — audit utuh).
--      - Bila p_refund_amount > 0: catat EXPENSE 'Refund DP servis <no>' dari wallet
--        refund + kurangi saldo wallet itu. Sisa yang ditahan toko otomatis jadi
--        pendapatan bersih (DP_income - refund_expense).
--      - Stok ter-deducted tetap di-restore; status → 'batal'; deducted → false.
--    (Sebelumnya 0029 menghapus income DP + reverse wallet penuh.)
--
-- Prasyarat: 0023–0030 sudah ter-apply. Idempotent & additif (drop+create fungsi;
-- tak ada DROP kolom/tabel/data). Uji staging dulu.
-- ============================================================

-- ------------------------------------------------------------
-- A. transfer_wallet — pindah saldo antar wallet (manager-only).
-- ------------------------------------------------------------
create or replace function transfer_wallet(
  p_org_id uuid,
  p_from_wallet_id uuid,
  p_to_wallet_id uuid,
  p_amount numeric
) returns void
language plpgsql security definer as $$
declare
  v_from_balance numeric;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if p_from_wallet_id = p_to_wallet_id then
    raise exception 'Wallet asal & tujuan sama';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Nominal harus lebih dari 0';
  end if;

  -- Lock wallet asal & validasi saldo + kepemilikan org.
  select balance into v_from_balance
    from wallets where id = p_from_wallet_id and org_id = p_org_id for update;
  if v_from_balance is null then raise exception 'Wallet asal tidak ditemukan'; end if;
  if v_from_balance < p_amount then raise exception 'Saldo tidak cukup'; end if;

  -- Pastikan wallet tujuan milik org yang sama.
  perform 1 from wallets where id = p_to_wallet_id and org_id = p_org_id;
  if not found then raise exception 'Wallet tujuan tidak ditemukan'; end if;

  update wallets set balance = balance - p_amount, updated_at = now()
    where id = p_from_wallet_id and org_id = p_org_id;
  update wallets set balance = balance + p_amount, updated_at = now()
    where id = p_to_wallet_id and org_id = p_org_id;
end;
$$;
grant execute on function transfer_wallet(uuid, uuid, uuid, numeric) to authenticated;

-- ------------------------------------------------------------
-- B. cancel_service — recreate dengan refund parsial (model expense).
-- Drop signature lama (0029) sebelum create dengan param refund baru.
-- ------------------------------------------------------------
drop function if exists cancel_service(uuid, uuid, jsonb, uuid);

create or replace function cancel_service(
  p_org_id uuid,
  p_service_id uuid,
  p_history jsonb,
  p_outlet_id uuid default null,
  p_refund_amount numeric default null,
  p_refund_wallet_id uuid default null
) returns void
language plpgsql security definer as $$
declare
  v_service services%rowtype;
  v_sp jsonb;
  v_refund numeric := coalesce(p_refund_amount, 0);
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;

  select * into v_service from services where id = p_service_id and org_id = p_org_id;
  if not found then raise exception 'Service not found'; end if;

  -- 1) Kembalikan stok untuk tiap sparepart inventory yang sudah ter-deducted.
  for v_sp in select * from jsonb_array_elements(coalesce(v_service.spareparts, '[]'::jsonb)) loop
    if coalesce((v_sp->>'deducted')::boolean, false)
       and coalesce(v_sp->>'itemId', '') <> '' then
      update inventory_items
        set stock = stock + (v_sp->>'qty')::int, updated_at = now()
        where id = (v_sp->>'itemId')::uuid and org_id = p_org_id;
    end if;
  end loop;

  -- 2) Refund DP PARSIAL (opsional): catat expense + kurangi wallet refund.
  --    Income 'DP servis <no>' SENGAJA dipertahankan (audit utuh); sisa yang
  --    ditahan toko otomatis jadi pendapatan bersih.
  if v_refund > 0 then
    if p_refund_wallet_id is null then raise exception 'Wallet refund wajib dipilih'; end if;
    update wallets set balance = balance - v_refund, updated_at = now()
      where id = p_refund_wallet_id and org_id = p_org_id;
    if not found then raise exception 'Wallet refund tidak ditemukan'; end if;
    insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description)
    values (p_org_id, p_outlet_id, current_date, 'Lainnya', v_refund,
            p_refund_wallet_id, 'Refund DP servis ' || v_service.service_no);
  end if;

  -- 3) Tulis service: status batal, history, flip semua deducted=false.
  --    down_payment dibiarkan apa adanya (income DP tetap tercatat).
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
grant execute on function cancel_service(uuid, uuid, jsonb, uuid, numeric, uuid) to authenticated;
