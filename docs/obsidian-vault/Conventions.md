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
| `app/` | Komposisi aplikasi (AuthGate, dll) |
| `components/` | Komponen reusable: `ui/` (Button, Card, Icon, dst) + `layout/` (Sidebar, Topbar dengan **global search**, AppLayout) |
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
- **Warna**: SELALU `var(--token)` dari [[Design System]] — jangan hardcode hex. Otomatis benar di dark/light.
- **Data**: baca via `useCollection('<koleksi>')`; mutasi via `repository`. Lihat [[Data Layer]].
- **Logika domain**: tulis murni & testable di `lib/business/`, panggil dari UI. Jangan taruh aturan di komponen.
- **Ikon**: hanya lewat komponen `Icon`. Lihat [[Iconography]].
- **Form/modal**: bangun isi form dengan primitif bersama `FormFields` / `FormRow` / `FormError` (`src/components/ui/Form.tsx`) — jangan inline style. `FormRow` otomatis collapse ke 1 kolom di mobile; `FormError` = fault-readout LED. Komponen `Modal` dasar sudah membawa faceplate aksen + judul ber-LED, jadi modal baru otomatis senada.
- **i18n**: teks UI lewat `useT()` + key terjemahan, jangan string literal.
- **Input teks**: komponen `Input` (`components/ui/Input.tsx`) **otomatis mengkapitalkan huruf pertama** untuk field teks bebas. Dilewati untuk `type` email/tel/number/password dan saat prop `noAutoCap`. Wizard onboarding memakai wrapper `noAutoCap` (casing tergantung data pendaftar).

## Perintah
| Perintah | Fungsi |
|---|---|
| `npm run dev` | Dev server (Vite, port 5173) |
| `npm run build` | Type-check + build produksi |
| `npm run test` | Vitest (228 test) |
| `npm run lint` | ESLint |
| `npm run type-check` | Cek tipe tanpa emit |

## Verifikasi UI
Screenshot via Playwright di `scripts/` (mis. `shoot-batch.mjs`, `verify-sidebar.mjs`). Seed data demo lewat `window.__fixmasterSeed()`. Sinkron attachment vault: `scripts/sync-vault-attachments.ps1`.

> [!tip] Default verifikasi
> Setelah perubahan kode: jalankan build + test + lint. Untuk perubahan UI, foto render asli (bukan asumsi). Lihat pelajaran di [[Decisions & Bug Fixes]].

## Terkait
- [[Domain & Scope]] · [[Design System]] · [[Data Layer]] · [[Tech Stack]]

#conventions #architecture
