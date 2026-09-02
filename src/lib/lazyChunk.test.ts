import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { retryOnStaleChunk, installPreloadErrorRecovery, __test } from './lazyChunk';

/**
 * Yang dijaga di sini adalah satu keputusan: KAPAN halaman boleh dimuat ulang
 * sendiri. Salah di satu arah, pengguna terjebak layar galat setiap kali kita
 * deploy; salah di arah lain, bug biasa berubah jadi loop muat-ulang yang
 * membuat aplikasi tidak bisa dipakai sama sekali.
 */

const reload = vi.fn();
let now = 1_000_000;

beforeEach(() => {
  reload.mockClear();
  sessionStorage.clear();
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  // jsdom melempar "Not implemented" pada location.reload asli.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
});

afterEach(() => vi.restoreAllMocks());

const chunkError = (msg: string) => () => Promise.reject(new Error(msg));

describe('retryOnStaleChunk', () => {
  it('meneruskan hasil ketika modul berhasil dimuat', async () => {
    await expect(retryOnStaleChunk(() => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(reload).not.toHaveBeenCalled();
  });

  it('mengenali pesan gagal-import dari ketiga mesin browser', () => {
    const pesan = [
      'Failed to fetch dynamically imported module: https://fixmaster.app/assets/AuthPage-CrbeuAs-.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'ChunkLoadError: Loading chunk 42 failed',
    ];
    for (const m of pesan) expect(__test.isChunkLoadError(new Error(m))).toBe(true);
  });

  it('mengenali kegagalan preload CSS rute, bukan hanya modul', () => {
    // Halaman /reset-password tidak pernah tampil di produksi karena chunk CSS
    // milik AuthPage sudah berganti hash. Galatnya datang dari helper preload
    // Vite dan bunyinya beda dari galat import mesin browser.
    expect(
      __test.isChunkLoadError(
        new Error('Unable to preload CSS for /assets/AuthPage-D_dRcV_i.css'),
      ),
    ).toBe(true);
  });

  it('TIDAK menganggap galat biasa sebagai chunk basi', async () => {
    const bug = new TypeError('Cannot read properties of undefined');
    expect(__test.isChunkLoadError(bug)).toBe(false);
    await expect(retryOnStaleChunk(() => Promise.reject(bug))).rejects.toThrow(bug);
    // Bug sungguhan harus sampai ke error boundary, bukan disamarkan reload.
    expect(reload).not.toHaveBeenCalled();
  });

  it('memuat ulang sekali saat chunk basi, dan promise-nya tidak pernah selesai', async () => {
    let settled = false;
    void retryOnStaleChunk(
      chunkError('Failed to fetch dynamically imported module: /x.js'),
    ).then(
      () => (settled = true),
      () => (settled = true),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
    // Kalau promise-nya menolak, React sempat merender layar galat sekejap
    // sebelum reload berjalan — persis yang ingin dihindari.
    expect(settled).toBe(false);
  });

  it('menolak memuat ulang dua kali beruntun (anti-loop)', async () => {
    void retryOnStaleChunk(
      chunkError('Failed to fetch dynamically imported module: /x.js'),
    );
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);

    now += __test.RELOAD_COOLDOWN_MS - 1;
    await expect(
      retryOnStaleChunk(chunkError('Failed to fetch dynamically imported module: /x.js')),
    ).rejects.toThrow(/dynamically imported/);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('boleh memuat ulang lagi setelah cooldown lewat (deploy berikutnya)', async () => {
    void retryOnStaleChunk(
      chunkError('Failed to fetch dynamically imported module: /x.js'),
    );
    await Promise.resolve();

    now += __test.RELOAD_COOLDOWN_MS + 1;
    void retryOnStaleChunk(
      chunkError('Failed to fetch dynamically imported module: /y.js'),
    );
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(2);
  });
  it('menangkap vite:preloadError dan menahan Vite melempar ulang', () => {
    installPreloadErrorRecovery();
    const ev = new Event('vite:preloadError', { cancelable: true });
    (ev as Event & { payload?: unknown }).payload = new Error(
      'Unable to preload CSS for /assets/AuthPage-D_dRcV_i.css',
    );
    window.dispatchEvent(ev);
    expect(reload).toHaveBeenCalledTimes(1);
    // Tanpa preventDefault, Vite melempar ulang galatnya dan pengguna sempat
    // melihat layar galat walau halaman sedang dimuat ulang.
    expect(ev.defaultPrevented).toBe(true);
  });
});
