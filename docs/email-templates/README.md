# Email autentikasi FixMaster

Template email yang dikirim Supabase Auth, ditulis dalam bahasa visual produk
("Precision Electronics Bench") supaya penerima langsung mengenalinya sebagai
FixMaster dan bukan email phishing.

## Kenapa "Error sending recovery email" muncul

Terdiagnosis 2 September 2026. SMTP kustom **sudah** aktif di Supabase
(Resend, `smtp.resend.com:465`, pengirim `noreply@fixmaster.app`), tetapi
domain `fixmaster.app` **belum terverifikasi di Resend**. Terbukti dari DNS:

| Record | Status saat diagnosis |
| --- | --- |
| `fixmaster.app` TXT (SPF) | tidak ada — hanya TXT verifikasi Google |
| `resend._domainkey.fixmaster.app` | tidak ada |
| `send.fixmaster.app` | tidak ada |
| `_dmarc.fixmaster.app` | tidak ada |

Tanpa DKIM, Resend menolak mengirim atas nama domain itu. Supabase menerima
kegagalan SMTP dan menampilkannya sebagai "Error sending recovery email".

Ini juga menjelaskan kenapa masalahnya baru ketahuan sekarang: `signUp()` satu-
satunya alur lain yang butuh email, dan proyek ini lama berjalan dengan
konfirmasi email nonaktif, jadi tidak ada email yang pernah benar-benar dikirim.

### Cara memperbaiki

1. **Resend → Domains → Add Domain** → `fixmaster.app`.
2. Resend menampilkan 3 record (DKIM `resend._domainkey`, SPF pada
   `send.fixmaster.app`, dan MX). Salin apa adanya.
3. **Vercel → Project → Settings → Domains → fixmaster.app → DNS Records**
   (nameserver domain ini `ns1/ns2.vercel-dns.com`, jadi DNS-nya dikelola di
   Vercel, bukan di registrar). Tambahkan ketiga record itu.
4. Kembali ke Resend, tekan **Verify**. Propagasi biasanya beberapa menit.
5. Tambahkan DMARC (opsional tapi sangat disarankan agar tidak masuk spam):
   TXT pada `_dmarc` → `v=DMARC1; p=none; rua=mailto:dmarc@fixmaster.app`
6. Uji ulang dari halaman "Lupa password" di aplikasi.

Selama domain belum terverifikasi, Resend hanya mengizinkan pengiriman ke
alamat pemilik akun Resend-nya sendiri — itu sebabnya pengiriman ke
`nuaraservice@gmail.com` gagal.

## Pengaturan SMTP di Supabase

`Authentication → Emails → SMTP Settings`. Nilai yang sudah terpasang dan
benar:

| Field | Nilai |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | API key Resend |
| Sender email | `noreply@fixmaster.app` |
| Sender name | `FixMaster` |

## Memasang template

`Authentication → Emails → Templates`. Tempel isi file ke tab yang sesuai:

| File | Tab Supabase | Subject yang disarankan |
| --- | --- | --- |
| `reset-password.html` | Reset Password | `Atur ulang password FixMaster kamu` |
| `confirm-signup.html` | Confirm signup | `Aktifkan akun FixMaster kamu` |

Aplikasi hanya memicu dua email itu: `resetPasswordForEmail()` dan `signUp()`
(lihat `src/data/supabase-client.ts`). Tab lain — Magic Link, Invite user,
Change Email Address, Reauthentication — biarkan default sampai produk
benar-benar memakainya; template bermerek yang tidak pernah terkirim hanya
jadi beban perawatan.

### Variabel yang dipakai

`{{ .ConfirmationURL }}` (tautan aksi), `{{ .Email }}` (penerima),
`{{ .SiteURL }}` (alamat aplikasi). Semuanya diisi Supabase saat pengiriman.

## Keputusan teknis di dalam template

Beberapa hal sengaja menyimpang dari sistem desain aplikasi, karena email
bukan halaman web:

- **Font sistem, bukan Space Grotesk / Inter / JetBrains Mono.** Klien email
  tidak memuat webfont. Dipakai `'Segoe UI', Roboto, Helvetica, Arial` untuk
  teks dan `ui-monospace, SFMono-Regular, Consolas` untuk readout — tumpukan
  ini tetap memberi kontras mono/sans yang jadi ciri produk.
- **Ukuran `px` literal, bukan token.** Custom property CSS tidak didukung
  Outlook dan sebagian besar klien; nilai harus inline dan absolut.
- **Tata letak `<table>`, bukan flex/grid.** Outlook merender dengan mesin
  Word.
- **Warna ditulis eksplisit di setiap elemen.** Tanpa itu, klien bermode gelap
  menebak sendiri dan hasilnya teks gelap di atas panel gelap.
- **Preheader tersembunyi** di baris pertama: itu teks yang tampil di daftar
  inbox, dan menentukan apakah email terbaca sah atau seperti spam.
- **Tautan mentah selalu ditampilkan** di bawah tombol. Sebagian klien
  memblokir tombol berlatar warna.

## Yang perlu dicek sebelum dianggap selesai

- Template reset menulis **"berlaku 1 jam"**. Itu default Supabase
  (`Email OTP Expiration` = 3600 detik). Kalau nilainya diubah di
  `Authentication → Rate Limits`, teks di template harus ikut diubah — janji
  yang meleset lebih merusak kepercayaan daripada tidak menyebut angka.
- Kirim uji ke Gmail, Outlook.com, dan satu klien ponsel. Panel gelap adalah
  bagian identitas produk, tetapi sebagian klien memaksa inversi warna; yang
  dijaga di sini adalah keterbacaannya tetap utuh, bukan tampilannya identik.
