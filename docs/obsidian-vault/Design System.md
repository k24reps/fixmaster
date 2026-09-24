---
title: Design System — Precision Electronics Bench
aliases: [Design System, Tokens, Visual Identity]
tags: [fixmaster, design-system, frontend]
created: 2026-06-04
---

# 🎨 Design System — "Precision Electronics Bench"

Bagian dari [[00 - FixMaster MOC]].

## Identitas

FixMaster memakai bahasa visual **"Precision Electronics Bench"** — meja kerja teknisi elektronik presisi. Tiga pilar warna:

- **Graphite steel** — permukaan grafit/beton sebagai bidang netral
- **Safety amber** (`#f5a623`) — warna brand, aksen utama & status aktif
- **Diagnostic cyan** (`#3dd9c4`) — aksen diagnostik/informasi

Dua tema: **dark (default)** "Graphite Workshop" dan **light** "Bright Workshop Steel".

## Token (sumber kebenaran tunggal)

Semua warna/spasi/tipografi tinggal di `src/styles/tokens.css`. Komponen **tidak** pakai warna hardcode — semua lewat `var(--token)`, sehingga dark/light otomatis konsisten.

### Tipografi
- **Sans**: Inter (teks umum)
- **Display**: Space Grotesk (judul, logo)
- **Mono**: JetBrains Mono (angka, ID, kode, readout) ← penanda khas bench

### Motif visual bersama
Yang membuat 9 halaman terasa "satu produk" meski beda metafora:
- Font **mono** untuk semua angka/ID
- **LED status**: ok / live / warn / crit (hijau / cyan / amber / merah)
- **Spine** tepi berwarna pada kartu/baris
- **Divider titik-titik** (dotted/perforasi)
- **Tick-gauge** untuk meter & proporsi
- **Fitur terkunci** (plan-gated): channel redup + badge **LED brand + "PRO" mono** — **bukan ikon gembok** generik. Lihat [[Sidebar - Live Diagnostic Rail]].

> [!tip] Prinsip
> "Bahasa visual bersama, bukan asal beda." Tiap halaman punya alat sendiri, tapi semua memakai token + motif yang sama. Lihat [[Signature Pages]].

### Kalibrasi nyaman di mata (24 Sep 2026)

Permintaan pemilik: nyaman di mata, tidak mencolok, tidak "gelap tak jelas", tetap
clean & profesional. **Refinement** — identitas, komponen, dan panel instrumen hitam
(tetap sama di kedua tema, keputusan pemilik) tidak berubah; hanya `tokens.css`.

Diukur dulu di OKLCH (L = terang persepsi, C = kejenuhan), karena gerbang kontras
hanya menjawab "cukup", bukan "nyaman" — keduanya lulus 0 pelanggaran SEBELUM
kalibrasi, padahal keluhannya nyata:

| Temuan | Sebelum | Sesudah |
|---|---|---|
| Latar gelap nyaris hitam, anak tangga tipis | L 0.145 / 0.187 / 0.226 / 0.296 | L 0.168 / 0.209 / 0.252 / 0.324 |
| Tepi kartu gelap | 7.5% / 14.5% putih | 9% / 16.5% |
| Tinta utama gelap di kartu | 15.4:1 (berpendar) | 12.8:1 |
| Tinta utama terang di kartu | 17.6:1 | 15.3:1 |
| Kartu terang = modal terang | keduanya `#ffffff` | kartu gading `#fdfcf9`, yang mengambang `#ffffff` |
| Sinyal gelap paling menyala | merah C 0.219, oranye/biru C 0.192 | C 0.19 / 0.168 (L & rona tetap) |
| Glow amber + bingkai amber→cyan | penuh | glow −30%, bingkai dicampur 28% warna kartu |

- Aturan kerja: **turunkan kejenuhan sebelum terang** — terang adalah tumpuan kontras,
  jadi warna bisa dikalemkan tanpa satu teks pun jatuh di bawah AA.
- Satu efek samping tertangkap gerbang: teks hijau & cyan sama-sama kehilangan
  kejenuhan lalu saling mendekat (dE 0.088 < 0.1) → rona hijau digeser 162→148°.
