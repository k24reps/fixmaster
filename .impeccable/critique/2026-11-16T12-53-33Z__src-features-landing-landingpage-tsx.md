---
target: landing page
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/fixmaster/src/features/landing/LandingPage.tsx"
target_fingerprint: "sha256:921a75f662614c492d4397bcec355ac1a65b73ff46684174cc7b9040eb9fcbe4"
target_path: /home/user/fixmaster/src/features/landing/LandingPage.tsx
timestamp: 2026-11-16T12-53-33Z
slug: src-features-landing-landingpage-tsx
---
Method: dual-agent (A: sub-agen review desain · B: sub-agen detektor + browser), dilanjutkan sesudah batas kuota

# Critique ulang: landing page (run ke-2, 16 Nov 2026)

Target `src/features/landing/LandingPage.tsx` (+ BenchScene, DemoGate), live `/landing-preview`, 320–1920px, dua tema. Mode Persuade. Audit teknis sesi yang sama: 15/20.

## Skor: 28/40 (Good, 70%), sebelumnya 29/40
H1 2 (nama toko nyaris tak terlihat; di ponsel pindah layar terjadi di luar layar) · H2 3 ("Klik" di layar sentuh) · H3 3 (gelembung ajakan demo tak bisa ditutup) · H4 3 (amber di screenshot, LED hijau tahap) · H5 2 (area klik bertumpuk di sentuh; placeholder ditolak) · H6 3 · H7 3 · H8 3 (monoton, berulang) · H9 3 (fokus hilang sesudah Ganti nama toko) · H10 3.

## Vonis spesifisitas: sebagian besar membumi, hero mulai generik
Bench dipatuhi; hero kini pola "judul + form, lalu laptop + HP" yang bisa dipakai produk apa pun; adegan membuktikan "sama di dua layar", bukan thesis meja → ponsel (keputusan pemilik). Detektor CLI exit 0, 5 advisory (1 positif palsu: ikon laci). In-page 32/28 temuan, hampir semua positif palsu/advisory; nyata: caption ±171ch tanpa max-width (BenchScene.module.css:240). Overlay headless.

## Isu prioritas
- [P1] Area klik sidebar gambar komputer bertumpuk di layar sentuh: global.css:160-170 memaksa button 44×44 di ≤720px/pointer kasar; ketukan Kasir & Stok membuka Pelanggan; lapisan redup menutupi menu yang direkam; di 320 bar ponsel menutupi nav HP. Fix: matikan area klik komputer di sempit/sentuh, kecualikan dari aturan 44px. harden, adapt.
- [P1] Personalisasi tak terlihat: kop nama 9,5px terpotong di 1440, 3,7px di 390, tidak di HP, tidak terbawa ke gerbang penutup (DemoGate.tsx:59). delight, clarify.
- [P1] Sinkron tak tersaksikan di ponsel: tombol di bawah kedua layar (komputer 0% terlihat saat tombol terlihat); teks screenshot komputer ±3px di 320; HP terkecil di 768 (skala 0,396, ambang 700px). adapt, layout.
- [P2] Placeholder 0812-3456-7890 (DemoGate.tsx:213) ditolak saringan 0104; "Pakai nomor Anda sendiri" (id.ts:300) menegur. clarify.
- [P2] Bawah lipatan monoton/berulang: 4 seksi split sama, "bukan cuma HP" 3×, harga 4×, dua judul penutup, margin tersembunyi di "Lihat 4 lainnya". distill, layout.

## Persona
Jordan: tak tahu layar bisa diklik, gelembung tak bisa ditutup. Riley: placeholder ditolak, nama 35 huruf terpotong, ketukan salah sasaran, fokus hilang. Casey: tanpa prefetch saat sentuh (±111 KB per pindah), submit di bawah lipatan 360×740, render klien. Pemilik konter solo: harga terlihat, tapi layar pertama 390 seluruhnya formulir; tahap "kerja sendiri" baru di seksi kelima; keberatan saldo minimal Rp 50.000 tak dijawab dekat gerbang.

## Catatan kecil
Amber di screenshot bersaing dengan gerbang; gerbang memanjang 41px saat error; laci "Kategori Anda" terang tampak nonaktif; sizes 70vw memuat 1600px untuk slot 873px (BenchScene.tsx:155); gambar layar pertama lazy padahal mungkin LCP.

## Pertanyaan
1. "Sama di dua layar" cukup alasan meninggalkan buku + WA? 2. Layar asli sebelum nomor diminta di HP? 3. Apa yang hilang bila seksi laci dihapus?
