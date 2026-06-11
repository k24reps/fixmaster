# Skrip Onboarding Pilot FixMaster

> Playbook untuk mendampingi toko pilot dari "setuju coba" → "jalan sendiri".
> Mengikuti alur produk **asli** (mode cloud). Dibuat: 11 Jun 2026.
> Pakai bareng [roadmap-penjualan.md](roadmap-penjualan.md).

---

## Prinsip dasar (baca dulu)

1. **Kamu memandu, mereka yang mengetik.** Jangan ambil alih keyboard/HP. Kalau kamu yang isi, kamu tak akan tahu di mana mereka tersangkut — padahal gesekan itulah data paling berharga.
2. **Diam dan amati saat mereka bingung.** Tahan 5 detik sebelum membantu. Catat tiap kebingungan; itu roadmap aslimu.
3. **Pakai data toko mereka yang SUNGGUHAN**, bukan data contoh. Onboarding yang berhasil = tiket servis nyata pertama masuk hari itu juga.
4. **Target sukses sesi:** dari nol → 1 tiket servis nyata + 1 transaksi kasir, dalam ≤ 30 menit.

---

## Sebelum datang (persiapan, 5 menit)

Minta pilot menyiapkan ini lewat WA sehari sebelumnya:

> "Bang, besok kita pasang ya. Tolong siapin: (1) nama & alamat toko, (2) no HP toko, (3) kira-kira saldo kas/tunai sekarang berapa, (4) kalau ada, 2–3 servisan yang lagi dikerjakan sekarang biar langsung kita masukin. Nggak usah ribet, 10 menit kelar."

Kamu sendiri siapkan:
- `[ ]` Link daftar FixMaster (produksi)
- `[ ]` HP/laptop pilot terkoneksi internet (atau pastikan offline-first jalan)
- `[ ]` Catatan kosong untuk **friction log** (lihat bagian akhir)

---

## Bagian 1 — Daftar akun (2 menit)

1. Buka landing → klik **"Mulai Gratis 14 Hari"**.
2. Pilot bikin akun (email + password mereka sendiri — **bukan** punyamu).
3. **Yang kamu katakan:**
   > "Ini akun punya abang ya, pakai email abang. Aku nggak nyimpen password abang. Gratis 14 hari, nggak ada potong kartu, nggak ada kontrak."

> [!NOTE]
> Akun yang mendaftar otomatis jadi **Owner** organisasi. Trial 14 hari langsung aktif begitu setup selesai.

---

## Bagian 2 — Wizard setup (5 langkah, ~8 menit)

Wizard muncul otomatis setelah daftar. Urutannya: **Profil → Outlet → Wallet → Kategori → Target.**

### Langkah 1 — Profil Usaha
- **Nama Usaha** (wajib) → mereka isi nama toko asli.
- **Nama Anda (Pemilik)** → nama mereka.
- Alamat, Inisial Servis (auto-terisi dari nama usaha — biarkan), No. Telepon.
- **Katakan:** "Inisial servis ini nanti jadi kode tiket, misal SGS-001. Biarin aja yang otomatis kalau nggak ada preferensi."

### Langkah 2 — Outlet
- Untuk toko tunggal: **kosongkan saja** → otomatis pakai nama & alamat toko.
- **Katakan:** "Cabang cuma diisi kalau abang punya lebih dari satu lokasi. Punya satu? Lewat aja, langsung lanjut."

### Langkah 3 — Wallet / Kas
- Sudah ada "Tunai" default. Isi **saldo awal** = uang kas toko sekarang.
- Kalau pakai QRIS/transfer, tambah wallet (mis. "QRIS", "Bank BCA").
- **Katakan:** "Ini biar tiap duit masuk-keluar kecatat per kantong. Saldo sekarang berapa? Itu aja yang diisi."

### Langkah 4 — Kategori Perangkat
- Default sudah ada: Laptop, HP/Smartphone, Printer, PC/Komputer.
- **Tanya:** "Abang servis apa aja? Ada yang kurang? TV, konsol, kamera?" → mereka tambah/hapus.

### Langkah 5 — Target & Biaya (opsional)
- **Katakan:** "Ini buat target bulanan, bisa diisi nanti. Skip dulu aja biar cepat masuk." → klik **Selesai & Mulai**.

> [!WARNING]
> **Caveat teknis yang harus kamu amati:** kategori & target saat ini disimpan **per-perangkat** (localStorage), belum sinkron antar-device. Kalau pilot setup di HP lalu buka di komputer toko, kategori bisa beda. **Catat** kalau ini jadi masalah nyata buat mereka — ini kandidat perbaikan Fase 1.

