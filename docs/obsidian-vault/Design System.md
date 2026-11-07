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
Sejak 6 Nov 2026 netral kedua tema diturunkan dari material maskot VOLT Probe: grafit
cangkangnya untuk dark, baja logamnya untuk light. Lihat
[Palet dari VOLT Probe](#palet-dari-volt-probe-6-nov-2026).

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
- **Kanal pilihan** (27 Sep 2026): keputusan penting dengan 2–5 opsi (mis. status tujuan tiket) = deretan tombol kanal `role="radio"` — LED 8px + label mono uppercase, 44px, kanal terpilih menyala di nada statusnya (`STATUS_TONE` → `--*-soft` + `--*-text`). **Bukan `<select>` bawaan.** Opsi destruktif (Batal) duduk sendiri di bawah seam titik. Contoh: `StatusModal`.
- **Pad tender** (27 Sep 2026): pilihan wallet pembayaran = tuts mekanis (border bawah 3px, turun saat ditekan) dengan LED; tuts yang dipakai menyala brand (`aria-pressed`). Status sisa/kembalian dibaca di **LCD** (skala terang, LCD selalu gelap), bukan pil warna di atas kertas. Contoh: Kasir.
- **Strip readout** (27 Sep 2026): angka ringkasan halaman = satu panel `<dl>` dengan sel dipisah seam titik (label mono + nilai mono tabular, LED bila butuh perhatian), `auto-fit` sehingga menyusut sendiri — **bukan deretan StatCard** (ikon-dalam-kotak + angka, pola SaaS generik yang di ponsel menumpuk jadi lima baris). Contoh: Daftar Servis.
- **Teks sinyal selalu `--*-text`**, bukan `--success`/`--warning`/`--accent`/`--brand` (itu warna isian/LED). Isian di atas latar tipis: nada dibawa latarnya, teksnya tinta biasa. Terukur 27 Sep: pola lama gagal 1,9–4,45:1 di jendela modal.

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
  (Sejak 6 Nov 2026 default 80% itu dihapus; demo kembali mem-pin 100% + Lapang. Lihat
  [[#Tampilan dua kenop (6 Nov 2026)]].)

#### Tahap 3 — sapuan semua menu (24 Sep 2026)

`audit-contrast.mjs` dulu hanya memeriksa dashboard demo + landing. Disapu 12 menu ×
2 tema: tema gelap bersih kecuali **2 regresi kalibrasi** (angka biru di panel
Servis 4.33:1 — panel mengambang jadi lebih terang), dan tema terang punya **58 teks
di bawah ambang di 9 halaman** — dibuktikan **bug lama** dengan menjalankan sapuan
yang sama di atas token pra-kalibrasi: jumlahnya identik.

**Akar polanya — aturan untuk kode baru:** komponen memakai **primitif terang milik
tema gelap** (`--green-400`, `--amber-400`, `--red-400`, `--blue-400`) atau **warna
isian** (`--brand`, `--accent`, `--info`) sebagai `color:` teks. Di tema terang itu
jadi 1.5–3.2:1. **Teks berwarna wajib lewat token teks sadar-tema:**
`--success-text`, `--warning-text`, `--danger-text`, `--info-text`, `--brand-text`,
`--accent-text`. Di tema gelap token teks = primitif -400 yang sama, jadi tampilan
gelap tak berubah. Primitif -400 tetap sah **di dalam panel instrumen** (selalu
gelap) — karena itu penggantiannya per temuan terukur, bukan massal.

- 22 `color:` diganti di 8 berkas (Servis, Keuangan, Laporan, Pelanggan, Log
  Aktivitas, Inventori, Absensi, Supplier). Garis bawah & titik LED tetap isian.
- `--danger-text` terang L 0.478 → 0.45 (`#99202f`): badge merah di atas
  `--danger-soft` masih 4.39:1.
- Gerbang `audit-contrast.mjs` kini ikut mengklik 11 menu demo → **26 halaman×tema,
  0 gagal**. `audit-tokens` tetap LULUS.

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
_(7 Nov 2026: peta kini 6 nada. Diterima = abu, Selesai = cyan "siap ambil", Lunas =
hijau; brand amber bukan lagi nada status. Lihat Decisions & Bug Fixes, Tahap 2.)_

**Netral diberi suhu.** _(Diganti 6 Nov 2026: netral kini mengikuti material VOLT,
lihat bagian Palet dari VOLT Probe.)_ Dark bergeser dari abu netral ke graphite baja (~218deg)
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

## Pembersihan antislop (6 Nov 2026)

Audit antislop 001 (`anti-slop/audit-001-2026-11-06.md`) memeriksa motif bench seperti
teknik lain: tiap teknik harus punya tujuan tertulis. Aturan barunya juga ditulis di
`DESIGN.md`. Ringkasannya:

- **Kaca hanya untuk yang mengambang.** Prop `glass` di `Card` dihapus beserta 67
  pemakaiannya; kartu di daftar atau grid selalu padat. Blur tinggal di chassis (topbar,
  bottom nav, drawer, bar demo), overlay (modal, toast), dan panel tunggal yang duduk
  langsung di grid ambient (PIN, wizard, hasil lacak). Kartu WhatsApp landing kini padat.
  Laporan dulu terukur 15 elemen ber-blur sekaligus.
- **Cahaya punya dua keluarga saja.** LED status tetap menyala (Lit-Signal). Bayangan
  amber "powered" hanya untuk tombol utama, kontrol aksi utama (dok keranjang Kasir,
  "Buka demo", posisi menyala pemilih periode harga), dan tanda brand lepas. **Navigasi
  tidak pernah bercahaya**: sel ikon menu aktif di sidebar dan garis aktif bottom nav
  menyala lewat isian padatnya saja. Badge kapsul tidak boleh bercahaya; border + titik
  + huruf besar + glow adalah lencana AI generik, dan glow-lah unsur yang ditinggalkan.
- **Denyut berhenti sendiri.** Token `--pulse-cycles: 2`: LED alarm berdenyut dua kali
  (paling lama 4 detik, di bawah batas 5 detik WCAG 2.2.2) lalu menyala tetap, jadi tidak
  perlu tombol jeda. Yang boleh berulang hanya proses yang sedang berjalan (spinner, LED
  "menyambung"). Logo layar memuat tidak lagi melayang. `Mascot animated` mulai bergerak
  saat terlihat (IntersectionObserver), main beberapa siklus, lalu diam; dijaga unit test.
- **Panah berarti pindah tempat.** Panah kanan hanya pada baris/kartu yang membuka detail,
  tautan ke halaman lain, **Lanjut** di wizard, dan dok keranjang Kasir. Tombol yang
  bekerja di tempat (simpan, mulai uji coba, transaksi baru) tanpa panah. CTA landing dan
  "Transaksi baru" kehilangan panahnya.
- **Silkscreen ada di dalam alat.** Label mono huruf besar bertracking milik instrumen
  (kolom aplikasi, kepala tabel, keterangan readout) dan mockup produk di landing. Di
  sekeliling mockup (tagline brand, readout pemilik, label progres, harga) huruf besar dan
  tracking dilepas. Terukur di landing: 33 label huruf besar bertracking menjadi 15.
- **Indikator tanpa arti dibuang.** Konsol hero kehilangan "Sinyal alur: Terhubung" (4
  batang) dan LED "Online" karena tidak terhubung ke data apa pun.

**Keputusan pemilik (R-37)**, motif yang diminta `DESIGN.md` tetapi mirip pola yang
dinamai antislop:

| Motif | Keputusan | Alasan |
|---|---|---|
| Spine tepi kartu/baris | Pertahankan | Membawa warna status servis |
| Grid blueprint `body::before` | Pertahankan | Satu-satunya kedalaman ambient (meja kerja) |
| Label mono huruf besar | Pertahankan, kurangi di landing | Readout alat di aplikasi; di landing membuat tiap bagian terdengar sama |
| Badge kapsul status | Pertahankan, tanpa glow | Labelnya fungsional |
| Glow | Hanya LED + tombol utama | Sel ikon navigasi menambah cahaya tanpa membawa status |

Terukur setelah perbaikan (12 menu demo, desktop): 0 sel navigasi bercahaya, 0 badge
bercahaya; elemen bercahaya yang tersisa adalah LED dan tombol utama.

## Palet dari VOLT Probe (6 Nov 2026)

Permintaan pemilik: warna tema harus lebih sesuai dengan logo dan maskot, dan bagus di
light maupun dark. Pemilik memilih arah **baja aluminium** untuk light.

**Kenapa tema lama tidak cocok.** Diukur di OKLCH terhadap material maskot
(`--volt-shell` `#15191f` = L 0.212, C 0.013, rona 258°):

| Bagian | Sebelum | Masalah |
|---|---|---|
| Netral dark | navy, rona 264°, C 0.018–0.029 | Dua kali lebih jenuh dari cangkang VOLT, terbaca biru dongker |
| Netral light | gading hangat, rona ~85° | Berlawanan dengan logam VOLT yang abu-biru dingin |
| Gradien tombol light | `#e8920c → #d9820a` | Oranye lama, bukan amber logo `#f5a623` |
| Teks aksen light | `#055f72`, rona 218° | Biru petrol, bukan cyan LCD (182°) |

**Yang berubah** (`src/styles/tokens.css`):

- **Dark = cangkang VOLT.** Tangga terang L dari kalibrasi 24 Sep dipertahankan, rona dan
  kejenuhannya diturunkan ke 257° / C 0.010–0.018, sehingga `--bg-app` `#15181e` hampir sama
  dengan `--volt-shell`. Base `#0c0f13`, kartu `#1e2229`, elevated `#2e343d`.
- **Light = baja aluminium.** Netral rona 255–265° dengan C ≤ 0.009: base `#d9dde2`,
  app `#ebeef2`, kartu `#fbfcfe`. Tinta `#1f2329` (15.4:1 di kartu), muted `#5c6169`
  (6.1:1 di kartu, 5.4:1 di app). Bayangan memakai rona baja `rgba(20,28,40,…)`, bukan
  cokelat.
- **Amber logo di kedua tema.** `--gradient-brand` = `--brand-500 → --brand-600` di light
  juga. Di light tombol utama diberi tepi 1px `--brand-700` lewat `--shadow-brand`, seperti
  kerah probe, karena amber logo di atas baja cuma 2:1.
- **Dua peran amber di light**:
  - `--brand` `#bf7c00` = amber logo yang digelapkan dengan rona sama (72°, L 0.64). Ini
    untuk bentuk tanpa teks (LED, garis, bar), yang wajib 3:1 di atas kartu (3.35:1).
    Amber tua logo sendiri (`--brand-700`, 66°) tidak bisa: cuma dE 0.089 dari
    `--warning`, sehingga Diterima menyatu dengan Konfirmasi Biaya.
  - `--brand-fill` + `--brand-fill-edge` (token baru) untuk bidang amber yang membawa teks
    atau ikon (`--on-brand`): sel ikon menu aktif, "Daftar Gratis" demo, tombol tab POS,
    titik wizard, node tahap servis, chip hari tugas, skip link, "Buka demo" di bingkai.
    Isinya amber logo penuh (`--brand-500`, tinta 9.2:1); batasnya datang dari tepi
    (`--brand-700`, 3.5:1). Dengan `--brand` padat, bidang ini terbaca mustard di samping
    tombol utama. Di dark isian dan tepinya `--brand-500` / `--brand-600`.
- **Cyan kembali ke rona LCD.** `--accent-700` `#006e63` (183°) jadi `--accent-text` light
  (6.0:1). Agar tetap terpisah dari hijau, `--success-text` light digelapkan ke `#08511f`;
  pemisahan teks success vs aksen dE 0.118, info vs aksen 0.174.
- `--grid-line`, `--rail-*`, dan `--gradient-brand-accent` ikut rona baja; isian
  gradiennya kini lewat `var()`.

Ikut dibetulkan karena terungkap saat memverifikasi:

- Tombol dev "Isi data demo & masuk" di Wizard: putih di atas cyan `--accent-600` hanya
  3.1:1 di light → tinta `--volt-display` (6.4:1).
- `audit-contrast.mjs` kini memindai `/landing-preview`. Di dev server tanpa Supabase `/`
  merender Wizard, jadi landing yang sebenarnya belum pernah ikut gerbang ini.
- `shoot-demo.mjs` menunggu nominal kas apa pun yang bukan nol. Angka pasti
  "Rp 5.100.000" basi saat data demo berubah dan membuat probe timeout.

Verifikasi: `audit-tokens` LULUS 0 pelanggaran; `audit-contrast` BERSIH (landing,
`/landing-preview`, 12 menu demo, dan langkah modal Servis/Kasir, kedua tema); build,
lint, 692 test lulus. Foto produk di `public/screenshots/demo-*` diregenerasi.

![[volt-theme-landing-light.png]]
![[volt-theme-landing-dark.png]]
![[volt-theme-demo-light.png]]
![[volt-theme-demo-dark.png]]
![[volt-theme-servis-light.png]]

## Tampilan dua kenop (6 Nov 2026)

Pengaturan › Sistem › Tampilan (semua peran; disimpan per perangkat, tidak tersinkron).
Aturannya di `DESIGN.md` (The Two Dials Rule), alasannya di [[Decisions & Bug Fixes]]
(Zoom jadi dua kenop).

- **Pembesaran** = gauge bertakik `90 · 100 · 110 · 125 · 150`: rel penggaris, takik
  detent STANDAR di 100, zona jingga di bawahnya (lantai teks 12px), jarum = takik bertutup
  LED 9px, readout mono besar + label rona. Radiogroup dengan roving focus (panah/Home/End).
- **Kerapatan** = dua sel Lapang / Padat dengan LED brand dan glyph tiga garis (jarak lapang
  vs rapat). Padat `aria-disabled` di layar sentuh: tokennya hanya hidup di
  `@media (pointer: fine)`.
- **Rona LED** pembesaran: `--success` di 100%, `--accent` saat diperbesar, `--warning` di
  bawah lantai. Amber brand tidak dipakai (One Amber Rule).
- **Chip Topbar** (`ZoomChip`) hanya muncul bila pembesaran ≠ 100%: LED + persen mono + ikon
  putar; satu klik kembali ke 100%. Chip di-counter-scale (`zoom: max(1, 1/var(--zoom))`)
  supaya di 90% teksnya tetap 12px.
- **Ponsel**: stepper − / readout / + di menu Lainnya (`ZoomStepper`), target 44px.
- **Pintasan**: Ctrl+Alt (Cmd+Option) dengan `=` / `−` / `0`. Ctrl+= polos milik browser.
- **Token Padat** (`tokens.css`, `:root[data-density='padat']`): `--space-3…10`,
  `--control-h` 36, `--row-h` 44, `--row-h-compact` 36, `--card-head-py` 12,
  `--row-py` 8, `--nav-item-h` 40, `--sidebar-width` 248, `--topbar-height` 60.
  Padding baris yang dulu `12px` mentah di Card, Dasbor, Absensi, Inventori, Pengaturan
  kini `var(--row-py)`; komponen baru wajib begitu juga, kalau tidak ia lolos dari Padat.
- Sidebar otomatis jadi rail di ≥125% (`useZoomRail`), dan hanya dibuka lagi bila
  penciutannya otomatis.

Kartu Tampilan di 110% + Padat, gelap dan terang; chip Topbar di 110%; stepper menu Lainnya
di ponsel 390px:

![[display-card-1440-dark.png]]
![[display-card-1440-light.png]]
![[display-chip-110-dark.png]]
![[display-sheet-390-dark.png]]

## Terkait
- [[Iconography]] — set ikon Phosphor
- [[Sidebar - Live Diagnostic Rail]] — penerapan token pada navigasi
- [[Signature Pages]] — penerapan per halaman

#design-system #frontend