- Verifikasi: `audit-tokens` LULUS, `audit-contrast` 0 gagal (dashboard demo + landing,
  kedua tema), detektor impeccable 0 temuan, foto demo publik diregenerasi.
- `scripts/shoot-demo.mjs` ikut dibetulkan: ia menuntut zoom `1`, padahal demo
  mem-pin kepadatan desktop 80% (`deviceDensityZoom`) sejak keputusan belakangan.

## Bench OS V2 — fondasi lintas aplikasi (9 Agu 2026)

Landing `Repair Flow Console` kini menjadi acuan visual seluruh produk. Konsistensi
tidak ditempel satu per satu di setiap halaman, tetapi dikunci lewat fondasi bersama:

- **Chassis**: sidebar dan topbar menjadi panel instrumen mengambang dengan border
  tegas, radius besar, bayangan dalam, dan ruang napas yang sama dengan landing.
- **Primitive**: `Button`, `Card`, `StatCard`, field form, badge, modal, toast, dan empty
  state memakai ukuran sentuh, radius, label mono, diagnostic spine, serta dotted seam
  yang seragam. Halaman fitur otomatis mewarisi bahasa ini tanpa wrapper baru.
- **Token**: radius (`5/8/12/16/24`), tinggi kontrol (`44/54`), lebar rail (`278/78`),
  tinggi topbar (`76`), readout LCD, warna kertas, WhatsApp, dan warna teks di atas
  bidang solid semuanya memiliki token; CSS fitur tidak mengulang hex/rgba.
- **Mobile**: pada ponsel ≤720 px, empat tujuan utama + tombol **Lainnya** tinggal di
  bottom navigation yang aman terhadap safe-area; hamburger disembunyikan agar tidak
  ada dua model navigasi. `Lainnya` membuka control deck bottom-sheet (menu sekunder,
  cabang, identitas usaha, operator/keluar). Pada tablet 721–1024 px sidebar tetap
  menjadi drawer mengambang dengan inset 8 px. Modal lain tetap berubah seperti
  bottom sheet; kontrol utama minimal 44 px dan footer modal menjadi tombol selebar panel.
- **Kontrak ergonomi operasional**: teks daun yang membawa informasi/aksi tidak boleh
  lebih kecil dari 12 px; kontrol pada viewport mobile, perangkat sentuh, atau pointer
  kasar memiliki area minimal 44×44 px. Ornamen non-interaktif boleh lebih kecil bila
  tidak membawa informasi penting.
- **KPI rail**: deret metrik yang panjang tetap satu baris pada mobile dan digeser
  horizontal. Konten kerja utama (filter, daftar, grafik, buku kas) harus sudah terlihat
  di viewport pertama, bukan terdorong oleh dinding kartu ringkasan.
- **Responsive by task**: tabel servis hanya dipakai saat seluruh kolom penting dapat
  terbaca; tablet memakai dua kolom job card dan mobile satu kolom. Aksi kritis tidak
  boleh tersembunyi oleh overflow atau sticky column yang terlalu lebar.
- **Navigasi**: pergantian route selalu mereset semua ancestor yang bisa di-scroll,
  bukan hanya `window`, karena shell desktop menggulirkan elemen `<main>` sendiri.

Render asli setelah reset fondasi:

![[bench-os-v2-desktop-dark.png]]
![[bench-os-v2-mobile-dark.png]]

### Light mode — Bright Workshop Steel (28 Agu 2026)

Light mode menggambarkan konter reparasi di bawah lampu kerja terang: bidang aplikasi
adalah baja anodized abu-biru, sedangkan kartu dan kontrol adalah pelat instrumen putih.
Ia bukan sekadar dark mode yang diputihkan.

- `bg-base → bg-app → bg-surface-2 → bg-surface` memiliki jarak luminans dan border
  yang jelas; panel kerja tidak lagi melebur menjadi hamparan putih pucat.
