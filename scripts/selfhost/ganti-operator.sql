-- Ganti akun operator (platform_admins) dalam SATU transaksi: pasang yang baru
-- dulu, baru lepas yang lama - tidak pernah ada saat tanpa operator.
-- Akun baru HARUS sudah terdaftar (Daftar di fixmaster.app). Jalankan di server:
--   Get-Content ganti-operator.sql | docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 -v baru=EMAIL_BARU -v lama=EMAIL_LAMA
-- Opsional hapus akun login lama sekaligus: tambah  -v hapus_akun=ya
-- Jejak operator_actions tetap utuh (menyimpan actor_email sebagai teks).

\if :{?hapus_akun}
\else
  \set hapus_akun tidak
\endif

begin;
select set_config('fm.baru', lower(trim(:'baru')), true),
       set_config('fm.lama', lower(trim(:'lama')), true),
       set_config('fm.hapus', :'hapus_akun', true) \gset

do $$
declare
  v_baru text := current_setting('fm.baru');
  v_lama text := current_setting('fm.lama');
  v_new uuid;
begin
  if v_baru = v_lama then
    raise exception 'Email baru dan lama sama.';
  end if;
  select id into v_new from auth.users where lower(email) = v_baru;
  if v_new is null then
    raise exception 'Akun % belum terdaftar. Daftar dulu di fixmaster.app, lalu ulangi.', v_baru;
  end if;

  insert into platform_admins (user_id, email, note)
  values (v_new, v_baru, 'pengganti ' || v_lama || ' (' || to_char(now(), 'YYYY-MM-DD') || ')')
  on conflict (user_id) do nothing;

  delete from platform_admins
  where lower(email) = v_lama
     or user_id in (select id from auth.users where lower(email) = v_lama);

  if not exists (select 1 from platform_admins where user_id = v_new) then
    raise exception 'Operator baru tidak terpasang - dibatalkan.';
  end if;

  if current_setting('fm.hapus') = 'ya' then
    if exists (select 1 from memberships m join auth.users u on u.id = m.user_id
               where lower(u.email) = v_lama and m.deleted_at is null) then
      raise exception 'Akun % masih anggota sebuah toko - tidak dihapus. Ulangi tanpa hapus_akun.', v_lama;
    end if;
    delete from auth.users where lower(email) = v_lama;
  end if;
end $$;

select email as operator_sekarang, to_char(created_at, 'YYYY-MM-DD') as sejak from platform_admins order by created_at;
select case when exists (select 1 from auth.users where lower(email) = current_setting('fm.lama'))
            then 'akun lama masih ada (login biasa, bukan operator)'
            else 'akun lama sudah dihapus' end as akun_lama;
commit;
