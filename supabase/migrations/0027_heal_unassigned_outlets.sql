-- ============================================================
-- FixMaster — 0027: Jaring pengaman penugasan outlet (anti-lockout)
--
-- TUJUAN: mencegah karyawan "terkunci" dari data transaksinya sendiri
-- setelah 0028 (RLS per-outlet) aktif.
--
-- Latar masalah (kasus org lama / nol-outlet):
--   - Backfill di 0024 (semua anggota → semua outlet) jalan SAAT 0024
--     di-apply. Bila org saat itu punya 0 outlet, backfill = no-op →
--     karyawannya berakhir dengan 0 penugasan.
--   - 0026 lalu membuat outlet utama + menstempel transaksi lama ke
--     outlet itu, TAPI tidak mengisi membership_outlets.
--   - Akibatnya setelah 0028: karyawan tanpa penugasan hanya bisa
--     melihat data outlet_id NULL, sedangkan transaksi lama sudah
--     ber-stempel outlet utama → karyawan TERKUNCI dari datanya.
--
-- SOLUSI: untuk tiap karyawan AKTIF yang punya NOL penugasan, tugaskan
-- ke SEMUA outlet org-nya (sama filosofi dengan backfill 0024). Owner
-- dapat mempersempit kembali lewat Pengaturan → Tim setelahnya.
--
-- SIFAT (penting):
--   * PRESISI: HANYA menyentuh karyawan dengan 0 penugasan. Karyawan
--     yang sudah punya ≥1 penugasan (sengaja dibatasi owner) TIDAK
--     disentuh — pembatasan owner dihormati.
--   * ROLE: hanya peran 'karyawan'. Owner/admin = manager (is_org_manager),
--     tak pernah dibatasi outlet, jadi tak perlu penugasan.
--   * IDEMPOTENT & forward-only (on conflict do nothing). Aman dijalankan
--     berulang.
--
-- KAPAN DIJALANKAN (produksi): sebagai jaring pengaman di sekitar
-- pengaktifan 0028 — boleh SEBELUM atau SESUDAH 0028 (keduanya aman
-- karena migrasi ini hanya MEMBERI akses, tak pernah mencabut). Idealnya
-- dijalankan tepat sebelum 0028 agar tak ada jeda lockout sama sekali.
-- Uji di staging dulu.
-- ============================================================

insert into membership_outlets (membership_id, outlet_id, org_id)
select m.id, o.id, m.org_id
from memberships m
join outlets o on o.org_id = m.org_id
where m.active = true
  and m.role = 'karyawan'
  and not exists (
    select 1 from membership_outlets mo where mo.membership_id = m.id
  )
on conflict do nothing;
