import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useZoomStore } from '@/stores/zoom';
import { useZoomRail } from './useZoomRail';

beforeEach(() => {
  localStorage.clear();
  useZoomStore.getState().setZoom(1);
});

describe('useZoomRail', () => {
  it('menciut ke rail saat melewati 125% dan kembali saat turun', () => {
    const { result } = renderHook(() => useZoomRail());
    expect(result.current[0]).toBe(false);

    act(() => useZoomStore.getState().setZoom(1.25));
    expect(result.current[0]).toBe(true);

    act(() => useZoomStore.getState().setZoom(1.1));
    expect(result.current[0]).toBe(false);
  });

  it('pilihan pengguna di antaranya menang', () => {
    const { result } = renderHook(() => useZoomRail());
    act(() => useZoomStore.getState().setZoom(1.5));
    act(() => result.current[1]()); // buka lagi di 150%
    expect(result.current[0]).toBe(false);

    act(() => useZoomStore.getState().setZoom(1.25)); // masih di atas ambang
    expect(result.current[0]).toBe(false);

    act(() => result.current[1]()); // ciutkan sendiri
    act(() => useZoomStore.getState().setZoom(1));
    // Ciut karena pengguna, bukan karena zoom: tidak dibuka otomatis.
    expect(result.current[0]).toBe(true);
  });

  it('sidebar yang sudah diciutkan pengguna tetap ciut setelah zoom turun', () => {
    const { result } = renderHook(() => useZoomRail());
    act(() => result.current[1]());
    act(() => useZoomStore.getState().setZoom(1.5));
    act(() => useZoomStore.getState().setZoom(1));
    expect(result.current[0]).toBe(true);
  });

  it('dimuat di 150% langsung sebagai rail', () => {
    useZoomStore.getState().setZoom(1.5);
    const { result } = renderHook(() => useZoomRail());
    expect(result.current[0]).toBe(true);
    act(() => useZoomStore.getState().setZoom(1));
    expect(result.current[0]).toBe(false);
  });
});
