import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useZoomStore,
  initZoom,
  isBelowTextFloor,
  zoomShortcut,
  ZOOM_LEVELS,
} from './zoom';

/**
 * Tampilan aplikasi: Pembesaran + Kerapatan. Yang dijaga di sini hal yang
 * membuat aplikasi tak terpakai atau diam-diam menembus Lantai 12px bila
 * rusak: default 100% tanpa tebakan perangkat, langkah berhenti di ujung,
 * nilai localStorage rusak tidak dipasang, 100% menghapus properti `zoom`
 * (bukan '1') supaya :root tidak jadi containing block bagi position: fixed,
 * migrasi 0.8 lama, dan sesi sementara demo/landing yang tidak menimpa apa pun.
 */

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root().style.zoom = '';
  delete root().dataset.density;
  useZoomStore.setState({ zoom: 1, density: 'lapang' });
});

describe('pembesaran', () => {
  it('memasang zoom ke :root dan menyimpannya', () => {
    useZoomStore.getState().setZoom(1.1);
    expect(root().style.zoom).toBe('1.1');
    expect(localStorage.getItem('fixmaster-zoom')).toBe('1.1');
  });

  it('100% MENGHAPUS properti zoom dan kuncinya, bukan menulis "1"', () => {
    useZoomStore.getState().setZoom(1.25);
    useZoomStore.getState().resetZoom();
    expect(root().style.zoom).toBe('');
    // Kunci dihapus supaya perubahan default kelak sampai ke perangkat ini.
    expect(localStorage.getItem('fixmaster-zoom')).toBeNull();
  });

  it('stepZoom berhenti di ujung, tidak memutar balik', () => {
    const { stepZoom } = useZoomStore.getState();
    for (let i = 0; i < 10; i++) stepZoom(-1);
    expect(useZoomStore.getState().zoom).toBe(ZOOM_LEVELS[0]);
    for (let i = 0; i < 10; i++) stepZoom(1);
    expect(useZoomStore.getState().zoom).toBe(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
  });

  it('stepZoom melewati tiap tingkat berurutan, satu-satunya di bawah 100% adalah 90%', () => {
    const seen = [useZoomStore.getState().zoom];
    for (let i = 0; i < ZOOM_LEVELS.length; i++) {
      useZoomStore.getState().stepZoom(1);
      seen.push(useZoomStore.getState().zoom);
    }
    expect(seen).toEqual([1, 1.1, 1.25, 1.5, 1.5, 1.5]);
    expect(ZOOM_LEVELS.filter(isBelowTextFloor)).toEqual([0.9]);
  });

  it('nilai localStorage rusak jatuh ke 100%, bukan zoom liar', () => {
    for (const bad of ['0.05', '9000', 'banana', '', '0.7']) {
      localStorage.setItem('fixmaster-zoom', bad);
      root().style.zoom = 'dirty';
      initZoom();
      expect(root().style.zoom).toBe('');
    }
  });

  it('nilai tersimpan yang sah dipasang ulang saat init', () => {
    localStorage.setItem('fixmaster-zoom', '1.1');
    initZoom();
    expect(root().style.zoom).toBe('1.1');
  });

  it('tanpa preferensi: 100% di perangkat bermouse juga — tidak ada tebakan perangkat', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
    try {
      initZoom();
      expect(root().style.zoom).toBe('');
      expect(root().dataset.density).toBeUndefined();
      expect(localStorage.getItem('fixmaster-zoom')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('kerapatan', () => {
  it('Padat memasang data-density dan disimpan; Lapang menghapus keduanya', () => {
    useZoomStore.getState().setDensity('padat');
    expect(root().dataset.density).toBe('padat');
    expect(localStorage.getItem('fixmaster-density')).toBe('padat');

    useZoomStore.getState().setDensity('lapang');
    expect(root().dataset.density).toBeUndefined();
    expect(localStorage.getItem('fixmaster-density')).toBeNull();
  });

  it('kerapatan tidak mengubah pembesaran (dua kenop terpisah)', () => {
    useZoomStore.getState().setZoom(1.25);
    useZoomStore.getState().setDensity('padat');
    expect(root().style.zoom).toBe('1.25');
    expect(useZoomStore.getState().zoom).toBe(1.25);
  });

  it('nilai kerapatan asing jatuh ke Lapang', () => {
    localStorage.setItem('fixmaster-density', 'super-padat');
    root().dataset.density = 'dirty';
    initZoom();
    expect(root().dataset.density).toBeUndefined();
  });
});

describe('migrasi zoom 0.8 lama', () => {
  it('0.8 tersimpan jadi 100% + Padat, dan kunci lamanya hilang', () => {
    localStorage.setItem('fixmaster-zoom', '0.8');
    initZoom();
    expect(root().style.zoom).toBe('');
    expect(root().dataset.density).toBe('padat');
    expect(localStorage.getItem('fixmaster-zoom')).toBeNull();
    expect(localStorage.getItem('fixmaster-density')).toBe('padat');
  });

  it('idempoten: init kedua tidak mengubah apa pun', () => {
    localStorage.setItem('fixmaster-zoom', '0.8');
    initZoom();
    initZoom();
    expect(root().dataset.density).toBe('padat');
    expect(localStorage.getItem('fixmaster-density')).toBe('padat');
  });

  it('kerapatan yang sudah dipilih tidak ditimpa migrasi', () => {
    localStorage.setItem('fixmaster-zoom', '0.8');
    localStorage.setItem('fixmaster-density', 'lapang');
    initZoom();
    expect(root().dataset.density).toBeUndefined();
    expect(localStorage.getItem('fixmaster-density')).toBe('lapang');
  });
});

describe('sesi tampilan sementara (demo, landing)', () => {
  it('menyematkan 100% + Lapang tanpa menimpa preferensi, lalu memulihkannya', () => {
    useZoomStore.getState().setZoom(1.25);
    useZoomStore.getState().setDensity('padat');

    const end = useZoomStore.getState().beginTransientView();
    expect(useZoomStore.getState()).toMatchObject({ zoom: 1, density: 'lapang' });
    expect(root().style.zoom).toBe('');
    expect(root().dataset.density).toBeUndefined();

    // Kontrol tetap bekerja di dalam sesi, tetapi tidak disimpan.
    useZoomStore.getState().setZoom(1.1);
    useZoomStore.getState().setDensity('padat');
    expect(root().style.zoom).toBe('1.1');
    expect(localStorage.getItem('fixmaster-zoom')).toBe('1.25');

    end();
    expect(useZoomStore.getState()).toMatchObject({ zoom: 1.25, density: 'padat' });
    expect(root().style.zoom).toBe('1.25');
    expect(root().dataset.density).toBe('padat');
    expect(localStorage.getItem('fixmaster-zoom')).toBe('1.25');
    expect(localStorage.getItem('fixmaster-density')).toBe('padat');
  });

  it('cleanup idempoten dan sesi tidak bertumpuk', () => {
    useZoomStore.getState().setZoom(1.1);
    const end = useZoomStore.getState().beginTransientView();
    const nested = useZoomStore.getState().beginTransientView();
    nested();
    expect(useZoomStore.getState().zoom).toBe(1);
    end();
    end();
    expect(useZoomStore.getState().zoom).toBe(1.1);
  });
});

describe('pintasan keyboard', () => {
  const key = (
    code: string,
    mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey', boolean>>,
  ) => zoomShortcut({ ctrlKey: false, metaKey: false, altKey: false, code, ...mods });

  it('Ctrl+Alt (atau Cmd+Option) dengan = / − / 0', () => {
    expect(key('Equal', { ctrlKey: true, altKey: true })).toBe(1);
    expect(key('NumpadAdd', { metaKey: true, altKey: true })).toBe(1);
    expect(key('Minus', { ctrlKey: true, altKey: true })).toBe(-1);
    expect(key('NumpadSubtract', { ctrlKey: true, altKey: true })).toBe(-1);
    expect(key('Digit0', { ctrlKey: true, altKey: true })).toBe(0);
  });

  it('Ctrl polos tidak direbut — itu zoom browser milik pengguna', () => {
    expect(key('Equal', { ctrlKey: true })).toBeNull();
    expect(key('Minus', { ctrlKey: true })).toBeNull();
    expect(key('Digit0', { ctrlKey: true })).toBeNull();
    expect(key('Equal', { altKey: true })).toBeNull();
    expect(key('KeyA', { ctrlKey: true, altKey: true })).toBeNull();
  });
});
