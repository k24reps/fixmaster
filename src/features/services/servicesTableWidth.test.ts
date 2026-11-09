import { describe, expect, it } from 'vitest';
import tsx from './ServicesPage.tsx?raw';
import css from './ServicesPage.module.css?raw';
import detailTsx from './ServiceDetailPage.tsx?raw';
import pickerTsx from './SparepartPickerModal.tsx?raw';

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
    for (const id of ['customer', 'device']) {
      expect(tsx).toContain(`cols.has('${id}') && 'minmax(`);
    }
    expect(tsx).toContain("showTech && 'minmax(");
    for (const id of ['customer', 'device', 'cost']) {
      expect(tsx).toContain(`cols.has('${id}') && (`);
    }
    expect(tsx).toContain('showTech && (');
  });

  it('kolom Teknisi hilang sendiri bila toko tak punya yang bisa dibedakan', () => {
    // Yang dihitung nama pada tiket, bukan jumlah karyawan aktif (semua karyawan
    // bisa dipilih jadi teknisi, jadi demo berkaryawan banyak tetap satu nama).
    expect(tsx).toContain("const showTech = cols.has('technician') && distinctTechs > 1;");
    expect(tsx).toContain("new Set(services.map((s) => s.technicianName || '')).size");
    // Header, segmen, dan lajur semuanya lewat showTech; tak ada yang membaca kolomnya langsung.
    expect(tsx.match(/cols\.has\('technician'\)/g)).toHaveLength(1);
  });

  it('aksi cepat sparepart: pemilih dan jalur simpan sama dengan detail tiket', () => {
    expect(tsx).toContain('canQuickAddParts(s.status) && (');
    expect(tsx).toContain('<SparepartPickerModal');
    expect(tsx).toContain('await addServicePart(partsService, line)');
    // Lajur aksi memuat tiga tombol 40px; membuka tiket = klik barisnya.
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 11rem 9rem 7.5rem;');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 11rem 7.5rem;');
    // Layar sentuh: tiga tombol 44px, bukan empat.
    expect(css).toContain('11rem 9rem calc(var(--control-h) * 3)');
    expect(css).not.toContain('calc(var(--control-h) * 4)');
  });

  it('seluruh baris membuka tiket; ikon "Lihat tiket" hanya tersisa di Kartu', () => {
    expect(tsx).toContain('onClick={(e) => openTicket(e, s.id)}');
    // Kontrol di dalam baris, seleksi teks, dan klik bermodifikasi tidak ikut membuka.
    expect(tsx).toContain("closest('a, button, input, select, textarea, label')");
    expect(tsx).toContain('window.getSelection()?.toString()');
    expect(tsx).toContain('{renderActions(s)}');
    expect(tsx).toContain('{renderActions(s, true)}');
    expect(tsx).toContain('{viewLink && (');
    expect(css).toMatch(/\.rows > \.row \{\s*cursor: pointer;/);
  });

  it('judul kolom tampil hanya bila lantai semua lajur muat sebaris', () => {
    // Bawaan = mengalir dan tanpa judul; tabel hanya di blok min-width.
    expect(css).toMatch(/\.rowHead \{\s*display: none;/);
    expect(tsx).toContain('data-segs={segCount}');
    expect(css).toContain('@container svcRows (min-width: 1156px)');
    expect(css).toContain('@container svcRows (min-width: 1056px)');
    expect(css).not.toContain('@container svcRows (max-width: 1180px)');
    expect(css).not.toContain('@container svcRows (min-width: 1181px)');
  });

  it('ambang tabel tak lebih kecil dari jumlah lantai lajur + lajur kanan', () => {
    const rem = (v: string) => parseFloat(v) * 16;
    const num = '(\\d+(?:\\.\\d+)?)';
    const pick = (re: RegExp, src: string) => {
      const m = re.exec(src);
      if (!m) throw new Error(`tak ketemu: ${re}`);
      return m;
    };
    // Lantai tiap segmen, dibaca dari rowTracks di TSX.
    const floors = {
      id: rem(pick(new RegExp(`const tracks = \\[\\s*'${num}rem'`), tsx)[1]),
      customer: rem(pick(new RegExp(`cols\\.has\\('customer'\\) && 'minmax\\(${num}rem`), tsx)[1]),
      device: rem(pick(new RegExp(`cols\\.has\\('device'\\) && 'minmax\\(${num}rem`), tsx)[1]),
      notes: rem(pick(new RegExp(`showNotes && \`minmax\\(${num}rem`), tsx)[1]),
      tech: rem(pick(new RegExp(`showTech && 'minmax\\(${num}rem`), tsx)[1]),
    };
    const lanes = pick(new RegExp(`minmax\\(0, 1fr\\) ${num}rem ${num}rem ${num}rem;`), css);
    // Tiga jarak 16px antar-lajur (utama, status, biaya, aksi) + padding 16 + 4.
    const right = rem(lanes[1]) + rem(lanes[2]) + rem(lanes[3]) + 3 * 16 + 20;
    const need = (segs: number[]) => segs.reduce((a, b) => a + b, 0) + (segs.length - 1) * 12 + right;
    const five = need([floors.id, floors.customer, floors.device, floors.notes, floors.tech]);
    const four = need([floors.id, floors.customer, floors.device, floors.notes]);
    const t5 = Number(pick(/min-width: (\d+)px\) \{\s*\.rowHead/, css)[1]);
    const t4 = Number(pick(/min-width: (\d+)px\) \{\s*\.rowList:not/, css)[1]);
    expect(t5).toBeGreaterThanOrEqual(five);
    expect(t4).toBeGreaterThanOrEqual(four);
    // Persis, tak dibulatkan: pembulatan membuang ruang (Padat di 1366px = wadah 1056px).
    expect(t5 - five).toBeLessThan(8);
    expect(t4 - four).toBeLessThan(8);
  });

  it('baris Penanganan kosong tak tampil sebelum tiket selesai', () => {
    expect(tsx).toContain('{showFixLine(s) && (');
    expect(tsx).toContain("s.status === 'selesai' || s.status === 'lunas'");
  });

  it('modal dadakan dari aksi cepat: owner/admin saja, jalur kas sama dengan detail', () => {
    expect(tsx).toContain('await addServiceModalLine(partsService, input)');
    expect(tsx).toMatch(/modalDadakan=\{\s*isManager\s*\?/);
    expect(detailTsx).toContain('await addServiceModalLine(service, input)');
    // Detail tak lagi menulis pengeluaran baru sendiri; satu jalur di data layer.
    expect(detailTsx).not.toContain('addServiceModal(');
    expect(pickerTsx).toContain('modalDadakanIssue(input)');
  });

  it('keluhan dan penanganan satu segmen, tiap barisnya tetap ikut pengaturan', () => {
    expect(tsx).toContain('const showNotes = showComplaint || showFix;');
    expect(tsx).toContain('showNotes && `minmax(');
    expect(tsx).toContain('data-seg="notes"');
    expect(tsx).not.toContain('data-seg="complaint"');
    expect(tsx).not.toContain('data-seg="completionNote"');
    // Label di dalam segmen hanya disembunyikan bila toko memakai satu jenis
    // (keluhan SAJA atau penanganan SAJA): tiket tanpa penanganan tetap
    // berlabel, karena baris dengan dan tanpa label di satu kolom membingungkan.
    expect(tsx).toContain("data-single={showComplaint !== showFix ? 'true' : undefined}");
    expect(css).toContain('.rows [data-single] .clamp b');
    expect(css).not.toContain(':only-child');
  });
});
