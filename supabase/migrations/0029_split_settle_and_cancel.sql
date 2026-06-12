-- ============================================================
-- FixMaster — 0029: settle_service split-payment + cancel_service (RPC)
--
-- Latar: batch split-payment + cancel/refund-DP (live di produksi) menulis
-- LANGSUNG ke wallets/incomes/inventory_items dari klien. Setelah 0028 (RLS
-- per-outlet) tulisan itu manager-only (0010/0017) → KARYAWAN (kasir) tak bisa
-- melunasi servis (split) maupun membatalkan servis di cloud. Migrasi ini
-- memindahkan kedua alur itu ke RPC security-definer (atomik, aman) yang
-- memvalidasi keanggotaan + outlet, sejalan dengan process_sale (0025).
--
-- Perubahan:
--   A. settle_service: dari single-wallet → p_payments jsonb (array leg),
--      mirror process_sale. 1 income per leg (outlet di-stempel, service_id
--      diisi). Deskripsi income jadi 'Pelunasan servis <no>' (sebelumnya
--      'Pelunasan servis' tanpa nomor di 0025) agar koreksi final-cost &
--      pencocokan klien tetap cocok.
--   B. cancel_service (BARU): kembalikan stok inventory yang ter-deducted,
--      refund DP (balik saldo wallet + hapus income 'DP servis <no>'),
--      set status 'batal' + history, nolkan down_payment, flip deducted=false.
--
-- Prasyarat: 0023–0028 sudah ter-apply. Idempotent & additif (drop+create
-- fungsi; tak ada DROP kolom/tabel/data). Uji staging dulu.
-- ============================================================

-- ------------------------------------------------------------
-- A. settle_service — split payment (ganti tanda tangan single-wallet).
-- Drop dulu signature lama (0025) sebelum create dengan p_payments.
-- ------------------------------------------------------------
drop function if exists settle_service(uuid, uuid, uuid, numeric, jsonb, uuid);

create or replace function settle_service(
  p_org_id uuid,
  p_service_id uuid,
  p_payments jsonb,     -- [{walletId, amount}]
  p_history jsonb,
  p_outlet_id uuid default null
) returns void
language plpgsql security definer as $$
declare
  v_payment jsonb;
  v_service_no text;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;

  select service_no into v_service_no
    from services where id = p_service_id and org_id = p_org_id;
  if v_service_no is null then raise exception 'Service not found'; end if;

  update services
    set status = 'lunas', history = p_history, updated_at = now()
    where id = p_service_id and org_id = p_org_id;

  -- One income per split leg, each crediting its wallet. Empty/zero legs are
  -- skipped by the caller (normalizeSplits). DP-only settlement (0 legs) → no
  -- income booked (avoids double-count).
  for v_payment in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    update wallets
      set balance = balance + (v_payment->>'amount')::numeric, updated_at = now()
      where id = (v_payment->>'walletId')::uuid and org_id = p_org_id;
    insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, service_id)
    values (p_org_id, p_outlet_id, current_date, 'Servis', (v_payment->>'amount')::numeric,
            (v_payment->>'walletId')::uuid, 'Pelunasan servis ' || v_service_no, p_service_id);
  end loop;
end;
$$;
grant execute on function settle_service(uuid, uuid, jsonb, jsonb, uuid) to authenticated;

-- ------------------------------------------------------------
-- B. cancel_service (BARU) — pembatalan atomik oleh kasir.
-- Restore stok ter-deducted, refund DP, status 'batal', nolkan DP.
-- ------------------------------------------------------------
create or replace function cancel_service(
  p_org_id uuid,
  p_service_id uuid,
  p_history jsonb,
  p_outlet_id uuid default null
) returns void
language plpgsql security definer as $$
declare
  v_service services%rowtype;
  v_sp jsonb;
  v_dp record;
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

  -- 2) Refund DP: balik saldo wallet + hapus baris income 'DP servis <no>'.
  for v_dp in
    select id, wallet_id, amount from incomes
      where service_id = p_service_id and org_id = p_org_id
        and description = 'DP servis ' || v_service.service_no
  loop
    update wallets set balance = balance - v_dp.amount, updated_at = now()
      where id = v_dp.wallet_id and org_id = p_org_id;
    delete from incomes where id = v_dp.id;
  end loop;

  -- 3) Tulis service: status batal, history, DP=0, flip semua deducted=false.
  update services
    set status = 'batal',
        history = p_history,
        down_payment = 0,
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
grant execute on function cancel_service(uuid, uuid, jsonb, uuid) to authenticated;
