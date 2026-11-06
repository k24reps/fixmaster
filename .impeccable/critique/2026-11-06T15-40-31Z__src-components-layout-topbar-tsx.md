---
target: zoom yang baik seperti apa (ZoomControl + stores/zoom.ts)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\Lenovo\\Documents\\fixmaster\\.claude\\worktrees\\gracious-euclid-bddc05\\src\\components\\layout\\Topbar.tsx"
target_fingerprint: "sha256:b6d37485bf91f7f251593df1e107d2d615e45667fc66180052773a86d86d9365"
target_path: "C:\\Users\\Lenovo\\Documents\\fixmaster\\.claude\\worktrees\\gracious-euclid-bddc05\\src\\components\\layout\\Topbar.tsx"
timestamp: 2026-11-06T15-40-31Z
slug: src-components-layout-topbar-tsx
---
Method: dual-agent (A: tinjauan desain + render Playwright · B: detektor CLI + overlay browser)

Target: zoom aplikasi — ZoomControl di src/components/layout/Topbar.tsx (58-95) + src/stores/zoom.ts (applyDeviceDensityDefault, deviceDensityZoom, beginTransientZoom).

## Skor kesehatan desain (20/40, Cukup)

| # | Heuristik | Skor | Temuan utama |
|---|---|---|---|
| 1 | Visibilitas status | 3 | Readout selalu tampil + aria-live; hilang di <=720px padahal 80% tetap berlaku |
| 2 | Kecocokan dunia nyata | 2 | "80%" = keadaan normal di meja; browser mengajarkan 100% = normal |
| 3 | Kendali & kebebasan | 2 | Tanpa reset ke 100%, tanpa penanda standar, default otomatis disimpan seperti pilihan pengguna |
| 4 | Konsistensi | 2 | Menumpuk dengan zoom browser; Ctrl+0 hanya reset browser; cincin fokus terpotong; aria-label literal bukan useT() |
| 5 | Pencegahan kesalahan | 2 | Rentang dijepit + nilai rusak -> 100%, tapi tebakan pertama disimpan selamanya; target <24px di 80% |
| 6 | Kenali bukan ingat | 3 | Ikon & angka jelas; tak ada tanda level standar |
| 7 | Fleksibilitas | 1 | Tanpa pintasan, tanpa tempat di Pengaturan, tanpa per-karyawan, maks 125% |
| 8 | Estetika & minimalis | 3 | Rapi, tapi setelan sekali-pasang memakan ruang topbar |
| 9 | Pemulihan kesalahan | 2 | Jendela sempit bermouse = jalan buntu; fokus jatuh ke body saat mentok |
| 10 | Bantuan | 1 | Hanya tooltip title |

## Vonis kekhasan
Setengah khas: readout mono tabular + segmented setinggi --control-h + ujung tetap terlihat (bench). Bentuknya tetap stepper generik (Chrome/Docs/Figma): tanpa tick-gauge, detent di 100, atau LED off-nominal. Readout dimaksudkan menandai "tidak di 100%", tapi default meja 80% membuat sinyal itu menyala untuk semua orang.

Detektor: Topbar.tsx 0 temuan; src/components/layout 3 saran design-system-font-size (Topbar.module.css:22, Sidebar.module.css:486, MobileBottomNav.module.css:82), tidak di kontrol zoom. Overlay /demo di 80/100/125%: 0 temuan di grup "Zoom tampilan". Grid body, tick-gauge, dark-glow LED = motif bench yang diwajibkan (positif palsu); 3 text-occlusion di 125% = tertutup label overlay (palsu). Sepakat dengan tinjauan: jumlah dark-glow 0/2/13 di 80/100/125% karena LED menyusut ke 5,6-7,2px di 80% (di bawah minimum 7px).

## Yang sudah bekerja
1. Mekanisme CSS zoom + Container Query Rule + --app-vh: 0 luberan di 9 halaman x 4 kombinasi stres (1152@80, 1152@100, 1366@125, 1097@125) dan 150% suntikan; modal/menu/toast benar posisinya.
2. Pipa jujur: transient demo/landing, nilai rusak -> 100%, 100% menghapus properti, cetak nota terisolasi, tangga = Chrome.
3. Jalur sentuh benar: ponsel 390 & tablet 820 sentuh = 100%, teks 12px, nav bawah 73x56, CTA 44px.

