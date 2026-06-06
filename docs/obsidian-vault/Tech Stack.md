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
- **Zustand 5** — state global (session, settings)
- **TanStack Query 5** — fetching & cache koleksi (lihat [[Data Layer]])
- **Zod 4** — validasi skema (form/wizard)

## Persistensi
- **idb** (IndexedDB) — adapter lokal default
- **@supabase/supabase-js** — adapter cloud (opsional, di-detect via env)

## UI / Aset
- **@phosphor-icons/react** — set ikon (lihat [[Iconography]])
- Vanilla CSS Modules + token global (lihat [[Design System]])

## Tooling & Kualitas
- **Vitest** + Testing Library — unit/komponen (**154 test** lulus)
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
