---
target: src/features/services/printReceipt.ts (kritik ulang setelah tahap 1-6)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Lenovo\\Documents\\fixmaster\\.claude\\worktrees\\nota-termal-7c7e06\\src\\features\\services\\printReceipt.ts"
target_fingerprint: "sha256:2694a09402b243abca7ead6d11fc7e54ccd3777d5a52a0cc2fcf5f243720d090"
target_path: "C:\\Users\\Lenovo\\Documents\\fixmaster\\.claude\\worktrees\\nota-termal-7c7e06\\src\\features\\services\\printReceipt.ts"
timestamp: 2026-11-11T04-41-23Z
slug: src-features-services-printreceipt-ts
---
Method: dual-agent (A: subagen tinjauan desain · B: subagen detektor), diisolasi; A selesai sebelum temuan B dibaca. Keadaan yang dinilai: commit `1bff6f6` (setelah tahap 1 sampai 6). Kritik ulang atas target yang sama dengan `2026-11-10T23-40-21Z` (skor 19/40).

## Design Health Score

| # | Heuristik | Skor | Isu kunci |
|---|---|---|---|
| 1 | Visibilitas status | 3 | Pengaturan kaya umpan balik (LED "belum disimpan", toast, pratinjau hidup); jalur cetak sunyi dan baris "Status" di kertas basi begitu dibawa pulang. |
| 2 | Kesesuaian dunia nyata | 3 | Bahasa kasir tepat (DP, Sisa, Kembalian). UI menyebut "tanda terima", kertas selalu berjudul "NOTA SERVIS". |
| 3 | Kontrol dan kebebasan | 2 | Jendela cetak tak punya tombol Tutup/Cetak lagi dan tak menutup sendiri (tak ada `afterprint` atau `window.close` di seluruh `src`). Batal di dialog meninggalkan halaman nota tanpa kontrol. |
| 4 | Konsistensi | 2 | CETAK ULANG dan kotak BATAL hanya ada di struk. Ikon `receipt` untuk cetak di Kasir, `print` di Servis. Dua model simpan (saklar langsung, teks lewat tombol) dalam satu halaman. |
| 5 | Pencegahan error | 3 | Kuat: `fitsBeside`, `maxLength` plus penghitung, kalimat batal tak bisa ditimpa, angka tak diketahui tak ditebak. Lemah: cetak ulang nota servis tak ditandai, lebar kertas salah baru ketahuan lewat cetak percobaan. |
| 6 | Kenali daripada ingat | 2 | Margin None, header dan footer mati, skala 100% hanya tertulis di Pengaturan, bukan di titik tekan Cetak. |
| 7 | Fleksibilitas dan efisiensi | 2 | Banyak titik masuk cetak; di ponsel "Cetak Nota" di detail servis di balik "Lainnya" (dua ketukan). Lebar kertas satu per organisasi, bukan per cabang atau printer. |
| 8 | Estetika dan minimalis | 3 | Hierarki dari bobot dan jarak, bukan abu-abu. Mubazir: Subtotal sama dengan TOTAL, Estimasi di samping Biaya, URL lacak berhuruf. |
| 9 | Pemulihan error | 2 | `print.popupBlocked` kini spesifik dan bisa ditindaklanjuti, tetapi berupa toast sementara tanpa langkah visual. |
| 10 | Bantuan dan dokumentasi | 3 | Kartu "Di dialog cetak browser" dan hint tiap kolom bagus, tetapi jauh dari tombol cetak. |
| **Total** | | **25/40** | Acceptable ke atas (kritik awal 19/40) |

## Design Specificity Verdict

**LLM assessment.** Layar Pengaturan terasa dibuat untuk produk ini: sel kertas dengan LED dan miniatur gulungan proporsional 58:80, readout mono "31 huruf per baris", saklar LED CETAK/TIDAK, meja kerja cekung tempat kertas diletakkan, dan simulasi 1-bit. Kertasnya kompeten tetapi nyaris generik kategori: satu-satunya gerakan khas hanyalah jahitan titik dan mono. Peluang yang terlewat (semuanya aman 1-bit): pita tick-gauge tahap servis (Diterima, Pengerjaan, Selesai, Diambil) menggantikan baris teks "Status"; label sobek bernomor besar untuk kantong perangkat; kotak status dokumen yang kini baru dipakai di struk dan tiket batal.

**Deterministic scan.** Sumber (`printReceipt.ts`, `printSaleReceipt.ts`, `receiptStyle.ts`): exit 0, 0 anti-pola, 3 advisory `design-system-color` (`#000` di `receiptStyle.ts`, sengaja dan dijelaskan di header berkas serta `src/lib/print.ts`). HTML cetak 38 berkas: exit 2, 1038 peringatan, semuanya aturan layar: `tiny-text` 248, `undersized-ui-text` 748, `wide-tracking` 42, pada huruf 9,458 px = 20 titik pada 203 dpi = 2,5 mm. ARAH SAJA, bukan cacat kertas. Temuan kontras rendah pada kertas hilang total (semua tinta `#000`). Halaman Pengaturan (snapshot DOM): `dark-glow` x12 sah (motif LED produk), `low-contrast` x12 positif palsu (ukur live 5,8 sampai 15,4:1), `overused-font` milik aplikasi, `codex-grid-background` latar halaman.

**Visual overlays.** Tidak ada overlay yang tampil: detektor 0.1.18 tak punya `--cdp` dan `detect.js`; bukti browser lewat snapshot DOM Playwright.

