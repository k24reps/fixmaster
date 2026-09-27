-- ============================================================
-- FixMaster — 0090: event DELETE realtime benar-benar terkirim
--
-- Gejala: hapus transaksi di Keuangan → barisnya tetap tampil sampai halaman
-- di-refresh; di perangkat lain hapusan tak pernah terlihat. Aplikasi memang
-- menunggu realtime untuk memuat ulang, tapi langganannya disaring
-- `org_id=eq.<org>` (subscribeOrgTables), dan Supabase hanya bisa menyaring event
-- DELETE bila tabelnya REPLICA IDENTITY FULL — dengan identitas bawaan, baris
-- lama di WAL hanya berisi primary key, jadi filter org_id tak pernah cocok dan
-- event DELETE dibuang diam-diam. INSERT/UPDATE tidak terdampak.
--
-- Terukur di replika 27 Sep 2026 (klien supabase-js, token owner, filter org):
-- sebelum = hanya INSERT yang tiba; sesudah = INSERT + DELETE.
--
-- Aman dari kebocoran: untuk tabel ber-RLS, payload DELETE tetap hanya berisi
-- primary key (`old` = {id}), bukan isi baris yang dihapus.
--
-- Sengaja TIDAK disertakan:
--   services       — tak pernah dihapus dari aplikasi, sedangkan sering di-UPDATE
--                    dengan baris besar (history, spareparts); FULL menulis seluruh
--                    baris lama ke WAL di setiap UPDATE.
--   activity_logs  — hapus hanya lewat purge massal (0076); ribuan event DELETE
--                    sekaligus ke semua perangkat tanpa manfaat bagi tampilan.
-- ============================================================

alter table public.outlets          replica identity full;
alter table public.customers        replica identity full;
alter table public.suppliers        replica identity full;
alter table public.inventory_items  replica identity full;
alter table public.wallets          replica identity full;
alter table public.fixed_costs      replica identity full;
alter table public.purchase_orders  replica identity full;
alter table public.sales            replica identity full;
alter table public.incomes          replica identity full;
alter table public.expenses         replica identity full;
alter table public.attendance       replica identity full;
alter table public.task_templates   replica identity full;
alter table public.task_instances   replica identity full;
alter table public.wallet_transfers replica identity full;
