import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Regresi EGRESS. `useCollection` menarik SELURUH tabel (`list()` → `select('*')`),
 * jadi query yang menyala tanpa syarat di komponen yang selalu ter-mount
 * (dulu: GlobalSearch di Topbar) membayar tarikan penuh di tiap halaman dan
 * mengulanginya tiap ada event realtime — meski tak ada yang melihat datanya.
 * Itu sumber egress PostgREST terbesar (99,9% dari pemakaian, lihat
 * [[Decisions & Bug Fixes]]).
 *
 * Tes ini menjaga opsi `enabled` supaya tidak hilang tanpa sengaja.
 */
const list = vi.fn(async () => []);
const subscribe = vi.fn(() => () => {});

vi.mock('@/data', () => ({
  repository: {
    list: (...args: unknown[]) => list(...(args as [])),
    subscribe: (...args: unknown[]) => subscribe(...(args as [])),
  },
}));

const { useCollection } = await import('./useCollection');

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCollection — gerbang enabled (egress)', () => {
  beforeEach(() => {
    list.mockClear();
    subscribe.mockClear();
  });
  afterEach(cleanup);

  it('default: mengambil koleksi', async () => {
    renderHook(() => useCollection('services'), { wrapper });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  });

  it('placeholder kosong tetap ditandai loading sampai respons nyata tiba', async () => {
    let finish!: (rows: never[]) => void;
    list.mockImplementationOnce(
      () => new Promise<never[]>((resolve) => { finish = resolve; }),
    );
    const { result } = renderHook(() => useCollection('services'), { wrapper });

    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(true);

    finish([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('mengekspos error agar UI tidak menyajikan array kosong sebagai fakta', async () => {
    list.mockRejectedValueOnce(new Error('Koneksi data terputus'));
    const { result } = renderHook(() => useCollection('services'), { wrapper });

    await waitFor(() => expect(result.current.error?.message).toBe('Koneksi data terputus'));
    expect(result.current.loading).toBe(false);
    expect(result.current.updatedAt).toBe(0);
  });

  it('enabled: false → TIDAK mengambil apa pun', async () => {
    const { result } = renderHook(() => useCollection('services', { enabled: false }), {
      wrapper,
    });
    // Beri kesempatan query berjalan kalau gerbangnya bocor.
    await new Promise((r) => setTimeout(r, 30));
    expect(list).not.toHaveBeenCalled();
    // Tetap mengembalikan array kosong, bukan undefined — pemanggil aman.
    expect(result.current.data).toEqual([]);
    // Dan tidak stuck di loading.
    expect(result.current.loading).toBe(false);
  });

  it('enabled: false → TIDAK berlangganan perubahan realtime', async () => {
    renderHook(() => useCollection('services', { enabled: false }), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('enabled berubah false → true: baru mengambil saat diaktifkan', async () => {
    const { rerender } = renderHook(
      ({ on }: { on: boolean }) => useCollection('services', { enabled: on }),
      { wrapper, initialProps: { on: false } },
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(list).not.toHaveBeenCalled();

    rerender({ on: true });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  });
});
