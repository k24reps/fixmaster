# AGENTS.md — Panduan untuk AI Agent (FixMaster)

> File ini adalah **sumber kebenaran aturan** untuk agent AI yang bekerja di repo FixMaster.
> Ia tinggal di dalam repo (ikut git), jadi **tetap berlaku walau akun/mesin login berganti**.
> Konfigurasi akun (mis. `~/.gemini`) berada di luar repo dan bisa hilang saat ganti akun — jadi **aturan yang penting harus ada di sini, bukan di setting akun.**

---

## 1. Domain — WAJIB dipahami dulu (anti salah-konteks)

**FixMaster = aplikasi web manajemen usaha REPARASI GADGET & ELEKTRONIK.**
Contoh: konter HP, jasa servis laptop, reparasi tablet/printer/elektronik konsumen.

> [!] BUKAN bengkel kendaraan (motor/mobil/otomotif), bukan servis mesin industri.
> Kata **"servis"** di seluruh produk = **perbaikan perangkat elektronik**, bukan servis kendaraan.

Kata Indonesia "bengkel" sering disalahartikan sebagai bengkel kendaraan. Jangan berasumsi — kalau ragu soal konteks bisnis, baca `docs/obsidian-vault/Domain & Scope.md`.

---

## 2. Aturan baca vault (HYBRID — hemat token tapi tetap akurat)

Repo punya knowledge base Obsidian di `docs/obsidian-vault/`. Gunakan secara **bertingkat**, jangan muat semua.

### Untuk tugas NON-TRIVIAL (fitur, refactor, perubahan multi-file, desain, debugging):
1. Baca **anchor** ini dulu (ringkas, murah, mencegah salah arah):
   - `docs/obsidian-vault/00 - FixMaster MOC.md` (peta/router)
   - `docs/obsidian-vault/Domain & Scope.md` (pagar domain)
   - `docs/obsidian-vault/Conventions.md` (pola, struktur, perintah)
2. Lalu **ikuti `[[wikilink]]` secara selektif** hanya ke catatan yang relevan dengan tugas (mis. Sidebar, Data Layer, Signature Pages).
3. Baca kode asli sesuai path/simbol yang ditunjuk catatan.

### Untuk tugas TRIVIAL (typo, jalankan perintah, satu baris, pertanyaan cepat):
- **Lewati** pembacaan vault. Langsung kerjakan.

### Jangan:
- ❌ Memuat seluruh vault (11+ catatan) sekaligus — boros token, lawan tujuan.
- ❌ Mengandalkan ingatan untuk domain — selalu hormati Domain & Scope.

---

## 3. Konvensi singkat (detail di Conventions.md)

- **Warna**: selalu `var(--token)` dari `src/styles/tokens.css` — jangan hardcode hex (otomatis benar dark/light).
- **Visual/UI WAJIB otentik "Precision Electronics Bench"**: tiap elemen visual baru harus original, unik, dan khas FixMaster — pakai motif bench (LED status, readout **mono**, **spine** tepi kartu, **tick-gauge**, **divider titik**). **DILARANG** pola UI generik SaaS (mis. ikon gembok polos untuk fitur terkunci, badge/komponen bawaan library tanpa token). Contoh benar: fitur terkunci di sidebar = baris redup + badge **LED brand + "PRO" mono**, bukan padlock. Detail & pilar warna di `docs/obsidian-vault/Design System.md`.
- **Data**: baca via `useCollection('<koleksi>')`, mutasi via `repository` (`src/data/`).
- **Logika domain**: tulis murni & testable di `src/lib/business/`, panggil dari UI.
- **Ikon**: hanya lewat komponen `Icon` (`src/components/ui/Icon.tsx`).
- **i18n**: teks UI lewat `useT()` + translation key, bukan string literal.
- **Import alias**: `@/` → `src/`.

## 4. Verifikasi (default setelah perubahan)

```bash
npm run build   # type-check + build
npm run test    # vitest unit (445 test, offline)
npm run test:integration  # RLS/RPC ke staging (butuh .env.test.local)
npm run lint    # eslint
```
Untuk perubahan UI: foto render asli via Playwright (`scripts/`), jangan berasumsi "kelihatannya benar". Pelajaran lengkap di `docs/obsidian-vault/Decisions & Bug Fixes.md`.

## 5. Pemeliharaan knowledge base (WAJIB — bagian dari "selesai")

