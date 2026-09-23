-- Hitungan tugas untuk lampu rel nav, dikelompokkan PER TEMPLATE.
--
-- Rel diagnostik (Sidebar + MobileBottomNav, jadi SETIAP halaman) menarik
-- task_instances UTUH hanya untuk dua angka: lewat tenggat dan jatuh tempo hari
-- ini. Diukur di replika produksi: 150 baris, 80 KB per tarikan — dan ke-150-nya
-- `pending` lewat tenggat, bertambah 5 baris per hari karena tugas harian tidak
-- pernah dicentang. Jadi menyaring `status = pending` di klien TIDAK menghemat
-- apa pun, dan payload-nya tumbuh tanpa batas.
--
-- Kenapa per template, bukan satu angka:
-- 0081 sengaja TIDAK memindahkan tugas ke server karena `taskVisibleTo`
-- (lib/business/tasks.ts) menyaring per peran/cabang, dan menyalin aturan itu ke
-- SQL membuat badge bisa menyimpang dari halaman Tugas. Tapi aturan itu hanya
-- bergantung pada TEMPLATE, tidak pada baris instance. Jadi server cukup
-- menghitung per template; klien menerapkan `taskVisibleTo` yang sama persis pada
-- hasilnya. Aturan tetap di satu tempat, dan payload-nya dibatasi jumlah template
-- (±5 baris) — bukan jumlah hari yang sudah lewat.
--
-- `p_today` dikirim dari klien: server berjalan UTC, sehingga antara 00:00 dan
-- 07:00 WIB `current_date`-nya masih kemarin. `isOverdue` memakai tanggal lokal.
--
-- Penyaringan cabang mencerminkan OUTLET_SCOPED (supabase-adapter.ts): baris
-- cabang aktif PLUS baris milik org (outlet_id null). SECURITY INVOKER: RLS
-- (`is_org_member`) yang membatasi org.

create or replace function task_counts_by_template(
  p_outlet_id uuid default null,
  p_today date default current_date
)
returns table (template_id uuid, overdue int, due_today int)
language sql
stable
set search_path = public, pg_temp
as $$
  select t.template_id,
         (count(*) filter (where t.due_date < p_today))::int,
         (count(*) filter (where t.due_date = p_today))::int
  from task_instances t
  where t.deleted_at is null
    and t.status = 'pending'
    and t.due_date <= p_today
    and (p_outlet_id is null or t.outlet_id = p_outlet_id or t.outlet_id is null)
  group by t.template_id;
$$;

-- Pelajaran 0082: default privileges Supabase memberi anon EXECUTE atas setiap
-- fungsi baru. RLS sudah membuat anon mendapat hasil kosong, tapi fungsi ini
-- tidak punya alasan bisa dipanggil tanpa login — tutup sejak awal.
revoke execute on function task_counts_by_template(uuid, date) from public, anon;
grant execute on function task_counts_by_template(uuid, date) to authenticated, service_role;
