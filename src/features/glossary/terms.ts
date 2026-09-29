/**
 * Isi Kamus Istilah. Konten panjang (seperti halaman legal), bukan label UI —
 * sengaja di sini, bukan di kamus i18n; ikut diterjemahkan bersama halaman
 * lain yang belum masuk kamus. `id` = anchor `/istilah#<id>` yang dipakai
 * komponen `Term` di layar.
 */
export type TermId =
  | 'arus-kas-bersih'
  | 'omzet'
  | 'laba-servis'
  | 'laba-kotor'
  | 'overhead'
  | 'beban-langsung'
  | 'break-even'
  | 'hpp'
  | 'persediaan'
  | 'aset-tetap'
  | 'piutang'
  | 'modal'
  | 'prive'
  | 'selisih-kas';

export interface GlossaryTerm {
  id: TermId;
  term: string;
  /** Satu kalimat: apa ini. */
  short: string;
  /** Penjelasan untuk pemilik konter, 1–3 kalimat. */
  body: string;
  /** Cara FixMaster menghitungnya. */
  formula?: string;
  /** Contoh angka konter. */
  example: string;
  /** Halaman tempat istilah ini tampil. */
  seenIn: { label: string; to: string }[];
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    id: 'arus-kas-bersih',
    term: 'Arus Kas Bersih',
    short: 'Uang yang benar-benar masuk dikurangi uang yang benar-benar keluar dari kegiatan usaha.',
    body:
      'Mengukur isi dompet toko, bukan untung-rugi. DP servis, pelunasan, penjualan, belanja stok, gaji, dan sewa ikut dihitung saat uangnya bergerak. Modal, prive, pembelian aset tetap, dan kasbon karyawan tidak ikut — itu bukan kegiatan usaha sehari-hari.',
    formula: 'Pemasukan usaha − Pengeluaran usaha',
    example:
      'Bulan ini masuk Rp 6,45 jt, keluar Rp 4,85 jt → arus kas bersih +Rp 1,6 jt. Kalau Rp 800 rb di antaranya belanja stok yang masih di rak, laba sebenarnya bisa lebih besar dari angka kas.',
    seenIn: [
      { label: 'Dashboard', to: '/' },
      { label: 'Keuangan', to: '/finance' },
      { label: 'Laporan', to: '/reports' },
    ],
  },
  {
    id: 'omzet',
    term: 'Omzet / Pendapatan',
    short: 'Seluruh uang yang masuk dari pekerjaan dan penjualan, sebelum dikurangi biaya apa pun.',
    body:
      'Pelunasan servis, penjualan Kasir, dan pendapatan lain-lain. Setoran modal dan pelunasan kasbon bukan omzet. Target Pendapatan di Dashboard mengukur omzet, bukan laba.',
    formula: 'Semua pemasukan − Modal − Pelunasan Kasbon',
    example: 'Servis Rp 3,55 jt + penjualan Rp 2,9 jt = omzet Rp 6,45 jt.',
    seenIn: [
      { label: 'Dashboard', to: '/' },
      { label: 'Laporan', to: '/reports' },
    ],
  },
  {
    id: 'laba-servis',
    term: 'Laba Servis',
    short: 'Biaya final tiket servis dikurangi harga modal part yang dipakai.',
    body:
      'Dihitung dari tiket yang SELESAI dalam periode, bukan saat dibayar. DP yang ditahan dan biaya pengecekan dari tiket batal ikut dihitung sebagai pendapatan. Refund DP, kembalian kelebihan bayar, dan koreksi biaya turun dicatat "Refund Servis" — sudah diperhitungkan di sini, jadi tidak masuk overhead.',
    formula: 'Biaya final − HPP part tiket',
    example: 'Ganti LCD dibayar Rp 1,95 jt, modal LCD Rp 1,35 jt → laba servis Rp 600 rb.',
    seenIn: [
      { label: 'Dashboard', to: '/' },
      { label: 'Laporan', to: '/reports' },
    ],
  },
  {
    id: 'laba-kotor',
    term: 'Laba Kotor',
    short: 'Untung dari pekerjaan dan penjualan, sebelum dikurangi overhead.',
    body:
      'Gabungan laba servis dan laba penjualan Kasir, dikurangi beban langsung (garansi, refund, ongkos kirim). Inilah yang harus cukup besar untuk menutup overhead.',
    formula: 'Laba servis + (Penjualan − HPP barang) − Beban langsung',
    example: 'Laba servis Rp 2,4 jt + laba jualan Rp 1,6 jt − garansi Rp 65 rb = laba kotor Rp 3,93 jt.',
    seenIn: [{ label: 'Laporan', to: '/reports' }],
  },
  {
    id: 'overhead',
    term: 'Overhead (Beban Operasional)',
    short: 'Biaya rutin untuk membuat toko tetap buka, ada atau tidak ada servis.',
    body:
      'Gaji, sewa, listrik & air, internet & pulsa, transportasi, perlengkapan, perawatan, pemasaran, pajak & retribusi, admin bank, konsumsi, operasional lain-lain. Diambil otomatis dari catatan Keuangan. Bulan berjalan diestimasi per kategori dari rata-rata bulan sebelumnya (gaji yang belum dibayar tetap terhitung); sewa tahunan dibagi rata 12 bulan.',
    formula: 'Jumlah beban operasional periode ini (bulan berjalan: estimasi)',
    example: 'Gaji Rp 8,5 jt + sewa Rp 5 jt + listrik Rp 1,2 jt + internet Rp 400 rb = overhead Rp 15,1 jt/bulan.',
    seenIn: [
      { label: 'Laporan', to: '/reports' },
      { label: 'Keuangan', to: '/finance' },
    ],
  },
  {
    id: 'beban-langsung',
    term: 'Beban Langsung',
    short: 'Biaya yang muncul karena transaksi tertentu, bukan untuk membuka toko.',
    body:
      'Garansi yang ditanggung toko, refund penjualan, dan ongkos kirim yang tidak bisa ditempelkan ke barang. Mengurangi laba kotor, bukan menambah overhead — hasil akhir break-even tetap sama.',
    formula: 'Garansi + Refund Penjualan + Ongkos Kirim',
    example: 'Klaim garansi LCD Rp 450 rb → laba kotor bulan itu turun Rp 450 rb.',
    seenIn: [
      { label: 'Keuangan', to: '/finance' },
      { label: 'Laporan', to: '/reports' },
    ],
  },
  {
    id: 'break-even',
    term: 'Break-Even (Titik Impas)',
    short: 'Titik ketika laba kotor persis menutup overhead.',
    body:
      'Di atas 100% berarti toko untung setelah semua biaya tetap dibayar (surplus); di bawah 100% berarti belum. Dibaca bersama arus kas: kas bisa naik padahal belum impas (gaji belum dibayar), atau turun padahal sudah untung (uang tertahan di stok).',
    formula: 'Laba kotor ÷ Overhead × 100%',
    example: 'Laba kotor Rp 21 jt, overhead Rp 10,5 jt → 200%, surplus Rp 10,5 jt.',
    seenIn: [
      { label: 'Dashboard', to: '/' },
      { label: 'Laporan', to: '/reports' },
    ],
  },
  {
    id: 'hpp',
    term: 'HPP (Harga Pokok / Harga Modal)',
    short: 'Harga modal satu unit barang atau part.',
    body:
      'Saat stok dibeli di harga berbeda, FixMaster memakai rata-rata tertimbang, supaya modal stok lama tidak ikut naik. Ongkir pembelian sebaiknya dimasukkan ke harga beli per unit.',
    formula: '(Stok lama × HPP lama + Qty beli × Harga beli) ÷ Stok baru',
    example: '2 unit @ Rp 1,2 jt + beli 3 @ Rp 1,35 jt → HPP Rp 1,29 jt.',
    seenIn: [
      { label: 'Inventori', to: '/inventory' },
      { label: 'Laporan', to: '/reports' },
    ],
  },
  {
    id: 'persediaan',
    term: 'Persediaan',
    short: 'Barang dan part di rak yang belum terjual atau terpakai.',
    body:
      'Membeli persediaan mengurangi kas, tapi belum menjadi beban — biayanya baru dihitung (sebagai HPP) saat part dipakai di tiket atau barang terjual. Karena itu belanja stok besar bisa membuat kas turun padahal toko untung.',
    example: 'Beli 10 baterai Rp 7 jt: kas −Rp 7 jt, laba tidak berubah sampai baterai terpakai.',
    seenIn: [
      { label: 'Inventori', to: '/inventory' },
      { label: 'Keuangan', to: '/finance' },
    ],
  },
  {
    id: 'aset-tetap',
    term: 'Aset Tetap',
    short: 'Alat kerja yang dipakai bertahun-tahun: laptop kerja, solder station, mikroskop, etalase.',
    body:
      'Pembeliannya mengurangi saldo, tapi bukan beban bulan itu — tidak masuk overhead dan tidak dihitung sebagai pengeluaran usaha. FixMaster tidak menghitung penyusutan.',
    example: 'Beli solder station Rp 2,5 jt: saldo −Rp 2,5 jt, overhead bulan ini tidak berubah.',
    seenIn: [{ label: 'Keuangan', to: '/finance' }],
  },
  {
    id: 'piutang',
    term: 'Piutang',
    short: 'Uang milik toko yang masih di tangan orang lain.',
    body:
      'Dua jenis di FixMaster: servis selesai yang belum dilunasi pelanggan (kartu Piutang di Laporan), dan kasbon karyawan. Kasbon bukan beban; sisa kasbon tiap karyawan dihitung otomatis dan dipotong lewat tombol Bayar Gaji di Keuangan (gaji penuh tetap jadi beban, potongannya melunasi piutang).',
    example:
      'Kasbon Budi Rp 500 rb, gaji Rp 2,5 jt: Bayar Gaji mencatat Gaji Rp 2,5 jt + potong kasbon Rp 500 rb; yang ditransfer Rp 2 jt, sisa kasbon Rp 0.',
    seenIn: [
      { label: 'Laporan', to: '/reports' },
      { label: 'Keuangan', to: '/finance' },
    ],
  },
  {
    id: 'modal',
    term: 'Modal (Setoran Pemilik)',
    short: 'Uang pribadi pemilik yang dimasukkan ke kas usaha.',
    body:
      'Saldo wallet bertambah, tapi bukan omzet maupun laba. Tanpa pemisahan ini, suntikan modal membuat laba terlihat jauh lebih besar dari kenyataan.',
    example: 'Pemilik menyetor Rp 5 jt untuk belanja stok: saldo +Rp 5 jt, omzet tetap.',
    seenIn: [{ label: 'Keuangan', to: '/finance' }],
  },
  {
    id: 'prive',
    term: 'Prive',
    short: 'Uang usaha yang diambil pemilik untuk keperluan pribadi.',
    body: 'Saldo wallet berkurang, tapi bukan beban usaha — tidak mengurangi laba maupun masuk overhead.',
    example: 'Pemilik mengambil Rp 2 jt untuk kebutuhan rumah: saldo −Rp 2 jt, laba tetap.',
    seenIn: [{ label: 'Keuangan', to: '/finance' }],
  },
  {
    id: 'selisih-kas',
    term: 'Selisih Kas',
    short: 'Beda antara saldo di aplikasi dan uang yang benar-benar ada.',
    body:
      'Dicatat lewat Hitung saldo (Keuangan, atau Pengaturan › Wallet), sehingga saldo dikalibrasi tanpa menimpa angka diam-diam. Prinsip kehati-hatian: kas KURANG diakui sebagai beban (overhead) karena kerugiannya nyata; kas LEBIH menambah saldo tapi bukan omzet, karena biasanya penjualan yang lupa dicatat. Selisih yang sering dan besar tanda ada pencatatan yang terlewat.',
    formula: 'Uang dihitung − Saldo aplikasi',
    example: 'Aplikasi Rp 2.500.000, laci Rp 2.430.000 → Selisih Kas Kurang Rp 70.000 (beban hari ini).',
    seenIn: [
      { label: 'Keuangan', to: '/finance' },
      { label: 'Laporan', to: '/reports' },
    ],
  },
];
