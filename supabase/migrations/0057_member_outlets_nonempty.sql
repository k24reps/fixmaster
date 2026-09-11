-- ============================================================
-- 0057_member_outlets_nonempty.sql
-- Penugasan cabang tidak boleh disimpan KOSONG.
--
-- `auth_outlet_ids()` (0024/0042) sengaja tanpa fallback: anggota tanpa
-- penugasan tidak melihat transaksi cabang mana pun. Itu arah yang benar
-- (gagal-tertutup) — fallback "kosong = semua cabang" berarti menghapus satu
-- cabang (cascade ke membership_outlets) diam-diam membuka SEMUA cabang lain
-- untuk karyawan yang hanya ditugaskan ke cabang itu.
--
-- Yang ditutup di sini adalah jalur salah-simpan: owner mematikan semua chip
-- di Pengaturan → Tim lalu klik Simpan, dan karyawannya mendadak buta. UI
-- sudah memperingatkan tapi tetap mengizinkan.
--
-- Dua bentuk kosong ditolak:
--   * array null / kosong;
--   * array yang isinya tidak ada satu pun outlet sah milik org itu (loop
--     lama melewatinya diam-diam, hasil akhirnya sama-sama kosong).
-- `raise` membatalkan seluruh panggilan, termasuk `delete` di awal, jadi
-- penugasan lama tetap utuh.
--
-- Owner/admin tidak terpengaruh RLS cabang (is_org_manager), tapi aturan ini
-- berlaku untuk semua anggota — tidak ada alasan sah menyimpan daftar kosong.
--
-- `set search_path` wajib ditulis ulang: CREATE OR REPLACE mengganti seluruh
-- konfigurasi fungsi, jadi hasil 0055 akan hilang tanpanya.
-- ============================================================

create or replace function set_member_outlets(p_member_id uuid, p_outlet_ids uuid[])
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_outlet uuid;
begin
  select org_id into v_org from memberships where id = p_member_id;
  if v_org is null then raise exception 'Member not found'; end if;
  if not is_org_manager(v_org) then raise exception 'Forbidden'; end if;

  if coalesce(array_length(p_outlet_ids, 1), 0) = 0 then
    raise exception 'Pilih minimal satu cabang untuk anggota ini.';
  end if;

  -- Replace: hapus penugasan lama, lalu isi yang baru.
  delete from membership_outlets where membership_id = p_member_id;

  foreach v_outlet in array p_outlet_ids loop
    -- Hanya outlet milik org yang sama (cegah lintas-org).
    if exists (select 1 from outlets o where o.id = v_outlet and o.org_id = v_org) then
      insert into membership_outlets (membership_id, outlet_id, org_id)
      values (p_member_id, v_outlet, v_org)
      on conflict do nothing;
    end if;
  end loop;

  if not exists (select 1 from membership_outlets where membership_id = p_member_id) then
    raise exception 'Cabang yang dipilih tidak ditemukan di toko ini.';
  end if;
end;
$$;
