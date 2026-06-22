-- ============================================================
-- FixMaster — 0036: Admin di-scope per-cabang (HIGH RISK — security boundary)
--
-- ⚠️⚠️  JANGAN APPLY KE PRODUKSI SAMPAI:
--   1) Migrasi 0023/0024/0025/0026/0027/0028 sudah ter-apply, DAN
--   2) Owner sudah menetapkan outlet untuk SETIAP admin via
--      Pengaturan → Tim (admin TANPA penugasan = lihat semua, lihat catatan), DAN
--   3) Sudah diuji di STAGING (npm run test:integration).
-- ⚠️⚠️
--
-- PERUBAHAN BATAS KEAMANAN:
-- Sebelumnya owner DAN admin = is_org_manager() → menembus SEMUA outlet di RLS
-- (0028). Sekarang:
--   • OWNER  → tetap melihat/menulis SEMUA data org (is_org_owner).
--   • ADMIN  → di-scope ke outlet yang ditugaskan (auth_outlet_ids) + record
--              org-wide (outlet_id IS NULL). Persis seperti karyawan untuk
--              CAKUPAN DATA, namun KEWENANGAN (delete, settle, kelola tim,
--              tulis keuangan) tetap manager-level lewat is_org_manager().
--   • KARYAWAN → tak berubah (sudah outlet-scoped sejak 0028).
--
-- Catatan penting "kosong = semua": admin TANPA penugasan outlet akan punya
-- auth_outlet_ids() kosong. Predikat `outlet_id IS NULL OR outlet_id IN (...)`
-- berarti admin tanpa penugasan HANYA melihat record org-wide (outlet_id null),
-- BUKAN semua. Untuk mencegah admin lama kehilangan akses saat migrasi, owner
-- WAJIB menetapkan outlet admin sebelum apply (lihat prasyarat #2). UI Settings
-- (0036 sisi klien) menampilkan pemilih outlet untuk admin.
--
-- Tabel terdampak (predikat outlet di-scope untuk admin):
--   services, sales, attendance, purchase_orders, task_instances, wallets
--   + incomes, expenses (baca: owner semua / admin per-cabang / karyawan nol).
--
-- Idempotent (drop if exists + create). Expand-contract: hanya ganti
-- predikat policy; tak ada DROP kolom/tabel. Helper is_org_owner (0016) &
-- auth_outlet_ids (0024) dipakai ulang.
-- ============================================================

-- Predikat baru (admin lewat jalur outlet, owner tembus semua):
--   is_org_owner(org_id) OR outlet_id IS NULL OR outlet_id IN (auth_outlet_ids)

-- ---------- services ----------
drop policy if exists services_select on services;
create policy services_select on services for select
  using (
    is_org_member(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists services_ins on services;
create policy services_ins on services for insert
  with check (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists services_upd on services;
create policy services_upd on services for update
  using (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  )
  with check (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );

-- ---------- sales ----------
drop policy if exists sales_select on sales;
create policy sales_select on sales for select
  using (
    is_org_member(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists sales_ins on sales;
create policy sales_ins on sales for insert
  with check (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists sales_upd on sales;
create policy sales_upd on sales for update
  using (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  )
  with check (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );

-- ---------- attendance ----------
drop policy if exists attendance_select on attendance;
create policy attendance_select on attendance for select
  using (
    is_org_member(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists attendance_ins on attendance;
create policy attendance_ins on attendance for insert
  with check (
    is_org_active(org_id)
    and (is_org_manager(org_id) or is_self_membership(employee_id, org_id))
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );

-- ---------- purchase_orders (tulis manager-only; baca outlet-scoped) ----------
drop policy if exists po_select on purchase_orders;
create policy po_select on purchase_orders for select
  using (
    is_org_member(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );

-- ---------- task_instances ----------
drop policy if exists task_inst_select on task_instances;
create policy task_inst_select on task_instances for select
  using (
    is_org_member(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists task_inst_ins on task_instances;
create policy task_inst_ins on task_instances for insert
  with check (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );
drop policy if exists task_inst_upd on task_instances;
create policy task_inst_upd on task_instances for update
  using (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  )
  with check (
    is_org_member(org_id) and is_org_active(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );

-- ---------- wallets (baca: owner semua / admin+karyawan cabang) ----------
drop policy if exists wallets_select on wallets;
create policy wallets_select on wallets for select
  using (
    is_org_member(org_id)
    and (is_org_owner(org_id) or outlet_id is null or outlet_id in (select auth_outlet_ids()))
  );

-- ---------- incomes / expenses (keuangan: tetap manager-only, kini outlet-scoped untuk admin) ----------
-- Owner: semua. Admin (manager non-owner): hanya cabangnya + org-wide.
-- Karyawan: tetap NOL (bukan manager → predikat manager gagal).
drop policy if exists incomes_select on incomes;
create policy incomes_select on incomes for select
  using (
    is_org_owner(org_id)
    or (is_org_manager(org_id) and (outlet_id is null or outlet_id in (select auth_outlet_ids())))
  );

drop policy if exists expenses_select on expenses;
create policy expenses_select on expenses for select
  using (
    is_org_owner(org_id)
    or (is_org_manager(org_id) and (outlet_id is null or outlet_id in (select auth_outlet_ids())))
  );

-- ============================================================
-- Tidak diubah (sengaja): aksi kewenangan manager-level tetap is_org_manager —
-- delete (0017), settle/cancel/refund RPC (0029/0031), kelola tim (0016),
-- tulis keuangan (0010). Admin tetap "manager" dalam kewenangan; hanya CAKUPAN
-- DATA-nya yang kini dibatasi cabang.
-- ============================================================
