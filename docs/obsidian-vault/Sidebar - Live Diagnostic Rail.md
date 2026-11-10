---
title: Sidebar — Live Diagnostic Rail
aliases: [Sidebar, Live Diagnostic Rail, Navigation]
tags: [fixmaster, sidebar, navigation, signature-page]
created: 2026-06-04
---

# 🎛️ Sidebar — "Live Diagnostic Rail"

Bagian dari [[00 - FixMaster MOC]].

Sidebar bukan sekadar daftar menu, melainkan **panel kendali bench yang hidup**. Konsep terpilih: **arah B (Live Diagnostic Rail) + active-as-channel**. Sejak 7 Nov 2026 kanal dibagi tiga grup **tanpa judul** yang dipisah sambungan bertitik (lihat [[#Kanal aktif & tanda gulir (7 Nov 2026)]]).

## Tiga lapis

1. **Active-as-channel** — menu aktif menyala seperti channel terpilih: plate amber + icon cell solid + full border-brand (bukan blok highlight biasa).
2. **Readout live** — tiap item membawa **LED + angka** dari data nyata, lewat hook `useNavSignals` yang memakai ulang logika di [[Data Layer]] (`isActive`, `isOverdue`, dst). Angka di rail identik dengan halamannya.
3. **Identitas produk vs usaha terpisah** — **header atas = produk FixMaster** (monogram "FM" gradient brand→cyan + power-LED + tagline `BENCH OS` mono + plan badge). **Dasar rail = identitas toko**: logo (`org.logoDataUrl`, fallback inisial) + nama toko + **selector cabang**, menyatu dalam satu pelat bila toko punya cabang. Nama, peran, dan Keluar ada di menu akun Topbar (`AccountMenu`), bukan di rail.

## Selector cabang (branch switch)

Satu pelat 44 px (60 px bila nama toko perlu dua baris, mis. di kerapatan Padat yang lebar rail-nya 248 px; nama tidak pernah dipotong): logo toko, nama toko (display, tebal), lalu baris kanal berisi LED status (cyan = Semua Outlet, amber = cabang spesifik) + nama cabang mono, dan caret. Saat rail dilipat, pelat menyusut ke logo dengan LED di pojok kanan atasnya. Dropdown **buka-ke-atas** (karena letaknya dekat dasar). Opsi: "Semua Outlet" (tampilan HQ) + tiap outlet (badge "Utama" untuk primary). Memilih cabang memanggil `setActiveOutlet` → benar-benar memfilter data seluruh app (lihat scoping per-outlet di [[Data Layer]]). Logo toko diatur di **Pengaturan → Usaha** (uploader resize ke ~256px data URL).

## Tabel sinyal (`useNavSignals`)

| Menu | Sinyal | Tone |
|---|---|---|
| Servis | unit aktif (amber bila ada menunggu konfirmasi) | info/warn |
| Inventori | stok habis (merah berkedip) / menipis (amber) | crit/warn |
| Supplier | PO terbuka | info (cyan) |
| Tugas | telat (merah berkedip) / jatuh tempo hari ini (amber) | crit/warn |
| Absensi | karyawan sedang bekerja | good (hijau) |

## Responsif

- **Expanded (desktop)** — rail penuh dengan label + readout, kini berupa chassis
  mengambang (inset 14 px, radius 16 px, full border + shadow) agar sefamili dengan
  landing `Repair Flow Console`.
- **Collapsed** — menara LED 78 px; status pindah ke pojok ikon, item idle disembunyikan.
- **Tablet (721–1024 px)** — drawer selalu tampil penuh (bukan menara), mengambang
  dengan inset 8 px. Posisi tertutup memakai translasi melebihi lebar panel supaya
  tidak meninggalkan garis 8 px di tepi layar. Laci yang tertutup digeser keluar layar
  dengan `transform`, bukan `display: none`, jadi sejak 10 Nov 2026 `<aside>` diberi
  `inert` selama lebar laci (`DRAWER_QUERY`, ≤1024 px, sama persis dengan kueri CSS dan
  dikunci `sidebarInert.test.ts`) DAN laci tak terbuka. Terukur: 14 tautan yang dulu
  tetap ada di urutan Tab dan pohon pembaca layar kini 0 yang terjangkau. Di ≥1025 px
  (termasuk rail diciutkan) sidebar tak pernah `inert`. Sisi terbukanya (fokus masuk, Tab
  berputar, Esc, fokus kembali ke tombol menu) diurus `useDrawerFocus`: lihat
  [[#Fokus laci (10 Nov 2026)]].
- **Ponsel (≤720 px)** — drawer/hamburger diganti bottom navigation lima slot:
  **Beranda · Servis · Kasir · Inventori · Lainnya** secara default. Empat slot utama
  mengikuti konfigurasi owner; `Lainnya` membuka control deck berisi menu tersisa,
  selector cabang, unit usaha, dan operator/keluar. Bar memakai safe-area dan
  diagnostic channel aktif (spine + glow + sinyal angka), bukan pola app generik.
- **Pasangan shell** — topbar juga menjadi faceplate sticky mengambang; pada mobile
  judul, pencarian, tema, dan notifikasi tetap berada dalam panel 60 px yang ringkas.

### Polish light mode + channel hierarchy (28 Agu 2026)

- Light rail memakai chassis `rail-bg`, well navigasi lebih gelap, serta panel header,
  unit usaha, dan operator yang terpisah jelas. Inactive icon kembali graphite; cyan
  hanya muncul saat hover/status live, sehingga amber active channel menjadi prioritas.
- Active channel tidak lagi memakai side stripe. State dibentuk oleh full border amber,
  plate `rail-active`, dan icon cell amber solid—lebih kuat sekaligus lolos detector.
- LED idle berubah menjadi port cincin tanpa daya. Readout aktif memakai foreground
  semantik yang terukur ≥4.5:1 pada light rail.
- Channel Pro tidak lagi memakai `opacity` pada seluruh baris. Label tetap terbaca,
  sementara icon cell redup dan badge LED PRO tetap menyampaikan status terkunci.
- Selector cabang, dropdown, collapse control, avatar, dan business plate memakai
  kontrol chassis yang sama; state open tidak menumpuk dua focus ring.

![[rail-expanded-dark.png]]
![[rail-expanded-light.png]]
![[rail-collapsed-dark.png]]
![[rail-collapsed-light.png]]
![[rail-tablet-dark.png]]
![[rail-tablet-light.png]]
![[mobile-bottom-nav-dark.png]]
![[mobile-more-dark.png]]

### Kanal aktif & tanda gulir (7 Nov 2026)

Critique layout menemukan bahwa di laptop pendek, halaman yang sedang dibuka bisa tak punya tanda di menu. Di demo 1366×768 rail hanya 472 px, padahal 12 kanal 48 px butuh 644 px. Akibatnya Log Aktivitas dan Pengaturan berada di bawah tepi, dan bayangan gulir 11 px nyaris tak terlihat.

- **Tiga grup tanpa judul** dari `NAV_ITEMS.group` (`src/config/navigation.ts`):

  | Grup | Kanal |
  |---|---|
  | `ops` | Dashboard, Servis, Kasir, Pelanggan, Inventori, Supplier |
  | `office` | Keuangan, Tugas, Absensi, Laporan |
  | `system` | Log Aktivitas, Pengaturan |

  Sambungan bertitik (`.seam`) hanya menambah 5 px per grup; baris judul akan memakan 20 px. Anggota satu grup wajib berurutan, dan tes `grup rail` di `navigation.test.ts` menjaganya.
- **Baris lentur 48 → 40 px**: `height: var(--nav-item-h)` dengan `min-height: 40px`. Baris menyusut sebelum rail perlu digulir. Tidak ada ambang tinggi, jadi Pembesaran aplikasi ikut terhitung. Pada `pointer: coarse` minimumnya 44 px.
- **Tepi pudar** menggantikan bayangan gulir. `mask-image` digerakkan `animation-timeline: scroll(self block)` (pola yang sama dengan chip kategori). Latar pindah ke `.navWell` di belakang `<nav>` supaya yang memudar hanya isinya. Tanpa luapan, timeline tidak aktif, jadi tidak ada pudar.
- **Kanal aktif digulir masuk** (`useLayoutEffect` pada `pathname`/`collapsed`), dengan jarak 28 px yang melewati pudar 24 px. Bila kanal muat di ujung gulir, rail ditempel ke ujung itu. Contohnya, kembali ke Servis menggulir ke 0, bukan 28 px yang memotong Dashboard.
- **Dasar rail satu baris**: blok unit usaha (113 px) dan sakelar cabang digabung menjadi satu pelat (68 px). Ruang 45 px itu kembali ke kanal.

Hasil ukur DOM (demo kecuali disebut lain):

| Viewport | Tinggi baris | Hasil |
|---|---|---|
| 1920×1080 | 48 px | 12 kanal muat |
| 1440×900 | 47,5 px | muat |
| 1536×864 | 44,5 px | muat |
| App asli 1366×768 (= demo 1366×842) | 42,7 px | muat |
| App asli 1280×720 (= demo 1280×794) | 40 px | kurang 16 px, digulir dengan pudar |
| Demo 1366×768 | 40 px | digulir 42 px, kanal aktif tetap terlihat |

![[rail-short-before-dark.png]]
![[rail-short-after-dark.png]]

### Fokus laci (10 Nov 2026)

`inert` hanya menutup laci yang TERTUTUP. Sisanya diurus `useDrawerFocus`
(`src/hooks/useDrawerFocus.ts`), yang hanya aktif saat `isDrawer && mobileOpen` (lebar ≤1024px DAN
terbuka): rail desktop tak punya perangkap fokus. Dikunci di `sidebarInert.test.ts` (kabel) dan
`useDrawerFocus.test.tsx` (perilaku, 12 tes jsdom).

- **Terbuka:** fokus masuk ke tautan halaman yang sedang dibuka (`[aria-current="page"]`, bila tak ada,
  elemen pertama). Tab dan Shift+Tab berputar di dalam laci; fokus yang bocor ke halaman ditarik masuk ke
  ujung yang searah. Esc menutup. Putarannya dihitung `trapTarget` (`src/lib/focusTrap.ts`, murni),
  dan `FOCUSABLE_SELECTOR` kini dipakai bersama `Modal`.
- **Tertutup:** fokus kembali ke tombol menu (`toggleRef` dari `AppLayout`, bukan `activeElement` saat
  dibuka: Safari tak memfokus tombol yang diklik). Fokus yang sudah di luar laci tak direbut (layar
  melebar, laci jadi rail). Bila tombolnya tak bisa difokus (di ≤720px tombolnya disembunyikan) fokus ke
  `#konten`, bukan hilang ke `<body>`.
- **Tombol menu** kini `aria-expanded` dan `aria-controls` ke laci; id dari satu `useId` di `AppLayout`
  untuk Sidebar dan Topbar sekaligus.
- **Esc di sakelar cabang** menutup menunya dulu lalu memfokus tombol cabang, dan `preventDefault`-nya
  membuat laci tak ikut menutup pada Esc yang sama; Esc kedua menutup laci. Dulu menu cabang tak
  menanggapi Esc sama sekali.
- **Sengaja bukan `role="dialog"`/`aria-modal`:** di ≥1025px elemen yang sama adalah rail navigasi tetap.

Terukur di Playwright (744 dan 1024px, demo): buka via Enter → fokus di "Dashboard" (halaman aktif),
`aria-expanded` true. Tab 40× dan Shift+Tab 40×: 0 kebocoran, 14 perhentian berbeda (tombol lipat + 12
kanal + sakelar cabang). Esc, klik overlay, dan memilih tautan → laci tertutup, inert, fokus di tombol
menu, `aria-expanded` false; memilih tautan benar-benar pindah halaman (judul Dashboard → Inventori).
Esc #1 di menu cabang menutup menunya dengan laci tetap terbuka, Esc #2 menutup laci. Di 1025 dan 1440px
Tab masuk DAN keluar dari rail, Esc tak mengubah apa pun, tombol menu tak tampak.

**Belum:** halaman di belakang laci tak `inert` (perangkapnya hanya untuk keyboard; pointer sudah
tertahan overlay). Memilih tautan mengembalikan fokus ke tombol menu, bukan ke isi halaman baru, sebab
`AppLayout` memang belum memindahkan fokus saat rute berganti (berlaku juga di rail desktop).

![[servis-fokus-laci-744-dark.png]]

## Revisi dari feedback (sudah diperbaiki & diverifikasi)

Lihat detail akar masalah di [[Decisions & Bug Fixes]].

1. **Bisa di-expand lagi** — tombol expand dulu disembunyikan saat collapsed. Diverifikasi: lebar bolak-balik **264 → 76 → 264 px**.
2. **Menu mobile bisa diklik** — overlay menelan tap (z-index lebih tinggi). Drawer kini di atas overlay. Diverifikasi: tap → `/inventory`.
3. **Nomor channel dihapus** + **header diberi ruang**: nama toko panjang membungkus (tinggi 56 px, tanpa ellipsis).

![[fix-longname-dark.png]]
![[fix-mobile-open-dark.png]]
![[fix-collapsed-dark.png]]

## Fitur terkunci = "show-locked" (pemicu upgrade Solo → Pro)

Item yang **digerbang fitur** (mis. Supplier, Tugas, Absensi) tidak lagi *disembunyikan* untuk plan yang tak memilikinya. Sebaliknya, ia **tetap tampil** sebagai channel redup dengan badge **LED brand + "PRO" mono** dan menautkan ke `/settings` (memunculkan "itch" upgrade). Sebaliknya, gerbang **peran** (`managerOnly`/`ownerOnly`) tetap *disembunyikan* karena mencerminkan batas RLS server — menampilkannya hanya akan berujung gagal.

> [!important] Otentik "Precision Electronics Bench"
> Badge terkunci memakai **LED status brand** + readout **mono**, **BUKAN ikon gembok** generik SaaS. Aturan visual ini dikunci di `AGENTS.md` (§3) & [[Design System]]: tiap elemen baru wajib pakai motif bench (LED, mono, spine, tick-gauge), bukan komponen library polos.

Logika peran/plan kini dipusatkan di `lib/business/navigation.ts` melalui
`getVisibleNavigation()`, lalu dipakai bersama oleh `Sidebar` dan `MobileBottomNav`.
`resolveMobileNavigation()` membuang rute yang tak sah/terlarang bagi peran aktif dan
mengisi slot kosong dengan fallback aman; item plan-locked tetap memakai pola PRO.
Diverifikasi dengan plan Solo (`standard`): **4 channel terkunci** muncul, dark + light.

![[locked-nav-dark.png]]
![[locked-nav-light.png]]

## Terkait
- [[Design System]] · [[Data Layer]] · [[Decisions & Bug Fixes]] · [[Signature Pages]]

#sidebar #navigation #signature-page
