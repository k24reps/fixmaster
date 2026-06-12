-- ============================================================
-- FixMaster — 0028: Pengetatan RLS per-outlet (Level 2) — RILIS 2
--
-- ⚠️⚠️  JANGAN APPLY KE PRODUKSI SAMPAI:
--   1) Migrasi 0023/0024/0025/0026/0027 sudah ter-apply, DAN
--   2) Owner sudah menetapkan outlet untuk SETIAP karyawan via
--      Pengaturan → Tim (jika tidak, karyawan tanpa penugasan akan
--      kehilangan akses ke data transaksi), DAN
--   3) Sudah diuji di STAGING (npm run test:integration).
-- ⚠️⚠️
--
-- Efek: mengubah batas keamanan. Setelah ini, karyawan (non-manager)
-- hanya bisa MEMBACA & MENULIS record transaksi milik outlet yang
-- ditugaskan padanya (auth_outlet_ids, 0024) atau record org-wide
-- (outlet_id null). Owner/admin (is_org_manager) tetap melihat semua.
--
-- Tabel terdampak: services, sales, incomes, expenses, attendance,
-- purchase_orders, task_instances, wallets.
-- Tetap mempertahankan: gerbang is_org_active (0010), delete
-- manager-only (0017), keuangan baca manager-only (0016).
--
-- Idempotent (drop if exists + create). Expand-contract: hanya
-- mengganti predikat policy; tak ada DROP kolom/tabel.
-- ============================================================

-- Predikat akses-outlet (dipakai berulang):
--   is_org_manager(org_id) OR outlet_id IS NULL OR outlet_id IN (auth_outlet_ids)

-- ---------- services ----------
drop policy if exists services_select on services;
create policy services_select on services for select
  using (
    is_org_member(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists services_ins on services;
create policy services_ins on services for insert
  with check (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists services_upd on services;
create policy services_upd on services for update
  using (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  )
  with check (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
-- delete tetap manager-only (0017) — tak diubah.

-- ---------- sales ----------
drop policy if exists sales_select on sales;
create policy sales_select on sales for select
  using (
    is_org_member(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists sales_ins on sales;
create policy sales_ins on sales for insert
  with check (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists sales_upd on sales;
create policy sales_upd on sales for update
  using (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  )
  with check (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );

-- ---------- incomes (baca tetap manager-only sejak 0016) ----------
-- select TIDAK diubah: incomes_select = is_org_manager (0016). Karyawan
-- memang tak boleh baca keuangan, jadi outlet-scope tak relevan untuk read.
-- Write tetap manager-only (0010) → outlet-scope tak menambah batasan.
-- Sengaja TIDAK diubah agar tidak melonggarkan akses keuangan.

-- ---------- expenses (idem incomes) ----------
-- Tidak diubah (manager-only baca+tulis).

-- ---------- attendance ----------
drop policy if exists attendance_select on attendance;
create policy attendance_select on attendance for select
  using (
    is_org_member(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
-- insert/update tetap (self atau manager) dari 0017; tambah syarat outlet
-- pada insert agar karyawan tak mencatat absensi ke cabang lain.
drop policy if exists attendance_ins on attendance;
create policy attendance_ins on attendance for insert
  with check (
    is_org_active(org_id)
    and (is_org_manager(org_id) or is_self_membership(employee_id, org_id))
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );

-- ---------- purchase_orders (tulis manager-only; ketatkan baca) ----------
drop policy if exists po_select on purchase_orders;
create policy po_select on purchase_orders for select
  using (
    is_org_member(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );

-- ---------- task_instances ----------
drop policy if exists task_inst_select on task_instances;
create policy task_inst_select on task_instances for select
  using (
    is_org_member(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists task_inst_ins on task_instances;
create policy task_inst_ins on task_instances for insert
  with check (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists task_inst_upd on task_instances;
create policy task_inst_upd on task_instances for update
  using (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  )
  with check (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );

-- ---------- wallets (Hybrid: bersama bila null, atau khusus cabang) ----------
-- Baca: member boleh lihat wallet bersama + wallet cabangnya.
-- Tulis: tetap manager-only (0010) — saldo dikredit lewat RPC (0025).
drop policy if exists wallets_select on wallets;
create policy wallets_select on wallets for select
  using (
    is_org_member(org_id)
    and (is_org_manager(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
