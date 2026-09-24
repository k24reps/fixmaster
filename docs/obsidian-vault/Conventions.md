---
title: Conventions
aliases: [Conventions, Konvensi, Patterns, Folder Structure]
tags: [fixmaster, conventions, architecture]
created: 2026-06-04
---

# 📐 Conventions

Bagian dari [[00 - FixMaster MOC]].

Pola & gaya yang dipakai konsisten di FixMaster. Baca ini di awal sesi untuk langsung selaras (hemat penjelajahan ulang).

## Struktur folder (`src/`)

| Folder | Isi |
|---|---|
| `app/` | Komposisi aplikasi (`AuthGate` untuk sesi cloud, `WorkspaceGate` untuk bootstrap workspace, `AuthSplash`, router) |
| `components/` | Komponen reusable: `ui/` (Button, Card, Icon, dst) + `layout/` (Sidebar, Topbar, MobileBottomNav, AppLayout) |
| `config/` | `navigation.ts`, `plans.ts` (fitur per-plan) |
| `data/` | Repository, adapter (`local-adapter`, `supabase-adapter`), `types.ts`, `repository.ts` |
| `dev/` | Tooling dev, mis. `seed.ts` (data demo) |
| `features/` | Satu folder per fitur: `pos/`, `inventory/`, `services/`, `customers/`, `suppliers/`, `finance/`, `reports/`, `tasks/`, `attendance/`, `dashboard/`, `settings/`, `onboarding/` |
| `hooks/` | Hook lintas-fitur: `useCollection`, `useNavSignals` |
| `i18n/` | Mesin terjemahan type-safe (ID/EN) |
| `lib/` | `business/` (logika domain murni) + util (`time`, `id`) |
| `stores/` | Zustand: `session`, `settings`, `theme`, `displayScale` (skala font root 90/100/110%) |
| `styles/` | `tokens.css` (sumber kebenaran), `global.css` |
| `test/` | Setup test |

## Penamaan
- **Komponen**: `PascalCase.tsx` (mis. `SidebarPage.tsx`)
- **CSS Module**: `NamaKomponen.module.css` berdampingan dengan komponennya
- **Hook**: `useXxx.ts` (camelCase berawalan `use`)
- **Logika bisnis**: `lib/business/<domain>.ts` + `<domain>.test.ts` berdampingan
- **Import alias**: `@/` → `src/` (mis. `@/components/ui`)

## Pola kunci
- **Warna**: SELALU `var(--token)` dari [[Design System]] — jangan hardcode hex. Otomatis benar di dark/light. **Satu-satunya pengecualian: dokumen cetak** (`lib/print.ts`, `features/services/printReceipt.ts`, `features/reports/printReport.ts`). Dokumen itu dibuka lewat `window.open` sebagai halaman terpisah sehingga tidak mewarisi `tokens.css` sama sekali — dan tinta di kertas tidak punya tema gelap. Di luar ketiga berkas itu, hex literal tetap terlarang.
- **Data**: baca via `useCollection('<koleksi>')`; mutasi via `repository`. Lihat [[Data Layer]].
- **Logika domain**: tulis murni & testable di `lib/business/`, panggil dari UI. Jangan taruh aturan di komponen.
- **Percabangan cloud/lokal**: `isCloudMode()` TIDAK hidup di dalam modal/halaman. Bungkus jadi satu modul tulis di `src/data/` (pola `serviceParts.ts`, `financeEntry.ts`) yang menyembunyikan "RPC atau tulis lokal" dari pemanggilnya. Salinan di tiap modal harus disepakati ulang setiap kali bentuk barisnya berubah, dan jalur lokalnya hanya bisa diuji lewat UI.
- **Angka yang tampil di dua tempat wajib satu fungsi.** Badge rel navigasi vs daftar halaman, grafik layar vs grafik cetak, kartu vs laci detail — kalau dua permukaan menjawab pertanyaan yang sama, keduanya memanggil helper yang sama di `lib/business/`. Cukup satu salinan untuk membuat keduanya berbohong tanpa ada yang sadar.
- **Ikon**: hanya lewat komponen `Icon`. Lihat [[Iconography]].
- **Form/modal**: bangun isi form dengan primitif bersama `FormFields` / `FormRow` / `FormError` (`src/components/ui/Form.tsx`) — jangan inline style. `FormRow` otomatis collapse ke 1 kolom di mobile; `FormError` = fault-readout LED. Komponen `Modal` dasar sudah membawa faceplate aksen + judul ber-LED, jadi modal baru otomatis senada.
- **Ergonomi UI operasional**: teks informasi/aksi minimal 12 px; kontrol pada mobile/touch minimal 44×44 px. Deret KPI panjang memakai horizontal rail agar konten kerja utama tetap masuk viewport pertama. Uji minimal pada 390×844, 1024 px, dan 1440 px dalam dark/light; pastikan nol overflow horizontal.
- **i18n**: teks UI lewat `useT()` + key terjemahan, jangan string literal.
- **Input teks**: helper kapitalisasi tinggal di `src/lib/text.ts` (`capitalizeFirst`, `capitalizeLines`, `capitalizeWords`; teruji unit). Komponen `Input` (`components/ui/Input.tsx`) default `capitalizeFirst` (huruf pertama); prop **`autoCapWords`** memakai `capitalizeWords` (huruf pertama TIAP kata — untuk nama orang/perangkat/produk/supplier/usaha, mis. "budi santoso" → "Budi Santoso"); prop **`revealable`** menambah tombol mata show/hide password. Komponen `Textarea` (`components/ui/Textarea.tsx`) memakai `capitalizeLines` (huruf pertama tiap baris non-kosong, cocok untuk keluhan/catatan/alamat). Dilewati untuk `type` email/tel/number/password dan saat prop `noAutoCap` (mis. wizard onboarding, no servis). Gunakan `autoCapWords` HANYA untuk field nama diri (jangan untuk field kalimat seperti "Keluhan" — akan salah jadi Title Case). Gunakan `Textarea` untuk field teks bebas multi-baris, jangan `<textarea>` mentah. Indikator kekuatan password: komponen `PasswordStrength` (signup/reset), skor murni `scorePassword` di `lib/business/password.ts`.