- Token `rail-*` memisahkan chassis, well navigasi, panel identitas, kontrol, divider,
  active channel, dan shadow. Sidebar tetap konsisten di dark/light tanpa selector tema
  satu kali pakai.
- Amber/cyan/hijau/biru memakai pasangan foreground semantik (`*-text`) ketika berada
  di permukaan terang. Ramp `400` yang luminous tetap dipakai pada layar readout gelap.
- Shadow light dipadatkan maksimal 8 px untuk panel biasa; elevasi besar tinggal untuk
  overlay/dropdown. Kedalaman berasal dari lapisan permukaan dan divider, bukan ghost card.

### Penyegaran palet: rona sinyal dipisahkan, netral diberi suhu (23 Sep 2026)

Palet disegarkan tanpa mengganti identitas: brand tetap safety amber `#f5a623`,
aksen tetap diagnostic cyan. Yang berubah adalah **netral** dan **rona sinyal**.

**Cacat yang diperbaiki.** `--warning` lama `#f59e0b` praktis warna yang sama
dengan brand `#f5a623` — berjarak hanya **dE 0.018** di OKLab. Lewat `STATUS_TONE`
(`lib/business/services.ts`), yang memetakan 8 status servis ke hanya 5 rona, ini
membuat **Diterima**, **Konfirmasi Biaya**, dan **Tunggu Sparepart** tampil
identik. Warning digeser ke oranye; jaraknya kini dE 0.10+ di kedua tema.

**Netral diberi suhu.** Dark bergeser dari abu netral ke graphite baja (~218deg)
supaya amber duduk sebagai komplemen dan menyala, bukan menempel di atas abu mati.
Light bergeser dari abu-biru dingin ke netral hangat bersaturasi rendah (~35deg) —
bukan krem — karena rona dingin membuat layar terang terbaca klinis.

**Pelajaran: pisahkan lewat terang-gelap, bukan hanya rona.** Di tema terang,
`--brand-text` dan `--warning-text` sama-sama harus cokelat gelap agar lolos 4.5:1
di atas pil bertint. Menggeser rona saja tidak pernah cukup — tidak ada solusi yang
memenuhi kontras dan pemisahan sekaligus. Solusinya datang saat warning dibuat
**lebih pekat** dari brand (`#661f0e` vs `#7c4d12`): jarak naik ke dE 0.128 dan
kontras keduanya justru membaik.

**Tinta di atas isian sinyal.** `--on-signal` dibuat sebagai sepupu `--on-brand`,
dan nilainya **berbalik antar tema** karena isiannya ikut berbalik: di dark, success
terang (`#0fba7f`) sehingga butuh tinta gelap — putih di atasnya hanya 2.5:1, cacat
lama yang kini tertutup; di light, success justru gelap sehingga tintanya putih.
Tombol danger memakai `--red-600` solid, bukan `--danger`, karena putih di atas
`--danger` hanya 3.9:1. `--success`/`--danger` sendiri tidak digelapkan karena
dipakai ~35 kali sebagai LED indikator di latar gelap, di mana terang itu justru
yang diinginkan.

Dua gerbang menjaga ini: `scripts/audit-tokens.mjs` (token, tanpa server) dan
`scripts/audit-contrast.mjs` (DOM sungguhan, butuh server). Lihat
[[Decisions & Bug Fixes]].

### Ambient bench pada produk dan demo (29 Agu 2026)

Grid blueprint/PCB 30 px pada `body::before` adalah material lingkungan bersama, bukan
ornamen milik satu halaman. Shell aplikasi dan demo tidak boleh menutupnya dengan bidang
`--bg-base` opak. Demo memakai primitive yang sama melalui `body.fm-demo-active`, tetapi
`--ambient-bench-opacity: 0.72` membuatnya 28% lebih tenang agar faceplate presentasi dan
CTA tetap dominan. Jangan menyalin resep gradient ke CSS demo; perubahan pola, warna, dan
ukuran harus tetap dilakukan sekali di `src/styles/global.css`.

## Maskot dan logo: "VOLT Probe" (29 Agu 2026)

