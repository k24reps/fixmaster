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
const listeners = new Set<(collection: string) => void>();
const subscribe = vi.fn((listener: (collection: string) => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
});

vi.mock('@/data', () => ({
  repository: {
    list: (...args: unknown[]) => list(...(args as [])),
    subscribe: (listener: (collection: string) => void) => subscribe(listener),
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

describe('useCollection — satu perubahan, satu fetch (egress)', () => {
  afterEach(cleanup);

  it('tiga hook untuk koleksi yang sama → satu fetch per perubahan, bukan tiga', async () => {
    // Sidebar + MobileBottomNav + halaman: tiga pendengar untuk `services` di
    // Dashboard. Dulu tiap pendengar meng-invalidate sendiri; TanStack
    // membatalkan lalu mengulang fetch, dan karena queryFn tidak memakai abort
    // signal, request yang "dibatalkan" tetap mengunduh tabel penuh. Terukur
    // sebelum perbaikan: 3 pendengar → 3 fetch.
    list.mockClear();
    listeners.clear();
    list.mockImplementation(() => new Promise<never[]>((r) => setTimeout(() => r([]), 20)));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } },
    });
    renderHook(
      () => {
        useCollection('services');
        useCollection('services');
        useCollection('services');
      },
      { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> },
    );
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 40));
    list.mockClear();

    for (const listener of listeners) listener('services'); // = repository.notify
    await new Promise((r) => setTimeout(r, 60));

    expect(listeners.size).toBe(3);
    expect(list).toHaveBeenCalledTimes(1);
    list.mockImplementation(async () => []);
  });
});

describe('useCollection — cache halaman yang tidak terbuka', () => {
  afterEach(cleanup);

  it('perubahan koleksi lain menandai cache-nya basi, tanpa memicu fetch', async () => {
    // Refund dicatat dari detail servis (tak ada hook `expenses` terbuka). Dulu
    // cache Keuangan/Dashboard tetap dianggap segar sampai staleTime habis, jadi
    // barisnya tak muncul saat halaman itu dibuka.
    list.mockClear();
    listeners.clear();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } },
    });
    const expensesKey = ['collection', 'expenses', null, 'date', '2026-09-01', '2026-09-30'];
    client.setQueryData(expensesKey, []);
    renderHook(() => useCollection('services'), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    list.mockClear();

    for (const listener of listeners) listener('expenses'); // = repository.notify('expenses')
    await new Promise((r) => setTimeout(r, 20));

    expect(client.getQueryState(expensesKey)?.isInvalidated).toBe(true);
    expect(list).not.toHaveBeenCalled(); // query tak aktif: ditandai basi, bukan di-fetch
  });
});