## Masalah prioritas
- [P1] Default 80% di perangkat bermouse mengenai adegan meja konter (PRODUCT.md: konter = layar desktop). 1440@80: 105/129 teks <12px (66 di 9,6px), LED 5,6-7,2px, tombol periode 20,8px (<24 WCAG 2.5.8). Membatalkan skala OS 125%. Lebar konten visual malah turun 1146->1104. Fix: default 100% + "Padat" bernama; atau 90% + --text-xs: max(0.75rem, calc(0.75rem / var(--zoom))) + putaran tipografi. -> /impeccable typeset, /impeccable adapt
- [P1] Jendela sempit bermouse (390/600/720x450 = 1440 @200% browser): 0,8 berlaku, .zoom display:none, tidak di Lainnya/Pengaturan; CTA 35,2px, nav bawah 44,8px. Sam 200% -> 160%. Fix: jangan pasang default kerapatan di tata letak mobile; zoom di Lainnya + Pengaturan > Tampilan. -> /impeccable adapt, /impeccable harden
- [P2] Default otomatis disimpan (setZoom menulis localStorage) -> perubahan default tak pernah sampai; laptop sentuh terkunci 0,8. Fix: simpan hanya pilihan eksplisit, hitung ulang otomatis tiap muat. -> /impeccable harden
- [P2] Kontrolnya sendiri susah: overflow:hidden memotong cincin fokus; disabled menjatuhkan fokus ke body; readout <span> tak bisa reset; Ctrl+=/-/0 tak berefek di app; ikut mengecil (30x33px, 9,6px di 80%); label literal. Fix: aria-disabled, fokus inset, readout = tombol "Kembali ke 100%", skala-balik 1/var(--zoom), useT(). -> /impeccable harden, /impeccable polish
- [P3] Penempatan & bentuk generik & batas 125%: sidebar tak menciut di >=125% (150%: 417px = 31% layar 1366). Fix: Pengaturan > Tampilan + chip topbar hanya saat != 100%; gauge 5 tick + detent 100 + LED "DI BAWAH LANTAI"; ciutkan sidebar di >=125% via JS. -> /impeccable distill, /impeccable shape

## Zoom yang baik untuk FixMaster (spesifikasi)
1. Dua kenop: Kerapatan (Lapang/Padat; teks >=12px, target >=24 mouse / >=44 sentuh) dan Pembesaran (90-150%, default 100%).
2. Default 100% semua perangkat; tanya adegan sekali (Meja penerimaan / Meja kantor) di layar >=1280px; nilai otomatis tak disimpan, tak pernah dipasang di mobile.
3. Level 90/100/110/125/150; 80% hanya pilihan sadar; sidebar -> rail di >=125%.
4. Tempat: Pengaturan > Tampilan (utama), lembar Lainnya, chip topbar saat != 100%.
5. Keyboard: jangan rebut Ctrl/Cmd + = - 0; bila perlu Ctrl+Alt + = - 0 (hindari Alt+Shift).
6. Reset: readout/chip = "Kembali ke 100%".
7. Simpan: kerapatan per perangkat; pembesaran per karyawan di perangkat (ikut PIN); tak disinkron cloud; demo & landing sementara tapi disematkan 100%.
8. Lantai: teks info >=12px di default, LED >=7px, target >=24x24, cincin fokus >=2px tak terpotong.
9. Tak boleh mengecil: kontrol zoom, total Kasir/uang, LED status + nilai, ID servis, toast/galat, CTA utama.
10. Gerbang: audit-zoom cek teks min >=12px di default (1366x768, 1440x900, 1536x864; mouse & sentuh) + jendela sempit bermouse 100% dan kontrol terjangkau.

## Red flag persona
- Alex: tanpa pintasan; Ctrl+0 hanya reset browser; rapat dibayar keterbacaan.
- Sam (200% browser): 1440 -> 720 CSS px -> mobile + 0,8 = 160%, kontrol hilang; maks app 125%; LED 5,6px; fokus terpotong.
- Casey: aman di ponsel sentuh; Chromebook/tablet+dock/DeX dengan pointer:fine -> 0,8 permanen.
- Teknisi konter PC bersama: 80% jarak lengan (label 9,6px, LED 5,6px, tombol 30x33); setelan per profil browser bukan per PIN.

## Catatan kecil
- Bar demo ikut mengecil ("Daftar Gratis" 35,2px).
- Landing 1440 mouse disematkan 0,8: 90/143 teks <12px; sentuh 0/139.
- Token kerapatan saja: 1,90 -> 1,76 layar (padding px tetap) -> mode kerapatan perlu putaran komponen.
- Ctrl+P di app mencetak sesuai zoom (tanpa reset @media print); nota asli terisolasi.
- Tombol mentok opacity 0,45 = 2,31:1.
- Badge hitungan sidebar 9,6px di 80%.

## Pertanyaan
- Adegan siapa yang dilayani 80% bila konter = desktop bermouse?
- 80% itu zoom atau kerapatan?
- Apa yang dibeli zoom in-app di atas zoom browser selain kemudahan ditemukan?

Bukti: scratchpad/critA (demo-1440-80/100-dark/light.png, mouse-390.png, mouse-720x450.png, zoomctl-focus-plus-x3.png, desktop/narrow/pages-results.json).
