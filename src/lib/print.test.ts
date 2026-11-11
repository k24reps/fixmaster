import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPrintDocument, printScript } from './print';
import { pageHeightMm } from './business/receiptPaper';

describe('buildPrintDocument', () => {
  it('menyisipkan judul yang di-escape, gaya, dan isi', () => {
    const html = buildPrintDocument({
      title: 'Nota <FM-1> | Toko "A"',
      style: 'body{margin:0}',
      body: '<p>isi</p>',
    });
    expect(html).toContain('<title>Nota &lt;FM-1&gt; | Toko &quot;A&quot;</title>');
    expect(html).toContain('<style>body{margin:0}</style>');
    expect(html).toContain('<p>isi</p>');
    expect(html).toContain('window.print()');
  });

  it('roll: null membuang skrip cetak (pratinjau di iframe tak boleh membuka dialog)', () => {
    const html = buildPrintDocument({ title: 't', style: '', body: '', roll: null });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('window.print');
  });

  it('tanpa roll (laporan A4) tidak menyentuh ukuran halaman', () => {
    const html = buildPrintDocument({ title: 't', style: '', body: '' });
    expect(html).toContain('window.print()');
    expect(html).not.toContain('@page');
  });
});

describe('printScript (gulungan)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function run(heightPx: number, roll = { widthMm: 58, logoMm: 16 }) {
    const print = vi.fn();
    window.print = print;
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({
      height: heightPx,
    } as DOMRect);
    new Function(printScript(roll))();
    window.onload?.(new Event('load'));
    return print;
  }

  it('menulis @page <lebar>mm <tinggi terukur>mm lalu mencetak, sekali saja', () => {
    const print = run(500);
    expect(document.head.innerHTML).toContain(`@page{size:58mm ${pageHeightMm(500)}mm;margin:0}`);
    vi.advanceTimersByTime(4000); // cadangan 3 detik tak boleh mencetak dua kali
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('lebar gulungan 80mm ikut ke @page', () => {
    run(300, { widthMm: 80, logoMm: 16 });
    expect(document.head.innerHTML).toContain('size:80mm ');
  });

  it('logo yang belum selesai dimuat menambah cadangan tinggi', () => {
    const img = document.createElement('img');
    Object.defineProperty(img, 'complete', { value: false });
    document.body.appendChild(img);
    run(500);
    expect(document.head.innerHTML).toContain(`size:58mm ${pageHeightMm(500, 16)}mm`);
  });
});
