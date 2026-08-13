# Runbook — Cutover ke Listener GoPay

Urutan lengkap dari nol sampai produksi menagih lewat GoPay. Ikuti berurutan; tiap fase punya
**gerbang** yang harus hijau sebelum lanjut.

Referensi kode perangkat: [`gopay-listener-android.md`](gopay-listener-android.md).

| | |
|---|---|
| Staging | `fpwwswngqpftaixdlozo` |
| Produksi | `vmitplpvncfvyimgyxrn` |
| Repo | `k24reps/fixmaster`, branch kerja `staging` |

> **Prinsip pengaman:** menghapus fungsi dari repo **tidak** meng-undeploy-nya. `create-invoice`,
> `duitku-webhook`, dan `fersaku-webhook` tetap hidup di server sampai dihapus manual. Itu jaring
> pengaman kita — Duitku tetap bisa mengonfirmasi invoice yang melayang selama masa transisi.
> Jangan hapus sampai Fase 6.

---

## Fase 0 — Terminal, folder kerja, CLI

### 0.1 Pakai Git Bash, bukan cmd.exe

Seluruh runbook ini mengasumsikan **Git Bash**. Di sana sudah tersedia `openssl` dan `date`
yang dipakai beberapa perintah, plus quoting yang benar untuk `curl`. Di `cmd.exe` perintah
tersebut gagal (`'openssl' is not recognized`).

Kalau terpaksa di cmd/PowerShell, pengganti `openssl rand -hex 32` yang setara dan aman:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 0.2 Wajib: pindah ke folder proyek dulu

```bash
cd "C:/Users/Rif/Documents/FixMaster"
```

**Ini penyebab kegagalan paling umum.** Supabase CLI membaca `supabase/migrations` **relatif
terhadap folder tempat kamu berdiri**. Dijalankan dari home directory, CLI melihat nol migrasi
lokal padahal remote punya puluhan, lalu memuntahkan:

```
Remote migration versions not found in local migrations directory.
```

Ia kemudian menyarankan `supabase migration repair --status reverted 0001 … 0042`.

> **JANGAN jalankan saran itu.** Perintah tersebut menandai seluruh migrasi yang sudah ter-apply
> sebagai belum dijalankan. Push berikutnya akan mencoba menerapkan ulang semuanya ke database
> yang objeknya sudah ada — error beruntun, dan sebagian migrasi bisa merusak data yang hidup.
> Saran itu benar hanya untuk riwayat yang memang rusak. Kalau pesannya muncul, **cek dulu kamu
> berdiri di folder mana** — 99% kasusnya cuma salah folder.

Kalau kamu sempat menjalankan CLI dari folder lain, ia meninggalkan folder `supabase/.temp` liar
di sana. Hapus supaya tidak membingungkan nanti:

```bash
rm -rf "C:/Users/Rif/supabase"
```

### 0.3 Pasang CLI

```bash
npm install -g supabase
```

atau lewat Scoop (Windows):

```bash
scoop install supabase
```

### Gerbang Fase 0

```bash
supabase --version
```

mencetak nomor versi, **dan** `pwd` menunjukkan kamu berada di folder FixMaster.

---

## Fase 1 — Staging: database & fungsi

### 1.1 Login & link

```bash
supabase login
```

Browser terbuka untuk otorisasi. Lalu:

```bash
supabase link --project-ref fpwwswngqpftaixdlozo
```

Akan diminta **password database staging**. Ini kredensialmu — jangan tempel ke chat mana pun.

### 1.2 Lihat dulu apa yang akan di-apply

```bash
supabase migration list
```

Pastikan `0043_gopay_listener` muncul sebagai pending, `0001`–`0042` terisi di kolom Local **dan**
Remote, dan tidak ada migrasi lain yang tak kamu kenali.

Kolom Local kosong sementara Remote terisi = kamu berdiri di folder yang salah. Kembali ke 0.2.

### 1.3 Apply

```bash
supabase db push
```

### 1.4 Secret listener

Generate dulu, dan **catat nilainya** — angka yang sama harus masuk ke APK nanti:

```bash
openssl rand -hex 32
```

