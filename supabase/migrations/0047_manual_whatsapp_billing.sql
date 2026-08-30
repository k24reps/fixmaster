-- ============================================================
-- FixMaster — 0047: pembayaran langganan manual via WhatsApp
--
-- Klien hanya mengirim permintaan + bukti bayar melalui WhatsApp. Masa aktif
-- berubah SETELAH admin platform memverifikasi uangnya lewat satu RPC yang:
--   1. membuat invoice paid (provider = manual_whatsapp),
--   2. memperpanjang expiry dari tanggal yang paling akhir,
--   3. mencatat operator, nominal, referensi, dan alasan ke audit trail.
--
-- Jalur self-service/mock dan GoPay dinonaktifkan. Migrasi historis 0043-0046
-- tidak diubah; keputusan ini diterapkan secara forward-only.
-- ============================================================

-- Invoice terbuka dari eksperimen gateway lama tidak boleh lagi terlihat
-- sebagai tagihan yang masih bisa dibayar.
update invoices
set status = 'canceled'
where status = 'pending';

-- Riwayat billing menjadi read-only bagi tenant. Insert/update hanya boleh
-- terjadi di RPC operator security-definer di bawah.
drop policy if exists invoices_manage on invoices;

drop index if exists uq_invoices_gopay_open_amount;
drop function if exists admin_unpaid_gopay();
drop function if exists claim_gopay_payment(numeric);
drop function if exists expire_stale_gopay_invoices();
drop function if exists start_gopay_invoice(plan_type, numeric);
drop function if exists start_subscription(plan_type, numeric);
drop function if exists cancel_invoice(uuid);
drop function if exists apply_payment(uuid);
drop function if exists admin_apply_promo(uuid, text, int, text);

create or replace function admin_confirm_manual_payment(
  p_org_id uuid,
  p_plan plan_type,
  p_months int,
  p_amount numeric,
  p_reference text,
  p_reason text
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_before timestamptz;
  v_after timestamptz;
  v_start timestamptz;
  v_old_plan plan_type;
  v_invoice uuid;
  v_existing_end timestamptz;
begin
  if not is_platform_admin() then
    raise exception 'Forbidden';
  end if;
  if p_plan is null or p_plan not in ('standard'::plan_type, 'enterprise'::plan_type) then
    raise exception 'Paket pembayaran harus Solo atau Pro';
  end if;
  if p_months is null or p_months < 1 or p_months > 12 then
    raise exception 'Durasi pembayaran harus 1-12 bulan';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal pembayaran harus lebih dari nol';
  end if;
  if coalesce(btrim(p_reference), '') = '' then
    raise exception 'Referensi pembayaran wajib diisi';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Catatan verifikasi wajib diisi';
  end if;

  select plan_expired_at, plan_type
    into v_before, v_old_plan
  from organizations
  where id = p_org_id
  for update;
  if v_old_plan is null then
    raise exception 'Org tidak ditemukan';
  end if;

  -- Retry setelah timeout jaringan tidak boleh menggandakan bulan. Lock org
  -- di atas menserialisasi dua konfirmasi bersamaan untuk tenant yang sama.
  select period_end into v_existing_end
  from invoices
  where org_id = p_org_id
    and provider = 'manual_whatsapp'
    and provider_ref = btrim(p_reference)
    and status = 'paid'
  order by paid_at desc
  limit 1;
  if v_existing_end is not null then
    return v_existing_end;
  end if;

  v_start := greatest(coalesce(v_before, now()), now());
  v_after := v_start + make_interval(months => p_months);

  insert into invoices (
    org_id, plan, amount, status, provider, provider_ref,
    period_start, period_end, paid_at
  ) values (
    p_org_id, p_plan, p_amount, 'paid', 'manual_whatsapp', btrim(p_reference),
    v_start, v_after, now()
  )
  returning id into v_invoice;

  perform set_config('fixmaster.bypass_plan_lock', '1', true);
  update organizations
  set plan_type = p_plan,
      plan_expired_at = v_after
  where id = p_org_id;

  perform log_operator_action(
    p_org_id,
    'payment_manual',
    btrim(p_reason),
    jsonb_build_object(
      'invoice_id', v_invoice,
      'nominal', p_amount,
      'bulan', p_months,
      'referensi', btrim(p_reference),
      'plan_sebelum', v_old_plan,
      'plan_sesudah', p_plan,
      'expiry_sebelum', v_before,
      'expiry_sesudah', v_after
    )
  );

  return v_after;
end;
$fn$;

-- Supabase dapat memberi EXECUTE default ke PUBLIC saat CREATE FUNCTION.
-- Browser boleh memanggil RPC, tetapi fungsi tetap fail-closed lewat
-- is_platform_admin() dan tidak pernah mempercayai org milik sesi.
revoke execute on function admin_confirm_manual_payment(
  uuid, plan_type, int, numeric, text, text
) from public, anon;
grant execute on function admin_confirm_manual_payment(
  uuid, plan_type, int, numeric, text, text
) to authenticated;
