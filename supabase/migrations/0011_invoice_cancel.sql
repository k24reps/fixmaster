-- ============================================================
-- FixMaster — Fase 1B: batalkan invoice + anti-tumpuk pending
-- Masalah: tiap "Pilih Paket" memanggil start_subscription yang SELALU
-- membuat invoice 'pending' baru, tanpa membatalkan yang lama dan tanpa
-- jalan untuk cancel. Akibatnya invoice pending menumpuk selamanya.
-- Fix:
--   1) cancel_invoice(): manager membatalkan satu invoice pending.
--   2) start_subscription(): sebelum membuat invoice baru, batalkan
--      otomatis semua invoice 'pending' milik org (supersede), jadi
--      maksimal hanya ada SATU pending pada satu waktu.
-- Hanya invoice 'pending' yang bisa dibatalkan; 'paid' tak tersentuh.
-- Idempotent (create or replace).
-- ============================================================

-- ---------- cancel_invoice ----------
-- Manager membatalkan satu invoice yang masih pending. No-op aman bila
-- invoice sudah paid/canceled/expired (tak menurunkan status final).
create or replace function cancel_invoice(p_invoice_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_org uuid;
  v_status invoice_status;
begin
  select org_id, status into v_org, v_status
  from invoices where id = p_invoice_id;
  if v_org is null then raise exception 'Invoice not found'; end if;
  if not is_org_manager(v_org) then raise exception 'Forbidden'; end if;

  -- Hanya pending yang boleh dibatalkan (idempotent untuk status lain).
  if v_status = 'pending' then
    update invoices set status = 'canceled' where id = p_invoice_id;
  end if;
end;
$$;

-- ---------- start_subscription (recreate: anti-tumpuk) ----------
-- Sama seperti 0009 tetapi membatalkan dulu semua pending org sebelum
-- membuat invoice baru. Hasilnya: hanya satu invoice pending aktif.
create or replace function start_subscription(p_plan plan_type, p_amount numeric default 0)
returns uuid
language plpgsql security definer as $$
declare
  v_org uuid;
  v_invoice uuid;
begin
  select org_id into v_org from memberships
  where user_id = auth.uid() and active = true and role in ('owner','admin')
  limit 1;
  if v_org is null then raise exception 'Forbidden'; end if;

  -- Supersede invoice pending lama agar tak menumpuk.
  update invoices set status = 'canceled'
  where org_id = v_org and status = 'pending';

  insert into invoices (org_id, plan, amount, status, period_start, period_end)
  values (v_org, p_plan, p_amount, 'pending', now(), now() + interval '1 month')
  returning id into v_invoice;

  return v_invoice;
end;
$$;

grant execute on function cancel_invoice(uuid) to authenticated;
