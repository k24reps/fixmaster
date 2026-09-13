import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useSettingsStore } from '@/stores/settings';
import { LoadState } from './LoadState';
import { loadPending, type LoadQuery } from './loadPending';

const q = (over: Partial<LoadQuery> = {}): LoadQuery => ({
  loading: false,
  error: null,
  refetch: vi.fn(),
  ...over,
});

describe('loadPending', () => {
  it('daftar kosong baru fakta setelah SEMUA query selesai tanpa error', () => {
    expect(loadPending(q(), q())).toBe(false);
    expect(loadPending(q(), q({ loading: true }))).toBe(true);
    // Gagal dimuat juga bukan "belum ada data" — ini yang dulu disajikan
    // sebagai kosong, dan membuat pemilik memasukkan ulang stok yang ada.
    expect(loadPending(q({ error: new Error('offline') }))).toBe(true);
  });
});

describe('LoadState', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'id' });
  });
  afterEach(cleanup);

  it('memuat → status, bukan pesan kosong', () => {
    render(<LoadState queries={[q({ loading: true })]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Memuat');
  });

  it('gagal → alert, dan "Coba lagi" hanya memuat ulang query yang gagal', () => {
    const ok = q();
    const broken = q({ error: new Error('offline') });
    render(<LoadState queries={[ok, broken]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Data gagal dimuat');
    fireEvent.click(screen.getByRole('button', { name: /Coba lagi/ }));
    expect(broken.refetch).toHaveBeenCalledTimes(1);
    expect(ok.refetch).not.toHaveBeenCalled();
  });
});
