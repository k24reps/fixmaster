/**
 * Harga FixMaster sejak 14 Nov 2026: satu harga per unit masuk, dibayar dari
 * saldo yang diisi di muka. Server memegang angka yang sama di migrasi 0101
 * (pemotongan, batas minus, pengembalian, isi saldo minimum); pricing.test.ts
 * membaca migrasi itu supaya kedua sisi tidak bisa berbeda diam-diam.
 */

/** Rupiah per tiket servis yang dibuat. */
export const UNIT_PRICE = 1_000;

/** Unit gratis untuk setiap toko baru, tanpa batas waktu. */
export const FREE_UNITS = 50;

/**
 * Saldo boleh turun sampai angka ini. Di bawahnya hanya pembuatan tiket BARU
 * yang ditolak: unit yang sudah di toko tetap bisa dikerjakan, ditagih, dan
 * diambil, karena pelanggan yang menunggu tidak boleh tersandera tagihan toko.
 */
export const UNIT_FLOOR = -20;

/** Tiket yang batal atau dihapus dalam jendela ini mendapat unitnya kembali. */
export const REFUND_WINDOW_MINUTES = 10;

/** Isi saldo minimum (rupiah) dan kelipatannya. */
export const MIN_TOPUP = 50_000;
export const TOPUP_STEP = 1_000;

/** Pilihan cepat di form isi saldo. */
export const TOPUP_PRESETS = [50_000, 100_000, 200_000, 500_000] as const;

/** Saldo di bawah atau sama dengan angka ini dianggap menipis. */
export const LOW_BALANCE_UNITS = 10;

/**
 * Pagar kewajaran jumlah wallet, sama dengan plan_quota di server. Bukan
 * pembeda harga: semua toko mendapat angka yang sama.
 */
export const MAX_WALLETS = 99;
