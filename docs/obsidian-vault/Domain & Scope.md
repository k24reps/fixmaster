---
title: Domain & Scope
aliases: [Domain, Scope, Konteks Bisnis, About FixMaster]
tags: [fixmaster, domain, scope, important]
created: 2026-06-04
---

# 🎯 Domain & Scope

Bagian dari [[00 - FixMaster MOC]].

> [!important] Aturan anti salah-konteks
> **FixMaster adalah aplikasi manajemen usaha REPARASI GADGET & ELEKTRONIK.**
> Bukan bengkel kendaraan, bukan otomotif, bukan servis motor/mobil.
> Kata "servis" di seluruh produk = **perbaikan perangkat elektronik**.

## Apa itu FixMaster

Aplikasi web untuk mengelola **toko/usaha reparasi gadget & elektronik** — misalnya konter HP, jasa servis laptop, atau toko reparasi elektronik konsumen. Membantu pemilik mengelola tiket servis, kasir, stok sparepart, pelanggan, supplier, keuangan, tugas internal, dan absensi karyawan.

## Yang DIREPARASI (contoh)
- Smartphone / HP, tablet
- Laptop / PC / komponen
- Perangkat elektronik konsumen (sesuai konteks toko)

## Yang BUKAN domain ini
- ❌ Bengkel kendaraan (motor, mobil, otomotif)
- ❌ Servis mesin berat / industri
- ❌ Reparasi properti/bangunan

> [!warning] Kenapa catatan ini ada
> Kata Indonesia "bengkel" sering diartikan sebagai bengkel **kendaraan**. Pada sesi sebelumnya konteks pernah keliru menjadi bengkel otomotif. Catatan ini memaku domain agar tidak terulang. Lihat juga [[Decisions & Bug Fixes]].

## Istilah baku (glossary)

| Istilah | Arti di FixMaster |
|---|---|
| Servis / Service | Tiket perbaikan satu perangkat elektronik |
| Unit | Satu perangkat yang masuk untuk diperbaiki |
| Sparepart | Komponen pengganti elektronik (LCD, baterai, IC, dst) |
| Teknisi | Orang yang mengerjakan reparasi |
| POS / Kasir | Penjualan langsung (sparepart/aksesori) |
| Outlet | Cabang/lokasi toko |

## Pengguna & peran
- **Owner** (pemilik) — akses penuh
- **Admin** — operasional
- **Karyawan** (staff/teknisi) — akses terbatas (lihat aturan status di logika servis)

## Terkait
- [[Signature Pages]] — bagaimana tiap fungsi bisnis ditampilkan
- [[Data Layer]] — entitas (services, inventory, dst)
- [[Conventions]] — istilah & gaya penulisan

#domain #scope #important
