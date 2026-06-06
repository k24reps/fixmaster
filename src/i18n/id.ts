/**
 * Indonesian dictionary — the SOURCE OF TRUTH for translation keys.
 * The TranslationKey type is inferred from this object, so:
 *   - autocomplete works for every t('...') call
 *   - a missing/typo'd key is a TypeScript error
 *   - en.ts must satisfy the same shape (enforced in index.ts)
 *
 * Flat dot-namespaced keys keep lookups simple and grep-able.
 */
export const id = {
  // ---------- Common ----------
  'common.save': 'Simpan',
  'common.cancel': 'Batal',
  'common.delete': 'Hapus',
  'common.edit': 'Ubah',
  'common.add': 'Tambah',
  'common.search': 'Cari',
  'common.filter': 'Filter',
  'common.all': 'Semua',
  'common.close': 'Tutup',
  'common.confirm': 'Konfirmasi',
  'common.loading': 'Memuat…',
  'common.empty': 'Belum ada data',
  'common.back': 'Kembali',
  'common.next': 'Lanjut',
  'common.print': 'Cetak',
  'common.export': 'Ekspor',
  'common.actions': 'Aksi',
  'common.status': 'Status',
  'common.date': 'Tanggal',
  'common.total': 'Total',
  'common.yes': 'Ya',
  'common.no': 'Tidak',

  // ---------- Navigation ----------
  'nav.dashboard': 'Dashboard',
  'nav.services': 'Servis',
  'nav.pos': 'Kasir',
  'nav.customers': 'Pelanggan',
  'nav.inventory': 'Inventori',
  'nav.suppliers': 'Supplier',
  'nav.finance': 'Keuangan',
  'nav.tasks': 'Tugas Internal',
  'nav.attendance': 'Absensi',
  'nav.reports': 'Laporan',
  'nav.settings': 'Pengaturan',

  // ---------- Page subtitles ----------
  'subtitle.dashboard': 'Ringkasan performa bisnis Anda hari ini',
  'subtitle.services': 'Kelola tiket servis dari masuk hingga selesai',
  'subtitle.pos': 'Transaksi penjualan cepat & akurat',
  'subtitle.customers': 'Basis data pelanggan & riwayat servis',
  'subtitle.inventory': 'Stok sparepart & produk',
  'subtitle.suppliers': 'Supplier dan pemesanan barang',
  'subtitle.finance': 'Arus kas, wallet, dan profitabilitas',
  'subtitle.tasks': 'Tugas internal & SOP tim',
  'subtitle.attendance': 'Kehadiran & jam kerja karyawan',
  'subtitle.reports': 'Analitik & laporan bisnis',
  'subtitle.settings': 'Konfigurasi aplikasi & tim',

  // ---------- Service statuses ----------
  'status.diterima': 'Diterima',
  'status.diagnosa': 'Diagnosa',
  'status.konfirmasi': 'Konfirmasi',
  'status.tunggu': 'Tunggu Part',
  'status.pengerjaan': 'Pengerjaan',
  'status.selesai': 'Selesai',
  'status.lunas': 'Lunas',
  'status.batal': 'Batal',

  // ---------- Settings (language/currency) ----------
  'settings.language': 'Bahasa',
  'settings.currency': 'Mata Uang',
  'settings.theme': 'Tema',
  'settings.theme.dark': 'Gelap',
  'settings.theme.light': 'Terang',

  // ---------- Auth / session ----------
  'auth.logout': 'Keluar',
} as const;

export type TranslationKey = keyof typeof id;
export type Dictionary = Record<TranslationKey, string>;