## Perintah
| Perintah | Fungsi |
|---|---|
| `npm run dev` | Dev server (Vite, port 5173) |
| `npm run build` | Type-check + build produksi |
| `npm run test` | Vitest (616 test / 60 berkas) |
| `npm run lint` | ESLint |
| `npm run type-check` | Cek tipe tanpa emit |
| `npm run brand:render` | Regenerasi PNG PWA/Apple + OG dari SVG VOLT Probe |

## Verifikasi UI
Screenshot via Playwright di `scripts/` (mis. `shoot-batch.mjs`, `verify-sidebar.mjs`). Seed data demo lewat `window.__fixmasterSeed()`. Sinkron attachment vault: `scripts/sync-vault-attachments.ps1`.

Dua probe regresi wajib untuk perubahan UI (butuh dev server; keduanya menulis JSON ke
`scripts/shots/`):

```bash
BASE_URL=http://localhost:5173 node scripts/audit-zoom.mjs      # 11 lebar desktop x 12 halaman
BASE_URL=http://localhost:5173 node scripts/audit-mobile.mjs    # 5 lebar ponsel x 12 halaman
BASE_URL=http://localhost:5173 MOBILE=0 WIDTHS=744,834,1025,1112,1152 node scripts/audit-mobile.mjs
```

Saring dua positif palsu sebelum membaca hasil: `caption._srOnly` (caption khusus pembaca layar,
memang di-clip) dan elemen `text.` di dalam SVG (label sumbu grafik). Tanpa itu tiap laporan
terlihat merah total. Untuk **dokumen cetak**, ukur pada lebar medianya (A4 = 186 mm setelah
margin), bukan lebar viewport — dua cacat tata letak PDF hanya muncul di sana.

Untuk perubahan **warna/token**, dua gerbang tambahan:

```bash
node scripts/audit-tokens.mjs                                     # tanpa server
BASE_URL=http://localhost:5173 node scripts/audit-contrast.mjs    # DOM sungguhan
```

`audit-tokens` memeriksa kontras pasangan token **dan** pemisahan antar warna sinyal
(dE OKLab) — rona yang terlalu mirip langsung membuat status servis tak terbedakan,
karena `STATUS_TONE` memetakan 8 status ke hanya 5 rona. `audit-contrast` mengukur DOM
sungguhan, menangkap racikan `color-mix`/lapisan transparan yang tak terlihat dari daftar
token; ia pernah menemukan 18 elemen yang diloloskan gerbang token. Bandingkan dengan
palet lama lewat `BASELINE=<tokens.css lama>` untuk memisahkan regresi baru dari warisan.

> [!tip] Default verifikasi
> Setelah perubahan kode: jalankan build + test + lint. Untuk perubahan UI, foto render asli (bukan asumsi). Lihat pelajaran di [[Decisions & Bug Fixes]].

## Skill proyek (sejak 24 Sep 2026)

Tiga skill ditambatkan di `.claude/skills/` agar tak hilang saat ganti akun:
`impeccable` (semua visual/UX **dan** teks di dalam UI), `antislop-code` (komentar
kode saja), `antislop-copywriting` (prosa di luar UI). Skill inti `antislop` dan
varian UI-nya sengaja tidak dipasang karena bersaing dengan impeccable. Tabel
wewenang lengkap + alasan: AGENTS.md §7. Biner impeccable di-gitignore (diunduh
ulang peluncurnya, terverifikasi hash).

## Terkait
- [[Domain & Scope]] · [[Design System]] · [[Data Layer]] · [[Tech Stack]]

#conventions #architecture