## Overall Impression

Fidelitas kertas dan Pengaturan jauh lebih matang. Kelemahan tinggal di tepi alur: nota yang batal, dicetak ulang, dan jalur cetak yang tak punya penutup.

## What's Working

1. **Rekayasa 1-bit yang jujur.** Semua ukuran dalam titik head, tinta `#000`, jahitan titik. Render `gray` dan `1bit-threshold` identik, jadi tak ada teks hilang di driver ambang 50%. `fitsBeside` menumpuk baris yang tak muat; IMEI ganda 31 huruf pas satu baris.
2. **Integritas angka.** Tak ada "Sisa Rp 0" palsu, DP batal tanpa catatan refund tak diklaim, kembalian cetak ulang tak ditebak, nominal ratusan juta muat.
3. **Pengaturan sebagai alat, bukan formulir.** Pratinjau memakai HTML yang sama dengan printer, ada simulasi 1-bit, readout kolom per lebar kertas.

## Priority Issues

**[P1] Status dokumen nota servis tak setara struk.** Tiket batal hanya berbeda di baris kecil "Status: Dibatalkan"; tanpa kotak BATAL; penutup tetap "sampai jumpa kembali!" (struk batal juga). Cetak ulang nota servis tak punya penanda, padahal nota menyebut dirinya bukti pengambilan unit. Perbaikan: pakai ulang `.void-mark`, buang ucapan kaki pada dokumen batal, tambah penanda cetak ulang. Perintah: harden. *Status setelah penilaian: kotak BATAL dan penghapusan ucapan kaki sudah dikerjakan untuk tiket dan struk batal; penanda cetak ulang nota servis butuh status cetak yang tersimpan (keputusan data), masih terbuka.*

**[P1] Jalur cetak tanpa penutup.** `openPrintWindow` membuka jendela baru yang tak pernah menutup sendiri; batal di dialog meninggalkan halaman nota tanpa tombol; popup diblokir hanya memunculkan toast. Perbaikan: bilah layar-saja "Cetak lagi / Tutup" (di luar ukuran halaman terukur), atau `iframe` tersembunyi dengan `contentWindow.print()`; `afterprint` + `window.close()` berisiko di iOS Safari. Perintah: harden.

**[P1] Alamat lacak berhuruf mahal.** URL berisi UUID organisasi memakan 6 sampai 9 baris, patah di tengah token, tak mungkin diketik pelanggan. Perbaikan: domain pendek plus kode, QR tetap penuh; butuh rute kode pendek di sisi lacak. Perintah: distill.

**[P2] Hierarki mengikuti siklus hidup.** Judul selalu NOTA SERVIS; "Status" basi; Estimasi di samping Biaya; tak ada kotak tanda tangan atau label unit. Perbaikan: judul per tahap, tick-gauge tahap, buang Estimasi bila Biaya ada. Perintah: layout.

**[P2] Pengaturan di ponsel dan lingkup lebar kertas.** Pratinjau di dasar halaman (±4000 px), saklar "Yang dicetak" terkubur di bawah enam kolom teks; lebar kertas satu per organisasi padahal produk multi-cabang. Perintah: adapt.

## Persona Red Flags

**Riley (ekstrem).** Nota batal terbaca seperti nota biasa (ditangani sebagian setelah penilaian). Teks maksimum dipotong `slice` tanpa penanda di kertas. Nota stres ±37 cm, struk 30 baris ±42 cm. IMEI ganda pas tanpa sisa. Nominal ratusan juta lolos.

**Casey (pemilik di ponsel).** Cetak Nota dua ketukan di balik "Lainnya". Pratinjau jauh dari kolom yang diketik, tombol "Cetak percobaan" di kepala kartu pratinjau. Tombol cetak riwayat POS hanya ikon. Cetak dibatalkan: terjebak di tab nota (belum terverifikasi di Android).

**Kasir atau teknisi di meja.** Tiap cetak = dialog browser plus jendela tersisa. Tak ada salinan kedua untuk toko atau label unit. "Cetak Struk" sekunder setelah transaksi selesai. Nota intake ±17 cm: lambat dan boros kertas saat pelanggan menunggu.

## Minor Observations

- Subtotal sama dengan TOTAL tanpa diskon.
- Nomor dokumen hanya 26 titik, padahal itu yang disebut pelanggan di telepon.
- Saklar "TIDAK/CETAK" ambigu: status atau aksi.
- Logo tak diproses ke 1-bit di kode (hanya `<img>`); tampilan dengan logo berwarna asli tak terverifikasi.
- Nama toko 4 baris dan alamat 7 baris memboroskan kepala kertas pada kasus stres.
- "DP ditahan" tak menyebut alasan.

## Questions to Consider

- Kalau QR adalah catatan sebenarnya, apa fungsi kertas di luar bukti fisik, dan kenapa tak ada tanda tangan?
- Apakah `/track?org=<UUID>&no=FM-0123` bisa dienumerasi lewat nomor urut? (Halaman lacak tak dibaca; tak terverifikasi.)
- Haruskah atribusi FixMaster bisa dimatikan toko berbayar?
- Haruskah lebar kertas milik perangkat atau cabang, bukan organisasi?
- Perlukah tanda terima (masuk) dan nota serah (ambil) jadi dua dokumen?

Belum diverifikasi: printer termal fisik, dialog cetak Chrome di Android, pembacaan QR oleh pemindai sungguhan, logo toko berwarna.