> [!IMPORTANT]
> Update vault **bukan langkah terpisah yang boleh ditunda**. Ia adalah bagian dari *definition of done*: sebuah tugas baru dianggap **selesai** bila kode **dan** dokumentasi vault sudah sama-sama diperbarui — **di turn yang sama**.

Aturan same-turn (berlaku untuk perubahan **signifikan**: fitur baru, perubahan entity/`types.ts`, perubahan alur/UI, keputusan desain, bug fix penting):
1. Selesaikan perubahan kode + verifikasi (build/test/lint).
2. **Sebelum mengakhiri turn**, perbarui catatan vault terkait di `docs/obsidian-vault/` (mis. Data Layer, Signature Pages, Decisions & Bug Fixes, Conventions). Jangan biarkan basi.
3. Bila ada perubahan UI, regen screenshot lalu sinkron ke attachment vault:
   ```bash
   powershell -ExecutionPolicy Bypass -File scripts/sync-vault-attachments.ps1
   ```
4. Bila angka/fakta berubah (mis. jumlah test, daftar koleksi, field entity), perbarui juga rujukannya di vault **dan** di AGENTS.md ini.

### Kenapa aturan ini ada
Vault tidak ter-update otomatis — agent hanya aktif saat dipanggil, jadi update dokumentasi adalah aksi sadar, bukan proses latar belakang. Menundanya (mis. saat loop "lanjutkan" panjang) membuat vault basi tanpa jejak. Karena repo bisa berpindah akun/mesin, aturan ini ditaruh di sini agar **mengikat lintas sesi**.

### Pengecualian (TRIVIAL — tidak wajib update vault)
Typo, satu baris, jalankan perintah, pertanyaan cepat, atau perubahan yang tidak mengubah arsitektur/alur/fakta yang didokumentasikan. Kalau ragu apakah signifikan: perbarui vault.

## 6. Efisiensi biaya & pilihan model (berbasis data nyata)

> [!IMPORTANT]
> Agent **tidak bisa mengganti model sendiri** — itu setting UI milik user. Aturan ini mewajibkan agent **menyarankan** model yang tepat **di awal**, sebelum eksekusi, agar user memutuskan.

Temuan biaya (dari 8/9 revisi): pengeluaran **didominasi input token × jumlah request**, bukan output. Contoh nyata: 264 request → 12,2 jt input vs hanya 40 rb output (rasio ±300:1, ~$62). Maka:

- **Output murah** → menulis dokumentasi vault & melaporkan hasil verifikasi **nyaris tak berbiaya**. Jangan korbankan kualitas dok/verifikasi demi "hemat output"; itu salah sasaran.
- **Input mahal & berulang** → tiap turn memuat ulang context. Penghematan terbesar = (a) harga per-input-token lebih murah, (b) lebih sedikit request.

### Aturan saran model (di awal tugas, sebelum eksekusi)
1. **Tugas mekanis** (jalankan build/test/lint, sync screenshot, edit kecil, perbaiki angka, update vault rutin) → sarankan **model murah/Flash**. Biaya turun tanpa kehilangan kualitas.
2. **Tugas berat** (desain fitur, keputusan arsitektur, debugging rumit, perubahan multi-file ambigu) → sarankan **model kuat (thinking)**. Di sini kualitas penalaran sepadan biayanya.
3. Bila satu permintaan mencampur keduanya, sarankan **mulai dengan model kuat untuk desain/keputusan**, lalu **turun ke Flash untuk eksekusi mekanis**.

### Aturan kurangi jumlah request
- Hindari loop **"Continue"/"lanjutkan"** beruntun — tiap satu = satu turn penuh yang memuat ulang context (penyebab utama biaya). Selesaikan beberapa langkah sekaligus dalam satu turn.
- Untuk tugas panjang, sarankan user pakai **`/goal`** agar agent jalan menerus dalam lebih sedikit turn besar.

### Jangan dikorbankan demi hemat
Gerbang verifikasi (build/test/lint) dan update vault **same-turn** biayanya kecil tapi mencegah rework mahal. Menundanya ke sesi baru justru menambah input token (harus baca ulang kode). Tetap jalankan.

---

_Mulai dari: [`docs/obsidian-vault/00 - FixMaster MOC.md`](docs/obsidian-vault/00%20-%20FixMaster%20MOC.md)_
