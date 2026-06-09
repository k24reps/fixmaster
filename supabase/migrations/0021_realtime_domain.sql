-- ============================================================
-- FixMaster — 0021: Realtime untuk data domain (auto-refresh lintas device)
-- Memperluas 0012 (yang hanya menambah invoices + organizations).
-- Supabase Realtime menyiarkan perubahan tabel HANYA jika tabel itu
-- terdaftar di publication `supabase_realtime`. Agar aksi satu kasir
-- langsung tampil di device lain pada org yang sama, semua tabel domain
-- ditambahkan ke publication.
--
-- RLS tetap berlaku pada channel realtime → klien hanya menerima baris
-- yang boleh ia baca (org-nya sendiri). Filter org_id juga dipasang di sisi
-- klien (lihat subscribeOrgTables di supabase-client.ts).
--
-- Idempotent: cek keanggotaan publication dulu sebelum menambah, jadi aman
-- dijalankan ulang. Expand-only. Diuji di staging dulu.
-- ============================================================

do $$
declare
  t text;
  domain_tables text[] := array[
    'outlets', 'customers', 'suppliers', 'inventory_items', 'wallets',
    'fixed_costs', 'services', 'purchase_orders', 'sales', 'incomes',
    'expenses', 'attendance', 'task_templates', 'task_instances', 'activity_logs'
  ];
begin
  foreach t in array domain_tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
