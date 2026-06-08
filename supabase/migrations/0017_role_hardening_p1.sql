-- ============================================================
-- FixMaster — 0017: Role hardening P1 (integritas operasional)
-- Lanjutan 0016. Menutup tiga celah tulis di lapis SERVER (RLS):
--   A. Inventori: SEMUA tulis (insert/update/delete) → manager-only.
--      Perubahan stok untuk penjualan & penerimaan barang lewat RPC
--      security-definer (process_sale, receive_goods) yang BYPASS RLS,
--      jadi POS + terima PO tetap jalan. Hanya editor item manual
--      (harga modal/jual, tambah/hapus item) yang jadi manager-only.
--   B. Absensi: member hanya boleh menulis baris MILIKNYA sendiri;
--      manager boleh menulis siapa pun. (Geofence clock_in = RPC,
--      tak terpengaruh.)
--   C. Hard-delete: cabut DELETE dari member pada tabel operasional
--      (customers, services, sales, task_instances, attendance) →
--      manager-only. App pakai soft-delete/void/archive; penghapusan
--      permanen adalah aksi manager.
-- Semua policy tulis mempertahankan gerbang langganan is_org_active()
-- dari 0010. Expand-only, idempotent. Diuji di staging dulu.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: is_self_membership(member_id, org) — true bila member_id
-- adalah membership AKTIF milik pemanggil DI org tsb. Menyertakan org
-- agar tak bisa menulis lintas-org dengan membership sendiri.
-- ------------------------------------------------------------
create or replace function is_self_membership(p_member_id uuid, p_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where id = p_member_id and user_id = auth.uid()
      and org_id = p_org and active = true
  );
$$;

-- ============================================================
-- A. INVENTORI — semua tulis manager-only
-- ============================================================
drop policy if exists inventory_write on inventory_items;
drop policy if exists inventory_ins on inventory_items;
drop policy if exists inventory_upd on inventory_items;
drop policy if exists inventory_del on inventory_items;
create policy inventory_write on inventory_items for all
  using (is_org_manager(org_id) and is_org_active(org_id))
  with check (is_org_manager(org_id) and is_org_active(org_id));

-- ============================================================
-- B. ABSENSI — member tulis diri sendiri; manager siapa pun;
--    DELETE manager-only.
-- ============================================================
drop policy if exists attendance_write on attendance;
drop policy if exists attendance_ins on attendance;
drop policy if exists attendance_upd on attendance;
drop policy if exists attendance_del on attendance;

create policy attendance_ins on attendance for insert
  with check (
    is_org_active(org_id)
    and (is_org_manager(org_id) or is_self_membership(employee_id, org_id))
  );
create policy attendance_upd on attendance for update
  using (
    is_org_active(org_id)
    and (is_org_manager(org_id) or is_self_membership(employee_id, org_id))
  )
  with check (
    is_org_active(org_id)
    and (is_org_manager(org_id) or is_self_membership(employee_id, org_id))
  );
create policy attendance_del on attendance for delete
  using (is_org_manager(org_id) and is_org_active(org_id));

-- ============================================================
-- C. HARD-DELETE manager-only pada tabel operasional, sambil
--    mempertahankan INSERT/UPDATE di level member (+ is_org_active).
--    Pola: ganti policy gabungan `*_write` (for all) jadi tiga
--    policy terpisah insert/update/delete.
-- ============================================================

-- ---- customers ----
drop policy if exists customers_write on customers;
drop policy if exists customers_ins on customers;
drop policy if exists customers_upd on customers;
drop policy if exists customers_del on customers;
create policy customers_ins on customers for insert
  with check (is_org_member(org_id) and is_org_active(org_id));
create policy customers_upd on customers for update
  using (is_org_member(org_id) and is_org_active(org_id))
  with check (is_org_member(org_id) and is_org_active(org_id));
create policy customers_del on customers for delete
  using (is_org_manager(org_id) and is_org_active(org_id));

-- ---- services ----
drop policy if exists services_write on services;
drop policy if exists services_ins on services;
drop policy if exists services_upd on services;
drop policy if exists services_del on services;
create policy services_ins on services for insert
  with check (is_org_member(org_id) and is_org_active(org_id));
create policy services_upd on services for update
  using (is_org_member(org_id) and is_org_active(org_id))
  with check (is_org_member(org_id) and is_org_active(org_id));
create policy services_del on services for delete
  using (is_org_manager(org_id) and is_org_active(org_id));

-- ---- sales ----
drop policy if exists sales_write on sales;
drop policy if exists sales_ins on sales;
drop policy if exists sales_upd on sales;
drop policy if exists sales_del on sales;
create policy sales_ins on sales for insert
  with check (is_org_member(org_id) and is_org_active(org_id));
create policy sales_upd on sales for update
  using (is_org_member(org_id) and is_org_active(org_id))
  with check (is_org_member(org_id) and is_org_active(org_id));
create policy sales_del on sales for delete
  using (is_org_manager(org_id) and is_org_active(org_id));

-- ---- task_instances ----
drop policy if exists task_inst_write on task_instances;
drop policy if exists task_inst_ins on task_instances;
drop policy if exists task_inst_upd on task_instances;
drop policy if exists task_inst_del on task_instances;
create policy task_inst_ins on task_instances for insert
  with check (is_org_member(org_id) and is_org_active(org_id));
create policy task_inst_upd on task_instances for update
  using (is_org_member(org_id) and is_org_active(org_id))
  with check (is_org_member(org_id) and is_org_active(org_id));
create policy task_inst_del on task_instances for delete
  using (is_org_manager(org_id) and is_org_active(org_id));
