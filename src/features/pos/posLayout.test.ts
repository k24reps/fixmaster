import { describe, expect, it } from 'vitest';
import pageTsx from './PosPage.tsx?raw';
import catalogTsx from './PosCatalog.tsx?raw';
import historyTsx from './PosHistory.tsx?raw';
import pageCss from './PosPage.module.css?raw';
import catalogCss from './PosCatalog.module.css?raw';
import historyCss from './PosHistory.module.css?raw';

// Halaman Kasir dipecah per bagian; aturannya berlaku untuk semuanya.
const tsx = [pageTsx, catalogTsx, historyTsx].join('\n');
const css = [pageCss, catalogCss, historyCss].join('\n');

/**
 * Mekanisme tata letak Kasir yang pernah rusak di ponsel. Piksel tak bisa
 * diukur di jsdom; ukuran sungguhan dicek lewat Playwright (lihat Decisions &
 * Bug Fixes, Kasir ponsel 9 Nov 2026). Tes ini menjaga agar mekanismenya tak
 * kembali diam-diam.
 */
describe('tata letak Kasir', () => {
  it('kolom katalog boleh menyempit di bawah lebar baris chip kategori', () => {
    // 1fr polos punya minimum = isi terpanjang: 13 kategori melebarkan kolom
    // ke 1266px di layar 390px dan total LCD keluar layar.
    expect(css).not.toMatch(/grid-template-columns:\s*1fr;/);
    expect(css).not.toContain('grid-template-columns: 1fr minmax(320px');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) minmax(320px, 400px)');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr);');
  });

  it('dock membaca entri observer terakhir dan batasnya diukur', () => {
    // ([e]) => membaca entri pertama yang bisa basi; dock lalu menutupi Proses.
    expect(tsx).not.toMatch(/new IntersectionObserver\(\(\[e\]\)/);
    expect(tsx).toContain('entries[entries.length - 1]');
    expect(tsx).toContain('ref={measureDock}');
  });

  it('satu tampilan katalog: kartu, tanpa pemilih tampilan', () => {
    expect(tsx).not.toContain('ViewToggle');
    expect(tsx).not.toContain('usePersistedView');
    expect(css).not.toContain('.productRow');
    expect(css).not.toContain('.tileGrid');
    expect(tsx).toContain('className={styles.productGrid}');
  });

  it('satu kartu untuk jual dan stok: tanpa tombol bersarang, barang habis tetap tampil', () => {
    // Kartu = <article>; tombol tambah dan tuts kelola bersaudara.
    expect(catalogTsx).toContain('<article');
    expect(catalogTsx).toContain('className={styles.addArea}');
    expect(catalogTsx).toContain('className={styles.keys}');
    // Tuts kelola hanya untuk yang boleh menulis stok; karyawan tidak.
    expect(catalogTsx).toContain("roleAllows(me.role, 'inventory.write')");
    // Dulu dipotong mati di 50 dan barang habis disembunyikan kecuali dicari.
    expect(catalogTsx).not.toContain('.slice(0, 50)');
    expect(catalogTsx).toContain('filterCatalog(');
    // Redup hanya area tambah, tuts + Stok tetap terang.
    expect(catalogCss).toContain('.addArea:disabled > *');
  });

  it('Semua Outlet: katalog boleh dijelajah, cabang dipilih saat barang pertama', () => {
    expect(pageTsx).not.toContain('styles.outletPickTitle');
    expect(pageTsx).toContain('onAdd={requestAdd}');
    expect(pageTsx).toContain('setCartOutlet(id)');
  });

  it('bar Proses yang belum siap tetap bisa diketuk dan menuntun', () => {
    // disabled menelan ketukan tanpa penjelasan; kasir di ponsel tak tahu
    // kolom mana yang kurang karena status ada di balik bar.
    expect(tsx).not.toMatch(/disabled=\{!settle\.ok/);
    expect(tsx).toContain('aria-disabled={!barReady || undefined}');
    expect(tsx).toContain('onClick={barReady ? checkout : guidePay}');
    expect(css).toMatch(/\.checkout :is\(input, button\),\s*\.paymentStatus \{\s*scroll-margin-bottom/);
  });

  it('baris riwayat dua baris, tuts turun lewat container query', () => {
    // Satu baris flex menggencet info di 320px. Ambang menjaga muat/tidak
    // muat, jadi wajib @container (AGENTS.md §3), bukan @media.
    expect(css).toMatch(/\.historyList \{[^}]*container-type: inline-size/);
    expect(css).toMatch(/\.historyRow \{[^}]*display: grid/);
    expect(css).toContain('@container (max-width: 432px)');
    expect(tsx).toContain('className={styles.historyActions}');
  });

  it('teks 320px: LCD pas lebar, nominal turun, live region sempit, tanpa literal', () => {
    // Total 9 digit dulu patah dua baris di LCD 320px.
    expect(tsx).toContain("'--lcd-chars': totalText.length");
    expect(css).toContain('var(--lcd-chars, 12)');
    expect(css).toMatch(/\.register \{[^}]*container-type: inline-size/);
    // Kolom nominal 94px memotong "3.450.000"; ambang diukur, wajib @container.
    expect(css).toMatch(/\.payments \{[^}]*container-type: inline-size/);
    expect(css).toContain('@container (max-width: 270px)');
    // aria-live di seluruh register membacakan cabang & faktur tiap ubah qty.
    expect(tsx).not.toMatch(/className=\{styles\.register\} aria-live/);
    expect(tsx).toContain('role="combobox"');
    for (const lit of ['TOTAL · IDR', '>PUSAT<', '>LIVE<', 'Klik produk', '>stok {']) {
      expect(tsx).not.toContain(lit);
    }
  });
});
