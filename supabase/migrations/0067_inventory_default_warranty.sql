-- ============================================================
-- FixMaster — 0067: garansi bawaan per item inventori
--
-- Item seperti baterai biasanya selalu bergaransi sama (mis. 90 hari). Nilai
-- ini disalin ke baris sparepart saat diambil ke tiket (`defaultWarrantyDays`)
-- dan dipakai sebagai isian awal garansi part saat tiket Selesai — tetap bisa
-- diubah per tiket. Kosong = pakai garansi part toko.
-- ============================================================

alter table inventory_items
  add column if not exists warranty_days integer
  check (warranty_days is null or warranty_days >= 0);
