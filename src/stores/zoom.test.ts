import { describe, it, expect, beforeEach } from 'vitest';
import { useZoomStore, initZoom, ZOOM_LEVELS } from './zoom';

/**
 * Zoom aplikasi. Yang dijaga di sini bukan "apakah zustand bekerja", tapi tiga
 * hal yang benar-benar bisa membuat aplikasi tak terpakai kalau rusak:
 * langkah berhenti di ujung, nilai localStorage yang rusak tidak dipasang, dan
 * 100% menghapus properti `zoom` (bukan menulis '1') supaya :root tidak jadi
 * containing block bagi position: fixed.
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

  it('nilai tersimpan yang sah dipasang ulang saat init', () => {
    localStorage.setItem('fixmaster-zoom', '1.1');
    initZoom();
    expect(root().style.zoom).toBe('1.1');
  });
});
