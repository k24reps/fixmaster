-- ============================================================
-- FixMaster — 0030: record_down_payment (RPC)
--
-- Latar: penerimaan DP (uang muka) di StatusModal masih menulis LANGSUNG ke
-- incomes + wallets + services dari klien (`repository.put`) — satu-satunya
-- jalur billing yang belum dipindah ke RPC (POS→process_sale 0025, lunas→
-- settle_service 0029, batal→cancel_service 0029). Akibatnya di cloud:
--   - kasir KARYAWAN terblokir RLS 0028 (wallets/incomes write = manager-only
--     0010), gagal "menyimpan DP";
--   - insert income klien membawa field `deletedAt` yang TAK ada sebagai kolom
--     → insert tetap berisiko gagal walau pemanggil manager.
--
-- Migrasi ini menambah RPC security-definer (atomik, aman) yang: insert income
-- 'DP servis <no>' (cocok dengan refund batal di cancel_service 0029), kredit
-- wallet, dan menambah down_payment service. Validasi keanggotaan + outlet
-- (can_use_outlet, 0025). Mendukung DP bertahap (cicilan) karena menambah,
-- bukan menimpa.
--
-- Prasyarat: 0023–0029. Idempotent & additif (create or replace, RPC only).
-- ============================================================

create or replace function record_down_payment(
  p_org_id uuid,
  p_service_id uuid,
  p_wallet_id uuid,
  p_amount numeric,
  p_outlet_id uuid default null
) returns void
language plpgsql security definer as $$
declare
  v_service_no text;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if p_amount <= 0 then raise exception 'Nominal DP harus lebih dari 0'; end if;

  select service_no into v_service_no
    from services where id = p_service_id and org_id = p_org_id;
  if v_service_no is null then raise exception 'Service not found'; end if;

  -- Income tagged to the service's outlet; description MUST match the form
  -- used by cancel_service (0029) refund matching: 'DP servis <no>'.
  insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, service_id)
  values (p_org_id, p_outlet_id, current_date, 'Servis', p_amount, p_wallet_id,
          'DP servis ' || v_service_no, p_service_id);

  update wallets set balance = balance + p_amount, updated_at = now()
    where id = p_wallet_id and org_id = p_org_id;

  -- Accumulate (supports multiple/partial DPs), do not overwrite.
  update services set down_payment = down_payment + p_amount, updated_at = now()
    where id = p_service_id and org_id = p_org_id;
end;
$$;
grant execute on function record_down_payment(uuid, uuid, uuid, numeric, uuid) to authenticated;