---

## Bagian 3 — "Aha moment": tiket servis nyata pertama (8 menit)

Ini momen paling menentukan. Jangan demo fitur — **masukkan servisan asli yang sedang mereka kerjakan**.

1. Buka menu **Servis** → buat tiket baru.
2. Pilot isi: pelanggan, perangkat, keluhan, estimasi biaya.
3. Tunjukkan tiket dapat **kode otomatis** (mis. SGS-001) & status awal.
4. **Katakan:**
   > "Nah, ini yang tadi abang catat di buku, sekarang ada di sini. Nanti pelanggan bisa dikasih kode ini buat cek status sendiri. Coba abang masukin satu lagi yang lain."
5. Minta mereka masukkan **tiket kedua sendiri, tanpa kamu pandu.** ← ini tes nyata apakah mereka paham.

> [!TIP]
> Kalau pilot bisa bikin tiket kedua tanpa dibantu, kamu sudah menang separuh. Kalau masih bingung → **catat persis di mana** macetnya. Itu prioritas perbaikan #1.

---

## Bagian 4 — Tutup loop: kasir & status (5 menit)

1. Ubah status satu tiket → "Selesai".
2. Buka **Kasir (POS)** → buat transaksi: jasa servis + (kalau ada) sparepart.
3. Tunjukkan **uang masuk otomatis ke wallet** yang tadi dibuat.
4. **Katakan:** "Jadi servis → kasir → duit kecatat, nyambung semua. Akhir bulan abang nggak perlu ngitung manual lagi, laporannya otomatis."

---

## Bagian 5 — Serah terima & jadwal cek (3 menit)

1. **Katakan:**
   > "Mulai sekarang, tiap ada servisan masuk, langsung input di sini ya — jangan di buku lagi. Aku WA abang 3 hari lagi buat nanya gimana rasanya. Ada yang ribet, langsung bilang, itu malah ngebantu aku."
2. Pastikan mereka tahu cara: buka app lagi, login, buat tiket.
3. **Set ekspektasi follow-up** (lihat irama di bawah).

> [!IMPORTANT]
> Karyawan **tidak** dibuat saat onboarding (mode cloud). Kalau toko punya karyawan yang perlu akses, itu lewat **undangan** menyusul — agendakan di sesi follow-up, jangan tambah beban di sesi pertama.

---

## Irama follow-up (3 minggu)

| Waktu | Cara | Yang ditanya |
|---|---|---|
| **H+3** | WA singkat | "Udah sempat masukin servisan? Ada yang bikin males/ribet?" |
| **H+7** | WA / mampir | "Minggu ini kepakai nggak? Masih balik ke buku nggak?" |
| **H+14** | Telepon/mampir | "Kalau ini berbayar Rp99rb/bln, abang lanjut? Jujur aja." |
| **H+21** | Mampir | Cek: masih aktif tanpa diingatkan? Lihat scorecard. |

> [!CAUTION]
> Kalau di H+7 mereka **sudah balik ke buku/WA** "karena lebih cepat" — **jangan tawarkan fitur baru.** Gali kenapa. Hampir selalu akarnya: input terlalu lama, atau tak bisa bawa data lama. Itu temuan emas, bukan kegagalan.

---

## Friction Log (isi tiap sesi)

Catat mentah, jujur. Satu baris per kejadian.

```
Tanggal | Toko | Langkah | Apa yang terjadi | Mereka nyerah/lanjut? | Ide perbaikan
--------|------|---------|------------------|----------------------|---------------
        |      |         |                  |                      |
```

Pola yang berulang di ≥2 toko = prioritas perbaikan sebelum Fase 1.

---

## Checklist sukses onboarding (per toko)

- `[ ]` Akun dibuat dengan email mereka sendiri
- `[ ]` Wizard selesai (5 langkah), pakai data toko nyata
- `[ ]` ≥ 1 tiket servis NYATA masuk saat sesi
- `[ ]` Pilot bikin tiket kedua **tanpa dibantu**
- `[ ]` ≥ 1 transaksi kasir tutup loop ke wallet
- `[ ]` Mereka tahu cara buka & login ulang sendiri
- `[ ]` Jadwal follow-up H+3 disepakati
- `[ ]` Friction log sesi ini terisi

Kalau 8 dari 8 tercentang → onboarding berhasil. Sisanya tinggal retensi.
