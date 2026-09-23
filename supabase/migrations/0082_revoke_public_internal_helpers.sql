-- Tutup fungsi pembantu internal yang ternyata bisa dipanggil siapa pun.
--
-- Ditemukan saat memverifikasi restore ke self-host: replika lokal terbukti
-- punya ACL IDENTIK dengan produksi (353 baris, nol beda), jadi auditnya bisa
-- dilakukan tanpa menyentuh produksi.
--
-- Akar masalahnya adalah jebakan default privileges Supabase. Setiap fungsi baru
-- di `public` otomatis diberi EXECUTE ke anon/authenticated/service_role SAAT
-- DIBUAT. Migrasi lama mencoba menutupnya, tapi dari arah yang salah:
--
--   * check_rate_limit — `revoke ... from anon, authenticated` berhasil mencabut
--     grant eksplisit, tapi PUBLIC (=X) tetap ada dan anon mewarisinya.
--   * restore_org_data — `revoke all ... from public` tidak menyentuh grant
--     EKSPLISIT ke anon yang diberikan default privileges.
--
-- Dampak check_rate_limit (satu-satunya yang serius): ketiga parameternya
-- datang dari pemanggil dan badannya tidak memeriksa siapa pemanggilnya.
-- Satu-satunya pengaman halaman pelacakan (`track_service`) terhadap penebakan
-- nomor servis yang BERURUTAN adalah bucket `track:<org_id>`. Anon bisa:
--   - mengosongkan bucket itu dengan jendela waktu negatif
--     (make_interval(secs => -N) membuat kondisi hapus mencakup semuanya),
--     lalu menelusuri seluruh tiket sebuah toko tanpa hambatan;
--   - memenuhinya terus-menerus, mematikan halaman pelacakan toko itu;
--   - menyisipkan kunci unik tanpa batas ke `rate_events`.
-- track_service sendiri TIDAK mengembalikan nama/HP pelanggan — hanya
-- perangkat, status, dan riwayat non-internal — jadi ini bukan kebocoran data
-- pribadi, tapi pembatasnya tidak boleh bisa dibobol dari luar.
--
-- SENGAJA TIDAK DISENTUH: is_org_active. Ia juga bisa dipanggil anon, tapi
-- dievaluasi oleh 23 kebijakan RLS dengan hak pengguna yang login — mencabut
-- EXECUTE-nya akan menggagalkan SEMUA penulisan data. Kebocorannya (apakah
-- langganan sebuah org aktif, dan hanya bila UUID org-nya diketahui) tidak
-- sepadan dengan risiko itu.

-- Hanya dipanggil track_service (SECURITY DEFINER, berjalan sebagai pemiliknya),
-- tidak oleh frontend dan tidak oleh kebijakan RLS mana pun.
revoke execute on function public.check_rate_limit(text, integer, integer)
  from public, anon, authenticated;

-- Hanya dipanggil create_purchase_order / update_purchase_order (keduanya
-- SECURITY DEFINER). Membaca nama barang sebuah org dari UUID barang.
revoke execute on function public.po_lines_checked(uuid, jsonb)
  from public, anon, authenticated;

-- DIPANGGIL frontend (supabase-adapter.ts) oleh owner yang login, jadi
-- authenticated tetap. Anon tidak pernah membutuhkannya. Badannya sudah menolak
-- lewat is_org_owner(); ini lapisan kedua yang dimaksud migrasi lamanya.
revoke execute on function public.restore_org_data(uuid, jsonb) from anon;
