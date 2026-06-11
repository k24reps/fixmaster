-- ============================================================
-- FixMaster — 0022: Tutup celah billing bypass pada apply_payment (F5)
-- Temuan audit (find-first, 11 Jun 2026): apply_payment adalah
-- `security definer` (bypass RLS) dan di-grant ke `authenticated`
-- TANPA cek pemanggil. Akibatnya SEMBARANG user terautentikasi
-- (mis. karyawan) bisa menandai invoice LUNAS tanpa membayar →
-- upgrade plan gratis (kehilangan pendapatan langganan).
--
-- Perbaikan: tambah guard di awal fungsi — hanya yang berhak:
--   1) service_role (dipanggil webhook Fersaku server-side), ATAU
--   2) OWNER dari org pemilik invoice (jalur mock-confirm yang sah
--      dari SettingsPage; start_subscription juga sudah owner-only).
-- Selain itu: ditolak ('Forbidden').
--
-- Logika lain (idempotent, bypass_plan_lock, perpanjang plan) IDENTIK
-- dengan 0016 agar tak ada regresi fungsional. Expand-only, idempotent.
-- Diuji di staging dulu.
-- ============================================================

create or replace function apply_payment(p_invoice_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_org uuid;
  v_plan plan_type;
  v_end timestamptz;
  v_status invoice_status;
  v_current_expiry timestamptz;
begin
  select org_id, plan, period_end, status into v_org, v_plan, v_end, v_status
  from invoices where id = p_invoice_id;
  if v_org is null then raise exception 'Invoice not found'; end if;

  -- F5: gerbang otorisasi pemanggil. service_role (webhook) selalu boleh;
  -- selain itu hanya OWNER org pemilik invoice. auth.uid() null + role
  -- service_role → cabang pertama; owner via UI → is_org_owner true.
  if coalesce(auth.role(), '') <> 'service_role' and not is_org_owner(v_org) then
    raise exception 'Forbidden';
  end if;

  if v_status = 'paid' then return; end if;  -- idempotent

  update invoices set status = 'paid', paid_at = now() where id = p_invoice_id;

  -- Tandai jalur sah agar trigger plan_type mengizinkan (transaksi-lokal).
  perform set_config('fixmaster.bypass_plan_lock', '1', true);

  select plan_expired_at into v_current_expiry from organizations where id = v_org;
  update organizations
  set plan_type = v_plan,
      plan_expired_at = greatest(coalesce(v_current_expiry, now()), now()) + interval '1 month'
  where id = v_org;
end;
$$;
