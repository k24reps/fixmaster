import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPrintDocument, openPrintWindow, printScript, PRINT_CONTROLS_STYLE } from './print';
import { pageHeightMm } from './business/receiptPaper';
import { translate } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';

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

const CONTROLS = {
  label: 'Kontrol cetak',
  again: 'Cetak lagi',
  close: 'Tutup',
  closeFailed: 'Jendela tak mau menutup & "ngambek"',
};
const ROLL = { widthMm: 58, logoMm: 16 };

describe('buildPrintDocument: bilah kontrol', () => {
  const doc = (over: Partial<Parameters<typeof buildPrintDocument>[0]> = {}) =>
    buildPrintDocument({ title: 't', style: 'body{margin:0}', body: '<p>isi</p>', roll: ROLL, controls: CONTROLS, ...over });

  it('membawa dua tombol, teksnya di-escape, dan nama bilah untuk pembaca layar', () => {
    const html = doc();
    expect(html).toContain('class="fm-printbar" role="group" aria-label="Kontrol cetak"');
    expect(html).toMatch(/<button[^>]*id="fm-printagain"[^>]*>Cetak lagi<\/button>/);
    expect(html).toMatch(/<button[^>]*id="fm-printclose"[^>]*>Tutup<\/button>/);
    expect(html).toContain('data-failed="Jendela tak mau menutup &amp; &quot;ngambek&quot;"');
  });

  it('bilah ada SESUDAH isi nota, dan gayanya sesudah gaya pemanggil (tak bisa ditimpa)', () => {
    const html = doc();
    expect(html.indexOf('<p>isi</p>')).toBeLessThan(html.indexOf('class="fm-printbar"'));
    expect(html.indexOf('body{margin:0}')).toBeLessThan(html.indexOf('.fm-printbar {'));
  });

  it('memasang meta viewport supaya tombol tak mengecil di Chrome Android', () => {
    expect(doc()).toContain('<meta name="viewport" content="width=device-width,initial-scale=1"/>');
  });

  it('tanpa controls: tak ada bilah, tak ada viewport, dan HTML tetap persis dokumen lama', () => {
    const html = doc({ controls: undefined });
    expect(html).not.toContain('fm-printbar');
    expect(html).not.toContain('viewport');
    expect(html).toBe(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"/>
<title>t</title>
<style>body{margin:0}</style>
</head><body>
<p>isi</p>
<script>${printScript(ROLL)}</script>
</body></html>`);
  });

  it('roll: null (pratinjau Pengaturan) tak pernah menampilkan bilah, walau controls diberikan', () => {
    const html = doc({ roll: null });
    expect(html).not.toContain('fm-printbar');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('viewport');
  });

  it('laporan A4 (tanpa roll) juga mendapat bilah, tanpa menyentuh ukuran halaman', () => {
    const html = doc({ roll: undefined });
    expect(html).toContain('fm-printbar');
    expect(html).not.toContain('@page{size');
  });
});

describe('PRINT_CONTROLS_STYLE: bilah tak boleh mengubah tinggi gulungan', () => {
  it('tersembunyi di media cetak, dengan !important agar gaya pemanggil tak bisa menimpanya', () => {
    expect(PRINT_CONTROLS_STYLE).toMatch(/@media print\s*\{\s*\.fm-printbar\s*\{\s*display:\s*none\s*!important;/);
  });

  it('position: fixed, jadi tak ikut tinggi <body> yang diukur fit()', () => {
    expect(PRINT_CONTROLS_STYLE).toMatch(/\.fm-printbar\s*\{[^}]*position:\s*fixed/);
  });

  it('ruang agar ekor nota tak tertutup dipesan di html layar-saja, bukan di body', () => {
    expect(PRINT_CONTROLS_STYLE).toMatch(/@media screen\s*\{\s*html\s*\{\s*padding-bottom:/);
    // padding body ikut tinggi body (getBoundingClientRect), jadi gulungan ikut memanjang.
    expect(PRINT_CONTROLS_STYLE).not.toMatch(/(^|[\s,}])body\s*[{,]/);
  });

  it('tombol seukuran jempol: tinggi minimal 44px', () => {
    expect(PRINT_CONTROLS_STYLE).toMatch(/button\s*\{[^}]*min-height:\s*44px/);
  });
});

describe('printScript: tombol bilah', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = `
      <p id="fm-printmsg" data-failed="gagal menutup"></p>
      <button id="fm-printagain"></button><button id="fm-printclose"></button>`;
  });
  const closedOriginal = Object.getOwnPropertyDescriptor(window, 'closed');
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (closedOriginal) Object.defineProperty(window, 'closed', closedOriginal);
    else Reflect.deleteProperty(window, 'closed');
  });

  function boot(roll: Parameters<typeof printScript>[0], heightPx = 500) {
    const print = vi.fn();
    const close = vi.fn();
    window.print = print;
    window.close = close;
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ height: heightPx } as DOMRect);
    new Function(printScript(roll, true))();
    window.onload?.(new Event('load'));
    return { print, close };
  }
  const click = (id: string) => (document.getElementById(id) as HTMLButtonElement).click();
  // jsdom tak mendefinisikan window.closed sebagai accessor yang bisa di-spy.
  const setClosed = (v: boolean) =>
    Object.defineProperty(window, 'closed', { configurable: true, get: () => v });

  it('"Cetak lagi" memanggil print() lagi tanpa menumpuk <style> @page', () => {
    const { print } = boot(ROLL);
    expect(print).toHaveBeenCalledTimes(1);
    click('fm-printagain');
    click('fm-printagain');
    expect(print).toHaveBeenCalledTimes(3);
    expect(document.querySelectorAll('style#fm-page')).toHaveLength(1);
    expect(document.head.innerHTML).toContain(`@page{size:58mm ${pageHeightMm(500)}mm;margin:0}`);
  });

  it('"Cetak lagi" mengukur ulang: logo yang tadi belum selesai kini sudah, cadangan tinggi hilang', () => {
    const img = document.createElement('img');
    let complete = false;
    Object.defineProperty(img, 'complete', { get: () => complete });
    document.body.appendChild(img);
    boot(ROLL);
    expect(document.head.innerHTML).toContain(`size:58mm ${pageHeightMm(500, 16)}mm`);
    complete = true;
    click('fm-printagain');
    expect(document.head.innerHTML).toContain(`size:58mm ${pageHeightMm(500)}mm`);
    expect(document.head.innerHTML).not.toContain(`size:58mm ${pageHeightMm(500, 16)}mm`);
  });

  it('"Tutup" memanggil window.close(); bila jendela sudah menutup, tak ada pesan', () => {
    const { close } = boot(ROLL);
    setClosed(true);
    click('fm-printclose');
    expect(close).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(document.getElementById('fm-printmsg')?.textContent).toBe('');
  });

  it('bila browser menolak menutup, pengguna dikabari (tombol tak mati tanpa kabar)', () => {
    boot(ROLL);
    setClosed(false);
    click('fm-printclose');
    expect(document.getElementById('fm-printmsg')?.textContent).toBe('');
    vi.advanceTimersByTime(400);
    expect(document.getElementById('fm-printmsg')?.textContent).toBe('gagal menutup');
  });

  it('dokumen A4 (tanpa roll): "Cetak lagi" mencetak tanpa menulis @page', () => {
    const { print } = boot(undefined);
    click('fm-printagain');
    expect(print).toHaveBeenCalledTimes(2);
    expect(document.head.innerHTML).not.toContain('@page');
  });

  it('tanpa controls, skrip tak menyentuh tombol bilah (pratinjau dan dokumen lama aman)', () => {
    expect(printScript(ROLL)).not.toContain('fm-print');
    expect(printScript(ROLL, false)).not.toContain('fm-print');
  });
});

describe('openPrintWindow: bilah di jendela cetak', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useSettingsStore.setState({ language: 'id' });
  });

  function written(lang: 'id' | 'en') {
    useSettingsStore.setState({ language: lang });
    const write = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({ document: { write, close: vi.fn() } } as unknown as Window);
    expect(openPrintWindow({ title: 't', style: '', body: '<p>x</p>', demoMessage: 'demo', roll: ROLL })).toBe(true);
    return write.mock.calls[0][0] as string;
  }

  it('teks bilah mengikuti bahasa aplikasi', () => {
    const id = written('id');
    expect(id).toContain(`>${translate('id', 'print.again')}</button>`);
    expect(id).toContain(`>${translate('id', 'print.close')}</button>`);
    expect(id).toContain(`aria-label="${translate('id', 'print.controls')}"`);
    const en = written('en');
    expect(en).toContain(`>${translate('en', 'print.again')}</button>`);
    expect(en).toContain(`>${translate('en', 'print.close')}</button>`);
    expect(en).toContain(`data-failed="${translate('en', 'print.closeFailed')}"`);
  });

  it('jendela tak menutup sendiri: tak ada afterprint maupun close() otomatis di skrip', () => {
    const html = written('id');
    expect(html).not.toContain('afterprint');
    // close() hanya hidup di dalam handler klik tombol "Tutup".
    const script = html.slice(html.indexOf('<script>'));
    const outsideHandler = script.replace(/getElementById\('fm-printclose'\)\.onclick = function \(\) \{[\s\S]*?\n {2}\};/, '');
    expect(outsideHandler).not.toContain('window.close');
  });
});

describe('openPrintWindow: popup diblokir', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useToastStore.setState({ toasts: [] });
    useSettingsStore.setState({ language: 'id' });
  });

  it('mengembalikan false dan memberi petunjuk yang bisa ditindaklanjuti, bukan sekadar "diblokir"', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openPrintWindow({ title: 't', style: '', body: '', demoMessage: 'demo' })).toBe(false);
    const [t] = useToastStore.getState().toasts;
    expect(t.tone).toBe('error');
    expect(t.message).toBe(translate('id', 'print.popupBlocked'));
    expect(t.message).toMatch(/izinkan popup/i);
  });

  it('pesannya mengikuti bahasa aplikasi', () => {
    useSettingsStore.setState({ language: 'en' });
    vi.spyOn(window, 'open').mockReturnValue(null);
    openPrintWindow({ title: 't', style: '', body: '', demoMessage: 'demo' });
    expect(useToastStore.getState().toasts[0].message).toBe(translate('en', 'print.popupBlocked'));
  });
});
