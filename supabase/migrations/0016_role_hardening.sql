-- ============================================================
-- FixMaster — 0016: Role hardening (P0)
-- Menutup dua celah akses di lapis SERVER (RLS/RPC) yang tidak
-- tertutup UI:
--   A. Keuangan (incomes/expenses) bisa DIBACA semua member →
--      batasi ke manager (owner/admin). Karyawan tak lagi bisa
--      menarik omzet/pengeluaran lewat API.
--   B. Admin = Owner di server → pisahkan. Admin tak bisa:
--      - mengangkat/menurunkan/menonaktifkan OWNER (RPC + tabel),
--      - mengubah paket (billing RPC + kunci kolom plan_type).
-- Expand-only (tak ada DROP kolom/tabel). Idempotent. Aman untuk
-- sesi user yang sedang berjalan.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: is_org_owner — cermin is_org_manager tapi owner saja.
-- ------------------------------------------------------------
create or replace function is_org_owner(target_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and org_id = target_org and active = true
      and role = 'owner'
  );
$$;

-- ============================================================
-- A. Keuangan: baca → manager-only (write sudah manager di 0010)
-- ============================================================
drop policy if exists incomes_select on incomes;
create policy incomes_select on incomes
  for select using (is_org_manager(org_id));

drop policy if exists expenses_select on expenses;
create policy expenses_select on expenses
  for select using (is_org_manager(org_id));

-- ============================================================
-- B1. Lindungi OWNER pada tabel memberships (cegah eskalasi via
--     direct PostgREST write — RPC saja tidak cukup).
--     Admin boleh kelola member NON-owner; tak boleh membuat/
--     mengubah baris ber-role owner. Owner boleh semua.
-- ============================================================
drop policy if exists mbr_manage on memberships;
create policy mbr_manage on memberships
  for all
  using (
    is_org_manager(org_id)
    and (role <> 'owner' or is_org_owner(org_id))
  )
  with check (
    is_org_manager(org_id)
    and (role <> 'owner' or is_org_owner(org_id))
  );

-- ============================================================
-- B2. RPC tim: tambah guard owner (RPC security definer melewati
--     RLS, jadi guard eksplisit tetap perlu).
-- ============================================================
create or replace function set_member_role(p_member_id uuid, p_role role_type)
returns void
language plpgsql security definer as $$
declare
  v_org uuid;
  v_old role_type;
  v_owner_count int;
begin
  select org_id, role into v_org, v_old from memberships where id = p_member_id;
  if v_org is null then raise exception 'Member not found'; end if;
  if not is_org_manager(v_org) then raise exception 'Forbidden'; end if;

  -- Hanya OWNER yang boleh memberi peran owner (promote) atau
  -- mengubah peran seseorang yang saat ini owner (demote).
  if (p_role = 'owner' or v_old = 'owner') and not is_org_owner(v_org) then
    raise exception 'Hanya owner yang dapat mengelola peran owner';
  end if;

  -- Guard: jangan turunkan owner terakhir.
  if v_old = 'owner' and p_role <> 'owner' then
    select count(*) into v_owner_count
    from memberships where org_id = v_org and role = 'owner' and active = true;
    if v_owner_count <= 1 then
      raise exception 'Tidak bisa menurunkan owner terakhir';
    end if;
  end if;

  update memberships set role = p_role where id = p_member_id;
end;
$$;

create or replace function deactivate_member(p_member_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_org uuid;
  v_role role_type;
  v_owner_count int;
begin
  select org_id, role into v_org, v_role from memberships where id = p_member_id;
  if v_org is null then raise exception 'Member not found'; end if;
  if not is_org_manager(v_org) then raise exception 'Forbidden'; end if;

  -- Hanya OWNER yang boleh menonaktifkan owner.
  if v_role = 'owner' and not is_org_owner(v_org) then
    raise exception 'Hanya owner yang dapat menonaktifkan owner';
  end if;

  if v_role = 'owner' then
    select count(*) into v_owner_count
    from memberships where org_id = v_org and role = 'owner' and active = true;
    if v_owner_count <= 1 then
      raise exception 'Tidak bisa menonaktifkan owner terakhir';
    end if;
  end if;

  update memberships set active = false where id = p_member_id;
end;
$$;

-- ============================================================
-- B3. Billing → owner-only (UI tab Langganan sudah owner-only;
--     ini menutup celah API).
-- ============================================================
-- Direct writes ke invoices: owner-only (baca tetap member).
drop policy if exists invoices_manage on invoices;
create policy invoices_manage on invoices
  for all using (is_org_owner(org_id)) with check (is_org_owner(org_id));

-- start_subscription (recreate dari 0011: pertahankan anti-tumpuk
-- pending) — pembuat langganan kini OWNER saja.
create or replace function start_subscription(p_plan plan_type, p_amount numeric default 0)
returns uuid
language plpgsql security definer as $$
declare
  v_org uuid;
  v_invoice uuid;
begin
  select org_id into v_org from memberships
  where user_id = auth.uid() and active = true and role = 'owner'
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

-- cancel_invoice (recreate dari 0011): owner-only.
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
  if not is_org_owner(v_org) then raise exception 'Forbidden'; end if;

  if v_status = 'pending' then
    update invoices set status = 'canceled' where id = p_invoice_id;
  end if;
end;
$$;

-- ============================================================
-- B4. Kunci kolom plan_type: hanya boleh berubah lewat jalur
--     billing yang sah (apply_payment menandai flag transaksi)
--     atau service_role (webhook/tooling). Mencegah admin—atau
--     siapa pun—mem-bypass pembayaran via UPDATE langsung.
--     Catatan: trigger hanya menolak saat plan_type BENAR-BENAR
--     berubah, jadi edit profil usaha (nama/alamat/logo) aman.
-- ============================================================
create or replace function guard_plan_type_change()
returns trigger language plpgsql as $$
begin
  if new.plan_type is distinct from old.plan_type then
    -- Jalur billing yang diberkati (apply_payment menandai flag transaksi)
    -- ATAU backend/webhook (service_role) boleh mengubah paket.
    if coalesce(current_setting('fixmaster.bypass_plan_lock', true), '') = '1'
       or coalesce(auth.role(), '') = 'service_role' then
      return new;
    end if;
    -- Selain itu: JANGAN gagalkan update — cukup PERTAHANKAN paket lama.
    -- Penting: klien menyimpan profil usaha (nama/alamat/logo) dengan
    -- meng-UPDATE seluruh baris organizations, termasuk plan_type yang bisa
    -- BASI (mis. setelah webhook memperpanjang paket tapi cache klien belum
    -- segar). Me-reject akan memblokir edit profil yang sah. Dengan meng-
    -- coerce ke nilai lama, kolom tetap tak bisa diubah lewat UPDATE langsung
    -- (anti-bypass) tanpa false-positive.
    new.plan_type := old.plan_type;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_plan_type on organizations;
create trigger trg_guard_plan_type
  before update on organizations
  for each row execute function guard_plan_type_change();

-- apply_payment (recreate dari 0009): set flag lokal sebelum
-- mengubah plan_type agar lolos trigger di atas. Logika lain sama.
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
