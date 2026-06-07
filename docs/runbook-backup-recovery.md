# FixMaster — Backup & Recovery Runbook

> Prosedur ketahanan data untuk deployment produksi (Supabase + Vercel).
> Audiens: operator/owner teknis. Simpan tautan ini di tempat yang mudah diakses saat insiden.

## Target

| Metrik | Target | Catatan |
|---|---|---|
| **RPO** (Recovery Point Objective) | ≤ 24 jam (Free) / ≤ menit (Pro PITR) | Seberapa banyak data boleh hilang |
| **RTO** (Recovery Time Objective) | ≤ 1 jam | Seberapa cepat harus pulih |

## Lapisan cadangan (defense-in-depth)

1. **Supabase automated backups** — backup harian otomatis (retensi sesuai tier).
2. **Point-in-Time Recovery (PITR)** — tersedia di tier **Pro+**. Restore ke detik mana pun dalam jendela retensi. **Sangat disarankan diaktifkan untuk produksi berbayar.**
3. **Export CSV manual** (in-app) — Settings → Sistem → Export Data. Cadangan ringan per-koleksi (servis, penjualan, pelanggan, inventori, keuangan) untuk arsip owner. Bukan pengganti backup DB penuh, tapi berguna untuk audit & migrasi.

> [!NOTE]
> FixMaster sengaja **tidak** menjalankan job export terjadwal sendiri (keputusan ruang lingkup). Mengandalkan backup terkelola Supabase + export manual sudah memadai untuk skala saat ini.

## Health check

Edge Function publik `GET /functions/v1/health` mengembalikan status konektivitas DB:

```json
{ "status": "ok", "db": "up", "version": "1.0.0", "time": "...", "latencyMs": 42 }
```

- **200** = sehat; **503** = DB tak terjangkau.
- Pasang ke uptime monitor eksternal (mis. **UptimeRobot**, **Better Stack**) interval 1–5 menit dengan alert email/WhatsApp.

## Prosedur restore (PITR)

1. Buka **Supabase Dashboard → Database → Backups**.
2. Pilih **Point in Time** (atau backup harian bila Free tier).
3. Tentukan timestamp target (sebelum insiden). Konfirmasi.
4. Supabase menyiapkan instance pulihan. Tunggu hingga selesai.
5. Verifikasi data inti (jumlah org, servis terakhir) lewat SQL Editor.
6. Bila perlu, perbarui `VITE_SUPABASE_URL`/key di Vercel bila endpoint berubah, lalu redeploy.

## Prosedur restore (dari export CSV — parsial)

Hanya untuk pemulihan data tabular tertentu (bukan relasi penuh):
1. Owner mengunduh CSV terbaru dari arsip (hasil Export Data).
2. Impor ke staging via SQL `COPY`/Supabase Table Editor.
3. Rekonsiliasi manual (ID, relasi). **Catatan:** export dirancang untuk keterbacaan manusia, bukan round-trip relasional — utamakan PITR.

## Rollback aplikasi (frontend)

- Vercel menyimpan setiap deployment. Buka **Vercel → Deployments → (pilih versi sehat) → Promote to Production** untuk rollback instan tanpa rebuild.

## Checklist insiden

- [ ] Identifikasi cakupan (data corrupt? outage? salah delete?).
- [ ] Cek `/health` + status Supabase/Vercel.
- [ ] Bila data: tentukan timestamp aman → PITR restore.
- [ ] Bila frontend: promote deployment Vercel sebelumnya.
- [ ] Verifikasi pasca-pulih (login, dashboard, 1 tiket servis).
- [ ] Catat post-mortem singkat (penyebab, durasi, pencegahan).

## Kontak & dependensi

- **Supabase**: dashboard project `fixmaster`. Status: status.supabase.com.
- **Vercel**: status.vercel.com.
- **Pembayaran (Fersaku)**: webhook idempotent (`apply_payment`), aman terhadap retry.
