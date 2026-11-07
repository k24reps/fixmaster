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
  });

  it('tampilan ditentukan perangkat: kartu di ponsel, daftar di layar lebar, tanpa pemilih', () => {
    // Ambang sama dengan tata letak ponsel halaman ini di CSS.
    expect(tsx).toContain("useMediaQuery('(max-width: 720px)') ? 'cards' : 'list'");
    expect(css).toContain('@media (max-width: 720px)');
    expect(tsx).not.toContain('ViewToggle');
    expect(tsx).not.toContain('usePersistedView');
    expect(tsx).not.toContain("'tiles'");
    expect(css).not.toContain('.tileGrid');
  });

  it('segmen opsional dan lajurnya mengikuti pengaturan kolom', () => {
    for (const id of ['customer', 'device', 'technician']) {
      expect(tsx).toContain(`cols.has('${id}') && 'minmax(`);
    }
    for (const id of ['customer', 'device', 'technician', 'cost']) {
      expect(tsx).toContain(`cols.has('${id}') && (`);
    }
  });

  it('aksi cepat sparepart: pemilih dan jalur simpan sama dengan detail tiket', () => {
    expect(tsx).toContain('canQuickAddParts(s.status) && (');
    expect(tsx).toContain('<SparepartPickerModal');
    expect(tsx).toContain('await addServicePart(partsService, line)');
    // Lajur aksi memuat empat tombol 40px.
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 11rem 9rem 10rem;');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 11rem 10rem;');
  });

  it('keluhan dan penanganan satu segmen, tiap barisnya tetap ikut pengaturan', () => {
    expect(tsx).toContain('const showNotes = showComplaint || showFix;');
    expect(tsx).toContain('showNotes && `minmax(');
    expect(tsx).toContain('data-seg="notes"');
    expect(tsx).not.toContain('data-seg="complaint"');
    expect(tsx).not.toContain('data-seg="completionNote"');
    // Label di dalam segmen hanya disembunyikan bila ia satu-satunya baris.
    expect(css).toContain('.rows .clamp:only-child b');
  });
});
