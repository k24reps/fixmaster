import { describe, expect, it } from 'vitest';
import tsx from './ServicesPage.tsx?raw';
import css from './ServicesPage.module.css?raw';

/**
 * Ambang tabel -> kartu di ServicesPage.module.css adalah angka turunan: ia
 * dihitung dari min-content tabel, yang ditentukan JUMLAH KOLOM. Menambah satu
 * kolom tanpa menghitung ulang ambangnya membuat tabel overflow, dan kolom Aksi
 * yang sticky akan MENIMPA isi sel — bukan sekadar menggeser. Tes ini tidak
 * mengukur piksel (tak bisa di jsdom); ia mengunci asumsi yang dipakai ambang
 * itu supaya perubahan kolom tidak lolos diam-diam.
 */
const headerBlock = tsx.match(/<thead>[\s\S]*?<\/thead>/)?.[0] ?? '';
const columnCount = (headerBlock.match(/<th[\s>]/g) ?? []).length;
const threshold = Number(css.match(/@container servisList \(max-width: (\d+)px\)/)?.[1]);

describe('ambang tabel servis', () => {
  it('masih 8 kolom — dasar perhitungan ambang', () => {
    expect(columnCount).toBe(8);
  });

  it('tidak ada lagi kolom Modal/Profit terpisah', () => {
    // Digabung ke dalam sel Biaya; kolom terpisah akan menambah ~137px lagi.
    expect(headerBlock).not.toMatch(/<th[^>]*>\s*Modal\s*</);
    expect(headerBlock).not.toMatch(/<th[^>]*>\s*Profit\s*</);
  });

  it('ambang container cocok dengan min-content 919px yang didokumentasikan', () => {
    expect(threshold).toBe(918);
    expect(css).toContain('min-content 919px untuk 8 kolom');
  });
});
