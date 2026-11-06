import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings';
import { useZoomStore } from '@/stores/zoom';
import { DensitySwitch, ZoomGauge, ZoomStepper } from './DisplayControls';

const mockPointer = (fine: boolean) =>
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('pointer: fine') ? fine : false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  useSettingsStore.setState({ language: 'id' });
  useZoomStore.getState().setZoom(1);
  useZoomStore.getState().setDensity('lapang');
});

describe('ZoomGauge', () => {
  it('radiogroup lima takik, 100% terpilih dan disebut standar', () => {
    render(<ZoomGauge />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([
      '90%',
      '100% · Standar',
      '110%',
      '125%',
      '150%',
    ]);
    expect(screen.getByRole('radio', { checked: true })).toHaveAccessibleName(
      '100% · Standar',
    );
  });

  it('panah memindah pilihan dan fokus; 90% ditandai di bawah lantai teks', () => {
    render(<ZoomGauge />);
    const group = screen.getByRole('radiogroup', { name: 'Pembesaran' });
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(useZoomStore.getState().zoom).toBe(0.9);
    expect(document.activeElement).toHaveAccessibleName('90%');
    expect(screen.getByText('Teks di bawah 12px')).toBeInTheDocument();

    fireEvent.keyDown(group, { key: 'End' });
    expect(useZoomStore.getState().zoom).toBe(1.5);
  });
});

describe('DensitySwitch', () => {
  it('memilih Padat di perangkat bermouse', () => {
    mockPointer(true);
    render(<DensitySwitch />);
    fireEvent.click(screen.getByRole('radio', { name: /Padat/ }));
    expect(useZoomStore.getState().density).toBe('padat');
  });

  it('Padat terkunci di layar sentuh: target 44px adalah kontrak', () => {
    mockPointer(false);
    render(<DensitySwitch />);
    const padat = screen.getByRole('radio', { name: /Padat/ });
    expect(padat).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(padat);
    expect(useZoomStore.getState().density).toBe('lapang');
  });
});

describe('ZoomStepper', () => {
  it('ujung rentang memakai aria-disabled supaya fokus tidak terlempar', () => {
    render(<ZoomStepper />);
    const out = screen.getByRole('button', { name: 'Perkecil tampilan' });
    fireEvent.click(out);
    expect(useZoomStore.getState().zoom).toBe(0.9);
    expect(out).toHaveAttribute('aria-disabled', 'true');
    expect(out).not.toBeDisabled();
    fireEvent.click(out);
    expect(useZoomStore.getState().zoom).toBe(0.9);
  });

  it('readout jadi tombol kembali ke 100% saat tidak standar', () => {
    render(<ZoomStepper />);
    expect(screen.queryByRole('button', { name: /Kembali ke 100%/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Perbesar tampilan' }));
    fireEvent.click(screen.getByRole('button', { name: '110%. Kembali ke 100%' }));
    expect(useZoomStore.getState().zoom).toBe(1);
  });
});
