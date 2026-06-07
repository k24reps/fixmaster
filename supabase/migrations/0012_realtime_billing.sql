-- ============================================================
-- FixMaster — Realtime untuk billing (auto-refresh UI)
-- Supabase Realtime menyiarkan perubahan tabel HANYA jika tabel itu
-- terdaftar di publication `supabase_realtime`. UI billing perlu tahu
-- saat invoice/organizations berubah (mis. webhook menandai paid/expired),
-- jadi tabel `invoices` + `organizations` ditambahkan ke publication.
-- RLS tetap berlaku pada channel realtime → klien hanya menerima baris
-- yang boleh ia baca (org-nya sendiri).
-- Idempotent: cek keanggotaan publication dulu sebelum menambah.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'invoices'
  ) then
    alter publication supabase_realtime add table invoices;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'organizations'
  ) then
    alter publication supabase_realtime add table organizations;
  end if;
end $$;
