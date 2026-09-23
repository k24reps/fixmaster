-- Hitungan lampu rel navigasi, dihitung di server.
--
-- `useNavSignals` menyalakan rel diagnostik di sidebar DAN MobileBottomNav —
-- keduanya bagian shell, jadi hook ini berjalan di SETIAP halaman terautentikasi.
-- Untuk menghasilkan beberapa bilangan bulat, ia menarik tabel-tabel UTUH:
-- services, inventory_items, purchase_orders, task_instances, task_templates.
-- Akibatnya membuka Pengaturan pun ikut menarik seluruh katalog inventaris.
--
-- Pola ini sudah pernah dikenali dan diperbaiki untuk `attendance` (lihat
-- komentar di useNavSignals: "The rail mounts on every page (twice, with
-- MobileBottomNav)"), tapi empat tabel lain tertinggal. Ini menutup tiga di
-- antaranya — yang TIDAK punya aturan visibilitas peran.
--
-- Tugas sengaja TIDAK dipindahkan ke sini. `taskVisibleTo` (lib/business/tasks.ts)
-- menyaring per peran/cabang, dan komentarnya memperingatkan bahwa halaman Tugas
-- serta rel nav HARUS memakai aturan yang sama — kalau tidak, karyawan melihat
-- badge "7" tapi hanya dua baris. Menyalin aturan itu ke SQL menciptakan dua
-- implementasi yang bisa menyimpang diam-diam; risikonya lebih besar daripada
-- hematnya, karena task_templates kecil dan task_instances jauh lebih ramping
-- daripada services/inventory.
--
-- SECURITY INVOKER (default), bukan definer: RLS yang sudah ada
-- (`is_org_member(org_id)`, 0002) otomatis membatasi baris ke org pemanggil,
-- jadi fungsi ini tidak menambah permukaan hak akses sama sekali dan tidak
-- perlu menerima org_id dari klien.
--
-- Penyaringan cabang mencerminkan OUTLET_SCOPED di supabase-adapter.ts: saat
-- sebuah cabang aktif, baris cabang itu PLUS baris milik org (outlet_id null).

create or replace function nav_counts(p_outlet_id uuid default null)
returns json
language sql
stable
set search_path = public, pg_temp
as $$
  select json_build_object(
    -- isActive(): semua kecuali 'lunas' dan 'batal' (lib/business/services.ts).
    'servicesActive', (
      select count(*) from services s
      where s.deleted_at is null
        and s.status not in ('lunas', 'batal')
        and (p_outlet_id is null or s.outlet_id = p_outlet_id or s.outlet_id is null)
    ),
    'servicesAwaitingConfirm', (
      select exists (
        select 1 from services s
        where s.deleted_at is null
          and s.status = 'konfirmasi'
          and (p_outlet_id is null or s.outlet_id = p_outlet_id or s.outlet_id is null)
      )
    ),
    'inventoryOut', (
      select count(*) from inventory_items i
      where i.deleted_at is null
        and i.stock <= 0
        and (p_outlet_id is null or i.outlet_id = p_outlet_id or i.outlet_id is null)
    ),
    'inventoryLow', (
      select count(*) from inventory_items i
      where i.deleted_at is null
        and i.stock > 0
        and i.stock <= i.min_stock
        and (p_outlet_id is null or i.outlet_id = p_outlet_id or i.outlet_id is null)
    ),
    'poOpen', (
      select count(*) from purchase_orders p
      where p.deleted_at is null
        and p.status in ('ordered', 'partial')
        and (p_outlet_id is null or p.outlet_id = p_outlet_id or p.outlet_id is null)
    )
  );
$$;

grant execute on function nav_counts(uuid) to authenticated;
