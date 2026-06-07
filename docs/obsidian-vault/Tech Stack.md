---
title: Tech Stack
aliases: [Tech Stack, Stack, Dependencies]
tags: [fixmaster, tech-stack, frontend]
created: 2026-06-04
---

# 🧱 Tech Stack

Bagian dari [[00 - FixMaster MOC]].

## Inti
- **React 19** + **react-router-dom 7** — UI & routing
- **Vite 8** — dev server & bundler
- **TypeScript** — strict typing di seluruh kode
- **Zustand 5** — state global (session akun cloud `auth`, sesi workspace `session`, settings)
- **TanStack Query 5** — fetching & cache koleksi (lihat [[Data Layer]])
- **Zod 4** — validasi skema (form/wizard)

## Persistensi & Auth
- **idb** (IndexedDB) — adapter lokal default
- **@supabase/supabase-js** — adapter cloud (opsional, di-detect via env) + **Supabase Auth** (email+password) untuk cloud mode. Lihat [[Decisions & Bug Fixes]] (auth dua-mode).

## Keamanan & Observability
- **HTTP security headers** (di `vercel.json`, edge): `Content-Security-Policy` (script `self`; style+font Google Fonts; `connect-src` ke Supabase https/wss + Sentry; `img-src` data/blob/https untuk logo & data URL), `Strict-Transport-Security` (HSTS preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, dan `Permissions-Policy` (`geolocation=(self)` untuk geofence absensi; kamera/mic dimatikan).
- **@sentry/react** — error tracking **opt-in**. `lib/report.ts` → `initErrorTracking()` (dipanggil di `main.tsx`) **lazy-import** SDK hanya bila `VITE_SENTRY_DSN` diset; tanpa DSN = console-only, SDK **tak** masuk bundle (bundle utama tetap ~86 kB). Lihat [[Data Layer]] (seam pelaporan error).

## UI / Aset
- **@phosphor-icons/react** — set ikon (lihat [[Iconography]])
- Vanilla CSS Modules + token global (lihat [[Design System]])

## Tooling & Kualitas
- **Vitest** + Testing Library — unit/komponen (**228 test** lulus)
- **Playwright** — screenshot & verifikasi UI fungsional
- **ESLint** + **Prettier** — lint & format

## Skrip penting
| Perintah | Fungsi |
|---|---|
| `npm run dev` | Dev server (Vite) |
| `npm run build` | `tsc -b && vite build` |
| `npm run test` | Vitest sekali jalan |
| `npm run lint` | ESLint |

## Terkait
- [[Data Layer]] — bagaimana data disimpan & dibaca
- [[Decisions & Bug Fixes]] — keputusan terkait stack

#tech-stack #frontend
