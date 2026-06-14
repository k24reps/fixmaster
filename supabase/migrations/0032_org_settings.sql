-- ============================================================
-- FixMaster — 0032: organizations.settings (jsonb) untuk config lintas-device
--
-- Kenapa: config org seperti "kategori perangkat" sebelumnya disimpan di
-- localStorage (per-browser) → tak sinkron antar device (mis. dibuat di
-- desktop, tak muncul di HP). Kolom `settings` jsonb memindahkannya ke baris
-- organizations sehingga tersinkron untuk semua perangkat pada org yang sama.
--
-- Bentuk yang dipakai klien (extensible, hanya kategori untuk rilis ini):
--   { "deviceCategories": ["Laptop", "HP", ...] }
--
-- Keamanan: TANPA perubahan RLS. Kebijakan UPDATE organizations yang ada sudah
-- manager-only → hanya owner/admin yang bisa mengubah settings; semua member
-- tetap bisa MEMBACA (lewat select org) sehingga kasir melihat daftar kategori
-- saat membuat servis.
--
-- Additif & idempotent (add column if not exists; default '{}'). Uji staging dulu.
-- ============================================================

alter table organizations
  add column if not exists settings jsonb not null default '{}'::jsonb;