VOLT bukan lagi robot humanoid/chatbot. Anatominya sekarang berasal langsung dari alat
diagnosis meja: **continuity probe asimetris**, chassis graphite ber-chamfer, grip/spine
amber, selector dial, layar LCD dengan waveform cyan, kabel uji, konektor, dan kaki
magnet. Ekspresi disampaikan lewat sinyal diagnosis—bukan mata bulat dan senyum—agar
hangat tetapi tidak menyiratkan fitur AI yang tidak dimiliki produk.

- **Material lintas tema**: token `--volt-shell`, `--volt-shell-high`, `--volt-edge`,
  `--volt-display`, dan `--volt-metal` tinggal di `tokens.css`. Benda fisiknya tetap
  graphite pada dark/light; amber dan cyan tetap memakai ramp brand global.
- **Komponen**: `Mascot` di `src/components/ui/Mascot.tsx` — `face` adalah instrumen
  compact; `full` menambah kabel/konektor dan kaki magnet. `size` menjaga rasio siluet;
  `animated` menghidupkan probe + waveform melalui SMIL dan tunduk pada reduced motion.
- **Penempatan**: landing hero console memakai `face` 48 px statis di diagnostic dock;
  final CTA memakai `full` 150 px dengan motion di probe bay. Auth desktop memakai
  `full` 112 px statis sebagai status terminal dan mobile memakai `face` 44 px statis.
  Dashboard BENCH CONSOLE memakai `face` 30 px statis agar motion tidak mengganggu
  pekerjaan. Header, splash, sidebar, dan footer memakai logo compact yang sama tanpa
  animasi.
- **Aset merek**: `public/logo.svg` dan `favicon.svg` adalah siluet VOLT Probe tanpa
  rounded-square generik. `icon-maskable.svg` adalah versi safe-zone PWA. PNG 192/512,
  Apple touch icon, dan `og-image.png` diregenerasi deterministik lewat
  `npm run brand:render` (`scripts/render-brand-assets.mjs`).
- **Prinsip penggunaan**: VOLT adalah pendamping diagnostik, bukan narator atau
  customer-support bot. Ia menandai identitas, status ringan, dan momen brand; informasi
  finansial/operasional serius tetap disampaikan oleh copy serta komponen data.
- **Register motion**: gerak hanya dipakai di momen brand besar seperti CTA landing.
  Auth memakai VOLT statis karena login/daftar/reset adalah product surface yang menuntut
  fokus. Copy statusnya harus mengikuti mode; jangan menyuruh “masuk” ketika pengguna
  sedang membuat akun atau memulihkan password.

### Guardrail landing yang dapat diakses (28 Agu 2026)

Audit landing mengunci detail yang sebelumnya lolos karena dark theme terlihat baik:

- Token foreground semantik `--brand-text`, `--accent-text`, `--success-text`, dan
  `--text-muted` punya pasangan khusus light/dark. Warna dekoratif tidak lagi dipakai
  langsung sebagai teks kecil di permukaan terang.
- Fokus keyboard memakai outline solid `--focus-ring`; landing menyediakan skip link
  ke `<main>`. Kontrol dan tautan yang terlihat menjaga area minimal 44×44 px.
- Copy informasi landing di ponsel minimal 14 px. Label mono tetap menjadi readout,
  tetapi tracking dan uppercase dikendurkan pada progres sempit agar terbaca.
- `Mascot animated` otomatis mematikan seluruh SMIL saat
  `prefers-reduced-motion: reduce`; perilaku ini dijaga unit test.
- Nomor urut hanya dipakai ketika benar-benar menyatakan proses. Section lain memakai
  hierarchy judul, seam, LED, dan diagnostic spine—bukan scaffold nomor/kartu generik.
- Breakpoint landing yang menjaga muat/tidak muat memakai container query bernama
  `landing`; media query tersisa hanya untuk preferensi reduced motion.

## Terkait
- [[Iconography]] — set ikon Phosphor
- [[Sidebar - Live Diagnostic Rail]] — penerapan token pada navigasi
- [[Signature Pages]] — penerapan per halaman

#design-system #frontend