(di cmd/PowerShell: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

Simpan ke staging (ganti `<nilai>` dengan hasil di atas):

```bash
supabase secrets set GOPAY_LISTENER_SECRET=<nilai> --project-ref fpwwswngqpftaixdlozo
```

### 1.5 Deploy fungsi

```bash
supabase functions deploy gopay-listener --project-ref fpwwswngqpftaixdlozo
```

### Gerbang Fase 1

Fungsi harus **menolak** request tanpa secret:

```bash
curl -i -X POST "https://fpwwswngqpftaixdlozo.supabase.co/functions/v1/gopay-listener" -H "Content-Type: application/json" -d "{\"text\":\"Kamu menerima Rp1 dari Test\",\"postedAt\":0}"
```

Harus `401` (secret terpasang) atau `503` (secret belum terbaca). **Kalau balasannya 2xx, berhenti**
— artinya pembayaran bisa dipalsukan tanpa kredensial apa pun.

Lalu dengan secret yang benar, dan `postedAt` waktu sekarang:

```bash
curl -i -X POST "https://fpwwswngqpftaixdlozo.supabase.co/functions/v1/gopay-listener" -H "Content-Type: application/json" -H "X-Listener-Secret: <nilai>" -d "{\"text\":\"Kamu menerima Rp1 dari Test\",\"postedAt\":$(date +%s000)}"
```

Harus `200` dengan `{"matched":false,...}` — pipeline hidup, cuma belum ada invoice bernominal Rp1.

---

## Fase 2 — Bangun APK listener

1. Android Studio → **New Project** → **Empty Views Activity**
2. Name `FixMaster Listener`, package `com.fixmaster.gopaylistener`, bahasa **Kotlin**, minSdk **24**
3. Ganti `AndroidManifest.xml`, tambahkan `MainActivity.kt` dan `GopayListenerService.kt` sesuai
   [`gopay-listener-android.md`](gopay-listener-android.md)
4. Isi `ENDPOINT` dengan URL staging dan `SECRET` dengan nilai dari Fase 1.4
5. **Build → Build APK**, lalu pasang ke HP yang akan jadi listener

Di HP:

6. Buka aplikasi → tombol **Buka pengaturan Notification access** → aktifkan *FixMaster Listener*
7. **Settings → Apps → FixMaster Listener → Battery → Unrestricted** (tanpa ini Doze membunuh
   service dalam hitungan jam dan pembayaran berhenti terdeteksi tanpa peringatan apa pun)
8. Pastikan aplikasi GoPay/GoBiz di HP itu notifikasinya **aktif**

**Gerbang:** setelah mengaktifkan Notification access, matikan-hidupkan sekali agar service ter-bind.

---

## Fase 3 — Temukan nama paket yang benar

Ini fase yang paling sering dilewati dan paling sering jadi penyebab "kok tidak jalan".
Daftar `ALLOWED` di kode adalah **tebakan**. Kalau nama paketnya meleset, listener diam total
tanpa error apa pun.

1. Set `DISCOVERY_MODE = true`, build & pasang ulang
2. Sambungkan HP ke komputer, jalankan:

```bash
adb logcat -s GopayDiscovery
```

3. Lakukan **satu pembayaran kecil sungguhan** (mis. Rp1.000) ke QRIS merchant-mu dari akun lain
4. Catat `pkg=` yang muncul bersamaan dengan notifikasi pembayaran
5. Kunci `ALLOWED` ke nama paket itu saja, set `DISCOVERY_MODE = false`, build & pasang ulang

> `DISCOVERY_MODE` mencatat isi notifikasi **apa pun** ke logcat. Jangan biarkan menyala.

**Gerbang:** kamu tahu persis nama paket pengirim notifikasi pembayaran.

---

## Fase 4 — Uji end-to-end di staging

### 4.1 Integration test

```bash
npm run test:integration
```

### 4.2 Env web

Isi `.env.local`:

```
VITE_GOPAY_QRIS_URL=<URL publik gambar QRIS merchant-mu>
```

Gambar QRIS-nya upload ke Supabase Storage bucket publik. CSP di `vercel.json` sudah mengizinkan
`img-src ... https:`, jadi host mana pun ber-HTTPS aman.

```bash
npm run dev
```

### 4.3 Transaksi sungguhan

1. Settings → Langganan → pilih paket
2. Catat **nominal persisnya** (mis. Rp49.037 — angka belakang itu penanda invoice)
3. Scan QRIS, bayar **tepat** sejumlah itu dari akun GoPay lain
4. Diamkan halaman — jangan refresh manual

### Gerbang Fase 4 (yang paling menentukan)

Masa aktif langganan bertambah **sendiri** dalam hitungan detik, tanpa kamu menyentuh apa pun.

Kalau tidak bertambah, telusuri berurutan:

```bash
supabase functions logs gopay-listener --project-ref fpwwswngqpftaixdlozo
```

| Yang terlihat di log | Artinya |
|---|---|
| Tidak ada baris sama sekali | HP tidak mengirim — cek Notification access, baterai, nama paket (Fase 3) |
| `secret mismatch` | SECRET di APK ≠ secret di server |
| `stale notification` | Jam HP meleset jauh dari waktu sebenarnya |
| `not an incoming payment` | Parser menolak teksnya — kirim teks aslinya, parser perlu disesuaikan |
| `no matching invoice` | Nominal yang dibayar tidak sama persis dengan invoice |
| `payment applied` | Berhasil — masalahnya di UI/realtime, bukan pembayaran |

**Jangan lanjut ke Fase 5 sebelum gerbang ini hijau.**

---

## Fase 5 — Produksi

Baru setelah Fase 4 terbukti. Urutannya dirancang agar tidak ada celah pemasukan.

### 5.1 Cek invoice pending provider lama

Pastikan lagi kamu berdiri di folder proyek (`pwd`), lalu:

```bash
supabase link --project-ref vmitplpvncfvyimgyxrn
```

```bash
supabase db query "select id, org_id, provider, amount, created_at from invoices where status='pending' and provider in ('duitku','fersaku')"
```

Kalau ada isinya: hubungi org tersebut dulu. Mereka mungkin sedang menuju halaman bayar yang
sebentar lagi tidak terkonfirmasi otomatis.

### 5.2 Migration + secret + fungsi

```bash
supabase db push
```

Generate secret **baru** untuk produksi — jangan pakai ulang punya staging:

```bash
openssl rand -hex 32
```

(di cmd/PowerShell: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

```bash
supabase secrets set GOPAY_LISTENER_SECRET=<nilai-produksi> --project-ref vmitplpvncfvyimgyxrn
```

```bash
supabase functions deploy gopay-listener --project-ref vmitplpvncfvyimgyxrn
```

### 5.3 APK produksi

Build ulang APK dengan `ENDPOINT` produksi dan secret produksi, pasang di HP listener.
Uji dengan Rp1.000 sungguhan sebelum lanjut.

### 5.4 Frontend

Set `VITE_GOPAY_QRIS_URL` di **environment variable Vercel (Production)**, lalu merge `staging` → `main`.

> Selama variabel ini kosong, produksi turun ke invoice mock dan **tidak menagih apa pun**.

### 5.5 Relink balik ke staging

Wajib, supaya `db push` berikutnya tidak nyasar ke produksi:

```bash
supabase link --project-ref fpwwswngqpftaixdlozo
```

---

## Fase 6 — Bersih-bersih (tunda beberapa hari)

Tunggu sampai tidak ada lagi invoice pending Duitku/Fersaku (ulangi query 5.1). Baru:

```bash
supabase functions delete duitku-webhook --project-ref vmitplpvncfvyimgyxrn
```

```bash
supabase functions delete create-invoice --project-ref vmitplpvncfvyimgyxrn
```

```bash
supabase functions delete fersaku-webhook --project-ref vmitplpvncfvyimgyxrn
```

Ulangi untuk staging. Setelah ini, hentikan langganan/akun Duitku bila tidak dipakai lagi.

---

## Rollback

| Situasi | Tindakan |
|---|---|
| Listener bermasalah, Duitku belum dihapus (sebelum Fase 6) | Revert merge `main`, deploy ulang frontend. Fungsi Duitku masih hidup → tagihan jalan lagi. |
| Sudah lewat Fase 6 | Kosongkan `VITE_GOPAY_QRIS_URL` → billing turun ke invoice mock, owner konfirmasi manual. Bukan solusi jangka panjang. |

Karena itu **jangan kerjakan Fase 6 terburu-buru.** Selama fungsi lama masih ada, kamu punya jalan pulang.

---

## Pemantauan rutin

Ini bukan sistem yang bisa ditinggal. Minimal seminggu sekali:

```bash
supabase functions logs gopay-listener --project-ref vmitplpvncfvyimgyxrn
```

- `incoming payment with no matching invoice` → **antrian kerja manusia.** Uang masuk tapi tidak
  ada invoice yang cocok (pelanggan bayar nominal bulat). Cocokkan manual lalu konfirmasi.
- **Tidak ada log sama sekali selama berhari-hari** → kemungkinan besar HP listener mati, bukan
  berarti tidak ada yang berlangganan. Periksa HP-nya.

Cek juga invoice yang menggantung:

```bash
supabase db query "select id, org_id, amount, created_at from invoices where status='pending' and provider='gopay' and created_at < now() - interval '1 hour'"
```
