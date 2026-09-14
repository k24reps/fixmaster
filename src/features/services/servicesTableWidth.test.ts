import { describe, expect, it } from 'vitest';
import tsx from './ServicesPage.tsx?raw';
import css from './ServicesPage.module.css?raw';

/**
 * Tampilan Daftar Servis berupa baris seperti Inventori & Kasir, bukan tabel.
 * Tabel dulu harus diukur lalu jatuh ke kartu saat tak muat, sehingga "Daftar"
 * sering tampil sebagai kartu. Tes ini tidak mengukur piksel (tak bisa di
 * jsdom); ia mengunci mekanismenya.
 */
describe('tampilan Daftar servis', () => {
  it('baris dengan container query, bukan tabel yang diukur lalu jatuh ke kartu', () => {
    expect(tsx).not.toContain('<table');
    expect(tsx).not.toContain('data-fit');
    expect(tsx).not.toContain('ResizeObserver');
    expect(css).toMatch(/@container svcRows/);
    // Kartu hanya saat dipilih, bukan cadangan Daftar.
    expect(tsx).toContain("view === 'cards' && (");
  });

  it('segmen opsional dan lajurnya mengikuti pengaturan kolom', () => {
    for (const id of ['customer', 'device', 'complaint', 'completionNote', 'technician']) {
      expect(tsx).toContain(`cols.has('${id}') && 'minmax(`);
    }
    for (const id of ['customer', 'device', 'complaint', 'completionNote', 'technician', 'cost']) {
      expect(tsx).toContain(`cols.has('${id}') && (`);
    }
  });
});
