---
title: Sidebar — Live Diagnostic Rail
aliases: [Sidebar, Live Diagnostic Rail, Navigation]
tags: [fixmaster, sidebar, navigation, signature-page]
created: 2026-06-04
---

# 🎛️ Sidebar — "Live Diagnostic Rail"

Bagian dari [[00 - FixMaster MOC]].

Sidebar bukan sekadar daftar menu, melainkan **panel kendali bench yang hidup**. Konsep terpilih: **arah B (Live Diagnostic Rail) + active-as-channel**, tanpa grup bersekat.

## Tiga lapis

1. **Active-as-channel** — menu aktif menyala seperti channel terpilih: plate amber + icon cell solid + full border-brand (bukan blok highlight biasa).
2. **Readout live** — tiap item membawa **LED + angka** dari data nyata, lewat hook `useNavSignals` yang memakai ulang logika di [[Data Layer]] (`isActive`, `isOverdue`, dst). Angka di rail identik dengan halamannya.
3. **Identitas produk vs usaha terpisah** — **header atas = produk FixMaster** (monogram "FM" gradient brand→cyan + power-LED + tagline `BENCH OS` mono + plan badge). **Blok "UNIT USAHA"** (di atas footer operator) = identitas toko: logo (`org.logoDataUrl`, fallback inisial) + nama toko + **selector cabang**. Footer = **modul operator** (avatar plate + online-LED + role mono).

## Selector cabang (branch switch)

Tombol bergaya channel-switch dengan LED status (cyan = Semua Outlet, amber = cabang spesifik) + dropdown **buka-ke-atas** (karena letaknya dekat dasar). Opsi: "Semua Outlet" (tampilan HQ) + tiap outlet (badge "Utama" untuk primary). Memilih cabang memanggil `setActiveOutlet` → benar-benar memfilter data seluruh app (lihat scoping per-outlet di [[Data Layer]]). Logo toko diatur di **Pengaturan → Usaha** (uploader resize ke ~256px data URL).

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
  tidak meninggalkan garis 8 px di tepi layar.
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
