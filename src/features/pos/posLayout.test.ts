import { describe, expect, it } from 'vitest';
import tsx from './PosPage.tsx?raw';
import css from './PosPage.module.css?raw';

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

  it('bar Proses yang belum siap tetap bisa diketuk dan menuntun', () => {
    // disabled menelan ketukan tanpa penjelasan; kasir di ponsel tak tahu
    // kolom mana yang kurang karena status ada di balik bar.
    expect(tsx).not.toMatch(/disabled=\{!settle\.ok/);
    expect(tsx).toContain('aria-disabled={!barReady || undefined}');
    expect(tsx).toContain('onClick={barReady ? checkout : guidePay}');
    expect(css).toMatch(/\.checkout :is\(input, button\),\s*\.paymentStatus \{\s*scroll-margin-bottom/);
  });
});
