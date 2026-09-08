/**
 * Unduhan CSV di browser — SATU-SATUNYA bagian CSV yang menyentuh DOM.
 *
 * Perakitan dan pelolosan (escaping) ada di `@/lib/business/export`, yang
 * murni dan teruji. Pembagian itu disengaja dan disebutkan di sana: "the
 * browser download itself lives in the UI layer".
 *
 * ------------------------------------------------------------
 * KENAPA BERKAS INI DULU LEBIH BESAR
 * ------------------------------------------------------------
 * Berkas ini pernah memuat `toCsv()` + `escapeField()` sendiri — implementasi
 * CSV KEDUA di repo ini, dan satu-satunya yang dipakai halaman Laporan.
 * Pembagiannya berbahaya persis terbalik:
 *
 *   lib/business/export.ts  → punya penjaga formula injection, 12 tes
 *   lib/csv.ts (yang ini)   → TANPA penjaga, TANPA satu tes pun
 *
 * Pelanggan bernama `=cmd|'/c calc'!A0` masuk ke kolom Keterangan lewat
 * pencatatan biasa, lalu ditulis mentah ke CSV Laporan dan dibuka pemilik di
 * Excel. Escaper duplikat itu dihapus; Laporan kini memakai `buildCsv` yang
 * sama dengan Pengaturan.
 */

/**
 * Memicu unduhan `csv` sebagai berkas bernama `filename`.
 *
 * TIDAK menambahkan BOM: `buildCsv()` sudah menyisipkannya, dan menambah lagi
 * di sini akan menaruh dua BOM sehingga sel header pertama terbaca kotor di
 * Excel. Berikan keluaran `buildCsv()`, bukan `rowsToCsv()`.
 */
export function downloadCsvFile(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Lepaskan object URL pada tick berikutnya, setelah klik tertangani.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
