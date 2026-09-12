import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Service } from '@/data/types';

const get = vi.fn();
vi.mock('@/data', () => ({ repository: { get: (...a: unknown[]) => get(...a) } }));

const { useServiceHistory } = await import('./useServiceHistory');

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const entry = { at: '2026-09-12T02:00:00.000Z', status: 'diterima', by: '', byName: 'A', note: 'Unit diterima', internal: false } as const;

describe('useServiceHistory', () => {
  afterEach(() => {
    cleanup();
    get.mockReset();
  });

  it('baris daftar cloud tanpa history → ambil satu baris itu', async () => {
    // Daftar cloud tidak memuat history; tanpa fetch ini riwayat tampil kosong.
    get.mockResolvedValue({ id: 's1', history: [entry] });
    const lean = { id: 's1' } as Service;
    const { result } = renderHook(() => useServiceHistory(lean), { wrapper });
    await waitFor(() => expect(result.current).toEqual([entry]));
    expect(get).toHaveBeenCalledWith('services', 's1');
  });

  it('history sudah ada di baris (mode lokal) → tidak mengambil apa pun', async () => {
    const full = { id: 's1', history: [entry] } as Service;
    const { result } = renderHook(() => useServiceHistory(full), { wrapper });
    expect(result.current).toEqual([entry]);
    await new Promise((r) => setTimeout(r, 20));
    expect(get).not.toHaveBeenCalled();
  });
});
