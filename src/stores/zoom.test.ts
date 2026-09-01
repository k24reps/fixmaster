import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useZoomStore, initZoom, applyDeviceDensityDefault, ZOOM_LEVELS } from './zoom';

/**
 * Zoom aplikasi. Yang dijaga di sini bukan "apakah zustand bekerja", tapi tiga
 * hal yang benar-benar bisa membuat aplikasi tak terpakai kalau rusak:
 * langkah berhenti di ujung, nilai localStorage yang rusak tidak dipasang,
 * 100% menghapus properti `zoom` (bukan menulis '1') supaya :root tidak jadi
 * containing block bagi position: fixed, dan default mengikuti kelas perangkat.
 */

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root().style.zoom = '';
  useZoomStore.setState({ zoom: 1 });
});

describe('store zoom', () => {
  it('memasang zoom ke :root dan menyimpannya', () => {
    useZoomStore.getState().setZoom(0.8);
    expect(root().style.zoom).toBe('0.8');
    expect(localStorage.getItem('fixmaster-zoom')).toBe('0.8');
  });


  it('100% MENGHAPUS properti zoom, bukan menulis "1"', () => {
    useZoomStore.getState().setZoom(1.25);
    expect(root().style.zoom).toBe('1.25');
    useZoomStore.getState().setZoom(1);
    expect(root().style.zoom).toBe('');
  });

  it('stepZoom berhenti di ujung, tidak memutar balik', () => {
    const { stepZoom } = useZoomStore.getState();
    for (let i = 0; i < 10; i++) stepZoom(-1);
    expect(useZoomStore.getState().zoom).toBe(ZOOM_LEVELS[0]);
    for (let i = 0; i < 10; i++) stepZoom(1);
    expect(useZoomStore.getState().zoom).toBe(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
  });

  it('stepZoom melewati tiap tingkat berurutan', () => {
    const seen = [useZoomStore.getState().zoom];
    for (let i = 0; i < ZOOM_LEVELS.length; i++) {
      useZoomStore.getState().stepZoom(-1);
      seen.push(useZoomStore.getState().zoom);
    }
    // Dari 1 turun sampai mentok: 1 -> 0.9 -> 0.8 -> berhenti.
    expect(seen.slice(0, 4)).toEqual([1, 0.9, 0.8, 0.8]);
  });

  it('nilai localStorage rusak jatuh ke 100%, bukan zoom liar', () => {
    for (const bad of ['0.05', '9000', 'banana', '']) {
      localStorage.setItem('fixmaster-zoom', bad);
      root().style.zoom = 'dirty';
      initZoom();
      expect(root().style.zoom).toBe('');
    }
  });

  describe('kerapatan awal per kelas perangkat (app shell)', () => {
    const mockPointer = (fine: boolean) =>
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('pointer: fine') ? fine : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));

    afterEach(() => vi.unstubAllGlobals());

    it('mouse (pointer: fine) mulai padat di 0.8 tanpa preferensi tersimpan', () => {
      mockPointer(true);
      applyDeviceDensityDefault();
      expect(root().style.zoom).toBe('0.8');
      // Disimpan supaya keputusannya sekali per perangkat, bukan lonjakan
      // ukuran tiap kali app dibuka.
      expect(localStorage.getItem('fixmaster-zoom')).toBe('0.8');
    });

    it('sentuh (pointer: coarse) tetap 100% supaya hit-area 44px utuh', () => {
      mockPointer(false);
      applyDeviceDensityDefault();
      expect(root().style.zoom).toBe('');
    });

    it('preferensi tersimpan selalu menang atas default perangkat', () => {
      mockPointer(true);
      localStorage.setItem('fixmaster-zoom', '1.1');
      applyDeviceDensityDefault();
      expect(localStorage.getItem('fixmaster-zoom')).toBe('1.1');
    });

    it('tidak menyentuh landing: initZoom tetap 100% walau ada mouse', () => {
      mockPointer(true);
      initZoom();
      expect(root().style.zoom).toBe('');
    });

    it('tidak menimpa zoom yang disematkan demo publik', () => {
      mockPointer(true);
      const endTransientZoom = useZoomStore.getState().beginTransientZoom(1);
      applyDeviceDensityDefault();
      expect(root().style.zoom).toBe('');
      expect(localStorage.getItem('fixmaster-zoom')).toBeNull();
      endTransientZoom();
    });
  });

  it('nilai tersimpan yang sah dipasang ulang saat init', () => {
    localStorage.setItem('fixmaster-zoom', '1.1');
    initZoom();
    expect(root().style.zoom).toBe('1.1');
  });

  it('zoom sementara tidak menimpa preferensi dan pulih saat sesi selesai', () => {
    useZoomStore.getState().setZoom(0.8);

    const endTransientZoom = useZoomStore.getState().beginTransientZoom(1);
    expect(useZoomStore.getState().zoom).toBe(1);
    expect(root().style.zoom).toBe('');
    expect(localStorage.getItem('fixmaster-zoom')).toBe('0.8');

    // Kontrol zoom di dalam demo tetap aktif, tetapi masih bersifat sementara.
    useZoomStore.getState().setZoom(1.25);
    expect(root().style.zoom).toBe('1.25');
    expect(localStorage.getItem('fixmaster-zoom')).toBe('0.8');

    endTransientZoom();
    expect(useZoomStore.getState().zoom).toBe(0.8);
    expect(root().style.zoom).toBe('0.8');
    expect(localStorage.getItem('fixmaster-zoom')).toBe('0.8');
  });
});
